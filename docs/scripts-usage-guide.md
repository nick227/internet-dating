# Scripts & Jobs Usage Guide

Complete guide to using the reorganized scripts system for seeding, jobs, testing, and maintenance.

## 📁 Directory Structure Overview

```
scripts/
├── seeding/          # Database seeding and demo data
│   ├── core/        # Main seeding scripts
│   ├── lib/         # Seeding utilities
│   ├── legacy/      # Deprecated seed scripts (archived)
│   ├── data/        # Seed data files
│   └── validation/  # Seeding validation tools
│
├── jobs/            # Background job system
│   ├── core/        # Job implementations
│   ├── lib/         # Job utilities & registry
│   └── runners/     # Job execution scripts
│
├── admin/           # Admin & setup tools
├── testing/         # Test & debug scripts
├── maintenance/     # Maintenance & repair scripts
└── _archive/        # Deprecated files
```

---

## 🌱 Seeding Scripts

### Quick Start

```bash
# Seed demo data (legacy mode, 12 users)
pnpm seed:all

# Mass seeding mode (100-10000+ users)
pnpm seed:mass --count=1000 --activityDays=30

# Reset database (WARNING: deletes all data)
pnpm seed:reset

# Validate seeding
pnpm seed:validate
```

### Core Seeding Scripts

#### `seedAll.ts` - Main Seeding Entry Point

**Location**: `backend/scripts/seeding/core/seedAll.ts`

**Two Modes**:

1. **Legacy Demo Mode** (default):
   ```bash
   pnpm seed:all
   # or
   tsx scripts/seeding/core/seedAll.ts
   ```
   
   Creates ~12 demo users with interests, quizzes, and feed content.

2. **Mass Seeding Mode**:
   ```bash
   # Basic mass seeding
   pnpm seed:all --mass --count=1000
   
   # Advanced options
   pnpm seed:all --mass \
     --count=5000 \
     --activityDays=90 \
     --startDate=2024-01-01 \
     --skipActivity \
     --skipJobs
   ```
   
   **Options**:
   - `--count=N` - Number of profiles to create
   - `--activityDays=N` - Days of simulated activity (default: 30)
   - `--startDate=YYYY-MM-DD` - Activity start date (default: 2024-01-01)
   - `--skipActivity` - Skip activity simulation
   - `--skipJobs` - Skip job execution
   - `--skipMatchScores` - Skip match score computation
   - `--skipCompatibility` - Skip compatibility computation
   - `--runSeed=name` - Seed name for deterministic generation

#### `seedMassProfiles.ts` - Mass Profile Generation

**Location**: `backend/scripts/seeding/core/seedMassProfiles.ts`

```bash
# Direct usage
tsx scripts/seeding/core/seedMassProfiles.ts --count=1000 --runSeed=myseed
```

Creates realistic user profiles with:
- Deterministic generation (same seed = same profiles)
- Photos, videos, posts, questions
- Interests and quiz responses
- Follows and connections

#### `seedActivity.ts` - Activity Simulation

**Location**: `backend/scripts/seeding/core/seedActivity.ts`

```bash
# Simulate 30 days of activity
tsx scripts/seeding/core/seedActivity.ts --runSeed=myseed --days=30 --startDate=2024-01-01
```

Simulates user activity:
- Likes, comments, shares
- Profile views
- Messages and replies
- Follows/unfollows

#### `resetDatabase.ts` - Database Reset

**Location**: `backend/scripts/seeding/core/resetDatabase.ts`

```bash
# ⚠️ WARNING: Deletes ALL data
pnpm seed:reset
# or
tsx scripts/seeding/core/resetDatabase.ts
```

**Options**:
- `--keepAdmin` - Preserve admin users
- `--yes` - Skip confirmation prompt

### Validation

#### `validateSeeding.ts` - Verify Seeded Data

**Location**: `backend/scripts/seeding/validation/validateSeeding.ts`

```bash
pnpm seed:validate
# or
tsx scripts/seeding/validation/validateSeeding.ts
```

