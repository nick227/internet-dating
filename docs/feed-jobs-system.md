# Feed System Jobs Specification

## Overview

This document defines the background jobs that power the feed ranking system. Jobs precompute expensive scores and features, keeping API response times fast while enabling sophisticated personalization.

**Current State:**
- ✅ Match Score Job (implemented)
- ✅ Compatibility Job (implemented)
- ⚠️ Content Feature Job (needed)
- ⚠️ Trending Job (needed)
- ⚠️ User Affinity Job (needed)

---
## Scope Boundaries (Must-Fix)
These are non-negotiable to prevent drift and feedback loops.

**MatchScore = discovery only**
- Inputs: quiz, interests, prefs, proximity.
- Excludes behavioral signals (messages, views, engagement).

**UserCompatibility = relationship only**
- Inputs: messages, profile views, mutual engagement.
- Does not affect discovery.

---

## Job 1: Match Score Job ✅

**Status:** Implemented  
**Entry Point:** `backend/scripts/recomputeMatchScores.ts`  
**Core Logic:** `backend/src/jobs/matchScoreJob.ts`

### Purpose
Precompute user-to-user compatibility scores for match suggestions. Determines which users should be shown as potential matches in the feed.

### What It Computes
```typescript
MatchScore {
  viewerUserId: string    // Who is viewing
  candidateUserId: string // Who might be a match
  score: float           // 0-1 compatibility
  reasons: string[]      // ["shared_interest_hiking", "quiz_compatible_75"]
  computedAt: timestamp
  algorithmVersion: string
}
```

### Scoring Factors
- **Quiz compatibility:** Vector similarity on personality/preference responses
- **Interest overlap:** Jaccard index on shared hobbies/tags
- **Geographic proximity:** Distance decay scoring
- **Demographic alignment:** Age preferences, relationship goals
- **Mutual preferences:** Both users meet each other's criteria
**Excluded:** messages, profile views, engagement (belongs to UserCompatibility)

### Frequency
- **Base:** Every 6-24 hours
- **Invalidation triggers:**
  - User updates profile (photos, bio, preferences)
  - User completes/updates quiz responses
  - User location changes >50 miles
  - Score age exceeds TTL (24h default, 7d max)

### Configuration
```typescript
{
  batchSize: 100,        // Users per batch
  candidateBatchSize: 50, // Candidates per user batch
  pauseBetweenBatches: 100, // ms
  ttl: 24 * 60 * 60 * 1000  // 24 hours
}
```

### Schema
```prisma
model MatchScore {
  id              String   @id @default(cuid())
  viewerUserId    String
  candidateUserId String
  score           Float
  reasons         Json
  computedAt      DateTime @default(now())
  algorithmVersion String
  
  viewer    User @relation("MatchScoreViewer", fields: [viewerUserId], references: [id])
  candidate User @relation("MatchScoreCandidate", fields: [candidateUserId], references: [id])
  
  @@unique([viewerUserId, candidateUserId])
  @@index([viewerUserId, score])
  @@index([candidateUserId])
  @@index([computedAt])
}
```

---

## Job 2: Compatibility Job ✅

**Status:** Implemented  
**Entry Point:** `backend/scripts/recomputeCompatibility.ts`  
**Core Logic:** `backend/src/jobs/compatibilityJob.ts`

### Purpose
Compute viewer-to-target compatibility for existing relationships and top suggestions. Similar to Match Score but focused on ongoing connections.

### What It Computes
```typescript
UserCompatibility {
  viewerUserId: string
  targetUserId: string
  score: float
  factors: Json  // Breakdown of compatibility factors
  computedAt: timestamp
}
```

### Scoring Factors
- **Communication patterns:** Message frequency, response time
- **Interaction history:** Likes, profile views, engagement
- **Mutual interest strength:** How both users engage with shared topics
- **Relationship trajectory:** Progression of connection over time
**Excluded:** discovery inputs (prefs/proximity) to avoid feedback loops

### Frequency
- **Base:** Daily (3am)
- **Scope:** Active relationships + high-scoring potential matches

### Configuration
```typescript
{
  batchSize: 100,
  targetBatchSize: 50,
  pauseBetweenBatches: 100,
  minScoreThreshold: 0.3  // Only compute for promising matches
}
```

