# Monorepo Architecture Review: Web Server, Jobs, and Admin Control

## Repository Structure

```
internet-dating.com/
├── frontend/           # React SPA (user-facing + admin UI)
├── backend/            # Node.js Express API + Jobs System
├── shared/             # Shared types/utilities
└── docs/               # Documentation
```

**Key insight:** One codebase, multiple deployment targets

---

## Deployment Architecture

### Current (Corrected) Setup

```
┌──────────────────────────────────────────────────────────────┐
│  Railway Project: internet-dating.com                         │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────────────────┐      │
│  │  Service 1: web-server                              │      │
│  │  Code: backend/ (from same repo)                    │      │
│  │  Start: node backend/dist/index.js                  │      │
│  │                                                      │      │
│  │  Process:                                            │      │
│  │  └─ HTTP Server (Express)                           │      │
│  │     ├─ REST API endpoints                           │      │
│  │     ├─ WebSocket connections                        │      │
│  │     ├─ Serves frontend bundle (React SPA)           │      │
│  │     └─ Admin API endpoints                          │      │
│  │                                                      │      │
│  │  Does NOT:                                           │      │
│  │  ✗ Run background jobs                              │      │
│  │  ✗ Check schedules                                  │      │
│  │  ✗ Poll for work                                    │      │
│  └────────────────────────────────────────────────────┘      │
│                                                                │
│                                                                │
│  ┌────────────────────────────────────────────────────┐      │
│  │  Service 2: schedule-daemon                         │      │
│  │  Code: backend/ (from same repo)                    │      │
│  │  Start: pnpm daemon:schedules                       │      │
│  │                                                      │      │
│  │  Process:                                            │      │
│  │  └─ Schedule Daemon                                 │      │
│  │     ├─ Wakes every 1 hour                           │      │
│  │     ├─ Checks enabled schedules                     │      │
│  │     ├─ Executes jobs INLINE (no queue)              │      │
│  │     └─ Records results in database                  │      │
│  │                                                      │      │
│  │  Does NOT:                                           │      │
│  │  ✗ Serve HTTP                                       │      │
│  │  ✗ Handle user requests                             │      │
│  │  ✗ Run web server                                   │      │
│  └────────────────────────────────────────────────────┘      │
│                                                                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  MySQL Database (Railway)                                     │
│  ├─ User data, profiles, posts, etc                          │
│  ├─ JobSchedule: Schedule definitions + state                │
│  └─ JobRun: Job execution history                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Why This Separation?

### Web Server Responsibilities

**Primary mission:** Serve HTTP traffic efficiently

```typescript
// backend/src/index.ts
async function main() {
  const app = createApp();
  const server = createServer(app);
  
  // HTTP server
  server.listen(port, '0.0.0.0');
  
  // WebSocket server
  const wss = createWsServer(server);
  
  // That's it. No jobs, no schedules.
}
```

**Why isolated:**
- ✅ **Predictable performance** - No background work competing for CPU
- ✅ **Fast response times** - All resources dedicated to user requests
- ✅ **Independent scaling** - Scale web traffic without affecting jobs
- ✅ **Crash isolation** - Job bugs can't bring down HTTP server
- ✅ **Clear monitoring** - Web latency not affected by job processing

---

### Schedule Daemon Responsibilities

**Primary mission:** Execute scheduled background work

```typescript
// backend/scripts/scheduleDaemon.ts
async function main() {
  setInterval(async () => {
    // 1. Check which schedules are due
    const dueSchedules = await findDueSchedules();
    
    // 2. Execute jobs immediately (inline)
    for (const schedule of dueSchedules) {
      await executeScheduleInline(schedule);
    }
    
    // 3. Update next run time
    await updateSchedules();
    
  }, POLL_INTERVAL_MS); // 1 hour
}
```

**Why isolated:**
- ✅ **Resource control** - Jobs can use full CPU without affecting users
- ✅ **Long-running work** - Can take minutes without blocking HTTP
- ✅ **Crash independence** - Job failure doesn't crash web server
- ✅ **Simple deployment** - Restart daemon without user downtime
- ✅ **Clear responsibility** - One process, one job

---

## The Admin System: Your Control Panel

### What Admin UI Gives You

The admin system is your **runtime control interface** for the jobs system.

**Access:** `https://your-app.railway.app/admin`

