import { prisma } from '../lib/prisma/client.js';
import { Prisma } from '@prisma/client';
import { runJob } from '../lib/jobs/runJob.js';
import { hashKeyValues, isJobFresh, upsertJobFreshness } from '../lib/jobs/shared/freshness.js';

type InterestRow = {
  userId: bigint;
  subjectId: bigint;
  interestId: bigint;
  subjectKey: string;
  interestKey: string;
};

type QuizRow = { answers: unknown; scoreVec: unknown };

type CompatibilityJobConfig = {
  userBatchSize: number;
  targetBatchSize: number;
  pauseMs: number;
  maxSuggestionTargets: number;
  algorithmVersion: string;
  ratingMax: number;
  weights: {
    quiz: number;
    interests: number;
    ratingQuality: number;
    ratingFit: number;
  };
};

type CompatibilityJobOptions = Partial<CompatibilityJobConfig> & {
  userId?: bigint | null;
};

const DEFAULT_CONFIG: CompatibilityJobConfig = {
  userBatchSize: 100,
  targetBatchSize: 500,
  pauseMs: 50,
  maxSuggestionTargets: 100,
  algorithmVersion: 'v1',
  ratingMax: 5,
  weights: {
    quiz: 0.45,
    interests: 0.25,
    ratingQuality: 0.1,
    ratingFit: 0.2
  }
};

export const COMPATIBILITY_DEFAULTS = { ...DEFAULT_CONFIG };

function maxDate(dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const date of dates) {
    if (!date) continue;
    if (!latest || date > latest) {
      latest = date;
    }
  }
  return latest;
}

async function buildCompatibilityInputHash(
  viewerId: bigint,
  config: CompatibilityJobConfig
): Promise<{ inputHash: string; latestInputAt: Date | null }> {
  const [
    latestQuiz,
    latestInterest,
    latestRating,
    latestMatchScore,
    latestMatch,
    latestAccess,
    latestConversation
  ] = await Promise.all([
    prisma.quizResult.findFirst({
      where: { userId: viewerId },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    }),
    prisma.userInterest.findFirst({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    }),
    prisma.profile.findUnique({
      where: { userId: viewerId },
      select: {
        id: true,
        ratingsGiven: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true }
        }
      }
    }),
    prisma.matchScore.findFirst({
      where: { userId: viewerId },
      orderBy: { scoredAt: 'desc' },
      select: { scoredAt: true, algorithmVersion: true }
    }),
    prisma.match.findFirst({
      where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    }),
    prisma.profileAccess.findFirst({
      where: { OR: [{ ownerUserId: viewerId }, { viewerUserId: viewerId }] },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    }),
    prisma.conversation.findFirst({
      where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    })
  ]);

  const latestRatingAt = latestRating?.ratingsGiven[0]?.createdAt ?? null;
  const latestInputAt = maxDate([
    latestQuiz?.updatedAt,
    latestInterest?.createdAt,
    latestRatingAt,
    latestMatchScore?.scoredAt,
    latestMatch?.updatedAt,
    latestAccess?.updatedAt,
    latestConversation?.updatedAt
  ]);

  const inputHash = hashKeyValues([
    ['algorithmVersion', config.algorithmVersion],
    ['ratingMax', config.ratingMax],
    ['weights', config.weights],
    ['maxSuggestionTargets', config.maxSuggestionTargets],
    ['quizUpdatedAt', latestQuiz?.updatedAt ?? null],
    ['interestsCreatedAt', latestInterest?.createdAt ?? null],
    ['ratingsCreatedAt', latestRatingAt],
    ['matchScoreAt', latestMatchScore?.scoredAt ?? null],
    ['matchScoreVersion', latestMatchScore?.algorithmVersion ?? null],
    ['matchUpdatedAt', latestMatch?.updatedAt ?? null],
    ['accessUpdatedAt', latestAccess?.updatedAt ?? null],
    ['conversationUpdatedAt', latestConversation?.updatedAt ?? null]
  ]);

  return { inputHash, latestInputAt };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
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

function resolveConfig(overrides: CompatibilityJobOptions = {}): CompatibilityJobConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    weights: { ...DEFAULT_CONFIG.weights, ...(overrides.weights ?? {}) }
  };
}

