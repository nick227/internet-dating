# Railway Schedule-Daemon Service: Environment Variables

**Service Name:** `schedule-daemon`  
**Start Command:** `cd backend && pnpm daemon:schedules`

---

## Required Environment Variables

### ✅ Core Configuration

```env
NODE_ENV=production
DATABASE_URL=<your-railway-mysql-url>
```

**Notes:**
- `NODE_ENV`: Must be `production` to filter out dev-only schedules
- `DATABASE_URL`: **Must be identical** to web-server service (same database)

---

### ✅ Daemon Control

```env
SCHEDULE_DAEMON_ENABLED=true
```

**Purpose:** Enables the schedule daemon to run  
**Value:** `true` (explicitly set to enable)  
**Critical:** This MUST be `true` on daemon service, `false` (or omitted) on web-server

---

### ✅ Polling Interval

```env
SCHEDULE_POLL_INTERVAL_MS=3600000
```

**Purpose:** How often daemon checks for due schedules  
**Value:** `3600000` milliseconds = 1 hour  
**Pre-Launch:** 1 hour (conservative, minimal resource usage)  
**Production:** Consider 15 minutes (`900000`) for more frequent checks

**Options:**
- `3600000` = 1 hour (pre-launch, ultra-conservative)
- `1800000` = 30 minutes (moderate frequency)
- `900000` = 15 minutes (production, recommended)
- `300000` = 5 minutes (high-frequency, not recommended for pre-launch)

---

### ✅ Lock Timeout (CRITICAL - NEW)

```env
LOCK_TIMEOUT_MS=3600000
```

**Purpose:** How long before a schedule lock is considered "stalled"  
**Value:** `3600000` milliseconds = 1 hour  
**Critical:** Must be >= expected maximum job duration  
**Safety:** Should be 2x your longest job duration

**Why This Matters:**
- If jobs take 30 minutes, set to at least 1 hour
- If jobs take 50 minutes, set to 2 hours (`7200000`)
- If set too short: Risk of duplicate executions
- See `LONG_RUNNING_JOB_ANALYSIS.md` for full details

---

## Complete Configuration

### Copy-Paste Ready (Railway UI)

```env
NODE_ENV=production
DATABASE_URL=<your-railway-mysql-url>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000
LOCK_TIMEOUT_MS=3600000
```

**Replace:** `<your-railway-mysql-url>` with actual Railway MySQL connection string

---

## What Each Variable Does

| Variable | Value | Purpose | If Wrong/Missing |
|----------|-------|---------|------------------|
| `NODE_ENV` | `production` | Filters schedule definitions | Dev schedules run in production |
| `DATABASE_URL` | Railway MySQL URL | Database connection | Daemon can't start |
| `SCHEDULE_DAEMON_ENABLED` | `true` | Enables daemon | Daemon exits immediately |
| `SCHEDULE_POLL_INTERVAL_MS` | `3600000` (1hr) | Check frequency | Uses default (60s, too frequent) |
| `LOCK_TIMEOUT_MS` | `3600000` (1hr) | Lock expiration | Uses default (1hr, OK) but undocumented |

---

## Recommended Settings by Stage

### Pre-Launch (Solo User, <100 Jobs/Day)

```env
NODE_ENV=production
DATABASE_URL=<railway-mysql-url>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000  # 1 hour (ultra-conservative)
LOCK_TIMEOUT_MS=3600000            # 1 hour
```

**Expected Behavior:**
- Daemon wakes once per hour
- Checks for due schedules
- Executes jobs inline (typically 2-10 minutes)
- Minimal resource usage

---

### Production (100+ Users, 1000+ Jobs/Day)

```env
NODE_ENV=production
DATABASE_URL=<railway-mysql-url>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=900000   # 15 minutes (more responsive)
LOCK_TIMEOUT_MS=3600000            # 1 hour
```

**Expected Behavior:**
- Daemon wakes every 15 minutes
- More responsive to schedule changes
- Still efficient (4 wake-ups/hour vs 120 with old polling)

---

### If Jobs Take >40 Minutes

```env
NODE_ENV=production
DATABASE_URL=<railway-mysql-url>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=900000   # 15 minutes
LOCK_TIMEOUT_MS=7200000            # 2 hours (increased safety)
```

**When to use:**
- Jobs regularly take 40-60 minutes
- Processing large datasets
- Heavy analytics jobs

---

## Optional Variables (Not Needed)

These are **NOT needed** for the schedule-daemon service:

