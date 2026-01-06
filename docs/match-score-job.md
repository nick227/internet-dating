# Match Score Job

## Overview

The Match Score Job computes compatibility scores between users using a composable operator pipeline. It's designed as a **reusable match engine** that can be used for batch processing, recommendations, feed ranking, and "explain match" endpoints.

## Architecture

The system is organized into three layers:

```
┌─────────────────────────────────────────┐
│         Job Orchestration                │
│  (matchScoreJob.ts)                     │
│  - Batch processing                     │
│  - Data loading                          │
│  - Persistence                           │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Scoring Engine                   │
│  (engine.ts)                             │
│  - Gating → Pruning → Scoring            │
│  - Reusable across contexts              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│         Operators                        │
│  (operators/*.ts)                        │
│  - Self-contained scoring functions      │
│  - Gates, Proximity, Traits, etc.        │
└─────────────────────────────────────────┘
```

### Key Components

1. **Operators** (`/match-score/operators/`)
   - Self-contained scoring functions
   - Each operator defines: `key`, `weightKey`, `componentKey`
   - Optional: `gate()`, `cheap()`, `score()`
   
   **Operator Guarantees**:
   - `cheap()` must overestimate or equal the final score (never underestimate)
   - `score()` may return `null` (missing data) but must never throw
   - Operators must be pure (no DB access, no side effects)

2. **Scoring Engine** (`/match-score/engine.ts`)
   - Reusable `scoreCandidate()` function
   - Handles gating, pruning, and scoring pipeline
   - Returns structured results with components and reasons

3. **Math Utilities** (`/match-score/math/`)
   - Pure functions: geo calculations, vector math, statistics
   - Zero dependencies on Prisma or job state

4. **Scoring Functions** (`/match-score/scoring/`)
   - Domain-specific scoring logic
   - Traits, interests, quiz, ratings, proximity

## Scoring Process

The scoring process follows a three-stage pipeline:

### 1. Hard Gating

**Purpose**: Exclude candidates that don't meet hard requirements.

**Operators**: `GenderGate`, `AgeGate`, `DistanceGate`

**Behavior**: 
- If any gate returns `false`, candidate is immediately excluded
- No scoring is performed for gated candidates
- Gating is fast (no expensive calculations)

**Canonical Pattern** (use this everywhere):
```typescript
// Candidate-level short-circuit (not loop-level continue)
for (const gate of gateOperators) {
  if (gate.gate && !gate.gate(ctx)) {
    return null; // Exclude candidate immediately
  }
}
```

**Important**: Always use `return null` at the candidate level, never `continue` in a loop. This ensures gated candidates are properly excluded and prevents future regressions.

### 2. Upper Bound Estimation (Pruning)

**Purpose**: Skip expensive calculations for candidates that can't make Top-K.

**Terminology**:
- **Partial scores**: Fast estimates from operators that support `cheap()` (e.g., proximity, newness)
- **Upper bound**: Maximum possible final score for this candidate
- **Remaining weights**: Sum of weights for operators without `cheap()` estimates

**Mathematical Definition**:
```
Upper bound = (sum of partial scores × weights) + (sum of remaining operator weights)
```

This assumes operators without `cheap()` estimates could achieve a maximum score of 1.0, which is safe for pruning (overestimates, never underestimates).

**Process**:
1. Calculate partial scores for operators that support `cheap()`
2. Compute upper bound using the formula above
3. If heap is full and upper bound < current threshold → prune

**Operators with partial scores** (support `cheap()`):
- `ProximityOperator`: Distance-based proximity (fast)
- `NewnessOperator`: Profile age calculation (fast)
- `InterestOperator`: Upper bound Jaccard (fast, overestimates)

**Operators without partial scores** (no `cheap()`):
- `TraitOperator`: Requires expensive cosine similarity
- `RatingQualityOperator`: Requires rating aggregation
- `RatingFitOperator`: Requires vector calculations

