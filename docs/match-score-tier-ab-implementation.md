# Match Score Tier A/B Implementation Plan

## Goal

Convert from **"filter → rank"** to **"rank → segment"**:
- Score everyone who passes hard gates (safety/invariants)
- Classify preference compliance (not exclude)
- Segment results into Tier A (within preferences) and Tier B (outside preferences)
- Both tiers sorted by score

## Critical Architectural Corrections

### ⚠️ 1. Engine Boundary: No Heap Knowledge

**Problem**: `scoreCandidate` currently accepts a `heap` parameter, leaking job orchestration concerns into the engine.

**Fix**: Remove heap from `scoreCandidate`. The engine should:
- Compute score
- Compute compliance (simple object)
- Compute upper bound (optionally)
- Return data

The job should:
- Assign tier (hardcoded logic for now, clearly commented)
- Decide which heap
- Manage pruning against that heap (inline, not extracted)

**Correct Pattern**:
```typescript
const result = scoreCandidate(ctx, operators, weights);
if (!result) continue;

// Hardcoded tier logic (extract to policy later if needed)
const tier = (result.compliance.gender && 
              result.compliance.age && 
              result.compliance.distance) ? 'A' : 'B';
const heap = tier === 'A' ? heapA : heapB;

// Inline pruning (extract to strategy later if needed)
if (heap.size() >= topK && result.upperBound < heap.peek()!.score) {
  continue;
}
heap.push(createScoreRow(result, tier));
```

This keeps `engine.ts` reusable for:
- Explain endpoints
- Ad-hoc search
- Future ranking experiments

### ⚠️ 2. Pruning Must Be Tier-Local

**Critical**: Tier A candidates should never be pruned by Tier B thresholds. Tier B candidates should never displace Tier A.

**Enforcement**: With two heaps, this is naturally enforced only if pruning uses the correct heap:
- Upper bound comparison always uses `heapA.peek()` or `heapB.peek()` appropriately
- Never cross-compare tiers

### ⚠️ 3. Distance Classifier Semantics: Keep Strict

**Correct behavior** (do not soften):
```typescript
if (distanceKm === null) return false;
```

This ensures:
- Missing geo ≠ within preference
- But still scorable via text fallback
- Maintains Tier A integrity

### ⚠️ 4. Store Tier in DB (Not Compliance Map)

**Recommendation**: Store `tier` in database, but NOT the full compliance map.

**Reasons for storing tier**:
- Enables analytics ("what % of matches are Tier B?")
- Enables user-side toggles ("show Tier B")
- Queryability without recomputation

**Reasons for NOT storing compliance map (yet)**:
- Simpler schema
- Can recompute on explain endpoints when needed
- Add later if UX demands it

### ⚠️ 5. Freeze the Engine API (Not Implementation)

**Critical Rule**: The engine API should be stable. The implementation may evolve.

**What this means**:
- `scoreCandidate` signature should not change during tuning
- Internal implementation can be optimized
- All tuning happens in job orchestration (weights, tier logic, limits)
- Engine remains reusable for explain endpoints, ad-hoc search, etc.

**DX Leverage**: Clear separation of concerns between engine (computation) and job (orchestration).

## Architecture Changes

### Current State
```
Hard Gates (DB + in-memory) → Preference Gates (in-memory exclusion) → Scoring
```

### Target State
```
Hard Gates (DB + in-memory) → Scoring → Preference Classification → Tier Assignment → Tier-Aware Heap
```

## ⚠️ Performance Measurement (Do This First)

**Critical**: Measure performance before refactoring. This is the only truly dangerous part.

**Steps**:
1. Pick one user
2. Run one full batch with current implementation
3. Log:
   - Candidates processed
   - Total time
   - Avg time per candidate
   - % pruned before expensive ops

**Thresholds**:
- **<0.25ms per candidate** → Safe to proceed
- **~1ms per candidate** → Tier B topK must be smaller
- **>2ms per candidate** → Need mitigation immediately

**No architecture debate matters until you have these numbers.**

## Implementation Phases

### Phase 1: Core Refactor (Single PR)

**Goal**: Convert from "filter → rank" to "rank → segment" with minimal abstraction

**Changes**:

#### 1.1: Convert Gates to Classifiers

