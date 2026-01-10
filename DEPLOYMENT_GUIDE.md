# Schedule Manager: Complete Deployment Guide

## Overview

The schedule daemon is a **separate process** from your main web server. You need to:
1. Deploy the web server (handles API + admin UI)
2. Deploy the schedule daemon (handles automatic job triggering)

---

## Local Development Setup

### 1. Configure Environment
```bash
# backend/.env
NODE_ENV="development"
SCHEDULE_DAEMON_ENABLED="true"
SCHEDULE_POLL_INTERVAL_MS="10000"  # 10 seconds for faster testing
DATABASE_URL="mysql://root:password@localhost:3306/internet_date"
```

### 2. Run Database Migration
```bash
cd backend
pnpm prisma migrate dev
```

### 3. Start Services (3 Terminal Windows)

**Terminal 1: Web Server**
```bash
cd backend
pnpm dev
# Runs on http://localhost:3001
```

**Terminal 2: Job Worker**
```bash
cd backend
pnpm worker:jobs
# Processes queued jobs
```

**Terminal 3: Schedule Daemon**
```bash
cd backend
pnpm tsx scripts/scheduleDaemon.ts
# OR add to package.json:
# "daemon:schedules": "tsx scripts/scheduleDaemon.ts"
```

### 4. Verify Setup
```bash
# Check daemon registered
curl http://localhost:3001/admin/schedules

# Or in browser:
http://localhost:3001/admin/schedules
# Should see 4 schedules (3 prod + 1 dev-only)
```

### 5. Test a Schedule
1. Go to `http://localhost:3001/admin/schedules`
2. Enable "Dev Quick Test" (runs every 5 minutes)
3. Click "Run Now" to test immediately
4. Go to `http://localhost:3001/admin/jobs`
5. Verify JobRuns were created

---

## Railway Production Deployment

Railway requires **2 separate services** for the same repo:
1. **Web Service** (main API server)
2. **Daemon Service** (schedule daemon)

### Step 1: Deploy Web Service (Existing)

Your existing Railway service runs the web server:

**railway.json:**
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --prod=false && pnpm -w run build:railway"
  },
  "deploy": {
    "startCommand": "node backend/dist/index.js",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**Environment Variables (Railway Web Service):**
```env
NODE_ENV=production
DATABASE_URL=<your-railway-mysql-url>
SCHEDULE_DAEMON_ENABLED=false  # ❗ IMPORTANT: disable on web service
```

### Step 2: Create Daemon Service (New)

**Option A: Via Railway UI (Recommended)**

1. In Railway dashboard, click "+ New Service"
2. Choose "Empty Service"
3. Name it: `schedule-daemon`
4. Link it to the same GitHub repo
5. Set **Environment Variables**:
   ```env
   NODE_ENV=production
   DATABASE_URL=<same-as-web-service>
   SCHEDULE_DAEMON_ENABLED=true
   SCHEDULE_POLL_INTERVAL_MS=60000
   JWT_SECRET=<same-as-web-service>
   ```
6. Set **Custom Start Command**:
   ```bash
   cd backend && pnpm tsx scripts/scheduleDaemon.ts
   ```
7. Deploy!

**Option B: Via railway.toml (Advanced)**

Create `railway.daemon.toml`:
```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install --prod=false"

[deploy]
startCommand = "cd backend && pnpm tsx scripts/scheduleDaemon.ts"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

Deploy with:
```bash
railway up --service schedule-daemon -c railway.daemon.toml
```

### Step 3: Verify Railway Deployment

**Check daemon logs:**
```bash
railway logs --service schedule-daemon
```

**Expected output:**
```
🚀 Starting schedule daemon (production mode)
✅ Schedule daemon registered: <uuid>
📋 Synced 3 schedule definitions from code
✅ Schedule daemon started
⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)
📋 Loaded 3 schedule definitions from code
⏱️  Polling every 60s
```

**Check via admin UI:**
1. Visit `https://your-app.railway.app/admin/schedules`
2. Should see 3 schedules (dev-only schedule filtered out)
3. All should be disabled by default

