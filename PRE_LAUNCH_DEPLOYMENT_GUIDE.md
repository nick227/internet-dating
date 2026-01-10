# Pre-Launch Deployment Guide: Railway Process Management

## Your Concerns (Valid & Important)

1. ✅ **Ghost processes on Railway** - Multiple instances running, can't control them
2. ✅ **Job worker pulse time** - Don't understand how to control polling frequency
3. ✅ **Resource intensity** - Jobs are more intensive than web server
4. ✅ **Schedule daemon frequency** - Only want hourly checks, not every minute
5. ✅ **Pre-launch scale** - Only one user (you), don't need aggressive settings

**This guide will make you confident and in control.**

---

## Understanding Railway's Process Model

### Railway Services = Isolated Containers

```
Railway Project: internet-dating.com
│
├── Service 1: web-server
│   └── 1 Container (1 process inside)
│       └── Runs: node backend/dist/index.js
│       └── Restarts: Only when you deploy or it crashes
│
├── Service 2: schedule-daemon (if separate)
│   └── 1 Container (1 process inside)
│       └── Runs: pnpm daemon:schedules
│       └── Restarts: Only when you deploy or it crashes
│
└── Service 3: job-worker (if separate)
    └── 1 Container (1 process inside)
        └── Runs: pnpm worker:jobs
        └── Restarts: Only when you deploy or it crashes
```

**Key Point:** Each Railway service = **EXACTLY ONE process**  
No ghost processes unless YOU create multiple services.

---

## How Polling Works (The "Pulse")

### Schedule Daemon Polling

```typescript
// backend/scripts/scheduleDaemon.ts
const POLL_INTERVAL_MS = parseInt(process.env.SCHEDULE_POLL_INTERVAL_MS || '60000', 10);

setInterval(async () => {
  await processSchedules();
}, POLL_INTERVAL_MS);
```

**What this does:**
1. Daemon wakes up every `POLL_INTERVAL_MS` milliseconds
2. Checks database: "Any schedules due now?"
3. If yes: Enqueue jobs
4. If no: Go back to sleep
5. Repeat forever (until process killed)

**Default:** 60,000ms = 60 seconds = 1 minute

**Your desire:** Check every hour = 3,600,000ms

---

### Job Worker Polling

```typescript
// backend/src/workers/jobWorker.ts
const POLL_INTERVAL_MS = 5000; // 5 seconds (hardcoded currently)

setInterval(async () => {
  const processed = await processNextJob();
  // If job found and processed, check again immediately
  // If no job, wait 5 seconds
}, POLL_INTERVAL_MS);
```

**What this does:**
1. Worker wakes up every 5 seconds
2. Checks database: "Any QUEUED jobs?"
3. If yes: Lock one job atomically, process it, repeat
4. If no: Sleep for 5 seconds
5. Repeat forever

**Pre-launch optimization:** Can slow this down too (see Configuration section)

---

## Pre-Launch Configuration (Conservative Settings)

### For Your Current Scale (Solo User, Pre-Launch)

**What you need:**
- ✅ Schedules check: **Once per hour** (not every minute)
- ✅ Job processing: **Slow polling** (every 30-60 seconds)
- ✅ **NO ghost processes** (clear Railway setup)
- ✅ **Minimal cost** (~$10-15/mo total)

---

## Option 1: Two Services (Recommended for You)

**Why:** Clear separation, easy to understand, no ghost risks

```
Railway Project
│
├── Service 1: web-server
│   ├── Start Command: node backend/dist/index.js
│   ├── Contains: HTTP server ONLY
│   ├── Env: EMBEDDED_JOB_WORKER=true (we'll add this)
│   ├── Env: JOB_WORKER_POLL_INTERVAL_MS=30000 (30 seconds)
│   └── ONE process: Web server + embedded job worker
│
└── Service 2: schedule-daemon
    ├── Start Command: pnpm daemon:schedules
    ├── Contains: Schedule daemon ONLY
    ├── Env: SCHEDULE_POLL_INTERVAL_MS=3600000 (1 hour!)
    └── ONE process: Schedule daemon checking once per hour
```

**Total processes on Railway: 2**  
**Total cost: ~$10-20/mo**

**Why embedded worker in web server?**
- You're solo user with low traffic
- Jobs are lightweight (no video processing yet)
- Saves one Railway service = saves $5-10/mo
- Still separate from schedule daemon (critical for your peace of mind)

---

