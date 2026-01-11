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


const postSelect = {
  id: true,
  text: true,
  createdAt: true,
  user: { select: { id: true, profile: { select: { displayName: true } } } },
  media: {
    orderBy: { order: 'asc' },
    select: {
      order: true,
      media: {
        select: {
          id: true,
          type: true,
          url: true,
          thumbUrl: true,
          width: true,
          height: true,
          durationSec: true,
          storageKey: true,
          variants: true
        }
      }
    }
  }
} as const; // using 'as const' to help with type inference if needed

function mapToCandidate(post: any): FeedPostCandidate {
  const mediaItems = post.media?.map((pm: any) => ({
    order: pm.order,
    media: pm.media
  })) || [];

  let mediaType: 'text' | 'image' | 'video' | 'mixed' = 'text';
  if (mediaItems.length > 1) {
    mediaType = 'mixed';
  } else if (mediaItems.length === 1) {
    const type = mediaItems[0].media.type;
    if (type === 'VIDEO') mediaType = 'video';
    else if (type === 'IMAGE') mediaType = 'image';
  }

  return {
    id: post.id,
    text: post.text,
    createdAt: post.createdAt,
    user: post.user,
    media: mediaItems,
    mediaType
  };
}

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

  const [selfRaw, followingRaw, followersRaw] = await Promise.all([
    prisma.post.findMany({
      where: {
        ...baseWhere,
        userId: ctx.userId
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: feedCandidateCaps.posts.selfMaxItems,
      select: postSelect
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
          select: postSelect
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
          select: postSelect
        })
      : Promise.resolve([])
  ]);

  return {
    self: selfRaw.map(mapToCandidate),
    following: followingRaw.map(mapToCandidate),
    followers: followersRaw.map(mapToCandidate)
  };
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

  const postsRaw = await prisma.post.findMany({
    where: {
      deletedAt: null,
      visibility: 'PUBLIC',
      user: { deletedAt: null, ...blockFilter },
      ...(createdAtCutoff ? { createdAt: { gte: createdAtCutoff } } : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: candidateLimit,
    ...(ctx.cursorId ? { cursor: { id: ctx.cursorId }, skip: 1 } : {}),
    select: postSelect
  });

  const nextCursorId =
    postsRaw.length >= ctx.take ? postsRaw[Math.min(ctx.take, postsRaw.length) - 1]!.id : null;

  return { items: postsRaw.map(mapToCandidate), nextCursorId };
}
