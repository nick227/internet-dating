import { prisma } from '../../../../lib/prisma/client.js';
import { mediaSelectBase } from '../types/models.js';
import type { ProfileAccessStatus } from '@prisma/client';

export type AccessRequestRecord = {
  id: bigint;
  ownerUserId: bigint;
  viewerUserId: bigint;
  status: ProfileAccessStatus;
};

export type FollowerData = {
  id: bigint;
  userId: bigint;
  displayName: string | null;
  avatarMedia: {
    id: bigint;
    type: string;
    url: string | null;
    thumbUrl: string | null;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    storageKey: string | null;
    variants: unknown;
  } | null | undefined;
  status: ProfileAccessStatus;
  createdAt: Date;
  updatedAt: Date;
};

export async function loadPrivateContentFlags(
  userId: bigint
): Promise<{ hasPrivatePosts: boolean; hasPrivateMedia: boolean }> {
  const [privatePost, privateMedia] = await Promise.all([
    prisma.post.findFirst({
      where: { userId, deletedAt: null, visibility: 'PRIVATE' },
      select: { id: true }
    }),
    prisma.media.findFirst({
      where: { ownerUserId: userId, deletedAt: null, visibility: 'PRIVATE' },
      select: { id: true }
    })
  ]);

  return {
    hasPrivatePosts: Boolean(privatePost),
    hasPrivateMedia: Boolean(privateMedia)
  };
}

export async function loadAccessRequest(
  ownerUserId: bigint,
  viewerUserId: bigint
): Promise<AccessRequestRecord | null> {
  const access = await prisma.profileAccess.findUnique({
    where: { ownerUserId_viewerUserId: { ownerUserId, viewerUserId } },
    select: { id: true, ownerUserId: true, viewerUserId: true, status: true }
  });
  return access;
}

export async function loadAccessRequestById(requestId: bigint): Promise<AccessRequestRecord | null> {
  const access = await prisma.profileAccess.findUnique({
    where: { id: requestId },
    select: { id: true, ownerUserId: true, viewerUserId: true, status: true }
  });
  return access;
}

export async function loadFollowers(
  ownerUserId: bigint,
  options: { limit?: number } = {}
): Promise<FollowerData[]> {
  const followers = await prisma.profileAccess.findMany({
    where: {
      ownerUserId,
      status: { in: ['PENDING', 'GRANTED'] }
    },
    orderBy: { updatedAt: 'desc' },
    take: options.limit ?? 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      viewer: {
        select: {
          id: true,
          profile: {
            select: {
              displayName: true,
              avatarMedia: { select: mediaSelectBase }
            }
          }
        }
      }
    }
  });

  return followers.map(f => ({
    id: f.id,
    userId: f.viewer.id,
    displayName: f.viewer.profile?.displayName ?? null,
    avatarMedia: f.viewer.profile?.avatarMedia,
    status: f.status as ProfileAccessStatus,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt
  }));
}

export async function loadFollowing(
  viewerUserId: bigint,
  options: { limit?: number } = {}
): Promise<FollowerData[]> {
  const following = await prisma.profileAccess.findMany({
    where: {
      viewerUserId,
      status: { in: ['PENDING', 'GRANTED'] }
    },
    orderBy: { updatedAt: 'desc' },
    take: options.limit ?? 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          profile: {
            select: {
              displayName: true,
              avatarMedia: { select: mediaSelectBase }
            }
          }
        }
      }
    }
  });

  return following.map(f => ({
    id: f.id,
    userId: f.owner.id,
    displayName: f.owner.profile?.displayName ?? null,
    avatarMedia: f.owner.profile?.avatarMedia,
    status: f.status as ProfileAccessStatus,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt
  }));
}

