import type { Request, Response } from 'express';
import { prisma } from '../../../../lib/prisma/client.js';
import { json } from '../../../../lib/http/json.js';
import { schedules, getScheduleDefinition } from '../../../../lib/jobs/schedules/definitions.js';
import { enqueueAllJobs, enqueueJobsByGroup } from '../../../../lib/jobs/enqueue.js';
import cronParser from 'cron-parser';

/**
 * GET /api/admin/schedules
 * List all schedules (merges code definitions with database state)
 */
export async function listSchedules(req: Request, res: Response) {
  // Load database state for all schedules
  const dbSchedules = await prisma.jobSchedule.findMany({
    include: {
      lastRun: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true
        }
      }
    }
  });
  
  // Create a map for quick lookup
  const dbScheduleMap = new Map(dbSchedules.map(s => [s.id, s]));
  
  // Merge code definitions with database state
  const merged = schedules.map(definition => {
    const dbState = dbScheduleMap.get(definition.id);
    
    return {
      // From code
      id: definition.id,
      name: definition.name,
      description: definition.description,
      cron: definition.cron,
      timezone: definition.timezone,
      executionMode: definition.executionMode,
      jobGroup: definition.jobGroup,
      
      // From database
      enabled: dbState?.enabled ?? false,
      lockedAt: dbState?.lockedAt?.toISOString() ?? null,
      lockedBy: dbState?.lockedBy ?? null,
      lastRunAt: dbState?.lastRunAt?.toISOString() ?? null,
      nextRunAt: dbState?.nextRunAt?.toISOString() ?? null,
      runCount: dbState?.runCount ?? 0,
      failureCount: dbState?.failureCount ?? 0,
      lastRun: dbState?.lastRun ? {
        id: dbState.lastRun.id.toString(),
        status: dbState.lastRun.status,
        startedAt: dbState.lastRun.startedAt?.toISOString() ?? null,
        finishedAt: dbState.lastRun.finishedAt?.toISOString() ?? null,
        durationMs: dbState.lastRun.durationMs
      } : null
    };
  });
  
  return json(res, { schedules: merged });
}

/**
 * GET /api/admin/schedules/:id
 * Get single schedule details
 */
export async function getSchedule(req: Request, res: Response) {
  const { id } = req.params;
  
  const definition = getScheduleDefinition(id);
  if (!definition) {
    return json(res, { error: 'Schedule not found' }, 404);
  }
  
  const dbState = await prisma.jobSchedule.findUnique({
    where: { id },
    include: {
      lastRun: true,
      scheduledRuns: {
        take: 50,
        orderBy: { queuedAt: 'desc' },
        select: {
          id: true,
          jobName: true,
          status: true,
          queuedAt: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true
        }
      }
    }
  });
  
  return json(res, {
    // From code
    id: definition.id,
    name: definition.name,
    description: definition.description,
    cron: definition.cron,
    timezone: definition.timezone,
    executionMode: definition.executionMode,
    jobGroup: definition.jobGroup,
    
    // From database
    enabled: dbState?.enabled ?? false,
    lockedAt: dbState?.lockedAt?.toISOString() ?? null,
    lockedBy: dbState?.lockedBy ?? null,
    lastRunAt: dbState?.lastRunAt?.toISOString() ?? null,
    nextRunAt: dbState?.nextRunAt?.toISOString() ?? null,
    runCount: dbState?.runCount ?? 0,
    failureCount: dbState?.failureCount ?? 0,
    lastRun: dbState?.lastRun,
    recentRuns: dbState?.scheduledRuns ?? []
  });
}

/**
 * PUT /api/admin/schedules/:id
 * Update schedule (currently only supports enabling/disabling)
 */
export async function updateSchedule(req: Request, res: Response) {
  const { id } = req.params;
  const { enabled } = req.body;
  
  // Verify schedule exists in code
  const definition = getScheduleDefinition(id);
  if (!definition) {
    return json(res, { error: 'Schedule not found' }, 404);
  }
  
  // Calculate nextRunAt if enabling for the first time
  let nextRunAt: Date | undefined;
  if (enabled) {
    nextRunAt = cronParser
      .parseExpression(definition.cron, { tz: definition.timezone })
      .next()
      .toDate();
  }
  
  const updated = await prisma.jobSchedule.upsert({
    where: { id },
    create: {
      id,
      enabled,
      nextRunAt
    },
    update: {
      enabled,
      ...(enabled && { nextRunAt })
    }
  });
  
  return json(res, {
    id: updated.id,
    enabled: updated.enabled,
    nextRunAt: updated.nextRunAt?.toISOString() ?? null,
    message: enabled ? 'Schedule enabled' : 'Schedule disabled'
  });
}

/**
 * POST /api/admin/schedules/:id/trigger
 * Manually trigger a schedule (run now)
 */
export async function triggerSchedule(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user?.id;
  
  const definition = getScheduleDefinition(id);
  if (!definition) {
    return json(res, { error: 'Schedule not found' }, 404);
  }
  
  let result: { jobRunIds: bigint[] };
  
  if (definition.executionMode === 'ALL_JOBS') {
    result = await enqueueAllJobs({ 
      scheduleId: id,
      triggeredBy: userId 
    });
  } else if (definition.executionMode === 'GROUP' && definition.jobGroup) {
    result = await enqueueJobsByGroup(definition.jobGroup, { 
      scheduleId: id,
      triggeredBy: userId
    });
  } else {
    return json(res, { error: 'Invalid execution mode' }, 400);
  }
  
  return json(res, {
    message: `Triggered ${definition.name}`,
    jobRunIds: result.jobRunIds.map(id => id.toString()),
    count: result.jobRunIds.length
  });
}

/**
 * GET /api/admin/schedules/:id/history
 * Get schedule run history
 */
export async function getScheduleHistory(req: Request, res: Response) {
  const { id } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  
  const [runs, total] = await Promise.all([
    prisma.jobRun.findMany({
      where: { scheduleId: id },
      take: limit,
      skip: offset,
      orderBy: { queuedAt: 'desc' },
      select: {
        id: true,
        jobName: true,
        status: true,
        trigger: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        error: true
      }
    }),
    prisma.jobRun.count({
      where: { scheduleId: id }
    })
  ]);
  
  return json(res, {
    runs: runs.map(run => ({
      ...run,
      id: run.id.toString()
    })),
    total,
    limit,
    offset
  });
}
