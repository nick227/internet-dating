# Enhanced Location Plan (City/State Buckets)

Goal: Reuse coarse location buckets (city/state) to reduce lat/lng cardinality and improve cacheability, while still supporting Near Me distance filtering.

## Overview
- Introduce a coarse `regionKey` (job reuse unit) and a display `geoBucketLabel`.
- Use `regionKey`/bucket as a **soft prefilter only**.
- Apply bbox + Haversine as final authority (always).
- Store normalized city/state on profile updates and during geocoding.

## Data Model
1) `ProfileSearchIndex`
- Add:
  - `regionKey` (string, nullable) // reuse unit, e.g. "us-ca-la-metro"
  - `geoBucketLabel` (string, nullable) // e.g. "Los Angeles, CA"
  - `geoPrecision` (enum: exact | city | state | unknown)
- Index:
  - `@@index([regionKey])`

2) `Profile`
- Ensure normalized fields exist:
  - `locationCity`, `locationState`, `locationCountry` (if not present, add)
- Continue to store `locationText` for display.

## Normalization Rules
- `geoBucketLabel = "{City}, {State}"` when both exist.
- Fallback to `city` or `state` if only one exists.
- `regionKey` uses a controlled vocabulary (provider-driven, not user text).

## Backend Flow
1) Reverse geocode response
- Extract `city` + `state`.
- Persist on profile update:
  - `locationText` (display)
  - `locationCity`, `locationState`, `locationCountry`
  - `geoPrecision` (based on the best available level)

2) Profile update
- If user edits location manually:
  - Store `locationText`.
  - Keep last known `lat/lng`; mark `geoPrecision = "city"` or `"state"` and `locationAccuracy = "stale"`.
  - Never hard-clear unless user explicitly disables location.

3) Search index job
- Populate `geoBucketLabel`, `regionKey`, and `geoPrecision`.

4) Search handler
- **Soft prefilter only**:
  - Option A (recommended): bbox first, then bucket filter, then Haversine.
  - Never rely on bucket for inclusion/exclusion.
- If bucket is missing, skip bucket filter (bbox-only).

## Migration Plan
1) Add columns to `ProfileSearchIndex`.
2) Backfill via `profile-search-index` job.

## UI Behavior
- Near Me uses device location.
- Manual location entry only updates display and bucket (if geocoded).
- Error/CTA when location data missing.

## Benefits
- Better cacheability and reuse of computed segments by region.
- Easier explanation to users ("searching within Los Angeles, CA").

## Risks & Guardrails
- Buckets are a label, not a shape; edges are always fuzzy.
- City/state buckets do **not** guarantee query size reduction.
- Cacheability is limited unless radius + filters are normalized.
- Bucket-miss rate should be logged and monitored.

## Required Adjustments
- Buckets must be a **soft prefilter only**. Final authority is bbox + Haversine.
- Keep last known `lat/lng`; mark precision as stale on manual edits.
- Normalize `regionKey` via provider-controlled mapping (not user text).
- Add a neighbor-region expansion for border correctness.

## Next Steps
- Define `regionKey` vocabulary and mapping rules.
- Decide on region expansion thresholds (e.g., if radius > 30km).

## Core Idea That Works
- `regionKey` is a job-reuse unit, not geo truth.
- Large, fuzzy, provider-defined.
- Stable across users, cheap to recompute, safe to cache against.
- Decoupled from user-entered text.

## Key Strengths (Keep These)
- Soft prefilter only; never bucket-only inclusion/exclusion.
- Precision is tracked (`geoPrecision` + stale marker), not guessed.
- Keep last `lat/lng` to avoid breaking Near Me on manual edits.
- Provider-controlled vocabulary enables reuse.
- UI label (`geoBucketLabel`) is separate from computation (`regionKey`).

## Real Concerns (Operational)
1) Buckets won’t reduce cardinality unless radius is normalized
- Same `regionKey` + different radii + different filters → low cache reuse.
- Buckets help job reuse, not request-level caching without normalization.

2) Bucket-after-bbox ordering matters
- Bbox first, bucket second, Haversine last.
- Bucket should cap candidate explosion, not shape correctness.

3) `regionKey` vocabulary is now a product decision
- Keys like `us-ca-la-metro` define borders and expansion rules.
- Treat mappings as versioned data (not static constants).

4) Border behavior must be explicit
- Minimum rule: if bbox crosses a region boundary, include adjacent `regionKey`s.
- Log how often expansion is used.

## Recommendations
- Do not precompute distances per user.
- Precompute region cohorts (IDs or summaries), then apply distance per request.

## Bottom Line
- Buckets improve job reuse, not immediate query performance.
- Expect cache wins later, after radius/filter normalization.
