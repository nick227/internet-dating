# Jobs Guide

Quick reference for running jobs that power matching, searching, and site feed features.

## Quick Start

```bash
# Run a specific job
pnpm tsx scripts/jobs/runners/runJobs.ts <job-name> [options]

# See all available jobs
pnpm tsx scripts/jobs/runners/runJobs.ts

# Run all jobs
pnpm tsx scripts/jobs/runners/runJobs.ts all
```

---

## 🎯 Matching Jobs

### `match-scores`
**What it does**: Computes compatibility scores between users for match suggestions.

**When to run**:
- After user updates profile/preferences
- After new users join
- Periodic batch updates (cron)
- When algorithm weights change

**Examples**:
```bash
# Compute scores for a specific user
pnpm tsx scripts/jobs/runners/runJobs.ts match-scores --userId=8

# Batch process with custom settings
pnpm tsx scripts/jobs/runners/runJobs.ts match-scores --batchSize=100 --candidateBatchSize=500 --pauseMs=50

# Process all users (omit --userId)
pnpm tsx scripts/jobs/runners/runJobs.ts match-scores --batchSize=100
```

**Key Options**:
- `--userId=<id>` - Process specific user (optional, processes all if omitted)
- `--batchSize=<n>` - Users processed per batch (default: 100)
- `--candidateBatchSize=<n>` - Candidates loaded per batch (default: 500)
- `--pauseMs=<n>` - Pause between batches in ms (default: 50)

**Output**: Stores top 200 match scores per user in `MatchScore` table with tier (A/B) classification.

---

### `compatibility`
**What it does**: Computes detailed compatibility scores for match suggestions.

**When to run**:
- After match-scores job
- For detailed compatibility analysis
- When compatibility algorithm changes

**Examples**:
```bash
# Compute compatibility for a specific user
pnpm tsx scripts/jobs/runners/runJobs.ts compatibility --userId=8

# Batch process
pnpm tsx scripts/jobs/runners/runJobs.ts compatibility --batchSize=100 --targetBatchSize=500
```

**Key Options**:
- `--userId=<id>` - Process specific user (optional)
- `--batchSize=<n>` - Users processed per batch (default: 100)
- `--targetBatchSize=<n>` - Targets loaded per batch (default: 500)
- `--maxSuggestionTargets=<n>` - Max suggestions per user (default: 100)

---

## 🔍 Search Jobs

### `profile-search-index`
**What it does**: Builds denormalized search index for profile search functionality.

**When to run**:
- After user profile updates
- After new users join
- When search fields change
- Periodic full rebuild

**Examples**:
```bash
# Rebuild index for a specific user
pnpm tsx scripts/jobs/runners/runJobs.ts profile-search-index --userId=8

# Full rebuild for all users
pnpm tsx scripts/jobs/runners/runJobs.ts profile-search-index --userBatchSize=100 --pauseMs=50
```

**Key Options**:
- `--userId=<id>` - Process specific user (optional, processes all if omitted)
- `--userBatchSize=<n>` - Users processed per batch (default: 100)
- `--pauseMs=<n>` - Pause between batches (default: 50)

**Output**: Updates `ProfileSearchIndex` table with searchable profile data.

---

### `searchable-user`
**What it does**: Marks users as searchable based on profile completeness and visibility.

**When to run**:
- After profile updates
- After visibility changes
- Periodic validation

**Examples**:
```bash
# Update searchable status for all users
pnpm tsx scripts/jobs/runners/runJobs.ts searchable-user
```

---

## 📰 Site Feed Jobs

### `feed-presort`
**What it does**: Pre-sorts feed segments for users to enable fast feed loading.

**When to run**:
- After new content is posted
- After user follows/unfollows
- After feed algorithm changes
- Periodic refresh

**Examples**:
```bash
# Presort feed for a specific user
pnpm tsx scripts/jobs/runners/runJobs.ts feed-presort --userId=8

# Batch process with custom segment size
pnpm tsx scripts/jobs/runners/runJobs.ts feed-presort --batchSize=100 --segmentSize=20 --maxSegments=3

# Incremental update (only new content)
pnpm tsx scripts/jobs/runners/runJobs.ts feed-presort --userId=8 --incremental
```

