import { feedConfig } from '../registry/domains/feed/config.js'
import { prisma } from '../lib/prisma/client.js'
import type { FeedCandidateSet, ViewerContext } from '../registry/domains/feed/types.js'

const SCORE_WEIGHTS = feedConfig.scoring.weights

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function recencyScore(createdAt: Date) {
  const hours = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60))
  // 1 / log(2 + hours) keeps score in (0,1] without infinity at t=0.
  const score = 1 / Math.log(2 + hours)
  return clampScore(score)
}

async function fetchPostMediaTypes(postIds: bigint[]) {
  if (!postIds.length) return new Map<bigint, 'text' | 'image' | 'video' | 'mixed'>()
  const rows = await prisma.postMedia.findMany({
    where: { postId: { in: postIds } },
    select: { postId: true, media: { select: { type: true } } },
  })

  const flagsByPostId = new Map<bigint, { hasImage: boolean; hasVideo: boolean }>()
  for (const row of rows) {
    const flags = flagsByPostId.get(row.postId) ?? { hasImage: false, hasVideo: false }
    if (row.media.type === 'VIDEO' || row.media.type === 'EMBED') flags.hasVideo = true
    if (row.media.type === 'IMAGE') flags.hasImage = true
    flagsByPostId.set(row.postId, flags)
  }

  const typeByPostId = new Map<bigint, 'text' | 'image' | 'video' | 'mixed'>()
  for (const postId of postIds) {
    const flags = flagsByPostId.get(postId)
    if (!flags) {
      typeByPostId.set(postId, 'text')
    } else if (flags.hasVideo && flags.hasImage) {
      typeByPostId.set(postId, 'mixed')
    } else if (flags.hasVideo) {
      typeByPostId.set(postId, 'video')
    } else if (flags.hasImage) {
      typeByPostId.set(postId, 'image')
    } else {
      typeByPostId.set(postId, 'text')
    }
  }

  return typeByPostId
}

function dedupeCandidates(candidates: FeedCandidateSet) {
  const questionItems = candidates.questions ?? []
  const dedupedPosts: FeedCandidateSet['posts'] = []
  const seenPostIds = new Set<bigint>()
  const postActorIds = new Set<bigint>()

  for (const post of candidates.posts) {
    if (seenPostIds.has(post.id)) continue
    seenPostIds.add(post.id)
    postActorIds.add(post.user.id)
    dedupedPosts.push(post)
  }

  const dedupedSuggestions: FeedCandidateSet['suggestions'] = []
  const seenSuggestionIds = new Set<bigint>()
  for (const suggestion of candidates.suggestions) {
    if (postActorIds.has(suggestion.userId)) continue
    if (seenSuggestionIds.has(suggestion.userId)) continue
    seenSuggestionIds.add(suggestion.userId)
    dedupedSuggestions.push(suggestion)
  }

  const dedupedQuestions: FeedCandidateSet['questions'] = []
  const seenQuestionIds = new Set<bigint>()
  for (const question of questionItems) {
    if (seenQuestionIds.has(question.id)) continue
    seenQuestionIds.add(question.id)
    dedupedQuestions.push(question)
  }

  return { posts: dedupedPosts, suggestions: dedupedSuggestions, questions: dedupedQuestions }
}

/**
 * Score candidates WITHOUT seen penalty (for presorting)
 * Seen penalty will be applied at request time
 */
export async function scoreCandidatesWithoutSeen(
  ctx: ViewerContext,
  candidates: FeedCandidateSet
): Promise<FeedCandidateSet> {
  const deduped = dedupeCandidates(candidates)
  const postMediaTypes = await fetchPostMediaTypes(deduped.posts.map((post) => post.id))

  // Score posts (without seen penalty)
  const scoredPosts = deduped.posts
    .map((post) => {
      const recency = recencyScore(post.createdAt)
      const affinity = 0
      const quality = 0
      // NO seen penalty - will be applied at request time
      const mediaType = postMediaTypes.get(post.id) ?? 'text'
      const score = recency * SCORE_WEIGHTS.recency + affinity * SCORE_WEIGHTS.affinity + quality * SCORE_WEIGHTS.quality

      return { ...post, mediaType, score: clampScore(score) }
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // Score suggestions (without seen penalty)
  const scoredSuggestions = deduped.suggestions
    .map((suggestion) => {
      const recency = 0
      const affinity = suggestion.source === 'match' ? 1 : suggestion.matchScore ?? 0
      const quality = 0
      // NO seen penalty - will be applied at request time
      const score = recency * SCORE_WEIGHTS.recency + affinity * SCORE_WEIGHTS.affinity + quality * SCORE_WEIGHTS.quality

      return { ...suggestion, score: clampScore(score) }
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return { posts: scoredPosts, suggestions: scoredSuggestions, questions: deduped.questions }
}
