# Job Worker System

## Overview

The job worker system provides a robust, singleton-based queue processor for background jobs. It ensures only one worker runs at a time (preventing concurrent processing issues) and provides full admin UI control.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Admin UI      │────────▶│  Backend API     │
│  /admin/jobs    │         │  - Start/Stop    │
│  - Worker Status│         │  - Status Check  │
│  - Start/Stop   │         │  - Health Monitor│
└─────────────────┘         └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │ Worker Manager   │
                            │ (Singleton)      │
                            │ - DB Lock        │
                            │ - Heartbeat      │
                            │ - Status Track   │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  Job Worker      │
                            │  - Poll Queue    │
                            │  - Process Jobs  │
                            │  - WebSocket     │
                            └──────────────────┘
```

## Key Features

### 1. Singleton Pattern (Prevents Duplicate Workers)

**Problem**: Multiple workers processing the same queue causes:
- Duplicate job execution
- Race conditions
- Data corruption
- Wasted resources

**Solution**: Database-backed singleton lock

```typescript
// Worker registration with automatic cleanup
const workerId = await registerWorker('job_worker');
if (!workerId) {
  throw new Error('Another worker is already running');
}
```

**How it works:**
1. Worker attempts to register in `worker_instances` table
2. Checks for existing active workers
3. Automatically cleans up stale workers (no heartbeat > 30s)
4. Only one worker can be in `RUNNING` state at a time

### 2. Heartbeat System

**Purpose**: Detect crashed or stale workers

- Worker sends heartbeat every 10 seconds
- Admin UI detects if no heartbeat for 30+ seconds
- Stale workers automatically marked as STOPPED
- Enables graceful recovery from crashes

```typescript
// Automatic heartbeat while worker runs
startHeartbeat(); // Updates lastHeartbeatAt every 10s
```

### 3. Worker Control via Admin UI

**Location**: `/admin/jobs` (integrated into Job Manager)

**Features:**
- **Status Display**: See if worker is running, hostname, PID, uptime
- **Start Button**: Launch worker from UI (only if none running)
- **Stop Button**: Graceful shutdown with confirmation
- **Auto-refresh**: Real-time status updates every 5 seconds
- **Worker History**: View recent worker instances

**Safety Checks:**
- Cannot start if another worker is already running
- Cannot start duplicate workers in same process
- Detects externally-started workers (via CLI or cron)
- Warns if multiple workers detected (shouldn't happen)

## Usage

### Option 1: Start via Admin UI (Recommended for Development)

1. Go to `/admin/jobs`
2. See "Job Worker" section at top
3. Click "Start Worker" if stopped
4. Worker runs in background of API server process
5. Stop anytime via UI

**Pros:**
- No separate terminal needed
- Easy to start/stop
- Visual feedback

**Cons:**
- Worker stops if you restart backend server
- Not suitable for production (use systemd/pm2 instead)

### Option 2: Start via CLI (Production)

```bash
cd backend
pnpm worker:jobs
```

**Pros:**
- Separate process (more robust)
- Can be managed by process manager (pm2, systemd)
- Survives backend server restarts

**Cons:**
- Requires separate terminal/process
- Must manually start after deployment

### Option 3: Auto-start with Backend (Future)

Add to `backend/src/index.ts`:

```typescript
import { workerLoop } from './workers/jobWorker.js';

