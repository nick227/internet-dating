import type { ApiFeedResponse, ApiMedia, ApiProfileResponse } from './contracts'
import type {
  FeedCard,
  FeedCardPresentation,
  FeedResponse,
  FeedCardStats,
  DatingIntent,
  FeedMedia,
  Gender,
  MediaType,
  ProfileMedia,
  ProfileResponse,
  ProfilePost,
  RatingScores,
  RatingSummary,
} from './types'
import { toAge } from '../core/format/toAge'
import { feedLayoutConfig } from '../core/feed/layoutConfig'

type ApiFeedStats = {
  ratingAverage?: number | null
  ratingCount?: number | null
  myRating?: RatingScores | null
}

type ApiFeedMedia = {
  id: string | number
  type?: string | null
  url?: string | null
  thumbUrl?: string | null
  width?: number | null
  height?: number | null
  durationSec?: number | null
}

type ApiFeedMediaEntry = {
  order?: number | null
  media: ApiFeedMedia
}

type ApiFeedPresentation = {
  mode?: 'single' | 'mosaic' | 'question' | 'highlight'
  accent?: 'match' | 'boost' | 'new' | null
} | null

type ApiRatings = {
  count?: number | null
  avg?: Partial<RatingScores> | null
  mine?: RatingScores | null
}

const DATING_INTENTS = new Set<DatingIntent>([
  'UNSPECIFIED',
  'FRIENDS',
  'CASUAL',
  'LONG_TERM',
  'MARRIAGE',
])
const GENDERS = new Set<Gender>(['UNSPECIFIED', 'MALE', 'FEMALE', 'NONBINARY', 'OTHER'])

function toDatingIntent(value?: string | null): DatingIntent | undefined {
  if (!value) return undefined
  return DATING_INTENTS.has(value as DatingIntent) ? (value as DatingIntent) : undefined
}

function toGender(value?: string | null): Gender | undefined {
  if (!value) return undefined
  return GENDERS.has(value as Gender) ? (value as Gender) : undefined
}

/**
 * Feed Adapter
 *
 * Transforms backend feed payload into frontend FeedCard types.
 *
 * Card Kind Normalization:
 * - Backend uses semantic types: "post" | "suggestion"
 * - Frontend uses UI-driven kinds: "post" | "match" | "profile" | "question" | etc.
 * - suggestion.source is a discriminator: "match" → kind: "match", "suggested" → kind: "profile"
 *
 * Note: "suggestion" as a card kind is transitional and should be removed long-term.
 * "Suggestion" is a reason (why shown), not a UI shape (what user sees).
 */

const DEV = Boolean(import.meta.env?.DEV)

const isFeedDebugEnabled = () => {
  if (!DEV || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('debug:feed') === '1'
  } catch {
    return false
  }
}

const feedDebugLog = (...args: unknown[]) => {
  if (isFeedDebugEnabled()) {
    console.log(...args)
  }
}

function validateFeedItem(item: ApiFeedResponse['items'][0], index: number): void {
  if (!DEV) return

  if (!item.type) {
    console.warn(`[feed:adapter] Item at index ${index} missing type field`)
  }

  if (item.type === 'post' && !item.post) {
    console.warn(
      `[feed:adapter] Item at index ${index} has type "post" but post field is null/undefined`
    )
  }

  if (item.type === 'suggestion' && !item.suggestion) {
    console.warn(
      `[feed:adapter] Item at index ${index} has type "suggestion" but suggestion field is null/undefined`
    )
  }

  if (item.type === 'question' && !item.question) {
    console.warn(
      `[feed:adapter] Item at index ${index} has type "question" but question field is null/undefined`
    )
  }
}

function validateFeedPost(
  post: NonNullable<ApiFeedResponse['items'][0]['post']>,
  postId: string | number
): void {
  if (!DEV) return

  if (!post.user?.id) {
    console.warn(`[feed:adapter] Post ${postId} missing user.id`)
  }

  if (!post.user?.profile?.displayName) {
    console.warn(
      `[feed:adapter] Post ${postId} missing user.profile.displayName (using fallback "Unknown")`
    )
  }
}