### Schema
```prisma
model UserCompatibility {
  id           String   @id @default(cuid())
  viewerUserId String
  targetUserId String
  score        Float
  factors      Json
  computedAt   DateTime @default(now())
  
  viewer User @relation("CompatibilityViewer", fields: [viewerUserId], references: [id])
  target User @relation("CompatibilityTarget", fields: [targetUserId], references: [id])
  
  @@unique([viewerUserId, targetUserId])
  @@index([viewerUserId, score])
  @@index([computedAt])
}
```

---

## Job 3: Content Feature Extraction ⚠️

**Status:** Needed  
**Entry Point:** `backend/scripts/recomputeContentFeatures.ts` (to create)  
**Core Logic:** `backend/src/jobs/contentFeatureJob.ts` (to create)

### Purpose
Extract content features from posts to enable content-based ranking and filtering.
Runs on post creation and for batch recomputation.

### What It Computes
```typescript
PostFeatures {
  postId: string
  topics: string[]      // Extracted tags/categories
  sentiment: float      // -1 (negative) to 1 (positive)
  quality: float        // 0 (low) to 1 (high)
  nsfw: boolean         // Safety flag
  embeddings: float[]   // Vector for similarity search
  visualFeatures: Json  // For image posts (optional)
  computedAt: timestamp
}
```

### V1 Scope (Required)
- topics (manual tags or simple keyword extraction)
- quality (heuristics: text length, media count, report count)
- nsfw (binary flag; external service ok)

### V2+ (Deferred)
- embeddings
- sentiment
- vision models / aesthetic scoring

### Frequency
- **Real-time:** On post creation (webhook triggered)
- **Batch:** Hourly for backfill/recomputation
- **Manual:** For algorithm updates

### Configuration
```typescript
{
  batchSize: 50,          // Posts per batch
  includeImages: true,    // Enable image analysis
  embeddingModel: 'all-MiniLM-L6-v2',
  nsfwThreshold: 0.8,     // Confidence threshold
  qualityThreshold: 0.3   // Minimum quality score
}
```

### Schema
```prisma
model PostFeatures {
  id        String   @id @default(cuid())
  postId    String   @unique
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  
  topics    String[] // Extracted tags
  sentiment Float?   // -1 to 1
  quality   Float?   // 0 to 1
  nsfw      Boolean  @default(false)
  
  embeddings      Json? // Vector for similarity
  visualFeatures  Json? // Image-specific features
  
  computedAt DateTime @default(now())
  
  @@index([postId])
  @@index([quality])
  @@index([nsfw])
}
```

---

## Job 4: Trending & Popularity Scoring ⚠️

**Status:** Needed  
**Entry Point:** `backend/scripts/recomputeTrending.ts` (to create)  
**Core Logic:** `backend/src/jobs/trendingJob.ts` (to create)

### Purpose
Identify trending content and compute popularity scores. Powers viral content discovery and cold start recommendations.

### Candidate Gate (Required)
Trending should **not** scan all posts. Only consider:
- posts created in last **N hours** (default 48)
- posts with **≥ minEngagements**

### What It Computes
```typescript
TrendingScore {
  postId: string
  popularity: float      // Total engagement weighted by recency
  velocity: float        // Engagement per minute
  peakTime: timestamp    // When trending started
  decayMultiplier: float // How fast score should fade
  computedAt: timestamp
  expiresAt: timestamp   // 24-48h TTL
}
```

### Scoring Logic
```typescript
// Popularity: weighted sum of engagements
popularity = 
  (likes * 1.0) + 
  (comments * 2.0) + 
  (shares * 3.0) + 
  (profileViews * 0.5)
  * ageDecayFactor

// Velocity: engagement rate in first N hours
velocity = totalEngagements / hoursSinceCreation

// Trending threshold
isTrending = velocity > (avgVelocity * 2.0)
```

### Frequency
- **Base:** Every 15 minutes
- **High priority:** For posts <24 hours old
- **Cleanup:** Remove scores >48 hours old

