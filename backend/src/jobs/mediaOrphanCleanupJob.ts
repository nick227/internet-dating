/**
 * Cleanup orphaned media (media uploaded but never attached to posts/avatars/hero)
 * Run periodically (e.g., hourly) to prevent storage waste
 */

import { cleanupOrphanedMedia } from '../services/media/orphanProtection.js'
import { runJob } from '../lib/jobs/runJob.js'

export type MediaOrphanCleanupOptions = {
  maxAgeHours?: number
}

/**
 * Cleanup orphaned media job
 * Removes media that was uploaded but never attached to posts, avatars, or hero images
 */
export async function runMediaOrphanCleanupJob(options: MediaOrphanCleanupOptions = {}) {
  const { maxAgeHours = 24 } = options

  return runJob(
    {
      jobName: 'media-orphan-cleanup',
      trigger: 'CRON',
      scope: 'cleanup',
      algorithmVersion: 'v1',
      metadata: { maxAgeHours },
    },
    async () => {
      const deletedCount = await cleanupOrphanedMedia(maxAgeHours)
      return { deletedMedia: deletedCount }
    }
  )
}
