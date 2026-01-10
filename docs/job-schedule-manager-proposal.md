# Job Schedule Manager - Proposal

## TL;DR

**Goal**: Automatically run all 20+ jobs every day at 2am without manual intervention

**NOT Using System Cron**: We're building a Node.js daemon that uses cron expression syntax but runs independently (works in Docker/Railway, no shell access needed)

**Solution**: Simple schedule system (~300 lines of code, 1 week, code-defined schedules)

| Current State | With Schedules |
|--------------|----------------|
| ❌ Admin must manually click "Run All Jobs" daily | ✅ Jobs run automatically at 2am |
| ❌ Risk of forgetting critical maintenance | ✅ Zero intervention needed |
| ❌ No visibility into when jobs last ran | ✅ Dashboard shows last/next run times |
| ❌ Can't run different job groups at different frequencies | ✅ Can schedule groups separately (hourly, etc.) |
| ✅ Full job history in Job Manager | ✅ Same history + scheduled trigger tracking |

**Architecture**:
```
Code: schedules.ts (30 lines)     Database: JobSchedule (state only)
    ↓                                      ↓
Schedule Daemon (120 lines) ──checks──> enabled=true? nextRunAt?
    ↓                                      ↓
Creates JobRun records ──────────────> JobRun table (existing)
    ↓                                      ↓
Job Worker picks up ─────────────────> Executes jobs (existing)
```

**Recommendation**: Keep schedules in code (like job definitions), just let admin enable/disable via UI

## Overview

This proposal outlines a system for scheduling and managing automated job execution from the admin frontend. **The primary use case is scheduling all jobs to run automatically on a regular cadence (e.g., daily at 2am).** Secondary features allow scheduling specific job groups more frequently (e.g., matching jobs every hour).

**Key Design Principle**: The schedule system is a thin wrapper around your existing job infrastructure. It creates standard JobRun records that flow through your existing worker, logging, and monitoring systems.

## Clarification: "Cron" vs Actual Cron

**Important**: When we say "cron" in this proposal, we mean:
- ✅ Using cron expression syntax (`0 2 * * *`) to define schedules
- ✅ A daemon process that polls and checks if schedules are due
- ❌ NOT using actual system `cron` / `crontab`

**Why not use real cron?**
- Works in containers (Railway, Docker) without shell access
- Schedules visible in application database
- Can be enabled/disabled programmatically
- Integrates with your existing job system

**What we're actually building:**
```
System Cron (❌ Not using this)
  ├─ Requires root/shell access
  ├─ Runs commands directly
  └─ Hard to manage dynamically

Our Schedule Daemon (✅ This is what we're building)
  ├─ Node.js process that runs continuously
  ├─ Polls database every minute
  ├─ Uses cron expression syntax for schedule definitions
  ├─ Creates JobRun records (your existing system takes over)
  └─ Managed via database + WorkerInstance monitoring
```

## Architecture Decision: How to Handle Scheduling?

### The Options

**Option A: Actual System Cron (`crontab`)**
```bash
# /etc/crontab
0 2 * * * cd /app && node backend/scripts/jobs/runners/runJobs.ts all
```
- ✅ Battle-tested, OS-level reliability
- ✅ Standard Unix tool, well understood
- ❌ Requires shell access to modify
- ❌ Not visible in application UI
- ❌ Hard to manage in containers (Railway, Docker)
- ❌ No database tracking of schedule state
- ❌ Can't enable/disable without editing crontab

**Option B: Code-Defined Schedules (Recommended for MVP)**
```typescript
// backend/src/lib/jobs/schedules/definitions.ts
export const schedules = [
  {
    id: 'daily-full-sync',
    name: 'Daily Full Sync',
    cron: '0 2 * * *',
    executionMode: 'ALL_JOBS',
    enabled: true  // Admin can toggle via UI
  },
  {
    id: 'hourly-matching',
    name: 'Hourly Matching',
    cron: '0 * * * *',
    executionMode: 'GROUP',
    jobGroup: 'matching',
    enabled: true
  }
];
```
- ✅ Schedules are version-controlled with code
- ✅ Can't be accidentally broken by admin typo
- ✅ Simple UI: just enable/disable toggles
- ✅ Easy to add new schedules via code deploy
- ✅ Still have database tracking (enabled state, last run, etc.)
- ❌ Need code deploy to change schedule times

**Option C: Database-Driven with UI Editor (Original Proposal)**
```sql
-- Admin can create/edit schedules via UI form
INSERT INTO JobSchedule (name, cronExpression, executionMode) 
VALUES ('Custom Schedule', '*/5 * * * *', 'GROUP');
```
- ✅ Fully flexible, no code deploys needed
- ✅ Admin can experiment with different schedules
- ✅ Can create schedules on the fly
- ❌ Risk of invalid cron expressions
- ❌ Schedules not in version control
- ❌ More complex UI (need cron validator, etc.)
- ❌ Could break system with bad configuration

### Recommendation: **Option B** (Code-Defined)

**Why this is better for your use case:**

1. **You know your schedules**: You want "all jobs daily at 2am" - this won't change often
2. **Safer**: Can't break with invalid cron expressions or bad configs
3. **Simpler UI**: Just a list with enable/disable switches
4. **Version controlled**: Schedule changes reviewed in PRs
5. **Still flexible**: Admin can enable/disable, see status, view history

**What changes vs original proposal:**
- Schedule definitions live in code (like job definitions do now)
- Database only tracks: `enabled`, `lastRunAt`, `nextRunAt`, `runCount`, `failureCount`
- UI is view-only for schedule config, writable for enable/disable
- To add/modify schedules: code change + deploy (same as adding new jobs)

## Primary Use Case: Schedule "Run All Jobs"

### The Problem
- Currently, all 20+ jobs must be triggered manually via admin UI
- Risk of forgetting to run critical maintenance jobs
- No reliable way to ensure jobs run daily during off-peak hours
- Manual triggering is time-consuming and error-prone

### The Solution
A single schedule that automatically triggers all jobs in dependency order:

```
┌─────────────────────────────────────────────────────────────┐
│ Schedule: "Daily Full Sync"                                 │
│ ─────────────────────────────────────────────────────────── │
│ Cron: 0 2 * * * (2:00 AM UTC daily)                         │
│ Mode: ALL_JOBS (in dependency order)                        │
│ Expected duration: ~30-60 minutes                           │
│ Creates: 20+ JobRun records (one per job)                   │
└─────────────────────────────────────────────────────────────┘
```

### How It Works (Visual)

```
     2:00 AM UTC - Schedule triggers
            │
            ↓
    ┌───────────────────┐
    │ Schedule Daemon   │  Checks: "Daily Full Sync" is due
    │ (WorkerInstance)  │
    └─────────┬─────────┘
              │
              ↓ Creates JobRuns
    ┌─────────────────────────────────────────┐
    │ JobRun: match-scores      (QUEUED)      │
    │ JobRun: compatibility     (QUEUED)      │
    │ JobRun: content-features  (QUEUED)      │
    │ JobRun: trending          (QUEUED)      │
    │ ... (16 more jobs)                      │
    │                                         │
    │ All with:                               │
    │   - trigger: 'CRON'                     │
    │   - scheduleId: 123                     │
    └─────────┬───────────────────────────────┘
              │
              ↓ Job Worker picks them up
    ┌───────────────────┐
    │ Job Worker        │  Processes in dependency order
    │ (WorkerInstance)  │
    └─────────┬─────────┘
              │
              ↓ 30-60 minutes later
    ┌─────────────────────────────────────────┐
    │ JobRun: match-scores      (✓ SUCCESS)   │
    │ JobRun: compatibility     (✓ SUCCESS)   │
    │ JobRun: content-features  (✓ SUCCESS)   │
    │ ... all complete                        │
    └─────────────────────────────────────────┘
              │
              ↓
    ┌───────────────────┐
    │ Schedule Daemon   │  Updates schedule:
    │                   │  - lastRunAt = 2:00 AM
    └───────────────────┘  - nextRunAt = Tomorrow 2:00 AM
```

