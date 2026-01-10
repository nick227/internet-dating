import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { parseIntArg } from '../../../src/lib/jobs/shared/utils.js';
import { buildUserInterestSetsForAll } from '../../../src/jobs/userInterestSetsJob.js';

export const userInterestSetsJob: JobDefinition = {
  name: 'user-interest-sets',
  description: 'Build user interest sets (precompute interest → userId mappings)',
  group: 'search',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts user-interest-sets --batchSize=1000 --pauseMs=50'
  ],
  defaultParams: {
    batchSize: 1000,
    pauseMs: 50
  },
  run: async () => {
    const batchSize = parseIntArg('--batchSize', 1000);
    const pauseMs = parseIntArg('--pauseMs', 50);

    await buildUserInterestSetsForAll({
      batchSize,
      pauseMs
    });
  }
};
