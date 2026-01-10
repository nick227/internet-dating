# Schedule Daemon Management Guide

**Quick Answer to Your Questions:**

1. **Do you have to start anything?** → No manual start on Railway (automatic)
2. **After push, will daemon run on Railway?** → YES, if service is configured
3. **Is daemon running on localhost?** → Probably NO (not started by default)
4. **How to review/manage it?** → See below

---

## Current Status Check

### Check If Daemon is Running Locally

```powershell
# Check for running processes
Get-Process | Where-Object { $_.ProcessName -eq "node" } | 
  ForEach-Object { 
    $_ | Select-Object Id, @{N="CommandLine";E={(Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine}}
  } | 
  Where-Object { $_.CommandLine -like "*scheduleDaemon*" }

# If nothing returned: Daemon is NOT running locally
```

**Your current status:**
- ✅ Web server running on port 3001
- ❓ Daemon status: Unknown (need to check)

---

## Local Development: How to Run Daemon

### Option 1: Start Daemon Manually (Recommended for Testing)

```powershell
# Terminal 1: Web server (already running)
cd backend
pnpm dev

# Terminal 2: Schedule daemon (NEW - start this)
cd backend
pnpm daemon:schedules
```

**Expected output (Terminal 2):**
```
🚀 Starting schedule daemon (development mode)
✅ Schedule daemon registered: schedule_daemon_<uuid>
📋 Synced 4 schedule definitions from code
✅ Schedule daemon started
⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)
📋 Loaded 4 schedule definitions from code
⏱️  Polling every 60s
🔒 Lock timeout: 3600s
```

**If you see:**
```
⏸️  Schedule daemon DISABLED (SCHEDULE_DAEMON_ENABLED=false)
```

**Fix:** Create/edit `backend/.env`:
```env
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=10000  # 10 seconds for local testing
LOCK_TIMEOUT_MS=1800000  # 30 minutes for local
```

---

### Option 2: Auto-Start with Web Server (Not Recommended)

**Don't do this.** We've removed embedded worker architecture for good reasons.

---

## Railway: Automatic Daemon on Push

### Current Railway Setup

You have **ONE** Railway configuration file:
- `railway.json` → Configures the **web-server** service only

You have **ONE** Railway daemon config (not active):
- `railway.daemon.toml` → Template for daemon service (not linked yet)

---

### What Happens When You Push to Railway NOW

```bash
git push origin main
```

**Result:**
1. ✅ Railway builds your code
2. ✅ Railway deploys **web-server** service (using `railway.json`)
3. ❌ Railway does **NOT** deploy daemon (no service configured)

**Why:**
- Railway doesn't automatically create services from `.toml` files
- You must manually create the `schedule-daemon` service in Railway UI
- Or use Railway CLI to create it

---

### How to Set Up Daemon on Railway (One-Time Setup)

#### Step 1: Create Schedule-Daemon Service in Railway

**Option A: Via Railway Web UI**

1. Go to Railway dashboard: https://railway.app
2. Select your project: `internet-dating.com`
3. Click **"+ New"** → **"Empty Service"**
4. Name it: `schedule-daemon`
5. Click **"Settings"**
6. Scroll to **"Source"**
7. Click **"Connect to GitHub Repo"**
8. Select same repo: `internet-dating.com`
9. Set **"Root Directory"** (if needed): leave empty
10. Set **"Custom Start Command"**: `cd backend && pnpm daemon:schedules`

**Option B: Via Railway CLI** (Requires login)

```powershell
# Login first
railway login

# Link to your project
railway link

# Create new service
railway service create schedule-daemon

# The service will be created but not yet configured
```

---

#### Step 2: Configure Environment Variables

In Railway UI, go to `schedule-daemon` service → **Variables** tab:

**Add these 5 variables:**

```env
NODE_ENV=production
DATABASE_URL=<copy-from-web-server-service>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000
LOCK_TIMEOUT_MS=3600000
```

**How to get DATABASE_URL:**
1. Go to your `web-server` service in Railway
2. Click **"Variables"** tab
3. Find `DATABASE_URL`
4. Copy the value
5. Paste into daemon service

---

#### Step 3: Set Custom Start Command

In Railway UI, go to `schedule-daemon` service → **Settings** → **Deploy**:

