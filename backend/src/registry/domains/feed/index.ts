import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalPositiveBigIntList, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';
import { buildViewerContext } from './context.js';
import { getCandidates } from './candidates/index.js';
import { scoreCandidates } from './scoring/index.js';
import { mergeAndRank } from './ranking/index.js';
import { hydrateFeedItems } from './hydration/index.js';
import { hydrateFeedItemsFromPresorted } from './hydration/presorted.js';
import { recordFeedSeen } from '../../../services/feed/feedSeenService.js';
import { getPresortedSegment } from '../../../services/feed/presortedFeedService.js';
import { applySeenPenalty, checkAllUnseen } from '../../../services/feed/presortedFeedHelpers.js';
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

        // Try presorted segments first (DB lookup)
        if (ctx.userId) {
          const segment = await getPresortedSegment(ctx.userId, 0);

          // Algorithm version pinning: Hard fail if mismatch
          if (segment && segment.algorithmVersion !== 'v1') {
            // Invalidate and will fallback to current pipeline
            await prisma.presortedFeedSegment.deleteMany({
              where: { userId: ctx.userId },
            });
          } else if (segment && segment.expiresAt > new Date()) {
            // Parse items from JSON
            const items = segment.items;

            // Phase-1 request short-circuit: Return pre-serialized JSON immediately
            if (isLite && segment.phase1Json) {
              // Do NOT touch Prisma/ORM at all
              // Return pre-serialized JSON
              return json(res, JSON.parse(segment.phase1Json));
            }

            // Phase-2: Apply seen penalty with early cutoff
            const topItems = items.slice(0, limit);
            const allUnseen = await checkAllUnseen(ctx.userId, topItems);

            let penalized = items;
            if (!allUnseen) {
              // Only apply penalty if some items are seen
              penalized = await applySeenPenalty(ctx.userId, items);
            }
            // Skip re-sort if all unseen (early cutoff optimization)

            // Fast-path hydration: Hydrate only needed items
            const itemsToHydrate = penalized.slice(0, limit);
            const hydrated = await hydrateFeedItemsFromPresorted(ctx, itemsToHydrate);

            // Cursor sanity: Use segment index + offset (simplified for v1)
            const nextCursorId = penalized.length > limit ? String(penalized[limit]?.id ?? null) : null;

            return json(res, {
              items: hydrated,
              nextCursorId,
              hasMorePosts: penalized.length > limit,
            });
          } else if (segment && segment.expiresAt <= new Date()) {
            // Segment expired: Trigger background job for next time
            void runFeedPresortJob({ userId: ctx.userId, incremental: true });
          }
        }

        // Fallback to current pipeline
        const candidates = await getCandidates(ctx);
        const scored = await scoreCandidates(ctx, candidates);
        const ranked = mergeAndRank(ctx, scored);
        const hydrated = await hydrateFeedItems(ctx, ranked);

        // Trigger background job to precompute for next time
        if (ctx.userId) {
          void runFeedPresortJob({ userId: ctx.userId }); // Fire and forget
        }

        if (ctx.markSeen && ctx.userId) {
          const seenItems: Array<{ itemType: 'POST' | 'SUGGESTION'; itemId: bigint }> = [];
          for (const item of hydrated) {
            if (item.type === 'post' && item.post) {
              seenItems.push({ itemType: 'POST', itemId: item.post.id });
            } else if (item.type === 'suggestion' && item.suggestion) {
              seenItems.push({ itemType: 'SUGGESTION', itemId: item.suggestion.userId });
            }
          }
          await recordFeedSeen(ctx.userId, seenItems);
        }

        // Determine if there are more posts available
        const hasMorePosts = candidates.nextCursorId !== null;

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
                  avatarUrl: item.post.user.profile?.avatarUrl ?? null,
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
                  avatarUrl: item.suggestion.avatarUrl ?? null,
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
            nextCursor: hydrated.length > limit ? String(hydrated[limit]?.post?.id ?? hydrated[limit]?.suggestion?.userId ?? hydrated[limit]?.question?.id ?? null) : null,
          });
        }

        const debug =
          ctx.debug && scored.debug
            ? {
                ...scored.debug,
                ranking: {
                  sourceSequence: ranked.map((item) => item.source),
                  actorCounts: ranked.reduce<Record<string, number>>((acc, item) => {
                    const key = String(item.actorId);
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                  }, {})
                }
              }
            : undefined;

        return json(res, {
          items: hydrated,
          nextCursorId: candidates.nextCursorId ? String(candidates.nextCursorId) : null,
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
        const { text, visibility, mediaIds } = (req.body ?? {}) as { text?: string; visibility?: 'PUBLIC'|'PRIVATE'; mediaIds?: Array<string|number> };

        const mediaParsed = parseOptionalPositiveBigIntList(mediaIds, 'mediaIds');
        if (!mediaParsed.ok) return json(res, { error: mediaParsed.error }, 400);
        const parsedMediaIds = mediaParsed.value ?? [];

        if (!text && parsedMediaIds.length === 0) return json(res, { error: 'Provide text or mediaIds' }, 400);

        const vis = visibility ?? 'PUBLIC';
        if (vis !== 'PUBLIC' && vis !== 'PRIVATE') {
          return json(res, { error: 'visibility must be PUBLIC or PRIVATE' }, 400);
        }

        try {
          await mediaService.assertOwnedMediaIds(parsedMediaIds, userId, {
            requireReady: true,
            requirePublic: vis === 'PUBLIC',
            type: 'IMAGE'
          });
        } catch (err) {
          if (err instanceof MediaError) {
            return json(res, { error: err.message }, err.status);
          }
          throw err;
        }

        const post = await prisma.post.create({
          data: {
            userId,
            visibility: vis,
            text: text ?? null,
            media: parsedMediaIds.length
              ? {
                  create: parsedMediaIds.map((id, idx) => ({
                    order: idx,
                    mediaId: id
                  }))
                }
              : undefined
          },
          select: { id: true, createdAt: true }
        });

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

        await prisma.likedPost.upsert({
          where: { userId_postId: { userId, postId } },
          update: {},
          create: { userId, postId }
        });

        return json(res, { ok: true });
      }
    }
  ]
};