**Goal**: Convert preference gates from exclusions to classifiers

**Changes**:

1. **Add classifier method to MatchOperator interface**
```typescript
// operators/types.ts
export interface MatchOperator {
  // ... existing fields
  
  // Hard exclusion (safety/invariants only)
  gate?(ctx: MatchContext): boolean;
  
  // Preference classification (returns compliance flag)
  classify?(ctx: MatchContext): boolean;
  
  // ... rest
}
```

2. **Update preference gates to support classification**
```typescript
// operators/gates.ts

export const GenderGate: MatchOperator = {
  key: 'gender',
  weightKey: 'quiz',
  componentKey: 'scoreQuiz',
  
  // Keep gate() for backward compatibility (can be removed later)
  gate(ctx: MatchContext): boolean {
    return this.classify!(ctx);
  },
  
  // New: Classification (not exclusion)
  classify(ctx: MatchContext): boolean {
    const { preferredGenders } = ctx.prefs;
    if (!preferredGenders?.length) return true; // No preference = within
    if (!ctx.candidate.gender) return false; // Missing gender = outside
    return preferredGenders.includes(ctx.candidate.gender);
  }
};

export const AgeGate: MatchOperator = {
  key: 'age',
  weightKey: 'quiz',
  componentKey: 'scoreQuiz',
  
  gate(ctx: MatchContext): boolean {
    return this.classify!(ctx);
  },
  
  classify(ctx: MatchContext): boolean {
    const { preferredAgeMin, preferredAgeMax } = ctx.prefs;
    const candidateAge = computeAge(ctx.candidate.birthdate);
    
    // If preferences exist but age is missing, classify as outside
    if ((preferredAgeMin !== null || preferredAgeMax !== null) && candidateAge === null) {
      return false;
    }
    
    // Check bounds
    if (preferredAgeMin !== null && candidateAge !== null && candidateAge < preferredAgeMin) {
      return false;
    }
    if (preferredAgeMax !== null && candidateAge !== null && candidateAge > preferredAgeMax) {
      return false;
    }
    
    return true;
  }
};

export const DistanceGate: MatchOperator = {
  key: 'distance',
  weightKey: 'quiz',
  componentKey: 'scoreQuiz',
  
  gate(ctx: MatchContext): boolean {
    return this.classify!(ctx);
  },
  
  classify(ctx: MatchContext): boolean {
    const { preferredDistanceKm } = ctx.prefs;
    const { distanceKm } = ctx.candidate;
    
    // If no preference, classify as within
    if (preferredDistanceKm === null) return true;
    
    // ⚠️ STRICT: If no distance data, classify as outside
    // This ensures missing geo ≠ within preference
    // Candidate is still scorable via text fallback in scoring
    if (distanceKm === null) return false;
    
    // Classify based on distance
    return distanceKm <= preferredDistanceKm;
  }
};
```

**Important**: Keep distance classifier strict. Missing distance must be classified as "outside" to maintain Tier A integrity. The candidate is still scored (text fallback), but placed in Tier B.

**Testing**:
- Verify classifiers return correct boolean values
- Test edge cases (null values, missing data)
- Ensure backward compatibility with existing gate() calls

---

#### 1.2: Update Engine to Compute Compliance (Simple Type, No Heap)
```typescript
// engine.ts

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

export function scoreCandidate(
  ctx: MatchContext,
  hardGateOperators: MatchOperator[], // Only safety/invariants
  preferenceClassifiers: MatchOperator[], // Gender, Age, Distance
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
  let partialSum = 0;
  let remainingWeights = 0;
  for (const op of scoringOperators) {
    if (op.cheap) {
      const cheap = op.cheap(ctx);
      partialSum += cheap * weights[op.weightKey];
    } else {
      remainingWeights += weights[op.weightKey];
    }
  }
  const upperBound = partialSum + remainingWeights;

  // ===== 4. EXPENSIVE SCORE CALCULATION =====
  // ... existing scoring logic ...

  return {
    score: totalScore,
    components: withComponentDefaults(components),
    reasons,
    compliance, // Simple object, not map
    upperBound
  };
}
```