**Protected by:** Admin-only authentication (role-based)

---

## Admin Capabilities

### 1. Job Schedule Management (`/admin/schedules`)

**What you can control:**

#### Enable/Disable Schedules
```
┌─────────────────────────────────────────────────────────┐
│ Daily Full Sync                          [Toggle: ON/OFF]│
│ Run all jobs once per day at 2am UTC                    │
│ Last run: 2 hours ago  Next run: in 22 hours            │
│ [Run Now] [History]                                      │
└─────────────────────────────────────────────────────────┘
```

**What this means:**
- Toggle ON → Daemon will execute this schedule automatically
- Toggle OFF → Daemon skips this schedule (still defined in code)
- No code deploy needed to enable/disable

#### Manual Triggering
```
Click "Run Now" → Jobs execute immediately
  ├─ Bypasses schedule timing
  ├─ Useful for testing
  └─ Useful for recovery after outage
```

#### View Schedule History
```
Click "History" → See past executions
  ├─ When did it run?
  ├─ Did it succeed?
  ├─ How long did it take?
  └─ What jobs were included?
```

---

### 2. Job Execution Management (`/admin/jobs`)

**Real-time monitoring:**

```
┌──────────────────────────────────────────────────────┐
│  Active Jobs (Running Now)                           │
├──────────────────────────────────────────────────────┤
│  profileSearchIndexJob    RUNNING    2m 30s          │
│  mediaMetadataJob         RUNNING    45s             │
│  matchScoreUpdateJob      QUEUED     -               │
└──────────────────────────────────────────────────────┘
```

**What you can control:**

#### View Job Status
- See what's running right now (WebSocket updates in real-time)
- See what's queued
- See what succeeded/failed
- See execution duration

#### Manual Job Triggering
```
┌─────────────────────────────────────────────┐
│ Run Single Job                               │
│ Job: [profileSearchIndexJob ▼]              │
│ Parameters: {...}                            │
│ [Run Job]                                    │
└─────────────────────────────────────────────┘
```

**Use cases:**
- Test a job before scheduling it
- Re-run a failed job
- Run a job outside its schedule

#### Bulk Job Operations
```
┌─────────────────────────────────────────────┐
│ Enqueue All Jobs                             │
│ ☐ Skip dependencies                          │
│ [Enqueue All] [Enqueue by Group]             │
└─────────────────────────────────────────────┘
```

**What this does:**
- Enqueues all 20+ jobs
- Respects dependencies (or not, if checked)
- Same as schedule running, but manual

#### Job History & Debugging
```
View past job runs:
  ├─ Filter by job name
  ├─ Filter by status (SUCCESS/FAILED)
  ├─ Click job → See full logs
  └─ Understand what went wrong
```

---

### 3. Worker Monitoring

**What you can see:**

```
┌──────────────────────────────────────────────┐
│ Worker Status                                 │
├──────────────────────────────────────────────┤
│ schedule_daemon                               │
│   Status: RUNNING                             │
│   Last heartbeat: 30s ago                     │
│   Hostname: railway-abc123                    │
│                                               │
│ (No job_worker in corrected architecture)    │
└──────────────────────────────────────────────┘
```

**What this tells you:**
- Is daemon alive?
- When did it last check in?
- Where is it running?

---

### 4. User Management (`/admin/users`)

**What you can control:**

```
┌──────────────────────────────────────────────────────────┐
│ Users                                                     │
├──────────────────────────────────────────────────────────┤
│ user@example.com  | Active  | Posts: 5  | Matches: 2    │
│ [View Profile] [Edit] [Disable]                          │
└──────────────────────────────────────────────────────────┘
```

**Capabilities:**
- View user details
- Search users
- Manage accounts
- Monitor user activity

---

## Schedule System: Code vs Database

### What's in Code (Version Controlled)