**Custom Start Command:**
```
cd backend && pnpm daemon:schedules
```

**Build Command:** (Should auto-detect, but if needed)
```
pnpm install --prod=false && pnpm -w run build:railway
```

---

#### Step 4: Deploy

**Option A: Deploy via UI**
1. Click **"Deploy"** button in Railway UI

**Option B: Deploy via Git Push**
```powershell
git push origin main
```

**Railway will:**
1. Detect changes
2. Build both services (web-server + schedule-daemon)
3. Deploy both services
4. Start daemon automatically

---

### Step 5: Verify Daemon is Running on Railway

**Check Logs:**
```powershell
# If you have Railway CLI logged in
railway logs --service schedule-daemon

# Expected output:
# 🚀 Starting schedule daemon (production mode)
# ✅ Schedule daemon started
# ⏱️  Polling every 3600s
```

**Check Database:**

Connect to your Railway MySQL and run:

```sql
SELECT 
  id,
  workerType,
  status,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_ago
FROM WorkerInstance
WHERE status = 'RUNNING'
ORDER BY lastHeartbeatAt DESC;
```

**Expected result:**
```
workerType          | status  | seconds_ago
--------------------|---------|------------
schedule_daemon     | RUNNING | 15
```

**If you see `seconds_ago > 120`:** Daemon is stalled or crashed.

---

## Management: How to Control the Daemon

### On Railway (Production)

#### Start/Stop Daemon

**Stop:**
1. Go to Railway UI → `schedule-daemon` service
2. Click **Settings** → **Service**
3. Click **"Delete Service"** (to stop permanently)
4. Or set `SCHEDULE_DAEMON_ENABLED=false` in Variables (to disable temporarily)

**Start:**
1. If deleted, recreate service (see setup above)
2. If disabled, set `SCHEDULE_DAEMON_ENABLED=true`

#### View Logs

**Via Railway UI:**
1. Go to `schedule-daemon` service
2. Click **"Deployments"** tab
3. Click on latest deployment
4. View logs in real-time

**Via Railway CLI:**
```powershell
railway logs --service schedule-daemon --tail
```

#### Restart Daemon

**Option A: Redeploy**
1. Railway UI → `schedule-daemon` service
2. Click **"Deployments"**
3. Click **⋯** on latest deployment
4. Click **"Restart"**

**Option B: Push empty commit**
```powershell
git commit --allow-empty -m "Restart daemon"
git push origin main
```

---

### On Localhost (Development)

#### Start Daemon

```powershell
cd backend
pnpm daemon:schedules
```

**Keep this terminal open.** Daemon runs in foreground.

#### Stop Daemon

Press `Ctrl+C` in the terminal running the daemon.

#### View Logs

Logs appear in the terminal where daemon is running.

#### Restart Daemon

1. Press `Ctrl+C` to stop
2. Run `pnpm daemon:schedules` again

---

## Monitoring: Check Daemon Health

### Quick Health Check (Local or Railway)

**Query 1: Is daemon registered and alive?**

```sql
SELECT 
  id,
  workerType,
  status,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_ago,
  TIMESTAMPDIFF(MINUTE, startedAt, NOW()) as uptime_minutes
FROM WorkerInstance
WHERE workerType = 'schedule_daemon'
  AND status = 'RUNNING'
ORDER BY lastHeartbeatAt DESC
LIMIT 1;
```

**Healthy if:**
- Returns 1 row
- `seconds_ago < 120` (heartbeat within 2 minutes)
- `status = 'RUNNING'`

**Unhealthy if:**
- Returns 0 rows → Daemon not running
- `seconds_ago > 300` → Daemon stalled/crashed
- `status = 'STOPPED'` → Daemon shut down

---

**Query 2: Are schedules being executed?**

```sql
SELECT 
  scheduleId,
  COUNT(*) as total_runs,
  MAX(startedAt) as last_run,
  TIMESTAMPDIFF(MINUTE, MAX(startedAt), NOW()) as minutes_since_last
FROM JobRun
WHERE scheduleId IS NOT NULL
  AND createdAt > NOW() - INTERVAL 24 HOUR
GROUP BY scheduleId;
```

**Expected:**
- If schedules are enabled, you should see recent runs
- `minutes_since_last` should match schedule frequency

---

