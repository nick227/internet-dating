import { prisma } from '../lib/prisma/client.js';
import { Prisma } from '@prisma/client';
import { runJob } from '../lib/jobs/runJob.js';
import { toNumber, haversineKm, isValidLatitude, isValidLongitude } from './match-score/math/geo.js';
import { normalizeGenderPrefs, sleep } from './match-score/utils.js';
import {
  GenderGate,
  AgeGate,
  DistanceGate,
  ProximityOperator,
  NewnessOperator,
  TraitOperator,
  InterestOperator,
  RatingQualityOperator,
  RatingFitOperator,
  type MatchOperator,
  type MatchContext,
  type InterestRow,
  type ViewerContext,
  type CandidateContext,
  type PreferencesContext
} from './match-score/operators/index.js';
import { MinHeap } from './match-score/heap.js';
import { scoreCandidate } from './match-score/engine.js';

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
  topK?: number; // Number of top scores to keep (default: 200)
  minTraitOverlap?: number; // Minimum trait overlap required (default: 2)
  minRatingCount?: number; // Minimum rating count required (default: 3)
};

type ScoreRow = {
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
  tier: 'A' | 'B'; // New field: Tier A (within preferences) or Tier B (outside preferences)
  // NOTE: compliance intentionally omitted from storage.
  // Recompute on explain endpoints when needed.
  // NOTE: policyVersion intentionally omitted.
  // Add when first policy change ships to prod.
};