Validates:
- User counts and profiles
- Media attachments
- Engagement metrics
- Relationships and follows

### Seeding Utilities

The seeding system uses shared utilities in `scripts/seeding/lib/`:

- **`prng.ts`** - Deterministic random number generation
- **`mockDataGenerator.ts`** - Generate realistic mock data
- **`profileGenerator.ts`** - Profile generation logic
- **`activitySimulator.ts`** - User activity simulation
- **`batchInserter.ts`** - Efficient batch database insertion

---

## 🔧 Job System

### Quick Start

```bash
# Run a specific job
pnpm jobs:run match-scores --userId=8

# See all available jobs
pnpm jobs:run

# Run all jobs
pnpm jobs:run all
```

### Job Runners

#### `runJobs.ts` - Main Job Runner

**Location**: `backend/scripts/jobs/runners/runJobs.ts`

```bash
# General syntax
pnpm jobs:run <job-name> [options]

# Examples
pnpm jobs:run match-scores --userId=8 --batchSize=100
pnpm jobs:run compatibility --targetBatchSize=500
pnpm jobs:run profile-search-index --userBatchSize=100
```

See the [Jobs README](../backend/scripts/jobs/README.md) for detailed job documentation.

#### `recomputeMatchScores.ts` - Batch Recompute Match Scores

**Location**: `backend/scripts/jobs/runners/recomputeMatchScores.ts`

```bash
tsx scripts/jobs/runners/recomputeMatchScores.ts \
  --batchSize=100 \
  --candidateBatchSize=500 \
  --pauseMs=50
```

#### `recomputeCompatibility.ts` - Batch Recompute Compatibility

**Location**: `backend/scripts/jobs/runners/recomputeCompatibility.ts`

```bash
tsx scripts/jobs/runners/recomputeCompatibility.ts \
  --batchSize=100 \
  --targetBatchSize=500 \
  --pauseMs=50
```

### Available Jobs

| Job Name | Purpose | Usage |
|----------|---------|-------|
| `match-scores` | Compute user match scores | `pnpm jobs:run match-scores --userId=8` |
| `compatibility` | Compute compatibility scores | `pnpm jobs:run compatibility --userId=8` |
| `profile-search-index` | Build search index | `pnpm jobs:run profile-search-index` |
| `searchable-user` | Update searchable status | `pnpm jobs:run searchable-user` |
| `feed-presort` | Presort user feeds | `pnpm jobs:run feed-presort --userId=8` |
| `feed-presort-cleanup` | Clean stale feed data | `pnpm jobs:run feed-presort-cleanup` |
| `build-user-traits` | Build user trait vectors | `pnpm jobs:run build-user-traits` |
| `user-interest-sets` | Update interest sets | `pnpm jobs:run user-interest-sets` |
| `content-features` | Compute content features | `pnpm jobs:run content-features` |
| `trending` | Calculate trending scores | `pnpm jobs:run trending` |
| `affinity` | Compute affinity scores | `pnpm jobs:run affinity` |

For detailed job documentation, see: [Jobs README](../backend/scripts/jobs/README.md)

---

## 👤 Admin Scripts

### `createAdmin.ts` - Create Admin User

**Location**: `backend/scripts/admin/createAdmin.ts`

```bash
# Create regular admin
pnpm admin:create admin@example.com mypassword

# Create super admin
tsx scripts/admin/createAdmin.ts super@example.com mypassword SUPER_ADMIN
```

### `runMigrations.ts` - Run Database Migrations

**Location**: `backend/scripts/admin/runMigrations.ts`

```bash
pnpm migrate
# or
tsx scripts/admin/runMigrations.ts
```

---

## 🧪 Testing Scripts

### Available Test Scripts

#### `testFeedAPI.ts` - Test Feed Endpoints

**Location**: `backend/scripts/testing/testFeedAPI.ts`

```bash
tsx scripts/testing/testFeedAPI.ts
```

Tests Phase-1 (lite) and Phase-2 (full) feed endpoints.

