import { prisma } from '../../lib/prisma/client.js';

export type PresortedFeedLeafItem = {
  type: 'post' | 'suggestion' | 'question'
  id: string
  score: number
  actorId: bigint
  source: 'post' | 'match' | 'suggested' | 'question'
  mediaType?: 'text' | 'image' | 'video' | 'mixed'
  presentation?: {
    mode: 'single' | 'mosaic' | 'grid' | 'question' | 'highlight'
    accent?: 'match' | 'boost' | 'new' | null
  }
  createdAt: number // Epoch ms
  // Minimal fields for Phase-1
  actorName?: string
  actorAvatarUrl?: string | null
  textPreview?: string // Pre-truncated 150 chars
}

export type PresortedGridItem = {
  type: 'grid'
  id: string
  score: number
  actorId: bigint
  source: 'grid'
  presentation?: {
    mode: 'grid'
    accent?: 'match' | 'boost' | 'new' | null
  }
  items: PresortedFeedLeafItem[]
}

export type PresortedFeedItem = PresortedFeedLeafItem | PresortedGridItem

export type PresortedFeedSegment = {
  id: bigint
  userId: bigint
  segmentIndex: number
  items: PresortedFeedItem[]
  phase1Json: string | null
  computedAt: Date
  algorithmVersion: string
  expiresAt: Date
}

/**
 * Get presorted feed segment from database
 */
export async function getPresortedSegment(
  userId: bigint,
  segmentIndex: number
): Promise<PresortedFeedSegment | null> {
  const segment = await prisma.presortedFeedSegment.findUnique({
    where: {
      userId_segmentIndex: {
        userId,
        segmentIndex,
      },
    },
  })

  if (!segment) return null

  // Check if expired
  if (segment.expiresAt < new Date()) {
    return null
  }

  return {
    id: segment.id,
    userId: segment.userId,
    segmentIndex: segment.segmentIndex,
    items: (segment.items as unknown) as PresortedFeedItem[],
    phase1Json: segment.phase1Json,
    computedAt: segment.computedAt,
    algorithmVersion: segment.algorithmVersion,
    expiresAt: segment.expiresAt,
  }
}

/**
 * Store presorted feed segment in database
 */
export async function storePresortedSegment(params: {
  userId: bigint
  segmentIndex: number
  items: PresortedFeedItem[]
  phase1Json: string | null
  algorithmVersion: string
  expiresAt: Date
}): Promise<void> {
  await prisma.presortedFeedSegment.upsert({
    where: {
      userId_segmentIndex: {
        userId: params.userId,
        segmentIndex: params.segmentIndex,
      },
    },
    create: {
      userId: params.userId,
      segmentIndex: params.segmentIndex,
      items: params.items as unknown as object,
      phase1Json: params.phase1Json,
      algorithmVersion: params.algorithmVersion,
      expiresAt: params.expiresAt,
    },
    update: {
      items: params.items as unknown as object,
      phase1Json: params.phase1Json,
      algorithmVersion: params.algorithmVersion,
      expiresAt: params.expiresAt,
      computedAt: new Date(),
    },
  })
}

/**
 * Invalidate presorted feed segment
 */
export async function invalidatePresortedSegment(
  userId: bigint,
  segmentIndex: number
): Promise<void> {
  await prisma.presortedFeedSegment.delete({
    where: {
      userId_segmentIndex: {
        userId,
        segmentIndex,
      },
    },
  })
}

/**
 * Invalidate all segments for a user
 */
export async function invalidateAllSegmentsForUser(userId: bigint): Promise<void> {
  await prisma.presortedFeedSegment.deleteMany({
    where: { userId },
  })
}

/**
 * Cleanup expired segments
 */
export async function cleanupExpiredSegments(): Promise<number> {
  const result = await prisma.presortedFeedSegment.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })
  return result.count
}
