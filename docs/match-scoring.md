This code is a “match scoring” worker job for a dating / social app.

For each user, it:

Finds candidate profiles they’re allowed to see

Filters out deal-breakers (gender preference, age range, distance radius, blocks, hidden/deleted)

Computes a compatibility score from multiple signals (traits/quiz, interests, ratings, recency, proximity)

Keeps only the best matches (Top-K, default 200)

Writes those match rows into a MatchScore table

Uses a versioned swap so you don’t wipe old scores unless the new ones successfully wrote

Think of it like: “Nightly batch job that precomputes everyone’s recommended people list.”

The big picture flow
A) Job runner entry point: runMatchScoreJob()

Runs for one user if options.userId is set (event-driven)

Otherwise runs for all users in batches (cron-driven)

Uses runJob(...) so it’s tracked/logged consistently

B) Per-user work: recomputeMatchScoresForUser(userId, overrides)

For a single user (“me”), it:

Loads my profile (location, gender, birthdate, lat/lng)

Loads my preferences (preferred genders, age min/max, preferred distance)

Loads my traits (from UserTrait)

Loads my interests (from UserInterest)

Loads my quiz (legacy fallback)

Loads my rating style (average of how I rate others), turning it into a “rating taste vector”

Iterates through all other visible profiles in candidate batches

Scores candidates, keeps Top-K only, then writes them to DB

What “Top-K + pruning” means (why it’s there)
Top-K (default 200)

You don’t store scores for every possible candidate. You store the best 200 only.

That’s what the MinHeap does:

It keeps a small pile of the best candidates seen so far.

If a new candidate is worse than the current worst in the Top-K, it’s ignored.

Pruning (skip expensive work early)

Before doing expensive similarity math, the job estimates:

“Even if everything else goes perfectly, can this candidate beat the current Top-K threshold?”

If no, it skips the candidate early.

This is why the code computes:

cheapScore from easy-to-get parts (recency + proximity + an interest upper bound)

then maxPossibleScore = cheapScore + (max remaining weights)

If maxPossibleScore < currentThreshold, it prunes.

The filtering rules (gating) — “who even gets scored”

These are hard filters. If you fail them, you’re not considered.

Gender gate

If user has preferred genders, candidate must match one.

Age gate

Candidate age must fall between preferredAgeMin and preferredAgeMax.

If age is required but missing → excluded.

Distance gate

If preferred distance exists and we can compute real distance, candidate must be within it.

Notice the nuance: if distance is missing, it’s not automatically excluded here because there’s a later text match fallback for proximity.

Also in the DB query itself:

excludes deleted profiles/users

excludes hidden profiles (isVisible: true)

excludes blocked relationships in both directions

The score components (what “compatibility” is made of)

Each candidate gets 6 sub-scores (0..1), then a weighted sum.

1) Trait / Quiz similarity (scoreQuiz)

Primary path: trait similarity (preferred)

Each user has traits: { traitKey, value, n }

n = how many quiz answers contributed (confidence)

Traits are confidence-weighted:
effectiveValue = value * confidence, where confidence = clamp(n / 5)

Then:

Compare aligned effective trait vectors with cosine similarity (angle similarity)

Normalize cosine from [-1..1] to [0..1] using (cos + 1)/2

Apply a coverage penalty (how many traits overlap):

coverage uses min(userTraitCount, candidateTraitCount)

then softened by sqrt(coverage) so it doesn’t punish people too harshly for having lots of traits

Important meaning in this version:

If no comparable traits → traitSimResult.value is null

null means missing data, not “bad match”

Fallback path:

If traits are missing/unusable → use legacy quiz similarity

If that is missing too → use neutral baseline 0.5

So here “missing data” becomes neutral, not zero.

2) Interest overlap (scoreInterests)

Interests are category tags (binary)

Uses Jaccard overlap: shared / total unique

If either user has zero interests recorded, this version uses neutral baseline 0.1

(If both have interests but none overlap, you get 0, which is a real result.)

3) Rating quality (scoreRatingsQuality)

This tries to represent “how well-liked the candidate is by others”.

If the candidate has enough ratings (minRatingCount, default 3):

average the dimensions (attractive/smart/funny/interesting)

normalize to 0..1

If not enough ratings:

use neutral baseline 0.5

4) Rating fit (scoreRatingsFit)

This tries to represent “does this candidate match what I personally tend to like”.

Build “my rating taste vector” from how I rate people (my averages)

Build candidate’s received rating vector

Center both vectors (remove mean) so it’s about shape, not absolute positivity

Compare with cosine, normalized to [0..1]

If missing/insufficient rating data:

neutral baseline 0.5

5) Newness (scoreNew)

“How recently updated is their profile?”

Exponential decay with half-life (default 30 days)

New profile ≈ 1, older trends toward 0

6) Proximity (scoreNearby)

“How close are they?”

If lat/lng available: linear decay to 0 by radius

If not available but locationText matches exactly: fixed 0.25

Final score (the one number stored)
score =
  scoreQuiz           * w.quiz
+ scoreInterests      * w.interests
+ scoreRatingsQuality * w.ratingQuality
+ scoreRatingsFit     * w.ratingFit
+ scoreNew            * w.newness
+ scoreNearby         * w.proximity


Defaults:

quiz 0.25

interests 0.20

ratingQuality 0.15

ratingFit 0.10

newness 0.10

proximity 0.20

“Reasons” — the explainability blob

Each match row stores reasons, a JSON object that explains:

component scores (quiz/traits, interests, ratings, recency, proximity)

trait coverage + common trait count

whether legacy quiz was used

top 5 overlapping interest labels

distanceKm (rounded) if known

rating dimension averages + count if known

This is mainly for debugging and tuning.

Versioned swap (why scores don’t disappear on failure)

Instead of deleting old scores at the start:

It writes new scores with algorithmVersion = vNext

Only after successful write, it deletes old rows for vPrev (if different)

If nothing is written, it preserves old scores.

This prevents “blank match feed” if the job crashes mid-run.

Distribution logging (what it’s measuring)

After computing Top-K, it computes summary stats:

count, mean, p50 (median), p90

how many scores are exactly 0

a “nullCount” heuristic: rows where several components are 0 (rough proxy for “lots of missing info”)

per-component mean/p50/p90

This helps you see “are we producing meaningful scores?” and “are they all clustered?”

What the new options do (in human terms)

topK (default 200): only store the best 200 matches per user

minTraitOverlap (default 2): if fewer than 2 shared traits, treat traits as “not comparable”

minRatingCount (default 3): ratings don’t affect score unless enough people have rated them

plus existing tuning knobs: batch sizes, pause, weights, distance default, half-life, ratingMax

A simple mental model

For each user:

Step 1: Remove obviously incompatible people (preferences + blocks + visibility).

Step 2: Quickly estimate who could be a top match (cheap score).

Step 3: Only for the candidates who might matter, compute expensive similarity math.

Step 4: Keep best 200, store them, and keep a detailed “why” breakdown.

One key nuance (important for “layperson” understanding)

This version intentionally treats missing information as neutral instead of bad:

No traits/quiz → 0.5 (neutral)

No interests → 0.1 (slightly neutral)

Not enough ratings → 0.5 (neutral)

That means the system tries not to punish brand-new or underspecified profiles as “bad”, but it will still rank them lower than strong, well-supported matches because they can’t earn high scores from those components.