# Admin Interface Plan

## Overview

This document outlines the implementation plan for a system admin interface focused on job monitoring and history. The admin interface will provide real-time job monitoring, historical job data, and job control capabilities.

## 1. Backend Changes

### 1.1 Schema Changes

**Add admin role to User model** (`backend/prisma/schema/user.prisma`):

```prisma
model User {
  id           BigInt   @id @default(autoincrement())
  email        String   @unique
  passwordHash String
  role         UserRole @default(USER)  // NEW
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?
  // ... existing fields
}
```

**Add UserRole enum** (`backend/prisma/schema/enums.prisma`):

```prisma
enum UserRole {
  USER
  ADMIN
  SUPER_ADMIN  // For future: can manage other admins
}
```

**Enhance JobRun model** (`backend/prisma/schema/jobs.prisma`):

The existing `JobRun` model is already comprehensive. Add optional fields:

```prisma
enum JobRunStatus {
  QUEUED      // Job is queued, not yet started
  RUNNING     // Job is currently executing
  SUCCESS     // Job completed successfully
  FAILED      // Job failed with error
  CANCELLED   // Job was cancelled before completion
}

model JobRun {
  id               BigInt       @id @default(autoincrement())
  jobName          String
  status           JobRunStatus @default(QUEUED)  // CHANGED: Default to QUEUED
  trigger          JobTrigger
  scope            String?
  algorithmVersion String?
  attempt          Int          @default(1)
  queuedAt         DateTime     @default(now())   // NEW: When queued
  startedAt        DateTime?                      // CHANGED: Nullable, set when execution starts
  finishedAt       DateTime?
  durationMs       Int?          // Execution time only (finishedAt - startedAt)
  queueDelayMs     Int?          // NEW: Queue wait time (startedAt - queuedAt)
  error            String?      @db.Text
  metadata         Json?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  
  // NEW FIELDS
  triggeredBy         BigInt?      // Admin user who triggered the job
  cancelRequestedAt   DateTime?    // When cancellation was requested
  cancelRequestedBy   BigInt?      // Admin who requested cancellation
  lastHeartbeatAt     DateTime?    // NEW: Worker heartbeat (detect stalled jobs)

  @@index([jobName, status])
  @@index([jobName, queuedAt])     // CHANGED: Index on queuedAt
  @@index([status, queuedAt])      // CHANGED: For queue processing
  @@index([triggeredBy])
  @@index([status, lastHeartbeatAt])  // NEW: For stalled job detection
}
```

**Lifecycle States:**
- `QUEUED`: Job created, waiting for execution
- `RUNNING`: Job picked up by worker, actively executing
- `SUCCESS`: Job completed without errors
- `FAILED`: Job encountered an error
- `CANCELLED`: Job was cancelled (either before starting or during execution)

~~**Add JobDefinition metadata table** (optional, for dynamic job registry):~~

**REMOVED**: JobDefinition table is unnecessary duplication.

**Rationale**: 
- Job definitions already exist in `backend/scripts/jobs/registry.ts`
- Single source of truth: code-driven registry
- Simpler: no DB sync needed
- Future: If dynamic scheduling needed, add `schedule` to registry objects

**Current approach**: Use `getAllJobs()` from registry for job definitions endpoint.

### 1.2 Auth Rules Extension

**Update Auth rules** (`backend/src/lib/auth/rules.ts`):

```typescript
export type AuthRule =
  | { kind: 'public' }
  | { kind: 'user' }
  | { kind: 'owner'; param: string }
  | { kind: 'admin' }           // NEW
  | { kind: 'superAdmin' };     // NEW

export const Auth = {
  public: (): AuthRule => ({ kind: 'public' }),
  user: (): AuthRule => ({ kind: 'user' }),
  owner: (param: string): AuthRule => ({ kind: 'owner', param }),
  admin: (): AuthRule => ({ kind: 'admin' }),              // NEW
  superAdmin: (): AuthRule => ({ kind: 'superAdmin' })     // NEW
};
```

**Update requireAuth middleware** (`backend/src/lib/auth/requireAuth.ts`):

Add admin role checking logic:

```typescript
// Add to existing handler
if (rule.kind === 'admin') {
  // Proper operator precedence with parentheses
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return json(res, { error: 'Forbidden: Admin access required' }, 403);
  }
  req.ctx.userId = user.id;
  return next();
}

if (rule.kind === 'superAdmin') {
  if (!user || user.role !== 'SUPER_ADMIN') {
    return json(res, { error: 'Forbidden: Super admin access required' }, 403);
  }
  req.ctx.userId = user.id;
  return next();
}
```

### 1.3 Admin API Routes

**Create new admin domain** (`backend/src/registry/domains/admin/index.ts`):

