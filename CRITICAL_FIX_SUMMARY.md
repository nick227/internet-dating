# Critical Fix Summary: Long-Running Job Protection

## Your Question

> "what happens if a job is still running 1 hour later?"

## The Problem We Discovered

### Original Implementation (DANGEROUS)

```typescript
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

setInterval(async () => {
  await cleanupStalledLocks();  // ← Runs every hour
  await processSchedules();
}, POLL_INTERVAL_MS);
```

**What went wrong:**

1. **Lock timeout too short (5 minutes)**
   - If a job takes 30 minutes to complete
   - At minute 5, the lock is considered "stalled"
   - At the next interval (e.g., hour 2), `cleanupStalledLocks()` releases the lock
   - The job is STILL RUNNING but the lock is gone
   - `processSchedules()` sees the schedule unlocked and starts a DUPLICATE execution

2. **Cleanup ran every interval**
   - Even while jobs were actively running
   - Could prematurely release locks
   - Race condition risk

### Timeline of the Bug

```
2:00am - Schedule "daily-full-sync" starts (will take 30 minutes)
         Lock acquired (lockedAt = 2:00am)

2:05am - Lock is now >5 minutes old (considered "stalled")

2:30am - Jobs finish, lock released naturally
         ✅ OK so far...

---

2:00am - Schedule "daily-full-sync" starts AGAIN (will take 30 minutes)
         Lock acquired (lockedAt = 2:00am)

2:05am - Lock is now >5 minutes old (considered "stalled")

3:00am - setInterval fires
         cleanupStalledLocks() runs
         Finds lock from 2:00am (>1 hour old!)
         RELEASES THE LOCK ← BUG!
         
         processSchedules() runs immediately after
         Finds "daily-full-sync" unlocked (nextRunAt still in past)
         Acquires lock AGAIN
         Starts DUPLICATE execution ← CRITICAL BUG
         
         Now TWO instances of "daily-full-sync" running simultaneously
```

---

## The Fix (Applied)

### 1. Increase Lock Timeout to 1 Hour

```typescript
// backend/scripts/scheduleDaemon.ts
const LOCK_TIMEOUT_MS = parseInt(
  process.env.LOCK_TIMEOUT_MS || '3600000',  // 1 hour (was 5 min)
  10
);
```

**Why 1 hour:**
- Typical job: 2-10 minutes
- Worst case: 30-40 minutes (all jobs running sequentially)
- 1 hour = 2x safety margin
- Configurable via environment variable for different scenarios

### 2. Move Cleanup to Startup Only

```typescript
async function main() {
  await registerWorker();
  await syncScheduleDefinitions();
  await cleanupStalledLocks();  // ← Once at startup only
  
  setInterval(async () => {
    await updateHeartbeat();
    await processSchedules();  // ← No cleanup during operation
  }, POLL_INTERVAL_MS);
  
  await processSchedules();
}
```

**Why:**
- Cleanup is only needed to recover from previous crashes
- Running it during normal operation is dangerous
- Active locks should NEVER be cleaned up
- Startup cleanup catches genuinely stalled locks from crashes

### 3. Add Environment Variable

```env
# Railway Daemon Service
LOCK_TIMEOUT_MS="3600000"  # 1 hour (production default)

# For especially long jobs
LOCK_TIMEOUT_MS="7200000"  # 2 hours
```

**Documentation:** `backend/ENV_VARIABLES.md` now includes full details

---

## Protection Mechanisms

### What Prevents Duplicate Execution

**Layer 1: Atomic Lock Acquisition** ✅
```typescript
const result = await prisma.jobSchedule.updateMany({
  where: {
    id: scheduleId,
    lockedAt: null  // ← Only acquire if unlocked
  },
  data: { lockedAt: new Date(), lockedBy: workerId }
});

// result.count = 1 if lock acquired
// result.count = 0 if already locked
```

**Layer 2: Query Filter** ✅
```typescript
const dueSchedules = await prisma.jobSchedule.findMany({
  where: {
    enabled: true,
    nextRunAt: { lte: now },
    lockedAt: null  // ← Only find unlocked schedules
  }
});
```

**Layer 3: Lock Timeout (NOW FIXED)** ✅
```typescript
// Previously: 5 minutes (TOO SHORT)
// Now: 1 hour (SAFE for jobs up to 30-40 minutes)
```

---

## What Actually Happens Now

### Scenario: Job Takes 30 Minutes