function validateFeedSuggestion(
  suggestion: NonNullable<ApiFeedResponse['items'][0]['suggestion']>,
  userId: string | number
): void {
  if (!DEV) return

  if (!suggestion.displayName) {
    feedDebugLog(
      `[feed:adapter] Suggestion ${userId} missing displayName (using fallback "Unknown")`
    )
  }

  // Check for expected but missing fields
  const hasMedia = 'media' in suggestion
  if (!hasMedia) {
    console.debug(
      `[feed:adapter] Suggestion ${userId} missing media field (not yet supported by backend)`
    )
  }

  const hasHeroUrl = 'heroUrl' in suggestion
  if (!hasHeroUrl) {
    feedDebugLog(
      `[feed:adapter] Suggestion ${userId} missing heroUrl field (not yet supported by backend)`
    )
  }

  const hasStats = 'stats' in suggestion
  if (!hasStats) {
    feedDebugLog(
      `[feed:adapter] Suggestion ${userId} missing stats field (not yet supported by backend)`
    )
  }

  const hasAvatarUrl = 'avatarUrl' in suggestion
  if (!hasAvatarUrl) {
    feedDebugLog(
      `[feed:adapter] Suggestion ${userId} missing avatarUrl - header rendering may be broken`
    )
  }
}

/**
 * Phase-1 Feed Response (lite format)
 * Minimal fields for fast initial load
 */
type Phase1FeedResponse = {
  items: Array<{
    id: string
    kind: 'post' | 'profile' | 'question'
    actor: {
      id: string
      name: string
      avatarUrl: string | null
    }
    textPreview: string | null
    createdAt: number // Epoch ms
    presentation?: { mode: string; accent?: string | null } | null
  }>
  nextCursor?: string | null
  nextCursorId?: string | null
}

/**
 * Check if response is Phase-1 format (lite)
 */
function isPhase1Response(res: unknown): res is Phase1FeedResponse {
  if (!res || typeof res !== 'object') return false
  const r = res as Record<string, unknown>
  if (!Array.isArray(r.items)) return false
  if (r.items.length === 0) return false
  const firstItem = r.items[0] as Record<string, unknown>
  // Phase-1 has "kind" and "actor", Phase-2 has "type" and nested "post"/"suggestion"
  return 'kind' in firstItem && 'actor' in firstItem && !('type' in firstItem)
}

/**
 * Adapt Phase-1 response (lite format) to FeedResponse
 */
function adaptPhase1Response(res: Phase1FeedResponse): FeedResponse {
  const items: FeedCard[] = res.items.map((item) => {
    const baseCard: FeedCard = {
      id: item.id,
      kind: item.kind === 'profile' ? 'profile' : item.kind === 'question' ? 'question' : 'post',
      actor: {
        id: item.actor.id,
        name: item.actor.name,
        avatarUrl: item.actor.avatarUrl ?? undefined,
      },
      content: {
        id: item.id,
        body: item.textPreview ?? undefined,
        createdAt: new Date(item.createdAt).toISOString(),
      },
      // Phase-1: Minimal fields only
      // Media, stats, compatibility will be loaded in Phase-2
      media: [],
      presentation: item.presentation
        ? {
            mode: (item.presentation.mode as 'single' | 'mosaic' | 'question' | 'highlight') ?? 'single',
            accent: (item.presentation.accent as 'match' | 'boost' | 'new' | null) ?? null,
          }
        : undefined,
    }

    return baseCard
  })

  return {
    items,
    nextCursor: res.nextCursorId ?? res.nextCursor ?? null,
  }
}