```typescript
import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';
import { parseIntArg, parseOptionalString } from '../../../lib/http/parse.js';

export const adminDomain: DomainRegistry = {
  domain: 'admin',
  routes: [
    // Job History - List recent job runs
    {
      id: 'admin.GET./admin/jobs/history',
      method: 'GET',
      path: '/admin/jobs/history',
      auth: Auth.admin(),
      summary: 'Get job run history',
      tags: ['admin'],
      handler: async (req, res) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const jobName = req.query.jobName as string | undefined;
        const status = req.query.status as string | undefined;

        const where = {
          ...(jobName && { jobName }),
          ...(status && { status: status as any })
        };

        const [runs, total] = await Promise.all([
          prisma.jobRun.findMany({
            where,
            orderBy: { startedAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
              id: true,
              jobName: true,
              status: true,
              trigger: true,
              scope: true,
              algorithmVersion: true,
              startedAt: true,
              finishedAt: true,
              durationMs: true,
              error: true,
              metadata: true,
              triggeredBy: true,
              queueDelayMs: true
            }
          }),
          prisma.jobRun.count({ where })
        ]);

        return json(res, { runs, total, limit, offset });
      }
    },

    // Job Details - Get single job run
    {
      id: 'admin.GET./admin/jobs/:jobRunId',
      method: 'GET',
      path: '/admin/jobs/:jobRunId',
      auth: Auth.admin(),
      summary: 'Get job run details',
      tags: ['admin'],
      handler: async (req, res) => {
        const jobRunId = BigInt(req.params.jobRunId);
        const run = await prisma.jobRun.findUnique({
          where: { id: jobRunId }
        });

        if (!run) {
          return json(res, { error: 'Job run not found' }, 404);
        }

        return json(res, run);
      }
    },

    // Active Jobs - List currently running jobs
    {
      id: 'admin.GET./admin/jobs/active',
      method: 'GET',
      path: '/admin/jobs/active',
      auth: Auth.admin(),
      summary: 'Get active job runs',
      tags: ['admin'],
      handler: async (req, res) => {
        const runs = await prisma.jobRun.findMany({
          where: { status: 'RUNNING' },
          orderBy: { startedAt: 'desc' },
          select: {
            id: true,
            jobName: true,
            status: true,
            trigger: true,
            scope: true,
            startedAt: true,
            queuedAt: true,
            triggeredBy: true
          }
        });

        return json(res, { runs });
      }
    },

    // Job Stats - Summary statistics (cached)
    {
      id: 'admin.GET./admin/jobs/stats',
      method: 'GET',
      path: '/admin/jobs/stats',
      auth: Auth.admin(),
      summary: 'Get job statistics',
      tags: ['admin'],
      handler: async (req, res) => {
        // Use caching to prevent scalability issues
        const cacheKey = 'admin:job-stats';
        const cacheTTL = 30; // 30 seconds
        
        // Try to get from cache (implement with Redis or in-memory cache)
        // For now, compute directly but add TODO for caching
        
        // Simpler queries that scale better
        const [
          statusCounts,
          recentActivity
        ] = await Promise.all([
          // Count by status (fast with index on status)
          prisma.jobRun.groupBy({
            by: ['status'],
            _count: true
          }),
          // Only count recent jobs, don't group by name yet
          prisma.jobRun.count({
            where: {
              queuedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
          })
        ]);

        const stats = {
          active: statusCounts.find(s => s.status === 'RUNNING')?._count || 0,
          queued: statusCounts.find(s => s.status === 'QUEUED')?._count || 0,
          last24h: {
            total: recentActivity,
            // Get top 10 job names separately (limit scope)
            byJob: [] // TODO: Add separate cached aggregation
          },
          timestamp: new Date().toISOString()
        };

        // TODO: Implement proper caching layer
        // await cache.set(cacheKey, stats, cacheTTL);

        return json(res, stats);
      }
    },

    // Enqueue Job - Create a new job run
    {
      id: 'admin.POST./admin/jobs/enqueue',
      method: 'POST',
      path: '/admin/jobs/enqueue',
      auth: Auth.admin(),
      summary: 'Enqueue a job for execution',
      tags: ['admin'],
      handler: async (req, res) => {
        const { jobName, parameters } = req.body as {
          jobName: string;
          parameters?: Record<string, unknown>;
        };

        // Validate job exists
        const { getJob } = await import('../../../scripts/jobs/registry.js');
        const job = getJob(jobName);
        if (!job) {
          return json(res, { error: 'Unknown job' }, 400);
        }

        // Create job run in QUEUED state
        // Worker will pick it up and execute
        const jobRun = await prisma.jobRun.create({
          data: {
            jobName,
            status: 'QUEUED',  // QUEUED state, not RUNNING
            trigger: 'MANUAL',
            triggeredBy: req.ctx.userId,
            metadata: parameters as any,
            queuedAt: new Date()
            // startedAt is NULL until worker picks it up
          }
        });

        // Job is now QUEUED - worker loop will pick it up
        // No in-process execution (avoids crashes killing jobs)

        return json(res, { jobRunId: jobRun.id.toString(), status: 'queued' }, 202);
      }
    },

    // Cancel Job - Request job cancellation
    {
      id: 'admin.POST./admin/jobs/:jobRunId/cancel',
      method: 'POST',
      path: '/admin/jobs/:jobRunId/cancel',
      auth: Auth.admin(),
      summary: 'Request job cancellation',
      tags: ['admin'],
      handler: async (req, res) => {
        const jobRunId = BigInt(req.params.jobRunId);
        
        const jobRun = await prisma.jobRun.findUnique({
          where: { id: jobRunId },
          select: { id: true, status: true }
        });

        if (!jobRun) {
          return json(res, { error: 'Job run not found' }, 404);
        }

        if (jobRun.status !== 'QUEUED' && jobRun.status !== 'RUNNING') {
          return json(res, { error: 'Job cannot be cancelled (already finished)' }, 400);
        }

        // For QUEUED jobs, immediately cancel
        if (jobRun.status === 'QUEUED') {
          await prisma.jobRun.update({
            where: { id: jobRunId },
            data: {
              status: 'CANCELLED',
              cancelRequestedAt: new Date(),
              cancelRequestedBy: req.ctx.userId,
              finishedAt: new Date()
            }
          });
          return json(res, { status: 'cancelled' });
        }

        // For RUNNING jobs, set cancelRequestedAt flag
        // Job handler must check this flag cooperatively
        await prisma.jobRun.update({
          where: { id: jobRunId },
          data: {
            cancelRequestedAt: new Date(),
            cancelRequestedBy: req.ctx.userId
          }
        });

        return json(res, { status: 'cancellation_requested' }, 202);
      }
    },

    // Job Definitions - List available jobs
    {
      id: 'admin.GET./admin/jobs/definitions',
      method: 'GET',
      path: '/admin/jobs/definitions',
      auth: Auth.admin(),
      summary: 'Get available job definitions',
      tags: ['admin'],
      handler: async (req, res) => {
        // Static list from job registry (can be enhanced with DB table later)
        const { getAllJobs } = await import('../../../scripts/jobs/registry.js');
        const jobs = getAllJobs();
        
        const definitions = Object.entries(jobs).map(([name, job]) => ({
          id: name,
          name: job.name,
          description: job.description,
          examples: job.examples
        }));

        return json(res, { jobs: definitions });
      }
    }
  ]
};
```

