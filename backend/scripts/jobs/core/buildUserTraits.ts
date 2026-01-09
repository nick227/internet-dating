import type { JobDefinition } from '../lib/types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from '../lib/utils.js';
import { buildUserTraitsForAll } from '../../../src/jobs/buildUserTraitsJob.js';

export const buildUserTraitsJob: JobDefinition = {
  name: 'build-user-traits',
  description: 'Build user traits from quiz results',
  group: 'matching',
  dependencies: [], // Foundation job - no dependencies
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts build-user-traits --userId=8 --batchSize=100 --pauseMs=50'
  ],
  defaultParams: {
    batchSize: 100,
    pauseMs: 50
  },
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const userBatchSize = parseIntArg('--batchSize', 100);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const algorithmVersion = getEnvVar('TRAIT_ALGO_VERSION', 'v1');

    await buildUserTraitsForAll({
      userId,
      userBatchSize,
      pauseMs,
      algorithmVersion
    });
  }
};