### Configuration
```typescript
{
  windowHours: 24,        // Look back period
  velocityWindow: 1,      // Hours for velocity calc
  trendingMultiplier: 2.0, // Threshold factor
  expiryHours: 48,        // Score TTL
  minEngagements: 5       // Min for trending consideration
}
```

### Schema
```prisma
model TrendingScore {
  id        String   @id @default(cuid())
  postId    String   @unique
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  
  popularity Float   @default(0)  // Total weighted engagement
  velocity   Float   @default(0)  // Engagement per minute
  peakTime   DateTime?            // When it started trending
  
  computedAt DateTime @default(now())
  expiresAt  DateTime             // 24-48h TTL
  
  @@index([popularity])
  @@index([velocity])
  @@index([expiresAt])
  @@index([computedAt])
}
```

---

## Job 5: User Affinity Profile ⚠️

**Status:** Needed  
**Entry Point:** `backend/scripts/recomputeAffinity.ts` (to create)  
**Core Logic:** `backend/src/jobs/userAffinityJob.ts` (to create)

### Purpose
Build user preference profiles from interaction history. Enables personalized content ranking beyond match scores.

### What It Computes
```typescript
UserAffinityProfile {
  userId: string
  
  topCreators: Array<{     // Top 20 creators
    userId: string
    weight: float          // 0-1
  }>
  
  topTopics: Array<{       // Top 30 topics
    tag: string
    weight: float
  }>
  
  contentTypePreferences: {
    photos: float          // 0-1 preference scores
    text: float
    polls: float
    videos: float
  }
  
  engagementVelocity: float  // How active they are
  explorationFactor: float   // Diversity of interests (0-1)
  
  computedAt: timestamp
}
```

### Analysis Process
1. **Interaction Aggregation**
   - Collect all likes, comments, shares, views (last 90 days)
   - Weight recent interactions higher
   - Filter out low-quality signals (accidental clicks)

2. **Creator Affinity**
   - Identify top creators by interaction frequency
   - Normalize by creator's total audience
   - Compute TF-IDF style weights

3. **Topic Extraction**
   - Aggregate topics from engaged content
   - Weight by engagement type (share > like > view)
   - Cluster into top themes

4. **Behavioral Metrics**
   - Velocity: actions per day
   - Exploration: diversity of engaged content
   - Preferences: content type distribution

### Frequency
- **Base:** Daily (3am)
- **Incremental:** Update on significant behavior change (100+ new actions)

### Configuration
```typescript
{
  lookbackDays: 90,          // History window
  minInteractions: 10,       // Min for profile creation
  topCreatorsCount: 20,
  topTopicsCount: 30,
  recencyDecayFactor: 0.95   // Exponential decay per day
}
```

### Schema
```prisma
model UserAffinityProfile {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  topCreators Json  // Array<{userId: string, weight: float}>
  topTopics   Json  // Array<{tag: string, weight: float}>
  
  contentTypePrefs Json // {photos: 0.6, text: 0.3, polls: 0.1}
  
  engagementVelocity Float @default(0) // Actions per day
  explorationFactor  Float @default(0.5) // Diversity 0-1
  
  computedAt DateTime @default(now())
  
  @@index([userId])
  @@index([computedAt])
}
```

---

## Job Tracking Schema

All jobs log execution to `JobRun` table:

```prisma
model JobRun {
  id        String   @id @default(cuid())
  jobName   String   // 'match-score', 'trending', etc.
  status    JobStatus // RUNNING, SUCCESS, FAILED
  trigger   JobTrigger // CRON, EVENT, MANUAL
  
  scope     Json?    // {userIds: [...], filters: {...}}
  
  startedAt  DateTime @default(now())
  completedAt DateTime?
  duration   Int?     // milliseconds
  
  itemsProcessed Int?
  itemsFailed    Int?
  
  algorithmVersion String?
  error            String? @db.Text
  metadata         Json?   // Job-specific data
  
  @@index([jobName, startedAt])
  @@index([status])
}

enum JobStatus {
  RUNNING
  SUCCESS
  FAILED
}

enum JobTrigger {
  CRON
  EVENT
  MANUAL
}
```

---

## Job Scheduling

### Recommended Schedule

**Real-Time (Webhook Triggered)**
- Content Feature Extraction (on post creation)
- Match Score Invalidation (on profile update)