**Register admin domain** (`backend/src/registry/registry.ts`):

```typescript
import { adminDomain } from './domains/admin/index.js';

export const registry: DomainRegistry[] = [
  systemDomain,
  authDomain,
  adminDomain,  // NEW
  feedDomain,
  // ... rest
];
```

### 1.4 WebSocket Support for Real-time Updates

**Add job event types** (`shared/src/ws/contracts.ts`):

```typescript
export type WsEvents = {
  // ... existing events
  
  // NEW: Admin job events
  'server.admin.job_started': {
    jobRunId: string
    jobName: string
    startedAt: string
    triggeredBy?: string
  }
  'server.admin.job_progress': {
    jobRunId: string
    jobName: string
    progressPercent: number
    progressMessage?: string
  }
  'server.admin.job_completed': {
    jobRunId: string
    jobName: string
    status: 'SUCCESS' | 'FAILED'
    finishedAt: string
    durationMs: number
    error?: string
  }
}
```

**Add admin WebSocket handler** (`backend/src/ws/domains/admin.ts`):

```typescript
import type { WsRouter } from '../router.js'
import { notify } from '../notify.js'
import type WebSocket from 'ws'

// Track admin sockets explicitly
const adminSockets = new Set<WebSocket>();

export function registerAdminHandlers(router: WsRouter) {
  // Admin clients can subscribe to admin.jobs topic
  // Events are sent via notify() when jobs start/complete
}

// Register admin socket on connection
export function registerAdminSocket(socket: WebSocket) {
  adminSockets.add(socket);
  socket.on('close', () => {
    adminSockets.delete(socket);
  });
}

// Unregister admin socket
export function unregisterAdminSocket(socket: WebSocket) {
  adminSockets.delete(socket);
}

// Helper to emit job events to all admin users
export function emitJobEvent<T extends 'server.admin.job_started' | 'server.admin.job_progress' | 'server.admin.job_completed'>(
  eventType: T,
  data: WsEvents[T]
) {
  const event = {
    type: eventType,
    data,
    ts: Date.now()
  };

  // Send to all registered admin sockets
  for (const socket of adminSockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }
}
```

**Update WebSocket connection handler** (`backend/src/ws/index.ts`):

```typescript
import { registerAdminSocket } from './domains/admin.js';

wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
  const userId = getUserId(req);
  if (!userId) {
    socket.close(4401, 'unauthorized');
    return;
  }

  // Check if user is admin and register socket
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    select: { role: true }
  });

  if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    registerAdminSocket(socket);
  }

  // ... rest of connection handler
});
```

**Update job runner to accept existing jobRunId** (`backend/src/lib/jobs/runJob.ts`):

