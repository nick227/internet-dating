import { prisma } from '../src/lib/prisma/client.js';
import { Cron } from 'croner';
import { schedules, getScheduleDefinition } from '../src/lib/jobs/schedules/definitions.js';
import { enqueueAllJobs, enqueueJobsByGroup } from '../src/lib/jobs/enqueue.js';
import { hostname } from 'os';

let workerId: string;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 60_000; // 1 minute

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
 */
async function syncScheduleDefinitions() {
  for (const schedule of schedules) {
    await prisma.jobSchedule.upsert({
      where: { id: schedule.id },
      create: {
        id: schedule.id,
        enabled: false, // Safety: require explicit admin enable
        nextRunAt: new Cron(schedule.cron, { timezone: schedule.timezone, paused: true }).nextRun() || new Date()
      },
      update: {} // Don't touch existing records
    });
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
    
    try {
      console.log(`⏰ Processing schedule: ${definition.name}`);
      
      // Use existing enqueue APIs (maintains consistency with manual triggers)
      let result: { jobRunIds: bigint[] };
      
      if (definition.executionMode === 'ALL_JOBS') {
        result = await enqueueAllJobs({ scheduleId: dbSchedule.id });
      } else if (definition.executionMode === 'GROUP' && definition.jobGroup) {
        result = await enqueueJobsByGroup(definition.jobGroup, { 
          scheduleId: dbSchedule.id 
        });
      } else {
        throw new Error(`Invalid execution mode: ${definition.executionMode}`);
      }
      
      // Calculate next run time
      const nextRun = new Cron(definition.cron, { timezone: definition.timezone, paused: true }).nextRun() || new Date();
      
      // Update schedule state
      await prisma.jobSchedule.update({
        where: { id: dbSchedule.id },
        data: {
          lastRunAt: now,
          lastRunId: result.jobRunIds[0],
          nextRunAt: nextRun,
          runCount: { increment: 1 },
          lockedAt: null, // Release lock
          lockedBy: null
        }
      });
      
      console.log(`✅ Enqueued ${result.jobRunIds.length} jobs, next run: ${nextRun.toISOString()}`);
      
    } catch (err) {
      console.error(`❌ Failed to process "${definition.name}":`, err);
      
      // Release lock and increment failure count
      await prisma.jobSchedule.update({
        where: { id: dbSchedule.id },
        data: {
          failureCount: { increment: 1 },
          lockedAt: null,
          lockedBy: null
        }
      });
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

/**
 * Main daemon loop
 */
async function main() {
  await registerWorker();
  await syncScheduleDefinitions();
  
  console.log('✅ Schedule daemon started');
  console.log('⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)');
  console.log(`📋 Loaded ${schedules.length} schedule definitions from code`);
  console.log(`⏱️  Polling every ${POLL_INTERVAL_MS / 1000}s`);
  
  // Poll every minute
  setInterval(async () => {
    try {
      await updateHeartbeat();
      await cleanupStalledLocks();
      await processSchedules();
    } catch (err) {
      console.error('❌ Error in daemon loop:', err);
    }
  }, POLL_INTERVAL_MS);
  
  // Initial run
  await cleanupStalledLocks();
  await processSchedules();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  await prisma.workerInstance.update({
    where: { id: workerId },
    data: { status: 'STOPPED', stoppedAt: new Date() }
  });
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  await prisma.workerInstance.update({
    where: { id: workerId },
    data: { status: 'STOPPED', stoppedAt: new Date() }
  });
  await prisma.$disconnect();
  process.exit(0);
});

// Start the daemon
main().catch((err) => {
  console.error('💥 Fatal error in schedule daemon:', err);
  process.exit(1);
});
