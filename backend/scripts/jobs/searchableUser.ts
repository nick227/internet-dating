import type { JobDefinition } from './types.js';
import { parseIntArg } from './utils.js';
import { buildSearchableUsersForAll } from '../../src/jobs/searchableUserJob.js';

export const searchableUserJob: JobDefinition = {
  name: 'searchable-user',
  description: 'Build searchable user snapshot (viewer-agnostic base filter)',
  examples: [
    'tsx scripts/runJobs.ts searchable-user --userBatchSize=100 --pauseMs=50'
  ],
  defaultParams: {
    userBatchSize: 100,
    pauseMs: 50
  },
  run: async () => {
    const userBatchSize = parseIntArg('--userBatchSize', 100);
    const pauseMs = parseIntArg('--pauseMs', 50);

    await buildSearchableUsersForAll({
      userBatchSize,
      pauseMs
    });
  }
};
