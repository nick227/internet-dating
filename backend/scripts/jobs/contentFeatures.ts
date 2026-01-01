import type { JobDefinition } from './types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from './utils.js';
import { runContentFeatureJob } from '../../src/jobs/contentFeatureJob.js';

export const contentFeaturesJob: JobDefinition = {
  name: 'content-features',
  description: 'Extract content features from posts',
  examples: [
    'tsx scripts/runJobs.ts content-features --batchSize=50'
  ],
  run: async () => {
    const postId = parseBigIntArg('--postId');
    const batchSize = parseIntArg('--batchSize', 50);
    const pauseMs = parseIntArg('--pauseMs', 50);
    const maxLookbackDays = parseIntArg('--maxLookbackDays', 7);
    const maxTopics = parseIntArg('--maxTopics', 8);
    const algorithmVersion = getEnvVar('CONTENT_FEATURE_ALGO_VERSION', 'v1');

    await runContentFeatureJob({
      postId,
      batchSize,
      pauseMs,
      maxLookbackDays,
      maxTopics,
      algorithmVersion
    });
  }
};
