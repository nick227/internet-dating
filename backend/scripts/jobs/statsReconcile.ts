import type { JobDefinition } from './types.js';
import { parseIntArg, parseFlag, getEnvVar } from './utils.js';
import { runStatsReconcileJob } from '../../src/jobs/statsReconcileJob.js';

export const statsReconcileJob: JobDefinition = {
  name: 'stats-reconcile',
  description: 'Reconcile statistics counters',
  examples: [
    'tsx scripts/runJobs.ts stats-reconcile --lookbackHours=24 --batchSize=200 --pauseMs=50'
  ],
  run: async () => {
    const full = parseFlag('--full');
    const lookbackHours = parseIntArg('--lookbackHours', 24);
    const batchSize = parseIntArg('--batchSize', 200);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const algorithmVersion = getEnvVar('STATS_RECONCILE_VERSION', 'v1');

    await runStatsReconcileJob({
      full,
      lookbackHours,
      batchSize,
      pauseMs,
      algorithmVersion
    });
  }
};