**File:** `backend/src/lib/jobs/schedules/definitions.ts`

```typescript
export const schedules: ScheduleDefinition[] = [
  {
    id: 'daily-full-sync',
    name: 'Daily Full Sync',
    description: 'Run all jobs once per day at 2am UTC',
    cron: '0 2 * * *',
    timezone: 'UTC',
    executionMode: 'ALL_JOBS'
  },
  {
    id: 'hourly-matching',
    name: 'Hourly Matching',
    description: 'Update match scores every hour',
    cron: '0 * * * *',
    timezone: 'UTC',
    executionMode: 'GROUP',
    jobGroup: 'matching'
  }
];
```

**What's defined here:**
- Schedule ID (unique identifier)
- Schedule name (human-readable)
- Description (what it does)
- Cron expression (when it runs)
- Timezone (for cron evaluation)
- Execution mode (ALL_JOBS or GROUP)
- Job group (if GROUP mode)

**Why in code:**
- ✅ Version controlled (git history)
- ✅ Code review required (safety)
- ✅ Deployed atomically with job code
- ✅ Type-safe (TypeScript validates)
- ✅ No accidental edits in production

---

### What's in Database (Runtime State)

**Table:** `JobSchedule`

```sql
CREATE TABLE JobSchedule (
  id              VARCHAR(50) PRIMARY KEY,  -- Matches code definition
  enabled         BOOLEAN DEFAULT false,    -- Admin can toggle
  lastRunAt       DATETIME,                 -- Auto-updated
  nextRunAt       DATETIME,                 -- Auto-calculated
  runCount        INT DEFAULT 0,            -- Auto-incremented
  failureCount    INT DEFAULT 0,            -- Auto-incremented
  lockedAt        DATETIME,                 -- For atomic locking
  lockedBy        VARCHAR(100),             -- Worker ID
  createdAt       DATETIME,
  updatedAt       DATETIME
);
```

**What's stored here:**
- **enabled** - Admin controls via UI toggle
- **lastRunAt** - When did it last run?
- **nextRunAt** - When should it run next?
- **runCount** - How many times has it run?
- **failureCount** - How many times did it fail?
- **lockedAt** - Is it currently being processed?
- **lockedBy** - Which daemon instance has the lock?

**Why in database:**
- ✅ Runtime state changes without deploy
- ✅ Admin can enable/disable via UI
- ✅ Daemon can update state dynamically
- ✅ Atomic locking for concurrency control
- ✅ Historical tracking

---

## The Flow: How It All Works Together

### 1. Deploy New Schedule (Developer)

```
Developer workflow:
1. Edit backend/src/lib/jobs/schedules/definitions.ts
2. Add new schedule definition
3. git commit && git push
4. Railway auto-deploys
5. Daemon syncs new definition to database (enabled: false)
```

**Result:** New schedule appears in admin UI, disabled by default

---

### 2. Enable Schedule (Admin)

```
Admin workflow:
1. Go to /admin/schedules
2. Find new schedule
3. Click toggle to enable
4. Schedule is now active
```

**What happens:**
```sql
UPDATE JobSchedule 
SET enabled = true,
    nextRunAt = <calculated from cron>
WHERE id = 'new-schedule';
```

**Result:** Daemon will execute this schedule at next interval

---

### 3. Schedule Executes (Automatic)

```
Daemon process (every hour):
1. Query database for enabled schedules where nextRunAt <= NOW()
2. For each due schedule:
   a. Acquire atomic lock (prevents duplicates)
   b. Execute jobs inline
   c. Record results (success/failure)
   d. Calculate next run time
   e. Update database
   f. Release lock
3. Sleep for 1 hour
```

**Result:** Jobs execute, history recorded, nextRunAt updated

---

### 4. View Results (Admin)

```
Admin workflow:
1. Go to /admin/schedules
2. See "Last run: 5 minutes ago"
3. Click "History"
4. See all jobs that ran
5. Click individual job → See logs
```

**Result:** Full visibility into what happened

---

### 5. Manual Override (Admin)

