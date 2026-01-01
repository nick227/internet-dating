# Match Analysis — Complete Variable Reference

## Overview

This document captures all variables, calculations, and logic used in the match scoring system. The system generates compatibility scores between users using multiple signals combined with weighted scoring.

---

## Match Scoring Flow

```
1. Pre-Filtering (Gating)
   ↓
2. Calculate Component Scores
   ↓
3. Weighted Combination
   ↓
4. Store MatchScore
```

---

## Pre-Filtering (Gating)

Before calculating scores, candidates are filtered based on user preferences and constraints:

### 1. Gender Preference

**Source:** `UserPreference.preferredGenders` (array of strings)

**Logic:**
```typescript
if (preferredGenders?.length) {
  if (!candidate.gender || !preferredGenders.includes(candidate.gender)) {
    continue; // Skip candidate
  }
}
```

**Behavior:**
- If user has gender preferences set, candidate must match
- If no preferences set, all genders pass
- Missing candidate gender fails if preferences exist

### 2. Age Preference

**Source:** `UserPreference.preferredAgeMin`, `UserPreference.preferredAgeMax`

**Calculation:**
```typescript
const candidateAge = computeAge(candidate.birthdate);
```

**Logic:**
- If `preferredAgeMin` set: candidate age must be ≥ min
- If `preferredAgeMax` set: candidate age must be ≤ max
- If candidate age is null and preferences exist → skip
- If no preferences set → all ages pass

### 3. Distance Preference

**Source:** `UserPreference.preferredDistanceKm`

**Calculation:**
```typescript
const distanceKm = haversineKm(meLat, meLng, candidateLat, candidateLng);
```

**Haversine Formula:**
- Earth radius: 6371 km
- Calculates great-circle distance between two lat/lng points
- Returns distance in kilometers

**Logic:**
- If `preferredDistanceKm` set: candidate must be within radius
- If distance cannot be calculated (missing lat/lng) → skip if preference exists
- If no preference set → all distances pass

**Note:** Distance is also used in scoring (see Proximity Score below)

### 4. Blocking

**Source:** `UserBlock` table

**Logic:**
- Candidates blocked by user (`blocksGot`) → excluded
- Candidates who blocked user (`blocksMade`) → excluded
- Applied at database query level

### 5. Visibility & Deletion

**Source:** `Profile.isVisible`, `Profile.deletedAt`, `User.deletedAt`

**Logic:**
- `isVisible = false` → excluded
- `deletedAt` set on profile or user → excluded
- Applied at database query level

---

## Component Scores

After passing filters, each candidate gets component scores calculated:

### 1. Trait Similarity Score (`scoreQuiz`)

**Primary Method:** Trait-based cosine similarity with confidence and coverage

**Data Sources:**
- `UserTrait` table (user and candidate)
- Fields: `traitKey`, `value`, `n` (contribution count)

**Algorithm:**

**Step 1: Find Common Traits**
```typescript
// Only traits present in both users
const commonTraits = intersection(userTraits, candidateTraits);
```

**Step 2: Calculate Confidence-Weighted Values**
```typescript
const CONFIDENCE_NORM = 5;
const confidence = clamp(n / CONFIDENCE_NORM, 0, 1);
const effectiveValue = value * confidence; // Shrinkage toward 0 when n is small
```

**Step 3: Build Aligned Vectors**
```typescript
const userVec = commonTraits.map(t => t.userEffectiveValue);
const candidateVec = commonTraits.map(t => t.candidateEffectiveValue);
```

**Step 4: Calculate Cosine Similarity**
```typescript
cosine = (A · B) / (||A|| × ||B||)  // Returns [-1, 1]
```

**Step 5: Normalize Cosine to [0, 1]**
```typescript
normalized = (cosine + 1) / 2;  // maps [-1,1] → [0,1]
```

**Step 6: Apply Coverage Penalty**
```typescript
coverage = commonCount / min(userTraitCount, candidateTraitCount);
finalScore = normalized * coverage;
```

**Coverage Formula (Locked):**
- **MUST use `min`, not `max`**
- Penalizes under-specified profiles (correct)
- Does NOT punish expressive users
- If any implementation uses `max`, it will bias results

