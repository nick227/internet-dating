# Long-Running Job Analysis: What Happens If a Job Takes >1 Hour?

**Question:** What happens if a job is still running when the next schedule interval arrives?

**Answer:** The daemon will attempt to run the schedule again, but atomic locking provides partial protection. However, **there are still risks.**

---

## Current Behavior (Analyzed from Code)

### Daemon Loop Structure

```typescript
// File: backend/scripts/scheduleDaemon.ts
setInterval(async () => {
  try {
    await updateHeartbeat();
    await cleanupStalledLocks();
    await processSchedules();  // ← This can take a LONG time
  } catch (err) {
    console.error('❌ Error in daemon loop:', err);
  }
}, POLL_INTERVAL_MS);  // Default: 1 hour (3,600,000ms)
```

**Key Issue:** `setInterval` fires **regardless of whether the previous execution has completed.**

### Scenario Timeline

```
Time: 2:00am - Schedule "daily-full-sync" is due
  ↓
Daemon acquires lock on "daily-full-sync"
  ↓
Begins executing 20 jobs inline (sequentially)
  ↓
Jobs are running... (job 1, 2, 3, ..., slow job takes 50 minutes)
  ↓
Time: 3:00am - setInterval fires AGAIN (1 hour elapsed)
  ↓
Daemon attempts to process schedules AGAIN
  ↓
Tries to acquire lock on "daily-full-sync"
  ↓
Lock acquisition FAILS (already locked from 2am run)
  ↓
Daemon skips "daily-full-sync" (already processing)
  ↓
Time: 3:10am - Original 2am run finally completes
  ↓
Lock released, nextRunAt set to 2:00am tomorrow
```

---

## What Actually Happens: Step-by-Step

### 1. Long-Running Execution Starts (2:00am)

```typescript
// processSchedules() at 2:00am
const dueSchedules = await prisma.jobSchedule.findMany({
  where: {
    enabled: true,
    nextRunAt: { lte: now },
    lockedAt: null
  }
});

// Find: "daily-full-sync" (nextRunAt: 2:00am)
```

### 2. Lock Acquired (2:00am)

```typescript
// acquireLock("daily-full-sync")
const result = await prisma.jobSchedule.updateMany({
  where: {
    id: scheduleId,
    lockedAt: null  // ← ONLY update if unlocked
  },
  data: {
    lockedAt: new Date(),
    lockedBy: workerId
  }
});

// Success: result.count = 1
// Database now has: lockedAt = 2:00am, lockedBy = "schedule_daemon_xyz"
```

### 3. Jobs Execute Inline (2:00am - 3:10am)

```typescript
// executeScheduleInline() runs for 70 minutes
for (const job of jobs) {
  await runQueuedJob(jobRun.id);  // ← Synchronous, blocking
}
```

**Problem:** The `for` loop is **blocking**. The daemon is stuck here for 70 minutes.

### 4. Next Interval Fires (3:00am)

```typescript
// setInterval fires at 3:00am (1 hour after 2:00am)
setInterval(async () => {
  await updateHeartbeat();
  await cleanupStalledLocks();
  await processSchedules();  // ← Runs WHILE 2am execution still running
}, POLL_INTERVAL_MS);
```

**Critical:** This runs **concurrently** with the 2am execution still in progress.

### 5. Concurrent Execution Attempt (3:00am)

```typescript
// processSchedules() at 3:00am (2nd call, running in parallel)
const dueSchedules = await prisma.jobSchedule.findMany({
  where: {
    enabled: true,
    nextRunAt: { lte: now },
    lockedAt: null  // ← Looking for unlocked schedules
  }
});

// Find: "daily-full-sync" has nextRunAt = 2:00am (still in past)
//       BUT lockedAt = 2:00am, lockedBy = "schedule_daemon_xyz"
//       So it WON'T be returned by this query
```

**Result:** The schedule is **not found** because `lockedAt: null` is required.

### 6. Lock Acquisition Skipped (3:00am)

Since the schedule wasn't returned by the query, the daemon **skips it**.

```
[daemon] Found 0 due schedules
```

