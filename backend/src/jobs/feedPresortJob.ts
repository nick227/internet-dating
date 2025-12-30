import { prisma } from '../lib/prisma/client.js'
import { runJob } from '../lib/jobs/runJob.js'
import { getCandidates } from '../registry/domains/feed/candidates/index.js'
import { scoreCandidatesWithoutSeen } from './feedPresortScoring.js'
import { mergeAndRank } from '../registry/domains/feed/ranking/index.js'
import { generatePhase1JSON, convertToPresortedItem } from './feedPresortPhase1.js'
import { storePresortedSegment, getPresortedSegment } from '../services/feed/presortedFeedService.js'
import type { ViewerContext, FeedItem } from '../registry/domains/feed/types.js'

type FeedPresortJobOptions = {
  userId?: bigint | null
  batchSize?: number
  segmentSize?: number
  maxSegments?: number
  incremental?: boolean
}

const DEFAULT_CONFIG = {
  batchSize: 100,
  segmentSize: 20,
  maxSegments: 3,
  algorithmVersion: 'v1',
  ttlMinutes: 30,
} as const

/**
 * Run feed presort job for single user or batch
 */
export async function runFeedPresortJob(options: FeedPresortJobOptions = {}) {
  return runJob(
    {
      jobName: 'feed-presort',
      trigger: options.userId ? 'EVENT' : 'CRON',
      scope: options.userId ? `user:${options.userId}` : 'batch',
      algorithmVersion: DEFAULT_CONFIG.algorithmVersion,
      metadata: {
        batchSize: options.batchSize ?? DEFAULT_CONFIG.batchSize,
        segmentSize: options.segmentSize ?? DEFAULT_CONFIG.segmentSize,
        maxSegments: options.maxSegments ?? DEFAULT_CONFIG.maxSegments,
        incremental: options.incremental ?? false,
      },
    },
    async () => {
      if (options.userId) {
        // Single user (event-driven)
        await presortFeedForUser(options.userId, options)
        return { processedUsers: 1 }
      }

      // Batch processing with jitter to prevent thundering herd
      const jitter = Math.floor(Math.random() * 5 * 60 * 1000) // 0-5 min
      await new Promise((resolve) => setTimeout(resolve, jitter))

      let lastId: bigint | null = null
      let processedUsers = 0

      for (;;) {
        const users: Array<{ id: bigint }> = await prisma.user.findMany({
          select: { id: true },
          orderBy: { id: 'asc' },
          take: options.batchSize ?? DEFAULT_CONFIG.batchSize,
          ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
        })

        if (!users.length) break
        lastId = users[users.length - 1]!.id

        // Background job backpressure: Cap concurrent presort jobs
        const maxConcurrent = 10
        const chunks = []
        for (let i = 0; i < users.length; i += maxConcurrent) {
          chunks.push(users.slice(i, i + maxConcurrent))
        }

        for (const chunk of chunks) {
          await Promise.all(chunk.map((user: { id: bigint }) => presortFeedForUser(user.id, options)))
          processedUsers += chunk.length
        }
      }

      return { processedUsers }
    }
  )
}

/**
 * Presort feed for a single user
 */
async function presortFeedForUser(
  userId: bigint,
  options: FeedPresortJobOptions
) {
  // Incremental presort: Only recompute top segment when new content arrives
  if (options.incremental) {
    const existingSegment = await getPresortedSegment(userId, 0)
    if (existingSegment && existingSegment.expiresAt > new Date()) {
      // Check if significant new content (simplified: always recompute for v1)
      // TODO: Add countNewContentSince check in future version
      return
    }
  }

  // Build viewer context
  const ctx: ViewerContext = {
    userId,
    take: 100, // Fetch enough candidates for multiple segments
    cursorId: null,
    debug: false,
    seed: null,
    markSeen: false,
  }

  // 1. Get candidates (same as current getCandidates)
  const candidates = await getCandidates(ctx)

  // 2. Score candidates (without seen penalty)
  const scored = await scoreCandidatesWithoutSeen(ctx, candidates)

  // 3. Rank candidates (sequence-first mergeAndRank)
  const ranked = mergeAndRank(ctx, scored)

  // 4. Convert FeedItems to PresortedFeedItems (with actor data)
  const presortedItems = await convertFeedItemsToPresorted(ranked)

  // 6. Generate segments
  const segmentSize = options.segmentSize ?? DEFAULT_CONFIG.segmentSize
  const maxSegments = options.maxSegments ?? DEFAULT_CONFIG.maxSegments
  const availableSegments = Math.ceil(presortedItems.length / segmentSize) || 0
  const effectiveMaxSegments = Math.min(maxSegments, availableSegments)

  for (let i = 0; i < effectiveMaxSegments; i++) {
    const start = i * segmentSize
    const end = start + segmentSize
    const segmentItems = presortedItems.slice(start, end)

    if (segmentItems.length === 0) break

    // 7. Generate Phase-1 JSON shape (only for first segment)
    const phase1JSON = i === 0 ? generatePhase1JSON(segmentItems) : null

    // 8. Store segment in DB
    await storePresortedSegment({
      userId,
      segmentIndex: i,
      items: segmentItems,
      phase1Json: phase1JSON,
      algorithmVersion: DEFAULT_CONFIG.algorithmVersion,
      expiresAt: new Date(Date.now() + DEFAULT_CONFIG.ttlMinutes * 60 * 1000),
    })
  }
}

/**
 * Convert FeedItems to PresortedFeedItems with actor data
 */
async function convertFeedItemsToPresorted(items: FeedItem[]) {
  // Fetch actor data (names, avatars) in batch
  const actorIds = new Set<bigint>()
  for (const item of items) {
    actorIds.add(item.actorId)
  }

  const { toAvatarUrl } = await import('../services/media/presenter.js')
  const mediaSelect = {
    id: true,
    type: true,
    storageKey: true,
    variants: true,
    url: true,
    thumbUrl: true,
  }

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: Array.from(actorIds) } },
    select: {
      userId: true,
      displayName: true,
      avatarMedia: {
        select: mediaSelect,
      },
    },
  })

  const actorMap = new Map<bigint, { name: string | null; avatarUrl: string | null }>()
  for (const profile of profiles) {
    actorMap.set(profile.userId, {
      name: profile.displayName,
      avatarUrl: toAvatarUrl(profile.avatarMedia),
    })
  }

  // Convert items
  const presortedItems = []
  for (const item of items) {
    const actor = actorMap.get(item.actorId)
    
    // Determine ID based on item type
    let itemId: bigint | undefined
    if (item.type === 'post' && item.post) {
      itemId = item.post.id
    } else if (item.type === 'suggestion' && item.suggestion) {
      itemId = item.suggestion.userId
    } else if (item.type === 'question' && item.question) {
      itemId = item.question.id
    }
    
    if (!itemId) {
      // Skip items without valid ID
      continue
    }
    
    const presortedItem = convertToPresortedItem(
      {
        type: item.type,
        id: itemId,
        actorId: item.actorId,
        source: item.source,
        post: item.post,
        suggestion: item.suggestion,
        question: item.question,
        mediaType: item.post?.mediaType,
        presentation: item.presentation ?? item.post?.presentation ?? item.suggestion?.presentation ?? item.question?.presentation,
        score: item.post?.score ?? item.suggestion?.score ?? 0,
      },
      actor?.name,
      actor?.avatarUrl
    )
    presortedItems.push(presortedItem)
  }

  return presortedItems
}