**What happens when schedule triggers:**
1. ⏰ Schedule daemon wakes up at 2:00 AM
2. 🔍 Finds "Daily Full Sync" schedule is due
3. 📋 Creates JobRun records for all 20+ jobs (existing table)
4. 🏃 Job worker processes them in dependency order (existing worker)
5. ✅ All jobs complete, logs saved to JobLog (existing table)
6. 📅 Schedule calculates next run: tomorrow at 2:00 AM
7. 💤 Daemon sleeps until next minute

**Admin sees in UI:**
- ✅ "Daily Full Sync" schedule enabled
- ✅ Last run: Today at 2:00 AM (20 jobs, 45 min duration)
- ✅ Next run: Tomorrow at 2:00 AM
- ✅ Success rate: 98% (last 30 days)
- ✅ Click to view all JobRuns in Job Manager

## Current State

### Existing Infrastructure
- **Job Registry**: 20+ jobs organized into 6 groups (matching, feed, search, maintenance, media, quiz)
- **Job Dependencies**: Jobs can depend on other jobs for execution order
- **Manual Execution**: Jobs can be run individually, by group, or all jobs via admin UI
- **Job Worker**: Background worker that processes enqueued jobs
- **Job Run Tracking**: Complete audit trail via `JobRun` and `JobLog` tables
- **WorkerInstance Monitoring**: Worker health tracking and heartbeats
- **WebSocket Real-time Updates**: Live job status updates in admin UI
- **Existing Enums**: `JobTrigger` (CRON, EVENT, MANUAL), `JobRunStatus` (QUEUED, RUNNING, SUCCESS, FAILED, CANCELLED)

### Limitations
- No automated scheduling - all jobs are triggered manually
- No way to ensure critical jobs run regularly without manual intervention
- No mechanism to run different job sets at different frequencies

## Proposed Solution

### Schema Integration Strategy

**The schedule system fully integrates with your existing schema:**
- ✅ **JobSchedule** (new) → references → **JobRun** (existing) via `lastRunId`
- ✅ **JobRun** (extend) adds `scheduleId` → references → **JobSchedule**
- ✅ Uses existing `JobTrigger.CRON` enum value (no new enum needed)
- ✅ **JobLog** works as-is (automatically created by job execution)
- ✅ **WorkerInstance** tracks schedule daemon (new worker type: `schedule_daemon`)
- ✅ All existing job manager UI, APIs, and WebSockets work unchanged

### 1. Database Schema

#### Option B: Code-Defined Schedules (Simpler, Recommended)

**What the database stores** (runtime state only):

```prisma
model JobSchedule {
  id              String        @id @db.VarChar(50) // "daily-full-sync" (from code)
  enabled         Boolean       @default(false) // ⚠️ Default DISABLED for safety
  
  // Locking mechanism (prevents duplicate runs)
  lockedAt        DateTime?     // Set when daemon starts processing
  lockedBy        String?       // Worker ID that acquired lock
  
  // Runtime tracking only
  lastRunAt       DateTime?
  lastRunId       BigInt?
  nextRunAt       DateTime?
  runCount        Int           @default(0)
  failureCount    Int           @default(0)
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  // Relations
  lastRun         JobRun?       @relation("ScheduleLastRun", fields: [lastRunId], references: [id], onDelete: SetNull)
  scheduledRuns   JobRun[]      @relation("ScheduledJobs")
  
  @@index([enabled, nextRunAt])
  @@index([lastRunId])
  @@index([lockedAt]) // For lock cleanup queries
}
```

**What lives in code** (schedule definitions):

```typescript
// backend/src/lib/jobs/schedules/definitions.ts
export interface ScheduleDefinition {
  id: string;           // Primary key in database
  name: string;
  description: string;
  cron: string;
  timezone: string;
  executionMode: 'ALL_JOBS' | 'GROUP';
  jobGroup?: string;
}

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
  },
  {
    id: 'feed-refresh',
    name: 'Feed Refresh',
    description: 'Refresh user feeds every 15 minutes',
    cron: '*/15 * * * *',
    timezone: 'UTC',
    executionMode: 'GROUP',
    jobGroup: 'feed'
  }
];
```

**Benefits of this approach:**
- 🔒 Can't break schedules with typos or invalid cron
- 📝 Schedule changes reviewed in PRs (same as code)
- 🎯 Simple UI: just show definition + enable toggle
- 🚀 Daemon loads definitions from code, checks DB for enabled state
- 📊 Database tracks execution history and state

---

#### Option C: Database-Driven (Original Proposal, More Complex)

<details>
<summary>Click to see full database-driven schema (if you want full flexibility)</summary>

#### MVP Schema (What you need for "Run All" schedule)

```prisma
model JobSchedule {
  id              BigInt        @id @default(autoincrement())
  name            String        @unique @db.VarChar(100)
  enabled         Boolean       @default(true)
  
  // Schedule: Just cron for MVP
  cronExpression  String        @db.VarChar(100) // "0 2 * * *" (2am daily)
  timezone        String        @default("UTC") @db.VarChar(50)
  
  // Execution: ALL_JOBS or GROUP only for MVP
  executionMode   ExecutionMode // ALL_JOBS, GROUP
  jobGroup        String?       @db.VarChar(50) // If GROUP: "matching", "feed", etc.
  
  // Audit
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdBy       BigInt
  
  // Runtime tracking
  lastRunAt       DateTime?
  lastRunId       BigInt?       // Link to JobRun
  nextRunAt       DateTime?
  runCount        Int           @default(0)
  failureCount    Int           @default(0)
  
  // Relations
  lastRun         JobRun?       @relation("ScheduleLastRun", fields: [lastRunId], references: [id], onDelete: SetNull)
  scheduledRuns   JobRun[]      @relation("ScheduledJobs")
  
  @@index([enabled, nextRunAt])
  @@index([executionMode])
  @@index([lastRunId])
}

enum ExecutionMode {
  ALL_JOBS   // Run all jobs in dependency order (PRIMARY USE CASE)
  GROUP      // Run specific job group
}
```

</details>

---

**Recommendation**: Start with **Option B** (code-defined schedules). It's simpler, safer, and sufficient for your use case. You can always migrate to Option C later if you need more flexibility.

```prisma
model JobSchedule {
  id              BigInt        @id @default(autoincrement())
  name            String        @unique @db.VarChar(100)
  enabled         Boolean       @default(true)
  
  // Schedule: Just cron for MVP
  cronExpression  String        @db.VarChar(100) // "0 2 * * *" (2am daily)
  timezone        String        @default("UTC") @db.VarChar(50)
  
  // Execution: ALL_JOBS or GROUP only for MVP
  executionMode   ExecutionMode // ALL_JOBS, GROUP
  jobGroup        String?       @db.VarChar(50) // If GROUP: "matching", "feed", etc.
  
  // Audit
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdBy       BigInt
  
  // Runtime tracking
  lastRunAt       DateTime?
  lastRunId       BigInt?       // Link to JobRun
  nextRunAt       DateTime?
  runCount        Int           @default(0)
  failureCount    Int           @default(0)
  
  // Relations
  lastRun         JobRun?       @relation("ScheduleLastRun", fields: [lastRunId], references: [id], onDelete: SetNull)
  scheduledRuns   JobRun[]      @relation("ScheduledJobs")
  
  @@index([enabled, nextRunAt])
  @@index([executionMode])
  @@index([lastRunId])
}

enum ExecutionMode {
  ALL_JOBS   // Run all jobs in dependency order (PRIMARY USE CASE)
  GROUP      // Run specific job group
}
```