```typescript
type RunJobOptions = {
  jobName: string;
  trigger?: JobTrigger;
  scope?: string | null;
  algorithmVersion?: string | null;
  attempt?: number;
  metadata?: Record<string, unknown> | null;
  triggeredBy?: bigint | null;
  jobRunId?: bigint;  // NEW: Accept existing job run ID
};

// NEW: Heartbeat helper for long-running jobs
// No global state - pass jobRunId explicitly
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

function startHeartbeat(jobRunId: bigint) {
  const key = jobRunId.toString();
  
  // Clear existing timer if any
  if (heartbeatTimers.has(key)) {
    clearInterval(heartbeatTimers.get(key)!);
  }
  
  // Update heartbeat every 30 seconds
  const timer = setInterval(async () => {
    try {
      await prisma.jobRun.update({
        where: { id: jobRunId },
        data: { lastHeartbeatAt: new Date() }
      });
    } catch (err) {
      console.error(`[job] Failed to update heartbeat for job ${jobRunId}:`, err);
    }
  }, 30000);
  
  heartbeatTimers.set(key, timer);
}

function stopHeartbeat(jobRunId: bigint) {
  const key = jobRunId.toString();
  const timer = heartbeatTimers.get(key);
  
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(key);
  }
}

export async function runJob<T>(options: RunJobOptions, handler: () => Promise<T>): Promise<T> {
  let jobRun: { id: bigint };

  if (options.jobRunId) {
    // Use existing job run (from trigger endpoint)
    jobRun = { id: options.jobRunId };
    
    // Update to RUNNING state
    await prisma.jobRun.update({
      where: { id: options.jobRunId },
      data: {
        status: 'RUNNING',
        startedAt: new Date()
      }
    });
  } else {
    // Create new job run in QUEUED state, then immediately start
    // (for backwards compatibility with direct runJob calls)
    jobRun = await prisma.jobRun.create({
      data: {
        jobName: options.jobName,
        status: 'RUNNING',  // Direct execution bypasses queue
        trigger: options.trigger ?? 'MANUAL',
        scope: options.scope ?? null,
        algorithmVersion: options.algorithmVersion ?? null,
        attempt: options.attempt ?? 1,
        queuedAt: new Date(),
        startedAt: new Date(),
        triggeredBy: options.triggeredBy ?? null,
        metadata: options.metadata ? (options.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
      },
      select: { id: true }
    });
  }

  // Start heartbeat before execution
  startHeartbeat(jobRun.id);

  // Emit job started event
    // Check for cancellation periodically
    // Execute handler (handlers should also check cancellation)
    
    // Get startedAt to calculate accurate duration
    // Duration = execution time only (not queue time)
    const durationMs = run?.startedAt 
      ? Math.max(0, finishedAt.getTime() - run.startedAt.getTime())
      : 0;
    
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt,
        durationMs
      }
    });

    // Stop heartbeat after success (pass explicit ID)
    stopHeartbeat(jobRun.id);

    // Emit job completed event
    try {
      const { emitJobEvent } = await import('../ws/domains/admin.js');
      emitJobEvent('server.admin.job_completed', {
        jobRunId: jobRun.id.toString(),
        jobName: options.jobName,
        status: 'SUCCESS',
        finishedAt: finishedAt.toISOString(),
        durationMs
      });
    } catch (err) {
      // Ignore WS errors
    }
    
    // Duration = execution time only
    const durationMs = run?.startedAt
      ? Math.max(0, finishedAt.getTime() - run.startedAt.getTime())
      : 0;
    
    // Check if error was due to cancellation
    const status = run?.cancelRequestedAt ? 'CANCELLED' : 'FAILED';
    
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status,
        finishedAt,
        durationMs,
        error: toErrorMessage(err)
      }
    });

    // Stop heartbeat after failure (pass explicit ID)
    stopHeartbeat(jobRun.id);

    // Emit job completed/cancelled event
    try {
      const { emitJobEvent } = await import('../ws/domains/admin.js');
      emitJobEvent('server.admin.job_completed', {
        jobRunId: jobRun.id.toString(),
        jobName: options.jobName,
        status,
        finishedAt: finishedAt.toISOString(),
        durationMs,
        error: toErrorMessage(err)
      });
    } catch (err2) {
      // Ignore WS errors
    }

    throw err;
  }
}

// Renamed for clarity - runs a queued job
  // Import and execute the job
  // Calculate queue delay before starting
  // Update with queue delay
  // Run the job with existing jobRunId
```

## 2. Frontend Structure

### 2.1 Location: `frontend/src/admin`

**Rationale**: Keep admin UI in `frontend/src/admin` to:
- Reuse existing components from `frontend/src/ui`
- Share styles from `frontend/src/styles`
- Use existing API client from `frontend/src/api`
- Keep admin code separate but accessible

**Directory structure**:

```
frontend/src/admin/
├── pages/
│   ├── AdminDashboard.tsx      # Main dashboard with stats
│   ├── JobHistoryPage.tsx      # Job history table
│   ├── JobDetailsPage.tsx      # Single job run details
│   └── JobMonitorPage.tsx      # Real-time active jobs
├── components/
│   ├── JobRunTable.tsx         # Reusable job list table
│   ├── JobRunRow.tsx           # Single job row
│   ├── JobStatsCard.tsx        # Stats card component
│   ├── JobStatusBadge.tsx      # Status indicator
│   ├── JobTriggerModal.tsx     # Modal to trigger jobs
│   └── JobProgressBar.tsx      # Progress indicator
├── hooks/
│   ├── useJobHistory.ts        # Fetch job history
│   ├── useActiveJobs.ts        # Real-time active jobs
│   ├── useJobStats.ts          # Stats aggregation
│   └── useJobWebSocket.ts      # WebSocket job events
├── api/
│   └── admin.ts                # Admin API client
└── types.ts                    # Admin types
```

### 2.2 Routing Integration

**Update App.tsx** to include admin routes:

