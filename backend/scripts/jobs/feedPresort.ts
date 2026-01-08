import type { JobDefinition } from './types.js';
import { parseIntArg, parseBigIntArg, parseFlag } from './utils.js';
import { runFeedPresortJob } from '../../src/jobs/feedPresortJob.js';

export const feedPresortJob: JobDefinition = {
  name: 'feed-presort',
  description: 'Presort feed segments for users',
  examples: [
    'tsx scripts/runJobs.ts feed-presort --userId=8 --batchSize=100 --segmentSize=20'
  ],
  defaultParams: {
    batchSize: 100,
    segmentSize: 20,
    maxSegments: 3,
    incremental: false
  },
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const batchSize = parseIntArg('--batchSize', 100);
    const segmentSize = parseIntArg('--segmentSize', 20);
    const maxSegments = parseIntArg('--maxSegments', 3);
    const incremental = parseFlag('--incremental');

    await runFeedPresortJob({
      userId,
      batchSize,
      segmentSize,
      maxSegments,
      incremental,
    });
  }
};
