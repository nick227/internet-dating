import { prisma } from '../../../../lib/prisma/client.js';
import { postSelectForProfile } from '../types/models.js';
import type { PostForProfile } from '../types/models.js';

export async function loadProfilePosts(
  userId: bigint,
  options: {
    limit?: number;
    canViewPrivate?: boolean;
  } = {}
): Promise<PostForProfile[]> {
  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { userId },
        { targetProfileUserId: userId }
      ],
      deletedAt: null,
      ...(options.canViewPrivate ? {} : { visibility: 'PUBLIC' })
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit ?? 30,
    select: postSelectForProfile
  });

  return posts;
}
