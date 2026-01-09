import type { JobDefinition } from '../lib/types.js';
import { parseIntArg } from '../lib/utils.js';
import { runMediaOrphanCleanupJob } from '../../../src/jobs/mediaOrphanCleanupJob.js';

export const mediaOrphanCleanupJob: JobDefinition = {
  name: 'media-orphan-cleanup',
  description: 'Cleanup orphaned media files',
  group: 'maintenance',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts media-orphan-cleanup --maxAgeHours=24'
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
