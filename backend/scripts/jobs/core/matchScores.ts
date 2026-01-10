import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from '../../../src/lib/jobs/shared/utils.js';
import { runMatchScoreJob } from '../../../src/jobs/matchScoreJob.js';

export const matchScoresJob: JobDefinition = {
  name: 'match-scores',
  description: 'Compute match scores between users',
  group: 'matching',
  dependencies: ['build-user-traits'],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts match-scores --userId=8 --batchSize=100 --candidateBatchSize=500'
  ],
  defaultParams: {
    batchSize: 100,
    candidateBatchSize: 500,
    pauseMs: 50
  },
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const userBatchSize = parseIntArg('--batchSize', 100);
    const candidateBatchSize = parseIntArg('--candidateBatchSize', 500);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const algorithmVersion = getEnvVar('MATCH_ALGO_VERSION', 'v1');

    await runMatchScoreJob({
      userId,
      userBatchSize,
      candidateBatchSize,
      pauseMs,
      algorithmVersion
    });
  }
};