#### Required: Enqueue API Stubs

You'll need these functions to exist (if they don't already):

```typescript
// backend/src/lib/jobs/enqueue.ts

interface EnqueueOptions {
  scheduleId?: string;
  triggeredBy?: bigint;
}

export async function enqueueAllJobs(
  options: EnqueueOptions = {}
): Promise<{ jobRunIds: bigint[] }> {
  const jobs = await getAllJobs();
  const jobRunIds: bigint[] = [];
  
  // Respect dependency order (you probably have this logic already)
  const orderedJobs = resolveDependencies(jobs);
  
  for (const jobName of orderedJobs) {
    const run = await prisma.jobRun.create({
      data: {
        jobName,
        trigger: options.scheduleId ? 'CRON' : 'MANUAL',
        status: 'QUEUED',
        scheduleId: options.scheduleId,
        triggeredBy: options.triggeredBy
      }
    });
    jobRunIds.push(run.id);
  }
  
  return { jobRunIds };
}

export async function enqueueJobsByGroup(
  group: JobGroup,
  options: EnqueueOptions = {}
): Promise<{ jobRunIds: bigint[] }> {
  const jobs = await getJobsByGroup(group);
  const jobRunIds: bigint[] = [];
  
  for (const job of jobs) {
    const run = await prisma.jobRun.create({
      data: {
        jobName: job.name,
        trigger: options.scheduleId ? 'CRON' : 'MANUAL',
        status: 'QUEUED',
        scheduleId: options.scheduleId,
        triggeredBy: options.triggeredBy
      }
    });
    jobRunIds.push(run.id);
  }
  
  return { jobRunIds };
}
```

**Why these APIs?**
- ✅ Single source of truth for job enqueuing
- ✅ Consistent metadata (trigger, scheduleId)
- ✅ Dependency ordering happens once
- ✅ Admin UI and daemon use same code path

---

#### Phase 2 Additions (Cut from MVP)

**Remove from MVP** (add later if needed):

```diff
- scheduleType: INTERVAL, ONCE (just use CRON for now)
- maxConcurrent (assume 1, add later if needed)
- retryOnFailure (job worker handles this)
- timeout settings (job worker handles this)
- Daemon start/stop API (just restart the process)
- Custom job selection (ALL_JOBS and GROUP are enough)
```

**MVP Schema stays simple:**
```prisma
model JobSchedule {
  id              String    @id
  enabled         Boolean   @default(false)
  lockedAt        DateTime?
  lockedBy        String?
  lastRunAt       DateTime?
  lastRunId       BigInt?
  nextRunAt       DateTime?
  runCount        Int       @default(0)
  failureCount    Int       @default(0)
  // That's it!
}
```

<details>
<summary>Phase 2 Schema Additions (if needed later)</summary>

```prisma
model JobSchedule {
  // ... MVP fields above ...
  
  // Add later:
  description         String?      @db.VarChar(500)
  scheduleType        ScheduleType // Support INTERVAL, ONCE
  intervalMs          Int?         
  jobName             String?      // SINGLE_JOB mode
  jobNames            Json?        // CUSTOM mode
  jobParameters       Json?        
  maxConcurrent       Int          @default(1)
  timeout             Int?
  retryOnFailure      Boolean      @default(false)
  maxRetries          Int          @default(3)
  consecutiveFailures Int          @default(0)
  lastModifiedBy      BigInt
}

enum ScheduleType {
  CRON      // Standard cron expression (MVP)
  INTERVAL  // Run every N milliseconds (Phase 2)
  ONCE      // Run once at specific time (Phase 2)
}

enum ExecutionMode {
  ALL_JOBS   // Run all jobs (MVP)
  GROUP      // Run job group (MVP)
  SINGLE_JOB // Run single job (Phase 2)
  CUSTOM     // Run custom list (Phase 2)
}
```

</details>

---

// Add to existing JobTrigger enum:
// enum JobTrigger {
//     CRON       // ← Use this for scheduled jobs
//     EVENT
//     MANUAL
// }

// Extend existing JobRun model with:
model JobRun {
  // ... existing fields ...
  
  // Add optional reference to schedule
  scheduleId      BigInt?
  schedule        JobSchedule?  @relation("ScheduledJobs", fields: [scheduleId], references: [id], onDelete: SetNull)
  scheduleAsLast  JobSchedule?  @relation("ScheduleLastRun")
  
  @@index([scheduleId])
}

// Existing WorkerInstance model remains unchanged
// Schedule daemon will be a separate WorkerInstance with workerType = "schedule_daemon"
```

**Integration Notes:**

1. **JobRun Integration**: 
   - Scheduled jobs create JobRun records with `trigger: 'CRON'` (existing enum value)
   - JobRun.scheduleId links back to which schedule triggered it
   - JobRun.metadata stores additional context: `{ scheduleId, scheduleName, executionMode }`

2. **JobLog Integration**:
   - All scheduled job executions automatically get JobLog entries via existing system
   - No changes needed to JobLog model

3. **WorkerInstance Integration**:
   - Schedule daemon registers as a WorkerInstance with `workerType: "schedule_daemon"`
   - Uses same heartbeat mechanism as job workers
   - Can be monitored alongside job workers in admin UI

### 2. Schedule Engine Architecture

#### Components

**A. Schedule Daemon (Backend)**
- Separate process/service that runs alongside the job worker
- Polls database every minute for schedules due to run
- Enqueues jobs based on schedule configuration
- Updates `lastRunAt` and `nextRunAt` timestamps
- Handles schedule locking to prevent duplicate executions

**B. Schedule Calculator**
- Parses cron expressions and calculates next run times
- Uses `node-cron` or `cron-parser` library
- Handles timezone conversions
- Validates cron expressions

**C. Schedule API (Backend)**
- CRUD operations for schedules
- Enable/disable schedules
- Trigger immediate execution
- View schedule history and statistics

#### Execution Flow

```
┌─────────────────────────────────────────────────────────┐
│  Schedule Daemon (WorkerInstance: schedule_daemon)     │
│  (runs every 1min, sends heartbeats)                    │
└──────────┬──────────────────────────────────────────────┘
           │
           ├─ Query schedules WHERE enabled=true AND nextRunAt <= NOW()
           │
           ├─ For each schedule:
           │  ├─ Check maxConcurrent limit (query JobRun for active scheduleId)
           │  ├─ Acquire lock (prevent duplicate execution)
           │  │
           │  ├─ Enqueue jobs based on executionMode:
           │  │  ├─ ALL_JOBS → adminApi.enqueueAllJobs()
           │  │  ├─ GROUP → adminApi.enqueueJobsByGroup(group)
           │  │  ├─ SINGLE_JOB → adminApi.enqueueJob(jobName, params)
           │  │  └─ CUSTOM → loop and enqueue each job
           │  │
           │  ├─ For each created JobRun:
           │  │  ├─ Set trigger: 'CRON'
           │  │  ├─ Set scheduleId: schedule.id
           │  │  └─ Set metadata: { scheduleId, scheduleName, executionMode }
           │  │
           │  ├─ Update JobSchedule:
           │  │  ├─ lastRunAt = NOW()
           │  │  ├─ lastRunId = first JobRun.id from batch
           │  │  ├─ nextRunAt = calculateNextRun()
           │  │  └─ runCount++
           │  │
           │  └─ Release lock
           │
           ├─ Update WorkerInstance heartbeat
           │
           └─ Sleep until next minute
