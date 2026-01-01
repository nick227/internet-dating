# Trait-Based Matching — Internal Spec (v1)

## Purpose

Generate stable, rankable match scores using traits, interests, proximity, ratings, and recency. This system is heuristic, deterministic, and job-driven.

---

## Core Rules

1. **Similarity gates relevance; proximity ranks** — Trait similarity determines if users are compatible; proximity determines ranking within compatible users.

2. **Missing data ≠ negative data** — Absence of a trait is not the same as a negative trait value. Missing traits are excluded from comparison, not imputed.

3. **Sparse data self-penalizes** — Users with fewer traits get lower similarity scores due to coverage penalties.

4. **Traits ≠ interests** — Traits are continuous spectrums; interests are categorical overlaps. Use different matching algorithms.

5. **Fallbacks are explicit, never inferred** — Use `null` sentinel for "no comparable data". Only fallback on `null`, never on `0`.

---

## Data Inputs

### Traits

- **Source:** Quiz `traitValues` on `QuizOption`
- **Range:** [-10, +10]
- **Meaning:** Position on a spectrum (e.g., introverted ↔ extroverted)
- **Storage:** `UserTrait(userId, traitKey, value, n)` where `n` = contribution count
- **Aggregation:** Mean of all quiz answer contributions per trait

### Interests