async function collectTargets(viewerId: bigint, maxSuggestionTargets: number): Promise<bigint[]> {
  const targets = new Set<bigint>();

  const matches = await prisma.match.findMany({
    where: {
      state: 'ACTIVE',
      OR: [{ userAId: viewerId }, { userBId: viewerId }]
    },
    select: { userAId: true, userBId: true }
  });
  for (const match of matches) {
    const otherId = match.userAId === viewerId ? match.userBId : match.userAId;
    if (otherId !== viewerId) targets.add(otherId);
  }

  const access = await prisma.profileAccess.findMany({
    where: {
      OR: [{ ownerUserId: viewerId }, { viewerUserId: viewerId }],
      status: { in: ['PENDING', 'GRANTED'] }
    },
    select: { ownerUserId: true, viewerUserId: true }
  });
  for (const row of access) {
    const otherId = row.ownerUserId === viewerId ? row.viewerUserId : row.ownerUserId;
    if (otherId !== viewerId) targets.add(otherId);
  }

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
    select: { userAId: true, userBId: true }
  });
  for (const convo of conversations) {
    const otherId = convo.userAId === viewerId ? convo.userBId : convo.userAId;
    if (otherId !== viewerId) targets.add(otherId);
  }

  if (maxSuggestionTargets > 0) {
    const suggestions = await prisma.matchScore.findMany({
      where: { userId: viewerId },
      orderBy: { score: 'desc' },
      take: maxSuggestionTargets,
      select: { candidateUserId: true }
    });
    for (const suggestion of suggestions) {
      if (suggestion.candidateUserId !== viewerId) targets.add(suggestion.candidateUserId);
    }
  }

  if (!targets.size) return [];

  const allowed = await prisma.user.findMany({
    where: {
      id: { in: Array.from(targets) },
      deletedAt: null,
      blocksGot: { none: { blockerId: viewerId } },
      blocksMade: { none: { blockedId: viewerId } }
    },
    select: { id: true }
  });

  return allowed.map((row) => row.id);
}

