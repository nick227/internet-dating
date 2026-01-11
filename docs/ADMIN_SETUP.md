# Admin Interface Setup Guide

## Overview

The admin interface system has been successfully implemented for job monitoring and history management. This document provides setup instructions and usage guidelines.

## What Was Implemented

### Backend Components

1. **Database Schema Changes** (`backend/prisma/schema/`)
   - Added `UserRole` enum (USER, ADMIN, SUPER_ADMIN)
   - Added `role` field to User model
   - Enhanced JobRun model with:
     - Status tracking (QUEUED, RUNNING, SUCCESS, FAILED, CANCELLED)
     - Queue metrics (queuedAt, queueDelayMs)
     - Admin tracking (triggeredBy, cancelRequestedBy)
     - Heartbeat monitoring (lastHeartbeatAt)

2. **Authentication & Authorization** (`backend/src/lib/auth/`)
   - Extended auth rules with `Auth.admin()` and `Auth.superAdmin()`
   - Updated middleware to check user roles
   - Enhanced `/auth/me` endpoint to return user role

3. **Admin API Routes** (`backend/src/registry/domains/admin/`)
   - `GET /admin/jobs/history` - Job run history with filtering
   - `GET /admin/jobs/:jobRunId` - Job run details
   - `GET /admin/jobs/active` - Currently queued/running jobs
   - `GET /admin/jobs/stats` - Job statistics (cached)
   - `POST /admin/jobs/enqueue` - Trigger a job manually
   - `POST /admin/jobs/:jobRunId/cancel` - Cancel a job
   - `GET /admin/jobs/definitions` - Available job definitions

4. **Job Execution System** (`backend/src/lib/jobs/`, `backend/src/workers/`)
   - Enhanced runJob with heartbeat mechanism
   - Added cancellation checking
   - Background worker loop for queue processing
   - Stalled job detection and recovery
   - Separate duration tracking (execution vs. queue time)

5. **WebSocket Support** (`backend/src/ws/domains/admin.ts`, `shared/src/ws/contracts.ts`)
   - Real-time job event notifications
   - Admin socket registration and management
   - Events: job_started, job_progress, job_completed

### Frontend Components

1. **Admin Structure** (`frontend/src/admin/`)
   - Type definitions for jobs and admin entities
   - API client for admin endpoints
   - Custom hooks (useJobHistory, useActiveJobs, useJobStats, useJobWebSocket)
   - Reusable components (JobStatusBadge, JobStatsCard, JobRunTable, JobTriggerModal)

2. **Admin Pages** (`frontend/src/admin/pages/`)
   - **AdminDashboard** - Overview with stats and quick links
   - **JobHistoryPage** - Paginated job history with filtering
   - **JobDetailsPage** - Detailed view of individual job runs
   - **JobMonitorPage** - Real-time active jobs monitoring

3. **Routing** (`frontend/src/core/routing/`)
   - AdminRoute guard component
   - Integrated into App.tsx with lazy loading

4. **Styling** (`frontend/src/styles/components/admin/`)
   - Complete admin interface styling

## Setup Instructions

### 1. Run Database Migration

```bash
cd backend
pnpm prisma:migrate
```

This will:
- Add the `role` column to the User table
- Update the JobRun table with new fields
- Create necessary indexes

### 2. Create an Admin User

```bash
cd backend
pnpm admin:create admin@example.com YourSecurePassword ADMIN
```

For a super admin:
```bash
pnpm admin:create superadmin@example.com YourSecurePassword SUPER_ADMIN
```

### 3. Start the Backend Worker

The job worker can run in two ways:

**Option A: Integrated with API server (default)**
The worker starts automatically when you run the backend server.

**Option B: Separate worker process (production)**
```bash
cd backend
pnpm worker:jobs
```

### 4. Start the Application

```bash
# Terminal 1: Backend
cd backend
pnpm dev

# Terminal 2: Frontend
cd frontend
pnpm dev
```

## Usage

### Accessing Admin Interface

1. Log in with your admin user credentials
2. Navigate to `/admin` or `/admin/dashboard`
3. You should see the admin dashboard with job statistics

### Admin Routes

- `/admin/dashboard` - Main dashboard
- `/admin/jobs/history` - View job history
- `/admin/jobs/monitor` - Monitor active jobs
- `/admin/jobs/:jobRunId` - View job details

### Triggering Jobs

1. Go to Job History page
2. Click "Trigger Job" button
3. Select job from dropdown
4. Optionally provide JSON parameters
5. Click "Trigger Job" to enqueue

### Cancelling Jobs

