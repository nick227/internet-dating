import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseLimit, parseOptionalPositiveBigInt, parsePositiveBigInt } from '../../../lib/http/parse.js';
import { parseMentions } from '../../../services/comments/mentionParser.js';
import { toAvatarUrl } from '../../../services/media/presenter.js';
import type { MediaForAvatar } from '../profiles/types/models.js';

type CommentCreateBody = {
  cardId?: string | number;
  cardKind?: string;
  actorId?: string | number;
  text?: string;
  parentId?: string | number;
  clientRequestId?: string;
};

type CommentLikeBody = {
  like?: boolean;
};

type CommentEditBody = {
  body?: string;
};

// Helper to format comment for API response
async function formatComment(
  comment: {
    id: bigint;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    likeCount: number;
    replyCount?: number; // Optional for replies
    authorId: bigint;
    author: {
      profile: {
        displayName: string | null;
        avatarMedia: MediaForAvatar | null;
      } | null;
    };
    mentions: Array<{ userId: bigint }>;
  },
  viewerId?: bigint
) {
  const profile = comment.author.profile;
  const name = profile?.displayName ?? 'Anonymous';
  const avatarUrl = toAvatarUrl(profile?.avatarMedia ?? null);
  const mentionedUserIds = comment.mentions.map(m => String(m.userId));

  // Check if viewer liked this comment
  let myReaction: 'like' | null = null;
  if (viewerId) {
    const like = await prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId: comment.id,
          userId: viewerId,
        },
      },
      select: { id: true },
    });
    if (like) {
      myReaction = 'like';
    }
  }

  const result: any = {
    id: String(comment.id),
    body: comment.body,
    author: {
      id: String(comment.authorId),
      name,
      avatarUrl: avatarUrl ?? undefined,
    },
    createdAt: comment.createdAt.toISOString(),
    likeCount: comment.likeCount,
    myReaction,
    mentionedUserIds,
  };

  // Only include replyCount for root comments
  if (comment.replyCount !== undefined) {
    result.replyCount = comment.replyCount;
  }

  return result;
}

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
            clientRequestId,
          },
          select: { id: true, createdAt: true },
        });
        if (existing) {
          return json(res, { ok: true, id: existing.id, createdAt: existing.createdAt }, 200);
        }

        const post = await prisma.post.findFirst({
          where: { id: postId, deletedAt: null },
          select: { id: true, userId: true },
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
              status: 'ACTIVE',
            },
            select: { id: true, rootId: true },
          });
          if (!parent) return json(res, { error: 'Parent comment not found' }, 404);
          resolvedParentId = parent.id;
          resolvedRootId = parent.rootId ?? parent.id;
        }

        // Parse mentions
        const mentionedUserIds = await parseMentions(text.trim(), post.userId);

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
              rootId: resolvedRootId,
            },
            select: { id: true, createdAt: true },
          });

          // Create mention records
          if (mentionedUserIds.length > 0) {
            await tx.commentMention.createMany({
              data: mentionedUserIds.map(userId => ({
                commentId: comment.id,
                userId,
              })),
            });
          }

          // Update parent's replyCount if this is a reply
          if (resolvedParentId) {
            await tx.comment.update({
              where: { id: resolvedParentId },
              data: {
                replyCount: { increment: 1 },
              },
            });
          }

          // Update PostStats
          await tx.postStats.upsert({
            where: { postId },
            update: {
              commentCount: { increment: 1 },
              lastCommentAt: now,
            },
            create: {
              postId,
              commentCount: 1,
              lastCommentAt: now,
            },
          });

          return comment;
        });

        return json(res, { ok: true, ...created }, 201);
      },
    },
    {
      id: 'comments.GET./comments',
      method: 'GET',
      path: '/comments',
      auth: Auth.public(),
      summary: 'List comments for a post',
      tags: ['comments'],
      handler: async (req, res) => {
        const viewerId = req.ctx.userId;
        const { cardId, cardKind, cursorId, take, sort } = req.query;

        if (cardKind !== 'post') {
          return json(res, { error: 'cardKind must be post' }, 400);
        }

        const postParsed = parsePositiveBigInt(cardId, 'cardId');
        if (!postParsed.ok) return json(res, { error: postParsed.error }, 400);
        const postId = postParsed.value;

        const takeParsed = parseLimit(take, 20, 50, 'take');
        if (!takeParsed.ok) return json(res, { error: takeParsed.error }, 400);
        const limit = takeParsed.value;

        const cursorParsed = parseOptionalPositiveBigInt(cursorId, 'cursorId');
        if (!cursorParsed.ok) return json(res, { error: cursorParsed.error }, 400);
        const cursorCommentId = cursorParsed.value;

        const sortMode = sort === 'popular' ? 'popular' : 'recent';

        // Build where clause
        const where: any = {
          targetKind: 'POST',
          targetId: postId,
          parentId: null, // Root comments only
          status: 'ACTIVE',
        };

        if (cursorCommentId) {
          const cursorComment = await prisma.comment.findUnique({
            where: { id: cursorCommentId },
            select: { createdAt: true, likeCount: true },
          });
          if (cursorComment) {
            if (sortMode === 'popular') {
              where.OR = [
                { likeCount: { lt: cursorComment.likeCount } },
                {
                  likeCount: cursorComment.likeCount,
                  createdAt: { lt: cursorComment.createdAt },
                },
              ];
            } else {
              where.createdAt = { lt: cursorComment.createdAt };
            }
          }
        }

        // Fetch root comments
        const comments = await prisma.comment.findMany({
          where,
          orderBy:
            sortMode === 'popular'
              ? [{ likeCount: 'desc' }, { createdAt: 'desc' }]
              : [{ createdAt: 'desc' }],
          take: limit + 1, // Fetch one extra to check for next page
          select: {
            id: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            likeCount: true,
            replyCount: true,
            authorId: true,
            author: {
              select: {
                profile: {
                  select: {
                    displayName: true,
                    avatarMedia: {
                      select: {
                        id: true,
                        type: true,
                        storageKey: true,
                        variants: true,
                        url: true,
                        thumbUrl: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              select: {
                userId: true,
              },
            },
          },
        });

        const hasMore = comments.length > limit;
        const commentsToReturn = hasMore ? comments.slice(0, limit) : comments;
        const nextCursorId = hasMore ? String(commentsToReturn[commentsToReturn.length - 1].id) : undefined;

        const formatted = await Promise.all(
          commentsToReturn.map(comment => formatComment(comment, viewerId))
        );

        return json(res, {
          comments: formatted,
          nextCursorId,
        });
      },
    },
    {
      id: 'comments.GET./comments/:commentId/replies',
      method: 'GET',
      path: '/comments/:commentId/replies',
      auth: Auth.public(),
      summary: 'Get replies for a comment',
      tags: ['comments'],
      handler: async (req, res) => {
        const viewerId = req.ctx.userId;
        const { commentId } = req.params;
        const { cursorId, take } = req.query;

        const commentIdParsed = parsePositiveBigInt(commentId, 'commentId');
        if (!commentIdParsed.ok) return json(res, { error: commentIdParsed.error }, 400);

        const takeParsed = parseLimit(take, 10, 50, 'take');
        if (!takeParsed.ok) return json(res, { error: takeParsed.error }, 400);
        const limit = takeParsed.value;

        const cursorParsed = parseOptionalPositiveBigInt(cursorId, 'cursorId');
        if (!cursorParsed.ok) return json(res, { error: cursorParsed.error }, 400);
        const cursorReplyId = cursorParsed.value;

        // Verify parent comment exists
        const parent = await prisma.comment.findUnique({
          where: { id: commentIdParsed.value },
          select: { id: true },
        });
        if (!parent) return json(res, { error: 'Comment not found' }, 404);

        const where: any = {
          parentId: commentIdParsed.value,
          status: 'ACTIVE',
        };

        if (cursorReplyId) {
          const cursorReply = await prisma.comment.findUnique({
            where: { id: cursorReplyId },
            select: { createdAt: true },
          });
          if (cursorReply) {
            where.createdAt = { gt: cursorReply.createdAt };
          }
        }

        // Fetch replies (ordered by createdAt ASC - oldest first)
        const replies = await prisma.comment.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }],
          take: limit + 1,
          select: {
            id: true,
            body: true,
            createdAt: true,
            updatedAt: true,
            likeCount: true,
            authorId: true,
            author: {
              select: {
                profile: {
                  select: {
                    displayName: true,
                    avatarMedia: {
                      select: {
                        id: true,
                        type: true,
                        storageKey: true,
                        variants: true,
                        url: true,
                        thumbUrl: true,
                      },
                    },
                  },
                },
              },
            },
            mentions: {
              select: {
                userId: true,
              },
            },
          },
        });

        const hasMore = replies.length > limit;
        const repliesToReturn = hasMore ? replies.slice(0, limit) : replies;
        const nextCursorId = hasMore ? String(repliesToReturn[repliesToReturn.length - 1].id) : undefined;

        const formatted = await Promise.all(
          repliesToReturn.map(reply => formatComment({ ...reply, replyCount: undefined }, viewerId))
        );

        return json(res, {
          replies: formatted,
          nextCursorId,
        });
      },
    },
    {
      id: 'comments.POST./comments/:commentId/like',
      method: 'POST',
      path: '/comments/:commentId/like',
      auth: Auth.user(),
      summary: 'Like or unlike a comment',
      tags: ['comments'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const { commentId } = req.params;
        const body = (req.body ?? {}) as CommentLikeBody;

        const commentIdParsed = parsePositiveBigInt(commentId, 'commentId');
        if (!commentIdParsed.ok) return json(res, { error: commentIdParsed.error }, 400);

        // Verify comment exists
        const comment = await prisma.comment.findUnique({
          where: { id: commentIdParsed.value },
          select: { id: true, status: true, likeCount: true },
        });
        if (!comment || comment.status !== 'ACTIVE') {
          return json(res, { error: 'Comment not found' }, 404);
        }

        const existingLike = await prisma.commentLike.findUnique({
          where: {
            commentId_userId: {
              commentId: commentIdParsed.value,
              userId,
            },
          },
          select: { id: true },
        });

        const shouldLike = body.like !== undefined ? body.like : !existingLike;

        const result = await prisma.$transaction(async (tx) => {
          if (shouldLike && !existingLike) {
            // Like
            await tx.commentLike.create({
              data: {
                commentId: commentIdParsed.value,
                userId,
              },
            });
            await tx.comment.update({
              where: { id: commentIdParsed.value },
              data: {
                likeCount: { increment: 1 },
              },
            });
            return { liked: true, likeCount: comment.likeCount + 1 };
          } else if (!shouldLike && existingLike) {
            // Unlike
            await tx.commentLike.delete({
              where: {
                commentId_userId: {
                  commentId: commentIdParsed.value,
                  userId,
                },
              },
            });
            const newCount = Math.max(0, comment.likeCount - 1);
            await tx.comment.update({
              where: { id: commentIdParsed.value },
              data: {
                likeCount: newCount,
              },
            });
            return { liked: false, likeCount: newCount };
          }
          // No change
          return { liked: !!existingLike, likeCount: comment.likeCount };
        });

        return json(res, {
          ok: true,
          ...result,
        });
      },
    },
    {
      id: 'comments.DELETE./comments/:commentId',
      method: 'DELETE',
      path: '/comments/:commentId',
      auth: Auth.user(),
      summary: 'Delete a comment',
      tags: ['comments'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const { commentId } = req.params;

        const commentIdParsed = parsePositiveBigInt(commentId, 'commentId');
        if (!commentIdParsed.ok) return json(res, { error: commentIdParsed.error }, 400);

        const comment = await prisma.comment.findUnique({
          where: { id: commentIdParsed.value },
          select: {
            id: true,
            authorId: true,
            parentId: true,
            targetId: true,
            targetKind: true,
            status: true,
          },
        });

        if (!comment || comment.status === 'DELETED') {
          return json(res, { error: 'Comment not found' }, 404);
        }

        // Authorization: author or post owner can delete
        const isAuthor = comment.authorId === userId;
        let isPostOwner = false;

        if (comment.targetKind === 'POST') {
          const post = await prisma.post.findUnique({
            where: { id: comment.targetId },
            select: { userId: true },
          });
          isPostOwner = post?.userId === userId;
        }

        if (!isAuthor && !isPostOwner) {
          return json(res, { error: 'Unauthorized' }, 403);
        }

        await prisma.$transaction(async (tx) => {
          // Soft delete
          await tx.comment.update({
            where: { id: commentIdParsed.value },
            data: {
              status: 'DELETED',
              deletedAt: new Date(),
              body: '[deleted]',
            },
          });

          // Update parent's replyCount if this is a reply
          if (comment.parentId) {
            await tx.comment.update({
              where: { id: comment.parentId },
              data: {
                replyCount: { decrement: 1 },
              },
            });
          }
        });

        return json(res, { ok: true });
      },
    },
    {
      id: 'comments.PATCH./comments/:commentId',
      method: 'PATCH',
      path: '/comments/:commentId',
      auth: Auth.user(),
      summary: 'Edit a comment',
      tags: ['comments'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const { commentId } = req.params;
        const body = (req.body ?? {}) as CommentEditBody;

        const commentIdParsed = parsePositiveBigInt(commentId, 'commentId');
        if (!commentIdParsed.ok) return json(res, { error: commentIdParsed.error }, 400);

        const trimmedBody = typeof body.body === 'string' ? body.body.trim() : '';
        if (!trimmedBody) {
          return json(res, { error: 'body is required' }, 400);
        }

        const comment = await prisma.comment.findUnique({
          where: { id: commentIdParsed.value },
          select: {
            id: true,
            authorId: true,
            targetId: true,
            targetKind: true,
            status: true,
          },
        });

        if (!comment || comment.status !== 'ACTIVE') {
          return json(res, { error: 'Comment not found' }, 404);
        }

        // Authorization: only author can edit
        if (comment.authorId !== userId) {
          return json(res, { error: 'Unauthorized' }, 403);
        }

        // Get post author for mention parsing
        let postAuthorId = userId;
        if (comment.targetKind === 'POST') {
          const post = await prisma.post.findUnique({
            where: { id: comment.targetId },
            select: { userId: true },
          });
          if (post) {
            postAuthorId = post.userId;
          }
        }

        // Parse mentions from new body
        const mentionedUserIds = await parseMentions(trimmedBody, postAuthorId);

        const updated = await prisma.$transaction(async (tx) => {
          // Delete existing mentions
          await tx.commentMention.deleteMany({
            where: { commentId: commentIdParsed.value },
          });

          // Create new mentions
          if (mentionedUserIds.length > 0) {
            await tx.commentMention.createMany({
              data: mentionedUserIds.map(uid => ({
                commentId: commentIdParsed.value,
                userId: uid,
              })),
            });
          }

          // Update comment body
          const updatedComment = await tx.comment.update({
            where: { id: commentIdParsed.value },
            data: {
              body: trimmedBody,
            },
            select: {
              id: true,
              body: true,
              updatedAt: true,
            },
          });

          return updatedComment;
        });

        return json(res, {
          ok: true,
          id: String(updated.id),
          body: updated.body,
          updatedAt: updated.updatedAt.toISOString(),
          mentionedUserIds: mentionedUserIds.map(id => String(id)),
        });
      },
    },
  ],
};
