# Job Groups and Dependencies

## Overview

The job system now supports **job groups** and **dependency management** to organize jobs logically and ensure they run in the correct order.

## Job Groups

Jobs are organized into 6 functional groups:

### 1. **matching** (Core Matching Algorithms)
Jobs that compute user traits and match scoring.

**Jobs:**
- `build-user-traits` - Build user traits from quiz results (foundation job)
- `match-scores` - Compute match scores between users
- `compatibility` - Compute compatibility scores between users

**Purpose:** Powers the matching algorithm and user recommendations.

**Dependencies:** `match-scores` and `compatibility` depend on `build-user-traits`.

---

### 2. **feed** (Content & Feed Management)
Jobs that power the user feed experience.

**Jobs:**
- `content-features` - Extract content features from posts
- `trending` - Compute trending scores for posts
- `affinity` - Compute user affinity profiles
- `feed-presort` - Presort feed segments for users

**Purpose:** Delivers personalized content to users.

**Dependencies:** 
- `trending` depends on `content-features`
- `feed-presort` depends on `match-scores`, `affinity`, and `content-features`

---

### 3. **search** (Search Infrastructure)
Jobs that build and maintain search indexes.

**Jobs:**
- `profile-search-index` - Build profile search index
- `user-interest-sets` - Build user interest sets
- `searchable-user` - Build searchable user snapshot
- `interest-relationships` - Build interest-to-interest relationships

**Purpose:** Enables fast, accurate profile and interest searches.

**Dependencies:** 
- `profile-search-index` and `searchable-user` depend on `build-user-traits`

---

### 4. **maintenance** (System Maintenance)
Jobs that clean up data and reconcile statistics.

**Jobs:**
- `stats-reconcile` - Reconcile statistics counters
- `media-orphan-cleanup` - Cleanup orphaned media files
- `feed-presort-cleanup` - Cleanup old feed presort data

**Purpose:** Keeps the system clean and data accurate.

**Dependencies:** None (independent maintenance tasks).

---

### 5. **media** (Media Processing)
Jobs that process and validate media files.

**Jobs:**
- `media-metadata` - Extract metadata for a single media file
- `media-metadata-batch` - Extract metadata for multiple media files

**Purpose:** Validates and enriches uploaded media.

**Dependencies:** None (event-driven, processes as media is uploaded).

---

### 6. **quiz** (Quiz Analytics)
Jobs that aggregate quiz data and statistics.

**Jobs:**
- `quiz-answer-stats` - Aggregate quiz answer statistics by demographics

**Purpose:** Provides insights into quiz responses.

**Dependencies:** None (aggregates existing quiz data).

---

## Dependency System

### How Dependencies Work

Jobs can declare **dependencies** on other jobs. The system ensures:
1. **Dependency jobs run first** - Jobs are enqueued in topological order
2. **Circular dependencies are detected** - System prevents invalid configurations
3. **Cross-group dependencies are supported** - A feed job can depend on a matching job

### Example: Feed Presort Dependency Chain

```
build-user-traits (matching)
  ↓
  ├─→ match-scores (matching)
  │     ↓
  └─→ affinity (feed)
        ↓
content-features (feed) ─→ feed-presort (feed)
        ↓
    trending (feed)
```

When you enqueue the **feed** group, the system automatically includes `build-user-traits` and `match-scores` from the **matching** group because they're dependencies.

---

## Using Groups and Dependencies

### 1. Enqueue All Jobs (Admin UI)

Click **"Bulk Enqueue"** → Select **"Enqueue All Jobs"**

This will:
- Enqueue all 17 jobs
- Resolve dependencies automatically
- Execute in the correct order

**Example Order:**
```
1. build-user-traits (no dependencies)
2. match-scores (depends on build-user-traits)
3. compatibility (depends on build-user-traits)
4. profile-search-index (depends on build-user-traits)
5. ... (continues in dependency order)
```

---

### 2. Enqueue by Group (Admin UI)

Click **"Bulk Enqueue"** → Select **"Enqueue Job Group"** → Choose a group

**Example: Enqueue "feed" Group**

This will enqueue:
```
1. build-user-traits (dependency from matching)
2. match-scores (dependency from matching)
3. content-features (feed group)
4. affinity (feed group)
5. trending (feed group, depends on content-features)
6. feed-presort (feed group, depends on match-scores, affinity, content-features)
```

**Note:** Dependencies outside the group are **automatically included**.

---

### 3. API Usage

#### Enqueue All Jobs

```typescript
POST /api/admin/jobs/enqueue-all
```

**Response:**
```json
{
  "status": "enqueued",
  "count": 17,
  "jobs": [
    { "jobName": "build-user-traits", "jobRunId": "123" },
    { "jobName": "match-scores", "jobRunId": "124" },
    ...
  ]
}
```

