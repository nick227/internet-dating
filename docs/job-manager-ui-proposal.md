# Job Manager UI Proposal

## Overview

A unified, real-time job management interface for the admin panel that provides visibility and control over all background jobs in the system. The UI should be simple, consistent, and provide real-time feedback for all job operations.

## TL;DR - v1 Focus

**Ship in v1:**
- Stats overview (manual refresh)
- Active jobs monitor (WebSocket-driven, no polling)
- Job history (paginated, filterable)
- Job details modal
- Run job modal (raw JSON parameters)

**Critical Rules:**
1. **Single Source of Truth** - Active=WS, History=API, Stats=API. No mixing.
2. **Keep It Simple** - No animations, auto-scroll, sounds, or schema forms in v1
3. **Clear Cancellation UX** - Explicit CANCEL_REQUESTED state, disable spam clicks
4. **Backend Must Add** - `defaultParams` field to job definitions API
5. **Watch Sharp Edges** - WS reconnect dupes, cancel spam, large JSON, invalid params

## Current State

### Backend Infrastructure ✅
- **Job Registry**: 15 jobs defined in `backend/scripts/jobs/registry.ts`
- **Admin API Endpoints**: Full CRUD operations at `/api/admin/jobs/*`
  - `GET /admin/jobs/definitions` - List available jobs
  - `GET /admin/jobs/history` - Paginated job run history with filters
  - `GET /admin/jobs/active` - Currently running/queued jobs
  - `GET /admin/jobs/stats` - Summary statistics
  - `GET /admin/jobs/:jobRunId` - Single job details
  - `POST /admin/jobs/enqueue` - Start a new job
  - `POST /admin/jobs/:jobRunId/cancel` - Cancel a job
  - `POST /admin/jobs/cleanup-stalled` - Clean up orphaned jobs
- **WebSocket Events**: Real-time job updates
  - `server.admin.job_started`
  - `server.admin.job_progress`
  - `server.admin.job_completed`
- **Database Schema**: `JobRun` table with comprehensive tracking
  - Status: QUEUED → RUNNING → SUCCESS/FAILED/CANCELLED
  - Timestamps: queuedAt, startedAt, finishedAt, lastHeartbeatAt
  - Metrics: durationMs, queueDelayMs
  - Metadata: trigger, scope, algorithmVersion, error, metadata

### Frontend Infrastructure ✅
- Basic hooks: `useJobStats`, `useJobWebSocket`, `useActiveJobs`, `useJobHistory`
- Simple dashboard with stats card
- Admin API client wrapper

### Current Jobs in Registry
1. **match-scores** - Compute match scores between users
2. **compatibility** - Calculate compatibility metrics
3. **content-features** - Extract content features
4. **trending** - Update trending calculations
5. **affinity** - Calculate user affinity scores
6. **feed-presort** - Pre-sort feed content
7. **feed-presort-cleanup** - Clean up old presort data
8. **stats-reconcile** - Reconcile statistics
9. **media-orphan-cleanup** - Remove orphaned media files
10. **media-metadata** - Extract media metadata
11. **media-metadata-batch** - Batch media metadata processing
12. **build-user-traits** - Build user trait vectors
13. **profile-search-index** - Index profiles for search
14. **user-interest-sets** - Calculate user interest sets
15. **quiz-answer-stats** - Calculate quiz answer statistics
16. **searchable-user** - Update searchable user data

## v1 Scope: Critical Adjustments

### What's IN v1 (Ship This)
- ✅ **Stats Overview** - Basic counts, refresh button
- ✅ **Active Jobs List** - WebSocket-driven, no polling
- ✅ **Job History** - API-driven, paginated
- ✅ **Job Details Modal** - View any job run
- ✅ **Run Job Modal** - Simple JSON textarea

### What's OUT of v1 (Defer)
- ❌ Auto-scroll to new jobs
- ❌ Pause/resume auto-refresh toggle
- ❌ Notification sounds
- ❌ Animated entrance/exit choreography
- ❌ Virtual scrolling (unlikely to hit 20+ active jobs)
- ❌ Schema-driven parameter forms
- ❌ Parameter validation UI

