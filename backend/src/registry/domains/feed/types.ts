// Internal pipeline types (not API contracts).
import type { CompatibilitySummary } from '../../../services/compatibility/compatibilityService.js'

export type ViewerContext = {
  userId: bigint | null
  take: number
  cursorId: bigint | null
  debug?: boolean
  seed?: number | null
  markSeen?: boolean
}

export type FeedMediaRecord = {
  id: bigint
  type: string
  url: string | null
  thumbUrl: string | null
  width: number | null
  height: number | null
  durationSec: number | null
  storageKey: string | null
  variants: unknown
}

export type FeedPresentation = {
  mode: 'single' | 'mosaic' | 'question' | 'highlight'
  accent?: 'match' | 'boost' | 'new' | null
}

export type FeedPostCandidate = {
  id: bigint
  text: string | null
  createdAt: Date
  user: { id: bigint; profile: { displayName: string | null } | null }
  media?: Array<{ order: number; media: FeedMediaRecord }>
  mediaType?: 'text' | 'image' | 'video' | 'mixed'
  presentation?: FeedPresentation
  score?: number
}

export type FeedSuggestionCandidate = {
  userId: bigint
  displayName: string | null
  bio: string | null
  locationText: string | null
  intent: string | null
  source?: 'match' | 'suggested'
  compatibility?: CompatibilitySummary | null
  matchScore?: number | null
  presentation?: FeedPresentation
  score?: number
}

export type FeedQuestionCandidate = {
  id: bigint
  quizId: bigint
  quizTitle: string | null
  prompt: string
  options: Array<{ id: bigint; label: string; value: string; order: number }>
  order: number
  presentation?: FeedPresentation
}

export type FeedPostResult = {
  items: FeedPostCandidate[]
  nextCursorId: bigint | null
}

export type FeedCandidateSet = {
  posts: FeedPostCandidate[]
  suggestions: FeedSuggestionCandidate[]
  questions?: FeedQuestionCandidate[]
  debug?: FeedDebugSummary
}

export type FeedItem = {
  type: 'post' | 'suggestion' | 'question'
  post?: FeedPostCandidate
  suggestion?: FeedSuggestionCandidate
  question?: FeedQuestionCandidate
  actorId: bigint
  source: 'post' | 'match' | 'suggested' | 'question'
  tier: 'self' | 'following' | 'followers' | 'everyone'
  presentation?: FeedPresentation
}

export type FeedStats = {
  likeCount?: number
  commentCount?: number
  ratingAverage?: number
  ratingCount?: number
  myRating?: RatingValues | null
}

// Re-export for convenience (single source: compatibilityService.ts)
export type { CompatibilitySummary }

export type RatingValues = {
  attractive: number
  smart: number
  funny: number
  interesting: number
}

export type FeedDebugSummary = {
  seed?: number | null
  candidates: {
    postIds: string[]
    suggestionUserIds: string[]
    questionIds?: string[]
    counts: { posts: number; suggestions: number; questions?: number }
  }
  dedupe: {
    postDuplicates: number
    suggestionDuplicates: number
    questionDuplicates?: number
    crossSourceRemoved: number
  }
  seen: {
    windowHours: number
    demotedPosts: number
    demotedSuggestions: number
  }
  ranking?: {
    sourceSequence: Array<'post' | 'match' | 'suggested'>
    actorCounts: Record<string, number>
    tierSequence?: Array<'self' | 'following' | 'followers' | 'everyone'>
    tierCounts?: Record<'self' | 'following' | 'followers' | 'everyone', number>
  }
}
