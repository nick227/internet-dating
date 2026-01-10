# Schedule Daemon: Code Reference Quick Guide

**Quick reference for key files and code locations**

---

## Core Files (5 Essential)

### 1. Main Daemon Process ⭐

**File:** `backend/scripts/scheduleDaemon.ts` (341 lines)

**Purpose:** The actual daemon that runs schedules

**Key Functions:**
```typescript
registerWorker()           // Register as WorkerInstance in DB
syncScheduleDefinitions()  // Sync code schedules → database
processSchedules()         // Check & execute due schedules
executeScheduleInline()    // Run jobs directly (inline)
cleanupStalledLocks()      // Release stuck locks (startup only)
updateHeartbeat()          // Keep-alive signal
main()                     // Entry point
```

**Environment Variables Used:**
- `SCHEDULE_DAEMON_ENABLED` - Enable/disable daemon
- `SCHEDULE_POLL_INTERVAL_MS` - How often to check (default: 60s)
- `LOCK_TIMEOUT_MS` - Lock expiration (default: 1 hour)
- `NODE_ENV` - Development vs production

**Run It:**
```bash
cd backend
pnpm daemon:schedules
```

**What It Does:**
1. Registers as `schedule_daemon` in WorkerInstance table
2. Syncs schedules from code to database
3. Every POLL_INTERVAL_MS:
   - Updates heartbeat
   - Finds due schedules (enabled + nextRunAt <= now)
   - Acquires atomic lock
   - Executes jobs inline
   - Updates nextRunAt
   - Releases lock
4. Handles SIGTERM/SIGINT for graceful shutdown

---

### 2. Schedule Definitions ⭐

**File:** `backend/src/lib/jobs/schedules/definitions.ts` (76 lines)

**Purpose:** Define what schedules exist (version-controlled)

**Interface:**
```typescript
interface ScheduleDefinition {
  id: string;                  // Unique ID (e.g. 'daily-full-sync')
  name: string;                // Display name
  description: string;         // What it does
  cron: string;                // When to run (cron expression)
  timezone: string;            // Timezone for cron
  executionMode: 'ALL_JOBS' | 'GROUP';
  jobGroup?: JobGroup;         // If GROUP mode
  environments?: string[];     // Filter by NODE_ENV
}
```

**Current Schedules:**
```typescript
const allSchedules = [
  {
    id: 'daily-full-sync',
    cron: '0 2 * * *',        // Daily at 2am UTC
    executionMode: 'ALL_JOBS'
  },
  {
    id: 'hourly-matching',
    cron: '0 * * * *',        // Every hour
    executionMode: 'GROUP',
    jobGroup: 'matching'
  },
  {
    id: 'feed-refresh',
    cron: '*/15 * * * *',     // Every 15 minutes
    executionMode: 'GROUP',
    jobGroup: 'feed'
  },
  {
    id: 'dev-quick-test',
    cron: '*/5 * * * *',      // Every 5 minutes
    executionMode: 'ALL_JOBS',
    environments: ['development']  // Dev only
  }
];
```

**How to Add New Schedule:**
1. Add entry to `allSchedules` array
2. Deploy code
3. Daemon auto-creates DB record (disabled)
4. Admin enables via UI

---

### 3. Database Schema ⭐

**File:** `backend/prisma/schema/schedules.prisma` (29 lines)

**Purpose:** Store runtime state for schedules

**Model:**
```prisma
model JobSchedule {
  id              String    @id @db.VarChar(50)
  enabled         Boolean   @default(false)  // Admin controls
  
  // Locking (prevents duplicates)
  lockedAt        DateTime?
  lockedBy        String?   @db.VarChar(100)
  
  // Execution tracking
  lastRunAt       DateTime?
  nextRunAt       DateTime?
  runCount        Int       @default(0)
  failureCount    Int       @default(0)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  scheduledRuns   JobRun[]  @relation("ScheduledJobs")
  
  @@index([enabled, nextRunAt])
  @@index([lockedAt])
}
```