**Every 15 Minutes**
- Trending Job

**Every 6 Hours**
- Match Score Job (event-driven for active users only)

**Nightly**
- Match Score Job (full recompute for all users)

**Daily (3am)**
- Compatibility Job
- User Affinity Job

**Weekly (Sunday 2am)**
- Data cleanup (expire old JobRun records)
- Analytics aggregation

### Implementation Options

#### Option A: Simple Cron (Railway/Vercel)
```typescript
// backend/src/scheduler/index.ts
import cron from 'node-cron';

// Every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  await runJob('trending', runTrendingJob);
});

// Every 6 hours
cron.schedule('0 */6 * * *', async () => {
  await runJob('match-score', runMatchScoreJob);
});

// Daily at 3am
cron.schedule('0 3 * * *', async () => {
  await runJob('compatibility', runCompatibilityJob);
  await runJob('user-affinity', runUserAffinityJob);
});
```

#### Option B: Job Queue (BullMQ)
```typescript
// backend/src/lib/jobs/queue.ts
import Queue from 'bull';

const jobQueue = new Queue('feed-jobs', process.env.REDIS_URL);

// Add repeating jobs
jobQueue.add('trending', {}, { 
  repeat: { cron: '*/15 * * * *' }
});

jobQueue.add('match-score', {}, { 
  repeat: { cron: '0 */6 * * *' }
});

// Process jobs
jobQueue.process('trending', async (job) => {
  await runJob('trending', runTrendingJob);
});

jobQueue.process('match-score', async (job) => {
  await runJob('match-score', runMatchScoreJob);
});
```

---

## Job CLI

Unified command-line interface for running jobs:

```typescript
// backend/scripts/runJob.ts
import { Command } from 'commander';

const program = new Command();

program
  .command('match-scores')
  .option('--batch-size <n>', 'Batch size', '100')
  .option('--user-id <id>', 'Run for specific user')
  .action(async (opts) => {
    await runMatchScoreJob({
      batchSize: parseInt(opts.batchSize),
      userId: opts.userId
    });
  });

program
  .command('content-features')
  .option('--post-id <id>', 'Process specific post')
  .action(async (opts) => {
    await runContentFeatureJob({
      postId: opts.postId
    });
  });

program
  .command('trending')
  .action(async () => {
    await runTrendingJob();
  });

program
  .command('affinity')
  .option('--user-id <id>', 'Run for specific user')
  .action(async (opts) => {
    await runUserAffinityJob({
      userId: opts.userId
    });
  });

program
  .command('all')
  .description('Run all jobs sequentially')
  .action(async () => {
    console.log('Running all jobs...');
    await runMatchScoreJob();
    await runCompatibilityJob();
    await runContentFeatureJob();
    await runTrendingJob();
    await runUserAffinityJob();
    console.log('All jobs complete');
  });

program.parse();
```

**Usage:**
```bash
# Run specific jobs
tsx backend/scripts/runJob.ts match-scores --batch-size 50
tsx backend/scripts/runJob.ts trending
tsx backend/scripts/runJob.ts affinity --user-id user_123

# Run all jobs
tsx backend/scripts/runJob.ts all

# Run for specific scope
tsx backend/scripts/runJob.ts match-scores --user-id user_123
```

---

## Monitoring & Alerts

### Key Metrics Per Job

**Execution Metrics**
- Duration (p50, p95, p99)
- Success rate (last 24h)
- Items processed per run
- Error rate and types

**Data Quality Metrics**
- Score distribution (detect anomalies)
- Staleness (oldest uncomputed score)
- Coverage (% of users with fresh scores)

**Queue Metrics** (if using job queue)
- Queue depth
- Wait time
- Worker utilization

### Alert Conditions

```typescript
// After job completion
const alerts = [];

if (duration > SLA_THRESHOLD) {
  alerts.push(`Job ${jobName} took ${duration}ms (SLA: ${SLA_THRESHOLD}ms)`);
}

if (successRate < 0.95) {
  alerts.push(`Job ${jobName} success rate: ${successRate} (expected >0.95)`);
}

if (queueDepth > 1000) {
  alerts.push(`Job queue depth: ${queueDepth} (backlog detected)`);
}

// Send alerts
if (alerts.length > 0) {
  await sendSlackAlert(alerts.join('\n'));
}
```

