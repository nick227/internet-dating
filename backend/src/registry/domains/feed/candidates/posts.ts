import { prisma } from '../../../../lib/prisma/client.js';
import type { FeedPostResult, ViewerContext } from '../types.js';
import { feedCandidateCaps } from './caps.js';

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
