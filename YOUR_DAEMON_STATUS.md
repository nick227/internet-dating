# Your Daemon Status - Quick Answers

## 1. Do I have to start anything?

### On Railway (Production)
**After one-time setup: NO** - Automatic

**First time: YES** - One-time setup required:
1. Create `schedule-daemon` service in Railway UI
2. Set 5 environment variables
3. Push code → Railway auto-starts it

### On Localhost (Development)
**YES** - Manual start required:
```powershell
cd backend
pnpm daemon:schedules
```

---

## 2. After we push, will a daemon be running on Railway?

### Current Status: **NO** ❌

**Why:**
- You have `railway.json` (configures web-server only)
- You have `railway.daemon.toml` (template, not active)
- Railway doesn't auto-create services from templates
- You must manually create the `schedule-daemon` service

### To Make It Run Automatically:

**One-time setup (5 minutes):**

1. **Go to Railway dashboard**
   - https://railway.app
   - Open your `internet-dating.com` project

2. **Create new service**
   - Click **"+ New"** → **"Empty Service"**
   - Name: `schedule-daemon`

3. **Connect to GitHub**
   - Settings → Source → Connect to GitHub
   - Select: `internet-dating.com` repo
   - Custom Start Command: `cd backend && pnpm daemon:schedules`

4. **Set environment variables** (Variables tab)
   ```env
   NODE_ENV=production
   DATABASE_URL=<copy-from-web-server-service>
   SCHEDULE_DAEMON_ENABLED=true
   SCHEDULE_POLL_INTERVAL_MS=3600000
   LOCK_TIMEOUT_MS=3600000
   ```

5. **Deploy**
   - Click "Deploy" in Railway UI
   - Or push code: `git push origin main`

**After setup:**
- Every push will auto-deploy daemon ✅
- No manual intervention needed ✅

---

## 3. Is a daemon currently running on localhost?

### Quick Check:

**Run this in PowerShell:**
```powershell
Get-Process | Where-Object { $_.ProcessName -eq "node" } | 
  ForEach-Object { 
    Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)" | 
    Select-Object ProcessId, CommandLine 
  } | 
  Where-Object { $_.CommandLine -like "*scheduleDaemon*" }
```

**If nothing returned:** Daemon is **NOT running** ❌

---

### Your Current Local Status:

Based on your `.env` file:
```env
DATABASE_URL="mysql://root@localhost:3306/internet_date"
# SCHEDULE_DAEMON_ENABLED is NOT set
```

**Status:** Daemon is **NOT configured** to run locally ❌

**To run locally:**

1. **Add to `backend/.env`:**
   ```env
   SCHEDULE_DAEMON_ENABLED=true
   SCHEDULE_POLL_INTERVAL_MS=10000  # 10 seconds for testing
   LOCK_TIMEOUT_MS=1800000  # 30 minutes
   ```

2. **Start daemon in new terminal:**
   ```powershell
   cd backend
   pnpm daemon:schedules
   ```

3. **Expected output:**
   ```
   🚀 Starting schedule daemon (development mode)
   ✅ Schedule daemon registered: schedule_daemon_<uuid>
   ✅ Schedule daemon started
   ⏱️  Polling every 10s
   ```

---

## 4. How to review/manage it?

### On Railway

**View Logs:**
```powershell
# Option A: Railway CLI (requires login)
railway login
railway link
railway logs --service schedule-daemon --tail

# Option B: Railway UI
# Go to dashboard → schedule-daemon service → Deployments → Logs
```

**Check Status:**
1. Railway UI → `schedule-daemon` service
2. Should show: "Deployed" with green checkmark
3. Check logs for: "Schedule daemon started"

**Restart:**
- Railway UI → Deployments → Click ⋯ → Restart
- Or push empty commit: `git commit --allow-empty -m "Restart"`

---

### On Localhost

**View Logs:**
- Logs appear in terminal where daemon is running
- Or check: `backend/logs/` (if logging to file)