#### `testMatchScores.ts` - Test Match Score Algorithm

**Location**: `backend/scripts/testing/testMatchScores.ts`

```bash
tsx scripts/testing/testMatchScores.ts --userId=8
```

#### `testPresort.ts` - Test Feed Presort

**Location**: `backend/scripts/testing/testPresort.ts`

```bash
tsx scripts/testing/testPresort.ts --userId=8
```

#### `testFollow.ts` - Test Follow Functionality

**Location**: `backend/scripts/testing/testFollow.ts`

```bash
tsx scripts/testing/testFollow.ts
```

#### `apiSanity.ts` - API Sanity Check

**Location**: `backend/scripts/testing/apiSanity.ts`

```bash
tsx scripts/testing/apiSanity.ts
```

---

## 🔨 Maintenance Scripts

### `backfillStats.ts` - Backfill Statistics

**Location**: `backend/scripts/maintenance/backfillStats.ts`

```bash
tsx scripts/maintenance/backfillStats.ts
```

Recomputes and backfills engagement statistics.

### `verifyQuizTraits.ts` - Verify Quiz Trait Consistency

**Location**: `backend/scripts/maintenance/verifyQuizTraits.ts`

```bash
tsx scripts/maintenance/verifyQuizTraits.ts
```

### `verifyUserTraits.ts` - Verify User Trait Consistency

**Location**: `backend/scripts/maintenance/verifyUserTraits.ts`

```bash
tsx scripts/maintenance/verifyUserTraits.ts
```

### `seed-quiz-tags.ts` - Seed Quiz Tags

**Location**: `backend/scripts/maintenance/seed-quiz-tags.ts`

```bash
tsx scripts/maintenance/seed-quiz-tags.ts
```

---

## 📋 Common Workflows

### 1. Fresh Development Setup

```bash
# 1. Run migrations
pnpm migrate

# 2. Create admin user
pnpm admin:create admin@localhost.com password123

# 3. Seed demo data
pnpm seed:all

# 4. Validate
pnpm seed:validate
```

### 2. Large-Scale Testing

```bash
# 1. Reset database
pnpm seed:reset --yes

# 2. Generate 10k profiles with 90 days of activity
pnpm seed:all --mass --count=10000 --activityDays=90

# 3. Run all jobs
pnpm jobs:run all

# 4. Validate
pnpm seed:validate
```

### 3. New User Onboarding (Production)

```bash
# After a new user signs up (userId=123)
pnpm jobs:run build-user-traits --userId=123
pnpm jobs:run match-scores --userId=123
pnpm jobs:run profile-search-index --userId=123
pnpm jobs:run feed-presort --userId=123
```

### 4. Algorithm Update Deployment

```bash
# Recompute everything after algorithm changes
pnpm jobs:run match-scores --batchSize=100
pnpm jobs:run compatibility --batchSize=100
pnpm jobs:run profile-search-index --userBatchSize=100
pnpm jobs:run feed-presort --batchSize=100
```

### 5. Daily Maintenance

```bash
# Run all maintenance jobs
pnpm jobs:run feed-presort-cleanup
pnpm jobs:run searchable-user
pnpm jobs:run trending
pnpm jobs:run stats-reconcile
```

### 6. Performance Testing

```bash
# 1. Generate realistic data
pnpm seed:all --mass --count=5000 --activityDays=30 --runSeed=perf-test

# 2. Test feed API
tsx scripts/testing/testFeedAPI.ts

# 3. Test match scores
tsx scripts/testing/testMatchScores.ts --userId=8

# 4. Test presort
tsx scripts/testing/testPresort.ts --userId=8
```

---

## 💡 Tips & Best Practices

### Seeding

1. **Use deterministic seeds**: Always use `--runSeed` for reproducible data
   ```bash
   pnpm seed:all --mass --count=1000 --runSeed=sprint-24
   ```

2. **Start small**: Test with small counts first
   ```bash
   pnpm seed:all --mass --count=100  # Test first
   pnpm seed:all --mass --count=5000 # Then scale up
   ```

