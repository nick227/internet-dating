import type { PresortedFeedItem } from '../services/feed/presortedFeedService.js'

/**
 * Generate Phase-1 JSON shape (minimal fields for fast initial load)
 */
export function generatePhase1JSON(items: PresortedFeedItem[]): string {
  const phase1Data = {
    items: items.slice(0, 2).map((item) => {
      return {
        id: item.id,
        kind: item.type === 'post' ? 'post' : item.type === 'suggestion' ? 'profile' : 'question',
        actor: {
          id: String(item.actorId),
          name: item.actorName ?? 'User',
          avatarUrl: item.actorAvatarUrl ?? null,
        },
        textPreview: item.textPreview ?? null, // Pre-truncated
        createdAt: item.createdAt, // Epoch ms
        presentation: item.presentation ?? null,
      }
    }),
    nextCursor: items[2]?.id ?? null,
  }

  // Phase-1 HTML embedding guardrails: Cap inline JSON to <8KB
  const jsonString = JSON.stringify(phase1Data)
  if (jsonString.length > 8 * 1024) {
    // Drop to API fallback if exceeded (return empty for now, will fallback)
    return JSON.stringify({ items: [], nextCursor: null })
  }

  return jsonString
}

/**
 * Convert FeedItem to PresortedFeedItem format
 */
export function convertToPresortedItem(
  item: {
    type: 'post' | 'suggestion' | 'question'
    id?: bigint
    actorId: bigint
    source: 'post' | 'match' | 'suggested' | 'question'
    post?: { id: bigint; text: string | null; createdAt: Date; user?: { id: bigint; profile?: { displayName: string | null } | null } }
    suggestion?: { userId: bigint; displayName: string | null }
    question?: { id: bigint }
    mediaType?: 'text' | 'image' | 'video' | 'mixed'
    presentation?: { mode: 'single' | 'mosaic' | 'question' | 'highlight'; accent?: 'match' | 'boost' | 'new' | null }
    score?: number
  },
  actorName?: string | null,
  actorAvatarUrl?: string | null
): PresortedFeedItem {
  let id: string
  let createdAt: number
  let textPreview: string | undefined

  if (item.type === 'post' && item.post) {
    id = String(item.post.id)
    createdAt = item.post.createdAt.getTime()
    textPreview = item.post.text ? (item.post.text.length > 150 ? item.post.text.slice(0, 150) + '...' : item.post.text) : undefined
  } else if (item.type === 'suggestion' && item.suggestion) {
    id = String(item.suggestion.userId)
    createdAt = Date.now() // Suggestions don't have createdAt, use current time
  } else if (item.type === 'question' && item.question) {
    id = String(item.question.id)
    createdAt = Date.now() // Questions don't have createdAt in this context
  } else {
    throw new Error(`Invalid item type: ${item.type}, missing required data`)
  }

  return {
    type: item.type,
    id,
    score: item.score ?? 0,
    actorId: item.actorId,
    source: item.source,
    mediaType: item.mediaType,
    presentation: item.presentation,
    createdAt,
    actorName: actorName ?? undefined,
    actorAvatarUrl: actorAvatarUrl ?? undefined,
    textPreview,
  }
}
