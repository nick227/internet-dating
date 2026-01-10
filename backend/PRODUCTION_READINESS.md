# Schedule Manager: Production Readiness Checklist

## ✅ What's Solid (Architecturally Correct)

### 1. Clear Separation of Concerns
- ✅ **Schedules = trigger only**: No business logic in schedule definitions
- ✅ **Workers do real work**: Job execution remains in dedicated workers
- ✅ **Dumb, declarative, replaceable**: Schedule configs are pure data

### 2. Atomic Locking + Fault Tolerance
- ✅ **Database-level locking**: `lockedAt` + `lockedBy` fields
- ✅ **Atomic operations**: `updateMany` with WHERE clauses prevents races
- ✅ **Stalled lock cleanup**: 5-minute timeout recovers from crashes
- ✅ **Idempotent**: Multiple daemon instances won't double-execute

### 3. Production Safety Posture
- ✅ **Disabled by default**: `enabled: false` on schedule creation
- ✅ **Requires explicit enable**: Admin must toggle ON in UI
- ✅ **No surprise executions**: Safe for production deployment

### 4. Code-Defined Schedules (MVP Tradeoff)
- ✅ **Version controlled**: Changes go through git/PR review
- ✅ **No UI drift**: Schedule configs can't diverge between environments
- ✅ **Type-safe**: TypeScript definitions prevent configuration errors
- ✅ **Database = runtime state only**: `enabled`, `nextRunAt`, `lastRunAt`

### 5. Reuses Existing APIs
- ✅ **Centralized enqueue logic**: `enqueueAllJobs()`, `enqueueJobsByGroup()`
- ✅ **No drift bugs**: Schedule daemon and admin UI use same code path
- ✅ **Dependency resolution**: Automatic via `resolveJobDependencies()`
- ✅ **Consistent metadata**: All JobRuns get correct `trigger`, `scheduleId`

---

## ⚠️ Real Risks (Addressed in MVP)

### 1. Daemon Lifecycle ≠ Job Lifecycle
**Risk**: If daemon dies, nothing runs → silent failure.

**Mitigation (✅ DONE)**:
- Added `checkScheduleDaemonHealth.ts` monitoring script
- Exit code 0 (healthy) / 1 (unhealthy)
- 5-minute heartbeat threshold
- See `ALERTING_SETUP.md` for integration options

**Action Required**: Set up alerting (choose one):
- Simple: Cron job + email (5 minutes)
- Production: Prometheus/Datadog/CloudWatch

---

### 2. nextRunAt Corruption Risk
**Risk**: Bad cron parse or timezone bug → permanent schedule stall.

**Mitigation (✅ DONE)**:
- Added INVARIANT: `if enabled=true AND nextRunAt IS NULL → recompute on daemon start`
- Logs warning when recovery occurs
- Prevents manual SQL edits from breaking schedules

**Future Enhancement**:
- Add validation endpoint to test cron expressions before enabling
- Add "dry-run" mode to preview next 10 runs

---

### 3. SKIP Missed Runs (Semantics Clarity)
**Risk**: Admins assume catch-up behavior, wonder why jobs didn't run.

**Mitigation (✅ DONE)**:
- Prominent warning banner in UI
- Tooltip on "Next Run" column explaining SKIP policy
- Clear messaging: "Missed runs are skipped permanently"

**Why SKIP is Correct for MVP**:
- Catch-up = complex queue management
- Risk of queue flooding after long downtime
- Most jobs are idempotent recomputations (safe to skip)

**Future Enhancement** (Week 2+):
- Add optional `catchUpPolicy: 'SKIP' | 'RUN_ONCE' | 'RUN_ALL_MISSED'` per schedule
- For now, "Run Now" button handles immediate execution needs

---

### 4. Enqueue Fan-Out (Queue Spike Risk)
**Risk**: "Run all jobs" = 20+ JobRuns at once → worker overload.

**Current State**: Acceptable for MVP because:
- Dependencies ensure serial execution within waves
- Job workers already handle queuing
- Most deployments have <50 jobs

**Future Enhancement** (Non-MVP):
- Soft rate limit: stagger enqueue by 500ms per job
- Or: enforce max batch size (10 at a time)
- Monitor: job queue depth metric + alert if >100

---

### 5. PM2 Race Conditions (Cosmetic Issue)
**Risk**: PM2 restarts can briefly spawn 2 daemons → duplicate logs.

**Current State**: Acceptable because:
- Atomic locking prevents duplicate execution
- Logs will show "attempted run, skipped (locked)"
- Worst case: harmless noise in logs

