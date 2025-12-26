import { prisma } from '../../lib/prisma/client.js';
import { toPublicMedia } from '../media/presenter.js';

export async function listFeed(params: {
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(params.limit ?? 20, 50);

  const posts = await prisma.post.findMany({
    where: {
      visibility: 'PUBLIC',
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor
      ? { cursor: { id: BigInt(params.cursor) }, skip: 1 }
      : {}),
    include: {
      media: {
        include: {
          media: true
        }
      }
    },
  });

  const hasNext = posts.length > limit;
  const items = posts.slice(0, limit);

  return {
    items: items.map(p => ({
      type: 'post',
      id: p.id.toString(),
      userId: p.userId.toString(),
      text: p.text,
      media: p.media.map(m => toPublicMedia(m.media)),
      createdAt: p.createdAt.toISOString(),
    })),
    nextCursor: hasNext ? items[items.length - 1].id.toString() : null,
  };
}