3. **Skip jobs during seeding**: For faster seeding, skip jobs and run separately
   ```bash
   pnpm seed:all --mass --count=10000 --skipJobs
   pnpm jobs:run all  # Run jobs after
   ```

4. **Validate after seeding**: Always validate to catch issues early
   ```bash
   pnpm seed:validate
   ```

### Jobs

1. **Test with single users**: Use `--userId` to test jobs on one user first
   ```bash
   pnpm jobs:run match-scores --userId=8
   ```

2. **Adjust batch sizes**: Tune for your database capacity
   ```bash
   pnpm jobs:run match-scores --batchSize=50 --pauseMs=100  # Slower but safer
   ```

3. **Monitor performance**: Watch logs for timing and batch statistics

4. **Use incremental updates**: When available, use `--incremental` flag
   ```bash
   pnpm jobs:run feed-presort --incremental
   ```

### Testing

1. **Run sanity checks**: Before major changes
   ```bash
   tsx scripts/testing/apiSanity.ts
   ```

2. **Test feed performance**: After feed algorithm changes
   ```bash
   tsx scripts/testing/testFeedAPI.ts
   ```

3. **Validate match scores**: After match algorithm changes
   ```bash
   tsx scripts/testing/testMatchScores.ts
   ```

### Maintenance

1. **Regular cleanup**: Schedule periodic cleanup jobs
   ```bash
   # Cron: daily at 2am
   pnpm jobs:run feed-presort-cleanup
   ```

2. **Verify data integrity**: Run verification scripts after major operations
   ```bash
   tsx scripts/maintenance/verifyUserTraits.ts
   tsx scripts/maintenance/verifyQuizTraits.ts
   ```

3. **Backfill stats**: After data imports or fixes
   ```bash
   tsx scripts/maintenance/backfillStats.ts
   ```

---

## 🚨 Troubleshooting

### Database Connection Issues

```bash
# Check .env file exists
cat .env

# Verify DATABASE_URL is set
echo $env:DATABASE_URL  # PowerShell
```

### Job Failures

```bash
# Reduce batch size
pnpm jobs:run match-scores --batchSize=50 --pauseMs=200

# Run for single user to isolate issue
pnpm jobs:run match-scores --userId=8
```

### Seeding Errors

```bash
# Reset and try again
pnpm seed:reset --yes
pnpm seed:all --mass --count=100  # Start small

# Check validation
pnpm seed:validate
```

### Missing Data

```bash
# Verify seeding completed
pnpm seed:validate

# Check job completion
pnpm jobs:run all

# Backfill if needed
tsx scripts/maintenance/backfillStats.ts
```

---

## 📚 Additional Resources

- [Jobs README](../backend/scripts/jobs/README.md) - Detailed job documentation
- [Scripts Reorganization Plan](./scripts-reorganization-plan.md) - Structure rationale
- [Seeding Quick Start](./seeding-quick-start.md) - Quick seeding guide
- [Seeding Process Summary](./seeding-process-summary.md) - Detailed seeding docs

---

## 🔗 Package.json Scripts Reference

Quick reference for npm/pnpm scripts:

```json
{
  "seed:all": "tsx scripts/seeding/core/seedAll.ts",
  "seed:mass": "tsx scripts/seeding/core/seedMassProfiles.ts",
  "seed:activity": "tsx scripts/seeding/core/seedActivity.ts",
  "seed:validate": "tsx scripts/seeding/validation/validateSeeding.ts",
  "seed:reset": "tsx scripts/seeding/core/resetDatabase.ts",
  "admin:create": "tsx scripts/admin/createAdmin.ts",
  "jobs:run": "tsx scripts/jobs/runners/runJobs.ts",
  "migrate": "tsx scripts/admin/runMigrations.ts"
}
```

---

**Last Updated**: January 2026
**Maintained By**: Development Team
**Questions?**: Check the README files in each script subdirectory for more details.
