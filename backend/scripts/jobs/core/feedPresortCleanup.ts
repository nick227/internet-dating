import type { JobDefinition } from '../lib/types.js';
import { runFeedPresortCleanupJob } from '../../../src/jobs/feedPresortCleanup.js';

export const feedPresortCleanupJob: JobDefinition = {
  name: 'feed-presort-cleanup',
  description: 'Cleanup old feed presort data',
  group: 'maintenance',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts feed-presort-cleanup'
  ],
  defaultParams: {},
  run: async () => {
    await runFeedPresortCleanupJob();
  }
};
