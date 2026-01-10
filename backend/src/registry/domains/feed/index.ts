import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalPositiveBigIntList, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';
import { parseEmbedUrl } from '../../../services/media/embed.js';
import { buildViewerContext } from './context.js';
import { getCandidates } from './candidates/index.js';
import { getRelationshipPostCandidates } from './candidates/posts.js';
import { scoreCandidates } from './scoring/index.js';
import { mergeAndRank } from './ranking/index.js';
import { hydrateFeedItems } from './hydration/index.js';
import { hydrateFeedItemsFromPresorted } from './hydration/presorted.js';
import type { FeedItem } from './types.js';
import { recordFeedSeen } from '../../../services/feed/feedSeenService.js';
import { getPresortedSegment, invalidateAllSegmentsForUser } from '../../../services/feed/presortedFeedService.js';
import { applySeenPenalty, checkAllUnseen } from '../../../services/feed/presortedFeedHelpers.js';
import { getFollowerIds, getRelationshipIds } from '../../../services/feed/relationshipService.js';
import { runFeedPresortJob } from '../../../jobs/feedPresortJob.js';

export const feedDomain: DomainRegistry = {
  domain: 'feed',
  routes: [
    {
      id: 'feed.GET./feed',
      method: 'GET',
      path: '/feed',
      auth: Auth.public(),
      summary: 'Homepage feed (posts + match suggestions)',
      tags: ['feed'],
      handler: async (req, res) => {
        const contextParsed = buildViewerContext(req);
        if (!contextParsed.ok) return json(res, { error: contextParsed.error }, 400);

        const ctx = contextParsed.value;
        const isLite = req.query.lite === '1';
        const limit = isLite ? 2 : ctx.take;
        const cursorCutoff = ctx.cursorId
          ? await prisma.post.findUnique({
              where: { id: ctx.cursorId },
              select: { id: true, createdAt: true }
            })
          : null;
        const relationshipIds = ctx.userId
          ? await getRelationshipIds(ctx.userId)
          : { followingIds: [], followerIds: [] };
        const relationshipPosts = ctx.userId
          ? await getRelationshipPostCandidates(ctx, relationshipIds, cursorCutoff)
          : { self: [], following: [], followers: [] };

        const relationshipItemsAll: FeedItem[] = [
          ...relationshipPosts.self.map((post) => ({
            type: 'post' as const,
            post,
            actorId: post.user.id,
            source: 'post' as const,
            tier: 'self' as const
          })),
          ...relationshipPosts.following.map((post) => ({
            type: 'post' as const,
            post,
            actorId: post.user.id,
            source: 'post' as const,
            tier: 'following' as const
          })),
          ...relationshipPosts.followers.map((post) => ({
            type: 'post' as const,
            post,
            actorId: post.user.id,
            source: 'post' as const,
            tier: 'followers' as const
          }))
        ];

        const relationshipItems = relationshipItemsAll.slice(0, limit);
        const relationshipPostIds = new Set<bigint>();
        const relationshipActorIds = new Set<bigint>();
        for (const item of relationshipItems) {
          if (item.type === 'post' && item.post) {
            relationshipPostIds.add(item.post.id);
            relationshipActorIds.add(item.post.user.id);
          }
        }

        const filterRankedItems = (items: FeedItem[]) =>
          items.filter((item) => {
            if (item.type === 'post' && item.post) {
              return !relationshipPostIds.has(item.post.id);
            }
            if (item.type === 'suggestion' && item.suggestion) {
              return !relationshipActorIds.has(item.suggestion.userId);
            }
            return true;
          });

        type SeenItem = {
          type: 'post' | 'suggestion' | 'question';
          post?: { id: bigint };
          suggestion?: { userId: bigint };
        };

        const recordSeenIfNeeded = async (items: SeenItem[]) => {
          if (!ctx.markSeen || !ctx.userId) return;
          const seenItems: Array<{ itemType: 'POST' | 'SUGGESTION'; itemId: bigint }> = [];
          for (const item of items) {
            if (item.type === 'post' && item.post) {
              seenItems.push({ itemType: 'POST', itemId: item.post.id });
            } else if (item.type === 'suggestion' && item.suggestion) {
              seenItems.push({ itemType: 'SUGGESTION', itemId: item.suggestion.userId });
            }
          }
          if (seenItems.length > 0) {
            await recordFeedSeen(ctx.userId, seenItems);
          }
        };

        const getNextPostCursorId = (items: SeenItem[]): string | null => {
          for (let i = items.length - 1; i >= 0; i -= 1) {
            const item = items[i];
            if (item.type === 'post' && item.post) {
              return String(item.post.id);
            }
          }
          return null;
        };

        const canUsePresort = Boolean(ctx.userId && !ctx.cursorId);
        if (canUsePresort && ctx.userId) {
          const segment = await getPresortedSegment(ctx.userId, 0);

          // Algorithm version pinning: Hard fail if mismatch
          if (segment && segment.algorithmVersion !== 'v1') {
            // Invalidate and will fallback to current pipeline
            await prisma.presortedFeedSegment.deleteMany({
              where: { userId: ctx.userId },
            });
          } else if (segment && segment.expiresAt > new Date()) {
            const items = segment.items;
            const remaining = Math.max(limit - relationshipItems.length, 0);

            if (isLite && segment.phase1Json && relationshipItems.length === 0) {
              const parsed = JSON.parse(segment.phase1Json) as {
                items?: Array<{ id: string; kind: string }>;
              };
              if (ctx.markSeen && parsed.items?.length) {
                const seenItems = parsed.items
                  .map((item) => {
                    if (item.kind === 'post') {
                      return { itemType: 'POST' as const, itemId: BigInt(item.id) };
                    }
                    if (item.kind === 'profile') {
                      return { itemType: 'SUGGESTION' as const, itemId: BigInt(item.id) };
                    }
                    return null;
                  })
                  .filter((item): item is { itemType: 'POST' | 'SUGGESTION'; itemId: bigint } => item !== null);
                if (seenItems.length > 0) {
                  await recordFeedSeen(ctx.userId, seenItems);
                }
              }
              return json(res, parsed);
            }

            const filtered = items.filter((item) => {
              if (item.type === 'post') {
                return !relationshipPostIds.has(BigInt(item.id));
              }
              if (item.type === 'suggestion') {
                return !relationshipActorIds.has(item.actorId);
              }
              return true;
            });

            // Phase-2: Apply seen penalty with early cutoff
            const topItems = filtered.slice(0, Math.max(remaining, 3));
            const allUnseen = await checkAllUnseen(ctx.userId, topItems);

            let penalized = filtered;
            if (!allUnseen) {
              // Only apply penalty if some items are seen
              penalized = await applySeenPenalty(ctx.userId, filtered);
            }
            // Skip re-sort if all unseen (early cutoff optimization)

            const itemsToHydrate = remaining > 0 ? penalized.slice(0, remaining) : [];
            const [hydratedRelationship, hydratedPresorted] = await Promise.all([
              relationshipItems.length ? hydrateFeedItems(ctx, relationshipItems) : Promise.resolve([]),
              itemsToHydrate.length ? hydrateFeedItemsFromPresorted(ctx, itemsToHydrate) : Promise.resolve([])
            ]);
            const hydrated = [...hydratedRelationship, ...hydratedPresorted];

            await recordSeenIfNeeded(hydrated);

            const nextCursorId = getNextPostCursorId(hydrated);
            const hasMorePosts = nextCursorId !== null;

            if (isLite) {
              const phase1Items = hydrated.slice(0, limit).map((item) => {
                if (item.type === 'post' && item.post) {
                  return {
                    id: String(item.post.id),
                    kind: 'post' as const,
                    actor: {
                      id: String(item.post.user.id),
                      name: item.post.user.profile?.displayName ?? 'User',
                    avatarUrl: null,
                    },
                    textPreview: item.post.text ? (item.post.text.length > 150 ? item.post.text.slice(0, 150) + '...' : item.post.text) : null,
                    createdAt: new Date(item.post.createdAt).getTime(),
                    presentation: item.post.presentation ?? null,
                  };
                } else if (item.type === 'suggestion' && item.suggestion) {
                  return {
                    id: String(item.suggestion.userId),
                    kind: 'profile' as const,
                    actor: {
                      id: String(item.suggestion.userId),
                      name: item.suggestion.displayName ?? 'User',
                    avatarUrl: null,
                    },
                    textPreview: item.suggestion.bio ? (item.suggestion.bio.length > 150 ? item.suggestion.bio.slice(0, 150) + '...' : item.suggestion.bio) : null,
                    createdAt: Date.now(),
                    presentation: item.suggestion.presentation ?? null,
                  };
                } else if (item.type === 'question' && item.question) {
                  return {
                    id: String(item.question.id),
                    kind: 'question' as const,
                    actor: {
                      id: '0',
                      name: 'System',
                      avatarUrl: null,
                    },
                    textPreview: item.question.prompt ?? null,
                    createdAt: Date.now(),
                    presentation: item.question.presentation ?? { mode: 'question' },
                  };
                }
                throw new Error(`Unknown item type: ${item.type}`);
              });

              return json(res, {
                items: phase1Items,
                nextCursorId,
              });
            }

            return json(res, {
              items: hydrated,
              nextCursorId,
              hasMorePosts,
            });
          } else if (segment && segment.expiresAt <= new Date()) {
            // Segment expired: Trigger background job for next time
            void runFeedPresortJob({ userId: ctx.userId });
          }
        }

        // Fallback to current pipeline
        const candidates = await getCandidates(ctx);
        const scored = await scoreCandidates(ctx, candidates);
        const ranked = mergeAndRank(ctx, scored);
        const filteredRanked = filterRankedItems(ranked);
        const combined = [...relationshipItems, ...filteredRanked];
        const itemsToHydrate = combined.slice(0, limit);
        const hydrated = await hydrateFeedItems(ctx, itemsToHydrate);

        // Trigger background job to precompute for next time
        if (ctx.userId) {
          void runFeedPresortJob({ userId: ctx.userId }); // Fire and forget
        }

        await recordSeenIfNeeded(hydrated);

        const nextCursorId = getNextPostCursorId(hydrated);
        const hasMorePosts = nextCursorId !== null;

        // If lite mode, convert to Phase-1 format
        if (isLite) {
          const phase1Items = hydrated.slice(0, limit).map((item) => {
            if (item.type === 'post' && item.post) {
              return {
                id: String(item.post.id),
                kind: 'post' as const,
                actor: {
                  id: String(item.post.user.id),
                  name: item.post.user.profile?.displayName ?? 'User',
                  avatarUrl: null,
                },
                textPreview: item.post.text ? (item.post.text.length > 150 ? item.post.text.slice(0, 150) + '...' : item.post.text) : null,
                createdAt: new Date(item.post.createdAt).getTime(),
                presentation: item.post.presentation ?? null,
              };
            } else if (item.type === 'suggestion' && item.suggestion) {
              return {
                id: String(item.suggestion.userId),
                kind: 'profile' as const,
                actor: {
                  id: String(item.suggestion.userId),
                  name: item.suggestion.displayName ?? 'User',
                  avatarUrl: null,
                },
                textPreview: item.suggestion.bio ? (item.suggestion.bio.length > 150 ? item.suggestion.bio.slice(0, 150) + '...' : item.suggestion.bio) : null,
                createdAt: Date.now(),
                presentation: item.suggestion.presentation ?? null,
              };
            } else if (item.type === 'question' && item.question) {
              return {
                id: String(item.question.id),
                kind: 'question' as const,
                actor: {
                  id: '0',
                  name: 'System',
                  avatarUrl: null,
                },
                textPreview: item.question.prompt ?? null,
                createdAt: Date.now(),
                presentation: item.question.presentation ?? { mode: 'question' },
              };
            }
            throw new Error(`Unknown item type: ${item.type}`);
          });

          return json(res, {
            items: phase1Items,
            nextCursorId,
          });
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
                  tierCounts: combined.reduce<Record<'self' | 'following' | 'followers' | 'everyone', number>>(
                    (acc, item) => {
                      acc[item.tier] = (acc[item.tier] ?? 0) + 1;
                      return acc;
                    },
                    { self: 0, following: 0, followers: 0, everyone: 0 }
                  )
                }
              }
            : undefined;

        return json(res, {
          items: hydrated,
          nextCursorId,
          hasMorePosts,
          ...(debug ? { debug } : {})
        });
      }
    },
    {
      id: 'feed.POST./posts',
      method: 'POST',
      path: '/posts',
      auth: Auth.user(),
      summary: 'Create post',
      tags: ['feed'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const { text, visibility, mediaIds, embedUrls, targetUserId } = (req.body ?? {}) as { text?: string; visibility?: 'PUBLIC'|'PRIVATE'; mediaIds?: Array<string|number>; embedUrls?: unknown; targetUserId?: string | number };

        const mediaParsed = parseOptionalPositiveBigIntList(mediaIds, 'mediaIds');
        if (!mediaParsed.ok) return json(res, { error: mediaParsed.error }, 400);
        const parsedMediaIds = mediaParsed.value ?? [];

        const embedInputs = Array.isArray(embedUrls) ? embedUrls : [];
        const embedInfos: Array<NonNullable<ReturnType<typeof parseEmbedUrl>>> = [];
        const seenEmbeds = new Set<string>();
        for (const input of embedInputs) {
          if (typeof input !== 'string') {
            return json(res, { error: 'embedUrls must be an array of URLs' }, 400);
          }
          const trimmed = input.trim();
          if (!trimmed) continue;
          if (seenEmbeds.has(trimmed)) continue;
          const parsed = parseEmbedUrl(trimmed);
          if (!parsed) {
            return json(res, { error: 'Only YouTube or SoundCloud URLs are supported for embeds' }, 400);
          }
          seenEmbeds.add(trimmed);
          embedInfos.push(parsed);
        }

        if (!text && parsedMediaIds.length === 0 && embedInfos.length === 0) {
          return json(res, { error: 'Provide text, mediaIds, or embedUrls' }, 400);
        }

        const vis = visibility ?? 'PUBLIC';
        if (vis !== 'PUBLIC' && vis !== 'PRIVATE') {
          return json(res, { error: 'visibility must be PUBLIC or PRIVATE' }, 400);
        }

        // Parse and validate targetUserId if provided
        let parsedTargetUserId: bigint | null = null;
        if (targetUserId !== undefined && targetUserId !== null) {
          const targetParsed = parsePositiveBigInt(targetUserId, 'targetUserId');
          if (!targetParsed.ok) return json(res, { error: targetParsed.error }, 400);
          parsedTargetUserId = targetParsed.value;

          // If posting to another user's profile, validate follow relationship
          if (parsedTargetUserId !== userId) {
              const followRelationship = await prisma.profileAccess.findFirst({
                where: {
                  ownerUserId: parsedTargetUserId,
                  viewerUserId: userId,
                  status: 'GRANTED',
                },
              });
            if (!followRelationship) {
              return json(res, { error: 'You must be following this user to post on their profile' }, 403);
            }
          }
        }

        try {
          // Validate media ownership and readiness (accepts IMAGE, VIDEO, AUDIO)
          await mediaService.assertOwnedMediaIds(parsedMediaIds, userId, {
            requireReady: true,
            requirePublic: vis === 'PUBLIC',
            // No type restriction - allow IMAGE, VIDEO, and AUDIO
          });
        } catch (err) {
          if (err instanceof MediaError) {
            return json(res, { error: err.message }, err.status);
          }
          throw err;
        }

        // Transaction: Create post and attach media atomically
        // This prevents orphaned media if post creation fails
        const post = await prisma.$transaction(async (tx) => {
          const embedMedia = embedInfos.length
            ? await Promise.all(
                embedInfos.map(info =>
                  tx.media.create({
                    data: {
                      userId,
                      ownerUserId: userId,
                      type: 'EMBED',
                      status: 'READY',
                      visibility: vis,
                      url: info.url,
                      thumbUrl: info.thumbUrl ?? null,
                    },
                    select: { id: true }
                  })
                )
              )
            : [];
          const combinedMediaIds = [...parsedMediaIds, ...embedMedia.map(m => m.id)];
          const created = await tx.post.create({
            data: {
              userId,
              targetProfileUserId: parsedTargetUserId,
              visibility: vis,
              text: text ?? null,
              media: combinedMediaIds.length
                ? {
                    create: combinedMediaIds.map((id, idx) => ({
                      order: idx,
                      mediaId: id
                    }))
                  }
                : undefined
            },
            select: { id: true, createdAt: true }
          });

          await tx.postStats.create({
            data: { postId: created.id }
          });

          // Media is now attached (PostMedia records exist)
          // No orphan cleanup needed for this media

          return created;
        });

        void (async () => {
          try {
            await invalidateAllSegmentsForUser(userId);
            const followerIds = await getFollowerIds(userId);
            await Promise.all(followerIds.map((followerId) => invalidateAllSegmentsForUser(followerId)));
          } catch (err) {
            console.error('Failed to invalidate presorted feed segments:', err);
          }
        })();

        return json(res, post, 201);
      }
    },
    {
      id: 'feed.PATCH./posts/:postId',
      method: 'PATCH',
      path: '/posts/:postId',
      auth: Auth.user(),
      summary: 'Update post',
      tags: ['feed'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const postParsed = parsePositiveBigInt(req.params.postId, 'postId');
        if (!postParsed.ok) return json(res, { error: postParsed.error }, 400);
        const postId = postParsed.value;
        const body = (req.body ?? {}) as { text?: unknown; visibility?: unknown };
        const hasText = Object.prototype.hasOwnProperty.call(body, 'text');
        const hasVisibility = Object.prototype.hasOwnProperty.call(body, 'visibility');
        if (!hasText && !hasVisibility) {
          return json(res, { error: 'No fields to update' }, 400);
        }

        let nextText: string | null | undefined = undefined;
        if (hasText) {
          if (body.text === null) {
            nextText = null;
          } else if (typeof body.text === 'string') {
            const trimmed = body.text.trim();
            nextText = trimmed.length ? trimmed : null;
          } else {
            return json(res, { error: 'text must be a string or null' }, 400);
          }
        }

        let nextVisibility: 'PUBLIC' | 'PRIVATE' | undefined = undefined;
        if (hasVisibility) {
          if (body.visibility === 'PUBLIC' || body.visibility === 'PRIVATE') {
            nextVisibility = body.visibility;
          } else {
            return json(res, { error: 'visibility must be PUBLIC or PRIVATE' }, 400);
          }
        }

        const post = await prisma.post.findFirst({
          where: { id: postId, deletedAt: null },
          select: {
            id: true,
            userId: true,
            visibility: true,
            media: {
              select: {
                id: true,
                media: {
                  select: {
                    id: true,
                    visibility: true
                  }
                }
              }
            }
          }
        });
        if (!post) return json(res, { error: 'Post not found' }, 404);
        if (post.userId !== userId) return json(res, { error: 'Forbidden' }, 403);
        if (hasText && nextText === null && post.media.length === 0) {
          return json(res, { error: 'Post cannot be empty' }, 400);
        }

        // Reject changing from PRIVATE to PUBLIC if post has PRIVATE media
        if (hasVisibility && nextVisibility === 'PUBLIC' && post.visibility === 'PRIVATE') {
          const hasPrivateMedia = post.media.some((pm) => pm.media.visibility === 'PRIVATE');
          if (hasPrivateMedia) {
            return json(res, { error: 'Cannot make post PUBLIC: it contains PRIVATE media' }, 400);
          }
        }

        const updated = await prisma.post.update({
          where: { id: postId },
          data: {
            ...(hasText ? { text: nextText } : {}),
            ...(hasVisibility ? { visibility: nextVisibility } : {})
          },
          select: { id: true, text: true, visibility: true, updatedAt: true }
        });
        return json(res, updated);
      }
    },
    {
      id: 'feed.DELETE./posts/:postId',
      method: 'DELETE',
      path: '/posts/:postId',
      auth: Auth.user(),
      summary: 'Delete post',
      tags: ['feed'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const postParsed = parsePositiveBigInt(req.params.postId, 'postId');
        if (!postParsed.ok) return json(res, { error: postParsed.error }, 400);
        const postId = postParsed.value;

        const post = await prisma.post.findFirst({
          where: { id: postId, deletedAt: null },
          select: { id: true, userId: true }
        });
        if (!post) return json(res, { error: 'Post not found' }, 404);
        if (post.userId !== userId) return json(res, { error: 'Forbidden' }, 403);

        await prisma.post.update({
          where: { id: postId },
          data: { deletedAt: new Date() }
        });

        return json(res, { ok: true });
      }
    },
    {
      id: 'feed.DELETE./posts/:postId/media/:mediaId',
      method: 'DELETE',
      path: '/posts/:postId/media/:mediaId',
      auth: Auth.user(),
      summary: 'Remove media from post',
      tags: ['feed'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const postParsed = parsePositiveBigInt(req.params.postId, 'postId');
        if (!postParsed.ok) return json(res, { error: postParsed.error }, 400);
        const postId = postParsed.value;
        const mediaParsed = parsePositiveBigInt(req.params.mediaId, 'mediaId');
        if (!mediaParsed.ok) return json(res, { error: mediaParsed.error }, 400);
        const mediaId = mediaParsed.value;

        const post = await prisma.post.findFirst({
          where: { id: postId, deletedAt: null },
          select: { id: true, userId: true, text: true, media: { select: { id: true, mediaId: true } } }
        });
        if (!post) return json(res, { error: 'Post not found' }, 404);
        if (post.userId !== userId) return json(res, { error: 'Forbidden' }, 403);

        const postMedia = post.media.find(pm => pm.mediaId === mediaId);
        if (!postMedia) return json(res, { error: 'Media not found in post' }, 404);

        const hasText = post.text != null && post.text.trim().length > 0;
        if (post.media.length === 1 && !hasText) {
          return json(res, { error: 'Cannot remove last media from post with no text' }, 400);
        }

        await prisma.postMedia.delete({
          where: { id: postMedia.id }
        });

        return json(res, { ok: true });
      }
    },
    {
      id: 'feed.POST./posts/:postId/save',
      method: 'POST',
      path: '/posts/:postId/save',
      auth: Auth.user(),
      summary: 'Save post',
      tags: ['feed'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const postParsed = parsePositiveBigInt(req.params.postId, 'postId');
        if (!postParsed.ok) return json(res, { error: postParsed.error }, 400);
        const postId = postParsed.value;

        const now = new Date();
        await prisma.$transaction(async (tx) => {
          const existing = await tx.likedPost.findUnique({
            where: { userId_postId: { userId, postId } },
            select: { id: true }
          });

          if (!existing) {
            await tx.likedPost.create({
              data: { userId, postId }
            });

            await tx.postStats.upsert({
              where: { postId },
              update: {
                likeCount: { increment: 1 },
                lastLikeAt: now
              },
              create: {
                postId,
                likeCount: 1,
                lastLikeAt: now
              }
            });
          }
        });

        return json(res, { ok: true });
      }
    }
  ]
};