## Configuration: Controlling the Pulse

### Environment Variables (Your Control Panel)

```env
# Railway Service: web-server
NODE_ENV=production
DATABASE_URL=<from-railway-mysql>

# Job Worker (embedded in web server)
EMBEDDED_JOB_WORKER=true                    # Enable worker in web process
JOB_WORKER_POLL_INTERVAL_MS=30000          # Check every 30 seconds (not 5!)

# Schedule Daemon Control
SCHEDULE_DAEMON_ENABLED=false              # Don't run daemon in web server!
```

```env
# Railway Service: schedule-daemon
NODE_ENV=production
DATABASE_URL=<same-as-web-server>

# Schedule Daemon Control
SCHEDULE_DAEMON_ENABLED=true               # This is the daemon service
SCHEDULE_POLL_INTERVAL_MS=3600000          # Check every 1 HOUR (your preference!)

# Job Worker Control
EMBEDDED_JOB_WORKER=false                  # Don't run worker in daemon!
```

**This gives you:**
- ✅ Schedule checks: **Once per hour** (3,600,000ms)
- ✅ Job checks: **Every 30 seconds** (30,000ms)
- ✅ Clear separation: Web+Worker vs Daemon
- ✅ NO ghost processes: Only 2 services total

---

## Implementation Steps (Safe & Controlled)

### Step 1: Add Environment Variable Support to Job Worker

**Current problem:** `POLL_INTERVAL_MS` is hardcoded at 5 seconds

**Solution:** Make it configurable

```typescript
// backend/src/workers/jobWorker.ts

// Change from:
const POLL_INTERVAL_MS = 5000;

// To:
const POLL_INTERVAL_MS = parseInt(
  process.env.JOB_WORKER_POLL_INTERVAL_MS || '5000', 
  10
);
```

---

### Step 2: Add Embedded Worker to Web Server

**Goal:** Web server can optionally run job worker in same process

```typescript
// backend/src/index.ts

// Add at the end of main(), after server.listen():

// Start embedded job worker if enabled
const ENABLE_WORKER = process.env.EMBEDDED_JOB_WORKER === 'true';
if (ENABLE_WORKER) {
  console.log('[server] 🔄 Starting embedded job worker');
  console.log(`[server] Job worker poll interval: ${process.env.JOB_WORKER_POLL_INTERVAL_MS || '5000'}ms`);
  
  // Import and start worker
  import('./workers/jobWorker.js').then(module => {
    module.startJobWorker();
  }).catch(err => {
    console.error('[server] Failed to start job worker:', err);
  });
} else {
  console.log('[server] ⏭️  Job worker disabled (EMBEDDED_JOB_WORKER not set to true)');
}
```

---

### Step 3: Export Start Function from Job Worker

**Goal:** Make worker startable from another module

```typescript
// backend/src/workers/jobWorker.ts

// At the end of the file, change from:
main().catch(err => {
  console.error('Job worker failed:', err);
  process.exit(1);
});

// To:
export function startJobWorker() {
  main().catch(err => {
    console.error('Job worker failed:', err);
    // Don't exit process if embedded, just log error
    if (process.env.EMBEDDED_JOB_WORKER === 'true') {
      console.error('Job worker crashed but web server continues');
    } else {
      process.exit(1);
    }
  });
}

// Only auto-start if running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  startJobWorker();
}
```

---

### Step 4: Configure Railway Services

#### Railway Service 1: web-server

**Settings → Variables:**
```env
NODE_ENV=production
DATABASE_URL=<your-mysql-url>
JWT_SECRET=<your-secret>

# Enable embedded worker (pre-launch conservative)
EMBEDDED_JOB_WORKER=true
JOB_WORKER_POLL_INTERVAL_MS=30000

# Disable schedule daemon (runs in separate service)
SCHEDULE_DAEMON_ENABLED=false
```

**Settings → Start Command:** (Already set)
```
node backend/dist/index.js
```

**Expected logs:**
```
[server] Starting application...
[server] PORT=8080 NODE_ENV=production
[server] ✓ Listening on {"address":"0.0.0.0","port":8080}
[server] 🔄 Starting embedded job worker
[server] Job worker poll interval: 30000ms
🔄 Job worker starting
```

---

#### Railway Service 2: schedule-daemon

**Settings → Variables:**
```env
NODE_ENV=production
DATABASE_URL=<same-as-web-server>

# Enable daemon with HOURLY checks
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000

# Disable embedded worker (not needed in daemon)
EMBEDDED_JOB_WORKER=false
```

