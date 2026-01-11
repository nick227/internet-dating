import { fileURLToPath } from 'node:url';
import { prisma } from '../../../src/lib/prisma/client.js';
import { loadEnv } from '../../../src/lib/jobs/shared/utils.js';
import { getJob, getAllJobs, printUsage } from '../../../src/lib/jobs/shared/registry.js';

loadEnv();
process.env.JOB_RUNNER = 'cli';

const PIPELINES: Record<string, string[]> = {
  matching: ['match-scores', 'compatibility'],
  feed: ['feed-presort', 'trending'],
  search: ['profile-search-index', 'searchable-user', 'user-interest-sets', 'interest-relationships', 'quiz-answer-stats']
};

const MEDIA_JOBS = new Set(['media-metadata', 'media-metadata-batch', 'media-metadata-all']);

function isFullRun(args: string[]): boolean {
  return args.includes('--full') || args.includes('--force');
}

function filterAllJobs(jobNames: string[], fullRun: boolean): string[] {
  if (fullRun) {
    return jobNames.filter((name) => name !== 'media-metadata' && name !== 'media-metadata-batch');
  }
  return jobNames.filter((name) => !MEDIA_JOBS.has(name));
}

function collectJobsWithDependencies(jobNames: string[], jobs: Record<string, { dependencies?: string[] }>): Set<string> {
  const collected = new Set<string>();

  const visit = (name: string) => {
    if (collected.has(name)) return;
    const job = jobs[name];
    if (!job) {
      throw new Error(`Unknown job in dependency graph: ${name}`);
    }
    collected.add(name);
    const deps = job.dependencies ?? [];
    for (const dep of deps) {
      visit(dep);
    }
  };

  for (const name of jobNames) {
    visit(name);
  }

  return collected;
}

function topologicalSort(jobNames: Set<string>, jobs: Record<string, { dependencies?: string[] }>): string[] {
  const permanent = new Set<string>();
  const temporary = new Set<string>();
  const ordered: string[] = [];

  const visit = (name: string) => {
    if (permanent.has(name)) return;
    if (temporary.has(name)) {
      throw new Error(`Cycle detected in job dependencies at "${name}"`);
    }
    const job = jobs[name];
    if (!job) {
      throw new Error(`Unknown job in dependency graph: ${name}`);
    }
    temporary.add(name);
    const deps = job.dependencies ?? [];
    for (const dep of deps) {
      if (!jobNames.has(dep)) {
        throw new Error(`Missing dependency "${dep}" required by "${name}"`);
      }
      visit(dep);
    }
    temporary.delete(name);
    permanent.add(name);
    ordered.push(name);
  };

  const sortedNames = Array.from(jobNames).sort();
  for (const name of sortedNames) {
    visit(name);
  }

  return ordered;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    await printUsage();
    process.exitCode = 1;
    return;
  }

  const fullRun = isFullRun(args);
  if (fullRun) {
    process.env.JOB_FULL = '1';
  }

  if (command === 'all' || PIPELINES[command]) {
    const jobs = await getAllJobs();
    const jobNames = Object.keys(jobs).filter(name => name !== 'all');
    const selectedJobs = command === 'all'
      ? filterAllJobs(jobNames, fullRun)
      : PIPELINES[command];

    const jobSet = collectJobsWithDependencies(selectedJobs, jobs);
    const orderedJobs = topologicalSort(jobSet, jobs);

    for (const jobName of orderedJobs) {
      const job = jobs[jobName];
      if (!job) continue;
      if (!fullRun && MEDIA_JOBS.has(jobName)) {
        continue;
      }
      console.log(`Running job: ${jobName}`);
      const startedAt = Date.now();
      await job.run();
      const durationMs = Date.now() - startedAt;
      console.log(`Completed job: ${jobName} in ${(durationMs / 1000).toFixed(2)}s`);
    }
    console.log('All jobs completed.');
    return;
  }

  const job = await getJob(command);
  
  if (!job) {
    console.error(`Unknown job: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  await job.run();
  const durationMs = Date.now() - startedAt;
  console.log(`Job "${command}" completed in ${(durationMs / 1000).toFixed(2)}s.`);
}

const isDirect = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirect) {
  main()
    .catch((err) => {
      console.error('Job failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
