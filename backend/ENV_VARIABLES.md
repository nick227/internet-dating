# Environment Variables for Schedule Manager

## Required Variables

```env
# Database connection
DATABASE_URL="mysql://user:password@localhost:3306/internet_date"

# Environment mode
NODE_ENV="development"  # or "production"
```

## Schedule Daemon Variables

### SCHEDULE_DAEMON_ENABLED
**Type:** Boolean (`"true"` or `"false"`)  
**Default:** `"true"`  
**Purpose:** Enable or disable the schedule daemon

```env
# Enable daemon (default)
SCHEDULE_DAEMON_ENABLED="true"

# Disable daemon (useful for web dynos in Railway)
SCHEDULE_DAEMON_ENABLED="false"
```

**When to disable:**
- On Railway web service (run daemon in separate service)
- When you only want manual job triggering
- During maintenance windows

---

### SCHEDULE_POLL_INTERVAL_MS
**Type:** Number (milliseconds)  
**Default:** `60000` (1 minute)  
**Purpose:** How often the daemon checks for due schedules

```env
# Production: Check every minute (recommended)
SCHEDULE_POLL_INTERVAL_MS="60000"

# Development: Check every 10 seconds (faster testing)
SCHEDULE_POLL_INTERVAL_MS="10000"

# Low-frequency: Check every 5 minutes
SCHEDULE_POLL_INTERVAL_MS="300000"
```

**Guidelines:**
- **Development:** 10-30 seconds for faster iteration
- **Production:** 60 seconds is optimal (balance between responsiveness and DB load)
- **Never set below 5 seconds** (unnecessary DB load)

---

## Example Configurations

### Local Development (.env)
```env
NODE_ENV="development"
DATABASE_URL="mysql://root:password@localhost:3306/internet_date"
SCHEDULE_DAEMON_ENABLED="true"
SCHEDULE_POLL_INTERVAL_MS="10000"
```

### Railway Web Service
```env
NODE_ENV="production"
DATABASE_URL="<railway-mysql-url>"
SCHEDULE_DAEMON_ENABLED="false"  # ❗ IMPORTANT
PORT="3001"
JWT_SECRET="<your-secret>"
```

### Railway Daemon Service
```env
NODE_ENV="production"
DATABASE_URL="<railway-mysql-url>"
SCHEDULE_DAEMON_ENABLED="true"   # This service runs the daemon
SCHEDULE_POLL_INTERVAL_MS="60000"
JWT_SECRET="<your-secret>"
```

### PM2 (Single Server)
```env
NODE_ENV="production"
DATABASE_URL="mysql://user:password@localhost:3306/internet_date"
SCHEDULE_DAEMON_ENABLED="true"
SCHEDULE_POLL_INTERVAL_MS="60000"
```

---

## Testing Environment Variables

### Test Daemon Enabled
```bash
# Set in .env
SCHEDULE_DAEMON_ENABLED="true"

# Start daemon
cd backend
pnpm tsx scripts/scheduleDaemon.ts

# Expected output:
# 🚀 Starting schedule daemon (development mode)
# ✅ Schedule daemon started
```

### Test Daemon Disabled
```bash
# Set in .env
SCHEDULE_DAEMON_ENABLED="false"

# Start daemon
cd backend
pnpm tsx scripts/scheduleDaemon.ts

# Expected output:
# ⏸️  Schedule daemon DISABLED (SCHEDULE_DAEMON_ENABLED=false)
# (process exits immediately)
```

### Test Environment Filtering
```bash
# Development mode
NODE_ENV="development"
pnpm tsx scripts/scheduleDaemon.ts
# Should see 4 schedules (includes dev-only schedule)

# Production mode
NODE_ENV="production"
pnpm tsx scripts/scheduleDaemon.ts
# Should see 3 schedules (dev-only schedule filtered out)
```

---

## How Environment Filtering Works

Schedules can specify which environments they're available in:

```typescript
// Available in all environments
{
  id: 'daily-full-sync',
  name: 'Daily Full Sync',
  cron: '0 2 * * *',
  // No 'environments' field = available everywhere
}

// Only in development
{
  id: 'dev-quick-test',
  name: 'Dev Quick Test',
  cron: '*/5 * * * *',
  environments: ['development']
}

// Only in production
{
  id: 'prod-weekly-cleanup',
  name: 'Weekly Cleanup',
  cron: '0 3 * * 0',
  environments: ['production']
}
```

The daemon automatically filters schedules based on `NODE_ENV`.

---

## Troubleshooting

### "Daemon isn't starting"

Check env vars:
```bash
echo $SCHEDULE_DAEMON_ENABLED
echo $NODE_ENV
```

### "Wrong number of schedules"

Check environment mode:
```bash
# Development = 4 schedules (includes dev-only)
# Production = 3 schedules (dev-only filtered out)
echo $NODE_ENV
```

### "Daemon running but schedules not executing"

Check:
1. Is schedule enabled in UI? (`enabled = true`)
2. Is `nextRunAt` in the future?
3. Is daemon heartbeat fresh? (run health check)

```bash
pnpm tsx scripts/monitoring/checkScheduleDaemonHealth.ts
```

---

## Security Notes

### Never Commit .env Files
Add to `.gitignore`:
```
.env
.env.local
.env.*.local
```

### Keep Secrets in .env
- Database passwords
- JWT secrets
- API keys

### Use Railway/Platform Secrets
For production, set env vars in Railway dashboard, not in code.

---

## Summary

**2 Key Variables:**
1. `SCHEDULE_DAEMON_ENABLED` - Turn daemon on/off
2. `SCHEDULE_POLL_INTERVAL_MS` - How often to check

**Common Patterns:**
- **Local:** Daemon enabled, fast polling (10s)
- **Railway Web:** Daemon disabled (separate service)
- **Railway Daemon:** Daemon enabled, normal polling (60s)
- **PM2:** Daemon enabled, normal polling (60s)

**Environment Filtering:**
- Use `NODE_ENV` to control which schedules are available
- Add `environments: ['development']` to dev-only schedules
- Production schedules don't need `environments` field
