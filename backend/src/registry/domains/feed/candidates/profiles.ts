import { prisma } from '../../../../lib/prisma/client.js';
import type { FeedSuggestionCandidate, ViewerContext } from '../types.js';
import { feedCandidateCaps } from './caps.js';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export async function getProfileSuggestions(ctx: ViewerContext): Promise<FeedSuggestionCandidate[]> {
  if (!ctx.userId) return [];
  const me = ctx.userId;
  const candidateLimit = feedCandidateCaps.suggestions.maxItems;
  const matchLimit = Math.min(feedCandidateCaps.suggestions.maxMatchItems, candidateLimit);

  const matches = await prisma.match.findMany({
    where: {
      state: 'ACTIVE',
      OR: [{ userAId: me }, { userBId: me }]
    },
    orderBy: { updatedAt: 'desc' },
    take: matchLimit,
    select: { userAId: true, userBId: true }
  });

  const matchUserIds: bigint[] = [];
  const seenMatchIds = new Set<bigint>();
  for (const match of matches) {
    const otherId = match.userAId === me ? match.userBId : match.userAId;
    if (!seenMatchIds.has(otherId)) {
      seenMatchIds.add(otherId);
      matchUserIds.push(otherId);
    }
  }

  const matchProfiles = matchUserIds.length
    ? await prisma.profile.findMany({
        where: {
          deletedAt: null,
          isVisible: true,
          userId: { in: matchUserIds },
          user: {
            deletedAt: null,
            blocksGot: { none: { blockerId: me } },
            blocksMade: { none: { blockedId: me } }
          }
        },
        select: {
          userId: true,
          displayName: true,
          bio: true,
          locationText: true,
          intent: true
        }
      })
    : [];

  const matchByUserId = new Map<bigint, FeedSuggestionCandidate>();
  for (const profile of matchProfiles) {
    matchByUserId.set(profile.userId, { ...profile, source: 'match', matchScore: 1 });
  }
  const matchCandidates = matchUserIds
    .map((id) => matchByUserId.get(id))
    .filter((item): item is FeedSuggestionCandidate => item !== undefined)
    .map((item) => ({ ...item, matchScore: 1 as number }));

  // Only use scores computed within the last 24 hours (freshness contract)
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const remainingLimit = Math.max(candidateLimit - matchCandidates.length, 0);
  let scored: Array<{ candidateUserId: bigint; score: number }> = [];
  try {
    scored = await prisma.matchScore.findMany({
      where: {
        userId: me,
        scoredAt: { gte: oneDayAgo },  // Only use fresh scores
        ...(matchUserIds.length ? { candidateUserId: { notIn: matchUserIds } } : {})
      },
      orderBy: { score: 'desc' },
      take: remainingLimit,
      select: { candidateUserId: true, score: true }
    });
  } catch {
    scored = [];
  }

  if (scored.length) {
    const candidateIds = scored.map((row) => row.candidateUserId);
    const scoreByUserId = new Map<bigint, number>();
    for (const row of scored) {
      scoreByUserId.set(row.candidateUserId, row.score);
    }
    const profiles = await prisma.profile.findMany({
      where: {
        deletedAt: null,
        isVisible: true,
        userId: { in: candidateIds, not: me },
        user: {
          deletedAt: null,
          blocksGot: { none: { blockerId: me } },
          blocksMade: { none: { blockedId: me } }
        }
      },
      select: {
        userId: true,
        displayName: true,
        bio: true,
        locationText: true,
        intent: true
      }
    });

    const byUserId = new Map<bigint, FeedSuggestionCandidate>();
    for (const profile of profiles) {
      byUserId.set(profile.userId, { ...profile, source: 'suggested' });
    }

    const suggestions: FeedSuggestionCandidate[] = candidateIds
      .map((id) => {
        const profile = byUserId.get(id);
        if (!profile) return null;
        const score = scoreByUserId.get(id);
        const candidate: FeedSuggestionCandidate = { ...profile, matchScore: score ?? null };
        return candidate;
      })
      .filter((item): item is FeedSuggestionCandidate => item !== null);

    return [...matchCandidates, ...suggestions] as FeedSuggestionCandidate[];
  }

  return prisma.profile.findMany({
    where: {
      deletedAt: null,
      isVisible: true,
      userId: {
        not: me,
        ...(matchUserIds.length ? { notIn: matchUserIds } : {})
      },
      user: {
        deletedAt: null,
        blocksGot: { none: { blockerId: me } },
        blocksMade: { none: { blockedId: me } }
      }
    },
    take: remainingLimit,
    select: {
      userId: true,
      displayName: true,
      bio: true,
      locationText: true,
      intent: true
    }
  }).then((profiles) => {
    const seed =
      ctx.seed != null && Number.isFinite(ctx.seed) ? Math.floor(ctx.seed) : null;
    const rng = seed == null ? () => Math.random() : mulberry32(seed);
    const shuffled = shuffleInPlace(profiles, rng);
    return [
      ...matchCandidates,
      ...shuffled.map((profile) => ({ ...profile, source: 'suggested' as const, matchScore: null }))
    ];
  });
}