**Settings → Start Command:**
```
cd backend && pnpm daemon:schedules
```

**Expected logs:**
```
🚀 Starting schedule daemon (production mode)
✅ Schedule daemon registered: <uuid>
📋 Synced 3 schedule definitions from code
✅ Schedule daemon started
⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)
📋 Loaded 3 schedule definitions from code
⏱️  Polling every 3600s  ← THIS IS 1 HOUR
```

---

## Ghost Process Prevention

### How Ghosts Happen (And How We Prevent Them)

**Ghost scenario 1: Multiple Railway services with same code**
```
❌ BAD:
Service 1: "web" → runs daemon
Service 2: "daemon" → runs daemon
Result: 2 daemons checking schedules = DUPLICATE JOBS
```

**Prevention:**
```
✅ GOOD:
Service 1: "web-server" → SCHEDULE_DAEMON_ENABLED=false
Service 2: "schedule-daemon" → SCHEDULE_DAEMON_ENABLED=true
Result: Only one daemon running
```

---

**Ghost scenario 2: Forgot to disable daemon in web service**
```
❌ BAD:
Service 1: "web-server" → (SCHEDULE_DAEMON_ENABLED not set)
  └── Defaults to 'true' → daemon starts!
Service 2: "schedule-daemon" → SCHEDULE_DAEMON_ENABLED=true
Result: 2 daemons running
```

**Prevention:**
```
✅ GOOD: Explicitly set SCHEDULE_DAEMON_ENABLED=false in web service
```

---

**Ghost scenario 3: PM2 restart spawns duplicate**
```
❌ BAD (if using PM2):
pm2 restart schedule-daemon
  └── Brief moment: old + new process both alive
  └── Both try to process schedules

✅ GOOD: Atomic locking prevents duplicates
  └── Old process: Gets lock, processes schedule
  └── New process: Fails to get lock, skips
  └── No duplicate job execution (just harmless log)
```

**Our atomic locking protects you even if ghosts happen temporarily.**

---

## Monitoring & Control

### 1. Check How Many Processes Are Running

**Railway CLI:**
```bash
railway status

# Should show:
# web-server: RUNNING (1 instance)
# schedule-daemon: RUNNING (1 instance)
```

**Railway Dashboard:**
- Click each service
- Look at "Deployments" → Should show exactly 1 active

**If you see more than 1 active deployment per service → Ghost!**

---

### 2. Check Polling Frequency

**Database query:**
```sql
-- Check daemon heartbeat frequency
SELECT 
  id,
  workerType,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_ago
FROM WorkerInstance
WHERE status = 'RUNNING'
ORDER BY lastHeartbeatAt DESC;
```

**Expected for your setup:**
```
schedule_daemon | lastHeartbeatAt: <recent> | seconds_ago: <60 if within hour>
job_worker      | lastHeartbeatAt: <recent> | seconds_ago: <30 if within 30s>
```

**If seconds_ago is increasing → Process is dead/stuck**

---

### 3. Check Schedule Execution History

```sql
-- When did daemon last check schedules?
SELECT 
  id,
  name,
  lastRunAt,
  nextRunAt,
  TIMESTAMPDIFF(MINUTE, lastRunAt, NOW()) as minutes_since_last
FROM JobSchedule
WHERE enabled = true
ORDER BY lastRunAt DESC;
```

**For hourly daemon:**
- `minutes_since_last` should be ~60 (if schedule is enabled and due)

---

### 4. Check Job Processing Rate

```sql
-- How fast are jobs being processed?
SELECT 
  COUNT(*) as queued_jobs,
  MAX(queuedAt) as oldest_queued
FROM JobRun
WHERE status = 'QUEUED';
```

**Healthy signs:**
- `queued_jobs` = 0-5 (for pre-launch)
- `oldest_queued` < 5 minutes ago (if any queued)

**Problem signs:**
- `queued_jobs` > 50 (backlog building)
- `oldest_queued` > 1 hour ago (worker not processing)

---

## Conservative Pre-Launch Settings Summary

```env
# web-server service
EMBEDDED_JOB_WORKER=true
JOB_WORKER_POLL_INTERVAL_MS=30000           # Every 30 seconds
SCHEDULE_DAEMON_ENABLED=false               # NOT in web server

# schedule-daemon service
SCHEDULE_DAEMON_ENABLED=true                # ONLY in daemon service
SCHEDULE_POLL_INTERVAL_MS=3600000           # Every 1 HOUR
EMBEDDED_JOB_WORKER=false                   # NOT in daemon
```

