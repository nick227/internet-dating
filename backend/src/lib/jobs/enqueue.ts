import { prisma } from '../prisma/client.js';
import { getAllJobs, getJobsByGroup } from './shared/registry.js';
import { resolveJobDependencies, resolveJobsByGroup } from './shared/dependencyResolver.js';
import type { JobGroup } from './shared/types.js';

export interface EnqueueOptions {
  scheduleId?: string;
  triggeredBy?: bigint;
}

export interface EnqueueResult {
  jobRunIds: bigint[];
}

/**
 * Enqueue all jobs in dependency order
 * Used by: Admin "Run All Jobs" button AND schedule daemon
 */
export async function enqueueAllJobs(
  options: EnqueueOptions = {}
): Promise<EnqueueResult> {
  const jobs = await getAllJobs();
  const jobRunIds: bigint[] = [];
  
  // Resolve dependencies to get correct execution order
  const jobsMap = new Map(Object.entries(jobs));
  const resolvedJobs = resolveJobDependencies(jobsMap);
  
  for (const resolved of resolvedJobs) {
    const run = await prisma.jobRun.create({
      data: {
        jobName: resolved.name,
        trigger: options.scheduleId ? 'CRON' : 'MANUAL',
        status: 'QUEUED',
        scheduleId: options.scheduleId,
        triggeredBy: options.triggeredBy
      }
    });
    jobRunIds.push(run.id);
  }
  
  return { jobRunIds };
}

/**
 * Enqueue all jobs in a specific group
 * Used by: Admin "Run Group" button AND schedule daemon
 */
export async function enqueueJobsByGroup(
  group: JobGroup,
  options: EnqueueOptions = {}
): Promise<EnqueueResult> {
  const jobs = await getJobsByGroup(group);
  const jobRunIds: bigint[] = [];
  
  // Jobs within a group may have dependencies too
  const allJobs = await getAllJobs();
  const jobsMap = new Map(Object.entries(allJobs));
  const resolvedJobs = resolveJobsByGroup(jobsMap, group);
  
  for (const resolved of resolvedJobs) {
    const run = await prisma.jobRun.create({
      data: {
        jobName: resolved.name,
        trigger: options.scheduleId ? 'CRON' : 'MANUAL',
        status: 'QUEUED',
        scheduleId: options.scheduleId,
        triggeredBy: options.triggeredBy
      }
    });
    jobRunIds.push(run.id);
  }
  
  return { jobRunIds };
}

/**
 * Enqueue a single job
 * Used by: Admin "Run Job" button
 */
export async function enqueueJob(
  jobName: string,
  options: EnqueueOptions = {}
): Promise<EnqueueResult> {
  const run = await prisma.jobRun.create({
    data: {
      jobName,
      trigger: options.scheduleId ? 'CRON' : 'MANUAL',
      status: 'QUEUED',
      scheduleId: options.scheduleId,
      triggeredBy: options.triggeredBy
    }
  });
  
  return { jobRunIds: [run.id] };
}
