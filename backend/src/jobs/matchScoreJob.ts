import { prisma } from '../lib/prisma/client.js';
import { Prisma } from '@prisma/client';
import { runJob } from '../lib/jobs/runJob.js';

type DecimalLike = { toNumber: () => number };
type NumberLike = number | bigint | DecimalLike;

type InterestRow = {
  userId: bigint;
  subjectId: bigint;
  interestId: bigint;
  subjectKey: string;
  interestKey: string;
};

type CandidateProfile = {
  id: bigint;
  userId: bigint;
  birthdate: Date | null;
  gender: string | null;
  lat: NumberLike | null;
  lng: NumberLike | null;
  locationText: string | null;
  intent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type QuizRow = { answers: unknown; scoreVec: unknown };

type MatchScoreJobConfig = {
  userBatchSize: number;
  candidateBatchSize: number;
  pauseMs: number;
  algorithmVersion: string;
  ratingMax: number;
  newnessHalfLifeDays: number;
  defaultMaxDistanceKm: number;
  weights: {
    quiz: number;
    interests: number;
    ratingQuality: number;
    ratingFit: number;
    newness: number;
    proximity: number;
  };
};

type MatchScoreJobOptions = Partial<MatchScoreJobConfig> & {
  userId?: bigint | null;
};

type RecomputeOptions = {
  candidateBatchSize: number;
  pauseMs: number;
  algorithmVersion: string;
  ratingMax: number;
  newnessHalfLifeDays: number;
  defaultMaxDistanceKm: number;
  weights: MatchScoreJobConfig['weights'];
};

const DEFAULT_CONFIG: MatchScoreJobConfig = {
  userBatchSize: 100,
  candidateBatchSize: 500,
  pauseMs: 50,
  algorithmVersion: 'v1',
  ratingMax: 5,
  newnessHalfLifeDays: 30,
  defaultMaxDistanceKm: 100,
  weights: {
    quiz: 0.25,
    interests: 0.2,
    ratingQuality: 0.15,
    ratingFit: 0.1,
    newness: 0.1,
    proximity: 0.2
  }
};

export const MATCH_SCORE_DEFAULTS = { ...DEFAULT_CONFIG };

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: NumberLike | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return null;
}

function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function normalizeGenderPrefs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((entry): entry is string => typeof entry === 'string');
  return list.length ? list : null;
}

function toNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value.map((entry) => (typeof entry === 'number' ? entry : null));
  if (nums.some((entry) => entry === null)) return null;
  return nums as number[];
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeRating(value: number | null | undefined, ratingMax: number) {
  if (value == null || !Number.isFinite(value)) return null;
  return clamp(value / ratingMax);
}

function toRatingVector(
  avg: {
    attractive: number | null;
    smart: number | null;
    funny: number | null;
    interesting: number | null;
  },
  ratingMax: number
) {
  const values = [avg.attractive, avg.smart, avg.funny, avg.interesting];
  if (values.every((value) => value == null)) return null;
  return values.map((value) => normalizeRating(value, ratingMax) ?? 0);
}

function toCenteredVector(vector: number[] | null) {
  if (!vector) return null;
  const mean = vector.reduce((sum, v) => sum + v, 0) / vector.length;
  const centered = vector.map((v) => v - mean);
  if (centered.every((v) => Math.abs(v) < 1e-6)) return null;
  return centered;
}

function averageRatings(avg: {
  attractive: number | null;
  smart: number | null;
  funny: number | null;
  interesting: number | null;
}) {
  const values = [avg.attractive, avg.smart, avg.funny, avg.interesting].filter(
    (value): value is number => typeof value === 'number'
  );
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function newnessScore(updatedAt: Date, halfLifeDays: number) {
  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  const decay = Math.log(2) / Math.max(1, halfLifeDays);
  return clamp(Math.exp(-decay * ageDays));
}

function answersSimilarity(a: unknown, b: unknown) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
  const entriesA = Object.entries(a as Record<string, unknown>);
  if (!entriesA.length) return 0;
  let overlap = 0;
  let matches = 0;
  const mapB = new Map(Object.entries(b as Record<string, unknown>));
  for (const [key, value] of entriesA) {
    if (!mapB.has(key)) continue;
    overlap += 1;
    if (mapB.get(key) === value) {
      matches += 1;
    }
  }
  if (!overlap) return 0;
  return matches / overlap;
}

