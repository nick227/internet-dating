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
    // Normalize cosine similarity from [-1, 1] to [0, 1] to match trait similarity
    const cosine = cosineSimilarity(vecA, vecB);
    return clamp((cosine + 1) / 2); // maps [-1,1] → [0,1]
  }
  return answersSimilarity(userQuiz.answers, candidateQuiz.answers);
}

const CONFIDENCE_NORM = 5; // Normalization constant for confidence calculation

/**
 * Calculate confidence from contribution count (n)
 */
function calculateConfidence(n: number): number {
  return clamp(n / CONFIDENCE_NORM, 0, 1);
}

/**
 * Calculate effective value (confidence-weighted)
 */
function calculateEffectiveValue(value: number, confidence: number): number {
  return value * confidence;
}

/**
 * Calculate coverage penalty
 * Measures how complete the comparison is relative to the weaker profile
 */
function calculateCoverage(
  commonCount: number,
  userTraitCount: number,
  candidateTraitCount: number
): number {
  const minTraitCount = Math.min(userTraitCount, candidateTraitCount);
  if (minTraitCount === 0) return 0;
  return commonCount / minTraitCount;
}

/**
 * Interest upper bound for pruning (must overestimate, never underestimate)
 * Returns maximum possible Jaccard similarity for pruning
 */
function interestUpperBound(
  userInterestCount: number,
  candidateInterestCount: number
): number {
  // If either user has no interests, maximum possible overlap is 0
  if (userInterestCount === 0 || candidateInterestCount === 0) {
    return 0;
  }
  // Maximum possible Jaccard is 1.0 (all interests overlap)
  // Using 1.0 as upper bound is intentionally loose but safe for pruning
  return 1.0;
}

/**
 * Min-heap for Top-K candidates (smallest score at root)
 */
class MinHeap {
  private heap: ScoreRow[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  size(): number {
    return this.heap.length;
  }

  peek(): ScoreRow | null {
    return this.heap.length > 0 ? this.heap[0]! : null;
  }

  push(item: ScoreRow): void {
    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    } else if (item.score > this.heap[0]!.score) {
      this.heap[0] = item;
      this.bubbleDown(0);
    }
  }

  toArray(): ScoreRow[] {
    return [...this.heap].sort((a, b) => b.score - a.score); // Sort descending
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent]!.score <= this.heap[index]!.score) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index]!, this.heap[parent]!];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < this.heap.length && this.heap[left]!.score < this.heap[smallest]!.score) {
        smallest = left;
      }
      if (right < this.heap.length && this.heap[right]!.score < this.heap[smallest]!.score) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest]!, this.heap[index]!];
      index = smallest;
    }
  }
}

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
 * Calculate trait similarity between two users based on their UserTrait values.
 * Uses cosine similarity on confidence-weighted trait vectors with coverage penalty.
 * 
 * Normalization: Cosine similarity [-1, 1] is normalized to [0, 1] before coverage.
 * This means:
 * - Perfect opposites (cosine = -1) → normalized = 0
 * - Orthogonal traits (cosine = 0) → normalized = 0.5
 * - Identical traits (cosine = 1) → normalized = 1
 * 
 * Semantic note: Neutral (orthogonal) ≠ incompatible. Orthogonal traits represent
 * independent dimensions, not opposition, so 0.5 reflects neutral similarity rather
 * than incompatibility.
 * 
 * Returns null if no comparable data (no common traits), 0 if orthogonal/different.
 */
function traitSimilarity(
  userTraits: Array<{ traitKey: string; value: number; n: number }>,
  candidateTraits: Array<{ traitKey: string; value: number; n: number }>
): { value: number | null; coverage: number; commonCount: number } {
  if (!userTraits.length || !candidateTraits.length) {
    return { value: null, coverage: 0, commonCount: 0 };
  }

  // Build maps for O(1) lookup
  const userMap = new Map<string, { value: number; n: number }>();
  for (const trait of userTraits) {
    userMap.set(trait.traitKey, { value: trait.value, n: trait.n });
  }

  const candidateMap = new Map<string, { value: number; n: number }>();
  for (const trait of candidateTraits) {
    candidateMap.set(trait.traitKey, { value: trait.value, n: trait.n });
  }

  // Find common traits and build aligned vectors using effectiveValue (confidence-weighted)
  const userVec: number[] = [];
  const candidateVec: number[] = [];

  for (const key of userMap.keys()) {
    const userTrait = userMap.get(key);
    const candidateTrait = candidateMap.get(key);
    if (userTrait && candidateTrait) {
      // Calculate effective values (confidence-weighted)
      const userConf = calculateConfidence(userTrait.n);
      const candidateConf = calculateConfidence(candidateTrait.n);
      const userEffective = calculateEffectiveValue(userTrait.value, userConf);
      const candidateEffective = calculateEffectiveValue(candidateTrait.value, candidateConf);
      
      userVec.push(userEffective);
      candidateVec.push(candidateEffective);
    }
  }

  if (userVec.length === 0) {
    return { value: null, coverage: 0, commonCount: 0 };
  }

  if (userVec.length !== candidateVec.length) {
    return { value: null, coverage: 0, commonCount: 0 };
  }

  // Calculate cosine similarity (returns [-1, 1])
  const cosine = cosineSimilarity(userVec, candidateVec);

  // Normalize cosine to [0, 1] range
  const normalized = (cosine + 1) / 2; // maps [-1,1] → [0,1]

  // Apply coverage penalty (softened with sqrt to prevent "more traits = worse score")
  const coverage = calculateCoverage(
    userVec.length,
    userTraits.length,
    candidateTraits.length
  );
  const softenedCoverage = Math.sqrt(coverage); // Soften penalty while keeping monotonic
  const finalScore = normalized * softenedCoverage;

  return {
    value: finalScore,
    coverage,
    commonCount: userVec.length
  };
}

