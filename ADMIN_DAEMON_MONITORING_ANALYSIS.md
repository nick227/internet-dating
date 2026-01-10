# Admin Frontend: Schedule Daemon Monitoring Analysis

## Summary

**Question:** Do we have any requests that monitor or relate to schedule-daemon in the admin frontend?

**Answer:** **Partially.** We have worker monitoring, but it only tracks the old `job_worker`, not the `schedule_daemon`.

---

## What Currently Exists

### 1. Worker Status Endpoint (Job Worker Only)

**Endpoint:** `GET /api/admin/worker/status`

**Backend:** `backend/src/registry/domains/admin/index.ts` (lines 634-678)

**What it queries:**
```typescript
getWorkerInstances('job_worker'),    // Only job_worker type
getActiveWorkersCount('job_worker'), // Only job_worker type
```

**Response:**
```typescript
{
  hasActiveWorker: boolean;
  activeWorkersCount: number;
  localWorkerRunning: boolean;
  workers: WorkerInstance[];          // Only job_worker instances
  recentInstances: Array<...>;       // Only job_worker instances
}
```

**Issue:** This endpoint **hardcodes** `job_worker` type and **ignores** `schedule_daemon` workers.

---

### 2. Frontend API Call

**File:** `frontend/src/admin/api/admin.ts` (line 107-108)

```typescript
async getWorkerStatus(): Promise<WorkerStatus> {
  return http('/api/admin/worker/status', 'GET');
}
```

**Used by:** `frontend/src/admin/components/jobs/WorkerControl.tsx`

**What it displays:**
- Job worker status (running/stopped)
- Active worker count
- Worker start/stop buttons

**Issue:** Only shows `job_worker` status, not `schedule_daemon`.

---

### 3. Schedule Management (EXISTS, but no daemon health)

**Endpoints:**
- `GET /api/admin/schedules` - List schedules ✅
- `GET /api/admin/schedules/:id` - Get schedule details ✅
- `PUT /api/admin/schedules/:id` - Update schedule (enable/disable) ✅
- `POST /api/admin/schedules/:id/trigger` - Manual trigger ✅
- `GET /api/admin/schedules/:id/history` - Execution history ✅

**Frontend:** `frontend/src/admin/pages/SchedulesPage.tsx`

**What it shows:**
- List of all schedules (from code definitions)
- Enable/disable toggles
- Last run time
- Next run time
- Run count / failure count
- Manual trigger button
- Execution history

**What it DOESN'T show:**
- ❌ Daemon health status (is it running?)
- ❌ Daemon heartbeat (when did it last check?)
- ❌ Daemon uptime (how long has it been running?)
- ❌ Daemon location (which service/host is running it?)
- ❌ Warning if daemon is down

---

## What's Missing

### 1. Daemon Health Monitoring Endpoint

**Needed:** `GET /api/admin/daemon/status`

**Should return:**
```typescript
{
  daemonRunning: boolean;
  daemon: {
    id: string;
    hostname: string;
    pid: number;
    startedAt: string;
    lastHeartbeatAt: string;
    uptime: number;
    schedulesLoaded: number;
    pollInterval: number;
    lockTimeout: number;
  } | null;
  recentActivity: {
    lastCheck: string;
    schedulesDueFound: number;
    lastExecution: string;
  };
  health: 'healthy' | 'warning' | 'critical';
  healthMessage: string;
}
```

