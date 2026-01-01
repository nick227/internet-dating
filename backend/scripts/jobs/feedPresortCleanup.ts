import type { JobDefinition } from './types.js';
import { runFeedPresortCleanupJob } from '../../src/jobs/feedPresortCleanup.js';

export const feedPresortCleanupJob: JobDefinition = {
  name: 'feed-presort-cleanup',
  description: 'Cleanup old feed presort data',
  examples: [
    'tsx scripts/runJobs.ts feed-presort-cleanup'
  ],
  run: async () => {
    await runFeedPresortCleanupJob();
  }
};
