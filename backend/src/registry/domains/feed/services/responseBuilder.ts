// Feed response building and formatting
import { recordFeedSeen } from '../../../../services/feed/feedSeenService.js';
import { toPhase1Item, getNextPostCursorId, type Phase1Item } from '../transformers.js';
import { extractSeenItemsFromPhase1, recordSeenItems } from './seenService.js';
import type { ViewerContext, FeedItem } from '../types.js';
import type { HydratedFeedItem } from '../hydration/index.js';
import type { PresortedFeedSegment } from '../../../../services/feed/presortedFeedService.js';

export type FeedResponse = {
  items: HydratedFeedItem[] | Phase1Item[];
  nextCursorId: string | null;
  hasMorePosts?: boolean;
  debug?: unknown;
};

/**
 * Flatten presentation to top level for frontend compatibility
 * Frontend expects card.presentation, but HydratedFeedItem has it nested
 */
function flattenPresentation(item: HydratedFeedItem): HydratedFeedItem {
  const presentation = 
    item.post?.presentation ?? 
    item.suggestion?.presentation ?? 
    item.question?.presentation;
  
  return {
    ...item,
    ...(presentation ? { presentation } : {})
  } as HydratedFeedItem;
}

/**
 * Build full feed response (non-lite mode)
 */
export async function buildFullResponse(
  ctx: ViewerContext,
  items: HydratedFeedItem[],
  debug?: unknown
): Promise<FeedResponse> {
  await recordSeenItems(ctx.userId, ctx.markSeen ?? false, items);
  
  const nextCursorId = getNextPostCursorId(items);
  const hasMorePosts = nextCursorId !== null;

  // Flatten presentation to top level for frontend compatibility
  const flattenedItems = items.map(flattenPresentation);

  return {
    items: flattenedItems,
    nextCursorId,
    hasMorePosts,
    ...(debug ? { debug } : {}),
  };
}

/**
 * Build lite (Phase-1) feed response
 */
export async function buildLiteResponse(
  ctx: ViewerContext,
  items: HydratedFeedItem[],
  limit: number
): Promise<{ items: Phase1Item[]; nextCursorId: string | null }> {
  await recordSeenItems(ctx.userId, ctx.markSeen ?? false, items);

  const phase1Items = items.slice(0, limit).map(toPhase1Item);
  const nextCursorId = getNextPostCursorId(items);

  return {
    items: phase1Items,
    nextCursorId,
  };
}

/**
 * Build lite response from cached phase1Json
 * CRITICAL: Only records items as seen - does NOT hydrate or validate
 * Frontend must handle discarded items appropriately
 */
export async function buildCachedLiteResponse(
  ctx: ViewerContext,
  segment: PresortedFeedSegment
): Promise<{ items: unknown; nextCursorId?: string }> {
  if (!segment.phase1Json) {
    throw new Error('Cannot build cached response: phase1Json is null');
  }

  const parsed = JSON.parse(segment.phase1Json);

  // Record as seen if enabled
  // NOTE: This records ALL items from cached JSON, even if frontend discards some
  // This is acceptable because phase1Json is already filtered and ranked
  if (ctx.markSeen && ctx.userId && parsed.items?.length) {
    const seenItems = extractSeenItemsFromPhase1(segment.phase1Json);
    if (seenItems.length > 0) {
      await recordFeedSeen(ctx.userId, seenItems);
    }
  }

  return parsed;
}