```

**Integration with Existing Systems:**
- Uses existing job enqueue APIs (same as manual triggers)
- Creates standard JobRun records (visible in Job Manager)
- JobLogs are automatically created by job execution system
- WebSocket events fire as normal for real-time UI updates
- Worker health monitored via WorkerInstance table

**MVP Simplified Flow for "Run All Jobs":**

```typescript
// Schedule daemon polls every minute
async function processSchedules() {
  // 1. Find schedules that are due to run
  const dueSchedules = await prisma.jobSchedule.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: new Date() }
    }
  });
  
  for (const schedule of dueSchedules) {
    // 2. For "Daily Full Sync" schedule
    if (schedule.executionMode === 'ALL_JOBS') {
      
      // 3. Call existing API that you already have!
      const result = await adminApi.enqueueAllJobs();
      // This creates 20+ JobRun records in dependency order
      
      // 4. Link first JobRun to schedule for tracking
      await prisma.jobSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          lastRunId: result.firstJobRunId, // Track the batch
          nextRunAt: calculateNextRun(schedule), // Tomorrow at 2am
          runCount: { increment: 1 }
        }
      });
      
      // 5. Tag all JobRuns with scheduleId
      await prisma.jobRun.updateMany({
        where: { id: { in: result.jobRunIds } },
        data: { scheduleId: schedule.id }
      });
    }
  }
}
```

**That's it!** The schedule system is just a thin wrapper around your existing job infrastructure.

### 3. Frontend UI Components

#### MVP: Simple Schedule List (Option B - Code-Defined)

**Location:** Add tab to existing Job Manager page OR new `/admin/schedules` route

**Read-Only View (schedules from code):**
```
╔════════════════════════════════════════════════════════════════════════╗
║ Job Schedules                                                          ║
║ Schedule definitions are in code. Use toggle to enable/disable.       ║
╠════════════════════════════════════════════════════════════════════════╣
║ Name              | Enabled | Schedule  | Last Run      | Next Run    ║
╟───────────────────┼─────────┼───────────┼───────────────┼─────────────╢
║ Daily Full Sync   | [✓] ON  | 0 2 * * * | 2h ago (✓ 20) | 22h        ║
║ 2am daily, all    |         | Daily     |               |             ║
║                   |         |           | [Run Now] [View History]    ║
╟───────────────────┼─────────┼───────────┼───────────────┼─────────────╢
║ Hourly Matching   | [✓] ON  | 0 * * * * | 15m ago (✓ 6) | 45m        ║
║ Every hour,       |         | Hourly    |               |             ║
║ matching group    |         |           | [Run Now] [View History]    ║
╟───────────────────┼─────────┼───────────┼───────────────┼─────────────╢
║ Feed Refresh      | [ ] OFF | */15 * ** | Never run     | -           ║
║ Every 15 min,     |         | Every 15m |               |             ║
║ feed group        |         |           | [Enable First]              ║
╚═══════════════════╧═════════╧═══════════╧═══════════════╧═════════════╝
```

**Component Structure:**

```typescript
// frontend/src/admin/pages/SchedulesPage.tsx

interface ScheduleDisplay {
  id: string;                    // From code definitions
  name: string;                  // From code
  description: string;           // From code
  cron: string;                  // From code
  executionMode: string;         // From code
  jobGroup?: string;             // From code
  
  // From database (runtime state)
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  failureCount: number;
}

