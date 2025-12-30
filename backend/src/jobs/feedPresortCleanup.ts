import { cleanupExpiredSegments } from '../services/feed/presortedFeedService.js';
import { runJob } from '../lib/jobs/runJob.js';

/**
 * Cleanup expired presorted feed segments
 * Run periodically (e.g., every hour) to remove expired segments
 */
export async function runFeedPresortCleanupJob() {
  return runJob(
    {
      jobName: 'feed-presort-cleanup',
      trigger: 'CRON',
      scope: 'cleanup',
      algorithmVersion: 'v1',
      metadata: {},
    },
    async () => {
      const deletedCount = await cleanupExpiredSegments();
      return { deletedSegments: deletedCount };
    }
  );
}