function quizSimilarity(userQuiz: QuizRow, candidateQuiz: QuizRow) {
  const vecA = toNumberArray(userQuiz.scoreVec);
  const vecB = toNumberArray(candidateQuiz.scoreVec);
  if (vecA && vecB && vecA.length === vecB.length && vecA.length > 0) {
    return cosineSimilarity(vecA, vecB);
  }
  return answersSimilarity(userQuiz.answers, candidateQuiz.answers);
}

function scoreInterests(user: InterestRow[], candidate: InterestRow[]) {
  if (!user.length || !candidate.length) {
    return { overlap: 0, matches: [] as string[], intersection: 0, userCount: user.length, candidateCount: candidate.length };
  }

  const userKeys = new Set<string>();
  const labels = new Map<string, string>();
  for (const row of user) {
    const key = `${row.subjectId}:${row.interestId}`;
    userKeys.add(key);
    labels.set(key, `${row.subjectKey}:${row.interestKey}`);
  }

  const candidateKeys = new Set<string>();
  for (const row of candidate) {
    const key = `${row.subjectId}:${row.interestId}`;
    candidateKeys.add(key);
    if (!labels.has(key)) {
      labels.set(key, `${row.subjectKey}:${row.interestKey}`);
    }
  }

  let intersection = 0;
  const matches: string[] = [];
  for (const key of candidateKeys) {
    if (userKeys.has(key)) {
      intersection += 1;
      matches.push(labels.get(key) ?? key);
    }
  }

  const denom = Math.sqrt(userKeys.size * candidateKeys.size);
  const overlap = denom ? intersection / denom : 0;
  return {
    overlap,
    matches,
    intersection,
    userCount: userKeys.size,
    candidateCount: candidateKeys.size
  };
}

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveRecomputeOptions(overrides: Partial<RecomputeOptions> = {}): RecomputeOptions {
  return {
    candidateBatchSize: overrides.candidateBatchSize ?? DEFAULT_CONFIG.candidateBatchSize,
    pauseMs: overrides.pauseMs ?? DEFAULT_CONFIG.pauseMs,
    algorithmVersion: overrides.algorithmVersion ?? DEFAULT_CONFIG.algorithmVersion,
    ratingMax: overrides.ratingMax ?? DEFAULT_CONFIG.ratingMax,
    newnessHalfLifeDays: overrides.newnessHalfLifeDays ?? DEFAULT_CONFIG.newnessHalfLifeDays,
    defaultMaxDistanceKm: overrides.defaultMaxDistanceKm ?? DEFAULT_CONFIG.defaultMaxDistanceKm,
    weights: { ...DEFAULT_CONFIG.weights, ...(overrides.weights ?? {}) }
  };
}