function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleDisplay[]>([]);
  
  // Fetch combines code definitions + database state
  const loadSchedules = async () => {
    const response = await adminApi.getSchedules();
    // Returns: code definitions merged with DB state
    setSchedules(response.schedules);
  };
  
  const handleToggle = async (scheduleId: string, enabled: boolean) => {
    await adminApi.updateSchedule(scheduleId, { enabled });
    loadSchedules(); // Refresh
  };
  
  return (
    <div>
      <h1>Job Schedules</h1>
      <p>Schedule definitions are version-controlled in code. 
         Toggle switches to enable/disable.</p>
      
      <table>
        {schedules.map(schedule => (
          <ScheduleRow 
            key={schedule.id}
            schedule={schedule}
            onToggle={handleToggle}
          />
        ))}
      </table>
    </div>
  );
}
```

**Actions per row:**
- ✅ Toggle switch: Enable/Disable (instant)
- ✅ Run Now button: Trigger immediately (same as manual)
- ✅ View History link: Filter Job Manager by scheduleId
- ❌ Edit button: Not needed (config is in code)
- ❌ Delete button: Not needed (remove from code instead)

**To add a new schedule:**
1. Edit `backend/src/lib/jobs/schedules/definitions.ts`
2. Add new schedule object to array
3. Deploy
4. Daemon syncs on restart
5. Appears in UI (disabled by default)
6. Admin enables via toggle

#### Option C: Database-Driven UI (If You Need Full Flexibility)

<details>
<summary>Click to see editable form UI (more complex)</summary>

**Form Layout:**
```
┌─────────────────────────────────────────────┐
│ Create Schedule                             │
├─────────────────────────────────────────────┤
│ Name: [___________________________]         │
│                                             │
│ Cron Expression: [___________]              │
│ Examples: 0 2 * * * (2am daily)             │
│           0 * * * * (every hour)            │
│           */15 * * * * (every 15 min)       │
│                                             │
│ Execution Mode: ⚫ All Jobs                 │
│                 ○ Job Group [matching▼]    │
│                                             │
│ □ Enable immediately                        │
│                                             │
│ Next 3 runs: Tomorrow 2:00 AM               │
│              Dec 12 2:00 AM                 │
│              Dec 13 2:00 AM                 │
│                                             │
│              [Cancel]  [Create Schedule]    │
└─────────────────────────────────────────────┘
```

</details>

---

**Recommendation**: Start with **Option B** (code-defined, read-only UI with toggles). It's 90% simpler and you likely won't need to change schedule times often.

### 4. Common Schedule Templates

**MVP Templates (Day 1 use cases):**

| Priority | Template Name | Schedule | Execution Mode | Jobs | Purpose |
|----------|--------------|----------|----------------|------|---------|
| 🔥 **#1** | **Daily Full Sync** | `0 2 * * *` (2am daily) | ALL_JOBS | All 20+ jobs | **PRIMARY USE CASE**: Run all jobs once per day |
| 🔥 **#2** | **Hourly Matching** | `0 * * * *` (hourly) | GROUP | matching | Update match scores frequently |
| 🔥 **#3** | **Feed Refresh** | `*/15 * * * *` (every 15min) | GROUP | feed | Keep feeds fresh |

**Phase 2 Templates (nice to have):**

| Template Name | Schedule | Execution Mode | Jobs | Purpose |
|--------------|----------|----------------|------|---------|
| **Search Index** | `0 */4 * * *` (every 4h) | GROUP | search | Rebuild search indexes |
| **Weekly Cleanup** | `0 3 * * 0` (3am Sunday) | GROUP | maintenance | Deep cleanup tasks |
| **Media Processing** | `*/30 * * * *` (every 30min) | GROUP | media | Process pending media |

### MVP Focus: Simple, Reliable "Run All" Schedule

**What we're building first:**
1. ✅ One schedule: "Daily Full Sync" at 2am
2. ✅ Calls existing `enqueueAllJobs()` API
3. ✅ Simple enable/disable toggle
4. ✅ Shows last run, next run, success/failure
5. ✅ Links to Job Manager for details

**What can wait:**
- ❌ Complex UI with drag-drop
- ❌ Multiple schedules (start with 1-3)
- ❌ Custom job selection
- ❌ Email notifications
- ❌ Advanced analytics

### 5. Implementation Phases

#### MVP: "Run All Jobs" Schedule (Week 1-2) 🎯

**Goal**: Single schedule that runs all jobs daily at 2am

**Database (Day 1-2)**
- [ ] Create `JobSchedule` table migration
- [ ] Extend `JobRun` table with `scheduleId` column
- [ ] Add indexes

**Backend (Day 3-5)**
- [ ] Schedule daemon: Poll schedules every minute
- [ ] Integration: Call `adminApi.enqueueAllJobs()` when schedule due
- [ ] Calculator: Parse cron, calculate next run time (use `cron-parser` library)
- [ ] Worker: Register daemon as `WorkerInstance` with heartbeat
- [ ] API: Create/read/update/enable/disable schedule

**Frontend (Day 6-8)**
- [ ] Simple schedule list (table with enable toggle)
- [ ] Basic form: Name, Cron Expression, Execution Mode
- [ ] Show last run, next run, status
- [ ] Link to Job Manager to see actual job runs
- [ ] Daemon status indicator

**Testing & Deployment (Day 9-10)**
- [ ] Create default "Daily Full Sync" schedule (disabled)
- [ ] Test schedule triggers jobs correctly
- [ ] Monitor for 24 hours
- [ ] Enable for production

**What's EXCLUDED from MVP:**
- ❌ Custom job selection (only ALL_JOBS and GROUP modes)
- ❌ Visual cron builder (text input only)
- ❌ Email notifications
- ❌ Advanced analytics
- ❌ Schedule templates UI (can add manually via SQL)

#### Phase 2: Group Schedules + Polish (Week 3)
- [ ] GROUP execution mode (e.g., "matching" jobs hourly)
- [ ] Better UI: Schedule details page
- [ ] Cron expression helper/validator
- [ ] Schedule run history view
- [ ] Email alerts on consecutive failures

#### Phase 3: Advanced Features (Week 4+)
- [ ] SINGLE_JOB and CUSTOM execution modes
- [ ] Schedule templates/presets
- [ ] Visual cron expression builder
- [ ] Schedule conflict detection
- [ ] Performance analytics dashboard
- [ ] Webhook notifications

### 6. Technical Considerations

#### Schedule Daemon Implementation Options

**Option A: Separate Node.js Process**
- Pros: Isolation, can be scaled independently, clear separation of concerns
- Cons: Additional process to manage, requires IPC or database communication
- Implementation: New script in `backend/scripts/scheduleDaemon.ts`

**Option B: Worker Thread in Main Process**
- Pros: Simpler deployment, shared memory access
- Cons: Couples scheduler to main app lifecycle
- Implementation: Add to existing worker system

**Option C: External Scheduler (e.g., node-cron in-process)**
- Pros: Simple, no polling needed
- Cons: Lost if process restarts, hard to manage dynamically
- Implementation: Load schedules on startup and register with node-cron

**Recommendation**: Option A (Separate Process) for production reliability

#### Locking Strategy (Critical for Correctness)

**Problem**: Without proper locking, schedules can run multiple times if:
- Daemon crashes mid-execution
- Slow runs overlap next scheduled time
- Multiple daemon instances running
- Daemon restarts during deployment

**Solution**: Atomic lock acquisition with timeout

```typescript
// Atomic lock acquisition (prevents duplicate runs)
async function acquireLock(scheduleId: string): Promise<boolean> {
  const result = await prisma.jobSchedule.updateMany({
    where: {
      id: scheduleId,
      lockedAt: null // Only succeed if NOT already locked
    },
    data: {
      lockedAt: new Date(),
      lockedBy: workerId
    }
  });
  
  return result.count > 0; // True if lock acquired
}

// Cleanup stalled locks (daemon crash recovery)
async function cleanupStalledLocks() {
  const stalledThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 min
  
  await prisma.jobSchedule.updateMany({
    where: { lockedAt: { lt: stalledThreshold } },
    data: { lockedAt: null, lockedBy: null }
  });
}
```

**Why this works:**
- ✅ `updateMany` with `where: { lockedAt: null }` is atomic
- ✅ If lock already held, update affects 0 rows → acquisition fails
- ✅ Stalled locks (daemon crash) cleaned up after 5 minutes
- ✅ Survives restarts, crashes, slow runs

#### Missed Run Policy (Explicit Behavior)

**What happens if daemon is down during a scheduled run?**

**MVP Policy: SKIP missed runs**

```
Timeline:
  2:00 AM - Schedule should run (daemon is DOWN ❌)
  2:05 AM - Daemon starts back up
  
Behavior:
  ❌ Do NOT run the 2:00 AM job retroactively
  ✅ Wait for next scheduled time (tomorrow 2:00 AM)
```

**Why SKIP is safe for MVP:**
- Most jobs are idempotent (safe to run late)
- Avoids thundering herd on daemon restart
- Prevents backlog accumulation
- Simpler implementation

**How it works:**
```typescript
// Only process if nextRunAt is in the past AND not locked
const dueSchedules = await prisma.jobSchedule.findMany({
  where: {
    enabled: true,
    lockedAt: null,
    nextRunAt: { lte: new Date() } // Past due
  }
});

// After successful run, nextRunAt moves forward
// If daemon was down, old nextRunAt is simply skipped
```

**Visibility:**
- Log on daemon startup: `"Missed Run Policy: SKIP"`
- UI shows last successful run time (makes gaps obvious)
- Alerts can detect gaps > 24 hours

**Phase 2: Catch-up mode** (if needed later)
```typescript
// For critical schedules, could add:
{
  id: 'critical-sync',
  missedRunPolicy: 'CATCH_UP', // Run once on startup if missed
  maxCatchUpAge: 3600 // Only catch up if < 1 hour old
}
```

#### Next Run Calculation

```typescript
import cronParser from 'cron-parser';

function calculateNextRun(schedule: JobSchedule): Date {
  switch (schedule.scheduleType) {
    case 'CRON':
      const interval = cronParser.parseExpression(schedule.cronExpression!, {
        tz: schedule.timezone
      });
      return interval.next().toDate();
      
    case 'INTERVAL':
      const lastRun = schedule.lastRunAt || new Date();
      return new Date(lastRun.getTime() + schedule.intervalMs!);
      
    case 'ONCE':
      return schedule.nextRunAt!; // Set once, never recalculated
  }
}
```

### 7. API Endpoints

```typescript
// Schedule Management
GET    /api/admin/schedules                 // List all schedules
POST   /api/admin/schedules                 // Create new schedule
GET    /api/admin/schedules/:id             // Get schedule details
PUT    /api/admin/schedules/:id             // Update schedule
DELETE /api/admin/schedules/:id             // Delete schedule
POST   /api/admin/schedules/:id/enable      // Enable schedule
POST   /api/admin/schedules/:id/disable     // Disable schedule
POST   /api/admin/schedules/:id/trigger     // Run schedule immediately
GET    /api/admin/schedules/:id/history     // Get schedule run history