1. Navigate to a job details page
2. If job is QUEUED or RUNNING, click "Cancel Job"
3. Confirm the cancellation

For QUEUED jobs: Immediately cancelled
For RUNNING jobs: Cancellation requested (job must check cooperatively)

### Real-time Monitoring

The Job Monitor page automatically updates via WebSocket when:
- Jobs start execution
- Jobs complete (success/failure/cancellation)

## Job Lifecycle

```
1. QUEUED    → Job created, waiting for worker
2. RUNNING   → Worker picked up job, executing
3. SUCCESS   → Job completed successfully
   FAILED    → Job encountered an error
   CANCELLED → Job was cancelled by admin or system
```

## Metrics

### Queue Delay
Time between job creation (queuedAt) and execution start (startedAt)

### Duration
Time between execution start (startedAt) and completion (finishedAt)

### Heartbeat
Updated every 30 seconds during execution to detect stalled jobs

## Architecture Highlights

### Queue-Based Execution
- Jobs are created in QUEUED state
- Background worker polls and executes
- Prevents in-process crashes from killing jobs
- Enables multi-worker scalability (future)

### Cooperative Cancellation
Jobs should periodically check for cancellation:

```typescript
import { checkCancellation } from '../lib/jobs/runJob';

export async function myJob(jobRunId: bigint) {
  for (let i = 0; i < items.length; i++) {
    // Check every 100 iterations
    if (i % 100 === 0) {
      await checkCancellation(jobRunId);
    }
    // Process item
  }
}
```

### Stalled Job Detection
- Worker updates heartbeat every 30 seconds
- If no heartbeat for 5 minutes → marked as FAILED
- Handles worker crashes gracefully

### Scalability
- Job stats are cached (30s TTL)
- Limited query scope for performance
- Indexes on critical fields

## Security

### Role-Based Access
- Only ADMIN and SUPER_ADMIN can access admin routes
- JWT authentication required
- Role checked on every request

### Audit Trail
All jobs track:
- Who triggered them (`triggeredBy`)
- Who cancelled them (`cancelRequestedBy`)
- When actions occurred

## Troubleshooting

### Jobs Not Starting
- Check if worker is running
- Verify job is in QUEUED state
- Check backend logs for errors

### WebSocket Not Updating
- Check browser console for WebSocket connection
- Verify user has admin role
- Refresh the page

### Permission Denied
- Verify user has ADMIN or SUPER_ADMIN role
- Check `/auth/me` endpoint returns correct role
- Try logging out and back in

## Next Steps

### Recommended Enhancements (Future)
- Add job retry logic
- Implement job priorities
- Add progress tracking for long jobs
- Create job scheduling UI
- Add more granular permissions
- Export job history to CSV

### Adding New Job Types
1. Create job definition in `backend/scripts/jobs/`
2. Register in `backend/scripts/jobs/registry.ts`
3. Job appears automatically in admin UI

## Files Modified/Created

### Backend
- `backend/prisma/schema/enums.prisma` (modified)
- `backend/prisma/schema/user.prisma` (modified)
- `backend/prisma/schema/jobs.prisma` (modified)
- `backend/src/lib/auth/rules.ts` (modified)
- `backend/src/lib/auth/requireAuth.ts` (modified)
- `backend/src/lib/jobs/runJob.ts` (modified)
- `backend/src/registry/domains/admin/index.ts` (created)
- `backend/src/registry/domains/auth/index.ts` (modified)
- `backend/src/registry/registry.ts` (modified)
- `backend/src/workers/jobWorker.ts` (created)
- `backend/src/ws/domains/admin.ts` (created)
- `backend/src/ws/index.ts` (modified)
- `backend/scripts/createAdmin.ts` (created)
- `backend/package.json` (modified)
- `shared/src/ws/contracts.ts` (modified)

### Frontend
- `frontend/src/admin/` (directory created)
  - `types.ts`
  - `api/admin.ts`
  - `hooks/` (4 files)
  - `components/` (4 files)
  - `pages/` (4 files)
- `frontend/src/core/routing/AdminRoute.tsx` (created)
- `frontend/src/App.tsx` (modified)
- `frontend/src/styles/components/admin/index.css` (created)
- `frontend/src/styles/index.css` (modified)

## Summary

The admin interface is now fully functional with:
- ✅ Schema migrations
- ✅ Backend API routes
- ✅ Job queue system
- ✅ WebSocket real-time updates
- ✅ Frontend admin pages
- ✅ Role-based authentication
- ✅ Job monitoring and control
- ✅ Complete styling

Ready for use after running migrations and creating admin users.
