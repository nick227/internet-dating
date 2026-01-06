import { prisma } from '../../../../lib/prisma/client.js';
import { mediaSelectBase } from '../types/models.js';
import type { MediaRecord } from '../types/models.js';

export type MatchScoreRow = {
  candidateUserId: bigint;
  score: number;
  reasons: unknown;
  distanceKm: number | null;
  algorithmVersion?: string | null;
};

export type RecommendationProfile = {
  userId: bigint;
  displayName: string | null;
  bio: string | null;
  locationText: string | null;
  birthdate: Date | null;
  gender: string | null;
  intent: string | null;
  avatarMedia: MediaRecord | null;
  heroMedia: MediaRecord | null;
};

export async function loadMatchScoreCursor(
  userId: bigint,
  candidateUserId: bigint
): Promise<number | null> {
  const cursorRow = await prisma.matchScore.findUnique({
    where: { userId_candidateUserId: { userId, candidateUserId } },
    select: { score: true }
  });
  return cursorRow?.score ?? null;
}

export async function loadRecentMatchScores(
  userId: bigint,
  options: {
    limit: number;
    cursorUserId?: bigint;
    cursorScore?: number;
    minAge?: Date;
    algorithmVersion?: string | null;
    maxDistanceKm?: number;
  }
): Promise<MatchScoreRow[]> {
  const { limit, cursorUserId, cursorScore, minAge, algorithmVersion, maxDistanceKm } = options;
  
  let cursorWhere: Record<string, unknown> = {};
  if (cursorUserId !== undefined && cursorScore !== undefined) {
    cursorWhere = {
      OR: [
        { score: { lt: cursorScore } },
        { AND: [
          { score: cursorScore },
          { candidateUserId: { lt: cursorUserId } }
        ]}
      ]
    };
  }

  const scored = await prisma.matchScore.findMany({
    where: {
      userId,
      scoredAt: minAge ? { gte: minAge } : undefined,
      algorithmVersion: algorithmVersion !== undefined ? algorithmVersion : undefined,
      distanceKm: maxDistanceKm !== undefined 
        ? { lte: maxDistanceKm, not: null }  // Exclude null distances when filtering
        : undefined,
      ...cursorWhere
    },
    orderBy: [{ score: 'desc' }, { candidateUserId: 'desc' }],
    take: limit + 1,
    select: { 
      candidateUserId: true, 
      score: true,
      reasons: true,
      distanceKm: true,
      algorithmVersion: true
    } as const
  });

  return scored;
}

export async function checkMatchScoresExist(userId: bigint): Promise<boolean> {
  const count = await prisma.matchScore.count({
    where: { userId },
    take: 1
  });
  return count > 0;
}

export async function loadRecommendationProfiles(
  userIds: bigint[],
  viewerId: bigint
): Promise<RecommendationProfile[]> {
  const profiles = await prisma.profile.findMany({
    where: {
      userId: { 
        in: userIds.filter(id => id !== viewerId),
        not: viewerId
      },
      deletedAt: null,
      isVisible: true,
      user: { deletedAt: null }
    },
    select: {
      userId: true,
      displayName: true,
      bio: true,
      locationText: true,
      birthdate: true,
      gender: true,
      intent: true,
      avatarMedia: {
        select: mediaSelectBase
      },
      heroMedia: {
        select: mediaSelectBase
      }
    }
  });

  return profiles.map(p => ({
    userId: p.userId,
    displayName: p.displayName,
    bio: p.bio,
    locationText: p.locationText,
    birthdate: p.birthdate,
    gender: p.gender,
    intent: p.intent,
    avatarMedia: p.avatarMedia,
    heroMedia: p.heroMedia
  }));
}