## Single Source of Truth Rule

**Strict data ownership:**
- **Active jobs** = WebSocket ONLY (no polling, no API fetch)
- **History** = API ONLY (paginated, server-authoritative)
- **Stats** = API ONLY (manual refresh only in v1)

**No cross-writing:**
- WebSocket events → Invalidate/trigger API refetch
- WebSocket does NOT mutate history state directly
- Prevents phantom jobs and race conditions

## Proposed UI Structure

### 1. Job Manager Page (`/admin/jobs`)

Main job management interface with three primary sections:

#### A. Stats Overview (Top)
```
┌─────────────────────────────────────────────────────────────┐
│  Job Statistics                                   [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│  ◉ Active: 2    ⏸ Queued: 5    ✓ Last 24h: 147            │
│                                                             │
│  [Clean Up Stalled Jobs]                  Updated: 2s ago  │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Manual refresh button only (no auto-refresh in v1)
- Quick action: Clean up stalled jobs
- Visual indicators for each stat type
- Last update timestamp

#### B. Active Jobs Monitor (Middle)
```
┌─────────────────────────────────────────────────────────────┐
│  Active & Queued Jobs                   (updates via WebSocket) │
├─────────────────────────────────────────────────────────────┤
│  ◉ match-scores (#12847)                     [Cancel] [Details] │
│     Started: 3m ago  •  Progress: 67%  •  "Processing batch 3/5" │
│     ════════════════════════════════════════════════         │
│                                                              │
│  ◉ feed-presort (#12848)                     [Cancel] [Details] │
│     Started: 1m ago  •  Progress: 23%  •  "Presorting users"    │
│     ════════════════                                         │
│                                                              │
│  ⏸ profile-search-index (#12849)            [Cancel] [Details] │
│     Queued: 5m ago  •  Waiting to start...                   │
│                                                              │
│  🔄 media-metadata (#12850)                  [⏳ Stopping...]  │
│     Cancel requested...                                       │
│                                                              │
│  (No active jobs)                                            │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Real-time updates via WebSocket ONLY (no polling)
- Progress bars with percentage when available
- Status messages from job progress events
- Quick actions: Cancel, View Details
- Visual distinction: RUNNING (◉), QUEUED (⏸), CANCEL_REQUESTED (🔄)
- Time indicators (relative time: "3m ago")
- **Cancellation UX:** Shows spinner + "Stopping..." state, disables repeat clicks

#### C. Job History & Controls (Bottom)
```
┌─────────────────────────────────────────────────────────────┐
│  Job History                                                │
├─────────────────────────────────────────────────────────────┤
│  [Filter by Job ▾] [Filter by Status ▾]        [Run New Job] │
│                                                              │
│  ✓ match-scores (#12846)                          [Details] │
│     Manual  •  2m  •  Finished: 5m ago                       │
│                                                              │
│  ✗ media-metadata (#12845)                        [Details] │
│     Cron  •  Failed after 34s  •  Error: Database timeout    │
│                                                              │
│  ✓ feed-presort (#12844)                          [Details] │
│     Event  •  127ms  •  Finished: 12m ago                    │
│                                                              │
│  Showing 1-50 of 1,247                  [← Prev] [Next →]    │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Filterable by job name and status
- Paginated (50 per page)
- Status icons: ✓ SUCCESS, ✗ FAILED, ⊗ CANCELLED
- Duration display
- Trigger type (Manual/Cron/Event)
- Inline error messages for failed jobs
- "Run New Job" button to launch job picker

### 2. Job Details Modal

Detailed view when clicking "Details" on any job:

```
┌─────────────────────────────────────────────────────────────┐
│  Job Run Details: match-scores (#12846)            [✕ Close] │
├─────────────────────────────────────────────────────────────┤
│  Status:       ✓ SUCCESS                                     │
│  Trigger:      Manual                                        │
│  Triggered By: admin@example.com                            │
│  Algorithm:    v1.2.3                                        │
│                                                              │
│  Timeline:                                                   │
│    Queued:   2024-01-08 10:23:45                            │
│    Started:  2024-01-08 10:23:47  (delay: 2.1s)            │
│    Finished: 2024-01-08 10:25:52  (duration: 2m 5s)        │
│                                                              │
│  Parameters:                                                 │
│    userId: 8                                                 │
│    batchSize: 100                                            │
│    candidateBatchSize: 500                                   │
│                                                              │
│  Metadata:                                                   │
│    usersProcessed: 1250                                      │
│    scoresCalculated: 62500                                   │
│    averageScoreTime: 12ms                                    │
│                                                              │
│  [Copy Run ID]  [Re-run Job]  [Cancel] (if running)        │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- All job run data in one view
- Formatted timestamps with relative times
- JSON viewer for parameters/metadata
- Actions: Copy ID, Re-run (with same params), Cancel (if active)
- Shows error stack if failed

### 3. Run New Job Modal

Modal for selecting and configuring a job to run:

```
┌─────────────────────────────────────────────────────────────┐
│  Run New Job                                       [✕ Close] │
├─────────────────────────────────────────────────────────────┤
│  Select Job: [match-scores                              ▾]  │
│                                                              │
│  Description:                                                │
│  Compute match scores between users                         │
│                                                              │
│  Example Usage:                                              │
│  tsx scripts/runJobs.ts match-scores --userId=8 \           │
│      --batchSize=100 --candidateBatchSize=500               │
│                                                              │
│  Parameters (JSON):                      [Load Defaults]    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ {                                                     │  │
│  │   "userId": 8,                                        │  │
│  │   "batchSize": 100,                                   │  │
│  │   "candidateBatchSize": 500                           │  │
│  │ }                                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ⚠ Server-side validation on submit                         │
│                                                              │
│                               [Cancel]  [Enqueue Job]        │
└─────────────────────────────────────────────────────────────┘
```

**Features (v1 - Keep Simple):**
- Dropdown of all available jobs from registry
- Shows job description and examples
- **Raw JSON textarea** (no schema validation on client)
- "Load Defaults" button (if job has defaultParams)
- Client-side JSON syntax check only
- **Server validates parameters** - errors echoed back in toast/inline
- Shows success toast with job run ID
- **Duplicate job warning** (passive, non-blocking):
  - If same job name already RUNNING, show: ⚠️ "Another instance of this job is currently running."
  - Still allows enqueue (no hard enforcement)
  - Just visibility for admin

**Explicitly NOT in v1:**
- ❌ Schema-driven forms
- ❌ Typed editors
- ❌ Field-by-field validation
- ❌ Parameter presets/templates
- ❌ Hard blocking of duplicate jobs

## Component Architecture

### File Structure
```
frontend/src/admin/
├── pages/
│   ├── JobManagerPage.tsx          # Main page component
│   └── AdminDashboard.tsx          # Keep existing dashboard
├── components/
│   ├── jobs/
│   │   ├── JobStatsOverview.tsx    # Stats cards
│   │   ├── ActiveJobsMonitor.tsx   # Real-time active jobs
│   │   ├── JobHistoryList.tsx      # Paginated history
│   │   ├── JobDetailsModal.tsx     # Job details modal
│   │   ├── RunJobModal.tsx         # Run new job modal
│   │   ├── JobRunCard.tsx          # Single job run display
│   │   └── JobProgressBar.tsx      # Progress indicator
│   ├── AdminLayout.tsx             # Keep existing
│   └── JobStatsCard.tsx            # Keep/refactor for dashboard
├── hooks/
│   ├── useJobStats.ts              # ✅ Keep existing
│   ├── useJobWebSocket.ts          # ✅ Keep existing
│   ├── useActiveJobs.ts            # ✅ Keep existing
│   ├── useJobHistory.ts            # ✅ Keep existing
│   └── useJobDefinitions.ts        # NEW: Fetch job registry
├── api/
│   └── admin.ts                    # ✅ Keep existing
└── types.ts                        # ✅ Keep existing (with additions)
```

### Frontend Type Updates

**File:** `frontend/src/admin/types.ts`

Add UI-only transient state for cancellation:

```typescript
export type JobRunStatus = 
  | 'QUEUED' 
  | 'RUNNING' 
  | 'SUCCESS' 
  | 'FAILED' 
  | 'CANCELLED';

// UI-only transient state (not in DB)
export type JobUIStatus = JobRunStatus | 'CANCEL_REQUESTED';

export interface JobDefinition {
  id: string;
  name: string;
  description: string;
  examples: string[];
  defaultParams?: Record<string, unknown>; // ADD THIS
}
```

### Component Props/Contracts

```typescript
// JobStatsOverview.tsx
interface JobStatsOverviewProps {
  stats: JobStats | null;
  loading: boolean;
  onRefresh: () => void;
  onCleanupStalled: () => void;
}

// ActiveJobsMonitor.tsx
interface ActiveJobsMonitorProps {
  jobs: JobRun[];
  loading: boolean;
  onCancel: (jobRunId: string) => void;
  onViewDetails: (jobRunId: string) => void;
}

// JobHistoryList.tsx
interface JobHistoryListProps {
  runs: JobRun[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  filters: {
    jobName?: string;
    status?: JobRunStatus;
  };
  onPageChange: (page: number) => void;
  onFilterChange: (filters: Partial<typeof filters>) => void;
  onViewDetails: (jobRunId: string) => void;
}

// JobDetailsModal.tsx
interface JobDetailsModalProps {
  jobRunId: string;
  onClose: () => void;
  onRerun?: (jobName: string, params: Record<string, unknown>) => void;
  onCancel?: (jobRunId: string) => void;
}

// RunJobModal.tsx
interface RunJobModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (jobName: string, params: Record<string, unknown>) => void;
  activeJobs: JobRun[]; // For duplicate detection
}

// Inside RunJobModal component
function RunJobModal({ open, onClose, onSubmit, activeJobs }: RunJobModalProps) {
  const [selectedJob, setSelectedJob] = useState<string>('');
  
  // Check for duplicate
  const isDuplicateRunning = activeJobs.some(
    job => job.jobName === selectedJob && job.status === 'RUNNING'
  );
  
  return (
    // ...
    {isDuplicateRunning && (
      <div className="warning-banner">
        ⚠️ Another instance of this job is currently running.
      </div>
    )}
    // ... still allow submit button
  );
}
```

## Real-Time Features

### WebSocket Integration (Single Source of Truth)

```typescript
// In JobManagerPage.tsx
function JobManagerPage() {
  const [activeJobs, setActiveJobs] = useState<JobRun[]>([]);
  const [cancelRequested, setCancelRequested] = useState<Set<string>>(new Set());
  const { stats, refresh: refreshStats } = useJobStats(false); // No auto-refresh
  const { refresh: refreshHistory } = useJobHistory();
  
  useJobWebSocket({
    onJobStarted: (event) => {
      // Add to active jobs list (WS is source of truth)
      setActiveJobs(prev => [...prev, jobFromEvent(event)]);
    },
    onJobProgress: (event) => {
      // Update specific job in active list
      setActiveJobs(prev => prev.map(job => 
        job.id === event.data.jobRunId 
          ? { ...job, progress: event.data.progressPercent }
          : job
      ));
    },
    onJobCompleted: (event) => {
      // Remove from active jobs
      setActiveJobs(prev => prev.filter(j => j.id !== event.data.jobRunId));
      setCancelRequested(prev => {
        const next = new Set(prev);
        next.delete(event.data.jobRunId);
        return next;
      });
      
      // INVALIDATE other sources (don't mutate them directly)
      refreshStats();      // Stats API is source of truth for stats
      refreshHistory();    // History API is source of truth for history
    }
  });
  
  const handleCancel = async (jobRunId: string) => {
    // Optimistic UI: Show CANCEL_REQUESTED state
    setCancelRequested(prev => new Set(prev).add(jobRunId));
    
    try {
      await adminApi.cancelJob(jobRunId);
    } catch (err) {
      // Revert on error
      setCancelRequested(prev => {
        const next = new Set(prev);
        next.delete(jobRunId);
        return next;
      });
      toast.error('Failed to cancel job');
    }
  };
  
  // ...
}
```

### Data Source Strategy (v1)
- **Active Jobs**: WebSocket only (no API polling)
- **Stats**: API only (manual refresh button)
- **History**: API only (manual refresh + invalidate on job complete)
- **No auto-refresh in v1** (prevents complexity and race conditions)

## User Flows

### 1. Monitor Running Jobs
1. Navigate to `/admin/jobs`
2. See active jobs section auto-updating via WebSocket
3. Watch progress bars fill
4. See status messages update in real-time
5. Receive notification when job completes

### 2. Run a New Job
1. Click "Run New Job" button
2. Select job from dropdown
3. See description and examples
4. Edit parameters JSON (or use defaults)
5. Click "Enqueue Job"
6. See toast: "Job enqueued: #12850"
7. Automatically scrolled to active jobs section
8. Watch job progress in real-time

### 3. Cancel a Job (Clear UX States)
1. See job running in active jobs section
2. Click "Cancel" button
3. **Immediately show CANCEL_REQUESTED state:**
   - Button changes to spinner + "Stopping..."
   - Button is disabled (prevents spam clicks)
   - Visual indicator (🔄 icon)
4. If QUEUED: Cancels immediately, disappears
5. If RUNNING: Shows "Stopping..." until job acknowledges cancellation
6. Job disappears from active section when cancellation completes
7. If cancellation fails: Reverts to normal state + error toast

### 4. Investigate Failed Job
1. See failed job in history with ✗ icon
2. Click "Details" button
3. Modal opens with full job data
4. Read error message
5. Review parameters that caused failure
6. Click "Re-run Job" to try again with adjusted params

### 5. Debug Stalled Jobs
1. Notice active job count doesn't match reality
2. Click "Clean Up Stalled Jobs"
3. See confirmation: "Cleaned 2 stalled jobs"
4. Review which jobs were cleaned
5. Stats updated automatically

## Visual Design

### Color Scheme
- **QUEUED**: Gray/neutral (#6B7280)
- **RUNNING**: Blue/active (#3B82F6)
- **SUCCESS**: Green (#10B981)
- **FAILED**: Red (#EF4444)
- **CANCELLED**: Orange (#F59E0B)

### Icons
- **QUEUED**: ⏸ (pause)
- **RUNNING**: ◉ (solid circle)
- **SUCCESS**: ✓ (checkmark)
- **FAILED**: ✗ (x)
- **CANCELLED**: ⊗ (circle x)

### Typography
- Page title: 28px bold
- Section headers: 20px semibold
- Job names: 16px medium
- Metadata: 14px regular
- Timestamps: 12px regular, gray

### Spacing
- Section padding: 24px
- Card gap: 16px
- Element spacing: 8px
- Border radius: 8px

### Animations
- Progress bars: Smooth fill (0.3s ease)
- Status changes: Color fade (0.2s)
- New job appearance: Slide down (0.3s ease-out)
- Job completion: Fade out (0.5s ease-out, 1s delay)

## Performance Considerations

### Optimization Strategies
1. **Pagination**: History limited to 50 items per page
2. **Virtual Scrolling**: If active jobs > 20, use virtual list
3. **Debounced Filters**: 300ms debounce on filter inputs
4. **Memoization**: Use `React.memo()` for JobRunCard components
5. **Lazy Loading**: Job details loaded on-demand
6. **WebSocket Throttling**: Max 1 update per 100ms per job

### Data Management
- Use React Query or similar for server state
- Cache job definitions (rarely change)
- Keep active jobs in local state (WebSocket updates)
- History uses server pagination (no local caching of all records)

## Error Handling

### Scenarios & Responses
1. **API Error**: Show error toast, retry button
2. **WebSocket Disconnect**: Show banner "Real-time updates paused", auto-reconnect
3. **Enqueue Failed**: Show error in modal, highlight invalid params
4. **Cancel Failed**: Show error toast with reason
5. **Stale Data**: Show "Data may be stale" warning if last update > 1 minute

## Accessibility

- **Keyboard Navigation**: All actions accessible via keyboard
- **Screen Readers**: Proper ARIA labels on all interactive elements
- **Status Announcements**: Live regions for job status changes
- **Focus Management**: Return focus to trigger when closing modals
- **Color Independence**: Don't rely solely on color (use icons too)

## Future Enhancements (Not in v1)

### Phase 2 (Deferred from v1)
- Auto-refresh toggle (with pause/resume)
- Notification sounds/browser notifications
- Auto-scroll to new jobs
- Smooth animations for job state changes
- Job templates (saved parameter sets)
- Advanced filters (date range, triggered by, duration range)

### Phase 3
- Schema-driven parameter forms
- Field-by-field validation
- Parameter presets per job
- Job scheduling (cron editor)
- Job dependencies (chain jobs)
- Bulk operations (cancel multiple, re-run batch)
- Export history to CSV

### Phase 4
- Job monitoring alerts (notify on failure)
- Performance charts (duration over time, success rate)
- Resource usage metrics (CPU, memory per job)
- Job logs viewer (stream logs in real-time)
- Job comparison (compare two runs side-by-side)
- Job analytics dashboard (aggregate stats, trends)

## Implementation Plan

### Phase 1: Backend Updates (Day 1)
1. Add `defaultParams` to JobDefinition type
2. Update all 15 job definitions with defaults
3. Update `/admin/jobs/definitions` API handler
4. Improve parameter validation error responses
5. Test API changes

### Phase 2: Core Components (Days 2-3)
1. Create JobManagerPage layout
2. Implement JobStatsOverview component (no auto-refresh)
3. Implement ActiveJobsMonitor component (WS-only)
4. Implement JobHistoryList component (API-only)
5. Add basic styling
6. Wire up existing hooks correctly

### Phase 3: Modals (Days 4-5)
1. Create JobDetailsModal
2. Create RunJobModal with JSON textarea
3. Add "Load Defaults" button
4. Implement cancel job action (with CANCEL_REQUESTED state)
5. Implement re-run job action
6. Implement cleanup stalled action

### Phase 4: Integration & Polish (Days 6-7)
1. Integrate WebSocket with single-source-of-truth pattern
2. Add CANCEL_REQUESTED transient state handling
3. Implement all sharp edge fixes
4. Add loading states and error handling
5. Toast notifications (minimal)
6. Test all user flows

### Phase 5: Testing & Hardening (Days 8-10)
1. Fix WS reconnect duplicate jobs bug
2. Handle large metadata JSON
3. Prevent cancel button spam
4. Test history pagination edge cases
5. Unit tests for critical components
6. E2E test for complete job lifecycle
7. Load testing with multiple concurrent jobs

## Testing Strategy

### Unit Tests
- Each component in isolation
- Props validation
- Event handler calls
- Conditional rendering

### Integration Tests
- Full page rendering
- API interactions mocked
- WebSocket events simulated
- State management flow

### E2E Tests (Playwright)
```typescript
test('can run a job and monitor progress', async ({ page }) => {
  await page.goto('/admin/jobs');
  await page.click('text=Run New Job');
  await page.selectOption('select', 'match-scores');
  await page.fill('textarea', '{"userId": 8}');
  await page.click('text=Enqueue Job');
  await expect(page.locator('.active-jobs')).toContainText('match-scores');
  // Wait for job to complete
  await expect(page.locator('.job-history')).toContainText('match-scores');
});
```

## Migration Path

### From Current Dashboard
1. Keep existing `AdminDashboard` as overview page
2. Add "Manage Jobs" button linking to new `/admin/jobs` page
3. Job stats card on dashboard remains functional
4. Gradually migrate users to full job manager
5. Eventually replace dashboard stats with link

### Backwards Compatibility
- All existing API endpoints remain unchanged
- Existing hooks continue to work
- Can deploy UI independently of backend
- No database migrations required

## Success Metrics

### Quantitative
- Page load time < 2s
- Time to interactive < 3s
- WebSocket latency < 200ms
- UI update on job event < 100ms
- 95th percentile API response < 500ms

### Qualitative
- Admins can identify failing jobs in < 30s
- Can start a new job in < 1 minute
- Job status is always clear and unambiguous
- No confusion about real-time vs stale data
- Zero complaints about UI performance

## Backend Changes Required

### 1. Add `defaultParams` to Job Definitions API

**File:** `backend/scripts/jobs/types.ts`

```typescript
export interface JobDefinition {
  name: string;
  description: string;
  examples: string[];
  defaultParams?: Record<string, unknown>; // ADD THIS
  run: () => Promise<void>;
}

// Validate job definitions at registry load time (fail fast)
export function validateJobDefinition(name: string, job: JobDefinition): void {
  if (!job.description || job.description.trim() === '') {
    throw new Error(`Job "${name}": description is required`);
  }
  
  if (!job.examples || job.examples.length === 0) {
    throw new Error(`Job "${name}": at least one example is required`);
  }
  
  if (job.defaultParams) {
    try {
      JSON.stringify(job.defaultParams);
    } catch (err) {
      throw new Error(`Job "${name}": defaultParams must be JSON-serializable`);
    }
  }
}
```

**File:** `backend/scripts/jobs/registry.ts`

```typescript
import { validateJobDefinition } from './types.js';

const jobs: JobRegistry = {
  'match-scores': matchScoresJob,
  'compatibility': compatibilityJob,
  // ... etc
};

// Validate all jobs at startup (fail fast)
for (const [name, job] of Object.entries(jobs)) {
  validateJobDefinition(name, job);
}

export function getAllJobs(): JobRegistry {
  return jobs;
}
```

**Update each job** (e.g., `matchScores.ts`):

```typescript
export const matchScoresJob: JobDefinition = {
  name: 'match-scores',
  description: 'Compute match scores between users',
  examples: [
    'tsx scripts/runJobs.ts match-scores --userId=8 --batchSize=100'
  ],
  defaultParams: {  // ADD THIS
    batchSize: 100,
    candidateBatchSize: 500,
    pauseMs: 50
  },
  run: async () => { /* ... */ }
};
```

**Benefits:**
- Server crashes at startup if job definition is invalid (fail fast)
- No runtime surprises when admin tries to run job
- Forces maintainers to keep job definitions complete

**Update API handler** (`backend/src/registry/domains/admin/index.ts`):

```typescript
handler: async (req, res) => {
  const { getAllJobs } = await import('../../../../scripts/jobs/registry');
  const jobs = getAllJobs();
  
  const definitions = Object.entries(jobs).map(([name, job]) => ({
    id: name,
    name: job.name,
    description: job.description,
    examples: job.examples,
    defaultParams: job.defaultParams // ADD THIS
  }));

  return json(res, { jobs: definitions });
}
```

### 2. Improve Parameter Validation Response

When enqueue fails due to bad parameters, return structured error:

```typescript
// In enqueue handler
try {
  // ... validate parameters ...
} catch (err) {
  return json(res, { 
    error: 'Invalid parameters',
    details: err.message,           // Human-readable: "batchSize must be > 0"
    field: 'parameters',             // Helps UI highlight the JSON textarea
    retryable: true                  // UI can decide: toast vs inline, retry vs abandon
  }, 400);
}
```

**UI Benefits:**
- `retryable: true` → Show "Fix and retry" button
- `retryable: false` → Show "Job cannot be run" (permanent failure)
- `field` → Highlight specific input (future: could be nested like "parameters.batchSize")

## Sharp Edges to Watch (Bug Prevention)

### 1. WebSocket Reconnect → Duplicate Active Jobs
**Problem:** On WS reconnect, might re-add jobs already in list

**Solution:**
```typescript
onJobStarted: (event) => {
  setActiveJobs(prev => {
    if (prev.some(j => j.id === event.data.jobRunId)) {
      return prev; // Already exists, skip
    }
    return [...prev, jobFromEvent(event)];
  });
}
```

### 2. History Refresh Mid-Scroll
**Problem:** User scrolling through history, refresh loses position

**Solution:** Don't auto-refresh history. Only refresh on explicit user action or when viewing first page.

### 3. Large Metadata JSON Freezing Modal
**Problem:** 1MB+ metadata objects freeze UI when rendering

**Solution:**
```typescript
// Truncate large JSON in modal
const displayMetadata = metadata && 
  JSON.stringify(metadata).length > 10000
    ? '(Too large to display - view in database)'
    : metadata;
```

### 4. Cancel Button Spam
**Problem:** User clicks cancel 5 times, sends 5 API requests

**Solution:** Use `cancelRequested` state set + disable button immediately (see WebSocket Integration section)

### 5. Enqueue with Invalid JSON
**Problem:** User submits malformed JSON, gets cryptic error

**Solution:**
```typescript
const handleEnqueue = async () => {
  // Client-side JSON syntax check
  try {
    const params = JSON.parse(jsonTextarea);
  } catch (err) {
    toast.error('Invalid JSON syntax');
    return; // Don't hit API
  }
  
  // Server-side validation
  try {
    const result = await adminApi.enqueueJob(selectedJob, params);
    toast.success(`Job enqueued: #${result.jobRunId}`);
    onClose();
  } catch (err) {
    // Server returned structured error
    if (err.retryable) {
      // Show inline error + highlight field
      setError(err.details);
      // Keep modal open for retry
    } else {
      // Permanent failure
      toast.error(`Cannot run job: ${err.details}`);
      onClose();
    }
  }
};
```

### 6. Stale Active Jobs List on Page Load
**Problem:** Page loads, active jobs list is empty until WS events arrive

**Solution:** On mount, fetch initial active jobs from API once:
```typescript
useEffect(() => {
  adminApi.getActiveJobs().then(({ runs }) => {
    setActiveJobs(runs);
  });
}, []);

// Then WS takes over
```

## Open Questions

1. **Authentication**: How do we track "triggeredBy" on frontend?
   - Use current user session ID
   - Display as email or username?

2. **Permissions**: Should all admins have access to all jobs?
   - Current: Admin role can access all
   - Future: Role-based job permissions?

3. **Notifications**: Should we add toast notifications for job events?
   - Start: Silent (visible in active list)
   - Complete (success): Optional toast (user pref?)
   - Complete (failed): Always toast error

4. **Concurrency**: Should we warn when enqueueing duplicate jobs?
   - Check if same job already running?
   - Or let backend handle it?

## Implementation Risk Assessment

### Low Risk ✅
**UI architecture and flows:**
- Component structure is straightforward
- Data ownership model is explicit (WS vs API)
- Modal flows are standard patterns
- All dependencies already exist (hooks, API client)
- No complex state machines

### Medium Risk ⚠️
**Edge cases requiring careful implementation:**
- **WS reconnect handling** - Risk of duplicate jobs in active list
  - *Mitigation*: Deduplication logic on job start event
- **Large metadata rendering** - 1MB+ JSON could freeze modal
  - *Mitigation*: Truncate display, add "view raw" option
- **Cancel edge cases** - Spam clicks, network failures
  - *Mitigation*: State-based button disabling, optimistic UI with rollback

### High Risk ❌
**None in v1 scope** - We've successfully deferred all high-risk features:
- ~~Complex animations~~ (deferred)
- ~~Schema validation~~ (deferred)
- ~~Auto-refresh coordination~~ (deferred)
- ~~Virtual scrolling~~ (deferred)

## Conclusion

This proposal outlines a **pragmatic, v1-focused** job management UI that leverages the existing backend infrastructure. The design prioritizes:

1. **Simplicity**: Clear, consistent UI patterns (no bells and whistles)
2. **Real-time**: Immediate feedback via WebSocket (single source of truth)
3. **Reliability**: Explicit state management, fail-fast validation
4. **Observability**: Full visibility into job lifecycle
5. **Control**: Easy to start, stop, and debug jobs

**Key Wins:**
- Ships in 10 days (5 phases)
- Low implementation risk (deferred all complex features)
- Backend changes are minimal and non-breaking
- Scales to 100+ jobs without structural changes
- Foundation for v2 enhancements

The phased implementation approach allows for iterative delivery while maintaining backwards compatibility. All high-risk features have been explicitly deferred to future phases.
