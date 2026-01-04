import { prisma } from '../../../../lib/prisma/client.js';
import type { Gender, DatingIntent } from '@prisma/client';

export type ProfileUpdateData = {
  displayName?: string | null;
  bio?: string | null;
  birthdate?: Date | null;
  locationText?: string | null;
  lat?: number | null;
  lng?: number | null;
  gender?: Gender;
  intent?: DatingIntent;
  isVisible?: boolean | null;
  avatarMediaId?: bigint | null;
  heroMediaId?: bigint | null;
};

export async function updateProfile(
  userId: bigint,
  updates: ProfileUpdateData
): Promise<{ userId: bigint; updatedAt: Date }> {
  return await prisma.profile.update({
    where: { userId },
    data: {
      displayName: updates.displayName ?? undefined,
      bio: updates.bio ?? undefined,
      birthdate: updates.birthdate,
      locationText: updates.locationText ?? undefined,
      lat: updates.lat,
      lng: updates.lng,
      gender: updates.gender,
      intent: updates.intent,
      isVisible: updates.isVisible ?? undefined,
      ...(updates.avatarMediaId !== undefined ? { avatarMediaId: updates.avatarMediaId } : {}),
      ...(updates.heroMediaId !== undefined ? { heroMediaId: updates.heroMediaId } : {})
    },
    select: { userId: true, updatedAt: true }
  });
}
