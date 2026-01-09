# Job System Guide

Complete guide to understanding, using, and managing the background job system that powers matching, search, and feed features.

## Table of Contents

- [What Are Jobs?](#what-are-jobs)
- [Quick Start](#quick-start)
- [Job Categories](#job-categories)
- [Running Jobs](#running-jobs)
- [Job Management](#job-management)
- [Production Deployment](#production-deployment)
- [Monitoring & Troubleshooting](#monitoring--troubleshooting)
- [Best Practices](#best-practices)

---

## What Are Jobs?

Jobs are background tasks that compute derived data and keep the platform running smoothly. They handle computationally expensive operations that shouldn't block user requests.

### Why Jobs?

- **Performance**: Offload heavy computations from API requests
- **Consistency**: Keep derived data (scores, indexes, rankings) up-to-date
- **Scalability**: Process large datasets in manageable batches
- **Reliability**: Retry failed operations, track progress

### Job Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Job Registry                         │
│  (backend/scripts/jobs/lib/registry.ts)                │
│  • Discovers and registers all jobs                    │
│  • Provides job metadata and execution interface       │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Job Implementations                     │
│  (backend/scripts/jobs/core/)                           │
│  • Each job defines: name, description, options         │
│  • Implements run() function with core logic           │
│  • Returns success/failure status                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    Job Runners                          │
│  (backend/scripts/jobs/runners/)                        │
│  • runJobs.ts - Interactive CLI runner                 │
│  • recomputeMatchScores.ts - Batch match computation   │
│  • recomputeCompatibility.ts - Batch compatibility     │
└─────────────────────────────────────────────────────────┘
```

### When Jobs Run

Jobs can be triggered in several ways:

1. **Manual Execution**: Developer runs via CLI
   ```bash
   pnpm jobs:run match-scores --userId=123
   ```

2. **Scheduled (Cron)**: Periodic execution
   ```bash
   # Example cron: daily at 2am
   0 2 * * * cd /app && pnpm jobs:run feed-presort-cleanup
   ```

3. **Event-Driven**: After user actions (via API or worker)
   ```typescript
   // After user updates profile
   await runJob('profile-search-index', { userId });
   ```

4. **Batch Processing**: Large-scale recomputation
   ```bash
   pnpm jobs:run match-scores --batchSize=500
   ```

---

## Quick Start

### List Available Jobs

```bash
# Show all jobs with descriptions
pnpm jobs:run

# Or directly
tsx scripts/jobs/runners/runJobs.ts
```

### Run a Job

```bash
# Basic syntax
pnpm jobs:run <job-name> [options]

# Example: compute match scores for user 8
pnpm jobs:run match-scores --userId=8

# Example: rebuild search index for all users
pnpm jobs:run profile-search-index
```

### Common Options

Most jobs support these options:

- `--userId=<id>` - Process specific user (optional, processes all if omitted)
- `--batchSize=<n>` - Number of items per batch
- `--pauseMs=<n>` - Milliseconds to pause between batches
- `--dryRun` - Preview without making changes (if supported)

---

## Job Categories

### 🎯 Matching Jobs

These jobs power the matching and compatibility system.

#### `match-scores`

**Purpose**: Computes compatibility scores between users for match suggestions.

**When to Run**:
- After user updates profile or preferences
- After new users join (onboarding)
- Periodic batch updates (e.g., nightly)
- When matching algorithm changes

**Example Usage**:
```bash
# New user onboarding
pnpm jobs:run match-scores --userId=123

# Batch recompute all users
pnpm jobs:run match-scores --batchSize=100

# Careful processing with longer pauses
pnpm jobs:run match-scores --batchSize=50 --pauseMs=200
```

**Output**: Stores top 200 match scores per user in `MatchScore` table with A/B tier classification.

**Performance**: ~50-100 users/minute at default settings.

---

#### `compatibility`

**Purpose**: Computes detailed compatibility scores for match suggestions.

**When to Run**:
- After `match-scores` job completes
- When compatibility algorithm changes
- Periodic refresh for active users

**Example Usage**:
```bash
# Compute for specific user
pnpm jobs:run compatibility --userId=123

# Batch process
pnpm jobs:run compatibility --batchSize=100 --targetBatchSize=500
```

**Output**: Stores compatibility suggestions in `CompatibilitySuggestion` table.

**Performance**: ~30-60 users/minute at default settings.

---

### 🔍 Search Jobs

These jobs maintain the search and discovery system.

#### `profile-search-index`

**Purpose**: Builds denormalized search index for profile search functionality.

**When to Run**:
- After user profile updates
- After new users join
- When search fields/logic change
- Periodic full rebuild (weekly/monthly)

**Example Usage**:
```bash
# Update index for specific user
pnpm jobs:run profile-search-index --userId=123

# Full rebuild (all users)
pnpm jobs:run profile-search-index --userBatchSize=100
```

**Output**: Updates `ProfileSearchIndex` table with searchable profile data.

**Performance**: ~100-200 users/minute at default settings.

---

#### `searchable-user`

**Purpose**: Marks users as searchable based on profile completeness and visibility.

**When to Run**:
- After profile updates
- After visibility changes
- Periodic validation (daily)

**Example Usage**:
```bash
pnpm jobs:run searchable-user
```

**Output**: Updates `User.isSearchable` flag.

**Performance**: Fast, processes all users in seconds.

---

### 📰 Feed Jobs

These jobs power the personalized feed system.

#### `feed-presort`

**Purpose**: Pre-sorts feed segments for users to enable fast feed loading.

**When to Run**:
- After new content is posted
- After user follows/unfollows
- After feed algorithm changes
- Periodic refresh (hourly for active users)

**Example Usage**:
```bash
# Presort for specific user
pnpm jobs:run feed-presort --userId=123

# Batch process with custom segment size
pnpm jobs:run feed-presort --batchSize=100 --segmentSize=20

# Incremental update (only new content)
pnpm jobs:run feed-presort --userId=123 --incremental
```

**Output**: Stores pre-sorted feed segments in `FeedPresorted` table.

**Performance**: ~20-40 users/minute (depends on content volume).

---

#### `feed-presort-cleanup`

**Purpose**: Cleans up stale or invalid feed presort data.

**When to Run**:
- Periodic maintenance (weekly)
- After feed algorithm changes
- When storage grows too large

**Example Usage**:
```bash
pnpm jobs:run feed-presort-cleanup
```

**Output**: Removes stale presorted segments, frees database space.

---

### 🔧 Supporting Jobs

These jobs maintain supporting systems.

#### `build-user-traits`

**Purpose**: Builds user trait vectors from quiz results for matching.

**When to Run**:
- After quiz submissions
- After quiz algorithm changes
- Periodic rebuild (when algorithm updates)

**Example Usage**:
```bash
pnpm jobs:run build-user-traits
```

**Output**: Updates `UserTrait` table with computed trait vectors.

---

#### `user-interest-sets`

**Purpose**: Maintains user interest sets for matching and recommendations.

**When to Run**:
- After user adds/removes interests
- Periodic maintenance (daily)

**Example Usage**:
```bash
pnpm jobs:run user-interest-sets
```

---

#### `content-features`

**Purpose**: Computes content features for feed ranking.

**When to Run**:
- After new posts are created
- After engagement changes
- Periodic updates (hourly)

**Example Usage**:
```bash
pnpm jobs:run content-features
```

---

#### `trending`

**Purpose**: Computes trending scores for content discovery.

**When to Run**:
- Periodic execution (hourly/daily)
- For trending features and sections

**Example Usage**:
```bash
pnpm jobs:run trending --windowHours=48 --minEngagements=5
```

---

#### `affinity`

**Purpose**: Computes user affinity scores for recommendations.

**When to Run**:
- After significant user interactions
- Periodic updates (daily/weekly)

**Example Usage**:
```bash
pnpm jobs:run affinity --lookbackDays=90
```

---

### 📊 Statistics Jobs

#### `quiz-answer-stats`

**Purpose**: Computes statistics for quiz answers.

**When to Run**:
- After quiz responses
- Periodic updates (daily)

**Example Usage**:
```bash
pnpm jobs:run quiz-answer-stats
```

---

#### `stats-reconcile`

**Purpose**: Reconciles and fixes engagement statistics.

**When to Run**:
- When stats look incorrect
- Periodic validation (weekly)

**Example Usage**:
```bash
pnpm jobs:run stats-reconcile
```

---

### 🛠️ Maintenance Jobs

#### `media-metadata`

**Purpose**: Extracts metadata from uploaded media.

**When to Run**:
- After media upload
- For fixing missing metadata

**Example Usage**:
```bash
pnpm jobs:run media-metadata --mediaId=123
```

---

#### `media-metadata-batch`

**Purpose**: Batch process media metadata extraction.

**Example Usage**:
```bash
pnpm jobs:run media-metadata-batch --batchSize=50
```

---

#### `media-orphan-cleanup`

**Purpose**: Cleans up orphaned media files.

**When to Run**:
- Periodic maintenance (weekly)

**Example Usage**:
```bash
pnpm jobs:run media-orphan-cleanup --maxAgeHours=24
```

---

## Running Jobs

### Interactive CLI

The primary way to run jobs is via the interactive CLI:

```bash
# Run the CLI
pnpm jobs:run

# This shows:
# 1. List of all available jobs
# 2. Job descriptions
# 3. Usage examples
# 4. Available options
```

### Direct Execution

For scripts or automation:

```bash
# Run specific job
tsx scripts/jobs/runners/runJobs.ts match-scores --userId=123

# Run all jobs in sequence
tsx scripts/jobs/runners/runJobs.ts all
```

### Via Package Scripts

Use the npm/pnpm scripts in `package.json`:

```bash
# Defined in backend/package.json
pnpm jobs:run <job-name> [options]
```

### Batch Runners

For large-scale operations:

```bash
# Batch recompute match scores
tsx scripts/jobs/runners/recomputeMatchScores.ts \
  --batchSize=100 \
  --candidateBatchSize=500 \
  --pauseMs=50

# Batch recompute compatibility
tsx scripts/jobs/runners/recomputeCompatibility.ts \
  --batchSize=100 \
  --targetBatchSize=500 \
  --pauseMs=50
```

---

## Job Management

### Execution Strategies

#### 1. Single User Processing

Best for: Testing, debugging, new user onboarding

```bash
pnpm jobs:run match-scores --userId=123
```

**Pros**: Fast, isolated, easy to debug
**Cons**: Doesn't scale for many users

---

#### 2. Batch Processing

Best for: Bulk updates, periodic maintenance, algorithm changes

```bash
pnpm jobs:run match-scores --batchSize=100 --pauseMs=50
```

**Pros**: Processes all users, controlled rate
**Cons**: Takes time for large datasets

**Tuning**:
- **Small batches + long pauses**: Safe, low DB load
  ```bash
  --batchSize=50 --pauseMs=200
  ```
- **Large batches + short pauses**: Fast, high DB load
  ```bash
  --batchSize=500 --pauseMs=10
  ```

---

#### 3. Incremental Processing

Best for: Frequent updates, only process what's changed

```bash
pnpm jobs:run feed-presort --incremental
```

**Pros**: Fast, efficient
**Cons**: Requires job to support incremental mode

---

### Job Orchestration

For complex workflows, run jobs in sequence:

```bash
#!/bin/bash
# New user onboarding workflow

USER_ID=$1

echo "Onboarding user $USER_ID..."

# Step 1: Build traits
pnpm jobs:run build-user-traits --userId=$USER_ID

# Step 2: Compute matches
pnpm jobs:run match-scores --userId=$USER_ID

# Step 3: Build search index
pnpm jobs:run profile-search-index --userId=$USER_ID

# Step 4: Presort feed
pnpm jobs:run feed-presort --userId=$USER_ID

echo "Onboarding complete!"
```

---

### Job Dependencies

Some jobs depend on others. Run in this order:

```
1. build-user-traits        (Base traits)
   ↓
2. match-scores             (Requires traits)
   ↓
3. compatibility            (Requires match scores)
   ↓
4. profile-search-index     (Searchability)
   ↓
5. feed-presort             (Feed content)
```

For content features:
```
1. content-features         (Extract features)
   ↓
2. trending                 (Compute trends)
   ↓
3. feed-presort             (Rank in feed)
```

---

## Production Deployment

### Scheduled Jobs (Cron)

Set up cron jobs for periodic execution:

```cron
# /etc/crontab or crontab -e

# Match scores - nightly at 2am
0 2 * * * cd /app && pnpm jobs:run match-scores --batchSize=100

# Search index - nightly at 3am
0 3 * * * cd /app && pnpm jobs:run profile-search-index

# Feed presort - every 2 hours
0 */2 * * * cd /app && pnpm jobs:run feed-presort --batchSize=50

# Cleanup - weekly on Sunday at 4am
0 4 * * 0 cd /app && pnpm jobs:run feed-presort-cleanup
0 4 * * 0 cd /app && pnpm jobs:run media-orphan-cleanup

# Trending - hourly
0 * * * * cd /app && pnpm jobs:run trending

# Stats reconciliation - daily at 5am
0 5 * * * cd /app && pnpm jobs:run stats-reconcile
```

### Environment Variables

Configure job behavior via environment variables:

```bash
# .env
MATCH_ALGO_VERSION=v2
COMPATIBILITY_ALGO_VERSION=v2
JOB_BATCH_SIZE=100
JOB_PAUSE_MS=50
```

### Worker Processes

For high-scale deployments, use dedicated worker processes:

```bash
# Start job worker (processes from queue)
pnpm worker:jobs
```

Worker monitors job queue and executes jobs asynchronously.

---

## Monitoring & Troubleshooting

### Job Logs

Jobs output detailed logs:

```bash
pnpm jobs:run match-scores --userId=123
```

Output includes:
- Job name and parameters
- Progress indicators (batches processed)
- Timing information
- Success/failure status
- Error messages (if any)

### Common Issues

#### 1. Database Timeouts

**Symptoms**: Job fails with timeout error

**Solution**: Reduce batch size, increase pause time
```bash
pnpm jobs:run match-scores --batchSize=50 --pauseMs=200
```

---

#### 2. Out of Memory

**Symptoms**: Job crashes with OOM error

**Solution**: Reduce batch sizes, especially candidate batches
```bash
pnpm jobs:run match-scores --batchSize=50 --candidateBatchSize=200
```

---

#### 3. Slow Performance

**Symptoms**: Job takes too long

**Solution**: 
- Check for missing database indexes
- Increase batch sizes (if DB can handle it)
- Use incremental mode (if available)
- Run during off-peak hours

---

#### 4. Incomplete Results

**Symptoms**: Not all users processed

**Solution**:
- Check job logs for errors
- Run job again (should resume)
- Validate with specific user:
  ```bash
  pnpm jobs:run match-scores --userId=123
  ```

---

#### 5. Wrong Results

**Symptoms**: Scores/data look incorrect

**Solution**:
- Check algorithm version environment variables
- Verify dependencies ran first (e.g., traits before scores)
- Run maintenance jobs:
  ```bash
  pnpm jobs:run stats-reconcile
  tsx scripts/maintenance/verifyUserTraits.ts
  ```

---

### Health Checks

Verify job system health:

```bash
# 1. List all jobs (should show all jobs)
pnpm jobs:run

# 2. Test single user job
pnpm jobs:run match-scores --userId=8

# 3. Check data consistency
tsx scripts/maintenance/verifyUserTraits.ts
tsx scripts/maintenance/verifyQuizTraits.ts

# 4. Validate statistics
pnpm jobs:run stats-reconcile
```

---

## Best Practices

### 1. Test Before Batch

Always test jobs on a single user first:

```bash
# Test
pnpm jobs:run match-scores --userId=8

# Then batch
pnpm jobs:run match-scores --batchSize=100
```

### 2. Start Conservative

Begin with small batches and long pauses:

```bash
pnpm jobs:run match-scores --batchSize=50 --pauseMs=100
```

Tune up based on performance monitoring.

### 3. Monitor First Run

Watch the first batch run closely:
- Check logs for errors
- Monitor database load
- Verify results

### 4. Use Off-Peak Hours

Schedule heavy jobs during low-traffic times:
- Nightly (2am-6am)
- Weekends
- Avoid peak hours (9am-9pm)

### 5. Maintain Job Order

Respect job dependencies:
```bash
# Correct order
pnpm jobs:run build-user-traits
pnpm jobs:run match-scores
pnpm jobs:run compatibility

# Wrong: scores need traits first
pnpm jobs:run match-scores  # ❌ Will have incomplete data
pnpm jobs:run build-user-traits
```

### 6. Keep Jobs Updated

After algorithm changes:
```bash
# Recompute affected jobs
pnpm jobs:run match-scores --batchSize=100
pnpm jobs:run compatibility --batchSize=100
```

### 7. Regular Cleanup

Schedule periodic cleanup jobs:
```bash
# Weekly cleanup routine
pnpm jobs:run feed-presort-cleanup
pnpm jobs:run media-orphan-cleanup
pnpm jobs:run stats-reconcile
```

### 8. Document Job Runs

Keep a log of major job operations:
```bash
# Example log entry
echo "$(date): Running match score recompute after algorithm update v2.1" >> jobs.log
pnpm jobs:run match-scores --batchSize=100 | tee -a jobs.log
```

### 9. Version Control

Use environment variables for algorithm versions:
```bash
MATCH_ALGO_VERSION=v2 pnpm jobs:run match-scores
```

This enables gradual rollouts and A/B testing.

### 10. Backup Before Major Changes

Before running jobs after major changes:
```bash
# Backup database
pg_dump mydb > backup_$(date +%Y%m%d).sql

# Run jobs
pnpm jobs:run match-scores --batchSize=100
```

---

## Quick Reference

### Job Execution Patterns

```bash
# New user onboarding
pnpm jobs:run build-user-traits --userId={id}
pnpm jobs:run match-scores --userId={id}
pnpm jobs:run profile-search-index --userId={id}
pnpm jobs:run feed-presort --userId={id}

# Algorithm update deployment
pnpm jobs:run match-scores --batchSize=100
pnpm jobs:run compatibility --batchSize=100
pnpm jobs:run profile-search-index --userBatchSize=100

# Daily maintenance
pnpm jobs:run searchable-user
pnpm jobs:run trending
pnpm jobs:run content-features

# Weekly maintenance
pnpm jobs:run feed-presort-cleanup
pnpm jobs:run media-orphan-cleanup
pnpm jobs:run stats-reconcile

# Emergency fix
pnpm jobs:run stats-reconcile
tsx scripts/maintenance/backfillStats.ts
tsx scripts/maintenance/verifyUserTraits.ts
```

---

## Additional Resources

- **[Jobs Technical README](../backend/scripts/jobs/README.md)** - Detailed job documentation
- **[Scripts Usage Guide](./scripts-usage-guide.md)** - Complete scripts reference
- **[Job Context Pattern](./job-context-pattern.md)** - Job execution context and logging
- **[Job Worker System](./job-worker-system.md)** - Worker architecture

---

## Summary

The job system is the engine that keeps the platform running smoothly:

- **17 jobs** covering matching, search, feed, and maintenance
- **Flexible execution** via CLI, cron, or worker processes
- **Batch processing** with tunable performance parameters
- **Production-ready** with monitoring and error handling

**Key Takeaways**:
1. Test with single users before batch processing
2. Respect job dependencies (traits → scores → compatibility)
3. Tune batch sizes and pauses for your database
4. Schedule jobs during off-peak hours
5. Monitor first runs closely
6. Keep cleanup jobs running regularly

---

**Last Updated**: January 2026  
**Maintained By**: Development Team  
**Questions?**: See [Jobs README](../backend/scripts/jobs/README.md) for technical details