export async function recomputeMatchScoresForUser(userId: bigint, overrides: Partial<RecomputeOptions> = {}) {
  const options = resolveRecomputeOptions(overrides);
  const meProfile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, locationText: true, intent: true, birthdate: true, gender: true, lat: true, lng: true }
  });
  const meProfileId = meProfile?.id ?? null;

  const preferences = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      preferredAgeMin: true,
      preferredAgeMax: true,
      preferredDistanceKm: true,
      preferredGenders: true
    }
  });
  const preferredGenders = normalizeGenderPrefs(preferences?.preferredGenders ?? null);
  const preferredAgeMin = preferences?.preferredAgeMin ?? null;
  const preferredAgeMax = preferences?.preferredAgeMax ?? null;
  const preferredDistanceKm = preferences?.preferredDistanceKm ?? null;

  const userQuiz = await prisma.quizResult.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { quizId: true, answers: true, scoreVec: true }
  });

  const userInterests = await prisma.userInterest.findMany({
    where: { userId },
    select: {
      userId: true,
      subjectId: true,
      interestId: true,
      subject: { select: { key: true } },
      interest: { select: { key: true } }
    }
  });

  const normalizedUser: InterestRow[] = userInterests.map((row) => ({
    userId: row.userId,
    subjectId: row.subjectId,
    interestId: row.interestId,
    subjectKey: row.subject.key,
    interestKey: row.interest.key
  }));

  const viewerRatingAgg = meProfileId
    ? await prisma.profileRating.aggregate({
        where: { raterProfileId: meProfileId },
        _avg: { attractive: true, smart: true, funny: true, interesting: true },
        _count: { _all: true }
      })
    : null;
  const viewerRatings = viewerRatingAgg
    ? {
        attractive: viewerRatingAgg._avg.attractive ?? null,
        smart: viewerRatingAgg._avg.smart ?? null,
        funny: viewerRatingAgg._avg.funny ?? null,
        interesting: viewerRatingAgg._avg.interesting ?? null,
        count: viewerRatingAgg._count._all
      }
    : null;
  const viewerVector = toCenteredVector(
    viewerRatings ? toRatingVector(viewerRatings, options.ratingMax) : null
  );

  await prisma.matchScore.deleteMany({ where: { userId } });

  const meLat = toNumber(meProfile?.lat ?? null);
  const meLng = toNumber(meProfile?.lng ?? null);

  let lastId: bigint | null = null;
  let totalWritten = 0;

  for (;;) {
    const candidates: CandidateProfile[] = await prisma.profile.findMany({
      where: {
        deletedAt: null,
        isVisible: true,
        userId: { not: userId },
        user: {
          deletedAt: null,
          blocksGot: { none: { blockerId: userId } },
          blocksMade: { none: { blockedId: userId } }
        }
      },
      select: {
        id: true,
        userId: true,
        birthdate: true,
        gender: true,
        lat: true,
        lng: true,
        locationText: true,
        intent: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { id: 'asc' },
      take: options.candidateBatchSize,
      ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {})
    });

    if (!candidates.length) break;
    lastId = candidates[candidates.length - 1]!.id;

    const candidateIds = candidates.map((c) => c.userId);
    const candidateProfileIds = candidates.map((c) => c.id);

    const quizByUserId = new Map<bigint, QuizRow>();
    if (userQuiz && candidateIds.length) {
      const candidateQuiz = await prisma.quizResult.findMany({
        where: { userId: { in: candidateIds }, quizId: userQuiz.quizId },
        select: { userId: true, answers: true, scoreVec: true }
      });
      for (const row of candidateQuiz) {
        quizByUserId.set(row.userId, { answers: row.answers, scoreVec: row.scoreVec });
      }
    }

    const candidateInterests = candidateIds.length
      ? await prisma.userInterest.findMany({
          where: { userId: { in: candidateIds } },
          select: {
            userId: true,
            subjectId: true,
            interestId: true,
            subject: { select: { key: true } },
            interest: { select: { key: true } }
          }
        })
      : [];

    const byCandidate = new Map<bigint, InterestRow[]>();
    for (const row of candidateInterests) {
      const item: InterestRow = {
        userId: row.userId,
        subjectId: row.subjectId,
        interestId: row.interestId,
        subjectKey: row.subject.key,
        interestKey: row.interest.key
      };
      const list = byCandidate.get(row.userId);
      if (list) {
        list.push(item);
      } else {
        byCandidate.set(row.userId, [item]);
      }
    }

    const candidateRatings = candidateProfileIds.length
      ? await prisma.profileRating.groupBy({
          by: ['targetProfileId'],
          where: { targetProfileId: { in: candidateProfileIds } },
          _avg: { attractive: true, smart: true, funny: true, interesting: true },
          _count: { _all: true }
        })
      : [];

    const ratingByProfileId = new Map<
      bigint,
      {
        attractive: number | null;
        smart: number | null;
        funny: number | null;
        interesting: number | null;
        count: number;
      }
    >();
    for (const row of candidateRatings) {
      ratingByProfileId.set(row.targetProfileId, {
        attractive: row._avg.attractive ?? null,
        smart: row._avg.smart ?? null,
        funny: row._avg.funny ?? null,
        interesting: row._avg.interesting ?? null,
        count: row._count._all
      });
    }

    const scoredAt = new Date();
    const rows: Array<{
      userId: bigint;
      candidateUserId: bigint;
      score: number;
      scoreQuiz: number;
      scoreInterests: number;
      scoreRatingsQuality: number;
      scoreRatingsFit: number;
      scoreNew: number;
      scoreNearby: number;
      ratingAttractive: number | null;
      ratingSmart: number | null;
      ratingFunny: number | null;
      ratingInteresting: number | null;
      distanceKm: number | null;
      reasons: Record<string, unknown>;
      scoredAt: Date;
      algorithmVersion: string;
    }> = [];

    for (const candidate of candidates) {
      if (preferredGenders?.length) {
        if (!candidate.gender || !preferredGenders.includes(candidate.gender)) {
          continue;
        }
      }

      const candidateAge = computeAge(candidate.birthdate ?? null);
      if ((preferredAgeMin !== null || preferredAgeMax !== null) && candidateAge === null) {
        continue;
      }
      if (preferredAgeMin !== null && candidateAge !== null && candidateAge < preferredAgeMin) {
        continue;
      }
      if (preferredAgeMax !== null && candidateAge !== null && candidateAge > preferredAgeMax) {
        continue;
      }

      const candidateLat = toNumber(candidate.lat ?? null);
      const candidateLng = toNumber(candidate.lng ?? null);
      const hasDistance =
        meLat !== null &&
        meLng !== null &&
        candidateLat !== null &&
        candidateLng !== null &&
        isValidLatitude(meLat) &&
        isValidLongitude(meLng) &&
        isValidLatitude(candidateLat) &&
        isValidLongitude(candidateLng);
      const distanceKm = hasDistance ? haversineKm(meLat, meLng, candidateLat, candidateLng) : null;
      if (preferredDistanceKm !== null) {
        if (distanceKm === null || distanceKm > preferredDistanceKm) {
          continue;
        }
      }

      const interestRows = byCandidate.get(candidate.userId) ?? [];
      const { overlap: interestOverlap, matches, intersection, userCount, candidateCount } = scoreInterests(
        normalizedUser,
        interestRows
      );

      let quizSim = 0;
      if (userQuiz) {
        const candidateQuiz = quizByUserId.get(candidate.userId);
        if (candidateQuiz) {
          quizSim = quizSimilarity(userQuiz, candidateQuiz);
        }
      }

      const ratingAgg = ratingByProfileId.get(candidate.id) ?? null;
      const ratingAttractive = ratingAgg?.attractive ?? null;
      const ratingSmart = ratingAgg?.smart ?? null;
      const ratingFunny = ratingAgg?.funny ?? null;
      const ratingInteresting = ratingAgg?.interesting ?? null;

      const ratingQualityRaw = ratingAgg ? averageRatings(ratingAgg) : null;
      const ratingQuality = ratingQualityRaw != null ? normalizeRating(ratingQualityRaw, options.ratingMax) ?? 0 : 0;

      const candidateVector = toCenteredVector(
        ratingAgg ? toRatingVector(ratingAgg, options.ratingMax) : null
      );
      const ratingFit = viewerVector && candidateVector ? clamp(cosineSimilarity(viewerVector, candidateVector)) : 0;

      const updatedAt = candidate.updatedAt ?? candidate.createdAt;
      const scoreNew = updatedAt ? newnessScore(updatedAt, options.newnessHalfLifeDays) : 0;

      let scoreNearby = 0;
      if (distanceKm !== null) {
        const radius = preferredDistanceKm ?? options.defaultMaxDistanceKm;
        scoreNearby = clamp(1 - distanceKm / radius);
      } else if (
        meProfile?.locationText &&
        candidate.locationText &&
        meProfile.locationText === candidate.locationText
      ) {
        scoreNearby = 0.25;
      }

      const scoreQuiz = quizSim;
      const scoreInterestsValue = interestOverlap;
      const scoreRatingsQuality = ratingQuality;
      const scoreRatingsFit = ratingFit;

      const score =
        scoreQuiz * options.weights.quiz +
        scoreInterestsValue * options.weights.interests +
        scoreRatingsQuality * options.weights.ratingQuality +
        scoreRatingsFit * options.weights.ratingFit +
        scoreNew * options.weights.newness +
        scoreNearby * options.weights.proximity;

      const reasons: Record<string, unknown> = {
        scores: {
          quizSim: scoreQuiz,
          interestOverlap: scoreInterestsValue,
          ratingQuality: scoreRatingsQuality,
          ratingFit: scoreRatingsFit,
          newness: scoreNew,
          proximity: scoreNearby
        },
        interests: {
          matches: matches.slice(0, 5),
          intersection,
          userCount,
          candidateCount
        }
      };
      if (distanceKm !== null) reasons.distanceKm = Math.round(distanceKm * 10) / 10;
      if (ratingAgg) {
        reasons.ratings = {
          attractive: ratingAttractive,
          smart: ratingSmart,
          funny: ratingFunny,
          interesting: ratingInteresting
        };
      }

      rows.push({
        userId,
        candidateUserId: candidate.userId,
        score,
        scoreQuiz,
        scoreInterests: scoreInterestsValue,
        scoreRatingsQuality,
        scoreRatingsFit,
        scoreNew,
        scoreNearby,
        ratingAttractive,
        ratingSmart,
        ratingFunny,
        ratingInteresting,
        distanceKm,
        reasons,
        scoredAt,
        algorithmVersion: options.algorithmVersion
      });
    }

    if (rows.length) {
      await prisma.matchScore.createMany({
        data: rows.map(row => ({
          ...row,
          reasons: row.reasons as unknown as Prisma.InputJsonValue
        })),
        skipDuplicates: true
      });
      totalWritten += rows.length;
    }

    if (options.pauseMs > 0) {
      await sleep(options.pauseMs);
    }
  }

  return totalWritten;
}

