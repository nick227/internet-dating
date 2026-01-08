import type { JobDefinition } from './types.js';
import { parseIntArg, getEnvVar } from './utils.js';
import { runTrendingJob } from '../../src/jobs/trendingJob.js';

export const trendingJob: JobDefinition = {
  name: 'trending',
  description: 'Compute trending scores for posts',
  group: 'feed',
  dependencies: ['content-features'],
  examples: [
    'tsx scripts/runJobs.ts trending --windowHours=48 --minEngagements=5'
  ],
  defaultParams: {
    windowHours: 48,
    expiryHours: 48,
    minEngagements: 5
  },
  run: async () => {
    const windowHours = parseIntArg('--windowHours', 48);
    const expiryHours = parseIntArg('--expiryHours', 48);
    const minEngagements = parseIntArg('--minEngagements', 5);
    const algorithmVersion = getEnvVar('TRENDING_ALGO_VERSION', 'v1');

    await runTrendingJob({
      windowHours,
      expiryHours,
      minEngagements,
      algorithmVersion
    });
  }
};
