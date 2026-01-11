import type { JobDefinition } from '../../../src/lib/jobs/shared/types.js';
import { parseIntArg, parseBigIntArg, parseFlag } from '../../../src/lib/jobs/shared/utils.js';
import { runFeedPresortJob } from '../../../src/jobs/feedPresortJob.js';

export const feedPresortJob: JobDefinition = {
  name: 'feed-presort',
  description: 'Presort feed segments for users',
  group: 'feed',
  dependencies: ['match-scores', 'affinity', 'content-features'],
  examples: [
    'tsx scripts/jobs/runners/runJobs.ts feed-presort --userId=8 --batchSize=100 --segmentSize=20'
  ],
  defaultParams: {
    batchSize: 100,
    segmentSize: 20,
    maxSegments: 3,
    incremental: true
  },
  run: async () => {
    const userId = parseBigIntArg('--userId');
    const batchSize = parseIntArg('--batchSize', 100);
    const segmentSize = parseIntArg('--segmentSize', 20);
    const maxSegments = parseIntArg('--maxSegments', 3);
    const incremental = process.argv.includes('--incremental=false') ? false : true;
    const noJitter = parseFlag('--noJitter');

    console.log('Running presort with options:', { userId, batchSize, segmentSize, maxSegments, incremental, noJitter });

    await runFeedPresortJob({
      userId,
      batchSize,
      segmentSize,
      maxSegments,
      incremental,
      noJitter,
    });
  }
};
