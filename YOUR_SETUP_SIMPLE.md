# Your Setup - Simple Version (No Ghosts!)

## What You Have

**2 Railway Services = 2 Processes Running**

```
┌─────────────────────────────────────┐
│  Service 1: web-server              │
│  ├─ HTTP API                        │
│  └─ Job Worker (embedded)           │
│     Checks every: 30 seconds        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Service 2: schedule-daemon         │
│  └─ Schedule Daemon                 │
│     Checks every: 1 HOUR            │
└─────────────────────────────────────┘
```

That's it. **2 services. 2 processes. No more, no less.**

---

## How It Works (In Plain English)

**Every hour:**
1. Schedule daemon wakes up
2. Checks: "Are any schedules enabled and due?"
3. If yes: Creates jobs (JobRun records in database with status=QUEUED)
4. Goes back to sleep for 1 hour

**Every 30 seconds:**
1. Job worker wakes up
2. Checks: "Are there any QUEUED jobs?"
3. If yes: 
   - Locks one job (prevents duplicates)
   - Runs the job
   - Updates status to COMPLETED
4. Goes back to sleep for 30 seconds

**That's the entire system.**

---

## Railway Configuration (Copy These Exactly)

### Service 1: web-server

**Environment Variables:**
```
EMBEDDED_JOB_WORKER=true
JOB_WORKER_POLL_INTERVAL_MS=30000
SCHEDULE_DAEMON_ENABLED=false
```

**Start Command:** (Already set)
```
node backend/dist/index.js
```

---

### Service 2: schedule-daemon

**Environment Variables:**
```
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000
EMBEDDED_JOB_WORKER=false
```

**Start Command:**
```
cd backend && pnpm daemon:schedules
```

---

## How to Know You Did It Right

**After deploying, run this query:**

```sql
SELECT workerType, COUNT(*) as count
FROM WorkerInstance
WHERE status = 'RUNNING'
GROUP BY workerType;
```

**You should see:**
```
job_worker       | 1
schedule_daemon  | 1
```

**If you see any count > 1 → You have a ghost. Check env vars.**

---

## How to Use It

1. **Go to your admin UI:** `https://your-app.railway.app/admin/schedules`

2. **You'll see 3 schedules** (all disabled by default):
   - Daily Full Sync (2am UTC daily)
   - Hourly Matching (every hour)
   - Feed Refresh (every 15 minutes)

3. **Enable ONE schedule** (start with Daily Full Sync)

4. **Click "Run Now"** to test immediately

5. **Go to `/admin/jobs`** to see the jobs running

6. **Wait 24 hours** and verify it ran automatically at 2am

---

## When to Change Settings

**Keep these settings (1 hour schedule checks, 30 second job checks) until:**
- You have >10 active users
- You're processing >100 jobs/day
- You notice job queue backlog

**Then consider:**
- Faster schedule checks (15 minutes = `900000`)
- Faster job checks (10 seconds = `10000`)

**But for pre-launch with just you? Current settings are perfect.**

---

## Quick Sanity Checks

**Is daemon running?**
```bash
railway logs --service schedule-daemon | grep "Polling every"
# Should see: "⏱️  Polling every 3600s" (that's 1 hour)
```

**Is worker running?**
```bash
railway logs --service web-server | grep "job worker"
# Should see: "🔄 Starting embedded job worker"
# Should see: "Job worker poll interval: 30000ms"
```

**How many Railway services do I have?**
```bash
railway status
# Should show exactly 2 services
```

---

## If Something Goes Wrong

**Jobs stuck in QUEUED:**
→ Worker isn't running. Check logs, verify `EMBEDDED_JOB_WORKER=true` on web-server

**Schedules not triggering:**
→ Daemon isn't running. Check logs, verify `SCHEDULE_DAEMON_ENABLED=true` on schedule-daemon

**Duplicate jobs:**
→ Ghost process. Run verification query, fix env vars

**"Too many connections" error:**
→ Add `DATABASE_CONNECTION_LIMIT=5` to both services

---

## Your Safety Net

**The system is designed to prevent ghosts:**

1. ✅ **Atomic locking** - Even if 2 workers exist briefly, only 1 can lock a job
2. ✅ **Explicit env vars** - You control exactly what runs where
3. ✅ **Clear logs** - Easy to see what's starting
4. ✅ **Database verification** - Query shows exact worker count

**You can't accidentally create ghosts if you follow the env var template.**

---

## Summary

**Your mental model should be:**

```
Railway has 2 containers:

Container 1 (web-server):
  - Serves HTTP traffic
  - Checks for jobs every 30 seconds
  - Does NOT run schedule daemon

Container 2 (schedule-daemon):
  - Checks schedules every 1 hour
  - Creates jobs when schedules are due
  - Does NOT run job worker
```

**2 containers. Clear responsibilities. No overlap. No ghosts.**

**You're in complete control. The system does exactly what you tell it to do.**

---

## One-Line Verification

```sql
-- This should return exactly 2 rows (1 worker, 1 daemon)
SELECT COUNT(*) FROM WorkerInstance WHERE status = 'RUNNING';
```

**Result = 2? ✅ You're golden.**  
**Result ≠ 2? ⚠️ Check env vars and redeploy.**

---

## Bottom Line

**You have:**
- ✅ 2 Railway services (not 3, not 1)
- ✅ Schedule checks every 1 hour (conservative for pre-launch)
- ✅ Job checks every 30 seconds (reasonable for low volume)
- ✅ Clear env var control (no accidental ghosts)
- ✅ Database verification (know exactly what's running)

**No magic. No hidden processes. Complete transparency.**

**Sleep well. Your setup is solid.**
