import type { JobDefinition } from './types.js';
import { parseBigIntArg, parseIntArg } from './utils.js';
import { buildProfileSearchIndexForAll } from '../../src/jobs/profileSearchIndexJob.js';

export const profileSearchIndexJob: JobDefinition = {
  name: 'profile-search-index',
  description: 'Build profile search index (denormalized search surface)',
  group: 'search',
  dependencies: ['build-user-traits'],
  examples: [
    'tsx scripts/runJobs.ts profile-search-index --userId=8 --userBatchSize=100 --pauseMs=50',
    'tsx scripts/runJobs.ts profile-search-index --userBatchSize=100 --pauseMs=50'
  ],
  defaultParams: {
    userBatchSize: 100,
    pauseMs: 50
  },
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const userBatchSize = parseIntArg('--userBatchSize', 100);
    const pauseMs = parseIntArg('--pauseMs', 50);

    await buildProfileSearchIndexForAll({
      userId,
      userBatchSize,
      pauseMs
    });
  }
};