**Good:** No duplicate execution.

### 7. Original Execution Completes (3:10am)

```typescript
// processSchedules() from 2:00am finally finishes
await prisma.jobSchedule.update({
  where: { id: dbSchedule.id },
  data: {
    lastRunAt: now,  // 2:00am (when it started, NOT when it finished)
    nextRunAt: nextRun,  // 2:00am TOMORROW
    runCount: { increment: 1 },
    lockedAt: null,  // ← Lock released
    lockedBy: null
  }
});
```

**Problem:** `lastRunAt` is set to **2:00am**, not 3:10am when it actually finished.

---

## Risks and Edge Cases

### Risk #1: Overlapping Heartbeats/Cleanup

**Issue:** While the 2am execution is running, the 3am interval fires and runs:
- `updateHeartbeat()` ✅ Safe (just updates timestamp)
- `cleanupStalledLocks()` ⚠️ **DANGEROUS**
- `processSchedules()` ✅ Protected by lock

**Dangerous Scenario:**

```typescript
// At 3:00am, cleanupStalledLocks() runs
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const stalledThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);

// If 2am execution has been running >5 minutes...
await prisma.jobSchedule.updateMany({
  where: {
    lockedAt: { lte: stalledThreshold }  // ← Matches 2am lock (>5min old)
  },
  data: {
    lockedAt: null,  // ← RELEASES THE LOCK WHILE JOBS STILL RUNNING
    lockedBy: null
  }
});
```

**Result:** Lock is released at 3:05am while jobs are still executing. Next interval at 4:00am could start duplicate execution.

---

### Risk #2: Multiple Schedules Due at Once

**Scenario:** You have 3 schedules all due at 2:00am:
- `daily-full-sync` (20 jobs, takes 40 minutes)
- `hourly-matching` (5 jobs, takes 10 minutes)
- `feed-refresh` (3 jobs, takes 5 minutes)

**What Happens:**

```typescript
// processSchedules() finds all 3
const dueSchedules = [
  { id: 'daily-full-sync', ... },
  { id: 'hourly-matching', ... },
  { id: 'feed-refresh', ... }
];

// Processes SEQUENTIALLY
for (const dbSchedule of dueSchedules) {
  await executeScheduleInline(definition, dbSchedule.id);  // ← Blocking
}
```

**Timeline:**
```
2:00am - Start daily-full-sync (20 jobs)
2:40am - Finish daily-full-sync
2:40am - Start hourly-matching (5 jobs)
2:50am - Finish hourly-matching
2:50am - Start feed-refresh (3 jobs)
2:55am - Finish feed-refresh
```

**Problem:** `hourly-matching` was supposed to run at 2am, but didn't start until 2:40am (40 minute delay).

---

### Risk #3: Lock Timeout Too Short

**Current Setting:**
```typescript
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
```

**Problem:** If any job takes >5 minutes, the lock will be considered "stalled" and released by `cleanupStalledLocks()`.

**Example:**
```
2:00am - daily-full-sync starts (20 jobs, will take 40 minutes)
2:05am - Lock is >5 minutes old
3:00am - setInterval fires, cleanupStalledLocks() runs
         Lock is released (considered "stalled")
3:00am - processSchedules() finds "daily-full-sync" unlocked
         Acquires lock AGAIN
         Starts DUPLICATE execution while original still running
```

**Result:** Duplicate execution possible if jobs take longer than `LOCK_TIMEOUT_MS`.

---

### Risk #4: nextRunAt Calculation Timing

**Code:**
```typescript
// After jobs finish at 3:10am
const now = new Date();  // 2:00am (captured at START of execution)
const nextRun = new Cron(definition.cron, { 
  timezone: definition.timezone, 
  paused: true 
}).nextRun();  // Calculated from NOW

await prisma.jobSchedule.update({
  data: {
    lastRunAt: now,  // 2:00am (start time, not finish time)
    nextRunAt: nextRun  // Based on 2:00am, so 2:00am tomorrow
  }
});
```