```
2:00am - Schedule "daily-full-sync" starts
         Lock acquired (lockedAt = 2:00am, lockedBy = "daemon_xyz")
         
2:01am - Job 1 running...
2:05am - Job 5 running... (lock is 5 min old, but timeout is 1 hour)
2:10am - Job 10 running...
2:20am - Job 15 running...
2:30am - Job 20 completes
         Lock released (lockedAt = null)
         nextRunAt = 2:00am tomorrow

3:00am - setInterval fires
         processSchedules() runs
         Finds NO due schedules (nextRunAt = 2:00am tomorrow)
         Nothing to do
         
✅ No duplicate execution
✅ Lock was never prematurely cleaned
✅ Next run scheduled correctly
```

### Scenario: Job Takes 70 Minutes (WORST CASE)

```
2:00am - Schedule "daily-full-sync" starts
         Lock acquired (lockedAt = 2:00am)
         
2:30am - Job 10 running... (lock 30 min old, timeout is 60 min)
3:00am - setInterval fires
         processSchedules() runs
         Queries for due schedules with lockedAt = null
         "daily-full-sync" has lockedAt = 2:00am (NOT null)
         Schedule is SKIPPED ✅
         
3:10am - Job 20 completes (70 minutes total)
         Lock released (lockedAt = null)
         nextRunAt = 2:00am tomorrow
         
✅ No duplicate execution (atomic lock prevented it)
⚠️  But lock was getting close to timeout (70 min vs 60 min timeout)
```

**Action if this happens frequently:**
- Increase `LOCK_TIMEOUT_MS` to 2 hours (7200000)
- Or split into separate schedules (fast vs slow jobs)

---

## Monitoring

### Check for Long-Running Jobs

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
```

**Alert thresholds:**
- 10-20 minutes: ⚠️ Warning (monitor)
- 30-40 minutes: ⚠️ Critical (review job efficiency)
- >50 minutes: 🚨 Emergency (approaching lock timeout)

### Check Lock Status

```sql
SELECT 
  id,
  enabled,
  lockedAt,
  lockedBy,
  TIMESTAMPDIFF(MINUTE, lockedAt, NOW()) as lock_age_minutes
FROM JobSchedule
WHERE lockedAt IS NOT NULL;
```

**Alert if:**
- `lock_age_minutes > 30`: Job taking longer than expected
- `lock_age_minutes > 55`: Approaching timeout (increase `LOCK_TIMEOUT_MS`)

---

## Risk Assessment

### Before Fix

❌ **HIGH RISK**
- Lock timeout: 5 minutes (too short)
- Cleanup: Every interval (during active execution)
- Jobs taking >5 minutes would trigger duplicate execution
- Production incident likely within first week

### After Fix

✅ **LOW RISK** (Pre-Launch Scale)
- Lock timeout: 1 hour (2x safety margin)
- Cleanup: Startup only (safe)
- Jobs can take up to 40-50 minutes safely
- Atomic locking provides additional protection
- Monitoring queries available

⚠️ **MEDIUM RISK** (Production Scale)
- If jobs regularly take >50 minutes
- If multiple schedules overlap frequently
- If processing >1000 jobs/day

**Migration path:** Switch to queue-based execution (see `SCHEDULE_JOBS_FINAL_ANALYSIS.md` section "Migration Path")

---

## Action Items

### Completed ✅

1. ✅ Increased lock timeout to 1 hour
2. ✅ Moved cleanup to startup only
3. ✅ Added `LOCK_TIMEOUT_MS` environment variable
4. ✅ Updated `ENV_VARIABLES.md` documentation
5. ✅ Created `LONG_RUNNING_JOB_ANALYSIS.md` (full technical analysis)

### Before Railway Deploy

6. ⚠️ **Set environment variable on Railway daemon service:**
   ```env
   LOCK_TIMEOUT_MS=3600000
   ```

### After Deploy (Week 1)

7. 📊 Monitor job durations (run SQL query daily)
8. 📊 Monitor lock ages (check for jobs approaching timeout)
9. 📊 Verify no duplicate executions (check JobRun history)

### If Jobs Take >40 Minutes Regularly

10. 🔄 Increase `LOCK_TIMEOUT_MS` to 2 hours
11. 🔄 Consider splitting schedules (fast vs slow jobs)
12. 🔄 Consider queue-based execution (see migration guide)

---

## Bottom Line

**Your question revealed a critical bug.** The 5-minute lock timeout was dangerously short and could have caused duplicate job executions in production.

**Fixed:** Lock timeout increased to 1 hour, cleanup moved to startup only.

**Safe for:** Jobs taking up to 40-50 minutes (pre-launch scale).

**Next step:** Deploy to Railway with `LOCK_TIMEOUT_MS=3600000` environment variable set.

**Documentation:**
- `LONG_RUNNING_JOB_ANALYSIS.md` - Full technical analysis (800+ lines)
- `backend/ENV_VARIABLES.md` - Environment variable documentation
- This file - Quick summary

**Thank you for asking this question!** 🎯
