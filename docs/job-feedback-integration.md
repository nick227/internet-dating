# Live Job Feedback - Integration Guide

## Overview

This guide shows how to add live feedback, progress tracking, and outcome summaries to your background jobs using the `JobLogger` system.

## What You Get

**Before:**
```
Status: RUNNING
Progress: 45%
```

**After:**
```
Status: RUNNING  
Stage: "Scoring users"
Progress: "Scoring users (1,250 / 5,000)" - 25%
Live Logs:
  [MILESTONE] Starting: Scoring users
  [INFO] Will process 5,000 users
  [INFO] Batch 1-500 complete (avg score: 0.72)
  [WARNING] User 1234 has no quiz data, skipping
  [MILESTONE] Phase 1 complete: 2,500 users scored
Outcome: 
  - Processed: 5,000 users
  - Updates: 4,850
  - Skipped: 150
  - Warnings: 150
  - Duration: 2m 34s
```

---

## Quick Start

### 1. Import JobLogger

```typescript
import { createJobLogger } from '../lib/jobs/jobLogger.js';
```

### 2. Create Logger Instance

```typescript
// In your job's run function
export async function runMyJob(options: MyJobOptions) {
  const logger = createJobLogger(jobRunId, 'my-job-name');
  
  try {
    // Your job logic here...
    
  } finally {
    await logger.logSummary(); // Always log summary at end
  }
}
```

### 3. Add Progress Tracking

```typescript
// Set total entities (enables percentage calculation)
await logger.setTotal(users.length, 'users');

// Set current stage
await logger.setStage('Scoring users');

// Increment progress as you process
for (const user of users) {
  await processUser(user);
  await logger.incrementProgress();
}
```

### 4. Add Structured Logging

```typescript
// Info messages
await logger.info(`Processing batch ${batchNumber}`, { batchSize: 500 });

// Milestones (important progress points)
await logger.milestone('Phase 1 complete', { usersScored: 2500 });

// Warnings
await logger.warning(`User ${userId} has no quiz data, skipping`, { userId });

// Errors (non-fatal)
await logger.error(`Failed to process user ${userId}`, { userId, error: err.message });
```

### 5. Track Outcomes

```typescript
// Track what your job accomplishes
logger.addOutcome('updates', 1);    // Increments updates count
logger.addOutcome('inserts', 5);    // Increments inserts count
logger.addOutcome('deletes', 2);    // Increments deletes count
logger.addOutcome('skipped', 1);    // Custom outcome type

// Final summary automatically includes all outcomes
await logger.logSummary();
```

---

## Complete Example: Match Score Job

Here's how to integrate JobLogger into the match-scores job:

```typescript
import { createJobLogger } from '../lib/jobs/jobLogger.js';

export async function runMatchScoreJobWithFeedback(options: MatchScoreJobOptions) {
  const jobRunId = options.jobRunId; // Passed from runJob()
  const logger = createJobLogger(jobRunId, 'match-scores');
  
  try {
    // ===== STAGE 1: Setup =====
    await logger.setStage('Initializing', 'Loading configuration');
    
    const config = buildConfig(options);
    await logger.info('Configuration loaded', { 
      algorithmVersion: config.algorithmVersion,
      weights: config.weights 
    });
    
    // ===== STAGE 2: Fetch Users =====
    await logger.setStage('Fetching users');
    
    const users = options.userId
      ? await fetchSingleUser(options.userId)
      : await fetchAllUsers(config.userBatchSize);
    
    await logger.setTotal(users.length, 'users');
    await logger.milestone(`Loaded ${users.length} users to process`);
    
    // ===== STAGE 3: Process Each User =====
    await logger.setStage('Scoring users');
    
    let totalScoresComputed = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      try {
        const scores = await computeScoresForUser(user, config);
        
        if (scores.length === 0) {
          totalSkipped++;
          await logger.warning(`No valid candidates for user ${user.userId}`, {
            userId: user.userId.toString()
          });
          logger.addOutcome('skipped', 1);
        } else {
          await saveScores(user.userId, scores);
          totalScoresComputed += scores.length;
          logger.addOutcome('updates', scores.length);
        }
        
        // Update progress
        await logger.incrementProgress(1);
        
        // Log batch milestones
        if ((i + 1) % 100 === 0) {
          await logger.info(`Batch ${i + 1}/${users.length} complete`, {
            avgScoresPerUser: totalScoresComputed / (i + 1),
            skippedCount: totalSkipped
          });
        }
        
      } catch (err) {
        await logger.error(`Failed to process user ${user.userId}`, {
          userId: user.userId.toString(),
          error: err instanceof Error ? err.message : String(err)
        });
        logger.addOutcome('errors', 1);
      }
      
      // Pause between users
      if (config.pauseMs > 0 && i < users.length - 1) {
        await sleep(config.pauseMs);
      }
    }
    
    // ===== STAGE 4: Finalize =====
    await logger.setStage('Finalizing');
    
    await logger.milestone('All users processed', {
      totalUsers: users.length,
      totalScores: totalScoresComputed,
      totalSkipped
    });
    
    // Log final summary with all outcomes
    await logger.logSummary();
    
  } catch (err) {
    await logger.error('Job failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    throw err;
  }
}
```