### Step 4: Enable First Schedule

1. Toggle "Daily Full Sync" to ON
2. Click "Run Now" to test
3. Go to `/admin/jobs` to verify JobRuns created
4. Monitor for 24-48 hours

---

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | `development` or `production` |
| `DATABASE_URL` | Yes | - | MySQL connection string |
| `SCHEDULE_DAEMON_ENABLED` | No | `true` | Set to `false` to disable daemon |
| `SCHEDULE_POLL_INTERVAL_MS` | No | `60000` | How often to check for due schedules (milliseconds) |

### When to Use Each Variable

**Local Dev:**
```env
NODE_ENV=development
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=10000  # Faster polling for testing
```

**Railway Web Service:**
```env
NODE_ENV=production
SCHEDULE_DAEMON_ENABLED=false  # ❗ Don't run daemon on web dyno
```

**Railway Daemon Service:**
```env
NODE_ENV=production
SCHEDULE_DAEMON_ENABLED=true   # This is the daemon service
SCHEDULE_POLL_INTERVAL_MS=60000
```

---

## Package.json Scripts

Add these to `backend/package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "worker:jobs": "tsx src/workers/jobWorker.ts",
    "daemon:schedules": "tsx scripts/scheduleDaemon.ts",
    "daemon:health": "tsx scripts/monitoring/checkScheduleDaemonHealth.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

---

## When Does the Daemon Start?

### Development (3 separate processes)
1. **Web Server**: `pnpm dev` → starts immediately
2. **Job Worker**: `pnpm worker:jobs` → starts immediately
3. **Schedule Daemon**: `pnpm daemon:schedules` → starts immediately

All 3 must run simultaneously.

### Production - Railway (2 separate services)
1. **Web Service**: Deploys when you push to main → starts `node backend/dist/index.js`
2. **Daemon Service**: Deploys when you push to main → starts `pnpm tsx scripts/scheduleDaemon.ts`

Both use the same codebase, different start commands.

### Production - PM2 (Single Server)
```bash
# Start all processes with PM2
pm2 start ecosystem.config.js
```

**ecosystem.config.js:**
```javascript
module.exports = {
  apps: [
    {
      name: 'web-server',
      script: 'dist/index.js',
      cwd: './backend',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        SCHEDULE_DAEMON_ENABLED: 'false'
      }
    },
    {
      name: 'job-worker',
      script: 'dist/workers/jobWorker.js',
      cwd: './backend',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'schedule-daemon',
      script: 'scripts/scheduleDaemon.ts',
      cwd: './backend',
      interpreter: 'pnpm',
      interpreter_args: 'tsx',
      instances: 1,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        SCHEDULE_DAEMON_ENABLED: 'true',
        SCHEDULE_POLL_INTERVAL_MS: '60000'
      }
    }
  ]
};
```

Start with:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Enable auto-start on server reboot
```

---

## Testing Different Environments

### Test Development Mode
```bash
# .env
NODE_ENV=development
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=10000

# Start daemon
pnpm daemon:schedules

# Expected: 4 schedules (including "Dev Quick Test")
```

### Test Production Mode
```bash
# .env
NODE_ENV=production
SCHEDULE_DAEMON_ENABLED=true
SCHEDULE_POLL_INTERVAL_MS=60000

# Start daemon
pnpm daemon:schedules

# Expected: 3 schedules (no "Dev Quick Test")
```

### Test Daemon Disabled
```bash
# .env
SCHEDULE_DAEMON_ENABLED=false

# Start daemon
pnpm daemon:schedules

# Expected: Exits immediately with message
# "⏸️  Schedule daemon DISABLED (SCHEDULE_DAEMON_ENABLED=false)"
```

---