**Check Status:**
- Terminal should show: "Schedule daemon started"
- Or query database (see below)

**Stop:**
- Press `Ctrl+C` in daemon terminal

**Restart:**
- Stop (Ctrl+C), then run `pnpm daemon:schedules` again

---

### Via Database (Works for Both)

**Check if daemon is alive:**
```sql
SELECT 
  id,
  workerType,
  status,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_ago
FROM WorkerInstance
WHERE workerType = 'schedule_daemon'
  AND status = 'RUNNING'
ORDER BY lastHeartbeatAt DESC;
```

**Healthy if:**
- Returns 1 row
- `seconds_ago < 120` (heartbeat within 2 minutes)

**Unhealthy if:**
- Returns 0 rows → Daemon not running
- `seconds_ago > 300` → Daemon stalled

---

**Check schedule executions:**
```sql
SELECT 
  scheduleId,
  COUNT(*) as runs,
  MAX(startedAt) as last_run,
  TIMESTAMPDIFF(MINUTE, MAX(startedAt), NOW()) as minutes_ago
FROM JobRun
WHERE scheduleId IS NOT NULL
  AND createdAt > NOW() - INTERVAL 24 HOUR
GROUP BY scheduleId;
```

**If no rows:**
- No schedules executed yet
- Either daemon not running, or no schedules enabled

---

## Summary Table

| Question | Localhost | Railway |
|----------|-----------|---------|
| **Do I start it manually?** | YES (every time) | NO (after one-time setup) |
| **Is it running now?** | NO ❌ | Unknown (need to check) |
| **How to start?** | `pnpm daemon:schedules` | Create service in UI (one-time) |
| **How to check?** | Check terminal | Check Railway logs or database |
| **How to stop?** | `Ctrl+C` | Disable in UI or set env var false |

---

## Recommended Next Steps

### Option A: Test Locally First (Recommended)

1. **Add to `backend/.env`:**
   ```env
   SCHEDULE_DAEMON_ENABLED=true
   SCHEDULE_POLL_INTERVAL_MS=10000
   LOCK_TIMEOUT_MS=1800000
   ```

2. **Start daemon:**
   ```powershell
   cd backend
   pnpm daemon:schedules
   ```

3. **Test in browser:**
   - Go to `http://localhost:3001/admin/schedules`
   - Toggle "Daily Full Sync" to ON
   - Click "Run Now"
   - Watch daemon terminal for logs

4. **When satisfied, proceed to Option B**

---

### Option B: Deploy to Railway

1. **Follow one-time setup** (see section 2 above)

2. **Push code:**
   ```powershell
   git push origin main
   ```

3. **Verify:**
   ```powershell
   railway logs --service schedule-daemon
   ```

4. **Check database:**
   ```sql
   SELECT * FROM WorkerInstance WHERE workerType='schedule_daemon';
   ```

---

## Quick Reference Commands

```powershell
# LOCAL: Start daemon
cd backend
pnpm daemon:schedules

# LOCAL: Check if running
Get-Process | Where { $_.ProcessName -eq "node" } | 
  Select Id, @{N="Cmd";E={(Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine}}

# RAILWAY: View logs (requires login)
railway logs --service schedule-daemon --tail

# RAILWAY: One-time setup
# 1. Create service in UI
# 2. Set 5 env vars
# 3. Set start command
# 4. Deploy

# DATABASE: Check status (both)
SELECT * FROM WorkerInstance WHERE workerType='schedule_daemon';
```

---

## Bottom Line

✅ **Your current state:**
- Localhost: Daemon **NOT running** (not configured)
- Railway: Daemon **NOT set up** (service doesn't exist yet)

✅ **To make it work:**
- Localhost: Add env vars, run `pnpm daemon:schedules`
- Railway: One-time setup (create service, set env vars, deploy)

✅ **After setup:**
- Localhost: Must start manually each time
- Railway: Runs automatically on every push

**See `DAEMON_MANAGEMENT_GUIDE.md` for detailed instructions.**