**Pruning Logic**:
```typescript
// Calculate partial scores (fast estimates)
let partialScoreSum = 0;
let remainingWeights = 0;

for (const op of scoringOperators) {
  if (op.cheap) {
    partialScoreSum += op.cheap(ctx) * weights[op.weightKey];
  } else {
    remainingWeights += weights[op.weightKey];
  }
}

// Upper bound = partial scores + remaining weights (assumes max 1.0 for remaining)
const upperBound = partialScoreSum + remainingWeights;

if (heap.size() >= topK && upperBound < currentThreshold) {
  return null; // Pruned - skip expensive calculations
}
```

### 3. Expensive Scoring

**Purpose**: Calculate final scores using all operators.

**Process**:
1. Run all scoring operators
2. Apply weights: `totalScore += value * weights[op.weightKey]`
3. Store component scores and metadata
4. Return structured result

**Component Defaults**:
- `scoreQuiz`: 0.5 (neutral baseline for missing data)
- `scoreInterests`: 0 (no overlap is valid, not missing)
- `scoreRatingsQuality`: 0.5 (neutral baseline)
- `scoreRatingsFit`: 0.5 (neutral baseline)
- `scoreNew`: 0 (no signal)
- `scoreNearby`: 0 (no signal)

## Key Concepts

### Neutral vs Zero Semantics

The system distinguishes between:
- **`null`** = Missing data → use neutral baseline (0.5)
- **`0`** = Valid result (orthogonal vectors, no overlap) → use actual 0

**Important**: Neutral baselines are chosen to represent absence of signal, not average quality. A score of 0.5 means "no data available" (neutral), not "average match quality". A score of 0 means "valid comparison resulted in zero similarity" (incompatible), not "missing data".

**Example - Traits**:
```typescript
// No comparable traits → null → 0.5 (neutral)
if (traitSimResult?.value == null) {
  finalScore = 0.5; // Missing data
}

// Orthogonal traits → 0 → 0 (valid result)
else {
  finalScore = traitSimResult.value; // May be 0
}
```

**Example - Interests**:
```typescript
// No interests recorded → 0.1 (neutral baseline)
if (userCount === 0 || candidateCount === 0) {
  score = 0.1; // Missing data
}
// Interests exist but no overlap → 0 (valid result)
else {
  score = overlap; // May be 0
}
```

### Hard vs Soft Gates

**Hard Gates** (exclude immediately):
- Gender preferences
- Age range
- Distance (if coordinates available)

