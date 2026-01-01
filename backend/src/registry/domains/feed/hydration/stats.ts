import { prisma } from '../../../../lib/prisma/client.js';
import type { FeedPostCandidate, FeedSuggestionCandidate, FeedStats, RatingValues } from '../types.js';

const DEFAULT_RATING_SUMS = {
  attractive: 0,
  smart: 0,
  funny: 0,
  interesting: 0
};

type RatingSums = typeof DEFAULT_RATING_SUMS;

type FeedStatsResult = {
  statsByUserId: Map<bigint, FeedStats>;
  postStatsByPostId: Map<bigint, Pick<FeedStats, 'likeCount' | 'commentCount'>>;
};

export async function buildFeedStats(
  posts: FeedPostCandidate[],
  suggestions: FeedSuggestionCandidate[],
  viewerUserId: bigint | null
): Promise<FeedStatsResult> {
  const userIds = new Set<bigint>();
  const postIds: bigint[] = [];
  for (const post of posts) {
    userIds.add(post.user.id);
    postIds.push(post.id);
  }
  for (const suggestion of suggestions) {
    userIds.add(suggestion.userId);
  }

  if (!userIds.size && !postIds.length) {
    return { statsByUserId: new Map(), postStatsByPostId: new Map() };
  }

  const userIdList = Array.from(userIds);
  const profiles = userIdList.length
    ? await prisma.profile.findMany({
        where: { userId: { in: userIdList }, deletedAt: null },
        select: { id: true, userId: true }
      })
    : [];

  const profileIdByUserId = new Map<bigint, bigint>();
  const profileIds: bigint[] = [];
  for (const profile of profiles) {
    profileIdByUserId.set(profile.userId, profile.id);
    profileIds.push(profile.id);
  }

  const [profileStatsRows, postStatsRows] = await Promise.all([
    profileIds.length
      ? prisma.profileStats.findMany({
          where: { profileId: { in: profileIds } },
          select: { profileId: true, ratingCount: true, ratingSums: true }
        })
      : Promise.resolve([]),
    postIds.length
      ? prisma.postStats.findMany({
          where: { postId: { in: postIds } },
          select: { postId: true, likeCount: true, commentCount: true }
        })
      : Promise.resolve([])
  ]);

  let viewerProfileId: bigint | null = null;
  if (viewerUserId) {
    viewerProfileId = profileIdByUserId.get(viewerUserId) ?? null;
    if (!viewerProfileId) {
      const viewerProfile = await prisma.profile.findUnique({
        where: { userId: viewerUserId },
        select: { id: true }
      });
      viewerProfileId = viewerProfile?.id ?? null;
    }
  }

  const myRatingsByProfileId = new Map<bigint, RatingValues>();
  if (viewerProfileId && profileIds.length) {
    const myRatings = await prisma.profileRating.findMany({
      where: {
        raterProfileId: viewerProfileId,
        targetProfileId: { in: profileIds }
      },
      select: { targetProfileId: true, attractive: true, smart: true, funny: true, interesting: true }
    });
    for (const rating of myRatings) {
      myRatingsByProfileId.set(rating.targetProfileId, {
        attractive: rating.attractive,
        smart: rating.smart,
        funny: rating.funny,
        interesting: rating.interesting
      });
    }
  }

  const ratingByProfileId = new Map<bigint, { count: number; sums: RatingSums }>();
  for (const row of profileStatsRows) {
    ratingByProfileId.set(row.profileId, {
      count: row.ratingCount ?? 0,
      sums: normalizeRatingSums(row.ratingSums)
    });
  }

  const statsByUserId = new Map<bigint, FeedStats>();
  for (const userId of userIds) {
    const profileId = profileIdByUserId.get(userId);
    if (!profileId) continue;
    const aggregate = ratingByProfileId.get(profileId);
    const myRating = myRatingsByProfileId.get(profileId);
    if (!aggregate && !myRating) continue;
    const stats: FeedStats = {};
    if (aggregate) {
      const ratingAverage = averageRatingFromSums(aggregate.sums, aggregate.count);
      if (ratingAverage != null) stats.ratingAverage = ratingAverage;
      stats.ratingCount = aggregate.count;
    }
    if (myRating) stats.myRating = myRating;
    statsByUserId.set(userId, stats);
  }

  const postStatsByPostId = new Map<bigint, Pick<FeedStats, 'likeCount' | 'commentCount'>>();
  for (const row of postStatsRows) {
    postStatsByPostId.set(row.postId, {
      likeCount: row.likeCount ?? 0,
      commentCount: row.commentCount ?? 0
    });
  }

  return { statsByUserId, postStatsByPostId };
}

function normalizeRatingSums(value: unknown): RatingSums {
  if (!value || typeof value !== 'object') return { ...DEFAULT_RATING_SUMS };
  const record = value as Record<string, unknown>;
  return {
    attractive: numberOrZero(record.attractive),
    smart: numberOrZero(record.smart),
    funny: numberOrZero(record.funny),
    interesting: numberOrZero(record.interesting)
  };
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function averageRatingFromSums(sums: RatingSums, count: number) {
  if (!count) return null;
  const total = sums.attractive + sums.smart + sums.funny + sums.interesting;
  return total / (count * 4);
}