// Schedule Daemon Control
GET    /api/admin/scheduler/status          // Get daemon status
POST   /api/admin/scheduler/start           // Start daemon
POST   /api/admin/scheduler/stop            // Stop daemon

// Schedule Validation
POST   /api/admin/schedules/validate-cron   // Validate cron expression
POST   /api/admin/schedules/preview-runs    // Preview next run times
```

**Schedule History Query Example:**
```typescript
// Get all JobRuns triggered by a specific schedule
// Uses existing JobRun table with new scheduleId relationship
async function getScheduleHistory(scheduleId: bigint, limit = 50) {
  return prisma.jobRun.findMany({
    where: { scheduleId },
    orderBy: { queuedAt: 'desc' },
    take: limit,
    include: {
      logs: {
        where: { level: { in: ['error', 'milestone'] } },
        orderBy: { timestamp: 'asc' }
      }
    }
  });
}
```

### 8. Security & Permissions

- Only users with `ADMIN` role can create/edit/delete schedules
- Audit all schedule changes (createdBy, lastModifiedBy)
- Log all schedule executions to JobRun table with `trigger: 'CRON'` (existing enum value)
- Add schedule metadata to JobRun records: `{ scheduleId, scheduleName, executionMode, scheduledFor }`
- Rate limit schedule operations to prevent abuse

### 9. Monitoring & Alerting

**Dashboard Metrics:**
- Total schedules (enabled/disabled)
- Schedules running on time vs delayed
- Failed schedule executions (last 24h)
- Most frequently run schedules
- Average execution duration by schedule

**Alerts:**
- Email admin when schedule fails N times consecutively
- Warn when schedule execution time exceeds expected duration
- Alert when daemon stops unexpectedly

### 10. Testing Strategy

**Unit Tests:**
- Cron expression parser and validator
- Next run time calculator
- Schedule conflict detector
- Concurrency limit checker

**Integration Tests:**
- Schedule daemon polling and execution
- Lock acquisition and release
- API endpoints CRUD operations
- Job enqueue from scheduled trigger

**E2E Tests:**
- Create schedule via UI → verify jobs run on time
- Disable schedule → verify jobs stop running
- Edit schedule → verify new schedule takes effect
- Test various cron patterns

### 11. Migration Plan

**Database Migration Steps:**

```sql
-- Step 1: Create new JobSchedule table
CREATE TABLE "JobSchedule" (
  -- See full schema above
);

-- Step 2: Extend existing JobRun table
ALTER TABLE "JobRun" 
  ADD COLUMN "scheduleId" BIGINT NULL,
  ADD CONSTRAINT "JobRun_scheduleId_fkey" 
    FOREIGN KEY ("scheduleId") 
    REFERENCES "JobSchedule"("id") 
    ON DELETE SET NULL;

CREATE INDEX "JobRun_scheduleId_idx" ON "JobRun"("scheduleId");

-- Step 3: No changes needed to JobLog or WorkerInstance
-- They work as-is with the new system
```

**Deployment Steps:**
1. Deploy database migration (add JobSchedule table, extend JobRun)
2. Deploy backend with schedule daemon (disabled by default)
3. Deploy frontend UI
4. Admin creates initial schedules via UI
5. Admin enables scheduler daemon
6. Monitor for 24-48 hours
7. Deprecate any external cron jobs if applicable

**Rollback Plan:**
- Disable all schedules via admin UI
- Stop schedule daemon
- Remove `scheduleId` column from JobRun (data preserved)
- Drop JobSchedule table (if needed)

## Quick Start: Create Your First Schedule

**After deployment, create the primary "Run All" schedule:**

### Option 1: Via Admin UI (Recommended)
1. Go to `/admin/schedules`
2. Click "New Schedule"
3. Fill in:
   - Name: `Daily Full Sync`
   - Cron: `0 2 * * *`
   - Mode: `All Jobs`
   - Enabled: ✓
4. Click "Create"
5. Done! Jobs will run tomorrow at 2am

### Option 2: Via SQL (Quick setup)
```sql
-- Create the primary "Run All Jobs" schedule
INSERT INTO "JobSchedule" (
  name, enabled, cronExpression, timezone, executionMode, 
  createdBy, nextRunAt
) VALUES (
  'Daily Full Sync',
  true,
  '0 2 * * *',
  'UTC',
  'ALL_JOBS',
  1, -- Your admin user ID
  '2026-01-11 02:00:00' -- Tomorrow at 2am
);
```

### Optional: Add Frequent Job Group Schedules
```sql
-- Hourly matching updates
INSERT INTO "JobSchedule" (
  name, enabled, cronExpression, executionMode, jobGroup, createdBy, nextRunAt
) VALUES (
  'Hourly Matching', true, '0 * * * *', 'GROUP', 'matching', 1, 
  '2026-01-10 15:00:00'
);

-- 15-min feed refresh
INSERT INTO "JobSchedule" (
  name, enabled, cronExpression, executionMode, jobGroup, createdBy, nextRunAt
) VALUES (
  'Feed Refresh', true, '*/15 * * * *', 'GROUP', 'feed', 1,
  '2026-01-10 14:30:00'
);
```

### What You'll See

**After schedule creates JobRuns:**
```
Job Manager → Filter by Trigger: "CRON"
┌────────────────────────────────────────────────┐
│ Job: match-scores     Status: ✓ SUCCESS        │
│ Triggered by: Daily Full Sync schedule         │
│ Duration: 2m 34s                               │
├────────────────────────────────────────────────┤
│ Job: compatibility    Status: ✓ SUCCESS        │
│ Triggered by: Daily Full Sync schedule         │
│ Duration: 1m 12s                               │
├────────────────────────────────────────────────┤
│ ... 18 more jobs ...                          │
└────────────────────────────────────────────────┘
```

### 12. Future Enhancements

- **Conditional Schedules**: Only run if certain conditions met (e.g., queue depth, time since last success)
- **Schedule Chaining**: Trigger one schedule after another completes
- **Dynamic Scheduling**: Adjust frequency based on load or data volume
- **Schedule Versioning**: Track schedule changes over time
- **Multi-tenancy**: Different schedules per environment (dev/staging/prod)
- **Holiday Awareness**: Skip or reschedule on holidays
- **Maintenance Windows**: Block schedule execution during deployments
- **Resource-aware Scheduling**: Consider system load before executing
- **Schedule Groups**: Group related schedules for bulk operations
- **Webhook Notifications**: HTTP callbacks on schedule events

## MVP Code Example: Complete Schedule Daemon (Option B)

**File: `backend/src/lib/jobs/schedules/definitions.ts`** (~30 lines)

```typescript
export interface ScheduleDefinition {
  id: string;
  name: string;
  description: string;
  cron: string;
  timezone: string;
  executionMode: 'ALL_JOBS' | 'GROUP';
  jobGroup?: string;
}

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

**File: `backend/scripts/scheduleDaemon.ts`** (~150 lines)

