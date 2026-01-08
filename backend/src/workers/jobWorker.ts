import { prisma } from '../lib/prisma/client.js';
import { runQueuedJob } from '../lib/jobs/runJob.js';

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const STALLED_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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
  console.log('[worker] Job worker started');
  
  // Run stalled job detection on startup
  await detectStalledJobs();
  
  // Schedule periodic stalled job detection
  const stalledCheckTimer = setInterval(detectStalledJobs, 60000); // Every 1 minute

  while (true) {
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
}

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  workerLoop().catch(err => {
    console.error('[worker] Fatal error:', err);
    process.exit(1);
  });
}