**Key Fields:**
- `id` - Matches schedule ID from code
- `enabled` - Admin toggles this (default: false)
- `lockedAt/lockedBy` - Atomic locking mechanism
- `nextRunAt` - When should it run next?
- `runCount` - How many successful executions?

**Migration:**
- File: `backend/prisma/migrations/20260110120000_add_job_schedules/migration.sql`
- Run: `pnpm prisma migrate deploy`

---

### 4. Backend API Handlers

**File:** `backend/src/registry/domains/admin/handlers/schedules.ts` (200+ lines)

**Purpose:** Admin API endpoints for schedule management

**Endpoints:**
```typescript
// List all schedules (code defs + DB state)
listSchedules()        // GET /api/admin/schedules

// Get single schedule
getSchedule()          // GET /api/admin/schedules/:id

// Update schedule (enable/disable)
updateSchedule()       // PUT /api/admin/schedules/:id
                       // Body: { enabled: boolean }

// Trigger schedule manually
triggerSchedule()      // POST /api/admin/schedules/:id/trigger

// Get execution history
getScheduleHistory()   // GET /api/admin/schedules/:id/history
```

**Key Logic:**
```typescript
// Enable/disable schedule
async function updateSchedule(req, res) {
  const { id } = req.params;
  const { enabled } = req.body;
  
  // Update DB
  const updated = await prisma.jobSchedule.update({
    where: { id },
    data: { 
      enabled,
      nextRunAt: enabled ? calculateNextRun(cron) : null
    }
  });
  
  return json(res, { schedule: updated });
}
```

**Daemon Health Endpoint:**

**File:** `backend/src/registry/domains/admin/index.ts` (line 757+)

```typescript
// GET /api/admin/daemon/status
handler: async (req, res) => {
  const instances = await getWorkerInstances('schedule_daemon');
  const activeDaemon = instances.find(w => 
    w.status === 'RUNNING' && 
    (now - w.lastHeartbeatAt) < 120000
  );
  
  return json(res, {
    daemonRunning: !!activeDaemon,
    daemon: activeDaemon ? { /* details */ } : null,
    health: 'healthy' | 'warning' | 'critical',
    healthMessage: string
  });
}
```

---

### 5. Frontend Admin UI

**File:** `frontend/src/admin/pages/SchedulesPage.tsx` (296 lines)

**Purpose:** Admin interface for schedule management

**Key Components:**
```typescript
function SchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [daemonStatus, setDaemonStatus] = useState(null);
  
  // Load schedules from API
  useEffect(() => {
    loadSchedules();
    loadDaemonStatus();
    setInterval(loadDaemonStatus, 30000);  // Refresh every 30s
  }, []);
  
  // Toggle enable/disable
  const handleToggle = async (scheduleId, currentEnabled) => {
    await adminApi.updateSchedule(scheduleId, { 
      enabled: !currentEnabled 
    });
  };
  
  // Manual trigger
  const handleTrigger = async (scheduleId, scheduleName) => {
    await adminApi.triggerSchedule(scheduleId);
  };
  
  return (
    <div>
      {/* Daemon health banner */}
      <DaemonStatusBanner status={daemonStatus} />
      
      {/* Schedule list */}
      <SchedulesList 
        schedules={schedules}
        onToggle={handleToggle}
        onTrigger={handleTrigger}
      />
    </div>
  );
}
```

**API Client:**

**File:** `frontend/src/admin/api/admin.ts`

```typescript
export const adminApi = {
  // Schedule APIs
  getSchedules: () => http('/api/admin/schedules', 'GET'),
  updateSchedule: (id, data) => http(`/api/admin/schedules/${id}`, 'PUT', { body: data }),
  triggerSchedule: (id) => http(`/api/admin/schedules/${id}/trigger`, 'POST', { body: {} }),
  
  // Daemon monitoring
  getDaemonStatus: () => http('/api/admin/daemon/status', 'GET'),
};
```

---

## Supporting Files

### Job Execution

**File:** `backend/src/lib/jobs/runJob.ts`

**Purpose:** Execute a single job (called by daemon)

