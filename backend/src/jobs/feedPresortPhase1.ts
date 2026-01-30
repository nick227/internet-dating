import type { PresortedFeedItem, PresortedFeedLeafItem } from '../services/feed/presortedFeedService.js'

type Phase1LeafItem = {
  id: string
  kind: 'post' | 'profile' | 'question'
  actor: {
    id: string
    name: string
    avatarUrl: string | null
  }
  textPreview: string | null
  createdAt: number
  presentation: {
    mode: 'single' | 'mosaic' | 'grid' | 'question' | 'highlight'
    accent?: 'match' | 'boost' | 'new' | null
  } | null
}

type Phase1Card = {
  cardType: 'single' | 'grid'
  presentation?: {
    mode: 'single' | 'mosaic' | 'grid' | 'question' | 'highlight'
    accent?: 'match' | 'boost' | 'new' | null
  } | null
  items: Phase1LeafItem[]
}

function toPhase1Leaf(item: PresortedFeedItem): Phase1LeafItem {
  if (item.type === 'grid') {
    throw new Error('Grid items must be converted via toPhase1Card')
  }

  return {
    id: item.id,
    kind: item.type === 'post' ? 'post' : item.type === 'suggestion' ? 'profile' : 'question',
    actor: {
      id: String(item.actorId),
      name: item.actorName ?? 'User',
      avatarUrl: item.actorAvatarUrl ?? null,
    },
    textPreview: item.textPreview ?? null,
    createdAt: item.createdAt,
    presentation: item.presentation ?? null,
  }
}

function toPhase1Card(item: PresortedFeedItem): Phase1Card {
  if (item.type === 'grid') {
    return {
      cardType: 'grid',
      presentation: item.presentation ?? { mode: 'grid' },
      items: item.items.map((child) => toPhase1Leaf(child)),
    }
  }

  return {
    cardType: 'single',
    presentation: item.presentation ?? null,
    items: [toPhase1Leaf(item)],
  }
}

// Cursor should always reflect the most recent post ID, never the grid wrapper.
function getNextPostCursorId(items: PresortedFeedItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item.type === 'post') {
      return item.id
    }
    if (item.type === 'grid') {
      for (let j = item.items.length - 1; j >= 0; j -= 1) {
        const child = item.items[j]
        if (child.type === 'post') return child.id
      }
    }
  }
  return null
}

/**
 * Generate Phase-1 JSON shape (minimal fields for fast initial load)
 */
export function generatePhase1JSON(items: PresortedFeedItem[]): string {
  const phase1Data = {
    items: items.slice(0, 2).map((item) => toPhase1Card(item)),
    nextCursorId: getNextPostCursorId(items),
  }

  // Phase-1 HTML embedding guardrails: Cap inline JSON to <8KB
  const jsonString = JSON.stringify(phase1Data)
  if (jsonString.length > 8 * 1024) {
    // Drop to API fallback if exceeded (return empty for now, will fallback)
    return JSON.stringify({ items: [], nextCursorId: null })
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
    presentation?: { mode: 'single' | 'mosaic' | 'grid' | 'question' | 'highlight'; accent?: 'match' | 'boost' | 'new' | null }
    score?: number
  },
  actorName?: string | null,
  actorAvatarUrl?: string | null
): PresortedFeedLeafItem {
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