```
Emergency scenario:
1. Schedule failed at 2am
2. Admin notices at 9am
3. Goes to /admin/schedules
4. Clicks "Run Now"
5. Jobs execute immediately
```

**What happens:**
- Daemon receives manual trigger signal
- Executes schedule immediately (bypasses cron timing)
- Records as manual trigger (not automatic)
- nextRunAt unchanged (next automatic run still at 2am tomorrow)

---

## Job System: What Jobs Can Do

### Current Job Definitions

**File:** `backend/src/lib/jobs/shared/registry.ts`

```typescript
export const jobRegistry = {
  // Search & Discovery
  'profileSearchIndexJob': {
    group: 'search',
    dependencies: [],
    description: 'Update search indexes for all profiles'
  },
  
  // Matching
  'matchScoreUpdateJob': {
    group: 'matching',
    dependencies: ['profileSearchIndexJob'],
    description: 'Calculate match scores between users'
  },
  
  // Media
  'mediaMetadataJob': {
    group: 'media',
    dependencies: [],
    description: 'Process uploaded media (thumbnails, metadata)'
  },
  
  // Feed
  'feedRefreshJob': {
    group: 'feed',
    dependencies: ['matchScoreUpdateJob'],
    description: 'Refresh personalized feeds for active users'
  },
  
  // ... 20+ more jobs
};
```

**Job capabilities:**
- Database operations (cleanup, recomputation)
- External API calls (geocoding, image processing)
- Bulk operations (reindex all users)
- Data migrations (schema changes)
- Analytics (aggregate statistics)

---

## Admin Control Summary

### What Admin UI Controls

| What | Where | Control Level |
|------|-------|---------------|
| **Enable/Disable Schedules** | `/admin/schedules` | Runtime (no deploy) |
| **Trigger Schedule Manually** | `/admin/schedules` | Immediate execution |
| **View Schedule History** | `/admin/schedules` | Read-only visibility |
| **Run Individual Job** | `/admin/jobs` | Immediate execution |
| **Enqueue All Jobs** | `/admin/jobs` | Bulk trigger |
| **Monitor Active Jobs** | `/admin/jobs` | Real-time status |
| **View Job History** | `/admin/jobs` | Full logs |
| **View Worker Status** | `/admin/jobs` | Health monitoring |
| **Manage Users** | `/admin/users` | CRUD operations |

---

### What Admin UI Does NOT Control

| What | Why | How to Change |
|------|-----|---------------|
| **Schedule cron timing** | In code | Edit definitions.ts, deploy |
| **Schedule name/description** | In code | Edit definitions.ts, deploy |
| **Job groups** | In code | Edit job registry, deploy |
| **Job dependencies** | In code | Edit job registry, deploy |
| **Job logic** | In code | Edit job file, deploy |
| **Polling frequency** | Env var | Change SCHEDULE_POLL_INTERVAL_MS |

**Design principle:** 
- **Runtime state** (enabled/disabled, last run) → Admin UI
- **Configuration** (what, when, how) → Code (version controlled)

---

## Monorepo Benefits

### Shared Code Between Web and Jobs

```
backend/
├── src/
│   ├── lib/                  # Shared by web + jobs
│   │   ├── prisma/          # Database client
│   │   ├── auth/            # Auth logic
│   │   └── jobs/            # Job registry
│   ├── index.ts             # Web server entry point
│   └── jobs/                # Job implementations
└── scripts/
    └── scheduleDaemon.ts    # Daemon entry point
```

**Benefits:**
- ✅ Single database schema
- ✅ Shared business logic
- ✅ Shared type definitions
- ✅ One set of dependencies
- ✅ Atomic deployments

**Example:**
```typescript
// Used by web server (user creates profile)
import { updateProfileSearchIndex } from './lib/search/indexer';
await updateProfileSearchIndex(userId);

// Used by job (bulk reindex)
import { updateProfileSearchIndex } from './lib/search/indexer';
for (const userId of allUsers) {
  await updateProfileSearchIndex(userId);
}
```

---

## Security & Access Control

### Admin Authentication