```typescript
export async function runQueuedJob(jobRunId: bigint) {
  const jobRun = await prisma.jobRun.findUnique({ 
    where: { id: jobRunId } 
  });
  
  // Get job definition
  const job = allJobs[jobRun.jobName];
  
  // Execute job
  await job.execute(context);
  
  // Update status
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { status: 'SUCCESS', finishedAt: new Date() }
  });
}
```

---

### Job Registry

**File:** `backend/src/lib/jobs/shared/registry.ts`

**Purpose:** Central registry of all jobs

```typescript
// Get all jobs
export async function getAllJobs(): Promise<Map<string, JobDefinition>> {
  return new Map(Object.entries(allJobs));
}

// Get jobs by group
export async function getJobsByGroup(group: JobGroup): Promise<JobDefinition[]> {
  return Object.values(allJobs).filter(job => job.group === group);
}
```

**Referenced by daemon when executing schedules.**

---

### Dependency Resolver

**File:** `backend/src/lib/jobs/shared/dependencyResolver.ts`

**Purpose:** Order jobs by dependencies

```typescript
export function resolveJobDependencies(
  jobs: Map<string, JobDefinition>
): JobDefinition[] {
  // Topological sort based on job.dependencies
  // Returns jobs in execution order
}
```

**Example:**
```
profileSearchIndexJob depends on buildUserTraitsJob
→ buildUserTraitsJob runs first
→ profileSearchIndexJob runs second
```

---

## Monitoring & Health

### Health Check Script

**File:** `backend/scripts/monitoring/checkScheduleDaemonHealth.ts` (71 lines)

**Purpose:** Check if daemon is healthy (for alerting)

```typescript
async function checkHealth() {
  const daemon = await prisma.workerInstance.findFirst({
    where: { 
      workerType: 'schedule_daemon',
      status: 'RUNNING'
    }
  });
  
  if (!daemon) {
    console.error('❌ Daemon not running');
    process.exit(1);  // Unhealthy
  }
  
  const ageMs = Date.now() - daemon.lastHeartbeatAt.getTime();
  if (ageMs > 5 * 60 * 1000) {  // 5 minutes
    console.error('❌ Heartbeat stale');
    process.exit(1);  // Unhealthy
  }
  
  console.log('✅ Daemon healthy');
  process.exit(0);  // Healthy
}
```

**Run:**
```bash
cd backend
pnpm daemon:health
```

**Use in cron:**
```bash
*/5 * * * * cd /app/backend && pnpm daemon:health || mail -s "Daemon Down" ops@example.com
```

---

### Worker Manager

**File:** `backend/src/workers/workerManager.ts`

**Purpose:** Manage WorkerInstance records

```typescript
// Register worker
export async function registerWorker(
  workerType: string
): Promise<string | null> {
  // Atomic: Check for existing workers, create if none
}

// Get worker instances
export async function getWorkerInstances(
  workerType?: string
) {
  return await prisma.workerInstance.findMany({
    where: workerType ? { workerType } : undefined,
    orderBy: { startedAt: 'desc' }
  });
}

// Get active workers count
export async function getActiveWorkersCount(
  workerType: string
): Promise<number> {
  // Returns count of RUNNING workers with recent heartbeat
}
```

---

## Configuration Files

### Railway Daemon Service

**File:** `railway.daemon.toml` (31 lines)

**Purpose:** Railway configuration for daemon service

```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install --prod=false"

[deploy]
startCommand = "cd backend && pnpm daemon:schedules"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

**One-time setup:**
1. Create Railway service named "schedule-daemon"
2. Link to same GitHub repo
3. Use this config (or set manually in UI)

---

### Package Scripts

**File:** `backend/package.json`

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "daemon:schedules": "tsx scripts/scheduleDaemon.ts",
    "daemon:health": "tsx scripts/monitoring/checkScheduleDaemonHealth.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

---

## Key Database Tables

### WorkerInstance

**Purpose:** Track daemon/worker processes

```sql
SELECT * FROM WorkerInstance 
WHERE workerType = 'schedule_daemon' 
  AND status = 'RUNNING';
