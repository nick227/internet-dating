# Jobs System (Current + Proposed)

## Current Jobs (in repo)
### Match Scoring Job
- Script: `backend/scripts/jobs/runners/recomputeMatchScores.ts`
- Purpose: Precompute suggestion scores and reasons for each user.
- Signals: quiz similarity, interest overlap, rating quality, rating fit, newness, proximity.
- Output: `MatchScore` rows for `(userId, candidateUserId)`.

### Match Score Test Runner
- Script: `backend/scripts/testMatchScores.ts`
- Purpose: Dev-only validation of match scoring output.
- Output: Top suggestions + subscores for a given user.

## Why Jobs Are Required
Scoring is multi-signal, expensive, and must be fully precomputed for the API.
Jobs let us:
- Keep `/api/suggestions` fast and deterministic.
- Avoid recomputing quiz/interest/rating data on each request.
- Add new signals without changing API response times.

## Recommended Job Split (Soon)
To scale, split the pipeline into smaller jobs that each owns one “truth”:

1) **Quiz Embeddings Job**
   - Owns: `UserQuizVector(userId, vector, updatedAt)`.
   - Triggers: quiz submission + nightly backfill.
   - Notes: vector must be normalized and fixed-dimension. No matching logic here.

2) **Interest Vector Job**
   - Owns: `UserInterestIndex(userId, subjectId, interestId, weight?)`.
   - Optional: `UserInterestVector(userId, vector)`.
   - Triggers: interest add/remove + nightly backfill.
   - Notes: keep subjects + interests normalized. Matching only sees overlap summaries or vectors.

3) **Ratings Aggregate Job**
   - Owns: `ProfileRatingAggregate(profileId, averages, counts)`.
   - Owns: `UserRatingPreference(userId, preferenceVector)`.
   - Triggers: new rating + nightly backfill.

4) **Match Score Job**
   - Owns: `MatchScore(userId, candidateUserId, score, reasons, computedAt)`.
   - Consumes: quiz vectors, interest overlap/vectors, rating aggregates, user preferences.
   - Hard filters (age/gender/distance) apply here only.
   - Runs nightly; can also run incrementally for a single user.

## Triggers vs Batch
### Event-driven (fast refresh)
- Quiz submission → recompute quiz embedding + match scores for that user.
- Interest update → recompute interest vector + match scores.
- New rating → update aggregates + match scores for affected users.

### Daily batch (baseline)
- Recompute all match scores overnight.
- Backfills for users with stale or missing scores.

## Keep Jobs Separate (Recommended)
Yes — separate jobs are safer and easier to reason about:
- Each job is smaller, testable, and has clear ownership.
- Failures are isolated (ratings job failure doesn’t block quiz updates).
- Enables partial recomputation when only one signal changes.

## Guardrails
- **Hard filters happen in the match score job only.**
- Jobs must write precomputed data; API should read only.
- Keep job outputs idempotent; re-running should not create duplicates.
- MatchScore must not recompute raw quiz/interest data.
- Each job owns one table or column set; no overlapping writes.

## Suggested Scheduling
- Quiz / interest / ratings jobs: event-driven + nightly batch.
- Match score job: nightly batch + on-demand per user.

## Recompute Strategy (Bounded Fan-Out)
### Event-driven (bounded)
When user `U` changes:
- Recompute `U → candidates`.
- Optionally recompute `candidates → U` if symmetry matters.
- Cap recompute breadth (max N candidates).
- Defer full recompute to nightly job.

### Nightly batch (authoritative)
- Recompute all active users.
- Fix drift and backfill missing rows.

## API Impact
### `/api/matches`
- Still driven only by mutual `LIKE`.
- Jobs do not affect matches directly.

### `/api/suggestions`
- Pure ordered read from `MatchScore`.
- Example:
  - `SELECT * FROM MatchScore WHERE userId = ? ORDER BY score DESC LIMIT ?`
- Reasons are returned directly from `MatchScore.reasons`.

## Versioning (Strong Recommendation)
Add fields to `MatchScore`:
- `computedAt`
- `algorithmVersion`

This enables:
- Safe scoring changes without schema breakage.
- A/B testing.
- Debugging score shifts.

## Next Step (Implementation)
If we want a simple first step:
- Extract rating aggregation into its own script.
- Write outputs into a dedicated table or into `MatchScore` reasons.

## Feed Injection Mapping
Match scores should drive feed injection:
- `MatchScore` remains the only matchmaking truth.
- Feed can inject `kind: 'match'` cards when:
  - A new match is created.
  - A conversation is revived.
  - A high-score suggestion crosses a threshold.
- Client should never invent match cards.

## Job Runs Table (Recommended)
Add a lightweight `JobRun` table to track execution:
- `jobName`, `status`, `trigger`, `scope`
- `startedAt`, `finishedAt`, `durationMs`
- `algorithmVersion`, `attempt`, `error`, `metadata`

This gives us visibility, retries, and safe “do not run twice” guards while
keeping us free to move to a separate Railway service later.
*** End PatchError: jsonschema: line 1 column 1 (char 0) to=functions.apply_patch code<typename>lue