## Monitoring & Alerts

After deployment, set up monitoring:

```bash
# Add to crontab (runs every 5 minutes)
*/5 * * * * cd /path/to/backend && pnpm daemon:health || mail -s "ALERT: Schedule Daemon Down" ops@example.com
```

See `backend/ALERTING_SETUP.md` for more options.

---

## Troubleshooting

### "Why aren't my schedules running?"

**Check 1: Is daemon enabled?**
```bash
echo $SCHEDULE_DAEMON_ENABLED
# Should be "true" (or unset, which defaults to true)
```

**Check 2: Is daemon process running?**
```bash
# Railway:
railway logs --service schedule-daemon

# PM2:
pm2 status schedule-daemon

# Development:
# Check terminal where you ran `pnpm daemon:schedules`
```

**Check 3: Is schedule enabled in UI?**
```sql
SELECT id, enabled, nextRunAt FROM JobSchedule;
```

**Check 4: Check daemon health:**
```bash
pnpm daemon:health
```

---

### "I see 4 schedules in dev but only 3 in prod"

✅ This is correct! The 4th schedule (`dev-quick-test`) has:
```typescript
environments: ['development']
```

It's automatically filtered out in production.

---

### "Daemon logs show 'skipped (locked)'"

✅ This is normal if:
- PM2 restarted and briefly ran 2 daemons
- You manually started a second daemon process

The atomic locking prevents duplicate execution. The duplicate will exit gracefully.

---

### "How do I change cron timing for a schedule?"

1. Edit `backend/src/lib/jobs/schedules/definitions.ts`
2. Change the `cron` field
3. Commit and deploy
4. Daemon will sync new definition on next poll (max 1 minute)
5. **Manual sync** (optional):
   ```bash
   # Restart daemon to sync immediately
   pm2 restart schedule-daemon
   # or on Railway: redeploy daemon service
   ```

---

## Final Checklist

### Local Development
- [ ] Create `backend/.env` with `NODE_ENV=development`
- [ ] Run `pnpm prisma migrate dev`
- [ ] Start 3 terminals: web server, job worker, schedule daemon
- [ ] Visit `/admin/schedules`, enable "Dev Quick Test"
- [ ] Verify it runs every 5 minutes (or click "Run Now")

### Railway Production
- [ ] Set web service env: `SCHEDULE_DAEMON_ENABLED=false`
- [ ] Create new service: `schedule-daemon`
- [ ] Set daemon service env: `SCHEDULE_DAEMON_ENABLED=true`
- [ ] Set daemon start command: `cd backend && pnpm tsx scripts/scheduleDaemon.ts`
- [ ] Deploy both services
- [ ] Check logs: `railway logs --service schedule-daemon`
- [ ] Visit `/admin/schedules`, enable "Daily Full Sync"
- [ ] Set up monitoring (choose from `ALERTING_SETUP.md`)

### PM2 Production
- [ ] Create `ecosystem.config.js` with 3 apps
- [ ] Run `pm2 start ecosystem.config.js`
- [ ] Run `pm2 save && pm2 startup`
- [ ] Set up cron job for health monitoring

---

## Summary

**3 Processes, 1 Codebase:**
1. Web Server (handles HTTP)
2. Job Worker (processes JobRuns)
3. Schedule Daemon (creates JobRuns on schedule)

**Railway = 2 Services:**
1. Web Service (web server + job worker combined)
2. Daemon Service (schedule daemon only)

**Environment Control:**
- Use `NODE_ENV` to filter schedules
- Use `SCHEDULE_DAEMON_ENABLED` to control if daemon runs
- Use `SCHEDULE_POLL_INTERVAL_MS` to control check frequency

**The daemon starts when YOU start it** (not automatic):
- Dev: Run `pnpm daemon:schedules` in terminal
- Railway: Configure as separate service with custom start command
- PM2: Configure in `ecosystem.config.js`
