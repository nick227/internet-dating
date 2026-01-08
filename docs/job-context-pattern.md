# JobContext Pattern - Internal Feedback API

## Overview

**Jobs should NEVER touch Prisma directly for feedback.** Instead, use the `JobLogger` abstraction provided through `JobContext`.

This ensures:
- ✅ Consistent logging and progress tracking
- ✅ Real-time WebSocket broadcasting
- ✅ Proper separation of concerns
- ✅ Easy testing and mocking

---

## The Pattern

### ❌ **WRONG - Direct Prisma Access**

```typescript
export async function runMyJob(options: MyJobOptions) {
  return runJob(
    { jobName: 'my-job', trigger: 'MANUAL', scope: 'system', algorithmVersion: 'v1' },
    async () => {
      // ❌ DON'T DO THIS - Direct Prisma update
      await prisma.jobRun.update({
        where: { id: someJobRunId },
        data: { 
          progressPercent: 50,
          progressMessage: 'Half done'
        }
      });

      // ❌ DON'T DO THIS - Direct log insert
      await prisma.jobLog.create({
        data: {
          jobRunId: someJobRunId,
          level: 'info',
          message: 'Processing...'
        }
      });

      // Do work...
    }
  );
}
```

### ✅ **CORRECT - JobLogger via JobContext**

```typescript
import { createJobLogger } from '../lib/jobs/jobLogger.js';

export async function runMyJob(options: MyJobOptions) {
  return runJob(
    { jobName: 'my-job', trigger: 'MANUAL', scope: 'system', algorithmVersion: 'v1' },
    async (ctx) => {  // 👈 Receive JobContext
      // ✅ Create logger from context
      const logger = createJobLogger(ctx.jobRunId, ctx.jobName);

      // ✅ Use logger methods
      await logger.setStage('Processing');
      await logger.setTotal(100, 'items');
      await logger.info('Starting work...');

      for (let i = 0; i < 100; i++) {
        // Do work...
        await logger.incrementProgress();
      }

      await logger.milestone('Work complete');
      await logger.logSummary();
    }
  );
}
```

---

## JobContext API

### **What is JobContext?**

```typescript
interface JobContext {
  jobRunId: bigint;  // ID of the current job run
  jobName: string;   // Name of the job
}
```

Passed as the **first argument** to every job handler function.

---

## JobLogger API

### **Creation**

```typescript
import { createJobLogger } from '../lib/jobs/jobLogger.js';

const logger = createJobLogger(ctx.jobRunId, ctx.jobName);
```

### **Core Methods**

#### **1. Stages**

```typescript
// Set current stage
await logger.setStage('Scanning users', 'Loading from database');
await logger.setStage('Processing');
```

#### **2. Progress Tracking**

```typescript
// Set total (for known workloads)
await logger.setTotal(5000, 'users');

// Increment progress
await logger.incrementProgress();

// Set progress directly
await logger.setProgress(2500);
```

#### **3. Logging**

```typescript
// Debug (verbose, not shown in UI by default)
await logger.debug('Cache hit', { key: 'user-123' });

// Info (general information)
await logger.info('Processing batch', { batchSize: 100 });

// Milestone (important events)
await logger.milestone('Database scan complete', { found: 5000 });

// Warning (non-fatal issues)
await logger.warning('User has invalid data', { userId: '123' });

// Error (failures)
await logger.error('Failed to process user', { userId: '456', error: 'Network timeout' });
```

#### **4. Outcomes**

```typescript
// Track outcomes
logger.addOutcome('updates', 10);
logger.addOutcome('inserts', 5);
logger.addOutcome('errors', 2);
logger.addOutcome('skipped', 3);

// Save outcome summary (called automatically by logSummary)
await logger.saveOutcome();
```

#### **5. Summary**

```typescript
// Log final summary (always call in finally block)
await logger.logSummary();
```

---

## Complete Example