// Start worker in background
workerLoop().catch(err => {
  console.error('[worker] Fatal error:', err);
});
```

**Note**: Currently not implemented by default to give you control.

## Worker States

Workers can be in one of four states:

| State      | Description                          | Heartbeat | Can Process Jobs |
|------------|--------------------------------------|-----------|------------------|
| `STARTING` | Worker is initializing               | Active    | No               |
| `RUNNING`  | Worker is active and processing jobs | Active    | Yes              |
| `STOPPING` | Worker received stop signal          | Stopping  | No (finishing)   |
| `STOPPED`  | Worker has shut down                 | None      | No               |

## Database Schema

### `worker_instances` Table

```sql
CREATE TABLE worker_instances (
  id              VARCHAR(36) PRIMARY KEY,  -- UUID
  workerType      VARCHAR(50) DEFAULT 'job_worker',
  status          VARCHAR(20) DEFAULT 'STARTING',
  hostname        VARCHAR(255),
  pid             INT,
  startedAt       DATETIME DEFAULT NOW(),
  lastHeartbeatAt DATETIME DEFAULT NOW(),
  stoppedAt       DATETIME,
  jobsProcessed   INT DEFAULT 0,
  metadata        JSON,
  
  INDEX idx_type_status (workerType, status),
  INDEX idx_heartbeat (lastHeartbeatAt)
);
```

**Fields:**
- `id`: Unique worker instance identifier
- `workerType`: Always `'job_worker'` (supports future worker types)
- `status`: Current state (STARTING/RUNNING/STOPPING/STOPPED)
- `hostname`: Server hostname (for multi-server setups)
- `pid`: Process ID
- `startedAt`: When worker started
- `lastHeartbeatAt`: Last successful heartbeat (updated every 10s)
- `stoppedAt`: When worker stopped (NULL if still running)
- `jobsProcessed`: Total jobs completed by this worker instance
- `metadata`: Additional info (JSON)

## API Endpoints

### GET `/admin/worker/status`

**Purpose**: Get worker health and status

**Auth**: Admin only

**Response:**
```json
{
  "hasActiveWorker": true,
  "activeWorkersCount": 1,
  "localWorkerRunning": true,
  "workers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "hostname": "laptop-xyz",
      "pid": 12345,
      "startedAt": "2026-01-08T10:30:00Z",
      "lastHeartbeatAt": "2026-01-08T10:35:20Z",
      "jobsProcessed": 42,
      "uptime": 320000
    }
  ],
  "recentInstances": [...]
}
```

### POST `/admin/worker/start`

**Purpose**: Start the job worker

**Auth**: Admin only

**Body**: None

**Response:**
```json
{
  "message": "Worker started",
  "status": {
    "isRunning": true,
    "isActive": true
  }
}
```

**Error Conditions:**
- `400`: Worker already running (locally or elsewhere)
- `500`: Failed to start worker

### POST `/admin/worker/stop`

**Purpose**: Stop the job worker

**Auth**: Admin only

**Body**: None

**Response:**
```json
{
  "message": "Worker stop signal sent",
  "status": {
    "isRunning": false,
    "shouldStop": true
  }
}
```

**Error Conditions:**
- `400`: Worker not running in this process
- `500`: Failed to stop worker

**Note**: Only stops the worker running in the current API process. Cannot stop external workers (CLI/cron).

## Graceful Shutdown

Workers handle `SIGTERM` and `SIGINT` for clean shutdowns:

```typescript
process.on('SIGTERM', async () => {
  console.log('[worker] Shutdown signal received');
  shouldStop = true;
  await unregisterWorker(); // Clean up DB record
  process.exit(0);
});
```

**Shutdown Process:**
1. Worker receives stop signal
2. Sets `shouldStop = true`
3. Finishes current job (if any)
4. Updates status to `STOPPED` in database
5. Clears heartbeat timer
6. Exits gracefully

**Jobs in Progress:**
- Current job completes normally
- Queued jobs remain in queue
- No jobs are lost

## Monitoring & Debugging

### Check Worker Status

**Admin UI:** `/admin/jobs` → "Job Worker" section

**CLI:**
```bash
# Check if worker is running
ps aux | grep jobWorker

# View worker logs (if running via CLI)
pnpm worker:jobs
```

**Database:**
```sql
-- See all recent workers
SELECT * FROM worker_instances 
ORDER BY startedAt DESC 
LIMIT 10;