#### Enqueue by Group

```typescript
POST /api/admin/jobs/enqueue-group
{
  "group": "feed"
}
```

**Response:**
```json
{
  "status": "enqueued",
  "group": "feed",
  "count": 6,
  "jobs": [
    { "jobName": "build-user-traits", "jobRunId": "125", "group": "matching" },
    { "jobName": "match-scores", "jobRunId": "126", "group": "matching" },
    { "jobName": "content-features", "jobRunId": "127", "group": "feed" },
    ...
  ]
}
```

---

## Job Definitions Reference

All jobs now include:
```typescript
{
  name: string;
  description: string;
  group: JobGroup;
  dependencies: string[]; // Job names
  defaultParams?: Record<string, unknown>;
  examples: string[];
}
```

**Example:**
```typescript
export const feedPresortJob: JobDefinition = {
  name: 'feed-presort',
  description: 'Presort feed segments for users',
  group: 'feed',
  dependencies: ['match-scores', 'affinity', 'content-features'],
  defaultParams: {
    batchSize: 100,
    segmentSize: 20,
    maxSegments: 3,
    incremental: false
  },
  examples: [
    'tsx scripts/runJobs.ts feed-presort --userId=8 --batchSize=100 --segmentSize=20'
  ],
  run: async () => { ... }
};
```

---

## Best Practices

### 1. Run Groups, Not Individual Jobs

When rebuilding data, prefer **group enqueues** over individual jobs:

**✅ Good:**
```
Enqueue "matching" group → All matching jobs + dependencies
```

**❌ Avoid:**
```
Manually enqueue: build-user-traits, then match-scores, then compatibility
```

### 2. Use Groups for Maintenance Windows

Schedule group enqueues for low-traffic periods:

```typescript
// Cron job example
0 3 * * * // 3 AM daily
  - Enqueue "maintenance" group
  - Enqueue "search" group (if data changed)
```

### 3. Understand Cross-Group Dependencies

Some jobs have dependencies outside their group:
- `feed-presort` (feed) depends on `match-scores` (matching)
- `profile-search-index` (search) depends on `build-user-traits` (matching)

The system handles this automatically, but be aware for troubleshooting.

### 4. Monitor Dependency Chains

In the Admin UI, when enqueuing a group:
- View **all jobs that will be enqueued** (including dependencies)
- See **why each job is included** (member of group vs. dependency)

---

## Troubleshooting

### Circular Dependencies

If you see an error like:
```
Circular dependency detected: job-a -> job-b -> job-c -> job-a
```

**Cause:** Jobs form a dependency cycle.

**Solution:** Review job definitions and break the cycle. Dependencies must form a **directed acyclic graph (DAG)**.

---

### Missing Dependencies

If you see an error like:
```
Dependency not found: job-x (required by job-y)
```

**Cause:** A job declares a dependency that doesn't exist.

**Solution:** Fix the job definition or add the missing job.

---

### Jobs Not Running in Expected Order

**Cause:** Worker processes jobs sequentially from queue. If multiple workers are running, order may vary.

**Solution:** Ensure only one worker is active for strict ordering. View **Active Jobs** in Admin UI to see processing order.

---

## Technical Implementation

### Dependency Resolver

Located at: `backend/scripts/jobs/dependencyResolver.ts`

**Key Functions:**
- `resolveJobDependencies()` - Topological sort of all jobs
- `resolveJobsByGroup()` - Resolve jobs in a specific group with dependencies
- `getJobGroups()` - List all available groups
- `getJobGroupCounts()` - Count jobs per group

### Validation

Jobs are validated at startup:
- All dependencies must exist
- No circular dependencies
- All required fields present (name, description, examples)

---

## Summary

### Job Groups Quick Reference

| Group | Jobs | Purpose | Dependencies |
|-------|------|---------|--------------|
| **matching** | 3 | User traits & match scoring | None (foundation) |
| **feed** | 4 | Content features & feed presort | Depends on matching |
| **search** | 4 | Search indexes | Depends on matching |
| **maintenance** | 3 | Cleanup & reconciliation | None |
| **media** | 2 | Media processing | None |
| **quiz** | 1 | Quiz analytics | None |

### Key Benefits

✅ **Organized** - Jobs grouped by function  
✅ **Safe** - Dependencies prevent incorrect execution order  
✅ **Efficient** - Enqueue entire groups with one click  
✅ **Automatic** - Cross-group dependencies handled automatically  
✅ **Validated** - Circular dependencies detected at startup  

---

## Related Documentation

- [Job Manager UI Proposal](./job-manager-ui-proposal.md)
- [Job Worker System](./job-worker-system.md)
- [Job Feedback Integration](./job-feedback-integration.md)
- [Jobs README](../backend/scripts/jobs/README.md)
