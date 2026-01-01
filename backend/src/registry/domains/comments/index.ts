import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';

type CommentCreateBody = {
  cardId?: string | number;
  cardKind?: string;
  actorId?: string | number;
  text?: string;
  parentId?: string | number;
  clientRequestId?: string;
};

export const commentsDomain: DomainRegistry = {
  domain: 'comments',
  routes: [
    {
      id: 'comments.POST./comments',
      method: 'POST',
      path: '/comments',
      auth: Auth.user(),
      summary: 'Create comment',
      tags: ['comments'],
      handler: async (req, res) => {
        const authorId = req.ctx.userId!;
        const body = (req.body ?? {}) as CommentCreateBody;
        const { cardId, cardKind, text, parentId, clientRequestId } = body;

        if (!clientRequestId || typeof clientRequestId !== 'string' || !clientRequestId.trim()) {
          return json(res, { error: 'clientRequestId is required' }, 400);
        }
        if (!text || typeof text !== 'string' || !text.trim()) {
          return json(res, { error: 'text is required' }, 400);
        }
        if (cardKind !== 'post') {
          return json(res, { error: 'cardKind must be post' }, 400);
        }

        const postParsed = parsePositiveBigInt(cardId, 'cardId');
        if (!postParsed.ok) return json(res, { error: postParsed.error }, 400);
        const postId = postParsed.value;

        const parentParsed = parseOptionalPositiveBigInt(parentId, 'parentId');
        if (!parentParsed.ok) return json(res, { error: parentParsed.error }, 400);
        const parentCommentId = parentParsed.value;

        const existing = await prisma.comment.findFirst({
          where: {
            authorId,
            targetKind: 'POST',
            targetId: postId,
            clientRequestId
          },
          select: { id: true, createdAt: true }
        });
        if (existing) {
          return json(res, { ok: true, id: existing.id, createdAt: existing.createdAt }, 200);
        }

        const post = await prisma.post.findFirst({
          where: { id: postId, deletedAt: null },
          select: { id: true }
        });
        if (!post) return json(res, { error: 'Post not found' }, 404);

        let resolvedParentId: bigint | null = null;
        let resolvedRootId: bigint | null = null;
        if (parentCommentId) {
          const parent = await prisma.comment.findFirst({
            where: {
              id: parentCommentId,
              targetKind: 'POST',
              targetId: postId,
              status: 'ACTIVE'
            },
            select: { id: true, rootId: true }
          });
          if (!parent) return json(res, { error: 'Parent comment not found' }, 404);
          resolvedParentId = parent.id;
          resolvedRootId = parent.rootId ?? parent.id;
        }

        const now = new Date();
        const created = await prisma.$transaction(async (tx) => {
          const comment = await tx.comment.create({
            data: {
              targetKind: 'POST',
              targetId: postId,
              authorId,
              clientRequestId,
              body: text.trim(),
              parentId: resolvedParentId,
              rootId: resolvedRootId
            },
            select: { id: true, createdAt: true }
          });

          await tx.postStats.upsert({
            where: { postId },
            update: {
              commentCount: { increment: 1 },
              lastCommentAt: now
            },
            create: {
              postId,
              commentCount: 1,
              lastCommentAt: now
            }
          });

          return comment;
        });

        return json(res, { ok: true, ...created }, 201);
      }
    }
  ]
};
