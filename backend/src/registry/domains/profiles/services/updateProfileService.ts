// NO Prisma imports allowed - services depend ONLY on loaders and mutations
import { mediaService, MediaError } from '../../../../services/media/mediaService.js';
import { updateProfile as mutateProfile, type ProfileUpdateData as MutationProfileUpdateData } from '../mutations/profileMutations.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type ProfileUpdateData = MutationProfileUpdateData;

export async function updateProfile(
  userId: bigint,
  updates: ProfileUpdateData
): Promise<{ userId: bigint; updatedAt: Date }> {
  // Validate media ownership if provided
  if (updates.avatarMediaId) {
    await mediaService.assertProfileMedia(updates.avatarMediaId, userId);
  }
  if (updates.heroMediaId) {
    await mediaService.assertProfileMedia(updates.heroMediaId, userId);
  }

  return await mutateProfile(userId, updates);
}