export function adaptFeedResponse(res: ApiFeedResponse | Phase1FeedResponse): FeedResponse {
  const resItems = (res as { items?: unknown[] }).items
  feedDebugLog('[DEBUG] adaptFeedResponse: Starting', {
    isPhase1: isPhase1Response(res),
    hasItems: Array.isArray(resItems),
    itemsLength: resItems?.length,
  })
  
  // Check if this is Phase-1 format (lite)
  if (isPhase1Response(res)) {
    feedDebugLog('[DEBUG] adaptFeedResponse: Detected Phase-1 format, adapting...')
    const result = adaptPhase1Response(res)
    feedDebugLog('[DEBUG] adaptFeedResponse: Phase-1 adaptation complete', { itemsCount: result.items.length, nextCursor: result.nextCursor })
    return result
  }
  
  feedDebugLog('[DEBUG] adaptFeedResponse: Detected Phase-2 format, adapting...')

  // Phase-2 format (full response)
  const items: FeedCard[] = []
  let position = 0

  // Items are already ranked and interleaved by backend
  for (let i = 0; i < res.items.length; i++) {
    const item = res.items[i]
    validateFeedItem(item, i)

    if (item.type === 'post' && item.post) {
      const p = item.post
      validateFeedPost(p, p.id)

      const media = toFeedMediaFromEntries(p.media as ApiFeedMediaEntry[])
      const mediaArray = p.media.map(m => m.media)
      const apiPresentation =
        'presentation' in p ? (p as typeof p & { presentation?: ApiFeedPresentation }).presentation : null
      const presentation = toFeedPresentation(apiPresentation) ?? toPresentation(media, position)

      // Type-safe field access with fallbacks
      const stats =
        'stats' in p ? toFeedStats((p as typeof p & { stats?: ApiFeedStats }).stats) : undefined

      // Extract comments if present (backend includes them but not in OpenAPI schema)
      const apiComments = 'comments' in p ? (p as typeof p & { comments?: { preview?: Array<{ id: string | number; text: string }> } }).comments : undefined
      const comments = apiComments?.preview
        ? {
            preview: apiComments.preview.map(c => ({
              id: String(c.id),
              text: c.text,
            })),
          }
        : undefined

      items.push({
        id: `post-${p.id}`,
        kind: 'post',
        actor: {
          id: p.user.id,
          name: p.user.profile?.displayName ?? 'Unknown',
          // avatarUrl not available in FeedPost schema - requires backend update
        },
        content: {
          id: `post-${p.id}`,
          body: p.text ?? undefined,
          createdAt: p.createdAt,
        },
        heroUrl: media[0]?.url ?? pickMediaUrl(mediaArray),
        media,
        presentation,
        stats,
        comments,
      })
      position += 1
    } else if (item.type === 'suggestion' && item.suggestion) {
      const s = item.suggestion
      validateFeedSuggestion(s, s.userId)

      // Normalize card kind based on source discriminator
      // source: "match" → kind: "match" (renders MatchCard)
      // source: "suggested" | null → kind: "profile" (renders ProfileCard)
      // "suggestion" as a kind is transitional and should be removed
      const source = s.source ?? null
      const isMatch = source === 'match'
      const cardKind: FeedCard['kind'] = isMatch ? 'match' : 'profile'
      const cardId = isMatch ? `match-${s.userId}` : `profile-${s.userId}`

      // Type-safe field access with fallbacks
      const media =
        'media' in s ? toFeedMedia((s as typeof s & { media?: ApiFeedMedia[] }).media) : undefined
      const heroUrl =
        'heroUrl' in s
          ? ((s as typeof s & { heroUrl?: string | null }).heroUrl ??
            media?.[0]?.url ??
            media?.[0]?.thumbUrl ??
            undefined)
          : (media?.[0]?.url ?? media?.[0]?.thumbUrl ?? undefined)
      const compatibility = s.compatibility ?? null
      const stats =
        'stats' in s ? toFeedStats((s as typeof s & { stats?: ApiFeedStats }).stats) : undefined
      const avatarUrl =
        'avatarUrl' in s
          ? ((s as typeof s & { avatarUrl?: string | null }).avatarUrl ?? undefined)
          : undefined

      const apiPresentation =
        'presentation' in s ? (s as typeof s & { presentation?: ApiFeedPresentation }).presentation : null
      const fallbackPresentation = toPresentation(media, position, isMatch ? 'match' : undefined)
      const presentation =
        toFeedPresentation(apiPresentation, isMatch ? 'match' : undefined) ?? fallbackPresentation

      items.push({
        id: cardId,
        kind: cardKind,
        // subtype removed - kind is now canonical
        actor: {
          id: s.userId,
          name: s.displayName ?? 'Unknown',
          avatarUrl, // May be undefined - requires backend update
          locationText: s.locationText ?? undefined,
          intent: toDatingIntent(s.intent ?? null),
          compatibility,
        },
        content: {
          id: cardId,
          body: s.bio ?? undefined,
          tags: isMatch ? ['New match'] : ['Suggested for you'],
        },
        heroUrl,
        media,
        presentation,
        stats, // May be undefined - requires backend update
        flags: {
          // Store source for analytics/logging (reason, not UI shape)
          reason: source === 'match' ? 'match' : source === 'suggested' ? 'suggested' : undefined,
        },
      })
      position += 1
    } else if (item.type === 'question' && item.question) {
      const q = item.question
      const questionId = `question-${q.id}`
      const apiPresentation =
        'presentation' in q ? (q as typeof q & { presentation?: ApiFeedPresentation }).presentation : null

      items.push({
        id: questionId,
        kind: 'question',
        content: {
          id: questionId,
          title: q.quizTitle ?? 'Quiz',
        },
        presentation: toFeedPresentation(apiPresentation) ?? { mode: 'question' },
        question: {
          id: String(q.id),
          quizId: q.quizId,
          prompt: q.prompt,
          options: (q.options ?? []).map(option => ({
            id: String(option.id),
            label: option.label,
            value: option.value,
          })),
        },
      })
      position += 1
    } else {
      // Fail fast on unknown card types
      if (DEV) {
        console.error(`[feed:adapter] Unknown or invalid feed item type at index ${i}:`, item)
      }
      // Skip invalid items in production to prevent UI crashes
      continue
    }
  }

  const result = {
    items,
    nextCursor: res.nextCursorId == null ? null : String(res.nextCursorId),
    hasMorePosts: res.hasMorePosts ?? undefined,
  }
  feedDebugLog('[DEBUG] adaptFeedResponse: Phase-2 adaptation complete', { itemsCount: result.items.length, nextCursor: result.nextCursor })
  return result
}

