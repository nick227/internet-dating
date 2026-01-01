import type { JobDefinition } from './types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from './utils.js';
import { buildUserTraitsForAll } from '../../src/jobs/buildUserTraitsJob.js';

export const buildUserTraitsJob: JobDefinition = {
  name: 'build-user-traits',
  description: 'Build user traits from quiz results',
  examples: [
    'tsx scripts/runJobs.ts build-user-traits --userId=8 --batchSize=100 --pauseMs=50'
  ],
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