---

## Migration Plan

### Week 1: Content Features
1. Add `PostFeatures` schema
2. Implement `contentFeatureJob.ts`
3. Create webhook trigger on post creation
4. Backfill existing posts
5. Test feature extraction quality

### Week 2: Trending
1. Add `TrendingScore` schema
2. Implement `trendingJob.ts`
3. Set up 15-minute cron
4. Integrate trending boost in feed API
5. Monitor score distribution

### Week 3: User Affinity
1. Add `UserAffinityProfile` schema
2. Implement `userAffinityJob.ts`
3. Set up daily cron
4. Use affinity in post ranking
5. A/B test impact on engagement

### Week 4: Production Hardening
1. Move all jobs to scheduled cron
2. Add comprehensive error handling
3. Set up monitoring/alerting
4. Document runbooks
5. Load test job execution

---

## Best Practices

### Job Design
- **Idempotent:** Safe to run multiple times
- **Resumable:** Can continue after interruption
- **Batched:** Process in chunks to control memory
- **Logged:** Write to JobRun for observability
- **Versioned:** Track algorithm changes

### Error Handling
```typescript
try {
  const result = await processBatch(batch);
  successCount += result.success;
} catch (error) {
  failedCount += 1;
  console.error(`Batch failed:`, error);
  // Continue processing other batches
}
```

### Performance
- Use database indexes for fast lookups
- Batch database writes (bulk insert)
- Add pauses between batches to avoid overwhelming DB
- Cache frequently accessed data (Redis)
- Use read replicas for heavy queries

### Performance Budgets (Required)
Each job spec must declare:
- max rows scanned
- max rows written
- expected runtime

Example:
```
TrendingJob {
  maxPostsScanned: 50_000
  maxRuntimeMs: 30_000
}
```

### Testing
```typescript
// backend/tests/jobs/matchScoreJob.test.ts
describe('Match Score Job', () => {
  it('computes scores for all users', async () => {
    await runMatchScoreJob({ batchSize: 10 });
    const scores = await getMatchScores(testUserId);
    expect(scores.length).toBeGreaterThan(0);
  });
  
  it('handles missing data gracefully', async () => {
    // Test with incomplete user profiles
  });
  
  it('respects TTL for invalidation', async () => {
    // Test score staleness logic
  });
});
```

---

## Summary

**Current Implementation:**
- ✅ Match Score Job
- ✅ Compatibility Job

**Immediate Priorities:**
1. Content Feature Extraction (blocking feed quality)
2. Trending Scores (needed for cold start)
3. User Affinity Profiles (improves personalization)

**Infrastructure:**
- Start with simple cron scheduling
- Migrate to job queue when scaling demands it
- Monitor job health and set up alerts

This job architecture enables sophisticated feed ranking while keeping request-time performance fast. Each job is independent, versioned, and observable.

---

## Negative Signals (Required)
These are first-class inputs for safety and ranking:
- **blocks**: permanent exclusion
- **reports**: hard exclusion
- **hides**: strong negative weight with long decay

Apply to:
- MatchScore hard filters
- Feed ranking hard filters
- User Affinity exclusions

## Signal Semantics (Required)
Do not conflate:
- **impression**: item rendered
- **seen**: item in viewport
- **action**: like/comment/share
- **negative action**: hide/block/report

Affinity must weight these separately to avoid poisoning scores.

## Freshness & Penalties (Baseline Formula)
At minimum, document placeholder math:
```
postFreshnessBoost = 1 / log(2 + hoursSinceCreation)
seenPenalty = seen ? 1 : 0
// TODO: add count-based seen penalty once we track seen counts
```

## Feed Integration Rules
- Candidate cap per request (example):
  - posts: last N days or top 500
  - suggestions: top 200 MatchScores
- Feed ranking must never query raw engagement tables at request time.
- Transitional allowance (POC): feed may read Post/Profile directly until
  PostFeatures/Trending/Affinity jobs are live.
- Once jobs are live, feed should only read:
  - MatchScore
  - UserCompatibility
  - PostFeatures
  - TrendingScore
  - UserAffinityProfile