### What This Produces

**Live Progress Updates:**
```
Stage: "Initializing"
Progress: "Initializing (loading configuration)"

Stage: "Fetching users"  
Progress: "Fetching users (fetching from database)"

Stage: "Scoring users"
Progress: "Scoring users (1,250 / 5,000)" - 25%

Stage: "Finalizing"
Progress: "Finalizing (saving results)" - 100%
```

**Live Logs (visible in UI):**
```
[MILESTONE] Starting: Initializing
[INFO] Configuration loaded { algorithmVersion: "v1", ... }
[MILESTONE] Starting: Fetching users
[MILESTONE] Loaded 5,000 users to process
[MILESTONE] Starting: Scoring users
[INFO] Batch 100/5,000 complete { avgScoresPerUser: 47.3, ... }
[WARNING] No valid candidates for user 1234 { userId: "1234" }
[INFO] Batch 200/5,000 complete { avgScoresPerUser: 48.1, ... }
[ERROR] Failed to process user 5678 { userId: "5678", error: "..." }
[INFO] Batch 500/5,000 complete { avgScoresPerUser: 49.2, ... }
[MILESTONE] All users processed { totalUsers: 5000, ... }
[MILESTONE] Completed in 2m 34s | Processed: 5,000 entities | Updates: 235,750 | Skipped: 150 | Errors: 2 | Warnings: 150
```

**Final Outcome Summary:**
```json
{
  "entitiesProcessed": 5000,
  "entitiesTotal": 5000,
  "outcomeSummary": {
    "updates": 235750,
    "skipped": 150,
    "errors": 2,
    "warnings": 150
  }
}
```

---

## JobLogger API Reference

### Stage Management

```typescript
// Set current stage (major phase of work)
await logger.setStage(stage: string, message?: string): Promise<void>

// Examples:
await logger.setStage('Scanning database');
await logger.setStage('Processing batch 1', 'Computing scores');
await logger.setStage('Saving results');
```

### Progress Tracking

```typescript
// Set total entities (enables percentage calculation)
await logger.setTotal(total: number, entityType?: string): Promise<void>

// Increment progress by N (default 1)
await logger.incrementProgress(count?: number, message?: string): Promise<void>

// Set progress directly (for batch operations)
await logger.setProgress(current: number, message?: string): Promise<void>

// Examples:
await logger.setTotal(5000, 'users');
await logger.incrementProgress(); // +1
await logger.incrementProgress(100, 'Batch complete'); // +100
await logger.setProgress(2500, 'Halfway done'); // Set to 2500
```

### Structured Logging

```typescript
// Debug messages (verbose, not shown in UI by default)
await logger.debug(message: string, context?: object): Promise<void>

// Info messages (general progress info)
await logger.info(message: string, context?: object): Promise<void>

// Milestones (important progress points, highlighted in UI)
await logger.milestone(message: string, context?: object): Promise<void>

// Warnings (non-fatal issues)
await logger.warning(message: string, context?: object): Promise<void>

// Errors (failures that don't stop the job)
await logger.error(message: string, context?: object): Promise<void>

// Examples:
await logger.debug('Fetching user data', { userId: 123 });
await logger.info('Batch processed', { batchSize: 500, avgScore: 0.72 });
await logger.milestone('Phase 1 complete', { entitiesProcessed: 2500 });
await logger.warning('Missing quiz data', { userId: 456 });
await logger.error('Failed to save', { userId: 789, error: err.message });
```

### Outcome Tracking