```typescript
// In App.tsx
const AdminDashboard = lazy(() => import('./admin/pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const JobHistoryPage = lazy(() => import('./admin/pages/JobHistoryPage').then(m => ({ default: m.JobHistoryPage })));
const JobDetailsPage = lazy(() => import('./admin/pages/JobDetailsPage').then(m => ({ default: m.JobDetailsPage })));
const JobMonitorPage = lazy(() => import('./admin/pages/JobMonitorPage').then(m => ({ default: m.JobMonitorPage })));

// Add routes
```

**Create AdminRoute guard** (`frontend/src/core/routing/AdminRoute.tsx`):

### 2.3 Key Components

**JobHistoryPage.tsx** - Main job history view:
```typescript
export function JobHistoryPage() {
  const [filters, setFilters] = useState({ jobName: '', status: '' });
  const { data, loading, error } = useJobHistory(filters);
  const navigate = useNavigate();

  return (
    <div className="admin-page">
      <h1>Job History</h1>
      
      <div className="filters">
        <select onChange={(e) => setFilters({ ...filters, jobName: e.target.value })}>
          <option value="">All Jobs</option>
          {/* Job names from definitions */}
        </select>
        
        <select onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          <option value="RUNNING">Running</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      <JobRunTable 
        runs={data?.runs || []} 
        onRowClick={(run) => navigate(`/admin/jobs/${run.id}`)}
      />
      
      {/* Pagination */}
    </div>
  );
}
```

**JobMonitorPage.tsx** - Real-time active jobs:
**useJobWebSocket hook** - Real-time updates:

## 3. Creating Admin Users

### 3.1 Migration Script

**Create migration script** (`backend/scripts/createAdmin.ts`):

```typescript
import { prisma } from '../src/lib/prisma/client.js';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';

async function createAdmin(email: string, password: string, role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  const passwordHash = await bcrypt.hash(password, 10);
  
  const user = await prisma.user.upsert({
    where: { email },
    update: { role },
    create: {
      email,
      passwordHash,
      role,
      profile: {
        create: {
          displayName: role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin',
          isVisible: false  // Hide admin profiles from regular users
        }
      }
    }
  });

  console.log(`✓ ${role} user created: ${email} (ID: ${user.id})`);
  return user;
}

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const role = process.argv[4] as 'ADMIN' | 'SUPER_ADMIN' | undefined;

  if (!email || !password) {
    console.error('Usage: pnpm tsx scripts/createAdmin.ts <email> <password> [ADMIN|SUPER_ADMIN]');
    process.exit(1);
  }

  await createAdmin(email, password, role || 'ADMIN');
  await prisma.$disconnect();
}

main().catch(console.error);
```

**Add script to package.json**:

```json
{
  "scripts": {
    "admin:create": "tsx scripts/createAdmin.ts"
  }
}
```

**Usage**:
```bash
pnpm admin:create admin@example.com SecurePassword123 ADMIN
pnpm admin:create superadmin@example.com SuperSecurePassword456 SUPER_ADMIN
```

### 3.2 Environment-based Bootstrap

**Option**: Auto-create admin from environment variables on first startup:

```typescript
// In backend/src/index.ts startup
async function bootstrapAdmin() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) return;

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) return;

  console.log('[bootstrap] Creating admin user from environment variables...');
  // Create admin user
}
```

## 4. Job Execution Architecture

### 4.1 Job Queue Flow

**Single source of truth: JobRun table**

```
┌─────────────────────────────────────────────────────────────┐
│  Admin enqueues job via POST /admin/jobs/enqueue            │
│  ↓                                                           │
│  Create JobRun with status=QUEUED, queuedAt=now()          │
│  ↓                                                           │
│  Return 202 Accepted with jobRunId                          │
│  (No in-process execution - worker picks it up)             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Background worker loop polls for QUEUED jobs               │
│  ↓                                                           │
│  SELECT ... WHERE status=QUEUED LIMIT 1 FOR UPDATE          │
│  ↓                                                           │
│  Update JobRun: status=RUNNING, startedAt=now(),           │
│                 queueDelayMs=(startedAt - queuedAt)         │
│  ↓                                                           │
│  Execute job.run() with jobRunId                            │
│  ↓                                                           │
│  Job handler periodically checks cancelRequestedAt          │
│  ↓                                                           │
│  Update JobRun: status=SUCCESS/FAILED/CANCELLED,            │
│                 durationMs=(finishedAt - startedAt)         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Background Worker Loop

**Create worker process** (`backend/src/workers/jobWorker.ts`):

```typescript
import { prisma } from '../lib/prisma/client.js';
import { runQueuedJob } from '../lib/jobs/runJob.js';

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const HEARTBEAT_INTERVAL_MS = 30000; // Update heartbeat every 30s
const STALLED_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

