import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { runMediaMetadataAllJob } from '../../../src/jobs/mediaMetadataJob.js';

export const mediaMetadataAllJob: JobDefinition = {
  name: 'media-metadata-all',
  description: 'Extract metadata for all unchecked media records',
  group: 'media',
  dependencies: [],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts media-metadata-all'
  ],
  defaultParams: {},
  run: async () => {
    await runMediaMetadataAllJob();
  }
};
