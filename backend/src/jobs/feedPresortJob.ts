import { prisma } from '../lib/prisma/client.js'
import { runJob } from '../lib/jobs/runJob.js'
import { getCandidates } from '../registry/domains/feed/candidates/index.js'
import { FEED_CONFIG_VERSION } from '../registry/domains/feed/config.js'
import { FEED_PRESORT_MIN_SEGMENT_ITEMS } from '../registry/domains/feed/constants.js'
import { scoreCandidatesWithoutSeen } from './feedPresortScoring.js'
import { mergeAndRank } from '../registry/domains/feed/ranking/index.js'
import { generatePhase1JSON, convertToPresortedItem } from './feedPresortPhase1.js'
import { getPresortedSegment, storePresortedSegment, type PresortedFeedItem } from '../services/feed/presortedFeedService.js'
import type { ViewerContext, FeedItem } from '../registry/domains/feed/types.js'
import { hashKeyValues, isJobFresh, upsertJobFreshness } from '../lib/jobs/shared/freshness.js'
import { logger } from '../lib/logger/logger.js'

type FeedPresortJobOptions = {
  userId?: bigint | null
  batchSize?: number
  segmentSize?: number
  maxSegments?: number
  incremental?: boolean
  noJitter?: boolean
}

// Configuration constants with clear documentation
const DEFAULT_CONFIG = {
  // Number of users to fetch per batch iteration
  batchSize: 100,
  // Items per segment (typical mobile screen shows ~3-5 items)
  segmentSize: 20,
  // Maximum segments to precompute (balance between freshness and precomputation)
  maxSegments: 3,
  // Minimum candidate pool to prevent thin segments for new users
  minCandidateCount: 100,
  // Algorithm version linked to config to auto-invalidate on changes
  algorithmVersion: FEED_CONFIG_VERSION,
  // TTL should match or slightly exceed job run frequency to prevent gaps
  ttlMinutes: 30,
  // Concurrent user processing limit (based on database connection pool size)
  // Typical connection pool: 20-50, leaving headroom for other operations
  maxConcurrent: 10,
  // Jitter to prevent thundering herd (should be ~10% of job interval)
  // For 30min jobs: 0-3min jitter is reasonable
  maxJitterMs: 3 * 60 * 1000,
} as const

type FeedPresortMetrics = {
  userId: bigint
  candidatesFetched: number
  itemsAfterDedup: number
  segmentsGenerated: number
  itemsSkipped: number
  durationMs: number
}

/**
 * Build input hash for freshness checking
 * Hash includes all factors that would change the presorted output:
 * - Algorithm version
 * - Configuration (segment size/count)
 * - Latest match score (affects ranking)
 * - Latest like (affects seen filtering in future runs)
 */
async function buildFeedPresortInputHash(
  userId: bigint,
  options: FeedPresortJobOptions,
  relevantPostUpdatedAt: Date | null
): Promise<string> {
  const [latestMatchScore, latestLike] = await Promise.all([
    prisma.matchScore.findFirst({
      where: { userId },
      orderBy: { scoredAt: 'desc' },
      select: { scoredAt: true, algorithmVersion: true },
    }),
    prisma.likedPost.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  return hashKeyValues([
    ['algorithmVersion', DEFAULT_CONFIG.algorithmVersion],
    ['segmentSize', options.segmentSize ?? DEFAULT_CONFIG.segmentSize],
    ['maxSegments', options.maxSegments ?? DEFAULT_CONFIG.maxSegments],
    ['incremental', options.incremental ?? false],
    ['minCandidateCount', DEFAULT_CONFIG.minCandidateCount],
    ['matchScoreAt', latestMatchScore?.scoredAt?.toISOString() ?? null],
    ['matchScoreVersion', latestMatchScore?.algorithmVersion ?? null],
    ['latestLikeAt', latestLike?.createdAt?.toISOString() ?? null],
    ['relevantPostUpdatedAt', relevantPostUpdatedAt?.toISOString() ?? null],
  ])
}

/**
 * Deduplicate feed items by unique identifier
 * Preserves first occurrence (highest ranked item wins)
 */
function deduplicateFeedItems(items: FeedItem[]): { items: FeedItem[]; duplicateCount: number } {
  const seen = new Set<string>()
  const deduplicated: FeedItem[] = []
  let duplicateCount = 0

  for (const item of items) {
    let key: string
    
    if (item.type === 'post' && item.post) {
      key = `post:${item.post.id}`
    } else if (item.type === 'suggestion' && item.suggestion) {
      key = `suggestion:${item.suggestion.userId}`
    } else if (item.type === 'question' && item.question) {
      key = `question:${item.question.id}`
    } else {
      // Invalid item structure - skip it
      logger.warn('Skipping feed item with invalid structure', { 
        userId: item.actorId,
        type: item.type,
        hasPost: !!item.post,
        hasSuggestion: !!item.suggestion,
        hasQuestion: !!item.question,
      })
      duplicateCount++
      continue
    }

    if (seen.has(key)) {
      duplicateCount++
      continue
    }

    seen.add(key)
    deduplicated.push(item)
  }

  return { items: deduplicated, duplicateCount }
}

/**
 * Batch fetch actor profiles for all feed items
 * This separates data fetching from transformation
 */
async function fetchActorProfiles(
  actorIds: bigint[]
): Promise<Map<bigint, { name: string; avatarUrl: string | null }>> {
  if (actorIds.length === 0) {
    return new Map()
  }

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: actorIds } },
    select: {
      userId: true,
      displayName: true,
      avatarUrl: true,
    },
  })

  const actorMap = new Map<bigint, { name: string; avatarUrl: string | null }>()
  for (const profile of profiles) {
    actorMap.set(profile.userId, {
      name: profile.displayName ?? 'User',
      avatarUrl: profile.avatarUrl ?? null,
    })
  }

  return actorMap
}