**If This Becomes a Problem**:
- Add `lockfile` check on daemon startup
- Or: Use PM2 `max_restarts` + `min_uptime` to prevent flapping
- Or: Switch to systemd with `RestartSec=5`

---

## 📋 Deployment Checklist

### Before First Deploy
- [ ] Run migration: `pnpm prisma migrate deploy`
- [ ] Start daemon: `pm2 start "pnpm tsx scripts/scheduleDaemon.ts" --name schedule-daemon`
- [ ] Verify daemon registered: `pm2 logs schedule-daemon` (should see "✅ Schedule daemon started")
- [ ] Check database: `SELECT * FROM JobSchedule` (should have 3 schedules, all `enabled=false`)

### Set Up Monitoring (Critical!)
- [ ] Choose alerting option from `ALERTING_SETUP.md`
- [ ] Test health check: `pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts`
- [ ] Verify alert fires when daemon stopped
- [ ] Document incident response: "Who gets paged? What's the runbook?"

### Enable First Schedule
- [ ] Access admin UI: `/admin/schedules`
- [ ] Enable "Daily Full Sync" (or appropriate schedule)
- [ ] Click "Run Now" to test immediately
- [ ] Verify JobRuns created: `/admin/jobs?scheduleId=daily-full-sync`
- [ ] Monitor for 24-48 hours before enabling additional schedules

### Production Validation (Week 1)
- [ ] Daemon stays up for 7 days without restart
- [ ] Schedule executes at correct times (check `nextRunAt` vs `lastRunAt`)
- [ ] No "nextRunAt IS NULL" warnings in logs
- [ ] Alert system successfully notifies on daemon down
- [ ] Job success rate acceptable (>90%)

---

## 🚧 Future Enhancements (Non-MVP)

### Week 2-4
1. **Dashboard Metrics**
   - Schedule run success rate (per schedule)
   - Daemon uptime / restart frequency
   - Job execution duration trends

2. **UI Improvements**
   - Cron expression validator with preview
   - "Next 10 runs" preview
   - Historical run timeline chart

3. **Operational Polish**
   - Soft rate limit on enqueue (prevent queue spikes)
   - Configurable missed-run policy per schedule
   - Manual "run missed" button (admin override)

### Month 2+
4. **Advanced Scheduling**
   - Time windows: "only run between 9am-5pm ET"
   - Blackout dates: "skip on holidays"
   - Conditional execution: "only if feature flag X enabled"

5. **Multi-Daemon Support**
   - Leader election (single active scheduler)
   - Horizontal scaling for job workers (already works)
   - Regional failover

---

## 🎯 What NOT to Add to Schedules

**Keep business logic OUT of scheduling:**
- ❌ Don't add retry logic to scheduler (belongs in job definitions)
- ❌ Don't add conditional branching ("if X then schedule Y")
- ❌ Don't add data transformations
- ❌ Don't add API calls or side effects

**Schedules should ONLY**:
- ✅ Define when to trigger
- ✅ Define what to trigger (job name or group)
- ✅ Store runtime state (last run, next run)

---

## 📞 Incident Response

### Symptom: "Jobs aren't running automatically"

**Check 1**: Is daemon alive?
```bash
pm2 status schedule-daemon
# or
pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts
```

**Check 2**: Is schedule enabled?
```sql
SELECT id, enabled, nextRunAt FROM JobSchedule;
```

**Check 3**: Is nextRunAt in the future?
```sql
SELECT id, nextRunAt, NOW() FROM JobSchedule WHERE enabled = true;
```

**Fix**: Restart daemon, re-enable schedule, or manually trigger.

---

### Symptom: "Daemon keeps crashing"

**Check logs**:
```bash
pm2 logs schedule-daemon --lines 100
```

**Common causes**:
1. Database connection lost → check Prisma connection pool
2. Cron parse error → check schedule definitions for typos
3. Out of memory → increase PM2 `max_memory_restart`

**Fix**: Address root cause, then `pm2 restart schedule-daemon`

---

### Symptom: "Schedule ran twice"

**Expected if**: PM2 restarted during execution.

**Check**: Both runs should have different `lockedBy` worker IDs.

**If same worker ID**: Bug, file issue with logs.

**Fix**: No action needed, atomic locking prevented duplicate work.

---

## Summary: Ship-Ready

✅ All MVP-critical risks addressed  
✅ Production safety defaults in place  
✅ Monitoring/alerting guide provided  
✅ Clear operational runbook  

**Action**: Deploy, enable one schedule, monitor for 48 hours, done.

**The system is production-ready.**
