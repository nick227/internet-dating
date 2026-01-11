import { prisma } from '../src/lib/prisma/client.js';
import { Cron } from 'croner';
import { schedules, getScheduleDefinition } from '../src/lib/jobs/schedules/definitions.js';
import type { ScheduleDefinition } from '../src/lib/jobs/schedules/definitions.js';
import { getAllJobs, getJobsByGroup } from '../src/lib/jobs/shared/registry.js';
import { hostname } from 'os';

let workerId: string;
const LOCK_TIMEOUT_MS = parseInt(process.env.LOCK_TIMEOUT_MS || '3600000', 10); // 1 hour default (was 5 min)
const POLL_INTERVAL_MS = parseInt(process.env.SCHEDULE_POLL_INTERVAL_MS || '60000', 10);
let intervalHandle: NodeJS.Timeout | null = null;
let isProcessingTick = false;
let isShuttingDown = false;

// Environment check
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const DAEMON_ENABLED = process.env.SCHEDULE_DAEMON_ENABLED !== 'false'; // Enabled by default

/**
 * Register this daemon as a WorkerInstance for monitoring
 */
async function registerWorker() {
  const worker = await prisma.workerInstance.create({
    data: {
      workerType: 'schedule_daemon',
      status: 'RUNNING',
      hostname: hostname(),
      pid: process.pid
    }
  });
  workerId = worker.id;
  console.log(`✅ Schedule daemon registered: ${workerId}`);
}

/**
 * Sync code-defined schedules to database
 * Creates missing schedules (disabled by default)
 * Does NOT modify existing schedules
 * 
 * INVARIANT: If enabled=true AND nextRunAt IS NULL, recompute nextRunAt
 * This recovers from bad cron parse or timezone corruption
 */
async function syncScheduleDefinitions() {
  for (const schedule of schedules) {
    const existing = await prisma.jobSchedule.findUnique({
      where: { id: schedule.id }
    }

    // New schedule: create disabled with nextRunAt calculated
    if (!existing) {
      await prisma.jobSchedule.create({
        data: {
          id: schedule.id,
          enabled: false, // Safety: require explicit admin enable
          nextRunAt: new Cron(schedule.cron, { timezone: schedule.timezone, paused: true }).nextRun() || new Date()
        }
      });
      continue;
    }

    // INVARIANT: enabled=true BUT nextRunAt IS NULL → corruption, recompute
    if (existing.enabled && !existing.nextRunAt) {
      const nextRun = new Cron(schedule.cron, { timezone: schedule.timezone, paused: true }).nextRun() || new Date();
      await prisma.jobSchedule.update({
        where: { id: schedule.id },
        data: { nextRunAt: nextRun }
      });
      console.warn(`⚠️  Recovered corrupted schedule "${schedule.id}": nextRunAt was NULL, recomputed to ${nextRun.toISOString()}`);
    }
  }
  console.log(`📋 Synced ${schedules.length} schedule definitions from code`);
}

/**
 * Clean up stalled locks (daemon crash recovery)
 * Releases locks older than LOCK_TIMEOUT_MS
 */
async function cleanupStalledLocks() {
  const stalledThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);
  
  const result = await prisma.jobSchedule.updateMany({
    where: {
      lockedAt: { lt: stalledThreshold }
    },
    data: {
      lockedAt: null,
      lockedBy: null
    }
  });
  
  if (result.count > 0) {
    console.warn(`⚠️  Cleaned ${result.count} stalled schedule locks`);
  }
}

/**
 * Atomic lock acquisition
 * Returns true if lock was acquired, false if already locked
 */
async function acquireLock(scheduleId: string): Promise<boolean> {
  const result = await prisma.jobSchedule.updateMany({
    where: {
      id: scheduleId,
      lockedAt: null // Only acquire if NOT already locked
    },
    data: {
      lockedAt: new Date(),
      lockedBy: workerId
    }
  });
  
  return result.count > 0;
}

/**
 * Release lock after processing
 */
async function releaseLock(scheduleId: string) {
  await prisma.jobSchedule.update({
    where: { id: scheduleId },
    data: {
      lockedAt: null,
      lockedBy: null
    }
  });
}

/**
 * Execute jobs inline for a schedule (no queue, no polling)
 */