**Key Changes**:
- `scoreCandidate` no longer accepts `heap` or `topK`. It returns data; the job orchestrates pruning.
- Compliance is a simple type (not a map) - zero cognitive overhead, no string key bugs
- Tier is NOT computed in engine - it's assigned by caller (see next section)

#### 1.3: Update Job with Two Heaps and Hardcoded Tier Logic

**Goal**: Separate heaps for Tier A and Tier B with tier-local pruning

**Changes**:
```typescript
// matchScoreJob.ts

// Replace single heap with two heaps
const topK = options.topK ?? 200;
const heapA = new MinHeap(topK); // Tier A: within preferences
const heapB = new MinHeap(topK); // Tier B: outside preferences

// In candidate loop:
const scoringResult = scoreCandidate(
  matchContext,
  hardGateOperators, // Only safety/invariants
  preferenceClassifiers, // Gender, Age, Distance
  scoringOperators,
  options.weights
  // NO HEAP - engine doesn't know about orchestration
);

if (!scoringResult) {
  continue; // Gated
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

// Push to appropriate heap
if (tier === 'A') {
  heapA.push(createScoreRow(scoringResult, tier));
} else {
  heapB.push(createScoreRow(scoringResult, tier));
}

// After all batches: combine results
const tierA = heapA.toArray(); // Already sorted descending
const tierB = heapB.toArray(); // Already sorted descending
const allScores = [...tierA, ...tierB];
```

**Critical**: 
- Pruning must be tier-local. Tier A candidates are never pruned by Tier B thresholds, and vice versa.
- Tier logic is hardcoded for now (YAGNI). Easy to extract later if needed.
- Pruning is inline (YAGNI). Already designed to be extractable.

**Testing**:
- Verify compliance flags computed correctly
- Verify tier assignment (A vs B)
- Ensure hard gates still exclude properly
- Verify engine no longer depends on heap
- Verify tier-local pruning works correctly

**Alternative: Single Heap with Tier Ordering**
```typescript
// If you prefer single heap:
class TierAwareMinHeap extends MinHeap {
  compare(a: ScoreRow, b: ScoreRow): number {
    // Tier A always outranks Tier B
    if (a.tier !== b.tier) {
      return a.tier === 'A' ? -1 : 1;
    }
    // Within same tier, compare by score
    return a.score - b.score;
  }
}
```

**Recommendation**: Use two heaps (cleaner, more explainable)

**Testing**:
- Verify Tier A candidates in heapA
- Verify Tier B candidates in heapB
- Verify both heaps maintain Top-K independently
- Verify final ordering (A followed by B)
- Verify tier-local pruning (Tier A never pruned by Tier B threshold)
- Verify Tier B never displaces Tier A

---

### Phase 2: Persistence

**Goal**: Store tier in database and recompute all scores

**Changes**:

1. **Add tier field to ScoreRow type**
```typescript
// matchScoreJob.ts
type ScoreRow = {
  // ... existing fields
  tier: 'A' | 'B'; // New field
  // NOTE: compliance intentionally omitted from storage.
  // Recompute on explain endpoints when needed.
  // NOTE: policyVersion intentionally omitted.
  // Add when first policy change ships to prod.
};
```

2. **Update database schema** (store tier only)
```sql
-- Migration: Add tier column to MatchScore table
ALTER TABLE MatchScore ADD COLUMN tier ENUM('A', 'B') DEFAULT 'A';
```

**Rationale**:
- **Store tier**: Enables analytics, user toggles, queryability
- **Don't store compliance map**: Simpler schema, can recompute on explain endpoints
- **Don't store policyVersion yet**: Premature. Add when first policy change ships.

3. **Recompute all scores (versioned swap)**
   - Write new scores with tier
   - Delete old version scores after successful write
   - Same versioned swap pattern as existing code

**Testing**:
- Verify tier stored correctly
- Verify compliance flags stored correctly
- Test queries filtering by tier

---

### Phase 3: Explain Mode

**Goal**: Enable deterministic debugging and PM-friendly outputs

**Changes**:

