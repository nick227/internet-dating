import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalPositiveBigIntList, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';
import { parseEmbedUrl } from '../../../services/media/embed.js';
import { buildViewerContext } from './context.js';
import { getFeed } from './services/feedService.js';
import { buildFullResponse, buildLiteResponse, buildCachedLiteResponse } from './services/responseBuilder.js';
import { validatePresortedSegment } from './validation.js';
import { getPresortedSegment } from '../../../services/feed/presortedFeedService.js';
import { invalidateUserAndFollowerFeeds } from '../../../services/feed/relationshipService.js';

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

        // Critical fix: Validate cursor exists before using it
        const cursorCutoff = ctx.cursorId
          ? await prisma.post.findUnique({
              where: { id: ctx.cursorId },
              select: { id: true, createdAt: true },
            })
          : null;

        // If cursor was requested but not found, return error
        if (ctx.cursorId && !cursorCutoff) {
          return json(res, { error: 'Invalid cursor' }, 400);
        }

        // Special case: Cached lite mode for presorted feeds with no relationship items
        const canUseCachedLite = Boolean(
          isLite &&
          ctx.userId &&
          !ctx.cursorId
        );

        if (canUseCachedLite && ctx.userId) {
          const segment = await getPresortedSegment(ctx.userId, 0);
          const validation = validatePresortedSegment(segment);

          // Critical fix: Check version BEFORE trying to use segment
          if (!validation.valid && validation.reason === 'version_mismatch' && segment) {
            // Delete stale segments and fall through to regular path
            await prisma.presortedFeedSegment.deleteMany({
              where: { userId: ctx.userId },
            });
          } else if (validation.valid && validation.segment.phase1Json) {
            // Can use cached phase1Json directly
            const cachedResponse = await buildCachedLiteResponse(ctx, validation.segment);
            return json(res, cachedResponse);
          }
        }

        // Standard feed path (presorted or fallback)
        const feedResult = await getFeed(ctx, limit, cursorCutoff);

        // Build and return response
        if (isLite) {
          const response = await buildLiteResponse(ctx, feedResult.items, limit);
          return json(res, response);
        }

        const response = await buildFullResponse(ctx, feedResult.items, feedResult.debug);
        return json(res, response);
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

        // Invalidate feed cache for user and all followers (batched to prevent N+1)
        void (async () => {
          try {
            await invalidateUserAndFollowerFeeds(userId);
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
