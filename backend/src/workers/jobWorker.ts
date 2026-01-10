import { prisma } from '../lib/prisma/client.js';
import { runQueuedJob } from '../lib/jobs/runJob.js';
import { 
  registerWorker, 
  unregisterWorker, 
  incrementJobsProcessed,
  isWorkerActive 
} from './workerManager.js';

// Configurable via environment variable
const POLL_INTERVAL_MS = parseInt(
  process.env.JOB_WORKER_POLL_INTERVAL_MS || '5000',
  10
);
const STALLED_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

let isRunning = false;
let shouldStop = false;

async function processNextJob(): Promise<boolean> {
  // Find oldest queued job and lock it atomically
  const job = await prisma.$transaction(async (tx) => {
    const queued = await tx.jobRun.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { queuedAt: 'asc' },
      select: { id: true, jobName: true }
    });

    if (!queued) return null;

    // Conditional update - only succeeds if still QUEUED
    const now = new Date();
    const updated = await tx.jobRun.updateMany({
      where: { 
        id: queued.id, 
        status: 'QUEUED'
      },
      data: { 
        status: 'RUNNING',
        startedAt: now,
        lastHeartbeatAt: now
      }
    });

    // If count is 0, another worker grabbed this job first
    if (updated.count === 0) {
      return null;
    }

    return queued;
  });

  if (!job) {
    return false;
  }

  try {
    console.log(`[worker] Processing job ${job.id} (${job.jobName})`);
    await runQueuedJob(job.id);
    await incrementJobsProcessed();
    console.log(`[worker] Completed job ${job.id}`);
    return true;
  } catch (err) {
    console.error(`[worker] Failed to process job ${job.id}:`, err);
    return true;
  }
}

// Detect and mark stalled jobs
async function detectStalledJobs() {
  const threshold = new Date(Date.now() - STALLED_JOB_THRESHOLD_MS);
  
  const stalledJobs = await prisma.jobRun.findMany({
    where: {
      status: 'RUNNING',
      OR: [
        { lastHeartbeatAt: { lt: threshold } },
        { lastHeartbeatAt: null }
      ]
    },
    select: { id: true, jobName: true, startedAt: true }
  });

  if (stalledJobs.length > 0) {
    console.warn(`[worker] Found ${stalledJobs.length} stalled jobs:`, 
      stalledJobs.map(j => `${j.id} (${j.jobName})`));

    for (const job of stalledJobs) {
      await prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: 'Job stalled: worker heartbeat timeout (possible crash)',
          durationMs: job.startedAt 
            ? Date.now() - job.startedAt.getTime()
            : null
        }
      });
    }
  }
}

export async function workerLoop() {
  // Register as singleton worker
  const workerId = await registerWorker('job_worker');
  if (!workerId) {
    console.error('[worker] Cannot start: Another worker is already running');
    throw new Error('Another worker instance is already running');
  }

  isRunning = true;
  shouldStop = false;
  
  console.log(`[worker] Job worker started (ID: ${workerId})`);
  
  // Run stalled job detection on startup
  await detectStalledJobs();
  
  // Schedule periodic stalled job detection
  const stalledCheckTimer = setInterval(detectStalledJobs, 60000); // Every 1 minute

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('[worker] Shutdown signal received, stopping worker...');
    shouldStop = true;
    clearInterval(stalledCheckTimer);
    await unregisterWorker();
    isRunning = false;
    console.log('[worker] Worker stopped gracefully');
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    while (!shouldStop && isWorkerActive()) {
      try {
        const processed = await processNextJob();
        
        if (!processed) {
          // No jobs, wait before polling again
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }
        // If job was processed, immediately check for next one (no delay)
      } catch (err) {
        console.error('[worker] Worker loop error:', err);
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  } finally {
    clearInterval(stalledCheckTimer);
    await unregisterWorker();
    isRunning = false;
  }
}

export async function stopWorker() {
  if (!isRunning) {
    throw new Error('Worker is not running');
  }
  shouldStop = true;
  console.log('[worker] Stop requested');
}

export function getWorkerStatus() {
  return {
    isRunning,
    shouldStop,
    isActive: isWorkerActive()
  };
}

/**
 * Start the job worker (for embedding in web server)
 */
export function startJobWorker() {
  console.log(`[worker] Starting job worker (poll interval: ${POLL_INTERVAL_MS}ms)`);
  
  workerLoop().catch(err => {
    console.error('[worker] Fatal error:', err);
    
    // If embedded in web server, don't exit process
    if (process.env.EMBEDDED_JOB_WORKER === 'true') {
      console.error('[worker] Job worker crashed but web server continues');
    } else {
      process.exit(1);
    }
  });
}

// Start worker if run directly (not embedded)
if (import.meta.url === `file://${process.argv[1]}`) {
  startJobWorker();
}
