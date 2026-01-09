import type { JobDefinition, JobGroup } from './types.js';

export interface ResolvedJob {
  name: string;
  group?: JobGroup;
  defaultParams?: Record<string, unknown>;
  dependencies: string[];
}

/**
 * Resolves job dependencies and returns jobs in execution order
 * Uses topological sort to ensure dependencies run before dependents
 * 
 * @throws Error if circular dependencies or missing dependencies are detected
 */
export function resolveJobDependencies(
  jobs: Map<string, JobDefinition>
): ResolvedJob[] {
  const resolved: ResolvedJob[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(jobName: string, path: string[] = []): void {
    // Check if already resolved
    if (visited.has(jobName)) {
      return;
    }

    // Check for circular dependency
    if (visiting.has(jobName)) {
      const cycle = [...path, jobName].join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    const job = jobs.get(jobName);
    if (!job) {
      throw new Error(`Dependency not found: ${jobName} (required by ${path[path.length - 1] || 'root'})`);
    }

    // Mark as currently visiting
    visiting.add(jobName);

    // Visit all dependencies first
    const dependencies = job.dependencies || [];
    for (const dep of dependencies) {
      visit(dep, [...path, jobName]);
    }

    // Mark as visited and add to resolved list
    visiting.delete(jobName);
    visited.add(jobName);

    resolved.push({
      name: jobName,
      group: job.group,
      defaultParams: job.defaultParams,
      dependencies,
    });
  }

  // Visit all jobs
  for (const jobName of jobs.keys()) {
    visit(jobName);
  }

  return resolved;
}

/**
 * Filter jobs by group and resolve dependencies
 */
export function resolveJobsByGroup(
  jobs: Map<string, JobDefinition>,
  group: JobGroup
): ResolvedJob[] {
  // Get all jobs in the group
  const groupJobs = new Map<string, JobDefinition>();
  for (const [name, job] of jobs.entries()) {
    if (job.group === group) {
      groupJobs.set(name, job);
    }
  }

  // Check if dependencies are within the group or need to be included
  const jobsToResolve = new Map<string, JobDefinition>(groupJobs);
  const checked = new Set<string>();

  function addDependencies(jobName: string): void {
    if (checked.has(jobName)) return;
    checked.add(jobName);

    const job = jobs.get(jobName);
    if (!job) return;

    const dependencies = job.dependencies || [];
    for (const dep of dependencies) {
      if (!jobsToResolve.has(dep)) {
        const depJob = jobs.get(dep);
        if (depJob) {
          jobsToResolve.set(dep, depJob);
          addDependencies(dep);
        }
      }
    }
  }

  // Add all dependencies for group jobs
  for (const jobName of groupJobs.keys()) {
    addDependencies(jobName);
  }

  // Resolve with dependencies
  return resolveJobDependencies(jobsToResolve);
}

/**
 * Get all job groups
 */
export function getJobGroups(jobs: Map<string, JobDefinition>): JobGroup[] {
  const groups = new Set<JobGroup>();
  for (const job of jobs.values()) {
    if (job.group) {
      groups.add(job.group);
    }
  }
  return Array.from(groups).sort();
}

/**
 * Get job counts by group
 */
export function getJobGroupCounts(jobs: Map<string, JobDefinition>): Record<JobGroup, number> {
  const counts: Record<string, number> = {};
  for (const job of jobs.values()) {
    if (job.group) {
      counts[job.group] = (counts[job.group] || 0) + 1;
    }
  }
  return counts as Record<JobGroup, number>;
}
