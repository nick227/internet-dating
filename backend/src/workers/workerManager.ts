import { prisma } from '../lib/prisma/client.js';
import { hostname } from 'os';

const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const WORKER_TIMEOUT_MS = 30000; // 30 seconds (3 missed heartbeats)

let currentWorkerId: string | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

/**
 * Register a new worker instance in the database
 * Returns the worker ID if successful, null if another worker is already running
 */
export async function registerWorker(workerType: string = 'job_worker'): Promise<string | null> {
  try {
    // Clean up stale workers (no heartbeat for > WORKER_TIMEOUT_MS)
    const staleTreshold = new Date(Date.now() - WORKER_TIMEOUT_MS);
    await prisma.$executeRaw`
      UPDATE worker_instances 
      SET status = 'STOPPED', stoppedAt = NOW()
      WHERE status IN ('STARTING', 'RUNNING') 
      AND lastHeartbeatAt < ${staleTreshold}
      AND workerType = ${workerType}
    `;

    // Check if any worker is currently running
    const activeWorker = await prisma.workerInstance.findFirst({
      where: {
        workerType,
        status: { in: ['STARTING', 'RUNNING'] }
      }
    });

    if (activeWorker) {
      console.log(`[worker] Another worker is already running (ID: ${activeWorker.id})`);
      return null;
    }

    // Register this worker
    const worker = await prisma.workerInstance.create({
      data: {
        workerType,
        status: 'STARTING',
        hostname: hostname(),
        pid: process.pid,
        startedAt: new Date(),
        lastHeartbeatAt: new Date()
      }
    });

    currentWorkerId = worker.id;
    console.log(`[worker] Registered worker instance: ${worker.id}`);

    // Update status to RUNNING
    await prisma.workerInstance.update({
      where: { id: worker.id },
      data: { status: 'RUNNING' }
    });

    // Start heartbeat
    startHeartbeat();

    return worker.id;
  } catch (err) {
    console.error('[worker] Failed to register worker:', err);
    return null;
  }
}

/**
 * Unregister the current worker instance
 */
export async function unregisterWorker(): Promise<void> {
  if (!currentWorkerId) return;

  isShuttingDown = true;
  stopHeartbeat();

  try {
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
  const staleTreshold = new Date(Date.now() - WORKER_TIMEOUT_MS);
  await prisma.$executeRaw`
    UPDATE worker_instances 
    SET status = 'STOPPED', stoppedAt = NOW()
    WHERE status IN ('STARTING', 'RUNNING') 
    AND lastHeartbeatAt < ${staleTreshold}
    AND workerType = ${workerType}
  `;

  return await prisma.workerInstance.count({
    where: {
      workerType,
      status: { in: ['STARTING', 'RUNNING'] }
    }
  });
}