- **Source:** Quizzes or explicit user selection
- **Meaning:** Categorical overlap (binary: have it or don't)
- **Storage:** `UserInterest(userId, subjectId, interestId)`
- **Matching:** Overlap ratio (Jaccard), not magnitude-based

### Context Signals

- **Proximity:** Geographic distance (haversine) or location text match
- **Ratings:** Quality (average) and fit (cosine similarity of rating vectors)
- **Newness:** Recency score based on profile update time

---

## build-user-traits Job

### Responsibilities

1. **Incrementally update traits** after quiz changes (only affected users)
2. **Aggregate trait values** per user from all quiz answers
3. **Track contribution count (n)** per trait for confidence calculation

### Algorithm

```typescript
async function aggregateUserTraits(userId: bigint): Promise<Map<string, TraitAggregate>> {
  const accumulator = new Map<string, { sum: number; count: number }>();
  
  // Fetch all quiz results for user
  const quizResults = await prisma.quizResult.findMany({
    where: { userId },
    select: { quizId: true, answers: true }
  });
  
  // For each quiz result, process answers
  for (const result of quizResults) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: result.quizId },
      select: {
        questions: {
          select: {
            id: true,
            options: {
              select: { id: true, value: true, traitValues: true }
            }
          }
        }
      }
    });
    
    // Build option → traitValues map
    const optionTraits = new Map<string, Map<string, number>>();
    for (const question of quiz.questions) {
      for (const option of question.options) {
        const traits = parseTraitValues(option.traitValues);
        optionTraits.set(`${question.id}:${option.value}`, traits);
      }
    }
    
    // Process answers
    const answers = result.answers as Record<string, string>;
    for (const [questionId, answerValue] of Object.entries(answers)) {
      const traits = optionTraits.get(`${questionId}:${answerValue}`);
      if (!traits) continue;
      
      // Accumulate
      for (const [traitKey, traitValue] of traits.entries()) {
        const existing = accumulator.get(traitKey);
        if (existing) {
          existing.sum += traitValue;
          existing.count += 1;
        } else {
          accumulator.set(traitKey, { sum: traitValue, count: 1 });
        }
      }
    }
  }
  
  return accumulator;
}
```

### Derived Values

```typescript
const CONFIDENCE_NORM = 5; // Normalization constant

function deriveTraitValue(sum: number, count: number): { value: number; confidence: number } {
  const mean = count > 0 ? sum / count : 0;
  const confidence = clamp(count / CONFIDENCE_NORM, 0, 1);
  const effectiveValue = mean * confidence; // Shrinkage toward 0 when n is small
  
  return { value: mean, confidence, effectiveValue };
}
```

**Confidence Model:**
- `confidence = clamp(n / CONFIDENCE_NORM, 0..1)`
- `effectiveValue = value * confidence`
- Traits with fewer contributions (low `n`) are shrunk toward 0
- `CONFIDENCE_NORM ≈ 5` (trait based on 5+ answers has full confidence)

### Storage

```prisma
model UserTrait {
  id        BigInt   @id @default(autoincrement())
  userId    BigInt
  traitKey  String
  value     Decimal  @db.Decimal(10,2)  // Mean value
  n         Int      // Contribution count (for confidence)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User @relation(fields: [userId], references: [id])
  @@unique([userId, traitKey])
  @@index([userId])
  @@index([traitKey])
}
```

### Job Guarantees

- **Incremental updates only:** Only recalculate traits for users with new/changed quiz answers
- **Confidence derived from contribution count:** `n` tracks how many quiz answers contributed
- **No full recompute unless inputs change:** Efficient, scalable approach

---

## Trait Similarity (match-scores Job)

### Step 1 — Find Comparable Traits

```typescript
function findCommonTraits(
  userTraits: Array<{ traitKey: string; value: number; n: number }>,
  candidateTraits: Array<{ traitKey: string; value: number; n: number }>
): Array<{ user: number; candidate: number; userConf: number; candidateConf: number }> {
  const userMap = new Map<string, { value: number; n: number }>();
  for (const t of userTraits) {
    userMap.set(t.traitKey, { value: t.value, n: t.n });
  }
  
  const candidateMap = new Map<string, { value: number; n: number }>();
  for (const t of candidateTraits) {
    candidateMap.set(t.traitKey, { value: t.value, n: t.n });
  }
  
  const common: Array<{ user: number; candidate: number; userConf: number; candidateConf: number }> = [];
  
  for (const key of userMap.keys()) {
    const userTrait = userMap.get(key);
    const candidateTrait = candidateMap.get(key);
    if (userTrait && candidateTrait) {
      const userConf = clamp(userTrait.n / CONFIDENCE_NORM, 0, 1);
      const candidateConf = clamp(candidateTrait.n / CONFIDENCE_NORM, 0, 1);
      common.push({
        user: userTrait.value * userConf, // effectiveValue
        candidate: candidateTrait.value * candidateConf, // effectiveValue
        userConf,
        candidateConf
      });
    }
  }
  
  return common;
}
```

**Contract:**
- If `commonTraits.length === 0` → return `null` (no comparable data)
- Only traits present in both users are considered

### Step 2 — Coverage Penalty

```typescript
function calculateCoverage(
  commonCount: number,
  userTraitCount: number,
  candidateTraitCount: number
): number {
  const minTraitCount = Math.min(userTraitCount, candidateTraitCount);
  if (minTraitCount === 0) return 0;
  return commonCount / minTraitCount;
}
```

**Purpose:** Penalize sparse trait intersections. Measures how complete the comparison is relative to the weaker (less expressive) profile.

**Formula:**
```
coverage = commonTraits.length / min(userA.traits.length, userB.traits.length)
```

**Why `min` instead of `max`:**
- Using `max` penalizes the more expressive user incorrectly
- Using `min` correctly identifies that sparse profiles are the limiting factor
- If User A has 20 traits and User B has 3 traits (all 3 in common), coverage = 3/3 = 1.0
  - This means we can compare User B completely (all their traits match)
  - The real issue is User B is underspecified, not that User A has too many traits
- Preserves the "sparse data self-penalizes" rule correctly

### Step 3 — Similarity Calculation

```typescript
function calculateTraitSimilarity(
  userTraits: Array<{ traitKey: string; value: number; n: number }>,
  candidateTraits: Array<{ traitKey: string; value: number; n: number }>
): { value: number | null; coverage: number; commonCount: number } {
  const common = findCommonTraits(userTraits, candidateTraits);
  
  if (common.length === 0) {
    return { value: null, coverage: 0, commonCount: 0 };
  }
  
  // Build aligned vectors using effectiveValue (confidence-weighted)
  const userVec = common.map(t => t.user);
  const candidateVec = common.map(t => t.candidate);
  
  // Calculate cosine similarity (returns [-1, 1])
  const cosine = cosineSimilarity(userVec, candidateVec);
  
  // Normalize cosine to [0, 1] range
  const normalized = (cosine + 1) / 2; // maps [-1,1] → [0,1]
  
  // Apply coverage penalty
  const coverage = calculateCoverage(
    common.length,
    userTraits.length,
    candidateTraits.length
  );
  
  const finalScore = normalized * coverage;
  
  return {
    value: finalScore,
    coverage,
    commonCount: common.length
  };
}
```

**Contract:**
```typescript
traitSim: {
  value: number | null  // null = no comparable data, 0 = valid difference
  coverage: number      // 0..1, penalty for sparse intersection
  commonCount: number   // Number of shared traits
}
```

**Key Points:**
- Uses `effectiveValue` (confidence-weighted) for similarity calculation
- Normalizes cosine similarity from [-1, 1] to [0, 1] before applying coverage
- Applies coverage penalty to final score (using `min`, not `max`)
- Returns `null` when no common traits (explicit "no data" signal)
- Returns `0` when vectors are orthogonal (valid result, not "no data")
- Final score is always in [0, 1] range (never negative)

---

## Interest Similarity

### Algorithm

Interests are **categorical overlaps**, not continuous signals. Use Jaccard similarity (overlap ratio):

```typescript
function calculateInterestSimilarity(
  userInterests: Array<{ subjectId: bigint; interestId: bigint }>,
  candidateInterests: Array<{ subjectId: bigint; interestId: bigint }>
): number {
  if (!userInterests.length || !candidateInterests.length) {
    return 0;
  }
  
  const userKeys = new Set<string>();
  for (const i of userInterests) {
    userKeys.add(`${i.subjectId}:${i.interestId}`);
  }
  
  const candidateKeys = new Set<string>();
  for (const i of candidateInterests) {
    candidateKeys.add(`${i.subjectId}:${i.interestId}`);
  }
  
  // Intersection
  let intersection = 0;
  for (const key of candidateKeys) {
    if (userKeys.has(key)) {
      intersection += 1;
    }
  }
  
  // Union
  const union = userKeys.size + candidateKeys.size - intersection;
  
  if (union === 0) return 0;
  
  // Jaccard similarity
  return intersection / union;
}
```

**Formula:**
```
interestSim = |A ∩ B| / |A ∪ B|
```

**Key Points:**
- Interests are **not** used in cosine similarity
- Binary overlap, not magnitude-based
- Returns 0..1 (0 = no overlap, 1 = identical interests)

---

## Fallback Logic (Strict)

### Contract

```typescript
type TraitSimilarityResult = {
  value: number | null;  // null = no comparable data, 0 = valid difference
  coverage: number;
  commonCount: number;
};

function getTraitScore(
  userTraits: UserTrait[],
  candidateTraits: UserTrait[]
): TraitSimilarityResult | null {
  const result = calculateTraitSimilarity(userTraits, candidateTraits);
  
  // Explicit null check - only fallback when no comparable data
  if (result.value === null) {
    return null; // Signal to use legacy quiz similarity
  }
  
  return result;
}
```

### Usage in Match Scoring

```typescript
// Calculate trait similarity
const traitSim = getTraitScore(userTraits, candidateTraits);

// Fallback logic (strict)
let finalTraitScore = 0;
if (traitSim === null) {
  // No comparable trait data - use legacy quiz similarity
  if (userQuiz && candidateQuiz) {
    finalTraitScore = quizSimilarity(userQuiz, candidateQuiz);
  }
} else {
  // Use trait similarity (even if value is 0)
  finalTraitScore = traitSim.value;
}
```

**Rules:**
- **Never fallback on `0`** — Zero similarity is a valid result (orthogonal/different vectors)
- **Only fallback on `null`** — `null` means "no comparable data" (no overlap, missing traits)
- **Explicit, never inferred** — Always check for `null` explicitly

---

## Score Composition

### Gating (Pre-Score Filtering)

Before calculating final score, apply filters:

```typescript
function shouldScoreCandidate(
  user: UserProfile,
  candidate: CandidateProfile,
  traitSim: TraitSimilarityResult | null,
  options: ScoringOptions
): boolean {
  // Dealbreakers (if any) → drop
  if (hasDealbreaker(user, candidate)) {
    return false;
  }
  
  // Minimum trait coverage threshold (optional)
  if (options.minTraitCoverage && traitSim) {
    if (traitSim.coverage < options.minTraitCoverage) {
      return false;
    }
  }
  
  // Distance hard cutoffs (optional)
  if (options.maxDistanceKm && distanceKm > options.maxDistanceKm) {
    return false;
  }
  
  return true;
}
```

### Final Score Calculation

```typescript
function calculateMatchScore(
  traitSim: number,           // From trait similarity (or legacy quiz)
  interestSim: number,         // Jaccard overlap
  proximity: number,           // 0..1, distance-based
  ratingQuality: number,       // 0..1, average rating
  ratingFit: number,           // 0..1, cosine of rating vectors
  newness: number,             // 0..1, recency score
  weights: ScoreWeights
): number {
  return (
    traitSim * weights.traits +
    interestSim * weights.interests +
    proximity * weights.proximity +
    ratingQuality * weights.ratingQuality +
    ratingFit * weights.ratingFit +
    newness * weights.newness
  );
}
```

### Weight Semantics

Weights are **tuning knobs, not truth**. They control the relative importance of each signal:

- **Traits:** Relevance gate — determines if users are fundamentally compatible
- **Proximity:** Ranking within relevance — breaks ties among compatible users
- **Ratings:** Smoothing — adjusts based on community feedback
- **Newness:** Tie-breaking — favors recent activity

**Default Weights (example):**
```typescript
const DEFAULT_WEIGHTS = {
  traits: 0.30,        // Primary relevance signal
  interests: 0.20,     // Secondary relevance signal
  proximity: 0.20,     // Ranking signal
  ratingQuality: 0.15, // Quality signal
  ratingFit: 0.10,     // Fit signal
  newness: 0.05        // Tie-breaker
};
```

**Calibration:** Weights should be tuned based on outcomes (matches → conversations → retention), not intuition.

---

## Job Guarantees

### build-user-traits Job

**Inputs:**
- Quiz results (answers)
- Quiz questions and options (with `traitValues`)

**Outputs:**
- `UserTrait` rows (userId, traitKey, value, n)

**Guarantees:**
- Incremental updates only (only affected users)
- Confidence derived from contribution count (`n`)
- No full recompute unless inputs change
- Deterministic (same inputs → same outputs)
- **Worker job only** — not triggered on quiz submission
- Should be run periodically (cron) or on-demand via job runner

**Performance:**
- Batch process users in configurable batch sizes
- Skip users with no quiz results
- Pause between batches for DB load management

### match-scores Job

**Inputs:**
- User profile and preferences
- Candidate profiles
- User traits (batch-loaded)
- Candidate traits (batch-loaded)
- User interests
- Candidate interests
- Ratings data
- Location data

**Outputs:**
- `MatchScore` rows with:
  - `score` (final weighted score)
  - `scoreQuiz` (trait similarity or legacy quiz)
  - `scoreInterests` (Jaccard overlap)
  - `scoreRatingsQuality`, `scoreRatingsFit`
  - `scoreNew`, `scoreNearby`
  - `reasons` (JSON with explainable breakdown)

**Guarantees:**
- Batch-load traits for all candidates in single query
- Apply confidence + coverage penalties
- Emit explainable reasons for debugging/analysis
- Deterministic scoring (same inputs → same scores)

**Performance:**
- Process users in batches
- Load candidate traits in bulk (not per-candidate)
- Use map-based lookups (O(1) per candidate)

---

## Implementation Details

### Cosine Similarity Function

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  if (a.length === 0) return 0;
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  
  if (!normA || !normB) return 0;
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Properties:**
- Returns [-1, 1] (typically normalized to [0, 1] for match scoring)
- Measures angle between vectors, not proximity
- Magnitude-blind: [1,1] vs [10,10] → ~1.0

### Confidence Normalization

```typescript
const CONFIDENCE_NORM = 5;

function calculateConfidence(contributionCount: number): number {
  return clamp(contributionCount / CONFIDENCE_NORM, 0, 1);
}

function applyConfidence(value: number, confidence: number): number {
  return value * confidence; // Shrinkage toward 0 when confidence < 1
}
```

**Rationale:**
- Trait based on 1 answer: confidence = 0.2, shrunk toward 0
- Trait based on 5 answers: confidence = 1.0, full value
- Trait based on 10 answers: confidence = 1.0 (capped), full value

### Coverage Penalty

```typescript
function applyCoveragePenalty(
  similarity: number,
  commonCount: number,
  userTraitCount: number,
  candidateTraitCount: number
): number {
  const minCount = Math.min(userTraitCount, candidateTraitCount);
  if (minCount === 0) return 0;
  
  const coverage = commonCount / minCount;
  return similarity * coverage;
}
```

**Effect:**
- User A with 20 traits, User B with 3 traits, 3 common → coverage = 3/3 = 1.0
  - All of User B's traits are in common, so comparison is complete relative to User B
  - The limiting factor is User B's sparse profile, not User A's expressiveness
- User A with 5 traits, User B with 10 traits, 3 common → coverage = 3/5 = 0.6
  - Only 60% of User A's traits are in common, so comparison is incomplete
- Encourages users to answer more questions (sparse profiles limit matching quality)

---

## Trait Taxonomy

### Taxonomy Rule: One Axis = One Signed Trait

**Rule (Locked):** Opposite traits must not remain separate long-term. One axis = one signed trait.

**Current Issue:**
- `personality.introverted` and `personality.outgoing` are opposites but stored as separate keys
- `lifestyle.social` and `lifestyle.homebody` are correlated but separate

**Required Fix:**
- Use single signed dimensions: `personality.extroversion: -10` to `+10`
- Do NOT rely on subtracting opposites at match time
- Fix it at aggregation time in `build-user-traits` job
- Collapse opposites during trait aggregation: `extroversion = outgoing - introverted`

**Short-term tolerance:** Current separate keys are acceptable temporarily, but must be fixed in aggregation logic.

**Implementation Note:** This should be handled in `buildUserTraitsJob` during aggregation, not in match scoring.

### Current Structure

**personality.***
- `personality.funny` - Sense of humor
- `personality.nice` - Kindness/empathy
- `personality.outgoing` - Extroversion (⚠️ see note below)
- `personality.introverted` - Introversion (⚠️ see note below)
- `personality.analytical` - Logical thinking

**lifestyle.***
- `lifestyle.social` - Social activity level
- `lifestyle.homebody` - Preference for home activities
- `lifestyle.active` - Physical activity level

**values.***
- `values.adventure` - Risk-taking, exploration
- `values.family` - Family orientation
- `values.health` - Health consciousness
- `values.materialistic` - Material possessions

**interests.***
- `interests.music` - Music appreciation
- `interests.sports` - Sports interest
- `interests.culture` - Cultural activities
- `interests.arts` - Artistic interests
- `interests.food` - Food/cooking
- `interests.nature` - Nature/outdoors

### Taxonomy Issues

**Opposite Traits:**
- `personality.introverted` and `personality.outgoing` are opposites but stored as separate keys
- `lifestyle.social` and `lifestyle.homebody` are correlated but separate

**Current Behavior:**
- Opposites cannot be compared (different keys → no intersection)
- Incompatibility is hidden when users have opposite traits
- Users can accumulate high values for both opposites (schema allows it)

**Future Fix:**
- Collapse opposites into single signed dimensions: `personality.extroversion: -8` to `+8`
- OR normalize post-aggregation: `extroversion = outgoing - introverted`
- OR enforce mutual exclusivity at aggregation level

---

## Data Flow

### Complete Pipeline

```
1. User answers quiz
   ↓
2. Quiz submission marks user dirty; rebuild occurs via worker job.
   ↓
3. build-user-traits job:
   - Fetches all quiz results for user
   - Aggregates traitValues from all answers
   - Calculates mean, stores n (count)
   - Updates UserTrait table
   ↓
4. match-scores job (periodic or on-demand):
   - Loads user traits (with n for confidence)
   - Batch-loads candidate traits
   - For each candidate:
     a. Find common traits
     b. Calculate cosine similarity on effectiveValue vectors
     c. Normalize cosine from [-1,1] to [0,1]
     d. Apply coverage penalty (using min, not max)
     e. Calculate interest overlap (Jaccard)
     f. Combine with other signals
     g. Store MatchScore with reasons
   ↓
5. Match scores used for:
   - Feed suggestions
   - Compatibility calculations
   - Profile recommendations
```

---

## Performance Considerations

### Batch Loading

**Traits:**
```typescript
// Load all candidate traits in one query
const candidateTraits = await prisma.userTrait.findMany({
  where: { userId: { in: candidateIds } },
  select: { userId: true, traitKey: true, value: true, n: true }
});

// Group by userId for O(1) lookup
const traitsByUserId = new Map<bigint, Array<{ traitKey: string; value: number; n: number }>>();
for (const trait of candidateTraits) {
  const existing = traitsByUserId.get(trait.userId);
  if (existing) {
    existing.push({ traitKey: trait.traitKey, value: Number(trait.value), n: trait.n });
  } else {
    traitsByUserId.set(trait.userId, [{ traitKey: trait.traitKey, value: Number(trait.value), n: trait.n }]);
  }
}
```

**Interests:**
```typescript
// Load all candidate interests in one query
const candidateInterests = await prisma.userInterest.findMany({
  where: { userId: { in: candidateIds } },
  select: { userId: true, subjectId: true, interestId: true }
});
```

### Optimization Strategies

1. **Map-based lookups:** O(1) per candidate instead of O(n) searches
2. **Intersection-only processing:** Only compute similarity on common traits
3. **Early exits:** Return `null` immediately if no common traits
4. **Batch queries:** Load all candidate data in single queries
5. **Confidence pre-calculation:** Compute `effectiveValue` once, reuse

---

## Testing & Validation

### Unit Tests

**Trait Similarity:**
- No common traits → returns `null`
- Orthogonal vectors → returns `0`
- Identical vectors → returns `1 * coverage`
- Coverage penalty applied correctly

**Interest Similarity:**
- No overlap → returns `0`
- Full overlap → returns `1`
- Partial overlap → returns correct ratio

**Confidence:**
- n=1 → confidence ≈ 0.2
- n=5 → confidence = 1.0
- n=10 → confidence = 1.0 (capped)

### Integration Tests

- End-to-end: quiz answer → trait build → match score
- Multiple users with varying trait coverage
- Fallback behavior when traits unavailable
- Batch processing performance

### Validation Queries

```sql
-- Check trait coverage distribution
SELECT 
  COUNT(DISTINCT userId) as users_with_traits,
  AVG(trait_count) as avg_traits_per_user,
  MIN(trait_count) as min_traits,
  MAX(trait_count) as max_traits
FROM (
  SELECT userId, COUNT(*) as trait_count
  FROM UserTrait
  GROUP BY userId
) sub;

-- Check confidence distribution
SELECT 
  n,
  COUNT(*) as trait_count,
  AVG(value) as avg_value
FROM UserTrait
GROUP BY n
ORDER BY n;
```

---

## Summary

This specification defines a trait-based matching system that:

1. **Aggregates traits** from quiz answers with confidence tracking
2. **Calculates similarity** using cosine on confidence-weighted vectors with coverage penalties
3. **Handles missing data** explicitly (null for no data, 0 for difference)
4. **Separates interests** from traits (Jaccard vs cosine)
5. **Composes scores** from multiple signals with configurable weights
6. **Provides guarantees** for incremental updates and batch processing

**Key Principles:**
- Similarity gates relevance; proximity ranks
- Missing data ≠ negative data
- Sparse data self-penalizes
- Traits ≠ interests
- Fallbacks are explicit, never inferred

The system is deterministic, job-driven, and designed for scalability through incremental updates and batch processing.