**Issue:** If cron is `0 2 * * *` (daily at 2am), `nextRun()` is calculated from the START time (2am), not the FINISH time (3:10am).

**Result:** This is actually correct behavior for cron (next occurrence is independent of job duration).

---

## Solutions and Mitigations

### Solution #1: Increase Lock Timeout (CRITICAL)

**Problem:** 5 minutes is too short if jobs can take 30-60 minutes.

**Fix:**
```typescript
// backend/scripts/scheduleDaemon.ts
const LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours (was 5 minutes)
```

**Rationale:**
- If a job takes >2 hours, it's probably crashed anyway
- Prevents premature lock cleanup during legitimate long runs
- Still provides recovery from actual crashes

---

### Solution #2: Skip Cleanup During Active Execution

**Problem:** `cleanupStalledLocks()` runs even while jobs are executing.

**Fix:**
```typescript
// Track if we're currently processing
let isProcessing = false;

setInterval(async () => {
  await updateHeartbeat();
  
  if (!isProcessing) {
    await cleanupStalledLocks();
  }
  
  isProcessing = true;
  await processSchedules();
  isProcessing = false;
}, POLL_INTERVAL_MS);
```

**Better Alternative:** Only cleanup on daemon startup, not during operation.

```typescript
async function main() {
  await registerWorker();
  await syncScheduleDefinitions();
  await cleanupStalledLocks();  // ← Once at startup only
  
  setInterval(async () => {
    await updateHeartbeat();
    await processSchedules();  // ← No cleanup here
  }, POLL_INTERVAL_MS);
}
```

---

### Solution #3: Use setTimeout Instead of setInterval

**Problem:** `setInterval` fires regardless of whether previous execution finished.

**Fix:**
```typescript
async function scheduleLoop() {
  try {
    await updateHeartbeat();
    await processSchedules();
  } catch (err) {
    console.error('❌ Error in daemon loop:', err);
  }
  
  // Schedule next iteration AFTER this one completes
  setTimeout(scheduleLoop, POLL_INTERVAL_MS);
}

async function main() {
  // ... setup ...
  
  // Start the loop (uses setTimeout recursively)
  scheduleLoop();
}
```

**Benefit:** Next iteration only starts AFTER previous one completes. No overlapping executions.

**Trade-off:** If a job takes 70 minutes, next check happens at 70 minutes + POLL_INTERVAL_MS (e.g., 70 + 60 = 130 minutes).

---

### Solution #4: Separate Long-Running Jobs

**Problem:** One slow job blocks all other schedules.

**Fix:** Create separate schedules for different job groups.

```typescript
// Instead of:
{
  id: 'daily-full-sync',
  executionMode: 'ALL_JOBS'  // 20 jobs, 40 minutes
}

// Use:
{
  id: 'daily-critical',
  executionMode: 'GROUP',
  jobGroup: 'critical'  // 5 fast jobs, 2 minutes
},
{
  id: 'daily-heavy',
  executionMode: 'GROUP',
  jobGroup: 'analytics'  // 15 slow jobs, 40 minutes
}
```

**Benefit:** Fast jobs don't wait for slow jobs. Each schedule locks independently.

---

### Solution #5: Set Maximum Job Timeout

**Problem:** Jobs can run indefinitely.

**Fix:** Add timeout to job execution.

```typescript
async function executeScheduleInline(schedule, scheduleId) {
  const jobs = await getJobsForSchedule(schedule);
  
  for (const job of jobs) {
    try {
      const jobRun = await prisma.jobRun.create({ ... });
      
      // Add timeout wrapper
      await Promise.race([
        runQueuedJob(jobRun.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Job timeout')), 10 * 60 * 1000)
        )
      ]);
      
    } catch (error) {
      if (error.message === 'Job timeout') {
        console.error(`[daemon] ⏱️ ${job.name} timed out after 10 minutes`);
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: { status: 'FAILED', error: 'Timeout after 10 minutes' }
        });
      }
      // Continue to next job
    }
  }
}
```

**Benefit:** Prevents infinite hangs. Ensures execution completes within reasonable time.

---

## Recommended Configuration for Pre-Launch