export function adaptProfileResponse(res: ApiProfileResponse): ProfileResponse {
  if (!res.profile) throw new Error('Profile not found')

  const posts = mapProfilePosts(res.posts)
  const media = flattenMedia(res.posts)
  const heroUrl = res.profile.heroUrl ?? media[0]?.url ?? media[0]?.thumbUrl ?? undefined
  const access = res.access
    ? {
        status: res.access.status,
        requestId: res.access.requestId ?? null,
        hasPrivatePosts: res.access.hasPrivatePosts,
        hasPrivateMedia: res.access.hasPrivateMedia,
      }
    : null
  const ratings = toRatings((res as ApiProfileResponse & { ratings?: ApiRatings }).ratings)
  const compatibility =
    (res as ApiProfileResponse & { compatibility?: ProfileResponse['compatibility'] })
      .compatibility ?? null

  return {
    userId: res.profile.userId,
    name: res.profile.displayName ?? '',
    age: toAge(res.profile.birthdate),
    birthdate: res.profile.birthdate ?? undefined,
    locationText: res.profile.locationText ?? undefined,
    intent: toDatingIntent(res.profile.intent ?? null),
    gender: toGender(res.profile.gender ?? null),
    isVisible: res.profile.isVisible ?? undefined,
    bio: res.profile.bio ?? undefined,
    avatarUrl: res.profile.avatarUrl ?? undefined,
    heroUrl,
    media,
    posts,
    access,
    ratings,
    compatibility,
  }
}

