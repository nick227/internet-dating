# Match Score Job: Pre-Filtering Strategy

## ⚠️ Important Architectural Note

**This document describes DB-level pre-filtering, but there's a critical architectural decision to make first:**

The current system uses **"filter → then rank"** (preferences exclude candidates before scoring).

The desired system should use **"rank → then segment"** (preferences classify candidates into Tier A/B after scoring).

**If you want Tier B (outside preferences but high compatibility), you CANNOT apply preference-based DB filters naïvely.** See the [Tier A/B Architecture](#tier-ab-architecture) section below.

---

## Current State

### DB-Level Filters (Applied in Query)

Currently, the candidate query applies these filters at the database level:

```typescript
const candidates = await prisma.profile.findMany({
  where: {
    deletedAt: null,              // ✅ DB filter: Not deleted
    isVisible: true,               // ✅ DB filter: Visible profiles
    userId: { not: userId },       // ✅ DB filter: Not self
    user: {
      deletedAt: null,            // ✅ DB filter: User not deleted
      blocksGot: { none: { blockerId: userId } },   // ✅ DB filter: Not blocked by viewer
      blocksMade: { none: { blockedId: userId } }   // ✅ DB filter: Not blocking viewer
    }
  },
  // ... select, orderBy, take
});
```

**Impact**: These filters reduce the candidate set significantly before any scoring occurs.

### In-Memory Filters (Applied After Loading)

Currently, these filters are applied **after** loading candidates, in the scoring engine:

1. **Gender Gate** (`GenderGate` operator)
   - Checks if `candidate.gender` is in `preferredGenders`
   - Applied in-memory after DB query

2. **Age Gate** (`AgeGate` operator)
   - Calculates age from `birthdate`
   - Checks if age is within `preferredAgeMin` / `preferredAgeMax`
   - Applied in-memory after DB query

3. **Distance Gate** (`DistanceGate` operator)
   - Calculates Haversine distance from coordinates
   - Checks if distance <= `preferredDistanceKm`
   - Applied in-memory after DB query

**Problem**: These filters run on **all loaded candidates**, even those that will be excluded. This wastes:
- Memory (loading excluded candidates)
- CPU (calculating distances/ages for excluded candidates)
- Network (transferring excluded candidate data)

## Optimization Opportunity: DB-Level Pre-Filtering

### 1. Gender Filter (Easy Win)

**Current**: In-memory check after loading
**Optimization**: Add to DB `where` clause

```typescript
// If preferredGenders is set, filter at DB level
const whereClause: Prisma.ProfileWhereInput = {
  deletedAt: null,
  isVisible: true,
  userId: { not: userId },
  // ... existing filters
};

if (preferredGenders && preferredGenders.length > 0) {
  whereClause.gender = { in: preferredGenders };
}
```

**Impact**: 
- Reduces candidate set by ~50-70% (assuming 2-3 gender options)
- Zero cost (simple equality check in DB)
- Uses existing `gender` field index

**Caveat**: Must handle `UNSPECIFIED` gender appropriately (may want to include or exclude)

### 2. Age Filter (Moderate Complexity)

**Current**: Calculate age in-memory from `birthdate`
**Optimization**: Calculate age in DB using date functions

**Option A: Prisma Raw Query** (if Prisma doesn't support date math)
```typescript
// Calculate age in DB
const ageMinDate = new Date();
ageMinDate.setFullYear(ageMinDate.getFullYear() - (preferredAgeMax ?? 100));
const ageMaxDate = new Date();
ageMaxDate.setFullYear(ageMaxDate.getFullYear() - (preferredAgeMin ?? 18));

whereClause.birthdate = {
  gte: ageMinDate,  // Born after (younger than max age)
  lte: ageMaxDate   // Born before (older than min age)
};
```

**Option B: Use ProfileSearchIndex** (if available)
- `ProfileSearchIndex.age` is pre-computed
- Can filter directly: `age: { gte: preferredAgeMin, lte: preferredAgeMax }`
- Requires joining with `ProfileSearchIndex` table

**Impact**:
- Reduces candidate set by ~20-40% (depending on age range)
- Avoids loading candidates outside age range
- More efficient than in-memory calculation

**Caveat**: 
- Must handle `null` birthdates (exclude or include based on preference)
- Date math in Prisma may require raw queries

### 3. Distance Filter (Complex - Bounding Box)

**Current**: Calculate Haversine distance in-memory for all candidates
**Optimization**: Use bounding box pre-filter, then Haversine for candidates in box

**Strategy**: Two-stage filtering
1. **Bounding Box** (DB-level): Filter candidates within lat/lng rectangle
2. **Haversine** (in-memory): Calculate exact distance for candidates in box

```typescript
// Calculate bounding box (approximate, but fast)
if (meLat !== null && meLng !== null && preferredDistanceKm !== null) {
  // Rough conversion: 1 degree latitude ≈ 111 km
  // 1 degree longitude ≈ 111 km × cos(latitude)
  const latDelta = preferredDistanceKm / 111;
  const lngDelta = preferredDistanceKm / (111 * Math.cos(toRadians(meLat)));
  
  whereClause.lat = {
    gte: meLat - latDelta,
    lte: meLat + latDelta
  };
  whereClause.lng = {
    gte: meLng - lngDelta,
    lte: meLng + lngDelta
  };
  
  // Also require both coordinates to be present
  whereClause.lat = { ...whereClause.lat, not: null };
  whereClause.lng = { ...whereClause.lng, not: null };
}
```

**Impact**:
- Reduces candidate set by ~80-95% (depending on distance preference)
- Uses existing `@@index([lat, lng])` index
- Still requires Haversine for exact distance (but on much smaller set)

**Caveat**:
- Bounding box is approximate (includes candidates slightly outside radius)
- Must still calculate Haversine for exact filtering
- Text-only locations won't be filtered (by design - fallback allowed)

## Implementation Strategy

### Phase 1: Gender Filter (Low Risk, High Impact)

**Change**: Add gender filter to DB query
**Risk**: Low (simple equality check)
**Impact**: High (reduces candidate set by 50-70%)

```typescript
// In recomputeMatchScoresForUser, before candidate query:
const whereClause: Prisma.ProfileWhereInput = {
  deletedAt: null,
  isVisible: true,
  userId: { not: userId },
  user: {
    deletedAt: null,
    blocksGot: { none: { blockerId: userId } },
    blocksMade: { none: { blockedId: userId } }
  }
};

// Add gender filter if preferences exist
if (preferredGenders && preferredGenders.length > 0) {
  whereClause.gender = { in: preferredGenders };
}

const candidates = await prisma.profile.findMany({
  where: whereClause,
  // ... rest of query
});
```

**Note**: Keep `GenderGate` operator for validation, but it should rarely exclude (defensive check).

### Phase 2: Age Filter (Medium Risk, Medium Impact)

**Change**: Add birthdate range filter to DB query
**Risk**: Medium (date math complexity, null handling)
**Impact**: Medium (reduces candidate set by 20-40%)

```typescript
// Calculate age boundaries
if (preferredAgeMin !== null || preferredAgeMax !== null) {
  const now = new Date();
  const minBirthdate = preferredAgeMax !== null 
    ? new Date(now.getFullYear() - preferredAgeMax - 1, now.getMonth(), now.getDate())
    : null;
  const maxBirthdate = preferredAgeMin !== null
    ? new Date(now.getFullYear() - preferredAgeMin, now.getMonth(), now.getDate())
    : null;
  
  if (minBirthdate || maxBirthdate) {
    whereClause.birthdate = {};
    if (minBirthdate) whereClause.birthdate.gte = minBirthdate;
    if (maxBirthdate) whereClause.birthdate.lte = maxBirthdate;
  }
}
```

**Note**: Decide on null birthdate handling:
- **Option A**: Exclude (strict) - `birthdate: { not: null, ... }`
- **Option B**: Include (lenient) - Don't add birthdate filter if nulls should pass

### Phase 3: Distance Bounding Box (High Risk, High Impact)

**Change**: Add lat/lng bounding box filter to DB query
**Risk**: High (coordinate math, edge cases, text fallback)
**Impact**: High (reduces candidate set by 80-95%)

```typescript
// Add bounding box filter if coordinates available
if (meLat !== null && meLng !== null && preferredDistanceKm !== null) {
  const { toRadians } = require('./match-score/math/geo.js');
  
  // Approximate bounding box (conservative - slightly overestimates)
  const latDelta = preferredDistanceKm / 111; // 1 degree ≈ 111 km
  const lngDelta = preferredDistanceKm / (111 * Math.cos(toRadians(meLat)));
  
  whereClause.lat = {
    gte: meLat - latDelta,
    lte: meLat + latDelta,
    not: null
  };
  whereClause.lng = {
    gte: meLng - lngDelta,
    lte: meLng + lngDelta,
    not: null
  };
}
```

**Note**: 
- Keep `DistanceGate` operator for exact Haversine check (bounding box is approximate)
- Text-only locations will be excluded by this filter (by design - they'll use text-match fallback in scoring)

## Performance Impact

### Current Flow (No Pre-Filtering)

```
DB Query: All visible, non-deleted, non-blocked profiles
  ↓ (e.g., 10,000 candidates)
Load: All candidate data (traits, interests, ratings, etc.)
  ↓ (e.g., 10,000 candidates)
In-Memory Filtering: Gender, Age, Distance gates
  ↓ (e.g., 2,000 candidates pass gates)
Scoring: Full scoring pipeline
  ↓ (e.g., 200 top-K written)
```

**Cost**: Loads 10,000 candidates, filters 8,000 in-memory

### Optimized Flow (With Pre-Filtering)

```
DB Query: Visible + Gender + Age + Distance bounding box
  ↓ (e.g., 1,500 candidates)
Load: Only pre-filtered candidate data
  ↓ (e.g., 1,500 candidates)
In-Memory Validation: Gender, Age, Distance gates (defensive checks)
  ↓ (e.g., 1,400 candidates pass gates)
Scoring: Full scoring pipeline
  ↓ (e.g., 200 top-K written)
```

**Cost**: Loads 1,500 candidates, filters 100 in-memory

**Savings**: 
- **85% reduction** in candidates loaded
- **85% reduction** in data transfer
- **85% reduction** in memory usage
- Faster scoring (smaller candidate set)

## Trade-offs

### Pros of DB-Level Pre-Filtering

1. **Reduced Scan Size**: Database filters before loading
2. **Lower Memory**: Fewer candidates in memory
3. **Faster Queries**: Indexes used for filtering
4. **Less Network**: Less data transferred from DB
5. **Better Batching**: Smaller batches = faster processing

### Cons of DB-Level Pre-Filtering

1. **Complexity**: More complex query building
2. **Null Handling**: Must decide on null value behavior
3. **Edge Cases**: Bounding box approximation, date math edge cases
4. **Maintenance**: More code paths to maintain
5. **Testing**: More scenarios to test

## Recommendation

### Immediate (Phase 1): Gender Filter

**Why**: 
- Simple implementation
- High impact (50-70% reduction)
- Low risk (straightforward equality check)
- Uses existing index

**Implementation**: Add `gender: { in: preferredGenders }` to where clause

### Short-term (Phase 2): Age Filter

**Why**:
- Moderate complexity
- Medium impact (20-40% reduction)
- Uses existing `birthdate` field

**Implementation**: Add birthdate range filter using date math

### Long-term (Phase 3): Distance Bounding Box

**Why**:
- High complexity (coordinate math, edge cases)
- High impact (80-95% reduction)
- Requires careful testing

**Implementation**: Add lat/lng bounding box filter, keep Haversine for exact check

## Implementation Notes

### Keep Operators for Validation

Even with DB-level pre-filtering, keep the gate operators:
- **Defensive**: Catches edge cases, null handling
- **Consistency**: Same logic for all scoring contexts (job, API, etc.)
- **Flexibility**: Can disable DB filters for testing/debugging

### Null Handling Strategy

**Gender**: 
- If `preferredGenders` is null/empty → no filter (include all)
- If `gender` is `UNSPECIFIED` → decide: include or exclude?

**Age**:
- If `preferredAgeMin/Max` is null → no filter (include all)
- If `birthdate` is null → decide: exclude (strict) or include (lenient)?

**Distance**:
- If coordinates missing → no bounding box filter (allow text-match fallback)
- If `preferredDistanceKm` is null → no filter (include all)

### Testing Considerations

1. **Null values**: Test with missing gender, birthdate, coordinates
2. **Edge cases**: Age boundaries (exactly 18, exactly 100, etc.)
3. **Bounding box**: Test near poles, date line, large distances
4. **Performance**: Measure query time before/after
5. **Correctness**: Verify same candidates pass/fail as before

## Tier A/B Architecture

### The Core Issue

**Current System**: "Filter → Then Rank"
- Preferences (gender, age, distance) are **hard exclusions**
- Candidates outside preferences are **never scored**
- Tier B cannot exist

**Desired System**: "Rank → Then Segment"
- Preferences are **strong signals**, not eligibility rules
- All candidates are scored (except safety/invariant exclusions)
- Tier A = within preferences, Tier B = outside preferences
- Both tiers sorted by score

### What Should Exclude (Hard Gates)

These are **true hard gates** and should exclude at DB level + in-memory:

✅ **Safety/Invariant Exclusions**:
- `deletedAt: null` - Not deleted
- `isVisible: true` - Visible profiles
- `userId: { not: userId }` - Not self
- Block relationships - No blocking either direction

These are correct and necessary.

### What Should NOT Exclude (Preference Gates)

These should become **classifiers**, not exclusions:

❌ **Preference-Based** (currently hard gates, should be soft):
- Gender preferences
- Age preferences  
- Distance preferences

**Current Problem**:
```typescript
// Current: Hard exclusion
if (!gate.gate(ctx)) {
  return null; // Candidate is gone forever
}
```

**Desired Behavior**:
```typescript
// Desired: Classification
const preferenceFlags = {
  withinGender: GenderGate.classify(ctx),
  withinAge: AgeGate.classify(ctx),
  withinDistance: DistanceGate.classify(ctx)
};

const tier = (preferenceFlags.withinGender && 
              preferenceFlags.withinAge && 
              preferenceFlags.withinDistance) 
  ? 'A' : 'B';
```

### Implementation Strategy

#### Step 1: Score Everyone (Except Hard Gates)

Remove preference-based exclusions from gating:
- Keep hard gates: deleted, invisible, blocked, self
- Remove from gates: GenderGate, AgeGate, DistanceGate

#### Step 2: Compute Preference Compliance

Convert gates to classifiers:
```typescript
type PreferenceCompliance = {
  withinGender: boolean;
  withinAge: boolean;
  withinDistance: boolean;
};

function computePreferenceCompliance(ctx: MatchContext): PreferenceCompliance {
  return {
    withinGender: GenderGate.classify(ctx),
    withinAge: AgeGate.classify(ctx),
    withinDistance: DistanceGate.classify(ctx)
  };
}
```

#### Step 3: Tier Assignment

```typescript
const compliance = computePreferenceCompliance(ctx);
const tier = (compliance.withinGender && 
              compliance.withinAge && 
              compliance.withinDistance) 
  ? 'A' : 'B';
```

#### Step 4: Tier-Aware Heap Logic

**Option A: Single Heap with Tier Ordering**
```typescript
// Heap ordered by (tier, score)
// Tier A always outranks Tier B
// Tier B still sorted by score
heap.push({ tier, score, ... });
```

**Option B: Two Separate Heaps (Recommended)**
```typescript
const heapA = new MinHeap(topK); // Tier A: within preferences
const heapB = new MinHeap(topK); // Tier B: outside preferences

if (tier === 'A') {
  heapA.push(scoreRow);
} else {
  heapB.push(scoreRow);
}

// Final result: A followed by B
const results = [...heapA.toArray(), ...heapB.toArray()];
```

### DB Pre-Filtering and Tier B

**Critical**: If you apply preference-based DB filters, Tier B candidates are **permanently removed** before scoring.

**Safe DB Filters** (for Tier A/B architecture):
- ✅ `deletedAt: null`
- ✅ `isVisible: true`
- ✅ `userId: { not: userId }`
- ✅ Block relationships

**Unsafe DB Filters** (breaks Tier B):
- ❌ `gender: { in: preferredGenders }` - Removes Tier B candidates
- ❌ `birthdate: { gte: minDate, lte: maxDate }` - Removes Tier B candidates
- ❌ Distance bounding box - Removes Tier B candidates

**If you want Tier B, you CANNOT apply preference-based DB filters.**

**Alternative**: If you later want DB-level optimization for Tier A:
- Run **two queries**: Tier A query (with preference filters) + Tier B query (without preference filters)
- This is a separate optimization phase, not a simple filter addition

### Distance: Special Case

Distance calculation is expensive, but it should still be computed for everyone:

**Do**:
- Compute distance for all candidates (after hard gates)
- Use distance as a score component
- Use distance as a preference compliance flag
- Do NOT gate on distance

**If you add bounding box later**:
- Must be **wide** (not preference-tight) to include Tier B candidates
- Or only applied to Tier A query (separate query)

### Why This Matters

Your engine already supports this philosophically:
- ✅ Neutral baselines (missing data ≠ bad data)
- ✅ Multi-signal scoring (many factors contribute)
- ✅ Explainable components (reasons for scores)

The only blocker is: **preference gates behaving like bouncers instead of labels**.

**User Benefit**: Users can discover great matches that don't match their stated preferences but have high compatibility on other dimensions.

## Current Implementation Status

**Status**: ❌ **Not Implemented**

**Architectural Decision Required**:
1. Do you want Tier B (outside preferences but high compatibility)?
   - **Yes** → Do NOT apply preference-based DB filters
   - **No** → Can apply preference-based DB filters for performance

**If Tier B is desired**:
1. Convert preference gates to classifiers (not exclusions)
2. Implement tier-aware heap logic
3. Score everyone (except hard gates)
4. Segment results into Tier A/B

**If Tier B is NOT desired**:
1. Keep current hard exclusion behavior
2. Implement Phase 1 (Gender filter) - low risk, high impact
3. Measure performance improvement
4. Implement Phase 2 (Age filter) if Phase 1 shows value
5. Consider Phase 3 (Distance bounding box) based on data volume