```typescript
// backend/src/lib/auth/rules.ts
export const Auth = {
  admin: () => ({
    middleware: requireAuth,
    validate: (req) => {
      if (req.auth.role !== 'ADMIN') {
        throw new UnauthorizedError('Admin access required');
      }
    }
  })
};
```

**Protection:**
- All `/admin/*` routes require authentication
- Role must be `ADMIN` (not regular user)
- JWT token validation
- Session management

**How to become admin:**
```bash
# One-time setup script
pnpm admin:create
# Creates admin user with email/password
```

---

## Monitoring & Observability

### What You Can Monitor

**1. Schedule Health**
```sql
-- Are schedules running on time?
SELECT 
  id,
  name,
  enabled,
  lastRunAt,
  nextRunAt,
  TIMESTAMPDIFF(MINUTE, lastRunAt, NOW()) as minutes_since_last
FROM JobSchedule
WHERE enabled = true;
```

**2. Job Success Rate**
```sql
-- Are jobs succeeding?
SELECT 
  jobName,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as succeeded,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
  AVG(durationMs) as avg_duration_ms
FROM JobRun
WHERE createdAt > NOW() - INTERVAL 24 HOUR
GROUP BY jobName;
```

**3. Daemon Health**
```sql
-- Is daemon alive?
SELECT 
  workerType,
  status,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_since_heartbeat
FROM WorkerInstance
WHERE status = 'RUNNING';
```

---

## Summary: The Big Picture

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  User Layer                                              │
│  ├─ React SPA (user-facing)                             │
│  └─ Admin UI (admin-only)                               │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────┐
│  Web Server Layer (Railway Service 1)                   │
│  ├─ Express API                                          │
│  ├─ REST endpoints                                       │
│  ├─ WebSocket server                                     │
│  └─ Admin API endpoints                                  │
└─────────────────────────────────────────────────────────┘
                          ↓ Database queries
┌─────────────────────────────────────────────────────────┐
│  Data Layer (Railway MySQL)                             │
│  ├─ User data                                            │
│  ├─ JobSchedule table (schedule state)                  │
│  └─ JobRun table (execution history)                    │
└─────────────────────────────────────────────────────────┘
                          ↑ Database queries
┌─────────────────────────────────────────────────────────┐
│  Job Layer (Railway Service 2)                          │
│  ├─ Schedule Daemon                                      │
│  ├─ Checks schedules every hour                          │
│  ├─ Executes jobs inline                                 │
│  └─ Records results                                      │
└─────────────────────────────────────────────────────────┘
```

---

### Control Flow

**Developer controls (via code):**
- What schedules exist
- When they run (cron)
- What jobs they execute
- Job dependencies
- Job logic

**Admin controls (via UI):**
- Which schedules are enabled
- Manual triggering (bypass schedule)
- View history and logs
- Monitor worker health
- User management

**Daemon controls (automatic):**
- Execute enabled schedules on time
- Update next run times
- Record execution history
- Handle failures

**Database holds:**
- Schedule runtime state (enabled, lastRunAt, nextRunAt)
- Job execution history (JobRun records)
- Worker heartbeats (health monitoring)

---

## Key Insights

1. **Separation = Safety**
   - Web server crashes don't affect jobs
   - Job crashes don't affect web server
   - Independent scaling

2. **Monorepo = Shared Logic**
   - Jobs and web server share business logic
   - Single database schema
   - Atomic deployments

3. **Admin UI = Runtime Control**
   - Enable/disable without deploy
   - Manual overrides when needed
   - Full visibility into execution

4. **Code = Configuration**
   - Schedules defined in version-controlled code
   - Changes require code review
   - Safe and auditable

5. **Database = State**
   - Runtime state changes frequently
   - No code deploy needed
   - Admin UI controls it

**This architecture gives you:**
- ✅ Control (admin UI for runtime changes)
- ✅ Safety (version-controlled configuration)
- ✅ Isolation (separate processes)
- ✅ Simplicity (one codebase, two deployments)
- ✅ Visibility (full monitoring and logs)

**Perfect for pre-launch scale, ready to grow.**