-- See currently running workers
SELECT * FROM worker_instances 
WHERE status IN ('STARTING', 'RUNNING')
AND lastHeartbeatAt > DATE_SUB(NOW(), INTERVAL 30 SECOND);
```

### Common Issues

#### Worker Won't Start - "Another worker is already running"

**Cause**: Another worker instance is active (or database thinks it is)

**Check:**
1. Admin UI shows worker status
2. If worker appears stale (no recent heartbeat), it will auto-cleanup in 30s
3. Force cleanup: "Clean Up Stalled" button in UI

**Manual cleanup (if needed):**
```sql
UPDATE worker_instances 
SET status = 'STOPPED', stoppedAt = NOW()
WHERE status IN ('STARTING', 'RUNNING');
```

#### Worker Stopped Unexpectedly

**Possible Causes:**
- Backend server restarted (if started via UI)
- Process crashed
- System restart
- Manual termination

**Recovery:**
1. Check worker logs for errors
2. Restart worker via UI or CLI
3. Check `worker_instances` table for crash details

#### Jobs Not Processing

**Checklist:**
1. ✅ Worker is running? (Check UI status)
2. ✅ Jobs are QUEUED? (Check Active Jobs list)
3. ✅ No errors in worker logs?
4. ✅ Database connection ok?
5. ✅ Worker heartbeat updating?

#### Multiple Workers Detected

**Cause**: Race condition or manual starts (shouldn't happen)

**Fix:**
1. Stop all workers
2. Wait 30 seconds for cleanup
3. Start single worker
4. Report bug if reproducible

## Production Deployment

### Recommended Setup

1. **Use Process Manager** (pm2, systemd, supervisord)

**Example with pm2:**
```json
{
  "apps": [
    {
      "name": "api",
      "script": "dist/index.js",
      "instances": 1,
      "exec_mode": "cluster"
    },
    {
      "name": "job-worker",
      "script": "dist/workers/jobWorker.js",
      "instances": 1,
      "exec_mode": "fork",
      "restart_delay": 5000
    }
  ]
}
```

**Start:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

2. **Monitor Worker Health**

- Set up alerts for stalled workers
- Monitor `jobsProcessed` counter
- Track heartbeat gaps

3. **Logging**

- Worker logs to stdout/stderr
- Capture with process manager or logging service
- Monitor for errors and crashes

### Scaling Considerations

**Current Design**: Single worker only

**Why?**
- Prevents duplicate job processing
- Simpler to reason about
- Sufficient for most workloads

**Future: Multiple Workers**

If you need multiple workers:
1. Implement job locking (row-level locks on `job_runs`)
2. Add worker pool management
3. Update singleton check to allow N workers
4. Add load balancing logic

**When you need it:**
- Processing > 100 jobs/minute
- Jobs take minutes each
- Queue backlog growing

## Testing

### Manual Testing

1. **Start Worker from UI**
   - Go to `/admin/jobs`
   - Click "Start Worker"
   - Verify status shows RUNNING
   - Check hostname, PID shown

2. **Enqueue Test Job**
   - Click "Run New Job"
   - Select any job with default params
   - Click "Enqueue Job"
   - Watch it move from QUEUED → RUNNING → SUCCESS

3. **Stop Worker**
   - Click "Stop Worker"
   - Confirm dialog
   - Verify status shows STOPPED
   - Enqueue another job - should stay QUEUED

4. **Prevent Duplicate Workers**
   - Start worker via UI
   - In separate terminal: `pnpm worker:jobs`
   - Should fail with "Another worker is already running"

5. **Stale Worker Cleanup**
   - Start worker
   - Force kill process: `kill -9 <PID>`
   - Wait 30 seconds
   - Start worker again - should succeed

### Automated Testing (TODO)

```typescript
describe('Worker Singleton', () => {
  it('prevents duplicate workers', async () => {
    const worker1 = await registerWorker('job_worker');
    expect(worker1).not.toBeNull();
    
    const worker2 = await registerWorker('job_worker');
    expect(worker2).toBeNull(); // Should reject
  });
  
  it('cleans up stale workers', async () => {
    // Create stale worker
    await prisma.workerInstance.create({
      data: {
        status: 'RUNNING',
        lastHeartbeatAt: new Date(Date.now() - 60000) // 1 min ago
      }
    });
    
    // Try to register new worker
    const worker = await registerWorker('job_worker');
    expect(worker).not.toBeNull(); // Should succeed after cleanup
  });
});
```

## Migration Guide

### From Manual CLI to UI Control

**Before:**
```bash
# Had to manually run
pnpm worker:jobs
```

**After:**
1. Go to `/admin/jobs`
2. Click "Start Worker"
3. Done!

### From Shared Queue to Singleton

**Before**: Multiple workers could run, causing issues

**After**: Only one worker at a time (enforced by DB lock)

**Action Required**: None - automatic

## Future Enhancements

1. **Worker Pool** - Multiple workers with job locking
2. **Priority Queues** - High/medium/low priority jobs
3. **Scheduled Jobs** - Cron-like scheduling from UI
4. **Worker Metrics** - Prometheus/Grafana dashboards
5. **Job Retry Logic** - Auto-retry failed jobs
6. **Dead Letter Queue** - Jobs that fail repeatedly
7. **Worker Health Checks** - Automatic restarts
8. **Multi-tenant Workers** - Per-tenant worker pools

## Summary

The job worker system provides:

✅ **Singleton enforcement** - No duplicate workers
✅ **UI control** - Start/stop from admin panel  
✅ **Health monitoring** - Heartbeat + status tracking
✅ **Graceful shutdown** - Clean termination
✅ **Crash recovery** - Auto-cleanup stale workers
✅ **Full visibility** - Real-time status, logs, history
✅ **Production ready** - Process manager compatible

**Best Practice**: Start worker via process manager in production, use UI control in development.