**What this gives you:**
- ✅ 2 Railway services (clear, controlled)
- ✅ Schedule checks: Once per hour (not aggressive)
- ✅ Job checks: Every 30 seconds (not 5 seconds)
- ✅ No ghost processes (env vars prevent it)
- ✅ Minimal resource usage (pre-launch appropriate)
- ✅ Low cost (~$10-20/mo)

---

## When to Adjust Settings

### As You Grow

**10 users:**
- Keep hourly schedule checks
- Keep 30s job polling
- Monitor queue depth

**100 users:**
- Consider 15-minute schedule checks (900000ms)
- Reduce job polling to 10 seconds (10000ms)
- Still embedded worker is fine

**1000+ users:**
- More frequent schedules (every 5-15 minutes)
- Fast job polling (5 seconds)
- Consider separating worker to dedicated service
- Monitor resource usage

---

## Railway Dashboard Control Panel

### How to View & Kill Processes

**1. View All Services**
```
Railway Dashboard → Your Project
  └── Shows all services and their status
```

**2. View Service Details**
```
Click service → "Deployments" tab
  └── Shows active deployment (should be exactly 1)
  └── Shows logs in real-time
```

**3. Kill a Service (If Ghost Detected)**
```
Click service → Three dots → "Remove Service"
OR
Settings → Danger Zone → Delete
```

**4. Restart a Service (Safe)**
```
Click service → "Deployments" tab → Three dots on active deployment → "Restart"
```

**5. View Logs**
```
Click service → "Logs" tab
  └── Filter by time
  └── Search for "Starting" or "Polling every"
```

---

## Troubleshooting Scenarios

### Scenario 1: "I think I have 2 daemons running"

**Symptoms:**
- Jobs running twice
- Duplicate logs
- High database activity

**Check:**
```bash
railway logs --service schedule-daemon | grep "Starting"

# If you see multiple "Starting schedule daemon" messages at same time → Ghost
```

**Fix:**
1. Railway Dashboard → Count how many schedule-daemon services exist
2. If >1: Delete the extra one
3. If 1: Check env vars (SCHEDULE_DAEMON_ENABLED might be true in web-server too)
4. Set `SCHEDULE_DAEMON_ENABLED=false` in web-server service
5. Redeploy web-server

---

### Scenario 2: "Jobs aren't processing"

**Symptoms:**
- JobRuns stuck in QUEUED
- Queue depth increasing
- No job completions

**Check:**
```sql
SELECT * FROM WorkerInstance WHERE workerType = 'job_worker';
```

**If no rows:** Worker isn't running
```bash
# Check web-server logs
railway logs --service web-server | grep "job worker"

# Should see: "🔄 Starting embedded job worker"
# If not, check EMBEDDED_JOB_WORKER env var
```

**If has rows but lastHeartbeatAt is old:** Worker is stuck
```bash
# Restart web-server
railway restart --service web-server
```

---

### Scenario 3: "Schedules aren't triggering"

**Symptoms:**
- Enabled schedules never run
- nextRunAt passes but no JobRuns created

**Check:**
```sql
SELECT * FROM WorkerInstance WHERE workerType = 'schedule_daemon';
```

**If no rows:** Daemon isn't running
```bash
railway logs --service schedule-daemon

# Should see: "✅ Schedule daemon started"
```

**If has rows:** Check poll interval
```bash
railway logs --service schedule-daemon | grep "Polling every"

# Should see: "⏱️  Polling every 3600s"
# If different, check SCHEDULE_POLL_INTERVAL_MS env var
```

---

### Scenario 4: "Too many database connections"

**Symptoms:**
- "Too many connections" errors
- Database slow
- Random timeouts

**Cause:** Prisma connection pooling multiplied by processes

**Fix:**
```env
# Add to both services
DATABASE_CONNECTION_LIMIT=5   # Default is 10

# Prisma will use 5 connections per process
# 2 processes = 10 total (well under MySQL limit of 151)
```

---