### Environment Variables

```env
# Daemon polls every 15 minutes
SCHEDULE_POLL_INTERVAL_MS=900000

# Lock timeout: 1 hour (plenty of time for jobs)
LOCK_TIMEOUT_MS=3600000
```

### Code Changes

1. **Change lock timeout:**
```typescript
// backend/scripts/scheduleDaemon.ts
const LOCK_TIMEOUT_MS = parseInt(
  process.env.LOCK_TIMEOUT_MS || '3600000',  // 1 hour default
  10
);
```

2. **Only cleanup on startup:**
```typescript
async function main() {
  await registerWorker();
  await syncScheduleDefinitions();
  await cleanupStalledLocks();  // ← Once at startup
  
  setInterval(async () => {
    await updateHeartbeat();
    await processSchedules();  // ← No cleanup during operation
  }, POLL_INTERVAL_MS);
  
  // Initial run (no cleanup)
  await processSchedules();
}
```

3. **Switch to setTimeout:**
```typescript
async function scheduleLoop() {
  try {
    await updateHeartbeat();
    await processSchedules();
  } catch (err) {
    console.error('❌ Error in daemon loop:', err);
  }
  setTimeout(scheduleLoop, POLL_INTERVAL_MS);
}

async function main() {
  await registerWorker();
  await syncScheduleDefinitions();
  await cleanupStalledLocks();
  
  console.log('✅ Schedule daemon started');
  scheduleLoop();  // ← Start recursive loop
}
```

---

## Monitoring for Long-Running Jobs

### Query: Find Long-Running Executions

```sql
SELECT 
  jr.id,
  jr.jobName,
  jr.status,
  jr.startedAt,
  TIMESTAMPDIFF(MINUTE, jr.startedAt, NOW()) as minutes_running,
  js.id as scheduleId,
  js.lockedAt,
  js.lockedBy
FROM JobRun jr
LEFT JOIN JobSchedule js ON jr.scheduleId = js.id
WHERE jr.status = 'RUNNING'
  AND jr.startedAt < NOW() - INTERVAL 10 MINUTE
ORDER BY jr.startedAt ASC;

-- Look for:
-- - Jobs running >10 minutes (warning)
-- - Jobs running >30 minutes (critical)
-- - Jobs running >1 hour (investigate immediately)
```

### Alert: Schedule Execution Duration

```sql
SELECT 
  scheduleId,
  COUNT(*) as runs,
  AVG(TIMESTAMPDIFF(SECOND, startedAt, completedAt)) as avg_duration_sec,
  MAX(TIMESTAMPDIFF(SECOND, startedAt, completedAt)) as max_duration_sec
FROM JobRun
WHERE scheduleId IS NOT NULL
  AND status IN ('COMPLETED', 'FAILED')
  AND createdAt > NOW() - INTERVAL 7 DAY
GROUP BY scheduleId;

-- Alert if:
-- - max_duration_sec > 3600 (>1 hour)
-- - avg_duration_sec increasing over time
```

---

## Real-World Scenarios

### Scenario A: All Jobs Fast (<5 minutes total)

**Configuration:**
- Poll interval: 1 hour
- Lock timeout: 1 hour
- Expected duration: 2-5 minutes

**Result:** ✅ **No issues.** Lock is acquired, jobs run, lock is released before next interval.

---

### Scenario B: One Slow Job (30 minutes total)

**Configuration:**
- Poll interval: 1 hour
- Lock timeout: 5 minutes ❌

**Result:** ⚠️ **Lock timeout too short.** Lock will be cleaned up at 2:05am while jobs still running until 2:30am.

**Fix:** Increase lock timeout to 1 hour.

---

### Scenario C: Multiple Schedules Overlapping

**Configuration:**
- Schedule A: Every hour, takes 10 minutes
- Schedule B: Every hour, takes 5 minutes
- Poll interval: 1 hour

**Timeline:**
```
2:00am - Find both schedules due
2:00am - Start Schedule A (10 min)
2:10am - Start Schedule B (5 min)
2:15am - All done
3:00am - Find both schedules due again
3:00am - Start Schedule A (10 min)
3:10am - Start Schedule B (5 min)
3:15am - All done
```