/**
 * Convert feed items to presorted format with actor data
 * Pure transformation function - all data fetching done beforehand
 */
function convertFeedItemsToPresorted(
  items: FeedItem[],
  actorMap: Map<bigint, { name: string; avatarUrl: string | null }>
): { items: PresortedFeedItem[]; skippedCount: number } {
  const presortedItems: PresortedFeedItem[] = []
  let skippedCount = 0

  for (const item of items) {
    const actor = actorMap.get(item.actorId)
    
    try {
      // Extract item-specific data based on type
      let itemId: bigint
      let itemData: Parameters<typeof convertToPresortedItem>[0]

      if (item.type === 'post' && item.post) {
        itemId = item.post.id
        itemData = {
          type: 'post',
          id: itemId,
          actorId: item.actorId,
          source: item.source,
          post: item.post,
          mediaType: item.post.mediaType,
          presentation: item.presentation ?? item.post.presentation,
          score: item.post.score ?? 0,
        }
      } else if (item.type === 'suggestion' && item.suggestion) {
        itemId = item.suggestion.userId
        itemData = {
          type: 'suggestion',
          id: itemId,
          actorId: item.actorId,
          source: item.source,
          suggestion: item.suggestion,
          presentation: item.presentation ?? item.suggestion.presentation,
          score: item.suggestion.score ?? 0,
        }
      } else if (item.type === 'question' && item.question) {
        itemId = item.question.id
        itemData = {
          type: 'question',
          id: itemId,
          actorId: item.actorId,
          source: item.source,
          question: item.question,
          presentation: item.presentation ?? item.question.presentation,
          score: 0,
        }
      } else {
        logger.error('Feed item missing required data for type', {
          type: item.type,
          actorId: item.actorId.toString(),
          hasPost: !!item.post,
          hasSuggestion: !!item.suggestion,
          hasQuestion: !!item.question,
        })
        skippedCount++
        continue
      }

      const presortedItem = convertToPresortedItem(
        itemData,
        actor?.name ?? null,
        actor?.avatarUrl ?? null
      )
      
      presortedItems.push(presortedItem)
    } catch (error) {
      logger.error('Error converting feed item to presorted format', {
        error,
        type: item.type,
        actorId: item.actorId.toString(),
      })
      skippedCount++
    }
  }

  return { items: presortedItems, skippedCount }
}

/**
 * Validate segment quality before storage
 */
function validateSegment(
  segmentItems: PresortedFeedItem[],
  segmentIndex: number,
  expectedSize: number
): boolean {
  if (segmentItems.length === 0) {
    logger.warn('Segment is empty', { segmentIndex })
    return false
  }

  // First segment must have enough items for initial load
  if (segmentIndex === 0 && segmentItems.length < Math.min(FEED_PRESORT_MIN_SEGMENT_ITEMS, expectedSize)) {
    logger.warn('First segment has too few items', {
      segmentIndex,
      itemCount: segmentItems.length,
      expectedSize,
    })
    return false
  }

  return true
}

/**
 * Store segments in a single transaction for atomicity
 * If storage fails partway through, all segments are rolled back
 */
