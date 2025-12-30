import { prisma } from '../../../../lib/prisma/client.js';
import type { FeedPostCandidate, FeedSuggestionCandidate, FeedStats, RatingValues } from '../types.js';

export async function buildFeedStats(
  posts: FeedPostCandidate[],
  suggestions: FeedSuggestionCandidate[],
  viewerUserId: bigint | null
): Promise<Map<bigint, FeedStats>> {
  const userIds = new Set<bigint>();
  for (const post of posts) {
    userIds.add(post.user.id);
  }
  for (const suggestion of suggestions) {
    userIds.add(suggestion.userId);
  }

  if (!userIds.size) return new Map<bigint, FeedStats>();
  const userIdList = Array.from(userIds);

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: userIdList }, deletedAt: null },
    select: { id: true, userId: true }
  });

  const profileIdByUserId = new Map<bigint, bigint>();
  const profileIds: bigint[] = [];
  for (const profile of profiles) {
    profileIdByUserId.set(profile.userId, profile.id);
    profileIds.push(profile.id);
  }
  if (!profileIds.length) return new Map<bigint, FeedStats>();

  const ratingAgg = await prisma.profileRating.groupBy({
    by: ['targetProfileId'],
    where: { targetProfileId: { in: profileIds } },
    _avg: { attractive: true, smart: true, funny: true, interesting: true },
    _count: { _all: true }
  });

  const ratingByProfileId = new Map<bigint, { avg: typeof ratingAgg[number]['_avg']; count: number }>();
  for (const row of ratingAgg) {
    ratingByProfileId.set(row.targetProfileId, { avg: row._avg, count: row._count._all });
  }

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
  if (viewerProfileId) {
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

  const statsByUserId = new Map<bigint, FeedStats>();
  for (const userId of userIds) {
    const profileId = profileIdByUserId.get(userId);
    if (!profileId) continue;
    const aggregate = ratingByProfileId.get(profileId);
    const myRating = myRatingsByProfileId.get(profileId);
    if (!aggregate && !myRating) continue;
    const ratingAverage = aggregate ? averageRating(aggregate.avg) : null;
    const stats: FeedStats = {};
    if (ratingAverage != null) stats.ratingAverage = ratingAverage;
    if (aggregate) stats.ratingCount = aggregate.count;
    if (myRating) stats.myRating = myRating;
    statsByUserId.set(userId, stats);
  }

  return statsByUserId;
}

export function averageRating(avg: { attractive?: number | null; smart?: number | null; funny?: number | null; interesting?: number | null }) {
  let sum = 0;
  let count = 0;
  if (typeof avg.attractive === 'number') {
    sum += avg.attractive;
    count += 1;
  }
  if (typeof avg.smart === 'number') {
    sum += avg.smart;
    count += 1;
  }
  if (typeof avg.funny === 'number') {
    sum += avg.funny;
    count += 1;
  }
  if (typeof avg.interesting === 'number') {
    sum += avg.interesting;
    count += 1;
  }
  if (!count) return null;
  return sum / count;
}
