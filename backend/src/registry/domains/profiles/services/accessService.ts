// NO Prisma imports allowed - services depend ONLY on loaders and mutations
import { loadAccessRequest, loadAccessRequestById, loadFollowers, loadFollowing } from '../loaders/accessLoader.js';
import { upsertAccessRequest, updateAccessRequestStatus } from '../mutations/accessMutations.js';
import { getCompatibilityMap, resolveCompatibility } from '../../../../services/compatibility/compatibilityService.js';
import { getOrCreateFollowConversation, createFollowRequestMessage, createFollowResponseMessage } from '../../../../services/access/followConversationService.js';
import { invalidateAllSegmentsForUser } from '../../../../services/feed/presortedFeedService.js';
import type { AccessRequestInput, AccessRequestResult, AccessGrantInput, AccessGrantResult, AccessActionInput, AccessActionResult } from '../types/contracts.js';
import type { FollowerData } from '../loaders/accessLoader.js';
import type { CompatibilitySummary } from '../../../../services/compatibility/compatibilityService.js';
import type { ProfileAccessStatus } from '@prisma/client';

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

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}


export async function requestAccess(
  input: AccessRequestInput
): Promise<AccessRequestResult> {
  if (input.ownerUserId === input.viewerUserId) {
    throw new ValidationError('Cannot request access to your own profile');
  }

  // Check if profile exists
  const { loadProfile } = await import('../loaders/profileLoader.js');
  const profile = await loadProfile(input.ownerUserId, {});
  if (!profile) {
    throw new NotFoundError('Profile not found');
  }

  // Check existing status
  const existing = await loadAccessRequest(input.ownerUserId, input.viewerUserId);
  
  if (existing?.status === 'GRANTED') {
    return { status: 'GRANTED', requestId: existing.id };
  }
  if (existing?.status === 'PENDING') {
    return { status: 'PENDING', requestId: existing.id };
  }
  if (existing?.status === 'DENIED' || existing?.status === 'REVOKED') {
    throw new ForbiddenError('Access request denied');
  }

  // Create/update request
  const request = await upsertAccessRequest(input.ownerUserId, input.viewerUserId, 'PENDING');

  // Create conversation message (non-blocking)
  try {
    const conversationId = await getOrCreateFollowConversation(input.ownerUserId, input.viewerUserId);
    await createFollowRequestMessage(conversationId, request.id, input.viewerUserId, input.ownerUserId);
  } catch (err) {
    console.error('Failed to create follow request conversation:', err);
  }

  return { status: 'PENDING', requestId: request.id };
}

export async function grantAccess(
  input: AccessGrantInput
): Promise<AccessGrantResult> {
  if (input.ownerUserId === input.viewerUserId) {
    throw new ValidationError('Cannot grant access to yourself');
  }

  // Verify viewer exists
  const { getProfileIdByUserId } = await import('../loaders/profileLoader.js');
  const viewerProfileId = await getProfileIdByUserId(input.viewerUserId);
  if (!viewerProfileId) {
    throw new NotFoundError('User not found');
  }

  // Create/update access request
  const request = await upsertAccessRequest(input.ownerUserId, input.viewerUserId, 'GRANTED');

  // Invalidate feed segments (non-blocking)
  void (async () => {
    try {
      await Promise.all([
        invalidateAllSegmentsForUser(input.ownerUserId),
        invalidateAllSegmentsForUser(input.viewerUserId)
      ]);
    } catch (err) {
      console.error('Failed to invalidate presorted feed segments:', err);
    }
  })();

  return { status: 'GRANTED', requestId: request.id };
}

export async function approveAccess(
  input: AccessActionInput
): Promise<AccessActionResult> {
  const access = await loadAccessRequestById(input.requestId);
  
  if (!access) {
    throw new NotFoundError('Follow request not found');
  }

  if (access.ownerUserId !== input.ownerUserId) {
    throw new ForbiddenError('Forbidden');
  }

  if (access.status === 'GRANTED') {
    return { status: 'GRANTED', requestId: access.id };
  }

  if (access.status !== 'PENDING') {
    throw new ValidationError('Request is not pending');
  }

  const updated = await updateAccessRequestStatus(input.requestId, 'GRANTED');

  // Invalidate feed segments (non-blocking)
  void (async () => {
    try {
      await Promise.all([
        invalidateAllSegmentsForUser(access.ownerUserId),
        invalidateAllSegmentsForUser(access.viewerUserId)
      ]);
    } catch (err) {
      console.error('Failed to invalidate presorted feed segments:', err);
    }
  })();

  // Create conversation message (non-blocking)
  try {
    const conversationId = await getOrCreateFollowConversation(access.ownerUserId, access.viewerUserId);
    await createFollowResponseMessage(conversationId, access.id, access.ownerUserId, access.viewerUserId, true);
  } catch (err) {
    console.error('Failed to create follow approval message:', err);
  }

  return { status: 'GRANTED', requestId: updated.id };
}