```typescript
import { prisma } from '../src/lib/prisma/client.js';
import cronParser from 'cron-parser';
import { schedules } from '../src/lib/jobs/schedules/definitions.js';
import { hostname } from 'os';

// Import existing enqueue APIs (don't reimplement!)
import { enqueueAllJobs, enqueueJobsByGroup } from '../src/lib/jobs/enqueue.js';

let workerId: string;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function registerWorker() {
  const worker = await prisma.workerInstance.create({
    data: {
      workerType: 'schedule_daemon',
      status: 'RUNNING',
      hostname: hostname(),
      pid: process.pid
    }
  });
  workerId = worker.id;
  console.log(`Schedule daemon registered: ${workerId}`);
}

async function syncScheduleDefinitions() {
  // Sync code → database (create missing, DO NOT enable by default)
  for (const schedule of schedules) {
    await prisma.jobSchedule.upsert({
      where: { id: schedule.id },
      create: {
        id: schedule.id,
        enabled: false, // ⚠️ Default DISABLED for safety
        nextRunAt: cronParser
          .parseExpression(schedule.cron, { tz: schedule.timezone })
          .next()
          .toDate()
      },
      update: {} // Don't touch existing records
    });
  }
}

async function cleanupStalledLocks() {
  // Release locks older than 5 minutes (daemon crash recovery)
  const stalledThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);
  
  const result = await prisma.jobSchedule.updateMany({
    where: {
      lockedAt: { lt: stalledThreshold }
    },
    data: {
      lockedAt: null,
      lockedBy: null
    }
  });
  
  if (result.count > 0) {
    console.warn(`⚠️  Cleaned ${result.count} stalled schedule locks`);
  }
}

async function acquireLock(scheduleId: string): Promise<boolean> {
  // Atomic lock acquisition using optimistic update
  const result = await prisma.jobSchedule.updateMany({
    where: {
      id: scheduleId,
      lockedAt: null // Only acquire if not locked
    },
    data: {
      lockedAt: new Date(),
      lockedBy: workerId
    }
  });
  
  return result.count > 0;
}

async function releaseLock(scheduleId: string) {
  await prisma.jobSchedule.update({
    where: { id: scheduleId },
    data: {
      lockedAt: null,
      lockedBy: null
    }
  });
}

async function processSchedules() {
  const now = new Date();
  
  // Find schedules due to run (enabled + not locked + past nextRunAt)
  const dueSchedules = await prisma.jobSchedule.findMany({
    where: {
      enabled: true,
      lockedAt: null,
      OR: [
        { nextRunAt: { lte: now } },
        { nextRunAt: null } // First run
      ]
    }
  });
  
  for (const dbSchedule of dueSchedules) {
    const definition = schedules.find(s => s.id === dbSchedule.id);
    if (!definition) {
      console.warn(`⚠️  Schedule ${dbSchedule.id} not found in code definitions`);
      continue;
    }
    
    // Acquire lock (prevents duplicate runs across daemon restarts/crashes)
    const acquired = await acquireLock(dbSchedule.id);
    if (!acquired) {
      console.log(`⏭  Schedule ${definition.name} already locked, skipping`);
      continue;
    }
    
    try {
      console.log(`⏰ Processing schedule: ${definition.name}`);
      
      // Use existing enqueue APIs (maintains consistency with manual triggers)
      let result: { jobRunIds: bigint[] };
      
      if (definition.executionMode === 'ALL_JOBS') {
        result = await enqueueAllJobs({ scheduleId: dbSchedule.id });
      } else if (definition.executionMode === 'GROUP' && definition.jobGroup) {
        result = await enqueueJobsByGroup(definition.jobGroup as any, { 
          scheduleId: dbSchedule.id 
        });
      } else {
        throw new Error(`Invalid execution mode: ${definition.executionMode}`);
      }
      
      // Calculate next run time
      const nextRun = cronParser
        .parseExpression(definition.cron, { tz: definition.timezone })
        .next()
        .toDate();
      
      // Update schedule state
      await prisma.jobSchedule.update({
        where: { id: dbSchedule.id },
        data: {
          lastRunAt: now,
          lastRunId: result.jobRunIds[0],
          nextRunAt: nextRun,
          runCount: { increment: 1 },
          lockedAt: null, // Release lock
          lockedBy: null
        }
      });
      
      console.log(`✅ Enqueued ${result.jobRunIds.length} jobs, next: ${nextRun}`);
      
    } catch (err) {
      console.error(`❌ Failed to process ${definition.name}:`, err);
      
      await prisma.jobSchedule.update({
        where: { id: dbSchedule.id },
        data: {
          failureCount: { increment: 1 },
          lockedAt: null, // Release lock on error
          lockedBy: null
        }
      });
    }
  }
}

async function main() {
  await registerWorker();
  await syncScheduleDefinitions();
  
  console.log('✅ Schedule daemon started');
  console.log('⚠️  Missed Run Policy: SKIP (if daemon down, wait for next interval)');
  console.log(`📋 Loaded ${schedules.length} schedule definitions from code`);
  
  // Poll every minute
  setInterval(async () => {
    await prisma.workerInstance.update({
      where: { id: workerId },
      data: { lastHeartbeatAt: new Date() }
    });
    
    await cleanupStalledLocks();
    await processSchedules();
  }, 60_000);
  
  // Initial run
  await cleanupStalledLocks();
  await processSchedules();
}

main().catch(console.error);
```

**Key Improvements:**
1. ✅ **Proper locking**: `lockedAt` + `lockedBy` prevents duplicate runs
2. ✅ **Lock cleanup**: Stalled locks released after 5 minutes
3. ✅ **Uses existing APIs**: Calls `enqueueAllJobs()` / `enqueueJobsByGroup()`
4. ✅ **Schedules disabled by default**: Admin must explicitly enable
5. ✅ **Missed run policy explicit**: Logs "SKIP" policy on startup
6. ✅ **Atomic lock acquisition**: Using `updateMany` with `where: { lockedAt: null }`

## Critical Design Decisions ✅ (Addressed Per Feedback)

### 1. ✅ Locking is Explicit and Robust

**Problem**: Original proposal had weak locking (`lastRunAt < now - 1 min`)

**Solution**: Atomic lock acquisition with cleanup
```typescript
lockedAt: DateTime?  // Explicit lock timestamp
lockedBy: String?    // Worker ID for debugging
```
- ✅ Atomic `updateMany` with `where: { lockedAt: null }`
- ✅ Stalled lock cleanup after 5 minutes (daemon crash recovery)
- ✅ Survives crashes, restarts, slow runs, redeployments

### 2. ✅ Missed Run Behavior is Explicit

**Policy: SKIP missed runs** (documented and logged)

```
If daemon is down during scheduled time:
❌ Do NOT run retroactively
✅ Wait for next scheduled interval
📝 Log policy on daemon startup
📊 UI shows gaps in last run times (makes issues visible)
```

### 3. ✅ Daemon Uses Existing Enqueue APIs

**Don't manually create JobRuns** - Use existing APIs:

```typescript
// ✅ CORRECT: Use existing API
const result = await enqueueAllJobs({ scheduleId: schedule.id });

// ❌ WRONG: Manually create JobRuns
await prisma.jobRun.create({ jobName, ... });
```

**Benefits:**
- Dependency ordering handled correctly
- Consistent metadata across manual + scheduled triggers
- Single source of truth for job enqueuing

### 4. ✅ Schedules Default to Disabled

**Safety first:**
```typescript
create: {
  id: schedule.id,
  enabled: false  // ⚠️ Admin must explicitly enable
}
```

**Prevents:**
- Surprise production behavior on deploy
- Accidental activation
- Testing schedules going live

### 5. ✅ MVP Scope Simplified

**Removed from MVP:**
- ❌ Interval/one-time schedules (just CRON)
- ❌ maxConcurrent settings (assume 1)
- ❌ Retry logic (job worker handles)
- ❌ Daemon start/stop API (just restart process)
- ❌ Custom job selection (ALL_JOBS + GROUP only)