```

**Fields:**
- `workerType` - 'schedule_daemon' or 'job_worker'
- `status` - 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED'
- `hostname` - Which server is running it
- `pid` - Process ID
- `lastHeartbeatAt` - Keep-alive timestamp
- `startedAt` - When did it start?

---

### JobSchedule

**Purpose:** Runtime state for each schedule

```sql
SELECT 
  id,
  enabled,
  nextRunAt,
  lastRunAt,
  runCount,
  failureCount,
  lockedAt
FROM JobSchedule;
```

---

### JobRun

**Purpose:** Execution history for all jobs

```sql
SELECT * FROM JobRun 
WHERE scheduleId IS NOT NULL 
ORDER BY startedAt DESC 
LIMIT 10;
```

**Fields:**
- `scheduleId` - Which schedule triggered this? (NULL if manual)
- `jobName` - Which job ran?
- `status` - 'QUEUED', 'RUNNING', 'SUCCESS', 'FAILED'
- `trigger` - 'CRON', 'MANUAL', 'EVENT'
- `startedAt` - When did it start?
- `finishedAt` - When did it finish?
- `durationMs` - How long did it take?

---

## Common Operations

### 1. Add New Schedule

**Edit:** `backend/src/lib/jobs/schedules/definitions.ts`

```typescript
const allSchedules: ScheduleDefinition[] = [
  // ... existing schedules ...
  {
    id: 'weekly-cleanup',
    name: 'Weekly Cleanup',
    description: 'Clean up old data every Sunday',
    cron: '0 3 * * 0',  // Sunday 3am
    timezone: 'UTC',
    executionMode: 'GROUP',
    jobGroup: 'maintenance'
  }
];
```

**Deploy:**
```bash
git add backend/src/lib/jobs/schedules/definitions.ts
git commit -m "Add weekly cleanup schedule"
git push origin main
```

**Result:**
- Daemon auto-creates DB record (disabled)
- Admin UI shows new schedule
- Admin can enable via toggle

---

### 2. Enable Schedule

**Admin UI:** `/admin/schedules`

1. Find schedule in list
2. Toggle switch to ON
3. Daemon picks it up on next poll

**API:**
```bash
curl -X PUT http://localhost:3001/api/admin/schedules/daily-full-sync \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

### 3. Manually Trigger Schedule

**Admin UI:**
1. Click "Run Now" button
2. Confirm dialog
3. Watch execution in real-time

**API:**
```bash
curl -X POST http://localhost:3001/api/admin/schedules/daily-full-sync/trigger \
  -H "Authorization: Bearer <token>"
```

---

### 4. Check Daemon Status

**Admin UI:** `/admin/schedules` (top banner)

**Database:**
```sql
SELECT 
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_ago
FROM WorkerInstance
WHERE workerType = 'schedule_daemon';

-- Healthy: seconds_ago < 120
```

**CLI:**
```bash
cd backend
pnpm daemon:health
```

---

### 5. View Execution History

**Admin UI:**
1. Go to `/admin/schedules`
2. Click schedule name or "History" button
3. See all past runs

**Database:**
```sql
SELECT 
  jobName,
  status,
  startedAt,
  durationMs
FROM JobRun
WHERE scheduleId = 'daily-full-sync'
ORDER BY startedAt DESC
LIMIT 20;
```

---

## Quick Debugging

### Daemon Not Running?

**Check 1: Process**
```bash
# Local
ps aux | grep scheduleDaemon

# Railway
railway logs --service schedule-daemon
```

**Check 2: Database**
```sql
SELECT * FROM WorkerInstance 
WHERE workerType = 'schedule_daemon'
ORDER BY lastHeartbeatAt DESC
LIMIT 1;
```

**Check 3: Environment**
```bash
# Is it enabled?
echo $SCHEDULE_DAEMON_ENABLED  # Should be 'true' or empty
```

---

### Schedule Not Executing?

**Check 1: Enabled?**
```sql
SELECT enabled, nextRunAt 
FROM JobSchedule 
WHERE id = 'daily-full-sync';
```

