import { prisma } from '../../../../lib/prisma/client.js';
import type { FeedPostCandidate, FeedPostResult, ViewerContext } from '../types.js';
import { feedCandidateCaps } from './caps.js';

type CursorCutoff = {
  id: bigint;
  createdAt: Date;
};

export type RelationshipPostCandidates = {
  self: FeedPostCandidate[];
  following: FeedPostCandidate[];
  followers: FeedPostCandidate[];
};

const buildCursorFilter = (cursorCutoff?: CursorCutoff | null) => {
  if (!cursorCutoff) return {};
  return {
    OR: [
      { createdAt: { lt: cursorCutoff.createdAt } },
      { createdAt: cursorCutoff.createdAt, id: { lt: cursorCutoff.id } }
    ]
  };
};

export async function getRelationshipPostCandidates(
  ctx: ViewerContext,
  ids: { followingIds: bigint[]; followerIds: bigint[] },
  cursorCutoff?: CursorCutoff | null
): Promise<RelationshipPostCandidates> {
  if (!ctx.userId) {
    return { self: [], following: [], followers: [] };
  }

  const blockFilter = {
    blocksGot: { none: { blockerId: ctx.userId } },
    blocksMade: { none: { blockedId: ctx.userId } }
  };

  const lookbackDays = feedCandidateCaps.posts.maxLookbackDays;
  const createdAtCutoff =
    lookbackDays > 0 ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) : null;
  const cursorFilter = buildCursorFilter(cursorCutoff);

  const baseWhere = {
    deletedAt: null,
    ...(createdAtCutoff ? { createdAt: { gte: createdAtCutoff } } : {}),
    ...cursorFilter
  };

  const followingIds = ids.followingIds.filter((id) => id !== ctx.userId);
  const followerIds = ids.followerIds.filter((id) => id !== ctx.userId);

  const [self, following, followers] = await Promise.all([
    prisma.post.findMany({
      where: {
        ...baseWhere,
        userId: ctx.userId
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: feedCandidateCaps.posts.selfMaxItems,
      select: {
        id: true,
        text: true,
        createdAt: true,
        user: { select: { id: true, profile: { select: { displayName: true } } } }
      }
    }),
    followingIds.length
      ? prisma.post.findMany({
          where: {
            ...baseWhere,
            userId: { in: followingIds },
            visibility: { in: ['PUBLIC', 'PRIVATE'] },
            user: { deletedAt: null, ...blockFilter }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: feedCandidateCaps.posts.followingMaxItems,
          select: {
            id: true,
            text: true,
            createdAt: true,
            user: { select: { id: true, profile: { select: { displayName: true } } } }
          }
        })
      : Promise.resolve([]),
    followerIds.length
      ? prisma.post.findMany({
          where: {
            ...baseWhere,
            userId: { in: followerIds },
            visibility: 'PUBLIC',
            user: { deletedAt: null, ...blockFilter }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: feedCandidateCaps.posts.followersMaxItems,
          select: {
            id: true,
            text: true,
            createdAt: true,
            user: { select: { id: true, profile: { select: { displayName: true } } } }
          }
        })
      : Promise.resolve([])
  ]);

  return { self, following, followers };
}

export async function getPostCandidates(ctx: ViewerContext): Promise<FeedPostResult> {
  // Build block filter if user is authenticated
  const blockFilter = ctx.userId
    ? {
        blocksGot: { none: { blockerId: ctx.userId } },
        blocksMade: { none: { blockedId: ctx.userId } }
      }
    : {};

  const candidateLimit = Math.max(ctx.take, feedCandidateCaps.posts.maxItems);
  const lookbackDays = feedCandidateCaps.posts.maxLookbackDays;
  const createdAtCutoff =
    lookbackDays > 0 ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000) : null;

  const posts = await prisma.post.findMany({
    where: {
      deletedAt: null,
      visibility: 'PUBLIC',
      user: { deletedAt: null, ...blockFilter },
      ...(createdAtCutoff ? { createdAt: { gte: createdAtCutoff } } : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: candidateLimit,
    ...(ctx.cursorId ? { cursor: { id: ctx.cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      text: true,
      createdAt: true,
      user: { select: { id: true, profile: { select: { displayName: true } } } }
    }
  });

  const nextCursorId =
    posts.length >= ctx.take ? posts[Math.min(ctx.take, posts.length) - 1]!.id : null;

  return { items: posts, nextCursorId };
}
