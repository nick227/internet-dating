import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseLimit, parseOptionalPositiveBigInt, parseOptionalPositiveBigIntList, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { toPublicMedia } from '../../../services/media/presenter.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';

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
        const takeParsed = parseLimit(req.query.take, 20, 50);
        if (!takeParsed.ok) return json(res, { error: takeParsed.error }, 400);
        const cursorParsed = parseOptionalPositiveBigInt(req.query.cursorId, 'cursorId');
        if (!cursorParsed.ok) return json(res, { error: cursorParsed.error }, 400);

        const take = takeParsed.value;
        const cursorId = cursorParsed.value;

        const posts = await prisma.post.findMany({
          where: { deletedAt: null, visibility: 'PUBLIC', user: { deletedAt: null } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursorId
            ? { cursor: { id: cursorId }, skip: 1 }
            : {}),
          select: {
            id: true,
            text: true,
            createdAt: true,
            user: { select: { id: true, profile: { select: { displayName: true } } } },
            media: { select: { order: true, media: { select: { id: true, type: true, url: true, thumbUrl: true, width: true, height: true, durationSec: true, storageKey: true, variants: true } } }, orderBy: { order: 'asc' } }
          }
        });

        const nextCursorId = posts.length === take ? posts[posts.length - 1]!.id : null;

        // Match suggestions are only for identified users (optional x-user-id on public route)
        let suggestions: any[] = [];
        if (req.ctx.userId) {
          const me = req.ctx.userId;
          suggestions = await prisma.profile.findMany({
            where: {
              deletedAt: null,
              isVisible: true,
              userId: { not: me },
              user: {
                deletedAt: null,
                blocksGot: { none: { blockerId: me } },
                blocksMade: { none: { blockedId: me } }
              }
            },
            take: 10,
            select: {
              userId: true,
              displayName: true,
              bio: true,
              locationText: true,
              intent: true
            }
          });
        }

        return json(res, {
          posts: posts.map(p => ({
            ...p,
            media: p.media.map(m => ({ order: m.order, media: toPublicMedia(m.media) }))
          })),
          suggestions,
          nextCursorId
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
            media: { take: 1, select: { id: true } }
          }
        });
        if (!post) return json(res, { error: 'Post not found' }, 404);
        if (post.userId !== userId) return json(res, { error: 'Forbidden' }, 403);
        if (hasText && nextText === null && post.media.length === 0) {
          return json(res, { error: 'Post cannot be empty' }, 400);
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

        await prisma.savedPost.upsert({
          where: { userId_postId: { userId, postId } },
          update: {},
          create: { userId, postId }
        });

        return json(res, { ok: true });
      }
    }
  ]
};