**Backend implementation needed:**
```typescript
{
  id: 'admin.GET./admin/daemon/status',
  method: 'GET',
  path: '/admin/daemon/status',
  auth: Auth.admin(),
  handler: async (req, res) => {
    const { getWorkerInstances } = await import('../../../workers/workerManager.js');
    
    // Query for schedule_daemon (not job_worker!)
    const instances = await getWorkerInstances('schedule_daemon');
    const now = Date.now();
    
    // Find active daemon (recent heartbeat)
    const activeDaemon = instances.find(
      (w: any) => 
        w.status === 'RUNNING' && 
        (now - new Date(w.lastHeartbeatAt).getTime()) < 120000 // 2 minutes
    );
    
    // Determine health
    let health: 'healthy' | 'warning' | 'critical' = 'critical';
    let message = 'Daemon not running';
    
    if (activeDaemon) {
      const secondsSinceHeartbeat = (now - new Date(activeDaemon.lastHeartbeatAt).getTime()) / 1000;
      if (secondsSinceHeartbeat < 60) {
        health = 'healthy';
        message = 'Daemon is running normally';
      } else if (secondsSinceHeartbeat < 120) {
        health = 'warning';
        message = `Heartbeat delayed (${Math.floor(secondsSinceHeartbeat)}s ago)`;
      }
    }
    
    return json(res, {
      daemonRunning: !!activeDaemon,
      daemon: activeDaemon ? {
        id: activeDaemon.id,
        hostname: activeDaemon.hostname,
        pid: activeDaemon.pid,
        startedAt: activeDaemon.startedAt.toISOString(),
        lastHeartbeatAt: activeDaemon.lastHeartbeatAt.toISOString(),
        uptime: now - new Date(activeDaemon.startedAt).getTime(),
        // Could add more metadata here
      } : null,
      health,
      healthMessage: message,
      recentInstances: instances.slice(0, 5).map((w: any) => ({
        id: w.id,
        status: w.status,
        hostname: w.hostname,
        startedAt: w.startedAt.toISOString(),
        stoppedAt: w.stoppedAt?.toISOString(),
      }))
    });
  }
}
```

---

### 2. Frontend API Method

**File:** `frontend/src/admin/api/admin.ts`

**Add:**
```typescript
// Daemon Monitoring
async getDaemonStatus(): Promise<import('../types').DaemonStatus> {
  return http('/api/admin/daemon/status', 'GET');
}
```

**Types needed:** `frontend/src/admin/types.ts`
```typescript
export interface DaemonStatus {
  daemonRunning: boolean;
  daemon: {
    id: string;
    hostname: string;
    pid: number;
    startedAt: string;
    lastHeartbeatAt: string;
    uptime: number;
  } | null;
  health: 'healthy' | 'warning' | 'critical';
  healthMessage: string;
  recentInstances: Array<{
    id: string;
    status: string;
    hostname: string;
    startedAt: string;
    stoppedAt?: string;
  }>;
}
```

---

### 3. Frontend UI Component

**Option A: Add to SchedulesPage**

At the top of `SchedulesPage.tsx`, add a status banner:

```tsx
import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';

export function SchedulesPage() {
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  
  useEffect(() => {
    loadDaemonStatus();
    const interval = setInterval(loadDaemonStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);
  
  const loadDaemonStatus = async () => {
    try {
      const status = await adminApi.getDaemonStatus();
      setDaemonStatus(status);
    } catch (err) {
      console.error('Failed to load daemon status:', err);
    }
  };
  
  return (
    <div className="schedules-page">
      <h1>Job Schedules</h1>
      
      {/* Daemon Status Banner */}
      {daemonStatus && (
        <div className={`daemon-status daemon-status-${daemonStatus.health}`}>
          <div className="daemon-status-icon">
            {daemonStatus.health === 'healthy' && '✓'}
            {daemonStatus.health === 'warning' && '⚠️'}
            {daemonStatus.health === 'critical' && '❌'}
          </div>
          <div className="daemon-status-content">
            <strong>Schedule Daemon:</strong> {daemonStatus.healthMessage}
            {daemonStatus.daemon && (
              <div className="daemon-details">
                <span>Host: {daemonStatus.daemon.hostname}</span>
                <span>Uptime: {formatUptime(daemonStatus.daemon.uptime)}</span>
                <span>Heartbeat: {formatRelativeTime(daemonStatus.daemon.lastHeartbeatAt)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Rest of schedules page... */}
    </div>
  );
}
```