**Result:** ✅ **No issues.** Executions complete before next interval.

---

### Scenario D: Job Takes Longer Than Interval (WORST CASE)

**Configuration:**
- Schedule: Every 1 hour
- Job duration: 75 minutes ⚠️
- Poll interval: 1 hour
- Lock timeout: 5 minutes ❌

**Timeline:**
```
2:00am - Lock acquired, start job (will take 75 min)
2:05am - Lock is >5 minutes old
3:00am - setInterval fires
         cleanupStalledLocks() releases the lock (>5min)
         processSchedules() finds schedule unlocked
         Acquires lock AGAIN
         Starts DUPLICATE execution
3:15am - Original job finishes (tried to release lock, but it's been re-acquired)
4:15am - Duplicate job finishes
```

**Result:** ❌ **CRITICAL BUG.** Duplicate execution.

**Fix:**
1. Increase lock timeout to 2 hours
2. Switch to `setTimeout` to prevent overlapping intervals
3. Add job timeouts to prevent runaway jobs

---

## Summary: What Actually Happens

### Current Implementation

**If job takes 70 minutes:**

1. ✅ Lock prevents duplicate schedule execution
2. ⚠️ BUT: `setInterval` fires again while still running
3. ⚠️ `cleanupStalledLocks()` may release lock prematurely if `LOCK_TIMEOUT_MS` too short
4. ✅ Atomic lock acquisition prevents most race conditions
5. ⚠️ Other schedules are delayed (sequential processing)

### Risk Level by Configuration

**Low Risk (Current Production):**
- Lock timeout: 1-2 hours
- Poll interval: 15-60 minutes
- Expected job duration: <10 minutes
- Monitoring: Active

**Medium Risk:**
- Lock timeout: 5 minutes (too short)
- Jobs occasionally take 10-20 minutes
- No monitoring

**High Risk:**
- Lock timeout: 5 minutes
- Jobs regularly take 30+ minutes
- Poll interval: 5 minutes (frequent)
- Multiple schedules overlapping

---

## Action Items

### Immediate (Before Railway Deploy)

1. ✅ **Increase lock timeout to 1 hour**
   ```typescript
   const LOCK_TIMEOUT_MS = 60 * 60 * 1000;
   ```

2. ✅ **Move cleanup to startup only**
   ```typescript
   // Remove from setInterval, only run once in main()
   ```

3. ✅ **Add monitoring query for long-running jobs**
   ```sql
   -- In docs or alerting setup
   ```

### Short Term (Week 1)

4. ⚠️ **Switch to setTimeout** (eliminates overlapping risk)
   ```typescript
   // Recursive scheduling instead of setInterval
   ```

5. ⚠️ **Add job-level timeout** (prevent infinite hangs)
   ```typescript
   // Promise.race with timeout
   ```

### Long Term (Month 1)

6. 📊 **Monitor job durations** (establish baselines)
   ```sql
   -- Track avg/max duration per schedule
   ```

7. 🔄 **Separate long-running jobs** (if needed)
   ```typescript
   // Split heavy jobs into separate schedule
   ```

8. 🚀 **Migrate to queue-based** (if jobs regularly take >30 min)
   ```typescript
   // Add separate worker process
   ```

---

## Final Recommendation

**For pre-launch (solo user, <100 jobs/day):**

✅ **Current inline execution is safe IF:**
1. Lock timeout >= expected job duration × 2
2. Poll interval >= expected job duration × 2
3. Jobs typically complete in <10 minutes
4. Monitoring is active

⚠️ **Apply immediate fixes:**
1. Increase lock timeout to 1 hour
2. Move cleanup to startup only
3. Add monitoring queries

📋 **Plan migration to queue-based when:**
1. Jobs regularly take >30 minutes
2. Processing >1000 jobs/day
3. Multiple schedules frequently overlap

**Bottom line:** The atomic locking provides good protection, but the 5-minute lock timeout is the main risk. Fix that first.
