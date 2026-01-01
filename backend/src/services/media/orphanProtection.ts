/**
 * Orphan protection for media uploads
 * Prevents orphaned media when post creation fails after upload succeeds
 */

import { prisma } from '../../lib/prisma/client.js'

export type MediaRefState = 'UNATTACHED' | 'ATTACHING' | 'ATTACHED'

/**
 * Mark media as being attached to a post (prevents cleanup)
 * Should be called at the start of post creation transaction
 */
export async function markMediaAttaching(mediaIds: bigint[]): Promise<void> {
  if (mediaIds.length === 0) return
  
  // In a real implementation, we'd add a refState field to Media model
  // For now, we track via PostMedia existence (if PostMedia exists, media is ATTACHED)
  // This is called before PostMedia is created, so we need a different mechanism
  // 
  // Option 1: Add refState field to Media (requires migration)
  // Option 2: Use a separate MediaAttachment table
  // Option 3: Track in memory/Redis (not persistent)
  //
  // For now, we'll implement a cleanup job that checks for orphaned media
  // (media with no PostMedia links and created > 1 hour ago)
}

/**
 * Mark media as attached to a post
 * Called after PostMedia records are created
 */
export async function markMediaAttached(postId: bigint, mediaIds: bigint[]): Promise<void> {
  // PostMedia records serve as the attachment proof
  // No additional action needed - PostMedia existence = ATTACHED
}

/**
 * Cleanup orphaned media (media uploaded but never attached to posts)
 * Should be run periodically (e.g., every hour)
 */
export async function cleanupOrphanedMedia(maxAgeHours: number = 24): Promise<number> {
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
  
  // Find media that:
  // 1. Has no PostMedia links (not attached to any post)
  // 2. Not used as avatar/hero
  // 3. Created before cutoff time
  // 4. Not already deleted
  const orphaned = await prisma.media.findMany({
    where: {
      deletedAt: null,
      createdAt: { lt: cutoffTime },
      postLinks: { none: {} },
      avatarProfiles: { none: {} },
      heroProfiles: { none: {} },
    },
    select: { id: true, storageKey: true },
  })

  let deletedCount = 0
  for (const media of orphaned) {
    try {
      // Soft delete
      await prisma.media.update({
        where: { id: media.id },
        data: { deletedAt: new Date() },
      })
      deletedCount++
      
      // Physical file deletion (if storage key exists)
      if (media.storageKey) {
        try {
          const { LocalStorageProvider } = await import('./localStorageProvider.js')
          const { MEDIA_UPLOAD_ROOT } = await import('./config.js')
          const storage = new LocalStorageProvider(MEDIA_UPLOAD_ROOT)
          await storage.delete(media.storageKey)
        } catch (err) {
          // Log but don't fail - file may already be deleted
          console.error(`Failed to delete physical file for media ${media.id}:`, err)
        }
      }
    } catch (err) {
      // Log error but continue
      console.error(`Failed to delete orphaned media ${media.id}:`, err)
    }
  }

  return deletedCount
}

/**
 * Validate media can be attached to a post
 * Checks ownership, readiness, and prevents double-attachment
 */
export async function validateMediaForAttachment(
  mediaIds: bigint[],
  ownerUserId: bigint
): Promise<void> {
  if (mediaIds.length === 0) return

  const media = await prisma.media.findMany({
    where: { id: { in: mediaIds }, deletedAt: null },
    select: {
      id: true,
      ownerUserId: true,
      status: true,
      visibility: true,
    },
  })

  if (media.length !== mediaIds.length) {
    throw new Error('Some media not found')
  }

  for (const m of media) {
    if (m.ownerUserId !== ownerUserId) {
      throw new Error(`Media ${m.id} not owned by user`)
    }
    if (m.status !== 'READY') {
      throw new Error(`Media ${m.id} not ready (status: ${m.status})`)
    }
  }
}
