// Core feed service orchestrating presorted and fallback pipelines
import { getPresortedSegment, invalidateAllSegmentsForUser } from '../../../../services/feed/presortedFeedService.js';
import { getRelationshipIds } from '../../../../services/feed/relationshipService.js';
import { applySeenPenalty, checkAllUnseen } from '../../../../services/feed/presortedFeedHelpers.js';
import { getRelationshipPostCandidates } from '../candidates/posts.js';
import { runFeedPresortJob } from '../../../../jobs/feedPresortJob.js';
import { getCandidates } from '../candidates/index.js';
import { scoreCandidates } from '../scoring/index.js';
import { mergeAndRank } from '../ranking/index.js';
import { hydrateFeedItems } from '../hydration/index.js';
import { hydrateFeedItemsFromPresorted } from '../hydration/presorted.js';
import { validatePresortedSegment } from '../validation.js';
import { buildRelationshipFilters } from './seenService.js';
import type { ViewerContext, FeedItem, FeedDebugSummary } from '../types.js';
import type { HydratedFeedItem } from '../hydration/index.js';
import type { PresortedFeedItem } from '../../../../services/feed/presortedFeedService.js';

export type FeedServiceResult = {
  items: HydratedFeedItem[];
  debug?: FeedDebugSummary;
};

/**
 * Fetch relationship posts and build filter sets
 */
async function fetchRelationshipPosts(
  ctx: ViewerContext,
  limit: number,
  cursorCutoff: { id: bigint; createdAt: Date } | null
): Promise<{ items: FeedItem[]; postIds: Set<bigint>; actorIds: Set<bigint> }> {
  if (!ctx.userId) {
    return { items: [], postIds: new Set(), actorIds: new Set() };
  }

  const relationshipIds = await getRelationshipIds(ctx.userId);
  const relationshipPosts = await getRelationshipPostCandidates(ctx, relationshipIds, cursorCutoff);

  const relationshipItemsAll: FeedItem[] = [
    ...relationshipPosts.self.map((post) => ({
      type: 'post' as const,
      post,
      actorId: post.user.id,
      source: 'post' as const,
      tier: 'self' as const,
    })),
    ...relationshipPosts.following.map((post) => ({
      type: 'post' as const,
      post,
      actorId: post.user.id,
      source: 'post' as const,
      tier: 'following' as const,
    })),
    ...relationshipPosts.followers.map((post) => ({
      type: 'post' as const,
      post,
      actorId: post.user.id,
      source: 'post' as const,
      tier: 'followers' as const,
    })),
  ];

  const relationshipItems = relationshipItemsAll.slice(0, limit);
  const { postIds, actorIds } = buildRelationshipFilters(relationshipItems);

  return { items: relationshipItems, postIds, actorIds };
}

/**
 * Filter presorted items by relationship posts/actors
 */
function filterPresortedItems(
  items: PresortedFeedItem[],
  relationshipPostIds: Set<bigint>,
  relationshipActorIds: Set<bigint>
): PresortedFeedItem[] {
  return items.filter((item) => {
    if (item.type === 'post') {
      return !relationshipPostIds.has(BigInt(item.id));
    }
    if (item.type === 'suggestion') {
      return !relationshipActorIds.has(item.actorId);
    }
    return true;
  });
}

/**
 * Apply seen penalty with early cutoff optimization
 */
async function applySeenPenaltyOptimized(
  userId: bigint,
  items: PresortedFeedItem[],
  remaining: number
): Promise<PresortedFeedItem[]> {
  // Check top items only to avoid scanning entire list
  const topItems = items.slice(0, Math.max(remaining, 3));
  const allUnseen = await checkAllUnseen(userId, topItems);

  // Skip penalty if all are unseen
  if (allUnseen) return items;

  // Apply penalty only if some items are seen
  return await applySeenPenalty(userId, items);
}

/**
 * Fetch feed using presorted segment
 */
