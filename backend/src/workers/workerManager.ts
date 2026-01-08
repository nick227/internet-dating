import { prisma } from '../lib/prisma/client.js';
import { hostname } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const WORKER_TIMEOUT_MS = 30000; // 30 seconds (3 missed heartbeats)
const STOPPING_TIMEOUT_MS = 60000; // 60 seconds max for graceful shutdown

let currentWorkerId: string | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;
let workerVersion: string | null = null;

/**
 * Get current worker version (git SHA or build ID)
 */
async function getWorkerVersion(): Promise<string> {
  if (workerVersion) return workerVersion;
  
  try {
    // Try to get git SHA
    const { stdout } = await execAsync('git rev-parse --short HEAD');
    workerVersion = stdout.trim();
  } catch {
    // Fallback to environment variable or timestamp
    workerVersion = process.env.BUILD_ID || `build-${Date.now()}`;
  }
  
  return workerVersion;
}

/**
 * Register a new worker instance in the database (ATOMIC)
 * Returns the worker ID if successful, null if another worker is already running
 */
export async function registerWorker(workerType: string = 'job_worker'): Promise<string | null> {
  try {
    // Get worker version for drift detection
    const version = await getWorkerVersion();
    
    // ATOMIC TRANSACTION - All or nothing
    const worker = await prisma.$transaction(async (tx) => {
      // 1. Clean up stale workers (no heartbeat for > WORKER_TIMEOUT_MS)
      const staleThreshold = new Date(Date.now() - WORKER_TIMEOUT_MS);
      await tx.$executeRaw`
        UPDATE WorkerInstance 
        SET status = 'STOPPED', stoppedAt = NOW()
        WHERE status IN ('STARTING', 'RUNNING') 
        AND lastHeartbeatAt < ${staleThreshold}
        AND workerType = ${workerType}
      `;

      // 2. Clean up hung STOPPING workers (timeout exceeded)
      const stoppingThreshold = new Date(Date.now() - STOPPING_TIMEOUT_MS);
      await tx.$executeRaw`
        UPDATE WorkerInstance 
        SET status = 'STOPPED', stoppedAt = NOW()
        WHERE status = 'STOPPING'
        AND lastHeartbeatAt < ${stoppingThreshold}
        AND workerType = ${workerType}
      `;

      // 3. Check if any worker is currently active
      const activeWorker = await tx.workerInstance.findFirst({
        where: {
          workerType,
          status: { in: ['STARTING', 'RUNNING', 'STOPPING'] }
        },
        select: { id: true, status: true, hostname: true }
      });

      if (activeWorker) {
        console.log(`[worker] Another worker is already ${activeWorker.status} (ID: ${activeWorker.id}, host: ${activeWorker.hostname})`);
        return null;
      }

      // 4. Register this worker (DB-level unique index will prevent race conditions)
      const newWorker = await tx.workerInstance.create({
        data: {
          workerType,
          status: 'STARTING',
          hostname: hostname(),
          pid: process.pid,
          startedAt: new Date(),
          lastHeartbeatAt: new Date(),
          metadata: {
            version,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
          }
        }
      });

      console.log(`[worker] Registered worker instance: ${newWorker.id} (version: ${version})`);
      return newWorker;
    }, {
      maxWait: 5000, // Wait up to 5s for transaction lock
      timeout: 10000 // Transaction timeout 10s
    });

    if (!worker) {
      return null;
    }

    currentWorkerId = worker.id;

    // 5. Update status to RUNNING (outside transaction for speed)
    await prisma.workerInstance.update({
      where: { id: worker.id },
      data: { status: 'RUNNING' }
    });

    // 6. Start heartbeat
    startHeartbeat();

    return worker.id;
  } catch (err) {
    // Check if error is due to unique constraint violation
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      console.log('[worker] Cannot register: Unique constraint violation (another worker already active)');
      return null;
    }
    
    console.error('[worker] Failed to register worker:', err);
    return null;
  }
}

/**
 * Unregister the current worker instance (ATOMIC)
 */
export async function unregisterWorker(): Promise<void> {
  if (!currentWorkerId) return;

  isShuttingDown = true;
  stopHeartbeat();

  try {
    // First mark as STOPPING (releases DB lock for new workers)
    await prisma.workerInstance.update({
      where: { id: currentWorkerId },
      data: {
        status: 'STOPPING',
        lastHeartbeatAt: new Date()
      }
    });

    // Brief delay to allow any in-flight operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Then mark as STOPPED
    await prisma.workerInstance.update({
      where: { id: currentWorkerId },
      data: {
        status: 'STOPPED',
        stoppedAt: new Date()
      }
    });

    console.log(`[worker] Unregistered worker instance: ${currentWorkerId}`);
  } catch (err) {
    console.error('[worker] Failed to unregister worker:', err);
    // Force mark as stopped even if update fails
    try {
      await prisma.$executeRaw`
        UPDATE WorkerInstance 
        SET status = 'STOPPED', stoppedAt = NOW()
        WHERE id = ${currentWorkerId}
      `;
    } catch {}
  } finally {
    currentWorkerId = null;
  }
}

/**
 * Update heartbeat for current worker
 */
async function updateHeartbeat(): Promise<void> {
  if (!currentWorkerId || isShuttingDown) return;

  try {
    await prisma.workerInstance.update({
      where: { id: currentWorkerId },
      data: { lastHeartbeatAt: new Date() }
    });
  } catch (err) {
    console.error('[worker] Failed to update heartbeat:', err);
  }
}

/**
 * Increment jobs processed counter
 */
export async function incrementJobsProcessed(): Promise<void> {
  if (!currentWorkerId) return;

  try {
    await prisma.workerInstance.update({
      where: { id: currentWorkerId },
      data: { jobsProcessed: { increment: 1 } }
    });
  } catch (err) {
    console.error('[worker] Failed to increment jobs processed:', err);
  }
}

/**
 * Start periodic heartbeat
 */
function startHeartbeat(): void {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    updateHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop periodic heartbeat
 */
function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Get current worker ID
 */
export function getCurrentWorkerId(): string | null {
  return currentWorkerId;
}

/**
 * Check if this process has an active worker
 */
export function isWorkerActive(): boolean {
  return currentWorkerId !== null && !isShuttingDown;
}

/**
 * Get all worker instances (for status/monitoring)
 */
export async function getWorkerInstances(workerType?: string) {
  return await prisma.workerInstance.findMany({
    where: workerType ? { workerType } : undefined,
    orderBy: { startedAt: 'desc' },
    take: 50
  });
}

/**
 * Get active workers count
 */
export async function getActiveWorkersCount(workerType: string = 'job_worker'): Promise<number> {
  // Clean up stale workers first
  const staleThreshold = new Date(Date.now() - WORKER_TIMEOUT_MS);
  await prisma.$executeRaw`
    UPDATE WorkerInstance 
    SET status = 'STOPPED', stoppedAt = NOW()
    WHERE status IN ('STARTING', 'RUNNING') 
    AND lastHeartbeatAt < ${staleThreshold}
    AND workerType = ${workerType}
  `;

  // Clean up hung STOPPING workers
  const stoppingThreshold = new Date(Date.now() - STOPPING_TIMEOUT_MS);
  await prisma.$executeRaw`
    UPDATE WorkerInstance 
    SET status = 'STOPPED', stoppedAt = NOW()
    WHERE status = 'STOPPING'
    AND lastHeartbeatAt < ${stoppingThreshold}
    AND workerType = ${workerType}
  `;

  return await prisma.workerInstance.count({
    where: {
      workerType,
      status: { in: ['STARTING', 'RUNNING'] }
    }
  });
}
