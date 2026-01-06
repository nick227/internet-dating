# Quiz Results API & Job Design

## Required Calculations (Per Question, Per Option)

For every question → option, we must be able to answer:

**"What percentage of group X selected this option?"**

### Required Groups

**Minimum set:**
- Site-wide (all users)
- By gender (MALE, FEMALE, NONBINARY, OTHER, UNSPECIFIED)
- By age group (18-24, 25-34, 35-44, 45-54, 55+)
- By city (top N cities by user count)

**Derived per user at request time:**
- Opposite gender (MALE↔FEMALE mapping)
- User's specific age group
- User's city
- One deterministic "other city" (for comparison)

### Calculation Units (Critical Separation)

**We are NOT calculating per user.**

**We are calculating:**
```
(questionId, optionValue, demographic_dimension, demographic_bucket) → count
```

**Percentages are derived as:**
```
count(option) / totalResponses(demographic_slice) * 100
```

This separation is critical. Aggregates are **shared** and **cacheable**, reused across every user.

## Canonical Aggregate Shape

At minimum, the system must be able to produce:

```
Quiz
└── Question
    └── Option
        └── Aggregates
            ├── site: ALL → count
            ├── gender: MALE → count, FEMALE → count, ...
            ├── age: 18-24 → count, 25-34 → count, ...
            └── city: NYC → count, LA → count, ...
```

These aggregates are **shared by all users**. They never change based on who is requesting.

## What Is User-Specific?

**Only selection + filtering, never aggregation.**

At request time, for a given user:
1. Pick the option they chose (from `QuizResult.answers`)
2. Pull precomputed aggregates for:
   - their gender
   - opposite gender (derived)
   - their age group
   - their city
   - chosen "other city" (selection logic)
3. Convert counts → percentages (divide by totals)
4. Format response

**No heavy math at request time.** Just lookups and simple division.

## Job Design

### What the Job Does

The job computes **atomic facts only**. It:

- ✅ Never knows about users
- ✅ Never computes percentages
- ✅ Never cares about "opposite gender" or "other city"
- ✅ Only produces: `(quizId, questionId, optionValue, dimension, bucket) → count`

### Job Output Schema

```prisma
model QuizAnswerStats {
  id          BigInt   @id @default(autoincrement())
  quizId      BigInt
  questionId  BigInt
  optionValue String
  dimension   String   // 'site' | 'gender' | 'age' | 'city'
  bucket      String   // 'ALL', 'MALE', '25-34', 'NYC', etc.
  count       Int      // Number of users in this bucket who chose this option
  total       Int      // Total users in this bucket who answered this question (any option)
  updatedAt   DateTime @updatedAt
  
  @@unique([quizId, questionId, optionValue, dimension, bucket])
  @@index([quizId, questionId, optionValue, dimension])
  @@index([dimension, bucket])
}
```

**Critical: `total` column semantics:**
- `count` = number of users in this bucket who chose this option
- `total` = total users in this bucket who answered this question (any option)
- **`total` must be the same for all options within `(quizId, questionId, dimension, bucket)`**
- Computed once per `(quizId, questionId, dimension, bucket)`, reused across all options
- This avoids subtle math bugs when calculating percentages

**Why this schema:**
- One dimension per row (simplifies queries)
- Avoids sparse unique keys (no nullable columns)
- Makes adding dimensions trivial later
- Clear separation of concerns

### Job Logic

For each `(quizId, questionId, optionValue)`:

1. **Site-wide aggregate:**
   - Count all `QuizResult` where `answers[questionId] = optionValue`
   - Store: `(dimension='site', bucket='ALL')`

2. **Gender aggregates:**
   - Join `QuizResult` → `Profile` → `Profile.gender`
   - Group by gender, count per option
   - Store: `(dimension='gender', bucket='MALE')`, `(dimension='gender', bucket='FEMALE')`, etc.

3. **Age aggregates:**
   - Join `QuizResult` → `ProfileSearchIndex` → `ageBucket`
   - Group by ageBucket, count per option
   - Store: `(dimension='age', bucket='25-34')`, etc.

4. **City aggregates:**
   - Join `QuizResult` → `ProfileSearchIndex` → `locationCity`
   - **Freeze top N cities set** (e.g., top 20 by total user count across all quizzes)
   - Decision point: **At job start, per job run** (not per quiz)
   - Once chosen, the set of cities must be **stable until the next full rebuild**
   - Group by city, count per option
   - Store: `(dimension='city', bucket='NYC')`, etc.
   - **Why stability matters**: "Other city" comparisons must feel consistent over time

### Job Execution