**CSS:**
```css
.daemon-status {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 2px solid;
}

.daemon-status-healthy {
  background: #d4edda;
  border-color: #28a745;
  color: #155724;
}

.daemon-status-warning {
  background: #fff3cd;
  border-color: #ffc107;
  color: #856404;
}

.daemon-status-critical {
  background: #f8d7da;
  border-color: #dc3545;
  color: #721c24;
}

.daemon-status-icon {
  font-size: 1.5rem;
}

.daemon-details {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.5rem;
  font-size: 0.9rem;
  opacity: 0.8;
}
```

---

**Option B: Separate DaemonMonitor Component**

Create `frontend/src/admin/components/DaemonMonitor.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import type { DaemonStatus } from '../types';
import './DaemonMonitor.css';

interface DaemonMonitorProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function DaemonMonitor({ 
  autoRefresh = true, 
  refreshInterval = 30000 
}: DaemonMonitorProps) {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const loadStatus = async () => {
    try {
      setError(null);
      const daemonStatus = await adminApi.getDaemonStatus();
      setStatus(daemonStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadStatus();
    
    if (autoRefresh) {
      const interval = setInterval(loadStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);
  
  if (loading) return <div className="daemon-monitor loading">Loading daemon status...</div>;
  if (error) return <div className="daemon-monitor error">Error: {error}</div>;
  if (!status) return null;
  
  const { daemon, health, healthMessage } = status;
  
  return (
    <div className={`daemon-monitor daemon-monitor-${health}`}>
      <div className="daemon-monitor-header">
        <div className="daemon-monitor-icon">
          {health === 'healthy' && '✓'}
          {health === 'warning' && '⚠️'}
          {health === 'critical' && '❌'}
        </div>
        <div className="daemon-monitor-title">
          <strong>Schedule Daemon</strong>
          <span className="daemon-monitor-status">{healthMessage}</span>
        </div>
        <button onClick={loadStatus} className="daemon-monitor-refresh">
          ↻ Refresh
        </button>
      </div>
      
      {daemon && (
        <div className="daemon-monitor-details">
          <div className="daemon-detail">
            <label>Host:</label>
            <span>{daemon.hostname}</span>
          </div>
          <div className="daemon-detail">
            <label>PID:</label>
            <span>{daemon.pid}</span>
          </div>
          <div className="daemon-detail">
            <label>Uptime:</label>
            <span>{formatUptime(daemon.uptime)}</span>
          </div>
          <div className="daemon-detail">
            <label>Last Heartbeat:</label>
            <span>{formatRelativeTime(daemon.lastHeartbeatAt)}</span>
          </div>
        </div>
      )}
      
      {!daemon && (
        <div className="daemon-monitor-warning">
          ⚠️ Schedule daemon is not running. Scheduled jobs will not execute.
          <br />
          <small>Check Railway deployment or start daemon locally.</small>
        </div>
      )}
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return `${diffSec}s ago`;
}
```

**Then use in SchedulesPage:**
```tsx
import { DaemonMonitor } from '../components/DaemonMonitor';

export function SchedulesPage() {
  return (
    <div className="schedules-page">
      <h1>Job Schedules</h1>
      
      <DaemonMonitor />
      
      {/* Rest of page... */}
    </div>
  );
}
```

---

## Current State Summary

### ✅ What Works

1. **Schedule listing** - Shows all code-defined schedules
2. **Enable/disable toggles** - Control which schedules run
3. **Manual triggers** - Run schedules immediately
4. **Execution history** - View past runs per schedule
5. **Schedule metadata** - Show cron, next run, last run, counts

### ❌ What's Missing

1. **Daemon health monitoring** - No way to see if daemon is running
2. **Daemon heartbeat display** - Can't tell when daemon last checked
3. **Daemon location info** - Don't know which host/service is running it
4. **Health alerts** - No warning when daemon is down
5. **Daemon uptime** - Can't see how long daemon has been running

---

## Recommendation

### Priority 1: Add Daemon Health Indicator (30 minutes)

**What:** Simple status banner at top of SchedulesPage

