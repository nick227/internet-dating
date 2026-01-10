# Deployment Instructions: Inline Job Execution

## What Changed

**Old architecture (overcomplicated):**
```
web-server:       HTTP + embedded job worker (polling every 30s)
schedule-daemon:  Creates jobs → queue
Result:           Worker wakes 120x/hour, finds nothing 119 times
```

**New architecture (correct):**
```
web-server:       HTTP ONLY
schedule-daemon:  Checks hourly → executes jobs inline → records results
Result:           1 wake-up per hour, no waste
```

---

## Railway Configuration

### Service 1: web-server

**Environment Variables:**
```env
NODE_ENV=production
DATABASE_URL=<your-railway-mysql-url>
JWT_SECRET=<your-secret>
PORT=8080
```

**Start Command:** (Already configured)
```
node backend/dist/index.js
```

**Process:**
- HTTP server ONLY
- No job processing
- No polling
- Clean and isolated

---

### Service 2: schedule-daemon

**Environment Variables:**
```env
NODE_ENV=production
DATABASE_URL=<same-as-web-server>
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=3600000
```

**Start Command:**
```
cd backend && pnpm daemon:schedules
```

**Process:**
- Checks schedules every 1 hour
- Executes jobs inline (no queue)
- Records results in database

---

## Deployment Steps

### 1. Update Railway Environment Variables

**web-server service:**
- ✅ Keep existing env vars
- ✅ REMOVE `EMBEDDED_JOB_WORKER` (no longer needed)
- ✅ REMOVE `JOB_WORKER_POLL_INTERVAL_MS` (no longer needed)

**schedule-daemon service:**
- ✅ Keep existing env vars
- ✅ Set `SCHEDULE_POLL_INTERVAL_MS=3600000` (1 hour)

---

### 2. Deploy

```bash
git push origin main
```

Railway will auto-deploy both services.

---

### 3. Verify Deployment

**Check web-server logs:**
```bash
railway logs --service web-server | grep "Listening"

# Should see:
# [server] ✓ Listening on {"address":"0.0.0.0","port":8080}
# [server] ✓ Ready for requests

# Should NOT see:
# "Starting embedded job worker" (this is removed!)
```

**Check schedule-daemon logs:**
```bash
railway logs --service schedule-daemon | grep "Executing\|Polling"

# Should see:
# 🚀 Starting schedule daemon (production mode)
# ✅ Schedule daemon registered: <uuid>
# ⏱️  Polling every 3600s
```

---

### 4. Verify in Database

```sql
-- Should return exactly 1 row (no job_worker anymore)
SELECT workerType, COUNT(*) as count
FROM WorkerInstance
WHERE status = 'RUNNING'
GROUP BY workerType;

-- Expected:
-- schedule_daemon | 1
```

---

### 5. Enable a Schedule & Test

1. Go to `/admin/schedules`
2. Toggle "Daily Full Sync" to ON
3. Click "Run Now"
4. Watch daemon logs:

```bash
railway logs --service schedule-daemon --tail

# Should see:
# ⏰ Found 1 due schedule(s)
# ⏰ Processing schedule: Daily Full Sync
# [daemon] Executing 20 jobs inline for "Daily Full Sync"
# [daemon] → Executing: profileSearchIndexJob
# [daemon] ✓ profileSearchIndexJob completed
# [daemon] → Executing: matchScoreUpdateJob
# [daemon] ✓ matchScoreUpdateJob completed
# ...
# [daemon] ✅ Schedule "Daily Full Sync" complete: 20 succeeded, 0 failed (45232ms)
```

---

## What's Different

### Before (Polling Architecture)

```
Hour 1, minute 0:     Daemon creates jobs → Queue
Hour 1, minute 0.5:   Worker wakes, processes jobs ✓
Hour 1, minute 1:     Worker wakes, finds nothing ✗
Hour 1, minute 1.5:   Worker wakes, finds nothing ✗
...119 more useless checks...
Hour 2, minute 0:     Daemon creates jobs → Queue
```

**Total wake-ups:** 120 per hour  
**Useful wake-ups:** 1 per hour  
**Waste:** 99.2%

---

### After (Inline Execution)

```
Hour 1, minute 0:   Daemon wakes → executes all jobs → records ✓
...silence for 1 hour...
Hour 2, minute 0:   Daemon wakes → executes all jobs → records ✓
```

**Total wake-ups:** 1 per hour  
**Useful wake-ups:** 1 per hour  
**Waste:** 0%

---

## Verification Checklist

After deployment, verify:

- [ ] Web server responds to HTTP requests
- [ ] Web server logs show NO "job worker" messages
- [ ] Schedule daemon logs show "Polling every 3600s"
- [ ] Database shows only 1 worker (schedule_daemon)
- [ ] Admin UI at `/admin/schedules` loads
- [ ] "Run Now" button executes jobs immediately
- [ ] Jobs appear in `/admin/jobs` history
- [ ] Job execution visible in daemon logs

---

## Troubleshooting

### "Jobs aren't executing"

**Check daemon logs:**
```bash
railway logs --service schedule-daemon
```

**Common issues:**
1. `SCHEDULE_DAEMON_ENABLED=false` → Set to `true`
2. No enabled schedules → Go to admin UI, enable one
3. Daemon crashed → Check logs for errors, restart service

---

### "Web server is slow"

**This should NOT happen anymore** - jobs don't run in web server.

If still slow, check:
1. Database connection pool size
2. Number of concurrent requests
3. Railway service resources

---

### "I see errors about enqueueAllJobs"

**Old code still present** - make sure you deployed latest commit.

```bash
git log -1 --oneline
# Should show: "Implement inline job execution in schedule daemon"
```

---

## Rollback (If Needed)

If something goes wrong:

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or deploy a specific commit
git checkout <previous-commit-hash>
git push origin main --force
```

---

## What You Gain

**Simplicity:**
- One process per responsibility
- No coordination between processes
- Easy to understand logs

**Efficiency:**
- No wasted polling
- No queue management overhead
- Minimal database connections

**Reliability:**
- Web server isolated from job crashes
- Job failures don't affect HTTP
- Clear separation of concerns

**Cost:**
- Lower CPU usage (no polling)
- Lower database load (fewer queries)
- Same Railway cost (still 2 services)

---

## Next Steps

After successful deployment:

1. **Monitor for 24 hours**
   - Check daemon logs periodically
   - Verify jobs execute at scheduled times
   - Confirm no errors

2. **Enable more schedules**
   - Start with one
   - Add more as confidence grows
   - Monitor resource usage

3. **Set up alerting**
   - See `backend/ALERTING_SETUP.md`
   - Choose monitoring option
   - Test alert fires when daemon stops

---

## Summary

**Before:** 2 services, web server had embedded worker polling 120x/hour  
**After:** 2 services, clean separation, 1 wake-up per hour  

**Deploy:** Push to main → Railway auto-deploys → Verify logs  
**Result:** Simpler, more efficient, production-ready
