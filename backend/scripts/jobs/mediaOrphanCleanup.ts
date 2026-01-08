import type { JobDefinition } from './types.js';
import { parseIntArg } from './utils.js';
import { runMediaOrphanCleanupJob } from '../../src/jobs/mediaOrphanCleanupJob.js';

export const mediaOrphanCleanupJob: JobDefinition = {
  name: 'media-orphan-cleanup',
  description: 'Cleanup orphaned media files',
  examples: [
    'tsx scripts/runJobs.ts media-orphan-cleanup --maxAgeHours=24'
  ],
  defaultParams: {
    maxAgeHours: 24
  },
  run: async () => {
    const maxAgeHours = parseIntArg('--maxAgeHours', 24);

    await runMediaOrphanCleanupJob({
      maxAgeHours,
    });
  }
};