**Soft Scoring** (influence score, don't exclude):
- Proximity (text match fallback)
- Newness (profile freshness)
- All other scoring dimensions

### Top-K Heap

**Purpose**: Maintain only the top K highest-scoring candidates across all batches.

**Implementation**: Min-heap (smallest score at root)

**Behavior**:
- If heap has space → add candidate
- If heap is full and candidate score > root → replace root
- After all batches → sort descending and write to DB

**Benefits**:
- Memory efficient (only K candidates in memory)
- Works across batches (maintains global Top-K)

## Data Flow

### 1. Load Viewer Context

```typescript
// Profile and preferences
const meProfile = await prisma.profile.findUnique({ where: { userId } });
const preferences = await prisma.userPreference.findUnique({ where: { userId } });

// Traits, interests, quiz, ratings
const userTraits = await prisma.userTrait.findMany({ where: { userId } });
const userInterests = await prisma.userInterest.findMany({ where: { userId } });
const userQuiz = await prisma.quizResult.findFirst({ where: { userId } });
const viewerRatings = await prisma.profileRating.aggregate({ ... });
```

### 2. Process Candidate Batches

```typescript
for (;;) {
  // Load candidate batch
  const candidates = await prisma.profile.findMany({ ... });
  
  // Load candidate data (traits, interests, quizzes, ratings)
  const candidateTraits = await prisma.userTrait.findMany({ ... });
  const candidateInterests = await prisma.userInterest.findMany({ ... });
  // ... etc
  
  // Score each candidate
  for (const candidate of candidates) {
    const result = scoreCandidate(ctx, gateOps, scoringOps, weights, heap, topK);
    if (result) {
      heap.push(createScoreRow(result));
    }
  }
}
```

### 3. Write Top-K Scores

```typescript
const topScores = heap.toArray(); // Sorted descending
await prisma.matchScore.createMany({ data: topScores });

// Versioned swap: delete old version
if (vPrev && vPrev !== vNext) {
  await prisma.matchScore.deleteMany({ where: { userId, algorithmVersion: vPrev } });
}
```

## Operators

### Gate Operators

**GenderGate** (`operators/gates.ts`)
- Excludes candidates whose gender doesn't match preferences
- Returns `false` if gender is missing and preferences exist

**AgeGate** (`operators/gates.ts`)
- Excludes candidates outside age range
- Returns `false` if age is missing and preferences exist

**DistanceGate** (`operators/gates.ts`)
- Excludes candidates beyond preferred distance
- **Important**: If either user lacks coordinates, the gate does not exclude the candidate and proximity scoring may fall back to text-based location matching
- This allows candidates with text-only locations to be scored, preventing over-exclusion

### Scoring Operators

**ProximityOperator** (`operators/proximity.ts`)
- **Weight Key**: `proximity`
- **Component Key**: `scoreNearby`
- **Cheap**: Distance-based proximity calculation
- **Score**: Distance or text-match fallback

**NewnessOperator** (`operators/newness.ts`)
- **Weight Key**: `newness`
- **Component Key**: `scoreNew`
- **Cheap**: Profile age calculation
- **Score**: Exponential decay based on `updatedAt`

**TraitOperator** (`operators/traits.ts`)
- **Weight Key**: `quiz` (legacy compatibility)
- **Component Key**: `scoreQuiz`
- **Score**: Trait similarity (cosine) or legacy quiz fallback
- **Fallback**: Uses quiz similarity if no comparable traits

**InterestOperator** (`operators/interests.ts`)
- **Weight Key**: `interests`
- **Component Key**: `scoreInterests`
- **Cheap**: Upper bound Jaccard (overestimates for pruning)
- **Score**: Jaccard similarity (intersection / union)

**RatingQualityOperator** (`operators/ratings.ts`)
- **Weight Key**: `ratingQuality`
- **Component Key**: `scoreRatingsQuality`
- **Score**: Average of attractive/smart/funny/interesting ratings
- **Threshold**: Requires `minRatingCount` ratings

**RatingFitOperator** (`operators/ratings.ts`)
- **Weight Key**: `ratingFit`
- **Component Key**: `scoreRatingsFit`
- **Score**: Cosine similarity of centered rating vectors
- **Threshold**: Requires `minRatingCount` ratings

## Adding New Operators

### Step 1: Create Operator File

```typescript
// operators/myNewOperator.ts
import { MatchOperator, MatchContext } from './types.js';

export const MyNewOperator: MatchOperator = {
  key: 'myNew',
  weightKey: 'myNew', // Add to Weights type
  componentKey: 'scoreMyNew', // Add to ScoreRow type
  
  // Optional: fast estimate for pruning
  cheap(ctx: MatchContext): number {
    // Fast calculation
    return 0.8; // Upper bound estimate
  },
  
  // Required: final score
  score(ctx: MatchContext) {
    const value = calculateMyScore(ctx);
    return {
      score: value ?? 0.5, // null → neutral baseline
      meta: { /* optional metadata */ }
    };
  }
};
```

### Step 2: Update Types

```typescript
// operators/types.ts
export interface MatchOperator {
  // ... existing fields
  weightKey: 'quiz' | 'interests' | ... | 'myNew'; // Add here
  componentKey: 'scoreQuiz' | ... | 'scoreMyNew'; // Add here
}
```

### Step 3: Add to Pipeline

```typescript
// matchScoreJob.ts
const scoringOperators: MatchOperator[] = [
  // ... existing operators
  MyNewOperator
];
```

### Step 4: Update Default Weights

```typescript
// matchScoreJob.ts
const DEFAULT_CONFIG: MatchScoreJobConfig = {
  weights: {
    // ... existing weights
    myNew: 0.1
  }
};
```

## Configuration

### Job Configuration

```typescript
type MatchScoreJobConfig = {
  userBatchSize: number;           // Users processed per batch (default: 100)
  candidateBatchSize: number;      // Candidates per batch (default: 500)
  pauseMs: number;                 // Pause between batches (default: 50)
  algorithmVersion: string;         // Version for score swapping (default: 'v1')
  ratingMax: number;                // Max rating value (default: 5)
  newnessHalfLifeDays: number;      // Profile freshness decay (default: 30)
  defaultMaxDistanceKm: number;     // Default distance radius (default: 100)
  weights: {
    quiz: number;                   // Trait/quiz similarity weight
    interests: number;               // Interest overlap weight
    ratingQuality: number;          // Rating quality weight
    ratingFit: number;               // Rating fit weight
    newness: number;                 // Profile freshness weight
    proximity: number;               // Distance proximity weight
  };
};
```

### Recompute Options

```typescript
type RecomputeOptions = {
  topK?: number;                    // Top-K to keep (default: 200)
  minTraitOverlap?: number;         // Min trait overlap (default: 2)
  minRatingCount?: number;          // Min rating count (default: 3)
  // ... plus all config options
};
```

## Performance Considerations

### Batch Processing

- **Candidate Batch Size**: Larger = fewer DB queries, more memory
- **User Batch Size**: Larger = faster overall, but longer per-batch time
- **Pause Between Batches**: Prevents DB overload

### Pruning Efficiency

- Operators with `cheap()` estimates enable early pruning
- Upper bound must **overestimate** (never underestimate)
- Pruning saves expensive calculations (traits, ratings)

### Top-K Heap

- Memory: O(K) where K = topK (default 200)
- Time: O(log K) per insertion
- Maintains global Top-K across all batches

### Versioned Swapping

- Write new scores with new version
- Delete old version only after successful write
- Prevents data loss if job fails mid-execution

## Usage Examples

### Single User Recompute

```typescript
import { recomputeMatchScoresForUser } from './jobs/matchScoreJob.js';

await recomputeMatchScoresForUser(userId, {
  topK: 200,
  weights: {
    quiz: 0.3,
    interests: 0.2,
    // ... etc
  }
});
```

### Batch Job

```typescript
import { runMatchScoreJob } from './jobs/matchScoreJob.js';

await runMatchScoreJob({
  userBatchSize: 100,
  candidateBatchSize: 500,
  algorithmVersion: 'v2'
});
```

### Using Scoring Engine Directly

```typescript
import { scoreCandidate } from './jobs/match-score/engine.js';

const result = scoreCandidate(
  matchContext,
  gateOperators,
  scoringOperators,
  weights,
  heap,
  topK
);

if (result) {
  console.log('Score:', result.score);
  console.log('Components:', result.components);
  console.log('Reasons:', result.reasons);
}
```

## Troubleshooting

### Scores Not Updating

- Check `algorithmVersion` - old scores may still exist
- Verify versioned swap completed (check logs)
- Ensure job completed successfully

### Pruning Too Aggressive

- Increase `topK` value
- Check `cheap()` estimates - may be underestimating
- Verify upper bound calculation

### Missing Scores

- Check gating logic - candidates may be excluded
- Verify data exists (traits, interests, etc.)
- Check minimum thresholds (`minTraitOverlap`, `minRatingCount`)

### Performance Issues

- Reduce `candidateBatchSize` if memory constrained
- Increase `pauseMs` if DB is overloaded
- Check pruning effectiveness (should prune most candidates)

## Mental Model

A simple mental model for understanding the scoring pipeline:

- **Gates answer**: "Is this candidate even allowed?"
  - Hard requirements that must be met (gender, age, distance)
  - Fast, binary decisions (pass/fail)
  
- **Partial scores answer**: "Is this candidate worth spending CPU on?"
  - Fast estimates to avoid expensive calculations
  - Upper bound estimation for pruning
  
- **Scoring answers**: "How good is this match relative to others?"
  - Full calculation using all operators
  - Weighted combination of all signals
  - Produces explainable, comparable scores

This three-stage approach ensures we only perform expensive calculations on candidates that:
1. Meet hard requirements (gating)
2. Have a chance of making Top-K (pruning)
3. Deserve full evaluation (scoring)

## Related Documentation

- [Match Retrieval Process](./match-retrieval-process.md) - How scores are used in recommendations
- [Profile Search Process](./profile-search-process.md) - Search vs scoring
- [Jobs System](./jobs.md) - General job system documentation
