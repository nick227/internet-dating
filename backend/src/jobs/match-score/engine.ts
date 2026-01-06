import { MatchContext, MatchOperator } from './operators/types.js';

type ScoreComponents = {
  scoreQuiz: number;
  scoreInterests: number;
  scoreRatingsQuality: number;
  scoreRatingsFit: number;
  scoreNew: number;
  scoreNearby: number;
};

// Simple compliance type (not a map - we have exactly 3 stable classifiers)
type Compliance = {
  gender: boolean;
  age: boolean;
  distance: boolean;
};

type ScoringResult = {
  score: number;
  components: ScoreComponents;
  reasons: Record<string, unknown>;
  compliance: Compliance; // New field: simple object
  upperBound: number; // New field: for caller to use in pruning
};

type Weights = {
  quiz: number;
  interests: number;
  ratingQuality: number;
  ratingFit: number;
  newness: number;
  proximity: number;
};

/**
 * Score a candidate using the operator pipeline.
 * 
 * This is the core reusable scoring function that can be used for:
 * - Match score computation (batch job)
 * - Recommendations API
 * - Feed ranking
 * - "Explain match" endpoints
 * 
 * Process:
 * 1. Hard gating: Exclude candidates that don't meet hard requirements (safety/invariants only)
 * 2. Preference classification: Compute compliance flags (not exclusion)
 * 3. Upper bound estimation: Fast estimate for pruning (caller decides how to use it)
 * 4. Expensive scoring: Full score calculation using all operators
 * 
 * @param ctx - Match context (viewer, candidate, preferences)
 * @param hardGateOperators - Operators that perform hard exclusions (safety/invariants only)
 * @param preferenceClassifiers - Operators that classify preference compliance (gender, age, distance)
 * @param scoringOperators - Operators that compute scores
 * @param weights - Weight configuration for each scoring dimension
 * @returns Scoring result with total score, components, compliance, and upperBound, or null if gated
 * 
 * Note: This function does NOT know about heaps or pruning. The caller orchestrates pruning.
 */
export function scoreCandidate(
  ctx: MatchContext,
  hardGateOperators: MatchOperator[],
  preferenceClassifiers: MatchOperator[],
  scoringOperators: MatchOperator[],
  weights: Weights
): ScoringResult | null {
  // ===== 1. HARD GATING (safety/invariants only) =====
  for (const op of hardGateOperators) {
    if (op.gate && !op.gate(ctx)) {
      return null; // Candidate is gated (safety/invariant violation)
    }
  }

  // ===== 2. PREFERENCE CLASSIFICATION (not exclusion) =====
  const compliance: Compliance = {
    gender: preferenceClassifiers.find(op => op.key === 'gender')?.classify?.(ctx) ?? true,
    age: preferenceClassifiers.find(op => op.key === 'age')?.classify?.(ctx) ?? true,
    distance: preferenceClassifiers.find(op => op.key === 'distance')?.classify?.(ctx) ?? true
  };

  // ===== 3. UPPER BOUND ESTIMATION (for pruning) =====
  // Calculate partial scores (fast estimates) and remaining weights for upper bound
  // 
  // Upper bound formula:
  //   partialSum = Σ(cheapScore × weight) for operators with cheap()
  //   remainingWeights = Σ(weight) for operators without cheap()
  //   upperBound = partialSum + remainingWeights
  //
  // This assumes operators without cheap() could achieve max score of 1.0,
  // which is safe for pruning (overestimates, never underestimates).
  
  let partialSum = 0;  // Sum of (cheap estimate × weight) for ops with cheap()
  let remainingWeights = 0;  // Sum of weights for ops without cheap()

  for (const op of scoringOperators) {
    if (op.cheap) {
      const cheap = op.cheap(ctx);
      partialSum += cheap * weights[op.weightKey];
    } else {
      // Operators without cheap estimates: assume they could contribute full weight (score = 1.0)
      remainingWeights += weights[op.weightKey];
    }
  }

  // Upper bound = partial scores + remaining weights
  const upperBound = partialSum + remainingWeights;

  // ===== 3. EXPENSIVE SCORE CALCULATION (only for non-pruned candidates) =====
  let totalScore = 0;
  const components: Partial<ScoreComponents> = {};
  const reasons: Record<string, unknown> = {
    scores: {} as Record<string, unknown>,
    interests: {} as Record<string, unknown>
  };

  for (const op of scoringOperators) {
    const result = op.score(ctx);
    const value = result.score ?? 0.5; // null = missing → neutral baseline
    totalScore += value * weights[op.weightKey];

    // Store component score
    components[op.componentKey] = value;

    // Store metadata
    if (result.meta) {
      if (op.key === 'interests') {
        reasons.interests = result.meta;
      } else if (op.key === 'traits') {
        // Merge trait metadata into scores
        const traitMeta = result.meta as Record<string, unknown>;
        (reasons.scores as Record<string, unknown>).traitSim = traitMeta.traitSim;
        (reasons.scores as Record<string, unknown>).traitCoverage = traitMeta.traitCoverage;
        (reasons.scores as Record<string, unknown>).traitCommonCount = traitMeta.traitCommonCount;
        (reasons.scores as Record<string, unknown>).quizSimLegacy = traitMeta.quizSimLegacy;
      } else {
        (reasons.scores as Record<string, unknown>)[op.key] = result.meta;
      }
    }
  }

  // Store all component scores in reasons
  (reasons.scores as Record<string, unknown>).quizSim = components.scoreQuiz ?? 0.5;
  (reasons.scores as Record<string, unknown>).interestOverlap = components.scoreInterests ?? 0;
  (reasons.scores as Record<string, unknown>).ratingQuality = components.scoreRatingsQuality ?? 0.5;
  (reasons.scores as Record<string, unknown>).ratingFit = components.scoreRatingsFit ?? 0.5;
  (reasons.scores as Record<string, unknown>).newness = components.scoreNew ?? 0;
  (reasons.scores as Record<string, unknown>).proximity = components.scoreNearby ?? 0;

  // Always include compliance in reasons (for explain endpoints)
  reasons.compliance = compliance;

  return {
    score: totalScore,
    components: withComponentDefaults(components),
    reasons,
    compliance,
    upperBound
  };
}

/**
 * Apply default values to component scores for consistent semantics.
 * - quiz/traits: 0.5 (neutral baseline for missing data)
 * - interests: 0 (no overlap is valid, not missing)
 * - ratings: 0.5 (neutral baseline for missing/low-count data)
 * - newness: 0 (no signal)
 * - proximity: 0 (no signal)
 */
function withComponentDefaults(
  components: Partial<ScoreComponents>
): ScoreComponents {
  return {
    scoreQuiz: components.scoreQuiz ?? 0.5,
    scoreInterests: components.scoreInterests ?? 0,
    scoreRatingsQuality: components.scoreRatingsQuality ?? 0.5,
    scoreRatingsFit: components.scoreRatingsFit ?? 0.5,
    scoreNew: components.scoreNew ?? 0,
    scoreNearby: components.scoreNearby ?? 0
  };
}