**Check 2: nextRunAt in future?**
```sql
SELECT 
  nextRunAt,
  nextRunAt > NOW() as is_future
FROM JobSchedule;
```

**Check 3: Daemon polling?**
```bash
# Check daemon logs for:
# "⏰ Found N due schedule(s)"
railway logs --service schedule-daemon | grep "⏰"
```

---

### Jobs Failing?

**Check JobRun table:**
```sql
SELECT 
  jobName,
  status,
  error,
  startedAt
FROM JobRun
WHERE scheduleId = 'daily-full-sync'
  AND status = 'FAILED'
ORDER BY startedAt DESC
LIMIT 5;
```

**Check JobLog table:**
```sql
SELECT 
  level,
  message,
  createdAt
FROM JobLog
WHERE jobRunId = 123456
ORDER BY createdAt DESC;
```

---

## File Structure Summary

```
backend/
├── scripts/
│   ├── scheduleDaemon.ts              ⭐ Main daemon
│   └── monitoring/
│       └── checkScheduleDaemonHealth.ts  Health check script
├── src/
│   ├── lib/
│   │   └── jobs/
│   │       ├── schedules/
│   │       │   └── definitions.ts     ⭐ Schedule configs
│   │       ├── shared/
│   │       │   ├── registry.ts        Job registry
│   │       │   └── dependencyResolver.ts
│   │       └── runJob.ts              Job execution
│   ├── registry/
│   │   └── domains/
│   │       └── admin/
│   │           ├── handlers/
│   │           │   └── schedules.ts   ⭐ Admin handlers
│   │           └── index.ts           Daemon health endpoint
│   └── workers/
│       └── workerManager.ts           Worker utilities
└── prisma/
    └── schema/
        └── schedules.prisma           ⭐ Database schema

frontend/
└── src/
    └── admin/
        ├── pages/
        │   └── SchedulesPage.tsx      ⭐ Admin UI
        ├── api/
        │   └── admin.ts               API client
        └── types.ts                   TypeScript types

railway.daemon.toml                     ⭐ Railway config
```

**⭐ = Essential files (5 core)**

---

## Environment Variables Quick Ref

```env
# Daemon Control
SCHEDULE_DAEMON_ENABLED=true          # Enable/disable daemon
SCHEDULE_POLL_INTERVAL_MS=3600000     # Check every 1 hour
LOCK_TIMEOUT_MS=3600000               # Lock expires after 1 hour

# Environment
NODE_ENV=production                   # Filters schedules
DATABASE_URL=mysql://...              # Database connection
```

---

## Useful Queries

### Daemon Status
```sql
SELECT * FROM WorkerInstance 
WHERE workerType='schedule_daemon' 
ORDER BY lastHeartbeatAt DESC LIMIT 1;
```

### Schedule Summary
```sql
SELECT 
  id,
  enabled,
  nextRunAt,
  runCount,
  failureCount
FROM JobSchedule;
```

### Recent Executions
```sql
SELECT 
  scheduleId,
  jobName,
  status,
  startedAt,
  durationMs
FROM JobRun
WHERE scheduleId IS NOT NULL
ORDER BY startedAt DESC
LIMIT 20;
```

### Success Rate
```sql
SELECT 
  scheduleId,
  COUNT(*) as total,
  SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) as succeeded,
  ROUND(100.0 * SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
FROM JobRun
WHERE scheduleId IS NOT NULL
GROUP BY scheduleId;
```

---

## Related Documentation

- **Full Analysis:** `SCHEDULE_JOBS_FINAL_ANALYSIS.md` (1223 lines)
- **Operations:** `DAEMON_MANAGEMENT_GUIDE.md` (681 lines)
- **Production Check:** `SCHEDULE_DAEMON_PRODUCTION_FINAL_CHECK.md` (924 lines)
- **Long Jobs:** `LONG_RUNNING_JOB_ANALYSIS.md` (736 lines)
- **Railway Setup:** `RAILWAY_SCHEDULE_DAEMON_ENV_VARS.md` (409 lines)

---

**This is your quick reference. For deep dives, see the full documentation above.**
