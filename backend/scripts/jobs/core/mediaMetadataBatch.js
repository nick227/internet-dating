import { parseIntArg } from '../../../src/lib/jobs/shared/utils.js';
import { runMediaMetadataBatchJob } from '../../../src/jobs/mediaMetadataJob.js';
export const mediaMetadataBatchJob = {
    name: 'media-metadata-batch',
    description: 'Extract metadata for multiple media files',
    group: 'media',
    dependencies: [],
    examples: [
        'tsx scripts/jobs/runners/runJobs.ts media-metadata-batch --batchSize=50 --maxAgeHours=24 --pauseMs=100'
    ],
    defaultParams: {
        batchSize: 50,
        maxAgeHours: 24,
        pauseMs: 100
    },
    run: async () => {
        const batchSize = parseIntArg('--batchSize', 50);
        const maxAgeHours = parseIntArg('--maxAgeHours', 24);
        const pauseMs = parseIntArg('--pauseMs', 100);
        await runMediaMetadataBatchJob({
            batchSize,
            maxAgeHours,
            pauseMs,
        });
    }
};