type ScoreDistribution = {
  count: number;
  mean: number;
  p50: number;
  p90: number;
  zeroCount: number;
  nullCount: number;
  components: {
    quiz: { mean: number; p50: number; p90: number };
    interests: { mean: number; p50: number; p90: number };
    ratingQuality: { mean: number; p50: number; p90: number };
    ratingFit: { mean: number; p50: number; p90: number };
    newness: { mean: number; p50: number; p90: number };
    proximity: { mean: number; p50: number; p90: number };
  };
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

type NumberLike = number | bigint | { toNumber: () => number };

/**
 * Match Score Job
 * 
 * Computes compatibility scores between users using a composable operator pipeline.
 * 
 * Architecture:
 * - Operators: Self-contained scoring functions (traits, interests, ratings, etc.)
 * - Engine: Reusable scoring pipeline (gating → pruning → scoring)
 * - Job: Orchestrates batch processing, data loading, and persistence
 * 
 * Key Features:
 * - Top-K heap-based pruning for efficiency
 * - Versioned score swapping for safe algorithm updates
 * - Neutral vs zero semantics (missing data ≠ bad data)
 * - Hard gating (gender, age, distance) vs soft scoring
 */

/**
 * Calculate score distribution statistics
 */
function calculateDistribution(scores: ScoreRow[]): ScoreDistribution {
  if (scores.length === 0) {
    return {
      count: 0,
      mean: 0,
      p50: 0,
      p90: 0,
      zeroCount: 0,
      nullCount: 0,
      components: {
        quiz: { mean: 0, p50: 0, p90: 0 },
        interests: { mean: 0, p50: 0, p90: 0 },
        ratingQuality: { mean: 0, p50: 0, p90: 0 },
        ratingFit: { mean: 0, p50: 0, p90: 0 },
        newness: { mean: 0, p50: 0, p90: 0 },
        proximity: { mean: 0, p50: 0, p90: 0 }
      }
    };
  }

  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!.score;
  const p90 = sorted[Math.floor(sorted.length * 0.9)]!.score;
  const mean = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const zeroCount = scores.filter(s => s.score === 0).length;
  const nullCount = scores.filter(s => s.scoreQuiz === 0 && s.scoreInterests === 0 && s.scoreRatingsQuality === 0 && s.scoreRatingsFit === 0).length;

  const componentStats = (component: (s: ScoreRow) => number) => {
    const values = scores.map(component).sort((a, b) => a - b);
    return {
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      p50: values[Math.floor(values.length * 0.5)]!,
      p90: values[Math.floor(values.length * 0.9)]!
    };
  };

  return {
    count: scores.length,
    mean,
    p50,
    p90,
    zeroCount,
    nullCount,
    components: {
      quiz: componentStats(s => s.scoreQuiz),
      interests: componentStats(s => s.scoreInterests),
      ratingQuality: componentStats(s => s.scoreRatingsQuality),
      ratingFit: componentStats(s => s.scoreRatingsFit),
      newness: componentStats(s => s.scoreNew),
      proximity: componentStats(s => s.scoreNearby)
    }
  };
}

/**
 * Resolve recompute options with defaults.
 * Merges user-provided overrides with default configuration.
 */
function resolveRecomputeOptions(overrides: Partial<RecomputeOptions> = {}): RecomputeOptions {
  return {
    candidateBatchSize: overrides.candidateBatchSize ?? DEFAULT_CONFIG.candidateBatchSize,
    pauseMs: overrides.pauseMs ?? DEFAULT_CONFIG.pauseMs,
    algorithmVersion: overrides.algorithmVersion ?? DEFAULT_CONFIG.algorithmVersion,
    ratingMax: overrides.ratingMax ?? DEFAULT_CONFIG.ratingMax,
    newnessHalfLifeDays: overrides.newnessHalfLifeDays ?? DEFAULT_CONFIG.newnessHalfLifeDays,
    defaultMaxDistanceKm: overrides.defaultMaxDistanceKm ?? DEFAULT_CONFIG.defaultMaxDistanceKm,
    weights: { ...DEFAULT_CONFIG.weights, ...(overrides.weights ?? {}) },
    topK: overrides.topK ?? 200,
    minTraitOverlap: overrides.minTraitOverlap ?? 2,
    minRatingCount: overrides.minRatingCount ?? 3
  };
}

/**
 * Recompute match scores for a single user.
 * 
 * Process:
 * 1. Load viewer context (profile, preferences, traits, interests, quiz, ratings)
 * 2. For each candidate batch:
 *    - Load candidate data (profiles, traits, interests, quizzes, ratings)
 *    - Score each candidate using operator pipeline
 *    - Maintain Top-K heap across all batches
 * 3. Write Top-K scores to database
 * 4. Delete old version scores (versioned swap)
 * 
 * @param userId - User ID to compute scores for
 * @param overrides - Optional configuration overrides
 * @returns Number of scores written
 */
export async function recomputeMatchScoresForUser(userId: bigint, overrides: Partial<RecomputeOptions> = {}) {
  const options = resolveRecomputeOptions(overrides);

  // ===== VIEWER CONTEXT: Load viewer profile and preferences =====
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

  // ===== VIEWER CONTEXT: Load viewer traits, interests, quiz, ratings =====
  const userQuiz = await prisma.quizResult.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { quizId: true, answers: true, scoreVec: true }
  });

  const userTraits = await prisma.userTrait.findMany({
    where: { userId },
    select: { traitKey: true, value: true, n: true }
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

  // Versioned swap: Write new scores with new version, delete old version after success
  const vNext = options.algorithmVersion;
  // Find previous version (if any) to clean up after successful write
  const vPrev = await prisma.matchScore.findFirst({
    where: { userId },
    select: { algorithmVersion: true },
    orderBy: { scoredAt: 'desc' }
  }).then(r => r?.algorithmVersion).catch(() => null);

  const meLat = toNumber(meProfile?.lat ?? null);
  const meLng = toNumber(meProfile?.lng ?? null);

  // Build viewer context (reused for all candidates)
  const viewerContext: ViewerContext = {
    userId,
    profileId: meProfileId,
    lat: meLat,
    lng: meLng,
    locationText: meProfile?.locationText ?? null,
    traits: userTraits.map(t => ({ traitKey: t.traitKey, value: Number(t.value), n: t.n })),
    interests: normalizedUser,
    quiz: userQuiz ? { quizId: userQuiz.quizId, answers: userQuiz.answers, scoreVec: userQuiz.scoreVec } : null,
    ratings: viewerRatings
  };

  // Build preferences context (reused for all candidates)
  const prefsContext: PreferencesContext = {
    preferredGenders,
    preferredAgeMin,
    preferredAgeMax,
    preferredDistanceKm,
    defaultMaxDistanceKm: options.defaultMaxDistanceKm,
    ratingMax: options.ratingMax,
    newnessHalfLifeDays: options.newnessHalfLifeDays,
    minTraitOverlap: options.minTraitOverlap ?? 2,
    minRatingCount: options.minRatingCount ?? 3
  };

  // Define operator pipeline
  // Hard gates: Only safety/invariants (these exclude)
  // Note: Currently none beyond DB filters, but structure is ready
  const hardGateOperators: MatchOperator[] = [
    // Add safety gates here if needed (currently none beyond DB filters)
  ];

  // Preference classifiers: Gender, Age, Distance (these classify, not exclude)
  const preferenceClassifiers: MatchOperator[] = [
    GenderGate,
    AgeGate,
    DistanceGate
  ];

  // Scoring operators: Unchanged
  const scoringOperators: MatchOperator[] = [
    ProximityOperator,
    NewnessOperator,
    TraitOperator,
    InterestOperator,
    RatingQualityOperator,
    RatingFitOperator
  ];

  let lastId: bigint | null = null;
  let totalWritten = 0;
  const topK = options.topK ?? 200;
  // Replace single heap with two heaps for Tier A and Tier B
  const heapA = new MinHeap(topK); // Tier A: within preferences
  const heapB = new MinHeap(topK); // Tier B: outside preferences

  for (;;) {
    // ===== CANDIDATE BATCH: Load candidate profiles =====
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

    // ===== CANDIDATE BATCH: Load candidate quizzes =====
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

    // ===== CANDIDATE BATCH: Load candidate traits =====
    const traitsByUserId = new Map<bigint, Array<{ traitKey: string; value: number; n: number }>>();
    if (userTraits.length > 0 && candidateIds.length) {
      const candidateTraits = await prisma.userTrait.findMany({
        where: { userId: { in: candidateIds } },
        select: { userId: true, traitKey: true, value: true, n: true }
      });
      for (const trait of candidateTraits) {
        const existing = traitsByUserId.get(trait.userId);
        const value = Number(trait.value);
        const n = trait.n;
        if (existing) {
          existing.push({ traitKey: trait.traitKey, value, n });
        } else {
          traitsByUserId.set(trait.userId, [{ traitKey: trait.traitKey, value, n }]);
        }
      }
    }

    // ===== CANDIDATE BATCH: Load candidate interests =====
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

    // ===== CANDIDATE BATCH: Load candidate ratings =====
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

    for (const candidate of candidates) {
      // Build candidate context
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
      
      const candidateTraits = traitsByUserId.get(candidate.userId) ?? [];
      const candidateInterests = byCandidate.get(candidate.userId) ?? [];
      const candidateQuiz = quizByUserId.get(candidate.userId) ?? null;
      const ratingAgg = ratingByProfileId.get(candidate.id) ?? null;

      const candidateContext: CandidateContext = {
        userId: candidate.userId,
        profileId: candidate.id,
        birthdate: candidate.birthdate,
        gender: candidate.gender,
        lat: candidateLat,
        lng: candidateLng,
        locationText: candidate.locationText,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        distanceKm,
        traits: candidateTraits,
        interests: candidateInterests,
        quiz: candidateQuiz,
        ratings: ratingAgg
      };

      const matchContext: MatchContext = {
        viewer: viewerContext,
        candidate: candidateContext,
        prefs: prefsContext,
        now: scoredAt
      };

      // ===== SCORE CANDIDATE USING OPERATOR PIPELINE =====
      const scoringResult = scoreCandidate(
        matchContext,
        hardGateOperators, // Only safety/invariants
        preferenceClassifiers, // Gender, Age, Distance
        scoringOperators,
        options.weights
        // NO HEAP - engine doesn't know about orchestration
      );

      // Skip if gated
      if (!scoringResult) {
        continue;
      }

      // Hardcoded tier logic (extract to policy later if needed)
      // NOTE: This is intentionally simple. Refactor to policy-driven assignment
      // when first policy change ships to prod.
      const tier = (scoringResult.compliance.gender && 
                    scoringResult.compliance.age && 
                    scoringResult.compliance.distance) 
        ? 'A' 
        : 'B';

      const heap = tier === 'A' ? heapA : heapB;

      // Inline pruning (extract to strategy later if needed)
      // Tier-local: only compare against the appropriate heap
      if (heap.size() >= topK && scoringResult.upperBound < heap.peek()!.score) {
        continue; // PRUNE - tier-local (Tier A never pruned by Tier B threshold)
      }

      // Add metadata that's specific to the candidate context
      const reasons = scoringResult.reasons;
      if (distanceKm !== null) reasons.distanceKm = Math.round(distanceKm * 10) / 10;
      if (ratingAgg) {
        reasons.ratings = {
          attractive: ratingAgg.attractive,
          smart: ratingAgg.smart,
          funny: ratingAgg.funny,
          interesting: ratingAgg.interesting,
          count: ratingAgg.count
        };
      }

      // Push to appropriate heap
      if (tier === 'A') {
        heapA.push({
          userId,
          candidateUserId: candidate.userId,
          score: scoringResult.score,
          scoreQuiz: scoringResult.components.scoreQuiz,
          scoreInterests: scoringResult.components.scoreInterests,
          scoreRatingsQuality: scoringResult.components.scoreRatingsQuality,
          scoreRatingsFit: scoringResult.components.scoreRatingsFit,
          scoreNew: scoringResult.components.scoreNew,
          scoreNearby: scoringResult.components.scoreNearby,
          ratingAttractive: ratingAgg?.attractive ?? null,
          ratingSmart: ratingAgg?.smart ?? null,
          ratingFunny: ratingAgg?.funny ?? null,
          ratingInteresting: ratingAgg?.interesting ?? null,
          distanceKm,
          reasons,
          scoredAt,
          algorithmVersion: vNext,
          tier
        });
      } else {
        heapB.push({
          userId,
          candidateUserId: candidate.userId,
          score: scoringResult.score,
          scoreQuiz: scoringResult.components.scoreQuiz,
          scoreInterests: scoringResult.components.scoreInterests,
          scoreRatingsQuality: scoringResult.components.scoreRatingsQuality,
          scoreRatingsFit: scoringResult.components.scoreRatingsFit,
          scoreNew: scoringResult.components.scoreNew,
          scoreNearby: scoringResult.components.scoreNearby,
          ratingAttractive: ratingAgg?.attractive ?? null,
          ratingSmart: ratingAgg?.smart ?? null,
          ratingFunny: ratingAgg?.funny ?? null,
          ratingInteresting: ratingAgg?.interesting ?? null,
          distanceKm,
          reasons,
          scoredAt,
          algorithmVersion: vNext,
          tier
        });
      }
    }

    if (options.pauseMs > 0) {
      await sleep(options.pauseMs);
    }
  }

  // After all batches, combine results from both heaps
  // Tier A first (within preferences), then Tier B (outside preferences)
  const tierA = heapA.toArray(); // Already sorted descending
  const tierB = heapB.toArray(); // Already sorted descending
  const topScores = [...tierA, ...tierB];
  if (topScores.length > 0) {
    await prisma.matchScore.createMany({
      data: topScores.map(row => ({
        ...row,
        reasons: row.reasons as unknown as Prisma.InputJsonValue
      })),
      skipDuplicates: true
    });
    totalWritten = topScores.length;

    // Calculate and log distribution statistics
    const distribution = calculateDistribution(topScores);
    console.log(`[match-scores] User ${userId} distribution:`, JSON.stringify({
      count: distribution.count,
      mean: distribution.mean.toFixed(4),
      p50: distribution.p50.toFixed(4),
      p90: distribution.p90.toFixed(4),
      zeroCount: distribution.zeroCount,
      nullCount: distribution.nullCount,
      components: {
        quiz: { mean: distribution.components.quiz.mean.toFixed(4), p50: distribution.components.quiz.p50.toFixed(4), p90: distribution.components.quiz.p90.toFixed(4) },
        interests: { mean: distribution.components.interests.mean.toFixed(4), p50: distribution.components.interests.p50.toFixed(4), p90: distribution.components.interests.p90.toFixed(4) },
        ratingQuality: { mean: distribution.components.ratingQuality.mean.toFixed(4), p50: distribution.components.ratingQuality.p50.toFixed(4), p90: distribution.components.ratingQuality.p90.toFixed(4) },
        ratingFit: { mean: distribution.components.ratingFit.mean.toFixed(4), p50: distribution.components.ratingFit.p50.toFixed(4), p90: distribution.components.ratingFit.p90.toFixed(4) },
        newness: { mean: distribution.components.newness.mean.toFixed(4), p50: distribution.components.newness.p50.toFixed(4), p90: distribution.components.newness.p90.toFixed(4) },
        proximity: { mean: distribution.components.proximity.mean.toFixed(4), p50: distribution.components.proximity.p50.toFixed(4), p90: distribution.components.proximity.p90.toFixed(4) }
      }
    }, null, 2));

    // Delete old version scores after successful write (versioned swap)
    // Only delete if we successfully wrote new scores and versions differ
    if (topScores.length > 0 && vPrev && vPrev !== vNext) {
      const deleted = await prisma.matchScore.deleteMany({
        where: { userId, algorithmVersion: vPrev }
      });
      console.log(`[match-scores] User ${userId} deleted ${deleted.count} old scores (version: ${vPrev})`);
    }
  } else {
    // No scores written - don't delete old version (preserve existing data)
    console.log(`[match-scores] User ${userId} no scores written, preserving existing version ${vPrev ?? 'none'}`);
  }

  return totalWritten;
}

/**
 * Run match score job for single user or batch of users.
 * 
 * @param options - Job configuration and optional userId for single-user mode
 * @returns Job execution result with processed user count
 */
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

