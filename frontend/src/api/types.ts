import type { components } from './openapi'

/**
 * Domain Types
 *
 * Frontend-adapted domain models transformed from API types.
 * These types represent the frontend's view of domain entities.
 *
 * For raw API types, see api/contracts.ts
 */

/** Universal ID type used throughout the frontend */
export type Id = string | number

/**
 * Rating scores (2-10 scale from API)
 * These are transformed to/from UI rating values (1-5 scale) in components
 */
export type RatingScores = {
  attractive: number
  smart: number
  funny: number
  interesting: number
}

export type RatingSummary = {
  count: number
  avg: Partial<RatingScores>
  mine?: RatingScores | null
}

export type CompatibilitySummary = components['schemas']['CompatibilitySummary']

export type FeedMedia = {
  id: Id
  type: MediaType
  url: string
  thumbUrl?: string | null
  width?: number | null
  height?: number | null
  durationSec?: number | null
}

/**
 * Feed Card Kinds
 *
 * Card kinds represent UI shapes, not semantic reasons.
 * Each kind maps to a specific card component renderer.
 *
 * Design Principle: "What the user sees" not "Why it was shown"
 *
 * Transitional: 'suggestion' is deprecated and should map to 'profile' or 'match'
 * based on source discriminator in adapter.
 */
export type FeedCardKind =
  | 'profile' // Profile card (from suggestions with source: "suggested")
  | 'post' // Post card
  | 'media' // Media-focused card (future)
  | 'match' // Match card (from suggestions with source: "match")
  | 'question' // Quiz question card (future)
  | 'highlight' // Highlighted content card (future)
  | 'ad' // Advertisement card (future)
  | 'suggestion' // DEPRECATED: Use 'profile' or 'match' instead

export type FeedCardStats = {
  likeCount?: number
  commentCount?: number
  ratingAverage?: number
  ratingCount?: number
  myRating?: RatingScores | null
}

export type FeedCardActor = {
  id: Id
  name: string
  avatarUrl?: string
  presence?: 'online' | 'away' | 'offline'
  badges?: string[]
  locationText?: string
  intent?: DatingIntent
  age?: number
  compatibility?: CompatibilitySummary | null
}

export type FeedCardContent = {
  id: string
  title?: string
  body?: string
  tags?: string[]
  createdAt?: string
}

export type FeedCardPresentation = {
  mode: 'single' | 'mosaic' | 'question' | 'highlight'
  heroIndex?: number
  overlayStyle?: 'light' | 'dark'
  accent?: 'match' | 'boost' | 'new' | null
}

export type FeedCardComments = {
  intent?: 'ask' | 'react' | 'respond'
  preview?: Array<{
    id: string
    text: string
    author?: {
      id: string
      name: string
      avatarUrl?: string
    }
  }>
  count?: number // Total comment count
}

export type FeedCardFlags = {
  personalized?: boolean
  boostLevel?: number
  reason?: string
  optimistic?: boolean
  failed?: boolean // Set to true when optimistic post fails to confirm
}

export type FeedCardQuestionOption = {
  id: string
  label: string
  value: string
}

export type FeedCard = {
  id: string
  kind: FeedCardKind
  // subtype removed - kind is now canonical and backend-driven
  actor?: FeedCardActor
  content?: FeedCardContent
  heroUrl?: string
  media?: FeedMedia[]
  presentation?: FeedCardPresentation
  stats?: FeedCardStats
  comments?: FeedCardComments
  flags?: FeedCardFlags
  question?: { id: string; quizId?: Id; prompt: string; options: FeedCardQuestionOption[] }
}

export type FeedResponse = {
  items: FeedCard[]
  nextCursor: string | null
  hasMorePosts?: boolean
}

// Re-export schema enums/types for convenience
export type Visibility = components['schemas']['Visibility']
export type MediaType = components['schemas']['MediaType']
export type ProfileMedia = { id: Id; url: string; type?: MediaType; thumbUrl?: string | null }

export type SwipeAction = components['schemas']['SwipeAction']
export type LikeAction = SwipeAction
export type Gender = components['schemas']['Gender']
export type DatingIntent = components['schemas']['DatingIntent']
export type AccessStatus = components['schemas']['AccessStatus']
export type LikeBody = { toUserId: Id; action: LikeAction }
export type RateBody = components['schemas']['RateBody']

export type ProfileAccessInfo = {
  status: AccessStatus
  requestId?: Id | null
  hasPrivatePosts: boolean
  hasPrivateMedia: boolean
}

export type ProfilePost = {
  id: Id
  userId: Id
  text?: string
  createdAt: string
  visibility?: Visibility
  author?: {
    id: Id
    displayName: string | null
    avatarUrl: string | null
  }
  media?: ProfileMedia[]
}

export type ProfileResponse = {
  userId: Id
  name: string
  age?: number
  birthdate?: string
  locationText?: string
  intent?: DatingIntent
  gender?: Gender
  isVisible?: boolean
  bio?: string
  heroUrl?: string
  avatarUrl?: string
  media?: ProfileMedia[]
  posts?: ProfilePost[]
  access?: ProfileAccessInfo | null
  ratings?: RatingSummary
  compatibility?: CompatibilitySummary | null
}