**Key Options**:
- `--userId=<id>` - Process specific user (optional)
- `--batchSize=<n>` - Users processed per batch (default: 100)
- `--segmentSize=<n>` - Items per segment (default: 20)
- `--maxSegments=<n>` - Max segments per user (default: 3)
- `--incremental` - Only process new content (faster)

**Output**: Stores pre-sorted feed segments in `FeedPresorted` table.

---

### `feed-presort-cleanup`
**What it does**: Cleans up stale or invalid feed presort data.

**When to run**:
- Periodic maintenance (weekly/monthly)
- After feed algorithm changes
- When storage grows too large

**Examples**:
```bash
# Cleanup stale segments
pnpm tsx scripts/jobs/runners/runJobs.ts feed-presort-cleanup
```

---

## 🔧 Supporting Jobs

### `build-user-traits`
**What it does**: Builds user trait vectors from quiz results.

**When to run**:
- After quiz submissions
- After quiz algorithm changes
- Periodic rebuild

**Examples**:
```bash
# Rebuild traits for all users
pnpm tsx scripts/jobs/runners/runJobs.ts build-user-traits
```

---

### `user-interest-sets`
**What it does**: Maintains user interest sets for matching and recommendations.

**When to run**:
- After interest changes
- Periodic maintenance

**Examples**:
```bash
# Update interest sets
pnpm tsx scripts/jobs/runners/runJobs.ts user-interest-sets
```

---

### `content-features`
**What it does**: Computes content features for feed ranking.

**When to run**:
- After new posts
- After engagement changes
- Periodic updates

**Examples**:
```bash
# Compute content features
pnpm tsx scripts/jobs/runners/runJobs.ts content-features
```

---

### `trending`
**What it does**: Computes trending scores for content.

**When to run**:
- Periodic (hourly/daily)
- For trending content features

**Examples**:
```bash
# Compute trending scores
pnpm tsx scripts/jobs/runners/runJobs.ts trending
```

---

### `affinity`
**What it does**: Computes user affinity scores for recommendations.

**When to run**:
- After user interactions
- Periodic updates

**Examples**:
```bash
# Compute affinity scores
pnpm tsx scripts/jobs/runners/runJobs.ts affinity
```

---

## 📋 Common Workflows

### New User Onboarding
```bash
# 1. Build user traits
pnpm tsx scripts/jobs/runners/runJobs.ts build-user-traits --userId=<newUserId>

# 2. Compute match scores
pnpm tsx scripts/jobs/runners/runJobs.ts match-scores --userId=<newUserId>

# 3. Build search index
pnpm tsx scripts/jobs/runners/runJobs.ts profile-search-index --userId=<newUserId>

# 4. Presort feed
pnpm tsx scripts/jobs/runners/runJobs.ts feed-presort --userId=<newUserId>
```

### After Algorithm Update
```bash
# 1. Recompute match scores for all users
pnpm tsx scripts/jobs/runners/runJobs.ts match-scores --batchSize=100

# 2. Rebuild search index
pnpm tsx scripts/jobs/runners/runJobs.ts profile-search-index --userBatchSize=100

# 3. Refresh feed presorts
pnpm tsx scripts/jobs/runners/runJobs.ts feed-presort --batchSize=100
```

### Daily Maintenance
```bash
# Run all maintenance jobs
pnpm tsx scripts/jobs/runners/runJobs.ts all
```

---

## 💡 Tips

- **Start small**: Test with `--userId=<id>` before batch processing
- **Monitor performance**: Use `--pauseMs` to avoid DB overload
- **Batch sizes**: Adjust based on DB capacity and job runtime
- **Incremental updates**: Use `--incremental` flag when available for faster updates
- **Environment variables**: Set `MATCH_ALGO_VERSION` and `COMPATIBILITY_ALGO_VERSION` for algorithm versioning

---

## 🚨 Troubleshooting

**Job fails with DB timeout**:
- Reduce `--batchSize` or `--candidateBatchSize`
- Increase `--pauseMs` between batches

**Job runs too slow**:
- Increase batch sizes (if DB can handle it)
- Check for missing indexes
- Verify DB connection pool settings

**Missing data**:
- Check job completed successfully (no errors)
- Verify user/profile data exists
- Check job logs for skipped records

---

For more details on specific jobs, see individual job files in `backend/scripts/jobs/`.