**Result:**
- Returns `{ value: number | null, coverage: number, commonCount: number }`
- `null` = no comparable data (no common traits)
- `0` = valid result (orthogonal/different vectors)
- `0..1` = similarity score (higher = more similar)
- **Always in [0, 1] range** (cosine normalized, never negative)
- **Always in [0, 1] range** (cosine normalized, never negative)

**Fallback: Legacy Quiz Similarity**

If trait similarity returns `null` (no comparable data):
```typescript
if (traitSimResult === null || traitSimResult.value === null) {
  // Use legacy quiz answer similarity
  quizSim = quizSimilarity(userQuiz, candidateQuiz);
  finalQuizScore = quizSim;
}
```

**Legacy Quiz Similarity:**
- Compares raw quiz answers
- Uses `answersSimilarity()` function
- Only used when traits unavailable

**Weight:** `0.25` (25% of total score)

**Semantics:** Relevance gate — determines fundamental compatibility

---

### 2. Interest Similarity Score (`scoreInterests`)

**Method:** Jaccard similarity (overlap ratio)

**Data Sources:**
- `UserInterest` table (user and candidate)
- Fields: `subjectId`, `interestId`

**Algorithm:**
```typescript
// Build sets of interest keys
userKeys = Set(`${subjectId}:${interestId}`)
candidateKeys = Set(`${subjectId}:${interestId}`)

// Calculate intersection and union
intersection = |userKeys ∩ candidateKeys|
union = |userKeys ∪ candidateKeys|

// Jaccard similarity
interestSim = intersection / union
```

**Result:**
- `0` = no overlap
- `1` = identical interests
- `0..1` = overlap ratio

