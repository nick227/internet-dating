import type { JobDefinition } from './types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from './utils.js';
import { runUserAffinityJob } from '../../src/jobs/userAffinityJob.js';

export const affinityJob: JobDefinition = {
  name: 'affinity',
  description: 'Compute user affinity profiles',
  examples: [
    'tsx scripts/runJobs.ts affinity --userId=8 --lookbackDays=90'
  ],
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const userBatchSize = parseIntArg('--batchSize', 100);
    const lookbackDays = parseIntArg('--lookbackDays', 90);
    const topCreatorsCount = parseIntArg('--topCreatorsCount', 20);
    const topTopicsCount = parseIntArg('--topTopicsCount', 30);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const algorithmVersion = getEnvVar('AFFINITY_ALGO_VERSION', 'v1');

    await runUserAffinityJob({
      userId,
      userBatchSize,
      lookbackDays,
      topCreatorsCount,
      topTopicsCount,
      pauseMs,
      algorithmVersion
    });
  }
};