async function storeSegmentsBatch(
  userId: bigint,
  segments: Array<{
    segmentIndex: number
    items: PresortedFeedItem[]
    phase1Json: string | null
  }>
): Promise<void> {
  const expiresAt = new Date(Date.now() + DEFAULT_CONFIG.ttlMinutes * 60 * 1000)
  
  await prisma.$transaction(
    segments.map((segment) =>
      prisma.presortedFeedSegment.upsert({
        where: {
          userId_segmentIndex: {
            userId,
            segmentIndex: segment.segmentIndex,
          },
        },
        create: {
          userId,
          segmentIndex: segment.segmentIndex,
          items: segment.items as unknown as object,
          phase1Json: segment.phase1Json,
          algorithmVersion: DEFAULT_CONFIG.algorithmVersion,
          expiresAt,
        },
        update: {
          items: segment.items as unknown as object,
          phase1Json: segment.phase1Json,
          algorithmVersion: DEFAULT_CONFIG.algorithmVersion,
          expiresAt,
          computedAt: new Date(),
        },
      })
    )
  )
}

/**
 * Presort feed for a single user with complete metrics
 */
async function presortFeedForUser(
  userId: bigint,
  options: FeedPresortJobOptions
): Promise<FeedPresortMetrics> {
  const startTime = Date.now()
  const scope = `user:${userId}`

  // Check freshness - skip if inputs haven't changed
  const existingSegment = await getPresortedSegment(userId, 0)
  const effectiveIncremental =
    Boolean(options.incremental) &&
    Boolean(existingSegment && existingSegment.items.length >= FEED_PRESORT_MIN_SEGMENT_ITEMS)
  let relevantPostUpdatedAt: Date | null = null

  if (effectiveIncremental && existingSegment && existingSegment.items.length > 0) {
    const actorIds = Array.from(new Set(existingSegment.items.map((item) => item.actorId)))
    if (actorIds.length > 0) {
      const latestRelevantPost = await prisma.post.findFirst({
        where: { userId: { in: actorIds }, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      })
      relevantPostUpdatedAt = latestRelevantPost?.updatedAt ?? null
    }
  }

  if (options.incremental && !effectiveIncremental) {
    logger.info('Presort incremental disabled due to thin or missing segment', {
      userId: userId.toString(),
      existingCount: existingSegment?.items.length ?? 0,
      minRequired: FEED_PRESORT_MIN_SEGMENT_ITEMS,
    })
  }

  const inputHash = await buildFeedPresortInputHash(
    userId,
    { ...options, incremental: effectiveIncremental },
    relevantPostUpdatedAt
  )
  const skipFreshness = options.incremental === false
  if (!skipFreshness && existingSegment && (await isJobFresh('feed-presort', scope, inputHash))) {
    return {
      userId,
      candidatesFetched: 0,
      itemsAfterDedup: 0,
      segmentsGenerated: 0,
      itemsSkipped: 0,
      durationMs: Date.now() - startTime,
    }
  }


  // Calculate optimal candidate count based on actual needs
  const segmentSize = options.segmentSize ?? DEFAULT_CONFIG.segmentSize
  const maxSegments = options.maxSegments ?? DEFAULT_CONFIG.maxSegments
  const targetSegments = effectiveIncremental ? 1 : maxSegments
  const targetItems = segmentSize * targetSegments
  // Fetch extra candidates to account for deduplication and filtering (typically ~20% overhead)
  const candidateCount = Math.max(Math.ceil(targetItems * 1.2), DEFAULT_CONFIG.minCandidateCount)

  // Build viewer context with calculated candidate count
  const ctx: ViewerContext = {
    userId,
    take: candidateCount,
    cursorId: null,
    debug: false,
    seed: null,
    markSeen: false,
  }

  // 1. Get candidates
  const candidates = await getCandidates(ctx)

  // 2. Score candidates (without seen penalty for presort)
  const scored = await scoreCandidatesWithoutSeen(ctx, candidates)

  // 3. Rank candidates
  const ranked = mergeAndRank(ctx, scored)

  // 4. Deduplicate items
  const { items: deduplicated, duplicateCount } = deduplicateFeedItems(ranked)

  // 5. Fetch actor profiles in batch
  const actorIds = Array.from(new Set(deduplicated.map((item) => item.actorId)))
  const actorMap = await fetchActorProfiles(actorIds)

  // 6. Convert to presorted format
  const { items: presortedItems, skippedCount } = convertFeedItemsToPresorted(deduplicated, actorMap)

  // 7. Generate segments with validation
  const segments: Array<{
    segmentIndex: number
    items: PresortedFeedItem[]
    phase1Json: string | null
  }> = []

  const availableSegments = Math.ceil(presortedItems.length / segmentSize)
  const effectiveMaxSegments = Math.min(targetSegments, availableSegments)

  for (let i = 0; i < effectiveMaxSegments; i++) {
    const start = i * segmentSize
    const end = start + segmentSize
    const segmentItems = presortedItems.slice(start, end)

    if (!validateSegment(segmentItems, i, segmentSize)) {
      continue
    }

    // Generate Phase-1 JSON only for first segment
    const phase1JSON = i === 0 ? generatePhase1JSON(segmentItems) : null

    segments.push({
      segmentIndex: i,
      items: segmentItems,
      phase1Json: phase1JSON,
    })
  }

  // 8. Store all segments in single transaction (atomic operation)
  if (segments.length > 0) {
    await storeSegmentsBatch(userId, segments)
    await upsertJobFreshness('feed-presort', scope, inputHash, new Date())
  } else {
    logger.error('No valid segments generated for user', {
      userId: userId.toString(),
      candidatesFetched: ranked.length,
      itemsAfterDedup: deduplicated.length,
      presortedItems: presortedItems.length,
    })
  }

  const metrics: FeedPresortMetrics = {
    userId,
    candidatesFetched: ranked.length,
    itemsAfterDedup: deduplicated.length,
    segmentsGenerated: segments.length,
    itemsSkipped: skippedCount + duplicateCount,
    durationMs: Date.now() - startTime,
  }

  // Log metrics for observability
  if (skippedCount > 0 || duplicateCount > 0) {
    logger.info('Feed presort completed with warnings', {
      ...metrics,
      userId: metrics.userId.toString(),
      duplicateCount,
      skippedCount,
    })
  }

  return metrics
}

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
        const metrics = await presortFeedForUser(options.userId, options)
        return { 
          processedUsers: 1,
          totalCandidates: metrics.candidatesFetched,
          totalSegments: metrics.segmentsGenerated,
          totalSkipped: metrics.itemsSkipped,
        }
      }

      // Batch processing with jitter to prevent thundering herd
      // Jitter is proportional to job interval (10% of 30min = 3min max)
      if (!options.noJitter && process.env.JOB_RUNNER !== 'cli') {
        const jitter = Math.floor(Math.random() * DEFAULT_CONFIG.maxJitterMs)
        await new Promise((resolve) => setTimeout(resolve, jitter))
      }

      let lastId: bigint | null = null
      let processedUsers = 0
      let totalCandidates = 0
      let totalSegments = 0
      let totalSkipped = 0
      let totalDuration = 0
      let skippedUsers = 0

      // Pagination through all users
      for (;;) {
        const users: Array<{ id: bigint }> = await prisma.user.findMany({
          select: { id: true },
          orderBy: { id: 'asc' },
          take: options.batchSize ?? DEFAULT_CONFIG.batchSize,
          ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
        })

        if (!users.length) break
        lastId = users[users.length - 1]!.id

        // Process users with controlled concurrency
        const chunks = []
        for (let i = 0; i < users.length; i += DEFAULT_CONFIG.maxConcurrent) {
          chunks.push(users.slice(i, i + DEFAULT_CONFIG.maxConcurrent))
        }

        for (const chunk of chunks) {
          const results = await Promise.all(
            chunk.map((user: { id: bigint }) => presortFeedForUser(user.id, options))
          )
          
          processedUsers += chunk.length
          for (const metrics of results) {
            totalCandidates += metrics.candidatesFetched
            totalSegments += metrics.segmentsGenerated
            totalSkipped += metrics.itemsSkipped
            totalDuration += metrics.durationMs
            if (metrics.candidatesFetched === 0 && metrics.segmentsGenerated === 0) {
              skippedUsers += 1
            }
          }
        }
      }

      const avgDuration = processedUsers > 0 ? Math.round(totalDuration / processedUsers) : 0

      console.log('[feed-presort] Summary', {
        processedUsers,
        skippedUsers,
        totalCandidates,
        totalSegments,
        totalSkipped,
        avgDurationMs: avgDuration
      })

      return { 
        processedUsers,
        totalCandidates,
        totalSegments,
        totalSkipped,
        avgDurationMs: avgDuration,
      }
    }
  )
}
