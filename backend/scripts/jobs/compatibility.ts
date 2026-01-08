import type { JobDefinition } from './types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from './utils.js';
import { runCompatibilityJob } from '../../src/jobs/compatibilityJob.js';

export const compatibilityJob: JobDefinition = {
  name: 'compatibility',
  description: 'Compute compatibility scores between users',
  examples: [
    'tsx scripts/runJobs.ts compatibility --userId=8 --targetBatchSize=500'
  ],
  defaultParams: {
    batchSize: 100,
    targetBatchSize: 500,
    maxSuggestionTargets: 100,
    pauseMs: 50
  },
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const userBatchSize = parseIntArg('--batchSize', 100);
    const targetBatchSize = parseIntArg('--targetBatchSize', 500);
    const maxSuggestionTargets = parseIntArg('--maxSuggestionTargets', 100);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const algorithmVersion = getEnvVar('COMPATIBILITY_ALGO_VERSION', 'v1');

    await runCompatibilityJob({
      userId,
      userBatchSize,
      targetBatchSize,
      maxSuggestionTargets,
      pauseMs,
      algorithmVersion
    });
  }
};
