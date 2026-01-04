// NO Prisma imports allowed - services depend ONLY on loaders and mutations
import { getProfileIdByUserId } from '../loaders/profileLoader.js';
import { upsertRating } from '../mutations/ratingMutations.js';
import type { RatingValues as MutationRatingValues } from '../mutations/ratingMutations.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export type RatingValues = MutationRatingValues;

export async function submitRating(
  raterUserId: bigint,
  targetUserId: bigint,
  ratings: RatingValues
): Promise<void> {
  if (raterUserId === targetUserId) {
    throw new ValidationError('Cannot rate yourself');
  }

  // Get profile IDs
  const raterProfileId = await getProfileIdByUserId(raterUserId);
  const targetProfileId = await getProfileIdByUserId(targetUserId);
  
  if (!raterProfileId || !targetProfileId) {
    throw new NotFoundError('Profile not found');
  }

  await upsertRating(raterProfileId, targetProfileId, ratings);
}