❌ `EMBEDDED_JOB_WORKER` - Only for web-server (and removed in current architecture)  
❌ `JOB_WORKER_POLL_INTERVAL_MS` - Only for old polling architecture (removed)  
❌ `JWT_SECRET` - Only needed if daemon makes authenticated HTTP calls (it doesn't)  
❌ `PORT` - Daemon doesn't serve HTTP

---

## Verification After Deploy

### 1. Check Daemon Started

```bash
railway logs --service schedule-daemon | head -20
```

**Expected output:**
```
🚀 Starting schedule daemon (production mode)
✅ Schedule daemon registered: schedule_daemon_<uuid>
📋 Synced 3 schedule definitions from code
✅ Schedule daemon started
⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)
📋 Loaded 3 schedule definitions from code
⏱️  Polling every 3600s
🔒 Lock timeout: 3600s
```

**If you see:**
- `⏸️  Schedule daemon DISABLED` → Check `SCHEDULE_DAEMON_ENABLED=true`
- Database connection error → Check `DATABASE_URL`
- Immediate crash → Check logs for details

---

### 2. Check Database Registration

```sql
SELECT 
  id,
  workerType,
  status,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_ago
FROM WorkerInstance
WHERE workerType = 'schedule_daemon'
  AND status = 'RUNNING';
```

**Expected:** 1 row with `seconds_ago < 120` (recent heartbeat)

---

### 3. Check Schedules Synced

```sql
SELECT 
  id,
  enabled,
  nextRunAt
FROM JobSchedule
ORDER BY id;
```

**Expected:** 3 rows (or 4 if dev schedule included)
- `daily-full-sync`
- `hourly-matching`
- `feed-refresh`
- `dev-quick-test` (only if `NODE_ENV=development`)

---

### 4. Test Manual Trigger

1. Go to `/admin/schedules`
2. Click "Run Now" on any schedule
3. Watch daemon logs:

```bash
railway logs --service schedule-daemon --tail
```

**Expected output:**
```
⏰ Found 1 due schedule(s)
[daemon] Executing 20 jobs inline for "Daily Full Sync"
[daemon] → Executing: profileSearchIndexJob
[daemon] ✓ profileSearchIndexJob completed
...
[daemon] ✅ Schedule "Daily Full Sync" complete: 20 succeeded, 0 failed (45232ms)
```

---

## Troubleshooting

### Daemon Exits Immediately

**Symptom:**
```
⏸️  Schedule daemon DISABLED (SCHEDULE_DAEMON_ENABLED=false)
```

**Fix:**
```env
SCHEDULE_DAEMON_ENABLED=true
```

---

### Can't Connect to Database

**Symptom:**
```
Error: P1001: Can't reach database server at ...
```

**Fix:**
1. Check `DATABASE_URL` matches web-server exactly
2. Verify Railway MySQL service is running
3. Check database service name in connection string

---

### Wrong Schedules Loading

**Symptom:**
```
📋 Loaded 4 schedule definitions from code
```
(Should be 3 in production)

**Fix:**
```env
NODE_ENV=production
```
(Must be exactly `production`, not `prod` or anything else)

---

### Jobs Taking Too Long

**Symptom:**
```sql
-- This query shows locks >50 minutes old
SELECT 
  id,
  TIMESTAMPDIFF(MINUTE, lockedAt, NOW()) as lock_age_minutes
FROM JobSchedule
WHERE lockedAt IS NOT NULL;

-- lock_age_minutes = 55 (approaching timeout!)
```

**Fix:**
```env
LOCK_TIMEOUT_MS=7200000  # Increase to 2 hours
```

---

## Railway UI Steps

### Where to Set Variables

1. Go to Railway dashboard
2. Select your project
3. Click on `schedule-daemon` service
4. Click "Variables" tab
5. Add each variable:
   - Click "New Variable"
   - Enter name (e.g., `SCHEDULE_DAEMON_ENABLED`)
   - Enter value (e.g., `true`)
   - Click "Add"
6. Repeat for all variables
7. Click "Deploy" (if not auto-deployed)

---

### How to Update a Variable

1. Go to Variables tab
2. Find the variable to update
3. Click on the value
4. Edit the value
5. Press Enter or click outside
6. Railway will auto-redeploy

**Note:** Changing environment variables triggers a redeploy automatically.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│  Railway Service: schedule-daemon                        │
├─────────────────────────────────────────────────────────┤
│  Required (4 variables):                                 │
│    NODE_ENV=production                                   │
│    DATABASE_URL=<railway-mysql-url>                      │
│    SCHEDULE_DAEMON_ENABLED=true                          │
│    SCHEDULE_POLL_INTERVAL_MS=3600000                     │
│    LOCK_TIMEOUT_MS=3600000                               │
├─────────────────────────────────────────────────────────┤
│  Start Command:                                          │
│    cd backend && pnpm daemon:schedules                   │
├─────────────────────────────────────────────────────────┤
│  Expected Logs:                                          │
│    🚀 Starting schedule daemon (production mode)        │
│    ✅ Schedule daemon started                           │
│    ⏱️  Polling every 3600s                              │
│    🔒 Lock timeout: 3600s                               │
└─────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- `DEPLOYMENT_INSTRUCTIONS.md` - Full deployment guide
- `LONG_RUNNING_JOB_ANALYSIS.md` - Why `LOCK_TIMEOUT_MS` matters
- `CRITICAL_FIX_SUMMARY.md` - Lock timeout bug fix details
- `backend/ENV_VARIABLES.md` - All environment variables explained
- `SCHEDULE_JOBS_FINAL_ANALYSIS.md` - Complete system documentation

---

## Summary

**Minimum Required Variables (5):**
1. `NODE_ENV=production`
2. `DATABASE_URL=<railway-mysql-url>`
3. `SCHEDULE_DAEMON_ENABLED=true`
4. `SCHEDULE_POLL_INTERVAL_MS=3600000`
5. `LOCK_TIMEOUT_MS=3600000`

**Most Important:**
- `SCHEDULE_DAEMON_ENABLED=true` - Without this, daemon exits immediately
- `LOCK_TIMEOUT_MS=3600000` - Without this, risk of duplicate executions (uses default 1hr, but better to be explicit)

**Copy-paste this into Railway UI and replace `<railway-mysql-url>`:**
```env
NODE_ENV=production
DATABASE_URL=<railway-mysql-url>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000
LOCK_TIMEOUT_MS=3600000
```

**Done!** 🚀