```typescript
// Add to outcome counters
logger.addOutcome(key: string, count: number): void

// Common outcome types:
logger.addOutcome('updates', 1);     // Records updated
logger.addOutcome('inserts', 1);     // Records inserted
logger.addOutcome('deletes', 1);     // Records deleted
logger.addOutcome('skipped', 1);     // Records skipped
logger.addOutcome('errors', 1);      // Errors encountered
logger.addOutcome('warnings', 1);    // Warnings encountered

// Custom outcomes:
logger.addOutcome('indexed', 1);     // Records indexed
logger.addOutcome('cached', 1);      // Records cached
logger.addOutcome('merged', 1);      // Records merged
logger.addOutcome('validated', 1);   // Records validated

// Save outcomes to database (done automatically by logSummary)
await logger.saveOutcome(): Promise<void>
```

### Summary & Finalization

```typescript
// Log final summary with all outcomes and duration
// ⚠️ ALWAYS call this at the end of your job
await logger.logSummary(): Promise<void>

// Get elapsed time (useful for custom summaries)
logger.getElapsedMs(): number

// Example:
try {
  // ... job logic ...
} finally {
  await logger.logSummary(); // Always runs, even on error
}
```

---

## Patterns for Different Job Types

### Pattern 1: Known Total (Users, Records, Files)

**Use when:** You know upfront how many entities you'll process

```typescript
const users = await fetchUsers();
await logger.setTotal(users.length, 'users');
await logger.setStage('Processing users');

for (const user of users) {
  await processUser(user);
  await logger.incrementProgress();
  logger.addOutcome('updates', 1);
}
```

**Produces:** "Processing users (1,250 / 5,000)" - 25%

---

### Pattern 2: Unknown Total (Streaming, Discovery)

**Use when:** You discover entities as you go

```typescript
await logger.setStage('Scanning for orphaned files');

let found = 0;
for await (const file of scanDirectory()) {
  await processFile(file);
  found++;
  await logger.incrementProgress();
  logger.addOutcome('deletes', 1);
  
  if (found % 100 === 0) {
    await logger.info(`Found ${found} orphaned files so far`);
  }
}
```

**Produces:** "Scanning for orphaned files (1,250 processed)"

---

### Pattern 3: Multi-Phase Jobs

**Use when:** Job has distinct stages with different totals

```typescript
// Phase 1: Fetch
await logger.setStage('Fetching data');
const data = await fetchData();
await logger.milestone(`Fetched ${data.length} records`);

// Phase 2: Process (set new total for this phase)
await logger.setTotal(data.length, 'records');
await logger.setStage('Processing records');
for (const record of data) {
  await processRecord(record);
  await logger.incrementProgress();
}

// Phase 3: Finalize
await logger.setStage('Saving results');
await saveResults();
await logger.milestone('Results saved successfully');
```

**Produces:** 
- "Fetching data"
- "Processing records (500 / 1,000)" - 50%
- "Saving results"

---

### Pattern 4: Batch Processing

**Use when:** Processing in chunks/batches

```typescript
const users = await fetchUsers();
await logger.setTotal(users.length, 'users');
await logger.setStage('Processing in batches');

const batchSize = 500;
for (let i = 0; i < users.length; i += batchSize) {
  const batch = users.slice(i, i + batchSize);
  
  await processBatch(batch);
  
  // Update progress by batch size
  await logger.incrementProgress(batch.length);
  await logger.info(`Batch ${Math.floor(i / batchSize) + 1} complete`, {
    processed: i + batch.length,
    total: users.length
  });
}
```

**Produces:** "Processing in batches (2,500 / 10,000)" - 25%

---

### Pattern 5: Cleanup/Reconciliation Jobs

**Use when:** No specific entity count, just actions taken

```typescript
await logger.setStage('Scanning for stale records');

let deleted = 0;
let errors = 0;

while (true) {
  const staleRecords = await findStaleRecords(100);
  if (staleRecords.length === 0) break;
  
  for (const record of staleRecords) {
    try {
      await deleteRecord(record);
      deleted++;
      logger.addOutcome('deletes', 1);
    } catch (err) {
      errors++;
      await logger.warning(`Failed to delete record ${record.id}`, {
        recordId: record.id,
        error: err.message
      });
    }
  }
  
  await logger.info(`Deleted ${deleted} stale records so far`);
  await logger.incrementProgress(staleRecords.length);
}

await logger.milestone(`Cleanup complete: ${deleted} records deleted, ${errors} errors`);
```

**Produces:** "Scanning for stale records (1,250 processed)"

---

