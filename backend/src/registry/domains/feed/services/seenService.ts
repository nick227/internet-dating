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
  items: Array<SeenRecordItem | { type: 'grid'; grid?: { items: SeenRecordItem[] } }>
): Promise<void> {
  if (!markSeen || !userId || items.length === 0) return;

  const seenItems: Array<{ itemType: 'POST' | 'SUGGESTION'; itemId: bigint }> = [];

  for (const item of items) {
    if (item.type === 'grid') {
      for (const child of item.grid?.items ?? []) {
        if (child.type === 'post' && child.post) {
          seenItems.push({ itemType: SeenItemType.POST, itemId: child.post.id });
        } else if (child.type === 'suggestion' && child.suggestion) {
          seenItems.push({ itemType: SeenItemType.SUGGESTION, itemId: child.suggestion.userId });
        }
      }
      continue;
    }
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
    items?: Array<{ cardType?: string; items?: Array<{ id: string; kind: string }> }>;
  };

  if (!parsed.items?.length) return [];

  const seen: Array<{ itemType: 'POST' | 'SUGGESTION'; itemId: bigint }> = [];

  for (const card of parsed.items) {
    for (const child of card.items ?? []) {
      if (child.kind === 'post') {
        seen.push({ itemType: SeenItemType.POST, itemId: BigInt(child.id) });
      } else if (child.kind === 'profile') {
        seen.push({ itemType: SeenItemType.SUGGESTION, itemId: BigInt(child.id) });
      }
    }
  }

  return seen;
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