/**
 * Calculate interest similarity using Jaccard (overlap ratio)
 * Interests are categorical overlaps, not continuous signals
 */
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

  // Calculate intersection
  let intersection = 0;
  const matches: string[] = [];
  for (const key of candidateKeys) {
    if (userKeys.has(key)) {
      intersection += 1;
      matches.push(labels.get(key) ?? key);
    }
  }

  // Calculate union for Jaccard similarity
  const union = userKeys.size + candidateKeys.size - intersection;
  const overlap = union > 0 ? intersection / union : 0; // Jaccard: |A ∩ B| / |A ∪ B|
  
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
    weights: { ...DEFAULT_CONFIG.weights, ...(overrides.weights ?? {}) },
    topK: overrides.topK ?? 200,
    minTraitOverlap: overrides.minTraitOverlap ?? 2,
    minRatingCount: overrides.minRatingCount ?? 3
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
  const viewerVector = toCenteredVector(
    viewerRatings ? toRatingVector(viewerRatings, options.ratingMax) : null
  );

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

  let lastId: bigint | null = null;
  let totalWritten = 0;
  const topK = options.topK ?? 200;
  const heap = new MinHeap(topK); // Maintain Top-K across all batches for this user

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

    for (const candidate of candidates) {
      // ===== EXPLICIT GATING (ordered) =====
      let excludedBy: string | null = null;

      // Gender gate
      if (preferredGenders?.length) {
        if (!candidate.gender || !preferredGenders.includes(candidate.gender)) {
          excludedBy = 'gender';
        }
      }

      // Age gate
      if (!excludedBy) {
        const candidateAge = computeAge(candidate.birthdate ?? null);
        if ((preferredAgeMin !== null || preferredAgeMax !== null) && candidateAge === null) {
          excludedBy = 'age_missing';
        } else if (preferredAgeMin !== null && candidateAge !== null && candidateAge < preferredAgeMin) {
          excludedBy = 'age_min';
        } else if (preferredAgeMax !== null && candidateAge !== null && candidateAge > preferredAgeMax) {
          excludedBy = 'age_max';
        }
      }

      // Distance gate
      if (!excludedBy) {
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
        // Only exclude if we have a distance AND it exceeds preference (allow text-match fallback)
        if (preferredDistanceKm !== null && distanceKm !== null && distanceKm > preferredDistanceKm) {
          excludedBy = 'distance';
        }
      }

      if (excludedBy) {
        // Skip gated candidates (could optionally store reason for debugging)
        continue;
      }

      // ===== CHEAP SCORE CALCULATION (for pruning) =====
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

      // Calculate cheap scores first (for pruning)
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

      // Interest upper bound (for pruning, not actual score)
      const interestRows = byCandidate.get(candidate.userId) ?? [];
      const interestUpperBoundValue = interestUpperBound(normalizedUser.length, interestRows.length);

      // Cheap score (can compute without expensive operations)
      const cheapScore =
        scoreNew * options.weights.newness +
        scoreNearby * options.weights.proximity +
        interestUpperBoundValue * options.weights.interests;

      // Max possible score (upper bound for pruning)
      const maxPossibleScore =
        cheapScore +
        options.weights.quiz +
        options.weights.ratingQuality +
        options.weights.ratingFit;

      // Pruning: skip if heap is full and max possible is below threshold
      const currentThreshold = heap.peek()?.score ?? -Infinity;
      if (heap.size() >= topK && maxPossibleScore < currentThreshold) {
        continue; // PRUNE - skip expensive calculations
      }

      // ===== EXPENSIVE SCORE CALCULATION (only for non-pruned candidates) =====
      
      // Calculate trait similarity (preferred over legacy quiz similarity)
      let traitSimResult: { value: number | null; coverage: number; commonCount: number } | null = null;
      if (userTraits.length > 0) {
        const candidateTraits = traitsByUserId.get(candidate.userId);
        if (candidateTraits && candidateTraits.length > 0) {
          traitSimResult = traitSimilarity(
            userTraits.map(t => ({ traitKey: t.traitKey, value: Number(t.value), n: t.n })),
            candidateTraits
          );
          
          // Enforce minimum trait overlap threshold
          if (traitSimResult.commonCount < (options.minTraitOverlap ?? 2)) {
            traitSimResult = null; // Treat as missing data
          }
        }
      }

      // ===== QUIZ/TRAIT SCORE =====
      // Metric semantics:
      // - null = not comparable (no data available) → use neutral baseline (0.5)
      // - 0 = valid similarity result (orthogonal/opposite vectors) → use actual 0
      // - 0.5 = neutral baseline (missing data, not bad data)
      
      // Fallback to legacy quiz similarity if no comparable trait data (null, not 0)
      let legacyQuizScore: number | null = null;
      let finalQuizScore: number;
      if (traitSimResult?.value == null) {
        // No comparable trait data - use legacy quiz similarity
        // Note: Candidates with no traits are treated as legacy users
        if (userQuiz) {
          const candidateQuiz = quizByUserId.get(candidate.userId);
          if (candidateQuiz) {
            legacyQuizScore = quizSimilarity(userQuiz, candidateQuiz);
            finalQuizScore = legacyQuizScore; // Valid score (0..1)
          } else {
            finalQuizScore = 0.5; // Neutral baseline: missing data (no quiz)
          }
        } else {
          finalQuizScore = 0.5; // Neutral baseline: missing data (user has no quiz)
        }
      } else {
        // Use trait similarity (even if value is 0 - that's a valid result, not missing)
        finalQuizScore = traitSimResult.value; // Valid score (0..1, may be 0 for orthogonal)
      }

      // ===== INTEREST SCORE =====
      // Metric semantics:
      // - 0 = no overlap (valid result, not missing)
      // - 0.1 = neutral baseline (missing data: no interests recorded)
      // - 0..1 = Jaccard similarity (valid overlap score)
      
      const { overlap: interestOverlap, matches, intersection, userCount, candidateCount } = scoreInterests(
        normalizedUser,
        interestRows
      );
      // If no interests recorded for either user, use neutral baseline
      // If interests exist but no overlap, use 0 (valid result)
      const scoreInterestsValue = (userCount === 0 || candidateCount === 0)
        ? 0.1 // Neutral baseline: missing data (no interests recorded)
        : interestOverlap; // Valid score: 0 = no overlap, >0 = actual overlap

      // ===== RATING SCORES =====
      // Metric semantics:
      // - 0.5 = neutral baseline (missing data or insufficient samples)
      // - 0..1 = valid quality/fit score
      
      const ratingAgg = ratingByProfileId.get(candidate.id) ?? null;
      const ratingAttractive = ratingAgg?.attractive ?? null;
      const ratingSmart = ratingAgg?.smart ?? null;
      const ratingFunny = ratingAgg?.funny ?? null;
      const ratingInteresting = ratingAgg?.interesting ?? null;

      let scoreRatingsQuality: number;
      let scoreRatingsFit: number;
      
      // Enforce minimum rating count threshold
      if (ratingAgg && ratingAgg.count >= (options.minRatingCount ?? 3)) {
        // Sufficient data: use actual scores
        const ratingQualityRaw = averageRatings(ratingAgg);
        scoreRatingsQuality = ratingQualityRaw != null ? (normalizeRating(ratingQualityRaw, options.ratingMax) ?? 0.5) : 0.5;

        const candidateVector = toCenteredVector(
          toRatingVector(ratingAgg, options.ratingMax)
        );
        scoreRatingsFit = viewerVector && candidateVector
          ? clamp((cosineSimilarity(viewerVector, candidateVector) + 1) / 2)
          : 0.5; // Neutral baseline: missing viewer ratings
      } else {
        // Insufficient data: use neutral baseline (missing ≠ bad)
        scoreRatingsQuality = 0.5; // Neutral baseline: missing/low-count data
        scoreRatingsFit = 0.5; // Neutral baseline: missing/low-count data
      }

      const scoreQuiz = finalQuizScore;

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
          traitSim: traitSimResult?.value ?? null,
          traitCoverage: traitSimResult?.coverage,
          traitCommonCount: traitSimResult?.commonCount,
          quizSimLegacy: traitSimResult?.value == null ? legacyQuizScore : undefined,
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
          interesting: ratingInteresting,
          count: ratingAgg.count
        };
      }

      // Add to heap (maintains Top-K)
      heap.push({
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
        algorithmVersion: vNext
      });
    }

    if (options.pauseMs > 0) {
      await sleep(options.pauseMs);
    }
  }

  // After all batches, write Top-K only (from heap, sorted descending)
  const topScores = heap.toArray();
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
