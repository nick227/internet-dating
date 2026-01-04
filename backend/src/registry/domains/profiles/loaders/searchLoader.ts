import { prisma } from '../../../../lib/prisma/client.js';
import { mediaSelectBase } from '../types/models.js';
import type { MediaRecord } from '../types/models.js';

export type SearchProfile = {
  userId: bigint;
  displayName: string | null;
  avatarMedia: MediaRecord | null;
};

export async function loadBlockedUserIds(viewerId: bigint | null | undefined): Promise<bigint[]> {
  if (!viewerId) return [];
  
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
    },
    select: {
      blockerId: true,
      blockedId: true,
    },
  });
  
  return blocks.map(b => (b.blockerId === viewerId ? b.blockedId : b.blockerId));
}

export async function loadSearchProfiles(
  searchQuery: string,
  viewerId: bigint | null | undefined,
  blockedUserIds: bigint[],
  limit: number
): Promise<SearchProfile[]> {
  const profiles = await prisma.profile.findMany({
    where: {
      displayName: {
        contains: searchQuery,
      },
      isVisible: true,
      deletedAt: null,
      user: {
        deletedAt: null,
        ...(viewerId ? { id: { not: viewerId } } : {}),
      },
      ...(blockedUserIds.length > 0 ? { userId: { notIn: blockedUserIds } } : {}),
    },
    take: limit,
    orderBy: {
      displayName: 'asc',
    },
    select: {
      userId: true,
      displayName: true,
      avatarMedia: {
        select: mediaSelectBase
      },
    },
  });

  return profiles.map(p => ({
    userId: p.userId,
    displayName: p.displayName,
    avatarMedia: p.avatarMedia
  }));
}
