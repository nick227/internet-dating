# Railway Environment Variables - Quick Reference Card

## ⚠️ CRITICAL: Prevent Ghost Processes

**Rule:** Each environment variable must be set **explicitly** to prevent confusion.

---

## Service 1: web-server

```env
# Node Environment
NODE_ENV=production

# Database
DATABASE_URL=<your-railway-mysql-url>

# Application
JWT_SECRET=<your-secret-key>
PORT=8080

# Job Worker Control (embedded in web server)
EMBEDDED_JOB_WORKER=true
JOB_WORKER_POLL_INTERVAL_MS=30000

# Schedule Daemon Control (CRITICAL - disable in web server)
SCHEDULE_DAEMON_ENABLED=false
```

**Start Command:**
```
node backend/dist/index.js
```

**Expected Logs:**
```
[server] ✓ Listening on {"address":"0.0.0.0","port":8080}
[server] 🔄 Starting embedded job worker
[server] Job worker poll interval: 30000ms
[server] ✓ Job worker started
[worker] Job worker started (ID: <uuid>)
```

---

## Service 2: schedule-daemon

```env
# Node Environment
NODE_ENV=production

# Database
DATABASE_URL=<same-as-web-server>

# Schedule Daemon Control (CRITICAL - enable only here)
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000

# Job Worker Control (CRITICAL - disable in daemon)
EMBEDDED_JOB_WORKER=false
```

**Start Command:**
```
cd backend && pnpm daemon:schedules
```

**Expected Logs:**
```
🚀 Starting schedule daemon (production mode)
✅ Schedule daemon registered: <uuid>
📋 Synced 3 schedule definitions from code
✅ Schedule daemon started
⏱️  Polling every 3600s
```

---

## Variable Reference

| Variable | Purpose | Pre-Launch Value | Production Value | Notes |
|----------|---------|------------------|------------------|-------|
| `EMBEDDED_JOB_WORKER` | Enable job worker in web process | `true` | `false` (when separated) | **Web only** |
| `JOB_WORKER_POLL_INTERVAL_MS` | How often worker checks for jobs | `30000` (30s) | `5000` (5s) | Milliseconds |
| `SCHEDULE_DAEMON_ENABLED` | Enable schedule daemon | `false` (web)<br/>`true` (daemon) | Same | **Critical to set correctly** |
| `SCHEDULE_POLL_INTERVAL_MS` | How often daemon checks schedules | `3600000` (1hr) | `900000` (15min) | Milliseconds |

---

## Common Polling Intervals

```javascript
// Job Worker
5000       // 5 seconds   (production, high traffic)
10000      // 10 seconds  (production, medium traffic)
30000      // 30 seconds  (pre-launch, low traffic)
60000      // 1 minute    (very low traffic)

// Schedule Daemon
60000      // 1 minute    (aggressive, development)
300000     // 5 minutes   (frequent checks)
900000     // 15 minutes  (production default)
1800000    // 30 minutes  (infrequent)
3600000    // 1 hour      (pre-launch, very infrequent)
7200000    // 2 hours     (minimal checks)
```

---

## Safety Checklist

**Before deploying, verify:**

✅ `web-server` service:
  - [ ] `EMBEDDED_JOB_WORKER=true`
  - [ ] `SCHEDULE_DAEMON_ENABLED=false` ⚠️

✅ `schedule-daemon` service:
  - [ ] `SCHEDULE_DAEMON_ENABLED=true`
  - [ ] `EMBEDDED_JOB_WORKER=false` ⚠️

✅ Only 2 services in Railway project

✅ No duplicate service names

---

## Verification Queries

**Check active workers:**
```sql
SELECT 
  workerType, 
  COUNT(*) as count,
  MAX(lastHeartbeatAt) as last_heartbeat
FROM WorkerInstance
WHERE status = 'RUNNING'
GROUP BY workerType;
```

**Expected result:**
```
job_worker       | 1 | <recent timestamp>
schedule_daemon  | 1 | <recent timestamp>
```

**If you see count > 1 for any type → GHOST PROCESS!**

---

## Quick Commands

**View Railway services:**
```bash
railway status
```

**View service logs:**
```bash
railway logs --service web-server
railway logs --service schedule-daemon
```

**Restart a service:**
```bash
railway restart --service web-server
railway restart --service schedule-daemon
```

**Check environment variables:**
```bash
railway variables --service web-server
railway variables --service schedule-daemon
```

---

## Troubleshooting

### "I think I have ghost processes"

1. Check Railway dashboard → Should see exactly 2 services
2. Run verification query (above)
3. If count > 1: Check for duplicate services or wrong env vars
4. Fix env vars, redeploy

### "Jobs aren't processing"

1. Check: `railway logs --service web-server | grep "job worker"`
2. Should see: "🔄 Starting embedded job worker"
3. If not: Check `EMBEDDED_JOB_WORKER` is set to `true`
4. Restart: `railway restart --service web-server`

### "Schedules aren't running"

1. Check: `railway logs --service schedule-daemon | grep "Polling"`
2. Should see: "⏱️  Polling every 3600s"
3. If not: Check `SCHEDULE_POLL_INTERVAL_MS` value
4. Restart: `railway restart --service schedule-daemon`

---

## Copy-Paste Template

**For Railway UI:**

```
Service: web-server
Variables:
NODE_ENV=production
EMBEDDED_JOB_WORKER=true
JOB_WORKER_POLL_INTERVAL_MS=30000
SCHEDULE_DAEMON_ENABLED=false
DATABASE_URL=<your-mysql-url>
JWT_SECRET=<your-secret>
```

```
Service: schedule-daemon
Variables:
NODE_ENV=production
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000
EMBEDDED_JOB_WORKER=false
DATABASE_URL=<same-as-web-server>
```

---

## Migration Path (When You Scale)

**Current (Pre-Launch):**
- 2 services
- Job worker embedded in web server
- Schedule checks every 1 hour

**Future (Production Scale):**
- 3 services (add dedicated job-worker)
- Faster polling (5-15 seconds for jobs, 15 minutes for schedules)
- Can scale workers independently

**To migrate:**
1. Set `EMBEDDED_JOB_WORKER=false` on web-server
2. Create new Railway service: "job-worker"
3. Set `EMBEDDED_JOB_WORKER=true` on job-worker
4. Start command: `cd backend && pnpm worker:jobs`
5. Deploy

---

## Summary

**2 Services = 2 Processes = Complete Control**

- Service 1 = Web + Worker (embedded)
- Service 2 = Schedule Daemon (isolated)

**No ghosts if env vars set correctly. You're in control.**