export async function runMatchScoreJob(options: MatchScoreJobOptions = {}) {
  const config: MatchScoreJobConfig = {
    ...DEFAULT_CONFIG,
    ...options,
    weights: { ...DEFAULT_CONFIG.weights, ...(options.weights ?? {}) }
  };

  const run = async () => {
    if (options.userId) {
      const total = await recomputeMatchScoresForUser(options.userId, {
        candidateBatchSize: config.candidateBatchSize,
        pauseMs: config.pauseMs,
        algorithmVersion: config.algorithmVersion,
        ratingMax: config.ratingMax,
        newnessHalfLifeDays: config.newnessHalfLifeDays,
        defaultMaxDistanceKm: config.defaultMaxDistanceKm,
        weights: config.weights
      });
      return { processedUsers: 1, written: total };
    }

    let lastId: bigint | null = null;
    let processedUsers = 0;

    for (;;) {
      const users: Array<{ id: bigint }> = await prisma.user.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
        take: config.userBatchSize,
        ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {})
      });
      if (!users.length) break;
      lastId = users[users.length - 1]!.id;

      for (const user of users) {
        await recomputeMatchScoresForUser(user.id, {
          candidateBatchSize: config.candidateBatchSize,
          pauseMs: config.pauseMs,
          algorithmVersion: config.algorithmVersion,
          ratingMax: config.ratingMax,
          newnessHalfLifeDays: config.newnessHalfLifeDays,
          defaultMaxDistanceKm: config.defaultMaxDistanceKm,
          weights: config.weights
        });
        processedUsers += 1;
      }

      if (config.pauseMs > 0) {
        await sleep(config.pauseMs);
      }
    }

    return { processedUsers };
  };

  return runJob(
    {
      jobName: 'match-score',
      trigger: options.userId ? 'EVENT' : 'CRON',
      scope: options.userId ? `user:${options.userId}` : 'batch',
      algorithmVersion: config.algorithmVersion,
      metadata: {
        userBatchSize: config.userBatchSize,
        candidateBatchSize: config.candidateBatchSize,
        pauseMs: config.pauseMs
      }
    },
    run
  );
}

function computeAge(birthdate: Date | null) {
  if (!birthdate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthdate.getFullYear();
  const m = now.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age;
}