**Query 3: Check for stalled locks**

```sql
SELECT 
  id,
  lockedAt,
  lockedBy,
  TIMESTAMPDIFF(MINUTE, lockedAt, NOW()) as lock_age_minutes
FROM JobSchedule
WHERE lockedAt IS NOT NULL;
```

**Healthy if:**
- Returns 0 rows (no active locks)
- Or `lock_age_minutes < 30` (lock is recent, jobs running)

**Unhealthy if:**
- `lock_age_minutes > 60` → Lock is stalled, daemon crashed mid-execution

---

### Health Check Script (Local or Railway)

**Run manually:**

```powershell
cd backend
pnpm daemon:health
```

**Expected output:**
```
✅ Daemon is healthy
   Worker ID: schedule_daemon_xyz
   Last heartbeat: 15 seconds ago
   Uptime: 45 minutes
```

**Or:**
```
❌ Daemon is unhealthy
   Last heartbeat: 10 minutes ago (expected < 5 min)
   Action: Restart daemon
```

---

## Common Scenarios

### Scenario 1: Fresh Deploy to Railway (First Time)

**Status:** No daemon service exists yet.

**Actions:**
1. ✅ Push code to Railway (`git push origin main`)
2. ✅ Create `schedule-daemon` service in Railway UI (see setup above)
3. ✅ Set 5 environment variables
4. ✅ Set custom start command
5. ✅ Deploy
6. ✅ Verify in database (check WorkerInstance table)

---

### Scenario 2: Daemon Already Running on Railway

**Status:** Service exists, just pushing updates.

**Actions:**
1. ✅ Just push: `git push origin main`
2. ✅ Railway auto-deploys both services
3. ✅ Verify logs: `railway logs --service schedule-daemon`

**No manual intervention needed.**

---

### Scenario 3: Testing Locally Before Railway

**Status:** Want to test daemon on localhost first.

**Actions:**
1. ✅ Create/edit `backend/.env`:
   ```env
   SCHEDULE_DAEMON_ENABLED=true
   SCHEDULE_POLL_INTERVAL_MS=10000  # 10 seconds for testing
   LOCK_TIMEOUT_MS=1800000
   ```

2. ✅ Start daemon in separate terminal:
   ```powershell
   cd backend
   pnpm daemon:schedules
   ```

3. ✅ Enable a schedule in admin UI: `http://localhost:3001/admin/schedules`

4. ✅ Click "Run Now" to test

5. ✅ Watch daemon terminal for execution logs

6. ✅ When satisfied, push to Railway

---

### Scenario 4: Daemon Not Running (How to Check)

**Symptoms:**
- Schedules don't execute
- No recent JobRun records
- Admin UI shows schedules but nothing happens

**Diagnosis:**

**Step 1:** Check WorkerInstance table
```sql
SELECT * FROM WorkerInstance 
WHERE workerType = 'schedule_daemon' 
  AND status = 'RUNNING';
```

**If returns 0 rows:**
- Daemon is not running
- Check Railway logs
- Check environment variables

**Step 2:** Check Railway service status
1. Go to Railway UI
2. Find `schedule-daemon` service
3. Check if service exists
4. Check if deployment succeeded
5. Check logs for errors

**Step 3:** Check environment variables
- `SCHEDULE_DAEMON_ENABLED=true` ✓
- `DATABASE_URL` set correctly ✓
- `NODE_ENV=production` ✓

---

## Troubleshooting

### Problem: Daemon exits immediately

**Symptom:**
```
⏸️  Schedule daemon DISABLED (SCHEDULE_DAEMON_ENABLED=false)
```

**Fix:**
Set `SCHEDULE_DAEMON_ENABLED=true` in Railway variables or `.env`

---

### Problem: Can't connect to database

**Symptom:**
```
Error: P1001: Can't reach database server
```

**Fix:**
1. Check `DATABASE_URL` is correct
2. Verify Railway MySQL service is running
3. Check database is same as web-server

---

### Problem: Daemon running but not executing schedules

**Symptom:**
- WorkerInstance shows daemon running
- But no JobRun records created

**Diagnosis:**
1. Check if schedules are **enabled** in admin UI
2. Check `nextRunAt` in JobSchedule table:
   ```sql
   SELECT id, enabled, nextRunAt 
   FROM JobSchedule;
   ```
