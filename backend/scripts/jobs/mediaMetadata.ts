import type { JobDefinition } from './types.js';
import { parseBigIntArg } from './utils.js';
import { runMediaMetadataJob } from '../../src/jobs/mediaMetadataJob.js';

export const mediaMetadataJob: JobDefinition = {
  name: 'media-metadata',
  description: 'Extract metadata for a single media file',
  examples: [
    'tsx scripts/runJobs.ts media-metadata --mediaId=123'
  ],
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
