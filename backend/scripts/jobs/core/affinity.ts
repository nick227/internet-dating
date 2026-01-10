import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from '../../../src/lib/jobs/shared/utils.js';
import { runUserAffinityJob } from '../../../src/jobs/userAffinityJob.js';

export const affinityJob: JobDefinition = {
  name: 'affinity',
  description: 'Compute user affinity profiles',
  group: 'feed',
  dependencies: ['content-features'],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts affinity --userId=8 --lookbackDays=90'
  ],
  defaultParams: {
    batchSize: 100,
    lookbackDays: 90,
    topCreatorsCount: 20,
    topTopicsCount: 30,
    pauseMs: 50
  },
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