async function fetchPresortedFeed(
  ctx: ViewerContext,
  limit: number,
  relationshipItems: FeedItem[],
  relationshipPostIds: Set<bigint>,
  relationshipActorIds: Set<bigint>
): Promise<FeedServiceResult | null> {
  if (!ctx.userId) return null;

  const segment = await getPresortedSegment(ctx.userId, 0);
  const validation = validatePresortedSegment(segment);

  // Handle invalid segment
  if (!validation.valid) {
    if (validation.reason === 'version_mismatch' && segment) {
      // Delete stale segments and fallback
      await invalidateAllSegmentsForUser(ctx.userId);
    } else if (validation.reason === 'expired' && segment) {
      // Trigger background refresh for next time
      void runFeedPresortJob({ userId: ctx.userId });
    }
    return null;
  }

  const { segment: validSegment } = validation;
  const remaining = Math.max(limit - relationshipItems.length, 0);

  // Filter out relationship items
  const filtered = filterPresortedItems(
    validSegment.items,
    relationshipPostIds,
    relationshipActorIds
  );

  // Apply seen penalty with early cutoff optimization
  const penalized = await applySeenPenaltyOptimized(ctx.userId, filtered, remaining);

  // Hydrate items
  const itemsToHydrate = remaining > 0 ? penalized.slice(0, remaining) : [];
  const [hydratedRelationship, hydratedPresorted] = await Promise.all([
    relationshipItems.length ? hydrateFeedItems(ctx, relationshipItems) : Promise.resolve([]),
    itemsToHydrate.length ? hydrateFeedItemsFromPresorted(ctx, itemsToHydrate) : Promise.resolve([]),
  ]);

  console.log('[feedService] Presorted feed used. Items:', hydratedPresorted.length, 'First 3 items:', hydratedPresorted.slice(0, 3).map(i => ({ type: i.type, presentation: i.post?.presentation || i.suggestion?.presentation, mediaType: i.post ? 'mediaType not in hydrated' : undefined })));

  return {
    items: [...hydratedRelationship, ...hydratedPresorted],
  };
}

/**
 * Fetch feed using fallback pipeline (live computation)
 */
async function fetchFallbackFeed(
  ctx: ViewerContext,
  limit: number,
  relationshipItems: FeedItem[],
  relationshipPostIds: Set<bigint>,
  relationshipActorIds: Set<bigint>
): Promise<FeedServiceResult> {
  const candidates = await getCandidates(ctx);
  const scored = await scoreCandidates(ctx, candidates);
  const ranked = mergeAndRank(ctx, scored);
  
  console.log('[feedService] Fallback feed used. First 5 items presentation:', ranked.slice(0, 5).map(i => ({ type: i.type, presentation: i.presentation, mediaType: i.post?.mediaType })));

  // Filter ranked items by relationship items
  const filteredRanked = ranked.filter((item) => {
    if (item.type === 'post' && item.post) {
      return !relationshipPostIds.has(item.post.id);
    }
    if (item.type === 'suggestion' && item.suggestion) {
      return !relationshipActorIds.has(item.suggestion.userId);
    }
    return true;
  });

  const combined = [...relationshipItems, ...filteredRanked];
  const itemsToHydrate = combined.slice(0, limit);
  const hydrated = await hydrateFeedItems(ctx, itemsToHydrate);

  // Trigger background job to precompute for next time
  if (ctx.userId) {
    void runFeedPresortJob({ userId: ctx.userId });
  }

  const debug =
    ctx.debug && scored.debug
      ? {
          ...scored.debug,
          ranking: {
            sourceSequence: ranked.map((item) => item.source),
            tierSequence: combined.map((item) => item.tier),
            actorCounts: ranked.reduce<Record<string, number>>((acc, item) => {
              const key = String(item.actorId);
              acc[key] = (acc[key] ?? 0) + 1;
              return acc;
            }, {}),
            tierCounts: combined.reduce<
              Record<'self' | 'following' | 'followers' | 'everyone', number>
            >(
              (acc, item) => {
                acc[item.tier] = (acc[item.tier] ?? 0) + 1;
                return acc;
              },
              { self: 0, following: 0, followers: 0, everyone: 0 }
            ),
          },
        }
      : undefined;

  return { items: hydrated, debug };
}

/**
 * Main feed service orchestrator
 */
export async function getFeed(
  ctx: ViewerContext,
  limit: number,
  cursorCutoff: { id: bigint; createdAt: Date } | null
): Promise<FeedServiceResult> {
  // Fetch relationship posts in parallel with determining if we can use presort
  const canUsePresort = Boolean(ctx.userId && !ctx.cursorId);
  
  const { items: relationshipItems, postIds, actorIds } = await fetchRelationshipPosts(
    ctx,
    limit,
    cursorCutoff
  );

  // Try presorted path if available
  if (canUsePresort) {
    const presortedResult = await fetchPresortedFeed(
      ctx,
      limit,
      relationshipItems,
      postIds,
      actorIds
    );
    if (presortedResult) return presortedResult;
  }

  // Fallback to live computation
  return fetchFallbackFeed(ctx, limit, relationshipItems, postIds, actorIds);
}
