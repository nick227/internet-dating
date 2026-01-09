import { prisma } from '../prisma/client.js';
import { Prisma } from '@prisma/client';

type JobTrigger = 'CRON' | 'EVENT' | 'MANUAL';

type RunJobOptions = {
  jobName: string;
  trigger?: JobTrigger;
  scope?: string | null;
  algorithmVersion?: string | null;
  attempt?: number;
  metadata?: Record<string, unknown> | null;
  triggeredBy?: bigint | null;
  jobRunId?: bigint;
};

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.stack ?? err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

// Heartbeat management
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

function startHeartbeat(jobRunId: bigint) {
  const key = jobRunId.toString();
  
  if (heartbeatTimers.has(key)) {
    clearInterval(heartbeatTimers.get(key)!);
  }
  
  const timer = setInterval(async () => {
    try {
      await prisma.jobRun.update({
        where: { id: jobRunId },
        data: { lastHeartbeatAt: new Date() }
      });
    } catch (err) {
      console.error(`[job] Failed to update heartbeat for job ${jobRunId}:`, err);
    }
  }, 30000); // 30 seconds
  
  heartbeatTimers.set(key, timer);
}

function stopHeartbeat(jobRunId: bigint) {
  const key = jobRunId.toString();
  const timer = heartbeatTimers.get(key);
  
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(key);
  }
}

// Cancellation checking
export async function checkCancellation(jobRunId: bigint): Promise<void> {
  const run = await prisma.jobRun.findUnique({
    where: { id: jobRunId },
    select: { cancelRequestedAt: true }
  });

  if (run?.cancelRequestedAt) {
    throw new Error('Job cancelled by admin');
  }
}

export interface JobContext {
  jobRunId: bigint;
  jobName: string;
}

export async function runJob<T>(options: RunJobOptions, handler: (ctx: JobContext) => Promise<T>): Promise<T> {
  let jobRun: { id: bigint };

  if (options.jobRunId) {
    // Use existing job run (from queue)
    jobRun = { id: options.jobRunId };
    
    // Update to RUNNING state and calculate queue delay
    const run = await prisma.jobRun.findUnique({
      where: { id: options.jobRunId },
      select: { queuedAt: true }
    });
    
    const now = new Date();
    const queueDelayMs = run?.queuedAt 
      ? Math.max(0, now.getTime() - run.queuedAt.getTime())
      : 0;
    
    await prisma.jobRun.update({
      where: { id: options.jobRunId },
      data: {
        status: 'RUNNING',
        startedAt: now,
        lastHeartbeatAt: now,
        queueDelayMs
      }
    });
  } else {
    // Create new job run (direct execution, bypasses queue)
    const now = new Date();
    jobRun = await prisma.jobRun.create({
      data: {
        jobName: options.jobName,
        status: 'RUNNING',
        trigger: options.trigger ?? 'MANUAL',
        scope: options.scope ?? null,
        algorithmVersion: options.algorithmVersion ?? null,
        attempt: options.attempt ?? 1,
        queuedAt: now,
        startedAt: now,
        lastHeartbeatAt: now,
        triggeredBy: options.triggeredBy ?? null,
        metadata: options.metadata ? (options.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
      },
      select: { id: true }
    });
  }

  // Start heartbeat
  startHeartbeat(jobRun.id);

  // Emit job started event
  try {
    const { emitJobEvent } = await import('../../ws/domains/admin.js');
    emitJobEvent('server.admin.job_started', {
      jobRunId: jobRun.id.toString(),
      jobName: options.jobName,
      startedAt: new Date().toISOString(),
      triggeredBy: options.triggeredBy?.toString()
    });
  } catch (err) {
    // Ignore WS errors
  }

  // Create job context
  const ctx: JobContext = {
    jobRunId: jobRun.id,
    jobName: options.jobName
  };

  try {
    const result = await handler(ctx);
    
    // Get startedAt to calculate accurate duration
    const run = await prisma.jobRun.findUnique({
      where: { id: jobRun.id },
      select: { startedAt: true }
    });
    
    const finishedAt = new Date();
    const durationMs = run?.startedAt 
      ? Math.max(0, finishedAt.getTime() - run.startedAt.getTime())
      : 0;
    
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt,
        durationMs
      }
    });

    stopHeartbeat(jobRun.id);

    // Emit job completed event
    try {
      const { emitJobEvent } = await import('../../ws/domains/admin.js');
      emitJobEvent('server.admin.job_completed', {
        jobRunId: jobRun.id.toString(),
        jobName: options.jobName,
        status: 'SUCCESS',
        finishedAt: finishedAt.toISOString(),
        durationMs
      });
    } catch (err) {
      // Ignore WS errors
    }
    
    return result;
  } catch (err) {
    const run = await prisma.jobRun.findUnique({
      where: { id: jobRun.id },
      select: { startedAt: true, cancelRequestedAt: true }
    });
    
    const finishedAt = new Date();
    const durationMs = run?.startedAt
      ? Math.max(0, finishedAt.getTime() - run.startedAt.getTime())
      : 0;
    
    // Check if error was due to cancellation
    const status = run?.cancelRequestedAt ? 'CANCELLED' : 'FAILED';
    
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status,
        finishedAt,
        durationMs,
        error: toErrorMessage(err)
      }
    });

    stopHeartbeat(jobRun.id);

    // Emit job completed event
    try {
      const { emitJobEvent } = await import('../../ws/domains/admin.js');
      emitJobEvent('server.admin.job_completed', {
        jobRunId: jobRun.id.toString(),
        jobName: options.jobName,
        status,
        finishedAt: finishedAt.toISOString(),
        durationMs,
        error: toErrorMessage(err)
      });
    } catch (err2) {
      // Ignore WS errors
    }

    throw err;
  }
}

// Run a queued job by ID
export async function runQueuedJob(jobRunId: bigint): Promise<void> {
  const jobRun = await prisma.jobRun.findUnique({
    where: { id: jobRunId },
    select: {
      id: true,
      jobName: true,
      scope: true,
      algorithmVersion: true,
      attempt: true,
      metadata: true,
      triggeredBy: true
    }
  });

  if (!jobRun) {
    throw new Error(`Job run ${jobRunId} not found`);
  }

  // Import and execute the job
  const { getJob } = await import('../../../scripts/jobs/lib/registry');
  const job = getJob(jobRun.jobName);
  
  if (!job) {
    throw new Error(`Unknown job: ${jobRun.jobName}`);
  }

  // Run the job with existing jobRunId
  await runJob(
    {
      jobName: jobRun.jobName,
      trigger: 'MANUAL',
      scope: jobRun.scope,
      algorithmVersion: jobRun.algorithmVersion,
      attempt: jobRun.attempt,
      metadata: jobRun.metadata as Record<string, unknown> | null,
      triggeredBy: jobRun.triggeredBy,
      jobRunId: jobRun.id
    },
    job.run
  );
}