**MVP Focus:**
- ✅ 1-3 schedules
- ✅ Enable/disable
- ✅ Run-now
- ✅ Visibility

## Questions & Decisions

1. **What happens if daemon crashes mid-execution?**
   - Stalled locks cleaned up after 5 minutes
   - Next poll picks up where it left off
   - No duplicate executions

2. **How to handle schedule changes while jobs are running?**
   - Changes take effect on next run
   - Don't affect active runs

3. **What about daylight savings time?**
   - Use `cron-parser` with timezone support (handles DST automatically)

4. **How do we deploy the daemon?**
   - Run as separate process via `pm2`, systemd, or Railway Procfile
   - Deploy same as other Node processes

## Success Metrics

- Reduce manual job triggering by 90%
- Ensure critical jobs run on time 99%+ of the time
- Zero duplicate schedule executions
- Schedule management time < 5 minutes per week
- All schedules documented and monitored

## MVP Scope Summary

### ✅ What We're Building (Week 1-2)

**The Problem:** Need to run all 20+ jobs automatically every day at 2am

**The Solution:** Simple schedule system focused on "Run All Jobs"

| Feature | MVP | Phase 2 | Phase 3 |
|---------|-----|---------|---------|
| Schedule all jobs daily | ✅ | - | - |
| Schedule job groups (matching, feed, etc.) | ✅ | - | - |
| Cron expression support | ✅ | - | - |
| Enable/disable toggle | ✅ | - | - |
| Show last/next run times | ✅ | - | - |
| Link to Job Manager | ✅ | - | - |
| Schedule daemon with heartbeat | ✅ | - | - |
| Proper locking (lockedAt/lockedBy) | ✅ | - | - |
| Uses existing enqueue APIs | ✅ | - | - |
| **Total LOC: ~300 lines** | **✅** | - | - |
| | | | |
| Custom job selection | ❌ | ✅ | - |
| Visual cron builder | ❌ | ✅ | - |
| Email alerts | ❌ | ✅ | - |
| Schedule details page | ❌ | ✅ | - |
| Success rate analytics | ❌ | ✅ | - |
| Concurrency limits | ❌ | - | ✅ |
| Retry logic | ❌ | - | ✅ |
| Timeout settings | ❌ | - | ✅ |
| Interval/one-time schedules | ❌ | - | ✅ |

### 🎯 MVP Success Criteria

1. ✅ Admin creates "Daily Full Sync" schedule in < 2 minutes
2. ✅ Schedule triggers all jobs at 2am without intervention
3. ✅ All 20+ JobRuns visible in existing Job Manager
4. ✅ Can enable/disable schedule with one click
5. ✅ Shows clear last run and next run times
6. ✅ Daemon monitored via WorkerInstance table
7. ✅ Zero duplicate executions

### 📦 Deliverables

**Backend** (~300 LOC):
- `backend/prisma/schema/schedules.prisma` - JobSchedule model
- `backend/scripts/scheduleDaemon.ts` - Schedule daemon (~150 lines)
- `backend/src/registry/domains/admin/schedules.ts` - CRUD API (~150 lines)

**Frontend** (~200 LOC):
- `frontend/src/admin/pages/SchedulesPage.tsx` - Simple list view
- `frontend/src/admin/components/ScheduleForm.tsx` - Create/edit modal
- Add route to admin layout

**Total**: ~300 lines of code for complete MVP (code-defined approach)

### 🚀 Deployment Steps

1. Run migration (add JobSchedule + JobRun.scheduleId)
2. Deploy backend + daemon
3. Deploy frontend
4. Create "Daily Full Sync" schedule via UI
5. Enable schedule
6. Monitor for 24-48 hours
7. Done!

## Final Recommendation

### Start with Option B: Code-Defined Schedules

**Why Option B is better for your use case:**

| Aspect | Option B (Code-Defined) ✅ | Option C (DB-Driven) |
|--------|--------------------------|----------------------|
| **Lines of code** | ~300 | ~500 |
| **UI complexity** | Simple table + toggles | Form validation, cron builder |
| **Risk of breaking** | Very low (validated in code) | Medium (admin typo risk) |
| **Version control** | Yes (schedules in git) | No (config in DB) |
| **Schedule changes** | Code deploy (rare) | UI form (frequent) |
| **Your actual need** | 2-3 fixed schedules | Many changing schedules |
| **Implementation time** | 1 week | 2 weeks |

**What you're actually building:**

```typescript
// 1. Define schedules in code (30 lines)
export const schedules = [
  { id: 'daily-full-sync', cron: '0 2 * * *', executionMode: 'ALL_JOBS' },
  { id: 'hourly-matching', cron: '0 * * * *', executionMode: 'GROUP', jobGroup: 'matching' }
];

// 2. Simple daemon loads definitions, checks DB for enabled state (120 lines)
// 3. Simple UI shows definitions, admin toggles enabled (150 lines)
```

**Total: ~300 LOC, 1 week**

### Migration Path if You Need More Later

If you later discover you need fully editable schedules:

1. Keep existing code-defined schedules running
2. Add "custom schedules" with editable UI
3. Both systems coexist (code-defined are the "official" ones)

But honestly? You probably won't need it. Your schedules are stable:
- "All jobs" runs daily at 2am ← **This never changes**
- "Matching" runs hourly ← **Maybe tweaked once a year**
- "Feed" runs every 15 min ← **Set and forget**

## Conclusion

This proposal provides a **simple, focused MVP** for the primary use case: automatically running all jobs daily. 

**Option B (Recommended)**:
- ~300 lines of code
- 1 week implementation
- Schedules version-controlled with code
- Admin can enable/disable only
- Can't be accidentally broken

**Option C (If needed later)**:
- ~500 lines of code
- 2 weeks implementation
- Fully editable in UI
- More flexibility, more risk

The architecture integrates seamlessly with existing infrastructure (JobRun, JobLog, WorkerInstance) and addresses all critical correctness concerns: proper locking, explicit missed-run policy, uses existing enqueue APIs, and defaults to disabled state.

---

## Final Architectural Answer (Clear) ✅

**Do NOT use system cron or managed cron** ❌
- No `/etc/crontab`
- No cron service dependencies
- Works in containers without shell access

**DO use cron expressions as data only** ✅
- Store cron syntax strings (`"0 2 * * *"`)
- Parse with `cron-parser` library
- Calculate next run times programmatically

**DO run a Node scheduler loop** ✅
- Separate daemon process
- Polls database every minute
- Atomic lock acquisition prevents duplicates

**DO define schedules in code** ✅
- Version controlled with application
- Can't be broken by admin typos
- Admin controls enable/disable only

**DO store runtime state in DB** ✅
- `enabled`, `lockedAt`, `lastRunAt`, `nextRunAt`
- Not configuration

**DO let existing job system do the work** ✅
- Daemon calls `enqueueAllJobs()` / `enqueueJobsByGroup()`
- Creates standard JobRun records
- Job worker picks them up
- All existing monitoring works unchanged

---

**Next Steps:**
1. ✅ Architectural approach confirmed (code-defined schedules)
2. Create implementation tasks
3. Start with database migration (add locking fields!)
4. Build daemon with proper locking
5. Create enqueue API stubs
6. Build simple UI
7. Test with "Daily Full Sync" schedule (disabled by default)
8. Admin enables → Monitor for 24-48 hours
9. Deploy to production

**This proposal is now production-ready.** ✅