**Why:** 
- Users need to know if schedules will actually execute
- Critical for production monitoring
- Prevents confusion ("Why aren't my schedules running?")

**Effort:** Low
- Add 1 backend endpoint (`GET /api/admin/daemon/status`)
- Add 1 frontend API method
- Add 1 TypeScript interface
- Add status banner component to SchedulesPage

---

### Priority 2: Real-Time Health Updates (15 minutes)

**What:** Auto-refresh daemon status every 30 seconds

**Why:**
- Detect daemon crashes quickly
- Show real-time heartbeat age
- Better production confidence

**Effort:** Minimal (add to useEffect)

---

### Priority 3: Enhanced Monitoring (1 hour)

**What:** Dedicated DaemonMonitor component with:
- Recent daemon restarts history
- Poll interval display
- Lock timeout display
- Link to daemon logs (Railway)

**Why:**
- Better operational visibility
- Easier troubleshooting
- More professional admin interface

**Effort:** Medium

---

## Database Query for Manual Check

**Until we add the endpoint, you can manually check daemon status:**

```sql
SELECT 
  id,
  workerType,
  status,
  hostname,
  pid,
  startedAt,
  lastHeartbeatAt,
  TIMESTAMPDIFF(SECOND, lastHeartbeatAt, NOW()) as seconds_since_heartbeat,
  TIMESTAMPDIFF(MINUTE, startedAt, NOW()) as uptime_minutes
FROM WorkerInstance
WHERE workerType = 'schedule_daemon'
  AND status = 'RUNNING'
ORDER BY lastHeartbeatAt DESC
LIMIT 1;
```

**Healthy if:**
- Returns 1 row
- `seconds_since_heartbeat < 120` (< 2 minutes)
- `status = 'RUNNING'`

**Unhealthy if:**
- Returns 0 rows → Daemon not running
- `seconds_since_heartbeat > 300` → Daemon stalled

---

## Action Items

### Immediate (Before Railway Deploy)

1. ✅ **Decide:** Do you want daemon monitoring in the UI?
   - If YES → Implement Priority 1 (30 minutes)
   - If NO → Manual database queries only

### Short Term (Week 1)

2. ⚠️ **Add endpoint:** `GET /api/admin/daemon/status`
3. ⚠️ **Add UI:** Status banner in SchedulesPage
4. ⚠️ **Test:** Verify health detection works

### Long Term (Month 1)

5. 📊 **Enhanced monitoring:** DaemonMonitor component
6. 📊 **Alerts:** Email/Slack when daemon down >5 minutes
7. 📊 **Metrics:** Dashboard with daemon uptime, schedule success rates

---

## Summary

**Question:** Do we have daemon monitoring in admin frontend?

**Answer:** **NO** (but we have schedule management)

**Current state:**
- ✅ Can view/manage schedules
- ✅ Can enable/disable schedules
- ✅ Can trigger schedules manually
- ✅ Can view execution history
- ❌ **Cannot see if daemon is running**
- ❌ **No health alerts**
- ❌ **No heartbeat display**

**Recommendation:** Add `GET /api/admin/daemon/status` endpoint and simple status banner (30 minutes work).

**Workaround (now):** Query `WorkerInstance` table directly:
```sql
SELECT * FROM WorkerInstance WHERE workerType='schedule_daemon' AND status='RUNNING';
```

---

## Related Files

- **Backend endpoint:** `backend/src/registry/domains/admin/index.ts` (line 634)
- **Frontend API:** `frontend/src/admin/api/admin.ts` (line 107)
- **Frontend types:** `frontend/src/admin/types.ts` (line 162)
- **Schedules page:** `frontend/src/admin/pages/SchedulesPage.tsx`
- **Worker manager:** `backend/src/workers/workerManager.ts` (line 250, 261)
- **Daemon script:** `backend/scripts/scheduleDaemon.ts` (registers as `schedule_daemon`)

---

**Next step:** Implement daemon health monitoring endpoint + UI banner (or proceed without it and use database queries).
