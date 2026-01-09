import type { JobDefinition } from '../lib/types.js';
import { parseIntArg, parseBigIntArg, getEnvVar } from '../lib/utils.js';
import { runContentFeatureJob } from '../../../src/jobs/contentFeatureJob.js';

export const contentFeaturesJob: JobDefinition = {
  name: 'content-features',
  description: 'Extract content features from posts',
  group: 'feed',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts content-features --batchSize=50'
  ],
  defaultParams: {
    batchSize: 50,
    pauseMs: 50,
    maxLookbackDays: 7,
    maxTopics: 8
  },
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
