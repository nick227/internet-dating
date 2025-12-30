import { feedConfig } from '../../registry/domains/feed/config.js'
import { fetchFeedSeen } from './feedSeenService.js'
import type { PresortedFeedItem } from './presortedFeedService.js'

/**
 * Apply seen penalty to presorted feed items
 */
export async function applySeenPenalty(
  userId: bigint,
  items: PresortedFeedItem[]
): Promise<PresortedFeedItem[]> {
  const cutoff = Date.now() - feedConfig.seenWindowHours * 60 * 60 * 1000

  // Extract IDs for seen lookup
  const postIds: bigint[] = []
  const suggestionIds: bigint[] = []
  for (const item of items) {
    if (item.type === 'post') {
      postIds.push(BigInt(item.id))
    } else if (item.type === 'suggestion') {
      suggestionIds.push(BigInt(item.id))
    }
  }

  // Fetch seen maps
  const [postSeenMap, suggestionSeenMap] = await Promise.all([
    postIds.length > 0 ? fetchFeedSeen(userId, 'POST', postIds) : Promise.resolve(new Map<bigint, Date>()),
    suggestionIds.length > 0 ? fetchFeedSeen(userId, 'SUGGESTION', suggestionIds) : Promise.resolve(new Map<bigint, Date>()),
  ])

  // Apply seen penalty and re-sort
  const penalized = items.map((item) => {
    let seenAt: Date | undefined
    if (item.type === 'post') {
      seenAt = postSeenMap.get(BigInt(item.id))
    } else if (item.type === 'suggestion') {
      seenAt = suggestionSeenMap.get(BigInt(item.id))
    }

    const isSeen = Boolean(seenAt && seenAt.getTime() >= cutoff)
    const seenPenalty = isSeen ? feedConfig.scoring.weights.seenPenalty : 0
    const adjustedScore = Math.max(0, item.score - seenPenalty)

    return { ...item, score: adjustedScore }
  })

  // Re-sort by adjusted score
  return penalized.sort((a, b) => b.score - a.score)
}

/**
 * Check if all top N items are unseen (early cutoff optimization)
 */
export async function checkAllUnseen(
  userId: bigint,
  items: PresortedFeedItem[],
  topN: number = 3
): Promise<boolean> {
  const topItems = items.slice(0, topN)
  if (topItems.length === 0) return true

  const cutoff = Date.now() - feedConfig.seenWindowHours * 60 * 60 * 1000

  // Extract IDs for seen lookup
  const postIds: bigint[] = []
  const suggestionIds: bigint[] = []
  for (const item of topItems) {
    if (item.type === 'post') {
      postIds.push(BigInt(item.id))
    } else if (item.type === 'suggestion') {
      suggestionIds.push(BigInt(item.id))
    }
  }

  // Fetch seen maps
  const [postSeenMap, suggestionSeenMap] = await Promise.all([
    postIds.length > 0 ? fetchFeedSeen(userId, 'POST', postIds) : Promise.resolve(new Map<bigint, Date>()),
    suggestionIds.length > 0 ? fetchFeedSeen(userId, 'SUGGESTION', suggestionIds) : Promise.resolve(new Map<bigint, Date>()),
  ])

  // Check if all are unseen
  for (const item of topItems) {
    let seenAt: Date | undefined
    if (item.type === 'post') {
      seenAt = postSeenMap.get(BigInt(item.id))
    } else if (item.type === 'suggestion') {
      seenAt = suggestionSeenMap.get(BigInt(item.id))
    }

    if (seenAt && seenAt.getTime() >= cutoff) {
      return false // Found at least one seen item
    }
  }

  return true // All unseen
}