function toFeedStats(stats?: ApiFeedStats | null): FeedCardStats | undefined {
  if (!stats) return undefined
  if (stats.ratingAverage == null && stats.ratingCount == null && !stats.myRating) return undefined
  return {
    ratingAverage: stats.ratingAverage ?? undefined,
    ratingCount: stats.ratingCount ?? undefined,
    myRating: stats.myRating ?? null,
  }
}

function toPresentation(
  media?: FeedMedia[] | null,
  index = 0,
  accent?: FeedCardPresentation['accent']
): FeedCardPresentation {
  const canMosaic = Boolean(media && media.length >= feedLayoutConfig.mosaicMinMedia)
  const mode: FeedCardPresentation['mode'] =
    canMosaic && index % feedLayoutConfig.mosaicEveryNth === 0 ? 'mosaic' : 'single'
  const next: FeedCardPresentation = { mode }
  if (accent) {
    next.accent = accent
  }
  return next
}

function toFeedPresentation(
  value?: ApiFeedPresentation,
  fallbackAccent?: FeedCardPresentation['accent']
): FeedCardPresentation | undefined {
  if (!value || !value.mode) return undefined
  if (value.accent != null) {
    return { mode: value.mode, accent: value.accent ?? undefined }
  }
  if (fallbackAccent) {
    return { mode: value.mode, accent: fallbackAccent }
  }
  return { mode: value.mode }
}

function toFeedMedia(items?: ApiFeedMedia[] | null): FeedMedia[] | undefined {
  if (!items?.length) return undefined
  // Single pass: filter and map in one loop
  const result: FeedMedia[] = []
  for (const item of items) {
    if (item?.url) {
      // Preserve media type (IMAGE, VIDEO, or AUDIO) or default to IMAGE
      const mediaType: MediaType = (item.type === 'VIDEO' || item.type === 'AUDIO' || item.type === 'IMAGE' || item.type === 'EMBED')
        ? item.type
        : 'IMAGE'
      result.push({
        id: item.id,
        type: mediaType,
        url: item.url ?? '',
        thumbUrl: item.thumbUrl ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
        durationSec: item.durationSec ?? null,
      })
    }
  }
  return result.length > 0 ? result : undefined
}

function toFeedMediaFromEntries(entries?: ApiFeedMediaEntry[]): FeedMedia[] {
  if (!entries?.length) return []
  // Backend must guarantee ordering - frontend should not sort unless explicitly required
  // Extract media in order (single pass)
  const media: ApiFeedMedia[] = []
  for (const entry of entries) {
    media.push(entry.media)
  }
  return toFeedMedia(media) ?? []
}

function toRatings(ratings?: ApiRatings | null): RatingSummary | undefined {
  if (!ratings) return undefined
  return {
    count: ratings.count ?? 0,
    avg: ratings.avg ?? {},
    mine: ratings.mine ?? null,
  }
}

function flattenMedia(posts: { media: { media: ApiMedia }[] }[]): ProfileMedia[] {
  const seen = new Set<string>()
  const items: ProfileMedia[] = []

  for (const post of posts) {
    for (const entry of post.media) {
      const media = entry.media
      if (media.type === 'EMBED') continue
      const id = String(media.id)
      if (seen.has(id)) continue
      seen.add(id)
      items.push({
        id,
        url: media.url,
        thumbUrl: media.thumbUrl ?? undefined,
        type: media.type,
      })
    }
  }

  return items
}

function pickMediaUrl(media: ApiMedia[]) {
  if (!media.length) return undefined
  const first = media[0]
  return first.thumbUrl ?? first.url ?? undefined
}

function mapProfilePosts(posts: ApiProfileResponse['posts']): ProfilePost[] {
  return posts.map(post => ({
    id: post.id,
    text: post.text ?? undefined,
    createdAt: post.createdAt,
    visibility: post.visibility,
    media: post.media.map(entry => ({
      id: entry.media.id,
      url: entry.media.url,
      thumbUrl: entry.media.thumbUrl ?? undefined,
      type: entry.media.type,
    })),
  }))
}