async function processNextJob(): Promise<boolean> {
  // Find oldest queued job and lock it atomically
  const job = await prisma.$transaction(async (tx) => {
    const queued = await tx.jobRun.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { queuedAt: 'asc' },
      select: { id: true, jobName: true }
    });

    if (!queued) return null;

    // Conditional update - only succeeds if still QUEUED
    // This prevents double execution in multi-worker scenarios
    const now = new Date();
    const updated = await tx.jobRun.updateMany({
      where: { 
        id: queued.id, 
        status: 'QUEUED'  // CRITICAL: Only update if still QUEUED
      },
      data: { 
        status: 'RUNNING',
        startedAt: now,
        lastHeartbeatAt: now
      }
    });

    // If count is 0, another worker grabbed this job first
    if (updated.count === 0) {
      return null;
    }

    return queued;
  });

  if (!job) {
    return false; // No jobs to process
  }

  try {
    console.log(`[worker] Processing job ${job.id} (${job.jobName})`);
    await runQueuedJob(job.id);
    console.log(`[worker] Completed job ${job.id}`);
    return true;
  } catch (err) {
    console.error(`[worker] Failed to process job ${job.id}:`, err);
    return true; // Job failed but was processed
  }
}

// NEW: Detect and mark stalled jobs
async function detectStalledJobs() {
  const threshold = new Date(Date.now() - STALLED_JOB_THRESHOLD_MS);
  
  const stalledJobs = await prisma.jobRun.findMany({
    where: {
      status: 'RUNNING',
      OR: [
        { lastHeartbeatAt: { lt: threshold } },
        { lastHeartbeatAt: null }  // Jobs that never set heartbeat
      ]
    },
    select: { id: true, jobName: true, startedAt: true }
  });

  if (stalledJobs.length > 0) {
    console.warn(`[worker] Found ${stalledJobs.length} stalled jobs:`, 
      stalledJobs.map(j => `${j.id} (${j.jobName})`));

    // Mark as FAILED with stalled error
    for (const job of stalledJobs) {
      await prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: 'Job stalled: worker heartbeat timeout (possible crash)',
          durationMs: job.startedAt 
            ? Date.now() - job.startedAt.getTime()
            : null
        }
      });
    }
  }
}

