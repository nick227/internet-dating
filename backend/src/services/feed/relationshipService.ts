import { prisma } from '../../lib/prisma/client.js';

type RelationshipIds = {
  followingIds: bigint[];
  followerIds: bigint[];
};

export async function getFollowingIds(userId: bigint): Promise<bigint[]> {
  const rows = await prisma.profileAccess.findMany({
    where: { viewerUserId: userId, status: 'GRANTED' },
    select: { ownerUserId: true }
  });
  return rows.map((row) => row.ownerUserId).filter((id) => id !== userId);
}

export async function getFollowerIds(userId: bigint): Promise<bigint[]> {
  const rows = await prisma.profileAccess.findMany({
    where: { ownerUserId: userId, status: 'GRANTED' },
    select: { viewerUserId: true }
  });
  return rows.map((row) => row.viewerUserId).filter((id) => id !== userId);
}

export async function getRelationshipIds(userId: bigint): Promise<RelationshipIds> {
  const [followingIds, followerIds] = await Promise.all([
    getFollowingIds(userId),
    getFollowerIds(userId)
  ]);

  const followingSet = new Set(followingIds);
  const filteredFollowers = followerIds.filter((id) => !followingSet.has(id));

  return {
    followingIds,
    followerIds: filteredFollowers
  };
}