async function executeScheduleInline(schedule: ScheduleDefinition, scheduleId: string) {
  const startTime = Date.now();
  let jobsExecuted = 0;
  let jobsFailed = 0;
  
  // Get jobs to execute based on execution mode
  const jobs = await (async () => {
    if (schedule.executionMode === 'ALL_JOBS') {
      const allJobs = await getAllJobs();
      const jobsMap = new Map(Object.entries(allJobs));
      const { resolveJobDependencies } = await import('../src/lib/jobs/shared/dependencyResolver.js');
      return resolveJobDependencies(jobsMap);
    } else if (schedule.executionMode === 'GROUP' && schedule.jobGroup) {
      const allJobs = await getAllJobs();
      const jobsMap = new Map(Object.entries(allJobs));
      const { resolveJobsByGroup } = await import('../src/lib/jobs/shared/dependencyResolver.js');
      return resolveJobsByGroup(jobsMap, schedule.jobGroup);
    }
    return [];
  })();
  
  console.log(`[daemon] Executing ${jobs.length} jobs inline for "${schedule.name}"`);
  
  // Execute each job immediately
  for (const job of jobs) {
    try {
      console.log(`[daemon] → Executing: ${job.name}`);
      
      // Create JobRun record (for tracking/history)
      const jobRun = await prisma.jobRun.create({
        data: {
          jobName: job.name,
          trigger: 'CRON',
          scheduleId: scheduleId,
          status: 'RUNNING',
          startedAt: new Date()
        }
      });
      
      // Execute job immediately (inline)
      const { runQueuedJob } = await import('../src/lib/jobs/runJob.js');
      await runQueuedJob(jobRun.id);
      
      jobsExecuted++;
      console.log(`[daemon] ✓ ${job.name} completed`);
      
    } catch (error) {
      jobsFailed++;
      console.error(`[daemon] ✗ ${job.name} failed:`, error);
      // Continue to next job even if this one failed
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`[daemon] ✅ Schedule "${schedule.name}" complete: ${jobsExecuted} succeeded, ${jobsFailed} failed (${duration}ms)`);
  
  return { jobsExecuted, jobsFailed };
}

/**
 * Process all due schedules
 * Main scheduling logic
 */
async function processSchedules() {
  const now = new Date();
  
  // Find schedules that are enabled, not locked, and past their nextRunAt time
  const dueSchedules = await prisma.jobSchedule.findMany({
    where: {
      enabled: true,
      lockedAt: null,
      OR: [
        { nextRunAt: { lte: now } },
        { nextRunAt: null } // First run
      ]
    }
  });
  
  if (dueSchedules.length === 0) {
    return; // Nothing to do
  }
  
  console.log(`⏰ Found ${dueSchedules.length} due schedule(s)`);
  
  for (const dbSchedule of dueSchedules) {
    // Find corresponding definition in code
    const definition = getScheduleDefinition(dbSchedule.id);
    if (!definition) {
      console.warn(`⚠️  Schedule ${dbSchedule.id} not found in code definitions`);
      continue;
    }
    
    // Acquire lock (prevents duplicate runs)
    const acquired = await acquireLock(dbSchedule.id);
    if (!acquired) {
      console.log(`⏭  Schedule "${definition.name}" already locked, skipping`);
      continue;
    }
    
    let updateSucceeded = false;
    try {
      console.log(`⏰ Processing schedule: ${definition.name}`);
      
      // Execute jobs inline (no enqueue, no queue)
      await executeScheduleInline(definition, dbSchedule.id);
      
      // Calculate next run time
      const nextRun = new Cron(definition.cron, { timezone: definition.timezone, paused: true }).nextRun() || new Date();
      
      // Update schedule state
      await prisma.jobSchedule.update({
        where: { id: dbSchedule.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRun,
          runCount: { increment: 1 }
        }
      });

      updateSucceeded = true;
      console.log(`✅ Schedule complete, next run: ${nextRun.toISOString()}`);
      
    } catch (err) {
      console.error(`? Failed to process "${definition.name}":`, err);
      
      // Release lock and increment failure count
      try {
        await prisma.jobSchedule.update({
          where: { id: dbSchedule.id },
          data: {
            failureCount: { increment: 1 }
          }
        });
      } catch (updateError) {
        console.error(`? Failed to record failure for "${definition.name}":`, updateError);
      }
    } finally {
      try {
        await releaseLock(dbSchedule.id);
      } catch (releaseError) {
        const suffix = updateSucceeded ? '' : ' (after failure)';
        console.error(`? Failed to release lock for "${definition.name}"${suffix}:`, releaseError);
      }
    }
  }
}

/**
 * Update worker heartbeat
 */
async function updateHeartbeat() {
  await prisma.workerInstance.update({
    where: { id: workerId },
    data: { lastHeartbeatAt: new Date() }
  });
}

async function runDaemonTick() {
  if (isProcessingTick) {
    console.log('?  Previous tick still running, skipping this interval');
    return;
  }
  isProcessingTick = true;
  try {
    await processSchedules();
  } finally {
    isProcessingTick = false;
  }
}

async function shutdown(signal: string) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`?? Received ${signal}, shutting down gracefully...`);
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  try {
    if (workerId) {
      await prisma.workerInstance.update({
        where: { id: workerId },
        data: { status: 'STOPPED', stoppedAt: new Date() }
      });
    }
  } catch (err) {
    console.error(`? Failed to update worker status on ${signal}:`, err);
  }
  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error(`? Failed to disconnect prisma on ${signal}:`, err);
  }
  process.exit(0);
}

/**
 * Main daemon loop
 */
async function main() {
  if (!DAEMON_ENABLED) {
    console.log('⏸️  Schedule daemon DISABLED (SCHEDULE_DAEMON_ENABLED=false)');
    console.log('   Jobs can still be triggered manually via admin UI');
    process.exit(0);
  }

  console.log(`🚀 Starting schedule daemon (${NODE_ENV} mode)`);
  
  await registerWorker();
  await syncScheduleDefinitions();
  
  console.log('✅ Schedule daemon started');
  console.log('⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)');
  console.log(`📋 Loaded ${schedules.length} schedule definitions from code`);
  console.log(`⏱️  Polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`🔒 Lock timeout: ${LOCK_TIMEOUT_MS / 1000}s`);
  
  // Cleanup stalled locks once at startup (not during operation to avoid premature release)
  await cleanupStalledLocks();
  
  // Initial run before starting the interval to avoid overlap on long runs
  await runDaemonTick();
  
  // Poll using setInterval
  intervalHandle = setInterval(() => {
    void updateHeartbeat().catch((err) => {
      console.error('? Error updating heartbeat:', err);
    });
    void runDaemonTick().catch((err) => {
      console.error('? Error in daemon loop:', err);
    });
  }, POLL_INTERVAL_MS);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

// Start the daemon
main().catch((err) => {
  console.error('💥 Fatal error in schedule daemon:', err);
  process.exit(1);
});