```typescript
import { runJob } from '../lib/jobs/runJob.js';
import { createJobLogger } from '../lib/jobs/jobLogger.js';
import { prisma } from '../lib/prisma/client.js';

export async function runUserSyncJob(options: {
  batchSize?: number;
}) {
  const { batchSize = 100 } = options;

  return runJob(
    {
      jobName: 'user-sync',
      trigger: 'MANUAL',
      scope: 'system',
      algorithmVersion: 'v1',
      metadata: { batchSize }
    },
    async (ctx) => {
      // ✅ Create logger from context
      const logger = createJobLogger(ctx.jobRunId, ctx.jobName);

      try {
        // ===== STAGE 1: Initialize =====
        await logger.setStage('Initializing');
        await logger.info('Job started', { batchSize });

        // ===== STAGE 2: Load users =====
        await logger.setStage('Loading users');
        const users = await prisma.user.findMany({
          take: batchSize
        });

        await logger.setTotal(users.length, 'users');
        await logger.milestone(`Found ${users.length} users to sync`);

        if (users.length === 0) {
          await logger.info('No users to sync');
          await logger.logSummary();
          return { synced: 0 };
        }

        // ===== STAGE 3: Sync users =====
        await logger.setStage('Syncing users');

        let synced = 0;
        let failed = 0;

        for (const user of users) {
          try {
            // Do sync work...
            await syncUserToExternalService(user);
            
            synced++;
            logger.addOutcome('synced', 1);
          } catch (err) {
            failed++;
            logger.addOutcome('errors', 1);
            await logger.error(`Failed to sync user ${user.id}`, {
              userId: user.id.toString(),
              error: err instanceof Error ? err.message : String(err)
            });
          }

          // Update progress
          await logger.incrementProgress();

          // Log milestones
          if ((synced + failed) % 10 === 0) {
            await logger.info(`Progress: ${synced + failed}/${users.length}`, {
              synced,
              failed
            });
          }
        }

        // ===== STAGE 4: Finalize =====
        await logger.setStage('Finalizing');
        await logger.milestone('Sync complete', {
          total: users.length,
          synced,
          failed
        });

        // ✅ Always log summary in finally block
        await logger.logSummary();

        return { synced, failed };

      } catch (err) {
        await logger.error('Job failed', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
        throw err;
      }
    }
  );
}

async function syncUserToExternalService(user: any) {
  // Implementation...
}
```

---

## Why This Pattern?

### **1. Separation of Concerns**

Jobs focus on business logic, not database updates for logging.

### **2. Testability**

Easy to mock `JobLogger` in tests without touching Prisma.

### **3. Consistency**

All jobs log the same way, making debugging easier.

### **4. Real-Time Updates**

JobLogger automatically broadcasts progress via WebSocket.

### **5. Database Efficiency**

JobLogger batches updates and uses transactions efficiently.

---

## Metadata Structure

### **Enqueue Endpoint**

```typescript
// ✅ CORRECT - Wrap params to avoid collision
metadata: {
  params: parameters ?? {}
}

// ❌ WRONG - Direct params cause collision
metadata: parameters
```

### **Why?**

JobLogger uses `metadata` to store progress/metrics:

```json
{
  "params": {
    "batchSize": 100,
    "userId": 8
  },
  "progress": {
    "stage": "Processing",
    "current": 50,
    "total": 100
  },
  "outcome": {
    "updates": 50,
    "errors": 2
  }
}
```

Direct params would collide with `progress` and `outcome` keys.

---

## API Endpoints (Admin)

### **Get Logs**

```typescript
GET /api/admin/jobs/:jobRunId/logs?level=error&limit=100
```

**Response:**
```json
{
  "logs": [
    {
      "id": "123",
      "level": "error",
      "stage": "Processing",
      "message": "Failed to process user",
      "context": { "userId": "456" },
      "createdAt": "2024-01-08T10:30:00Z"
    }
  ]
}
```

### **Get Progress**

```typescript
GET /api/admin/jobs/:jobRunId/progress
```

**Response:**
```json
{
  "progress": {
    "id": "789",
    "jobName": "user-sync",
    "status": "RUNNING",
    "currentStage": "Processing",
    "progressCurrent": 50,
    "progressTotal": 100,
    "progressPercent": 50,
    "progressMessage": "Processing (50 / 100)",
    "entitiesProcessed": 50,
    "entitiesTotal": 100,
    "startedAt": "2024-01-08T10:00:00Z"
  }
}
```

### **Get Outcome**

```typescript
GET /api/admin/jobs/:jobRunId/outcome
```

**Response:**
```json
{
  "outcome": {
    "id": "789",
    "jobName": "user-sync",
    "status": "SUCCESS",
    "outcomeSummary": {
      "synced": 98,
      "errors": 2
    },
    "entitiesProcessed": 100,
    "entitiesTotal": 100,
    "durationMs": 45000,
    "finishedAt": "2024-01-08T10:45:00Z"
  }
}
```

---

## Migration Checklist

**For existing jobs:**

1. ✅ Add `(ctx)` parameter to job handler
2. ✅ Create logger: `const logger = createJobLogger(ctx.jobRunId, ctx.jobName)`
3. ✅ Replace direct Prisma updates with logger methods
4. ✅ Add `await logger.logSummary()` in finally block
5. ✅ Add stages, progress tracking, and outcomes
6. ✅ Test with Job Manager UI

---

## Summary

**Remember:**
- ✅ Jobs receive `JobContext` as first parameter
- ✅ Use `createJobLogger(ctx.jobRunId, ctx.jobName)`
- ✅ NEVER touch Prisma directly for feedback
- ✅ Always call `logger.logSummary()` in finally block
- ✅ Wrap parameters in `{ params: ... }` to avoid collision

**Result:**
- Real-time progress in UI
- Structured logs for debugging
- Outcome summaries for reporting
- Consistent feedback across all jobs