## Best Practices

### ✅ DO

1. **Always call `logger.logSummary()` at the end**
   ```typescript
   try {
     // ... job logic ...
   } finally {
     await logger.logSummary(); // Always runs
   }
   ```

2. **Set meaningful stages**
   ```typescript
   await logger.setStage('Fetching users');
   await logger.setStage('Computing scores');
   await logger.setStage('Saving results');
   ```

3. **Use structured context in logs**
   ```typescript
   await logger.info('Batch complete', { 
     batchNumber: 5,
     recordsProcessed: 500,
     avgScore: 0.72 
   });
   ```

4. **Track both successes and failures**
   ```typescript
   logger.addOutcome('updates', successCount);
   logger.addOutcome('skipped', skipCount);
   logger.addOutcome('errors', errorCount);
   ```

5. **Log milestones at key points**
   ```typescript
   await logger.milestone('Phase 1 complete', { processed: 2500 });
   ```

### ❌ DON'T

1. **Don't spam logs**
   ```typescript
   // BAD - logs every entity
   for (const user of users) {
     await logger.info(`Processing user ${user.id}`); // Too many logs!
   }
   
   // GOOD - log batches
   for (let i = 0; i < users.length; i++) {
     if (i % 100 === 0) {
       await logger.info(`Batch ${i/100} complete`);
     }
   }
   ```

2. **Don't fake progress percentages**
   ```typescript
   // BAD - lying about progress
   await logger.setTotal(100, 'entities');
   await logger.incrementProgress(50); // But only processed 20
   
   // GOOD - accurate counts
   await logger.setTotal(users.length, 'users');
   for (const user of users) {
     await processUser(user);
     await logger.incrementProgress(); // Accurate
   }
   ```

3. **Don't set stage without meaningful work**
   ```typescript
   // BAD - too granular
   await logger.setStage('Opening database connection');
   await logger.setStage('Starting transaction');
   await logger.setStage('Fetching first record');
   
   // GOOD - meaningful phases
   await logger.setStage('Initializing');
   await logger.setStage('Processing data');
   await logger.setStage('Finalizing');
   ```

4. **Don't forget error handling**
   ```typescript
   // BAD - errors lost
   try {
     await processUser(user);
   } catch (err) {
     // Silent failure, no logging
   }
   
   // GOOD - log errors
   try {
     await processUser(user);
   } catch (err) {
     await logger.error(`Failed to process user ${user.id}`, {
       userId: user.id,
       error: err.message
     });
     logger.addOutcome('errors', 1);
   }
   ```

---

## Migration Checklist

For each job you want to enhance:

- [ ] Import `createJobLogger`
- [ ] Create logger instance with `jobRunId` and `jobName`
- [ ] Identify major stages and add `setStage()` calls
- [ ] Add `setTotal()` if you know entity count upfront
- [ ] Add `incrementProgress()` in processing loops
- [ ] Add `milestone()` calls at key points
- [ ] Add `warning()` for non-fatal issues
- [ ] Add `error()` for failures
- [ ] Track outcomes with `addOutcome()`
- [ ] Add `logSummary()` in finally block
- [ ] Test in UI to verify logs appear live

---

## Testing Your Integration

1. **Enqueue job from admin UI**
2. **Watch live progress updates**
   - Stage should change as job progresses
   - Progress counter/percentage should update
   - Logs should appear in real-time

3. **Check job details after completion**
   - Outcome summary should show meaningful stats
   - Log history should tell the story of what happened
   - Warnings/errors should be visible

4. **Verify WebSocket updates**
   - Progress should update without page refresh
   - Logs should stream as they happen
   - Multiple admins should see same updates

---

## Next Steps

1. **Start with one job** - Pick a simple job to learn the pattern
2. **Add basic progress tracking** - Just stages and counters
3. **Add structured logging** - Milestones, warnings, errors
4. **Add outcome tracking** - What changed, how many
5. **Iterate and refine** - Adjust based on what's useful

The system is designed to be **incrementally adoptable** - you can add as much or as little feedback as makes sense for each job.

---

## Summary

**JobLogger gives you:**
- 📊 Real-time progress tracking
- 📝 Structured, searchable logs
- 📈 Meaningful outcome summaries
- 🔴 Live updates via WebSocket
- 🎯 Adaptive to known/unknown totals
- 🛠️ Easy integration with existing jobs

**Result:** Background jobs that are **transparent, trustworthy, and self-explanatory**.
