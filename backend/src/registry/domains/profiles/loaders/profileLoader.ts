import { prisma } from '../../../../lib/prisma/client.js';
import { profileSelectWithMedia } from '../types/models.js';
import type { ProfileWithMedia } from '../types/models.js';

// Loader returns null for not found (NOT throw)
// Throws only for actual DB/runtime errors
export async function loadProfile(
  userId: bigint,
  options: {
    isOwner?: boolean;
  } = {}
): Promise<ProfileWithMedia | null> {
  const profile = await prisma.profile.findFirst({
    where: {
      userId,
      deletedAt: null,
      user: { deletedAt: null },
      ...(options.isOwner ? {} : { isVisible: true })
    },
    select: profileSelectWithMedia
  });

  if (!profile) return null;
  return profile;
}

export async function getProfileIdByUserId(userId: bigint): Promise<bigint | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true }
  });
  return profile?.id ?? null;
}