export async function denyAccess(
  input: AccessActionInput
): Promise<AccessActionResult> {
  const access = await loadAccessRequestById(input.requestId);
  
  if (!access) {
    throw new NotFoundError('Follow request not found');
  }

  if (access.ownerUserId !== input.ownerUserId) {
    throw new ForbiddenError('Forbidden');
  }

  if (access.status === 'DENIED') {
    return { status: 'DENIED', requestId: access.id };
  }

  if (access.status !== 'PENDING') {
    throw new ValidationError('Request is not pending');
  }

  const updated = await updateAccessRequestStatus(input.requestId, 'DENIED');

  // Invalidate feed segments (non-blocking)
  void (async () => {
    try {
      await Promise.all([
        invalidateAllSegmentsForUser(access.ownerUserId),
        invalidateAllSegmentsForUser(access.viewerUserId)
      ]);
    } catch (err) {
      console.error('Failed to invalidate presorted feed segments:', err);
    }
  })();

  // Create conversation message (non-blocking)
  try {
    const conversationId = await getOrCreateFollowConversation(access.ownerUserId, access.viewerUserId);
    await createFollowResponseMessage(conversationId, access.id, access.ownerUserId, access.viewerUserId, false);
  } catch (err) {
    console.error('Failed to create follow denial message:', err);
  }

  return { status: 'DENIED', requestId: updated.id };
}

export async function cancelAccess(
  input: AccessActionInput & { viewerUserId: bigint }
): Promise<AccessActionResult> {
  const access = await loadAccessRequestById(input.requestId);
  
  if (!access) {
    throw new NotFoundError('Follow request not found');
  }

  if (access.viewerUserId !== input.viewerUserId) {
    throw new ForbiddenError('Forbidden');
  }

  if (access.status === 'CANCELED') {
    return { status: 'CANCELED', requestId: access.id };
  }

  if (access.status !== 'PENDING') {
    throw new ValidationError('Request is not pending');
  }

  const updated = await updateAccessRequestStatus(input.requestId, 'CANCELED');

  return { status: 'CANCELED', requestId: updated.id };
}

export async function revokeAccess(
  input: AccessActionInput
): Promise<AccessActionResult> {
  const access = await loadAccessRequestById(input.requestId);
  
  if (!access) {
    throw new NotFoundError('Follow request not found');
  }

  if (access.ownerUserId !== input.ownerUserId) {
    throw new ForbiddenError('Forbidden');
  }

  if (access.status === 'REVOKED') {
    return { status: 'REVOKED', requestId: access.id };
  }

  if (access.status !== 'GRANTED') {
    throw new ValidationError('Request is not granted');
  }

  const updated = await updateAccessRequestStatus(input.requestId, 'REVOKED');

  // Invalidate feed segments (non-blocking)
  void (async () => {
    try {
      await Promise.all([
        invalidateAllSegmentsForUser(access.ownerUserId),
        invalidateAllSegmentsForUser(access.viewerUserId)
      ]);
    } catch (err) {
      console.error('Failed to invalidate presorted feed segments:', err);
    }
  })();

  return { status: 'REVOKED', requestId: updated.id };
}

export async function getFollowers(
  ownerUserId: bigint,
  viewerId: bigint
): Promise<Array<{ follower: FollowerData; compatibility: CompatibilitySummary | null }>> {
  const followers = await loadFollowers(ownerUserId, { limit: 100 });
  const followerIds = followers.map(f => f.userId);
  const compatibilityMap = await getCompatibilityMap(viewerId, followerIds);

  return followers.map(follower => ({
    follower,
    compatibility: resolveCompatibility(viewerId, compatibilityMap, follower.userId)
  }));
}

export async function getFollowing(
  viewerUserId: bigint
): Promise<Array<{ follower: FollowerData; compatibility: CompatibilitySummary | null }>> {
  const following = await loadFollowing(viewerUserId, { limit: 100 });
  const followingIds = following.map(f => f.userId);
  const compatibilityMap = await getCompatibilityMap(viewerUserId, followingIds);

  return following.map(follower => ({
    follower,
    compatibility: resolveCompatibility(viewerUserId, compatibilityMap, follower.userId)
  }));
}
