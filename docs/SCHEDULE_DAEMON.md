# Schedule Daemon - Setup & Usage

## Overview

The Schedule Daemon is a background process that automatically runs scheduled jobs at specified intervals. Schedules are defined in code and can be enabled/disabled via the admin UI.

## Quick Start

### 1. Run Database Migration

```bash
cd backend
npx prisma migrate deploy
# or
pnpm prisma migrate deploy
```

This creates:
- `JobSchedule` table for runtime state
- `scheduleId` column in `JobRun` table

### 2. Start the Daemon

```bash
cd backend
node --loader ts-node/esm scripts/scheduleDaemon.ts
```

Or with development reloading:

```bash
npx nodemon --exec node --loader ts-node/esm scripts/scheduleDaemon.ts
```

### 3. Enable Schedules

1. Go to `/admin/schedules` in the admin UI
2. Toggle the switch to enable "Daily Full Sync" (or any schedule)
3. Optionally, click "Run Now" to test immediately

## Schedule Definitions

Schedules are defined in code at:
```
backend/src/lib/jobs/schedules/definitions.ts
```

Example:
```typescript
{
  id: 'daily-full-sync',
  name: 'Daily Full Sync',
  description: 'Run all jobs once per day at 2am UTC',
  cron: '0 2 * * *',
  timezone: 'UTC',
  executionMode: 'ALL_JOBS'
}
```

## Cron Expression Examples

| Pattern | Description |
|---------|-------------|
| `0 2 * * *` | Daily at 2:00 AM |
| `0 * * * *` | Every hour |
| `*/15 * * * *` | Every 15 minutes |
| `*/30 * * * *` | Every 30 minutes |
| `0 */4 * * *` | Every 4 hours |
| `0 3 * * 0` | Every Sunday at 3:00 AM |

## Production Deployment

### Option 1: PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start daemon
pm2 start scripts/scheduleDaemon.ts --name schedule-daemon --interpreter node --interpreter-args "--loader ts-node/esm"

# View logs
pm2 logs schedule-daemon

# Restart
pm2 restart schedule-daemon

# Stop
pm2 stop schedule-daemon
```

### Option 2: Systemd (Linux)

Create `/etc/systemd/system/schedule-daemon.service`:

```ini
[Unit]
Description=Job Schedule Daemon
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node --loader ts-node/esm scripts/scheduleDaemon.ts
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable schedule-daemon
sudo systemctl start schedule-daemon
sudo systemctl status schedule-daemon
```

### Option 3: Railway/Docker

Add to your `Procfile`:
```
web: npm start
scheduler: node --loader ts-node/esm scripts/scheduleDaemon.ts
```

Or in `docker-compose.yml`:
```yaml
services:
  scheduler:
    image: your-app
    command: node --loader ts-node/esm scripts/scheduleDaemon.ts
    depends_on:
      - database
    restart: unless-stopped
```

## Monitoring

### Check Daemon Status

The daemon registers as a `WorkerInstance` in the database:

```sql
SELECT * FROM "WorkerInstance" WHERE "workerType" = 'schedule_daemon';
```

### View Schedule State

```sql
SELECT 
  id,
  enabled,
  "lastRunAt",
  "nextRunAt",
  "runCount",
  "failureCount",
  "lockedAt",
  "lockedBy"
FROM "JobSchedule";
```

### View Scheduled Jobs

```sql
SELECT 
  jr.id,
  jr."jobName",
  jr.status,
  jr."queuedAt",
  jr."startedAt",
  jr."finishedAt",
  jr."scheduleId",
  js.id as schedule_name
FROM "JobRun" jr
LEFT JOIN "JobSchedule" js ON jr."scheduleId" = js.id
WHERE jr."trigger" = 'CRON'
ORDER BY jr."queuedAt" DESC
LIMIT 50;
```

## Troubleshooting

### Daemon not running schedules

1. **Check if daemon is running:**
   ```bash
   pm2 status schedule-daemon
   # or
   systemctl status schedule-daemon
   ```

2. **Check daemon logs:**
   ```bash
   pm2 logs schedule-daemon --lines 100
   # or
   journalctl -u schedule-daemon -n 100
   ```

3. **Verify schedule is enabled in admin UI:**
   Go to `/admin/schedules` and check the toggle switch

4. **Check for stalled locks:**
   ```sql
   SELECT * FROM "JobSchedule" WHERE "lockedAt" IS NOT NULL;
   ```
   
   Manually clear if needed:
   ```sql
   UPDATE "JobSchedule" SET "lockedAt" = NULL, "lockedBy" = NULL;
   ```

### Schedule ran but jobs didn't execute

1. **Check if job worker is running:**
   - Schedules only create `JobRun` records
   - The job worker must be running to actually execute them

2. **Check JobRun status:**
   ```sql
   SELECT * FROM "JobRun" 
   WHERE "scheduleId" IS NOT NULL 
   ORDER BY "queuedAt" DESC LIMIT 10;
   ```

### Missed Run Policy

**Important:** If the daemon is down during a scheduled time, that run will be **SKIPPED**.

Example:
- Schedule: Run at 2:00 AM daily
- Daemon down: 1:00 AM - 3:00 AM
- Result: 2:00 AM run is skipped, next run is tomorrow at 2:00 AM

This is intentional to prevent:
- Backlog accumulation
- Thundering herd on daemon restart
- Confusion about stale data

## Adding New Schedules

1. **Edit schedule definitions:**
   ```typescript
   // backend/src/lib/jobs/schedules/definitions.ts
   export const schedules: ScheduleDefinition[] = [
     // ... existing schedules ...
     {
       id: 'new-schedule',
       name: 'New Schedule',
       description: 'Description here',
       cron: '0 */6 * * *', // Every 6 hours
       timezone: 'UTC',
       executionMode: 'GROUP',
       jobGroup: 'matching'
     }
   ];
   ```

2. **Deploy the code change**

3. **Restart the daemon:**
   ```bash
   pm2 restart schedule-daemon
   ```

4. **Enable in admin UI:**
   - Go to `/admin/schedules`
   - New schedule appears (disabled)
   - Toggle to enable

## Safety Features

- ✅ **Schedules disabled by default** - Admin must explicitly enable
- ✅ **Atomic locking** - Prevents duplicate runs across crashes/restarts
- ✅ **Stalled lock cleanup** - Auto-releases locks after 5 minutes
- ✅ **Version controlled** - Schedule config in git, not database
- ✅ **Graceful shutdown** - SIGTERM/SIGINT handled properly
- ✅ **Heartbeat monitoring** - Daemon health tracked in WorkerInstance

## Architecture

```
Schedule Definitions (code)
    ↓
Schedule Daemon polls DB every minute
    ↓
Finds enabled schedules where nextRunAt <= NOW
    ↓
Acquires lock (atomic, prevents duplicates)
    ↓
Calls enqueueAllJobs() or enqueueJobsByGroup()
    ↓
Creates JobRun records with scheduleId
    ↓
Updates schedule: lastRunAt, nextRunAt, runCount
    ↓
Releases lock
    ↓
Job Worker picks up JobRuns and executes
```

## Support

For issues or questions:
1. Check daemon logs first
2. Verify schedule configuration
3. Check database state
4. Review this documentation

**Logs location:**
- PM2: `~/.pm2/logs/`
- Systemd: `journalctl -u schedule-daemon`
- Docker: `docker logs <container>`
