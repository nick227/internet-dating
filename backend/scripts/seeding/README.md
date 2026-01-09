# Seeding Guide

Quick reference for seeding data in this codebase. The primary entrypoint is `scripts/seeding/core/seedAll.ts`.

## Quick Start

```bash
# Mass seeding (recommended)
pnpm tsx scripts/seeding/core/seedAll.ts --mass --count=500 --activityDays=30

# Legacy demo seeding (small, curated dataset)
pnpm tsx scripts/seeding/core/seedAll.ts
```

---

## Entry Points

### `seedAll.ts` (recommended)
**What it does**: Orchestrates full seeding runs. Supports both mass/deterministic seeding and legacy demo seeding.

**Mass seeding mode** (deterministic, large datasets):
```bash
pnpm tsx scripts/seeding/core/seedAll.ts --mass --count=1000 --activityDays=30 --startDate=2024-01-01
```

**Key flags**:
- `--mass` - Switches to mass seeding mode
- `--count=<n>` - Number of profiles (default: 100)
- `--runSeed=<id>` - Deterministic seed id (default: `seed-<timestamp>`)
- `--activityDays=<n>` - Days of activity to simulate (default: 30)
- `--startDate=YYYY-MM-DD` - Activity start date (default: 2024-01-01)
- `--skipActivity` - Skip activity simulation (Phase B)
- `--skipJobs` - Skip derived data jobs
- `--skipMatchScores` - Skip match score job
- `--skipCompatibility` - Skip compatibility job
- `--skipValidation` - Skip validation checks

**Legacy demo mode** (small curated dataset):
```bash
pnpm tsx scripts/seeding/core/seedAll.ts --demoCount=12 --viewerEmail=nick@gmail.com
```

**Legacy flags**:
- `--skipDemo` - Skip demo feed seeding
- `--skipInterests` - Skip interests seeding
- `--skipQuizzes` - Skip quiz seeding
- `--skipMatchScores` - Skip match score job
- `--skipCompatibility` - Skip compatibility job
- `--demoCount=<n>` - Demo persona count (default: 12)
- `--viewerEmail=<email>` - Viewer used for demo feed interactions
- `--viewerUserId=<id>` - Viewer override by user id

---

## Mass Seeding (Deterministic)

### Phase A: Profiles (`seedMassProfiles.ts`)
**What it does**: Generates users, profiles, media, interests, and quiz results.

```bash
pnpm tsx scripts/seeding/core/seedMassProfiles.ts --count=500 --runSeed=seed-20250101 --batchSize=50
```

**Notes**:
- Creates interests and quiz definitions if missing.
- Uses deterministic RNG keyed by `runSeed`.
- Sets avatar/hero media from inserted media rows.

### Phase B: Activity (`seedActivity.ts`)
**What it does**: Simulates posts, likes, matches, conversations, and messages for existing profiles.

```bash
pnpm tsx scripts/seeding/core/seedActivity.ts --runSeed=seed-20250101 --startDate=2024-01-01 --days=30
```

**Notes**:
- Requires profiles from Phase A.
- Derives matches from mutual likes, then creates conversations/messages.
- Uses batch inserts with progress logging.

---

## Legacy Demo Seeding

### `seedFeedDemo.ts`
**What it does**: Seeds a curated set of personas, posts, likes, matches, conversations, feed seen, and ratings.

```bash
pnpm tsx scripts/seeding/legacy/seedFeedDemo.ts --count=12 --viewerUserId=8
```

### `seedProfiles.ts`
**What it does**: Seeds a small set of demo profiles with media and posts.

```bash
pnpm tsx scripts/seeding/legacy/seedProfiles.ts
```

### `seedInterests.ts`
**What it does**: Seeds interest subjects and interests, then assigns random interests per user.

```bash
pnpm tsx scripts/seeding/legacy/seedInterests.ts
```

### `seedQuizzes.ts`
**What it does**: Seeds quiz definitions and optionally quiz results for users.

```bash
pnpm tsx scripts/seeding/legacy/seedQuizzes.ts --quizSlug=core-preferences
pnpm tsx scripts/seeding/legacy/seedQuizzes.ts --skipResults
```

---

## Validation

### `validateSeeding.ts`
**What it does**: Checks data integrity (users vs profiles, match rates, message penetration, etc.).

```bash
pnpm tsx scripts/seeding/validation/validateSeeding.ts
```

---

## Resetting Data

### `resetDatabase.ts`
**What it does**: Deletes seeded data. Use with care.

```bash
# Delete all data
pnpm tsx scripts/seeding/core/resetDatabase.ts

# Delete only seed/test users (emails starting with test./seed./demo./@example.com)
pnpm tsx scripts/seeding/core/resetDatabase.ts --test-only
```

---

## Data Sources and Helpers

- `scripts/seeding/data/QUIZ_SEEDS.ts` - Quiz definitions for legacy quiz seeding.
- `scripts/seeding/lib/profileGenerator.ts` - Mass profile generation.
- `scripts/seeding/lib/activitySimulator.ts` - Activity simulation logic.
- `scripts/seeding/lib/batchInserter.ts` - Batch insert helper with progress tracking.

---

## Troubleshooting

**No profiles found in activity seeding**:
- Run `seedMassProfiles.ts` first or use `seedAll.ts --mass`.

**Jobs take too long**:
- Lower `--batchSize`, `--candidateBatchSize`, or increase `--pauseMs`.

**Quiz results missing**:
- Ensure `seedQuizzes.ts` ran without `--skipResults` or run `seedMassProfiles.ts`.
