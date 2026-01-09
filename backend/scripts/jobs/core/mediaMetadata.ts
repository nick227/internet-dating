import type { JobDefinition } from '../lib/types.js';
import { parseBigIntArg } from '../lib/utils.js';
import { runMediaMetadataJob } from '../../../src/jobs/mediaMetadataJob.js';

export const mediaMetadataJob: JobDefinition = {
  name: 'media-metadata',
  description: 'Extract metadata for a single media file',
  group: 'media',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts media-metadata --mediaId=123'
  ],
  defaultParams: {},
  run: async () => {
    const mediaId = parseBigIntArg('--mediaId');
    if (!mediaId) {
      throw new Error('--mediaId required');
    }

    await runMediaMetadataJob({
      mediaId,
    });
  }
};