```typescript
// engine.ts

type ScoreCandidateOptions = {
  explain?: boolean; // Enable explain mode
};

export function scoreCandidate(
  ctx: MatchContext,
  hardGateOperators: MatchOperator[],
  preferenceClassifiers: MatchOperator[],
  scoringOperators: MatchOperator[],
  weights: Weights,
  options: ScoreCandidateOptions = {}
): ScoringResult | null {
  // ... existing logic ...

  // In explain mode, include detailed breakdown
  if (options.explain) {
    reasons.explain = {
      compliance: compliance,
      upperBound: upperBound,
      componentBreakdown: {
        // Detailed breakdown of each component
      },
      classifierResults: {
        // Results from each classifier
      }
    };
  }

  // Always include compliance in reasons (for explain endpoints)
  reasons.compliance = compliance;

  return result;
}
```

**DX Win**:
- Deterministic debugging
- PM-friendly outputs
- Confidence in refactors
- One of the highest ROI DX features

**Testing**:
- Verify explain mode returns full breakdown
- Verify compliance in reasons
- Test "explain match" endpoints

---

## Migration Strategy

### Option A: Big Bang (Recommended for New Feature)

**Approach**: Implement all phases, deploy together

**Pros**:
- Clean break from old behavior
- No intermediate states
- Easier to test

**Cons**:
- Larger change set
- Requires careful testing

**Steps**:
1. Implement all phases in feature branch
2. Test thoroughly
3. Deploy with feature flag
4. Monitor performance and correctness
5. Remove feature flag after validation

### Option B: Gradual Migration

**Approach**: Phase-by-phase rollout

**Pros**:
- Lower risk
- Can validate each phase
- Easier rollback

**Cons**:
- More complex intermediate states
- Longer timeline