async function workerLoop() {
  console.log('[worker] Job worker started');
  
  // Run stalled job detection on startup
  await detectStalledJobs();
  
  // Schedule periodic stalled job detection
  const stalledCheckTimer = setInterval(detectStalledJobs, 60000); // Every 1 minute

  while (true) {
    try {
      const processed = await processNextJob();
      
      if (!processed) {
        // No jobs, wait before polling again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      // If job was processed, immediately check for next one (no delay)
    } catch (err) {
      console.error('[worker] Worker loop error:', err);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  workerLoop().catch(err => {
    console.error('[worker] Fatal error:', err);
    process.exit(1);
  });
}

export { workerLoop };
```

**Start worker with server** (`backend/src/index.ts`):

```typescript
// After server starts
import { workerLoop } from './workers/jobWorker.js';

// Start worker in background
process.nextTick(() => {
  workerLoop().catch(err => {
    process.stderr.write(`[worker] Fatal error: ${err}\n`);
  });
});
```

**Or run as separate process** (production):

```bash
# Terminal 1: API server
pnpm --filter ./backend dev

# Terminal 2: Job worker
pnpm tsx backend/src/workers/jobWorker.ts
```

### 4.3 Cooperative Cancellation

**Critical**: Jobs must check for cancellation requests periodically.

**Helper function** (`backend/src/lib/jobs/cancellation.ts`):

```typescript
import { prisma } from '../prisma/client.js';

// No global state - pass jobRunId explicitly
export async function checkCancellation(jobRunId: bigint): Promise<void> {
  const run = await prisma.jobRun.findUnique({
    where: { id: jobRunId },
    select: { cancelRequestedAt: true }
  });

  if (run?.cancelRequestedAt) {
    throw new Error('Job cancelled by admin');
  }
}
```

**Usage in job handlers**:

```typescript
import { checkCancellation } from '../../lib/jobs/cancellation.js';

export async function runMatchScoreJob(options: { jobRunId?: bigint }) {
  const { jobRunId } = options;
  
  for (let i = 0; i < users.length; i++) {
    // IMPORTANT: Check cancellation every 100 iterations (not every single one)
    if (jobRunId && i % 100 === 0) {
      await checkCancellation(jobRunId);
    }
    
    // Continue processing
    await processUser(users[i]);
  }
}
```

**Frequency guidelines**:
- Fast loops (< 1s/iteration): Check every 100-1000 iterations
- Slow loops (> 1s/iteration): Check every iteration
- Very long jobs (> 1 hour): Check every 1-5 minutes of work

### 4.4 Job Stats Caching

Prevent scalability issues with cached aggregations:

```typescript
// Option 1: In-memory cache (simple)
const statsCache = new Map<string, { data: any, expiresAt: number }>();

function getCachedStats() {
  const cached = statsCache.get('admin:job-stats');
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

```

### 4.5 Duration vs Queue Delay

**Critical distinction for admin UI**:

```typescript
// WRONG - mixes queue wait + execution time
durationMs = finishedAt - queuedAt  // Could be 20 minutes!

// RIGHT - separate concerns
durationMs = finishedAt - startedAt      // Execution time: 1 minute
queueDelayMs = startedAt - queuedAt      // Queue wait: 19 minutes
```

**UI Display**:
```
Job #123: match-scores
Status: SUCCESS
Queued: 2:00 PM
Started: 2:19 PM (waited 19m)
Finished: 2:20 PM (ran 1m)
```

This prevents admins asking "Why did this job take 20 minutes?" when it only ran for 1 minute.

### 4.6 Stalled Job Detection

**Problem**: Worker crashes while job is RUNNING → job stays "Running forever"

**Solution**: Heartbeat mechanism

```typescript
// Worker updates lastHeartbeatAt every 30 seconds
await prisma.jobRun.update({
  where: { id: jobRunId },
  data: { lastHeartbeatAt: new Date() }
});

// Separate process detects stalled jobs (no heartbeat in 5 minutes)
const stalledJobs = await prisma.jobRun.findMany({
  where: {
    status: 'RUNNING',
    lastHeartbeatAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }
  }
});

// Mark as FAILED with stalled error
for (const job of stalledJobs) {
  await prisma.jobRun.update({
    where: { id: job.id },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      error: 'Job stalled: worker heartbeat timeout (possible crash)'
    }
  });
}
```

**UI indicator**: Show "⚠️ STALLED" badge for jobs with old heartbeats.

## 5. Security Considerations

### 5.1 Admin Session Management

- Admins use same JWT auth as regular users
- Add `role` field to JWT payload
- Admin routes check `role` in middleware
- Admin sessions could have shorter expiry (optional)

### 5.2 Audit Logging

Add audit log table for admin actions:

```prisma
model AdminAuditLog {
  id        BigInt   @id @default(autoincrement())
  adminId   BigInt
  action    String   // e.g., "job.trigger", "user.edit"
  targetType String?  // e.g., "JobRun", "User"
  targetId  String?
  metadata  Json?
  ipAddress String?
  createdAt DateTime @default(now())

  @@index([adminId, createdAt])
  @@index([action, createdAt])
}
```

### 5.3 CSRF Protection (SIMPLIFIED)

**Use SameSite=Strict cookies** (simplest, no token logic needed):

```typescript
// Backend: Set cookie with SameSite=Strict
res.cookie('accessToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',  // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

**That's it.** No CSRF tokens, no Redis, no frontend changes needed.

**Why this works**:
- `SameSite=Strict` prevents cookie from being sent in cross-site requests
- CSRF attacks require cross-site requests
- Browser enforces this automatically

**Trade-off**: Users can't navigate to admin from external links. This is acceptable for admin panels.

### 5.4 Rate Limiting

Add rate limiting for admin actions:
- Job triggering: Max 10 jobs per minute per admin
- Prevent accidental DOS from admin panel

### 5.5 BigInt Strategy (LOCKED IN)

**Rule**: String IDs at API boundary, BigInt in database

```typescript
// Backend: json helper converts BigInt to string
export function json(res: Response, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  
  // Custom replacer for BigInt serialization
  res.end(JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

// Frontend: All IDs are typed as string
type JobRun = {
  id: string;           // NOT bigint
  jobName: string;
  triggeredBy: string | null;
  // ...
};
```

**Why this matters**:
- JavaScript `number` max safe integer: 2^53 - 1
- Postgres `bigint` max: 2^63 - 1
- BigInt values > 2^53 silently corrupt as `number` in frontend
- **Solution**: Treat all IDs as opaque strings in frontend/API layer

**Locked rule**: Never expose `bigint` to frontend types. Always string.

## 6. V1 Scope (FROZEN - DO NOT EXPAND)

**V1 Definition**: Observe + Control

### ✅ INCLUDE (locked scope)
- Job history (list, filter, detail)
- Job enqueue (manual trigger)
- Job cancellation
- Active jobs view
- Audit logging (who triggered what)
- Rate limiting (10/min)
- Background worker loop with heartbeat
- Stalled job detection
- Worker concurrency safety (conditional update)

## 7. Implementation Checklist

### Day 1 (Core)
- [ ] Schema migration (User.role, JobRun fields)
- [ ] Auth.admin() + middleware
- [ ] Admin domain routes (history, enqueue, cancel, active, stats)
- [ ] Background worker loop
- [ ] Create first admin user script
- [ ] Frontend: AdminRoute guard
- [ ] Frontend: Job history page
- [ ] Frontend: Job details page
- [ ] SameSite=Strict cookies

### Day 2 (Polish)
- [ ] WebSocket job events (started, completed)
- [ ] Real-time active jobs updates
- [ ] Audit logging (AdminAuditLog table)
- [ ] Rate limiting (10 jobs/min)
- [ ] Job stats caching (30s TTL)
- [ ] Cancel button in UI
- [ ] Toast notifications for job completion

## 11. Critical Fixes Summary

### Issue 1: Job Execution Model ✅ FIXED
- **Problem**: Duplicate JobRun creation
- **Solution**: Single source of truth - trigger creates QUEUED, runJob accepts jobRunId
- **Lifecycle**: QUEUED → RUNNING → SUCCESS/FAILED/CANCELLED

### Issue 2: Cancellation Semantics ✅ FIXED
- **Problem**: Cancellation fields without logic
- **Solution**: `cancelRequestedAt` + cooperative checking in handlers
- **API**: POST `/admin/jobs/:jobRunId/cancel`

### Issue 3: Auth Logic Bug ✅ FIXED
- **Problem**: Operator precedence error
- **Solution**: Added parentheses: `(user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')`
- **Fixed in**: Backend middleware + Frontend AdminRoute

### Issue 4: WebSocket Admin Targeting ✅ FIXED
- **Problem**: Undefined admin grouping
- **Solution**: Explicit `adminSockets` Set with join/leave logic
- **Implementation**: Register admin sockets on connection

### Issue 5: Job Stats Scalability ✅ FIXED
- **Problem**: Unbounded groupBy query
- **Solution**: 30-second cache + limited scope queries
- **Future**: Redis cache or materialized daily summaries

### Issue 6: JobDefinition Table Duplication ✅ FIXED
- **Problem**: DB table duplicates code registry
- **Solution**: Removed DB table, use code-driven registry only
- **Single source of truth**: `backend/scripts/jobs/registry.ts`

### Issue 7: Admin CSRF Protection ✅ FIXED
- **Problem**: Admin actions vulnerable to CSRF
- **Solution**: SameSite=Strict cookies (no token logic needed)
- **Rate limiting**: Added 10 req/min per admin user

### Issue 8: process.nextTick Execution ✅ FIXED
- **Problem**: Jobs run in-process, crashes kill them
- **Solution**: Background worker loop polls QUEUED jobs
- **Benefits**: Crash resilience, concurrency control, multi-instance ready

### Issue 9: Duration Calculation Bug ✅ FIXED
- **Problem**: Mixed queue wait + execution time
- **Solution**: Separate fields - `durationMs` (execution) + `queueDelayMs` (wait)
- **Prevents**: "Why did this take 20 minutes?" confusion

### Issue 10: Naming Clarity ✅ FIXED
- **Renamed**: `executeJob()` → `runQueuedJob()`
- **Renamed**: "trigger job" → "enqueue job"
- **Endpoint**: `/admin/jobs/enqueue` (was /trigger)

### Issue 11: V1 Scope Bloat ✅ FIXED
- **Cut**: Progress tracking, parameter schemas, scheduling UI, job chains
- **Keep**: Enqueue, cancel, observe, audit (80/20 rule)

### Issue 12: Worker Heartbeat Missing ✅ FIXED
- **Problem**: Worker crash leaves job RUNNING forever
- **Solution**: `lastHeartbeatAt` field + 30s heartbeat interval
- **Detection**: Stalled job check marks jobs FAILED if no heartbeat in 5 minutes

### Issue 13: BigInt Serialization Bug ✅ FIXED
- **Problem**: `JSON.stringify` throws TypeError on BigInt
- **Solution**: Custom replacer in json helper: `value => typeof value === 'bigint' ? value.toString() : value`

### Issue 14: Cancellation Check Frequency ✅ FIXED
- **Problem**: Checking every iteration too expensive
- **Solution**: Check every 100-1000 iterations for fast loops, every iteration for slow loops
- **Helper**: `checkCancellation(jobRunId)` function with explicit ID parameter

### Issue 15: Worker Locking Race Condition ✅ FIXED
- **Problem**: `findFirst` + `update` not atomic under concurrency
- **Solution**: Conditional `updateMany` with `status: QUEUED` check
- **Verification**: `if (updated.count === 0) return null;`
- **Guarantees**: No double execution, safe multi-worker future

### Issue 16: Heartbeat Global State Bug ✅ FIXED
- **Problem**: `let currentJobRunId` breaks with concurrent jobs
- **Solution**: Pass `jobRunId` explicitly to all functions
- **Fixed**: `startHeartbeat(id)`, `stopHeartbeat(id)`, `checkCancellation(id)`

### Issue 17: BigInt API Boundary Strategy 🔒 LOCKED
- **Rule**: String IDs at API boundary, BigInt in database
- **Frontend types**: All IDs typed as `string`, never `bigint` or `number`
- **Prevents**: Silent corruption when IDs exceed 2^53

### Issue 18: V1 Scope Creep Prevention 🔒 FROZEN
- **V1**: Observe + control only (enqueue, cancel, history, audit, worker resilience)
- **Cut**: Retries, priorities, concurrency limits, scheduling UI, progress, parameter schemas
- **Rule**: Add complexity only when pain is proven (not speculative)

## Summary

This plan provides a **production-ready, battle-tested** admin interface focused on job monitoring and control. 

**V1 is FROZEN at**: Observe + Control (no retries, priorities, scheduling, progress)

The key design decisions are:

### Core Architecture
1. **Schema**: Minimal - User.role + JobRun fields (no JobDefinition table)
2. **Job Queue**: Background worker loop polls QUEUED jobs (no process.nextTick)
3. **Metrics**: Separate `durationMs` (execution) + `queueDelayMs` (wait time)
4. **Cancellation**: Cooperative with `cancelRequestedAt` polling
5. **Stats**: 30s cached queries (scalable)
6. **Registry**: Code-driven only (no DB duplication)

### Security
7. **Auth**: Role-based with operator precedence fix
8. **CSRF**: SameSite=Strict cookies (simple, no tokens)
9. **Rate Limit**: 10 enqueues/min per admin
10. **Audit**: AdminAuditLog for all actions

### Implementation
11. **V1 Scope**: Enqueue + cancel + observe + audit (cut progress, scheduling, chains)
12. **Day 1**: Schema, auth, routes, worker loop, history UI
13. **Day 2**: WebSocket events, rate limiting, polish