**Key Points:**
- Interests are categorical (binary: have it or don't)
- Not magnitude-based (unlike traits)
- Uses set overlap, not cosine similarity

**Weight:** `0.20` (20% of total score)

**Semantics:** Secondary relevance signal — shared interests indicate compatibility

---

### 3. Rating Quality Score (`scoreRatingsQuality`)

**Method:** Average of all rating dimensions

**Data Sources:**
- `ProfileRating` table (aggregated by `targetProfileId`)
- Dimensions: `attractive`, `smart`, `funny`, `interesting`

**Calculation:**
```typescript
// Average all rating dimensions
ratingQualityRaw = (
  attractive + smart + funny + interesting
) / 4

// Normalize to 0..1
ratingQuality = ratingQualityRaw / ratingMax
// ratingMax = 5 (default)
```

**Result:**
- `0` = no ratings or all zeros
- `1` = all ratings at maximum
- `0..1` = normalized average quality

**Weight:** `0.15` (15% of total score)

**Semantics:** Quality signal — community feedback on candidate's appeal

---

### 4. Rating Fit Score (`scoreRatingsFit`)

**Method:** Cosine similarity of rating vectors

**Data Sources:**
- `ProfileRating` (user's ratings given)
- `ProfileRating` (candidate's ratings received)

**Calculation:**

**Step 1: Build Rating Vectors**
```typescript
userVector = [attractive, smart, funny, interesting]
candidateVector = [attractive, smart, funny, interesting]
```

**Step 2: Center Vectors**
```typescript
// Subtract mean from each dimension
centeredVector = vector.map(v => v - mean(vector))
```

**Step 3: Cosine Similarity**
```typescript
ratingFit = cosineSimilarity(userCenteredVector, candidateCenteredVector)
```

**Result:**
- `-1` to `1` (typically clamped to `0..1`)
- Higher = user's rating style matches candidate's received ratings
- Measures compatibility of rating preferences

**Weight:** `0.10` (10% of total score)

**Semantics:** Fit signal — compatibility of rating styles/preferences

---

### 5. Newness Score (`scoreNew`)

**Method:** Exponential decay based on profile update time

**Data Sources:**
- `Profile.updatedAt` (or `createdAt` if `updatedAt` is null)

**Calculation:**
```typescript
const newnessHalfLifeDays = 30; // Default
const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
const scoreNew = Math.exp(-ageDays * Math.LN2 / newnessHalfLifeDays);
```

**Formula:**
```
scoreNew = e^(-ageDays × ln(2) / halfLifeDays)
```

**Result:**
- `1` = just updated (age = 0 days)
- `0.5` = half-life reached (age = 30 days)
- `0` = very old (approaches 0 as age → ∞)

**Weight:** `0.10` (10% of total score)

**Semantics:** Tie-breaker — favors recent activity

---

### 6. Proximity Score (`scoreNearby`)

**Method:** Linear distance decay within radius

**Data Sources:**
- `Profile.lat`, `Profile.lng` (user and candidate)
- `UserPreference.preferredDistanceKm` (or `defaultMaxDistanceKm`)

**Calculation:**
```typescript
const distanceKm = haversineKm(userLat, userLng, candidateLat, candidateLng);
const radius = preferredDistanceKm ?? defaultMaxDistanceKm; // Default: 100km
scoreNearby = clamp(1 - distanceKm / radius);
```

**Fallback (Text Match):**
```typescript
if (distanceKm === null && 
    userLocationText === candidateLocationText && 
    both are non-null) {
  scoreNearby = 0.25; // Fixed bonus for text match
}
```

**Result:**
- `1` = same location (distance = 0)
- `0` = at or beyond radius
- `0..1` = linear decay within radius
- `0.25` = text match (if lat/lng unavailable)

**Weight:** `0.20` (20% of total score)

**Semantics:** Ranking signal — breaks ties among compatible users

---

## Final Score Calculation

### Weighted Sum

```typescript
finalScore =
  scoreQuiz * 0.25 +           // Trait/quiz similarity
  scoreInterests * 0.20 +      // Interest overlap
  scoreRatingsQuality * 0.15 +  // Average rating quality
  scoreRatingsFit * 0.10 +     // Rating style fit
  scoreNew * 0.10 +            // Recency
  scoreNearby * 0.20;          // Proximity
```

### Weight Semantics

**Relevance Signals (45%):**
- `quiz` (25%): Fundamental compatibility (traits/personality)
- `interests` (20%): Shared interests

**Quality Signals (25%):**
- `ratingQuality` (15%): Community feedback
- `ratingFit` (10%): Rating style compatibility

**Ranking Signals (30%):**
- `proximity` (20%): Geographic proximity
- `newness` (10%): Recent activity

**Note:** Weights are tuning knobs, not truth. They should be calibrated against outcomes (matches → conversations → retention).

---

## Data Storage

### MatchScore Table

Each calculated match is stored with:

```typescript
{
  userId: bigint,                    // User who is being matched
  candidateUserId: bigint,           // Candidate being scored
  score: number,                     // Final weighted score
  scoreQuiz: number,                 // Trait/quiz similarity
  scoreInterests: number,            // Interest overlap
  scoreRatingsQuality: number,      // Average rating quality
  scoreRatingsFit: number,           // Rating style fit
  scoreNew: number,                  // Recency score
  scoreNearby: number,               // Proximity score
  ratingAttractive: number | null,   // Candidate's attractive rating
  ratingSmart: number | null,        // Candidate's smart rating
  ratingFunny: number | null,        // Candidate's funny rating
  ratingInteresting: number | null,   // Candidate's interesting rating
  distanceKm: number | null,          // Geographic distance
  reasons: Record<string, unknown>,  // Debugging/explanation data
  scoredAt: Date,                    // When score was calculated
  algorithmVersion: string           // Algorithm version used
}
```

### Reasons Object

Stored for debugging and analysis:

```typescript
{
  scores: {
    quizSim: number,              // Final quiz/trait score used
    traitSim: number | null,       // Trait similarity (if used)
    traitCoverage: number,         // Coverage penalty applied
    traitCommonCount: number,      // Number of common traits
    quizSimLegacy: number | undefined, // Legacy quiz sim (if used)
    interestOverlap: number,      // Interest Jaccard score
    ratingQuality: number,         // Average rating quality
    ratingFit: number,             // Rating style fit
    newness: number,               // Recency score
    proximity: number              // Proximity score
  },
  interests: {
    matches: string[],             // Matching interest labels (top 5)
    intersection: number,          // Number of shared interests
    userCount: number,             // User's total interests
    candidateCount: number         // Candidate's total interests
  },
  distanceKm?: number,              // Geographic distance (if available)
  ratings?: {                       // Individual rating dimensions
    attractive: number | null,
    smart: number | null,
    funny: number | null,
    interesting: number | null
  }
}
```

---

## Configuration

### Default Configuration

```typescript
{
  userBatchSize: 100,              // Users processed per batch
  candidateBatchSize: 500,          // Candidates loaded per batch
  pauseMs: 50,                      // Pause between batches (ms)
  algorithmVersion: 'v1',           // Algorithm version
  ratingMax: 5,                     // Maximum rating value
  newnessHalfLifeDays: 30,          // Half-life for recency decay
  defaultMaxDistanceKm: 100,        // Default distance radius
  weights: {
    quiz: 0.25,
    interests: 0.20,
    ratingQuality: 0.15,
    ratingFit: 0.10,
    newness: 0.10,
    proximity: 0.20
  }
}
```

### Override Options

All configuration values can be overridden:
- Via environment variables
- Via job parameters
- Via `RecomputeOptions` when calling `recomputeMatchScoresForUser()`

---

## Performance Considerations

### Batch Processing

**User Batching:**
- Processes users in batches of `userBatchSize` (default: 100)
- Pauses `pauseMs` (default: 50ms) between batches

**Candidate Batching:**
- Loads candidates in batches of `candidateBatchSize` (default: 500)
- Processes all candidates for a user before moving to next user

### Data Loading Strategy

**Batch-Loaded Data:**
- Candidate traits: Single query for all candidates in batch
- Candidate interests: Single query for all candidates in batch
- Candidate ratings: Single query (groupBy) for all candidates in batch
- Candidate quizzes: Single query for all candidates in batch

**Per-User Data:**
- User traits: Loaded once per user
- User interests: Loaded once per user
- User preferences: Loaded once per user
- User quiz: Loaded once per user

**Optimization:**
- Uses Map-based lookups (O(1) per candidate)
- Intersection-only processing (only common traits/interests)
- Early exits when no data available

---

## Edge Cases & Defaults

### Missing Data Handling

**Traits:**
- No traits → falls back to legacy quiz similarity
- No common traits → `traitSim = null` → falls back to quiz
- Zero similarity → valid result (not null), no fallback

**Interests:**
- No interests → `scoreInterests = 0`
- No overlap → `scoreInterests = 0`

**Ratings:**
- No ratings → `scoreRatingsQuality = 0`, `scoreRatingsFit = 0`
- Missing dimensions → excluded from average

**Distance:**
- No lat/lng → `distanceKm = null`, `scoreNearby = 0` (unless text match)
- Text match fallback → `scoreNearby = 0.25`

**Newness:**
- No `updatedAt` → uses `createdAt`
- No dates → `scoreNew = 0`

### Zero vs Null

**Important Distinction:**
- `null` = no data available (should fallback or use default)
- `0` = valid result (no similarity, no overlap, etc.)

**Examples:**
- `traitSim = null` → no comparable data → fallback to quiz
- `traitSim = 0` → orthogonal vectors → valid result, use 0
- `interestOverlap = 0` → no shared interests → valid result

---

## Algorithm Versioning

**Purpose:** Track which algorithm version was used for each match score

**Usage:**
- Stored in `MatchScore.algorithmVersion`
- Allows comparison of different algorithm versions
- Enables A/B testing and gradual rollouts

**Current Version:** `v1`

---

## Summary

The match scoring system combines six component scores using weighted summation:

1. **Trait Similarity** (25%): Cosine similarity on confidence-weighted trait vectors with coverage penalty
2. **Interest Overlap** (20%): Jaccard similarity of categorical interests
3. **Rating Quality** (15%): Average of all rating dimensions
4. **Rating Fit** (10%): Cosine similarity of rating style vectors
5. **Newness** (10%): Exponential decay based on profile update time
6. **Proximity** (20%): Linear distance decay within radius

**Pre-filtering** ensures only compatible candidates (gender, age, distance, blocks) are scored.

**Final score** ranges from 0 to 1 (theoretical max, though weights sum to 1.0, actual max depends on component score ranges).

**Storage** includes all component scores and debugging information for analysis and tuning.