**Steps**:
1. Phase 1: Add classifiers (keep gates working)
2. Phase 2: Update engine (compute compliance, don't use yet)
3. Phase 3: Add tier-aware heaps (parallel to existing)
4. Phase 4: Switch to tier-aware logic
5. Phase 5: Remove old gate logic

## Testing Strategy

### Unit Tests

1. **Classifier Tests**
   - Test each preference classifier (Gender, Age, Distance)
   - Test edge cases (null values, missing data)
   - Test boundary conditions

2. **Engine Tests**
   - Test compliance computation
   - Test tier assignment
   - Test hard gates still exclude

3. **Heap Tests**
   - Test two-heap logic
   - Test Top-K maintenance per tier
   - Test final ordering

### Integration Tests

1. **End-to-End Scoring**
   - Score candidates with various preference combinations
   - Verify Tier A/B assignment
   - Verify both tiers populated

2. **Performance Tests**
   - Measure scoring time (should be similar, more candidates scored)
   - Measure heap operations
   - Measure memory usage

### Validation Tests

1. **Correctness**
   - Compare Tier A candidates to old "within preferences" set
   - Verify Tier B candidates are actually outside preferences
   - Verify scores are correct

2. **Coverage**
   - Test with no preferences set
   - Test with partial preferences
   - Test with all preferences set
   - Test edge cases (missing data, null values)

## Performance Considerations

### Impact of Opening Gates

**Before** (with preference gates):
- Load: 10,000 candidates
- Gate: 8,000 excluded
- Score: 2,000 candidates

**After** (without preference gates):
- Load: 10,000 candidates
- Gate: ~100 excluded (only hard gates)
- Score: 9,900 candidates

**Impact**:
- **5x more scoring operations** (2,000 → 9,900)
- **More memory** (larger candidate sets)
- **Longer job runtime** (more candidates to process)

**Reality Check**:
- Top-K heap bounds memory (not unbounded)
- `cheap()` pruning still applies (tier-local)
- Batching remains constant
- Distance, traits, ratings were already computed for most candidates
- This will cost more CPU, but not catastrophically
- Tier B does not need same topK as Tier A, same freshness weighting, or same exposure guarantees

### Mitigation Strategies

1. **Increase Pruning Effectiveness**
   - Ensure `cheap()` estimates are accurate
   - Tune upper bound calculation
   - Consider stricter pruning thresholds

2. **Optimize Scoring**
   - Cache expensive calculations
   - Batch operations where possible
   - Profile and optimize hot paths

3. **Adjust Batch Sizes**
   - Reduce `candidateBatchSize` if memory constrained
   - Increase `pauseMs` if DB overloaded

4. **Consider Tier-Specific Optimization** (Future, Optional)
   - Run separate queries for Tier A (with preference filters) and Tier B (without)
   - This reduces scoring load while maintaining Tier B
   - **Do not pre-optimize now** - implement after this refactor if performance becomes an issue

## Rollback Plan

### If Issues Arise

1. **Feature Flag**: Disable tier-aware logic, revert to gate-based exclusion
2. **Database**: Old scores remain (versioned swap)
3. **Code**: Keep old gate logic as fallback

### Rollback Steps

1. Set feature flag to disable tier logic
2. System reverts to hard exclusion behavior
3. Investigate issues
4. Fix and redeploy

## Success Metrics

### Functional

- ✅ Tier A contains only candidates within preferences
- ✅ Tier B contains only candidates outside preferences
- ✅ Both tiers sorted by score (high → low)
- ✅ Hard gates still exclude properly
- ✅ Scores are correct and explainable

### Performance

- Job runtime increase < 2x (acceptable trade-off)
- Memory usage manageable
- No DB overload

### User Experience

- Tier A shows high-quality matches within preferences
- Tier B shows high-quality matches outside preferences
- Users can discover unexpected but compatible matches

## What You Absolutely Should NOT Cut

These are non-negotiable (architectural principles):

✅ **Engine does not know about heaps**
   - Engine is pure computation
   - Job orchestrates pruning and heap selection

✅ **Strict distance semantics**
   - Missing distance = outside preference (Tier B)
   - Still scorable via text fallback

✅ **Two heaps, not one**
   - Separate heaps for Tier A and Tier B
   - Maintains tier separation

✅ **Tier-local pruning**
   - Tier A never pruned by Tier B threshold
   - Tier B never displaces Tier A

✅ **Tier B exists at all**
   - Core feature: show high-quality matches outside preferences
   - Enables discovery of unexpected but compatible matches

## Implementation Summary

**Three cohesive phases** (not seven):

1. **Phase 1: Core Refactor** (Single PR)
   - Convert gates to classifiers
   - Update engine (remove heap, add compliance)
   - Two heaps with hardcoded tier logic
   - Inline tier-local pruning
   - Test thoroughly

2. **Phase 2: Persistence**
   - Add tier column to database
   - Recompute all scores (versioned swap)
   - Test persistence

3. **Phase 3: Explain Mode**
   - Add explain mode to engine
   - Surface compliance in reasons
   - Test explain endpoints

**Deploy and Monitor**:
- Feature flag deployment
- Monitor performance (use numbers from pre-refactor measurement)
- Validate correctness

## Preference Strictness: Explicit Documentation

**Critical**: Make preference strictness explicit in code and documentation.

**Correct behavior** (do not soften):
```typescript
// DistanceGate.classify()
if (distanceKm === null) return false; // STRICT: missing geo ≠ within preference
```

**Semantics**:
- **Strict classifier** = affects tier only
- **Scoring still proceeds** (text fallback available)
- **No silent "benefit of doubt"**

**Documentation requirement**: Lock this semantics in code comments and docs to prevent future devs from "softening" logic accidentally.

**DX Win**: Fewer regressions, clearer mental model.

## Future Refactoring Path (When Needed)

**Migration path is trivial** - the abstractions are designed to be extractable:

1. **Compliance map**: If you need dynamic preference dimensions, change `Compliance` type to `Record<string, boolean>`. Mechanical refactor.

2. **Policy-driven tier assignment**: Extract hardcoded tier logic to `assignTier(compliance, policy.tiers)`. Already commented for extraction.

3. **Pluggable pruning**: Extract inline pruning to `PruningStrategy` type. Already designed to be extractable.

4. **Policy versioning**: Add `policyVersion` column when first policy change ships. Placeholder comment already in place.

**Key insight**: Don't build abstractions you don't need yet, but design code so extraction is trivial when needed.

## Open Questions

1. **Tier B Size**: How many Tier B candidates to show? (Same topK? Different limit?)
2. **Tier B Presentation**: Show separately? Mixed? User preference?
3. **Performance Budget**: Acceptable job runtime increase?
4. **Migration Timeline**: Big bang or gradual?
5. **Database Schema**: Store tier/compliance or compute on-the-fly? → **RECOMMENDED: Store both**
