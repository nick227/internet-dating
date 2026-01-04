// NO Prisma imports allowed - services depend ONLY on loaders
import { loadProfile, getProfileIdByUserId } from '../loaders/profileLoader.js';
import { loadProfilePosts } from '../loaders/postsLoader.js';
import { loadProfileRatings } from '../loaders/ratingsLoader.js';
import { loadPrivateContentFlags } from '../loaders/accessLoader.js';
import { getProfileAccessSummary } from '../../../../services/access/profileAccessService.js';
import { getCompatibilityMap, resolveCompatibility } from '../../../../services/compatibility/compatibilityService.js';
import type { ProfileViewInput, ProfileViewResult } from '../types/contracts.js';

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export async function getProfileView(
  input: ProfileViewInput
): Promise<ProfileViewResult> {
  // 1. Load profile data using loader
  const profile = await loadProfile(input.targetUserId, {
    isOwner: input.viewerId === input.targetUserId
  });

  if (!profile) {
    throw new NotFoundError('Profile not found');
  }

  // 2. Check access (using existing service)
  const accessSummary = await getProfileAccessSummary(input.targetUserId, input.viewerId);

  // 3. Load related data using loaders
  const posts = await loadProfilePosts(input.targetUserId, {
    limit: 30,
    canViewPrivate: accessSummary.status === 'GRANTED'
  });

  const viewerProfileId = input.viewerId ? await getProfileIdByUserId(input.viewerId) : null;
  const ratings = await loadProfileRatings(profile.id, viewerProfileId);

  const privateFlags = await loadPrivateContentFlags(input.targetUserId);

  // 4. Load compatibility
  const compatibilityMap = await getCompatibilityMap(input.viewerId, input.viewerId ? [input.targetUserId] : []);
  const compatibility = resolveCompatibility(input.viewerId, compatibilityMap, input.targetUserId);

  // 5. Return structured result (models, not DTOs)
  return {
    profile,
    posts,
    ratings,
    access: {
      status: accessSummary.status,
      requestId: accessSummary.requestId,
      hasPrivatePosts: privateFlags.hasPrivatePosts,
      hasPrivateMedia: privateFlags.hasPrivateMedia
    },
    compatibility
  };
}