export async function recomputeCompatibilityForUser(viewerId: bigint, overrides: CompatibilityJobOptions = {}) {
  const config = resolveConfig(overrides);
  const scope = `user:${viewerId}`;
  const { inputHash, latestInputAt } = await buildCompatibilityInputHash(viewerId, config);
  if (await isJobFresh('compatibility', scope, inputHash)) {
    console.log('[compatibility] up-to-date', {
      viewerId: viewerId.toString(),
      latestInputAt: latestInputAt?.toISOString() ?? null,
      algorithmVersion: config.algorithmVersion
    });
    return 0;
  }
  const targetIds = await collectTargets(viewerId, config.maxSuggestionTargets);

  await prisma.userCompatibility.deleteMany({ where: { viewerUserId: viewerId } });
  if (!targetIds.length) {
    await upsertJobFreshness('compatibility', scope, inputHash, new Date());
    return 0;
  }

  const userQuiz = await prisma.quizResult.findFirst({
    where: { userId: viewerId },
    orderBy: { updatedAt: 'desc' },
    select: { quizId: true, answers: true, scoreVec: true }
  });

  const userInterests = await prisma.userInterest.findMany({
    where: { userId: viewerId },
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

  const viewerProfile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { id: true }
  });
  const viewerProfileId = viewerProfile?.id ?? null;

  const viewerRatingAgg = viewerProfileId
    ? await prisma.profileRating.aggregate({
        where: { raterProfileId: viewerProfileId },
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
    viewerRatings ? toRatingVector(viewerRatings, config.ratingMax) : null
  );

  const viewerHasSignals =
    Boolean(userQuiz) || normalizedUser.length > 0 || viewerVector !== null;

  let totalWritten = 0;
  const computedAt = new Date();

  for (let offset = 0; offset < targetIds.length; offset += config.targetBatchSize) {
    const batchIds = targetIds.slice(offset, offset + config.targetBatchSize);

    const candidateQuizByUserId = new Map<bigint, QuizRow>();
    if (userQuiz) {
      const candidateQuiz = await prisma.quizResult.findMany({
        where: { userId: { in: batchIds }, quizId: userQuiz.quizId },
        select: { userId: true, answers: true, scoreVec: true }
      });
      for (const row of candidateQuiz) {
        candidateQuizByUserId.set(row.userId, { answers: row.answers, scoreVec: row.scoreVec });
      }
    }

    const candidateInterests = await prisma.userInterest.findMany({
      where: { userId: { in: batchIds } },
      select: {
        userId: true,
        subjectId: true,
        interestId: true,
        subject: { select: { key: true } },
        interest: { select: { key: true } }
      }
    });

    const interestByUserId = new Map<bigint, InterestRow[]>();
    for (const row of candidateInterests) {
      const item: InterestRow = {
        userId: row.userId,
        subjectId: row.subjectId,
        interestId: row.interestId,
        subjectKey: row.subject.key,
        interestKey: row.interest.key
      };
      const list = interestByUserId.get(row.userId);
      if (list) {
        list.push(item);
      } else {
        interestByUserId.set(row.userId, [item]);
      }
    }

    const candidateProfiles = await prisma.profile.findMany({
      where: { userId: { in: batchIds }, deletedAt: null, user: { deletedAt: null } },
      select: { id: true, userId: true }
    });
    const profileIdByUserId = new Map<bigint, bigint>();
    for (const profile of candidateProfiles) {
      profileIdByUserId.set(profile.userId, profile.id);
    }

    const candidateProfileIds = candidateProfiles.map((p) => p.id);
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

    const rows: Array<{
      viewerUserId: bigint;
      targetUserId: bigint;
      status: 'READY' | 'INSUFFICIENT_DATA';
      score: number | null;
      algorithmVersion: string;
      reasons: Record<string, unknown> | null;
      computedAt: Date;
    }> = [];

    for (const targetId of batchIds) {
      const targetInterests = interestByUserId.get(targetId) ?? [];
      const candidateQuiz = candidateQuizByUserId.get(targetId) ?? null;
      const profileId = profileIdByUserId.get(targetId) ?? null;
      const ratingAgg = profileId ? ratingByProfileId.get(profileId) ?? null : null;

      const candidateHasSignals =
        Boolean(candidateQuiz) ||
        targetInterests.length > 0 ||
        (ratingAgg?.count ?? 0) > 0;

      if (!viewerHasSignals || !candidateHasSignals) {
        rows.push({
          viewerUserId: viewerId,
          targetUserId: targetId,
          status: 'INSUFFICIENT_DATA',
          score: null,
          algorithmVersion: config.algorithmVersion,
          reasons: null,
          computedAt
        });
        continue;
      }

      const { overlap: interestOverlap, matches, intersection, userCount, candidateCount } = scoreInterests(
        normalizedUser,
        targetInterests
      );

      let quizSim = 0;
      if (userQuiz && candidateQuiz) {
        quizSim = quizSimilarity(userQuiz, candidateQuiz);
      }

      const ratingQualityRaw = ratingAgg ? averageRatings(ratingAgg) : null;
      const ratingQuality = ratingQualityRaw != null ? normalizeRating(ratingQualityRaw, config.ratingMax) ?? 0 : 0;

      const candidateVector = toCenteredVector(
        ratingAgg ? toRatingVector(ratingAgg, config.ratingMax) : null
      );
      const ratingFit =
        viewerVector && candidateVector ? clamp(cosineSimilarity(viewerVector, candidateVector)) : 0;

      const score =
        quizSim * config.weights.quiz +
        interestOverlap * config.weights.interests +
        ratingQuality * config.weights.ratingQuality +
        ratingFit * config.weights.ratingFit;

      const reasons: Record<string, unknown> = {
        scores: {
          quizSim,
          interestOverlap,
          ratingQuality,
          ratingFit
        },
        interests: {
          matches: matches.slice(0, 5),
          intersection,
          userCount,
          candidateCount
        }
      };

      if (ratingAgg) {
        reasons.ratings = {
          attractive: ratingAgg.attractive,
          smart: ratingAgg.smart,
          funny: ratingAgg.funny,
          interesting: ratingAgg.interesting
        };
      }

      rows.push({
        viewerUserId: viewerId,
        targetUserId: targetId,
        status: 'READY',
        score,
        algorithmVersion: config.algorithmVersion,
        reasons,
        computedAt
      });
    }

    if (rows.length) {
      await prisma.userCompatibility.createMany({
        data: rows.map(row => ({
          ...row,
          reasons: row.reasons ? (row.reasons as Prisma.InputJsonValue) : Prisma.JsonNull
        })),
        skipDuplicates: true
      });
      totalWritten += rows.length;
    }

    if (config.pauseMs > 0) {
      await sleep(config.pauseMs);
    }
  }

  await upsertJobFreshness('compatibility', scope, inputHash, computedAt);
  return totalWritten;
}

export async function runCompatibilityJob(options: CompatibilityJobOptions = {}) {
  const config = resolveConfig(options);

  const run = async () => {
    if (options.userId) {
      const written = await recomputeCompatibilityForUser(options.userId, config);
      return { processedUsers: 1, written };
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
        await recomputeCompatibilityForUser(user.id, config);
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
      jobName: 'compatibility-score',
      trigger: options.userId ? 'EVENT' : 'CRON',
      scope: options.userId ? `user:${options.userId}` : 'batch',
      algorithmVersion: config.algorithmVersion,
      metadata: {
        userBatchSize: config.userBatchSize,
        targetBatchSize: config.targetBatchSize,
        maxSuggestionTargets: config.maxSuggestionTargets,
        pauseMs: config.pauseMs
      }
    },
    run
  );
}
  