## Visual Process Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         RAILWAY PROJECT                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SERVICE 1: web-server                                    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  Container: 1 process                                     │   │
│  │  Command: node backend/dist/index.js                      │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  HTTP Server (Express)                           │    │   │
│  │  │  ├─ Handles API requests                         │    │   │
│  │  │  ├─ Serves frontend                              │    │   │
│  │  │  └─ WebSocket connections                        │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  Job Worker (Embedded)                           │    │   │
│  │  │  ├─ Polls every 30 seconds                       │    │   │
│  │  │  ├─ Finds QUEUED jobs                            │    │   │
│  │  │  ├─ Locks job atomically                         │    │   │
│  │  │  ├─ Executes job                                 │    │   │
│  │  │  └─ Updates status → COMPLETED/FAILED            │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                            │   │
│  │  Env Vars:                                                │   │
│  │  • EMBEDDED_JOB_WORKER=true                               │   │
│  │  • JOB_WORKER_POLL_INTERVAL_MS=30000                      │   │
│  │  • SCHEDULE_DAEMON_ENABLED=false ⚠️  CRITICAL            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SERVICE 2: schedule-daemon                               │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  Container: 1 process                                     │   │
│  │  Command: pnpm daemon:schedules                           │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │  Schedule Daemon                                 │    │   │
│  │  │  ├─ Polls every 3600 seconds (1 HOUR)            │    │   │
│  │  │  ├─ Checks: Any schedules due now?               │    │   │
│  │  │  ├─ If yes: Call enqueueAllJobs() or            │    │   │
│  │  │  │           enqueueJobsByGroup()                │    │   │
│  │  │  ├─ Creates JobRuns with status=QUEUED           │    │   │
│  │  │  └─ Updates nextRunAt                            │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                            │   │
│  │  Env Vars:                                                │   │
│  │  • SCHEDULE_DAEMON_ENABLED=true                           │   │
│  │  • SCHEDULE_POLL_INTERVAL_MS=3600000 (1 hour!)           │   │
│  │  • EMBEDDED_JOB_WORKER=false ⚠️  CRITICAL                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         DATABASE (MySQL)                         │
├─────────────────────────────────────────────────────────────────┤
│  • JobSchedule: Schedule definitions + runtime state            │
│  • JobRun: Individual job executions (QUEUED → RUNNING → DONE)  │
│  • WorkerInstance: Active workers (heartbeats)                  │
│  • JobLog: Execution logs                                       │
└─────────────────────────────────────────────────────────────────┘

FLOW:
1. Every hour: Daemon checks schedules
2. If due: Daemon creates JobRun(status=QUEUED)
3. Every 30s: Worker checks for QUEUED jobs
4. Worker locks job atomically (prevents duplicates)
5. Worker executes job
6. Worker updates JobRun(status=COMPLETED)
```

---

## Final Checklist: Ghost-Free Deployment

**Before deploying:**
- [ ] `web-server` has `EMBEDDED_JOB_WORKER=true`
- [ ] `web-server` has `SCHEDULE_DAEMON_ENABLED=false` ⚠️
- [ ] `schedule-daemon` has `SCHEDULE_DAEMON_ENABLED=true`
- [ ] `schedule-daemon` has `EMBEDDED_JOB_WORKER=false` ⚠️
- [ ] Only 2 services total in Railway project
- [ ] `SCHEDULE_POLL_INTERVAL_MS=3600000` (1 hour)
- [ ] `JOB_WORKER_POLL_INTERVAL_MS=30000` (30 seconds)

**After deploying:**
- [ ] Check `railway status` → shows exactly 2 services
- [ ] Check logs: web-server shows "Starting embedded job worker"
- [ ] Check logs: schedule-daemon shows "Polling every 3600s"
- [ ] Run query: `SELECT * FROM WorkerInstance` → shows 2 rows (1 daemon, 1 worker)
- [ ] Wait 5 minutes, re-run query → heartbeats updated
- [ ] Enable one schedule in admin UI
- [ ] Click "Run Now" → verify job executes

---

## Summary: You Are In Control

**Your setup:**
- 2 Railway services (not 3, not 1)
- Schedule checks: Once per hour (conservative)
- Job checks: Every 30 seconds (conservative)
- Clear env var control (no ghosts possible)

**How to verify no ghosts:**
```sql
-- Should return exactly 2 rows
SELECT workerType, COUNT(*) 
FROM WorkerInstance 
WHERE status = 'RUNNING'
GROUP BY workerType;

-- Expected:
-- schedule_daemon | 1
-- job_worker      | 1
```

**If you see more than 1 of same type → You have a ghost, follow troubleshooting.**

**You're in complete control. This guide gives you the map.**
