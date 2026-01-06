import { cosineSimilarity, clamp } from '../math/vectors.js';

const CONFIDENCE_NORM = 5; // Normalization constant for confidence calculation

function calculateConfidence(n: number): number {
  return clamp(n / CONFIDENCE_NORM, 0, 1);
}

function calculateEffectiveValue(value: number, confidence: number): number {
  return value * confidence;
}

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
export function traitSimilarity(
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