- **Trigger**: 
  - **Incremental**: On `QuizResult` insert → enqueue `(quizId, questionId, optionValue)` for affected rows
  - **Full refresh**: Periodic (e.g., daily) or on-demand
- **Scope**: Process all active quizzes or specific `quizId`
- **Incremental updates**: Only recalculate affected `(questionId, optionValue)` pairs
  - Updates only the specific `(quizId, questionId, optionValue, dimension, bucket)` rows that changed
  - Keeps the job cheap and real-time-feeling without lying about freshness
- **Totals**: Compute `total` once per `(quizId, questionId, dimension, bucket)`, store same value for all options

## API Design

### Endpoint

```
GET /api/quizzes/:quizId/results
```

### What the API Does at Request Time

1. **Read user's selection:**
   - Fetch `QuizResult` for current user + quizId
   - Extract `answers` JSON to get `questionId → optionValue` mapping

2. **Look up 6 precomputed counts** (per question):
   - Site: `(quizId, questionId, optionValue, 'site', 'ALL')`
   - User's gender: `(quizId, questionId, optionValue, 'gender', userGender)`
   - Opposite gender: `(quizId, questionId, optionValue, 'gender', oppositeGender)`
   - User's age group: `(quizId, questionId, optionValue, 'age', userAgeBucket)`
   - User's city: `(quizId, questionId, optionValue, 'city', userCity)`
   - Other city: `(quizId, questionId, optionValue, 'city', otherCity)` (deterministic selection)

3. **Calculate percentages:**
   - For each count: `percentage = (count / total) * 100`
   - Use `total` from `QuizAnswerStats` for the demographic slice

4. **Format response:**
   - Combine with `QuizOption` data (label, traitValues)
   - Return structured response

### API Response Structure

```typescript
{
  quiz: {
    id: string
    title: string
  }
  userDemo: {
    gender: 'MALE' | 'FEMALE' | 'NONBINARY' | 'OTHER' | 'UNSPECIFIED'
    age: number
    city: string | null
  }
  questions: Array<{
    questionId: string
    questionPrompt: string
    userSelectedAnswer: {
      optionId: string
      optionLabel: string
      traitValues: Record<string, number>
      percentages: {
        siteAverage: number
        userGender: number
        oppositeGender: number
        userAgeGroup: number
        userCity: number
        otherCity: number
      }
    }
  }>
}
```

## Why This Approach Wins

### If Calculated Naïvely Per Request:
- **N users × M questions × K demographics** = explodes under traffic
- Impossible to cache effectively
- Heavy database load on every request

### If Aggregated Once (Job-Based):
- **Cost scales with quiz changes, not users**
- Request-time work is trivial (lookups + division)
- Highly cacheable (aggregates rarely change)
- Predictable performance

### Key Insight

**Selections are user-specific. Aggregates are not.**

You never need to precompute responses per user — only:
```
(quizId, questionId, optionValue, demographic_slice) → count
```

That data is:
- ✅ Shared
- ✅ Cacheable
- ✅ Reused across every user

## Implementation Notes

### Data Sources

- `QuizResult.answers`: JSON mapping `questionId → optionValue`
- `Profile.gender`: For gender aggregates
- `ProfileSearchIndex.ageBucket`: For age aggregates (precomputed)
- `ProfileSearchIndex.locationCity`: For city aggregates (normalized)
- `QuizOption.traitValues`: For trait map display

### Derived Values

- **Opposite gender**: Map MALE↔FEMALE, others map to UNSPECIFIED
- **Other city**: **Deterministic rule** (never random, never session-based):
  ```
  otherCity = highest-user-count city where city != userCity
  ```
  - Always reproducible for the same user
  - Never random per request
  - Never session-based randomness
  - This matters for user trust and consistency
- **Age group**: Use `ProfileSearchIndex.ageBucket` (0=18-24, 1=25-34, 2=35-44, etc.)

### Job Optimization

- **Incremental updates**: Only recalculate when new `QuizResult` added
- **Batch processing**: Process multiple quizzes in parallel
- **City filtering**: Only store top N cities (e.g., top 20) to limit table size
- **Index strategy**: Index on `(quizId, questionId, optionValue, dimension)` for fast lookups

### API Optimization

- **Single query**: Fetch all needed `QuizAnswerStats` rows in **one query**:
  ```sql
  WHERE quizId = ?
    AND questionId IN (...)
    AND optionValue IN (...)
    AND dimension IN ('site', 'gender', 'age', 'city')
  ```
  - Not one query per question
  - Fetch all questions' data in parallel
- **Caching**: Cache aggregates per quiz (invalidate on job run)
- **Lazy loading**: "Other city" can be optional or loaded separately