3. If `nextRunAt` is in future → Wait for that time
4. If `nextRunAt` is NULL → Go to admin UI, toggle schedule off/on

**Fix:**
- Enable schedules in admin UI: `/admin/schedules`
- Or manually trigger: Click "Run Now"

---

### Problem: Duplicate executions

**Symptom:**
- Same job runs twice at same time
- Multiple JobRun records with same startedAt

**Diagnosis:**
- Check `LOCK_TIMEOUT_MS` value
- Check if multiple daemon instances running:
   ```sql
   SELECT COUNT(*) FROM WorkerInstance 
   WHERE workerType = 'schedule_daemon' 
     AND status = 'RUNNING';
   ```
   Should return: **1**

**Fix:**
1. If multiple daemons: Stop extra instances
2. If `LOCK_TIMEOUT_MS` too short: Increase to 3600000 (1 hour)
3. See `LONG_RUNNING_JOB_ANALYSIS.md` for details

---

## Summary Checklist

### ✅ To Start Daemon Locally (Testing)

- [ ] Create `backend/.env` with `SCHEDULE_DAEMON_ENABLED=true`
- [ ] Open new terminal
- [ ] Run `cd backend && pnpm daemon:schedules`
- [ ] Keep terminal open
- [ ] Verify in database: `SELECT * FROM WorkerInstance WHERE workerType='schedule_daemon'`

---

### ✅ To Start Daemon on Railway (Production)

- [ ] Create `schedule-daemon` service in Railway UI (one-time setup)
- [ ] Set 5 environment variables (see above)
- [ ] Set custom start command: `cd backend && pnpm daemon:schedules`
- [ ] Push code: `git push origin main`
- [ ] Railway auto-deploys
- [ ] Verify in logs: `railway logs --service schedule-daemon`
- [ ] Verify in database: `SELECT * FROM WorkerInstance`

---

### ✅ To Check If Daemon is Running

**Local:**
- Check terminal (should be running in foreground)
- Or query database: `SELECT * FROM WorkerInstance`

**Railway:**
- Check Railway UI → `schedule-daemon` service → Deployments → Logs
- Or query database: `SELECT * FROM WorkerInstance`

---

### ✅ To Stop Daemon

**Local:**
- Press `Ctrl+C` in daemon terminal

**Railway:**
- Set `SCHEDULE_DAEMON_ENABLED=false` in variables (temporary)
- Or delete `schedule-daemon` service (permanent)

---

## Quick Commands Reference

```powershell
# Local: Start daemon (keep terminal open)
cd backend
pnpm daemon:schedules

# Local: Check health
pnpm daemon:health

# Railway: View logs (requires login)
railway login
railway link
railway logs --service schedule-daemon --tail

# Railway: Restart (push empty commit)
git commit --allow-empty -m "Restart daemon"
git push origin main

# Database: Check daemon status
# Run in MySQL client:
SELECT * FROM WorkerInstance WHERE workerType='schedule_daemon';

# Database: Check recent schedule executions
SELECT scheduleId, MAX(startedAt) as last_run 
FROM JobRun 
WHERE scheduleId IS NOT NULL 
GROUP BY scheduleId;
```

---

## Bottom Line

**Do you have to start anything?**
- **Railway:** No. Automatic after one-time setup.
- **Local:** Yes. Run `pnpm daemon:schedules` in separate terminal.

**After push, will daemon run on Railway?**
- **Yes**, if `schedule-daemon` service is configured (one-time setup required).
- **No**, if service doesn't exist yet (you must create it first).

**Is daemon running on localhost?**
- **Probably NO** (not started by default).
- Check: `Get-Process | Where { $_.ProcessName -eq "node" }` and look for `scheduleDaemon` in command line.
- Or query database: `SELECT * FROM WorkerInstance WHERE workerType='schedule_daemon'`

**How to review/manage it?**
- **Local:** Check terminal where it's running
- **Railway:** Check Railway UI logs or run `railway logs --service schedule-daemon`
- **Database:** Query `WorkerInstance` table
- **Health script:** Run `pnpm daemon:health`

---

**Next step:** Decide if you want to:
1. Test locally first → Follow "Scenario 3"
2. Deploy to Railway now → Follow "Scenario 1"
