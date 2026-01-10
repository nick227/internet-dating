// Service for recording seen feed items
import { recordFeedSeen } from '../../../../services/feed/feedSeenService.js';
import { SeenItemType } from '../constants.js';
import type { FeedItem } from '../types.js';

export type SeenRecordItem = {
  type: 'post' | 'suggestion' | 'question';
  post?: { id: bigint };
  suggestion?: { userId: bigint };
};

/**
 * Record items as seen if markSeen is enabled
 * Only records items that were actually returned to the user
 */
export async function recordSeenItems(
  userId: bigint | null,
  markSeen: boolean,
  items: SeenRecordItem[]
): Promise<void> {
  if (!markSeen || !userId || items.length === 0) return;

  const seenItems: Array<{ itemType: 'POST' | 'SUGGESTION'; itemId: bigint }> = [];

  for (const item of items) {
    if (item.type === 'post' && item.post) {
      seenItems.push({ itemType: SeenItemType.POST, itemId: item.post.id });
    } else if (item.type === 'suggestion' && item.suggestion) {
      seenItems.push({ itemType: SeenItemType.SUGGESTION, itemId: item.suggestion.userId });
    }
  }

  if (seenItems.length > 0) {
    await recordFeedSeen(userId, seenItems);
  }
}

/**
 * Extract seen items from Phase-1 JSON for lite mode
 * Used when returning cached phase1Json directly without hydration
 */
export function extractSeenItemsFromPhase1(
  phase1Json: string
): Array<{ itemType: 'POST' | 'SUGGESTION'; itemId: bigint }> {
  const parsed = JSON.parse(phase1Json) as {
    items?: Array<{ id: string; kind: string }>;
  };

  if (!parsed.items?.length) return [];

  return parsed.items
    .map((item) => {
      if (item.kind === 'post') {
        return { itemType: SeenItemType.POST, itemId: BigInt(item.id) };
      }
      if (item.kind === 'profile') {
        return { itemType: SeenItemType.SUGGESTION, itemId: BigInt(item.id) };
      }
      return null;
    })
    .filter((item): item is { itemType: 'POST' | 'SUGGESTION'; itemId: bigint } => item !== null);
}

/**
 * Build relationship item filters as Sets for efficient lookup
 */
export function buildRelationshipFilters(items: FeedItem[]): {
  postIds: Set<bigint>;
  actorIds: Set<bigint>;
} {
  const postIds = new Set<bigint>();
  const actorIds = new Set<bigint>();

  for (const item of items) {
    if (item.type === 'post' && item.post) {
      postIds.add(item.post.id);
      actorIds.add(item.post.user.id);
    }
  }

  return { postIds, actorIds };
}
