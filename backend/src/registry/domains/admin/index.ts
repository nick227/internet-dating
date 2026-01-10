import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { prisma } from '../../../lib/prisma/client.js';
import { json } from '../../../lib/http/json.js';

export const adminDomain: DomainRegistry = {
  domain: 'admin',
  routes: [
    // User Management - List users with details
    {
      id: 'admin.GET./admin/users',
      method: 'GET',
      path: '/admin/users',
      auth: Auth.admin(),
      summary: 'Get users list with details',
      tags: ['admin'],
      handler: async (req, res) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const search = req.query.search as string | undefined;
        const sortBy = req.query.sortBy as string || 'createdAt';
        const sortDir = (req.query.sortDir as string) === 'asc' ? 'asc' : 'desc';

        const where: any = {};
        if (search) {
          where.OR = [
            { email: { contains: search } },
            { profile: { displayName: { contains: search } } }
          ];
        }

        let orderBy: any = {};
        if (sortBy === 'name') {
          orderBy = { profile: { displayName: sortDir } };
        } else {
          // Default to createdAt if unknown sort field to avoid crashing
          orderBy = { [sortBy === 'email' ? 'email' : 'createdAt']: sortDir };
        }

        const [users, total] = await Promise.all([
          prisma.user.findMany({
            where,
            take: limit,
            skip: offset,
            orderBy,
            select: {
              id: true,
              email: true,
              createdAt: true,
              role: true,
              profile: {
                select: {
                  displayName: true,
                  locationText: true,
                  birthdate: true,
                  gender: true,
                  intent: true,
                  avatarMedia: { select: { url: true, thumbUrl: true } }
                }
              },
              _count: {
                select: {
                  posts: true,
                  interests: true,
                  quizResults: true,
                  LikesGot: true,
                  matchesA: true,
                  matchesB: true
                }
              }
            }
          }),
          prisma.user.count({ where })
        ]);

        const formattedUsers = users.map(u => ({
          id: u.id.toString(),
          email: u.email,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
          profile: u.profile ? {
            displayName: u.profile.displayName,
            location: u.profile.locationText,
            age: u.profile.birthdate ? Math.floor((Date.now() - new Date(u.profile.birthdate).getTime()) / 31557600000) : null,
            gender: u.profile.gender,
            avatarUrl: u.profile.avatarMedia?.thumbUrl || u.profile.avatarMedia?.url
          } : null,
          stats: {
            posts: u._count.posts,
            interests: u._count.interests,
            quizzes: u._count.quizResults,
            likesReceived: u._count.LikesGot,
            matches: u._count.matchesA + u._count.matchesB
          }
        }));

        return json(res, { users: formattedUsers, total, limit, offset });
      }
    },

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
            orderBy: { queuedAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
              id: true,
              jobName: true,
              status: true,
              trigger: true,
              scope: true,
              algorithmVersion: true,
              queuedAt: true,
              startedAt: true,
              finishedAt: true,
              durationMs: true,
              queueDelayMs: true,
              error: true,
              metadata: true,
              triggeredBy: true
            }
          }),
          prisma.jobRun.count({ where })
        ]);

        return json(res, { runs, total, limit, offset });
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
          where: { 
            OR: [
              { status: 'QUEUED' },
              { status: 'RUNNING' }
            ]
          },
          orderBy: { queuedAt: 'desc' },
          select: {
            id: true,
            jobName: true,
            status: true,
            trigger: true,
            scope: true,
            queuedAt: true,
            startedAt: true,
            triggeredBy: true,
            lastHeartbeatAt: true
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
          // Only count recent jobs
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
            total: recentActivity
          },
          timestamp: new Date().toISOString()
        };

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
        const { getJob } = await import('../../../lib/jobs/shared/registry.js');
        const job = await getJob(jobName);
        if (!job) {
          return json(res, { 
            error: 'Unknown job',
            details: `Job "${jobName}" not found in registry`,
            field: 'jobName',
            retryable: true
          }, 400);
        }

        // Basic parameter validation
        if (parameters && typeof parameters !== 'object') {
          return json(res, {
            error: 'Invalid parameters',
            details: 'Parameters must be a JSON object',
            field: 'parameters',
            retryable: true
          }, 400);
        }

        try {
          // Create job run in QUEUED state
          const jobRun = await prisma.jobRun.create({
            data: {
              jobName,
              status: 'QUEUED',
              trigger: 'MANUAL',
              triggeredBy: req.ctx.userId,
              metadata: {
                params: parameters ?? {}
              } as any,
              queuedAt: new Date()
            }
          });

          return json(res, { jobRunId: jobRun.id.toString(), status: 'queued' }, 202);
        } catch (err) {
          return json(res, {
            error: 'Failed to enqueue job',
            details: err instanceof Error ? err.message : 'Unknown error',
            field: 'parameters',
            retryable: true
          }, 500);
        }
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
        const { getAllJobs, getJobGroups } = await import('../../../lib/jobs/shared/registry.js');
        const jobs = await getAllJobs();
        const groups = await getJobGroups();
        
        const definitions = Object.entries(jobs).map(([name, job]: [string, any]) => ({
          id: name,
          name: job.name,
          description: job.description,
          examples: job.examples,
          defaultParams: job.defaultParams,
          group: job.group,
          dependencies: job.dependencies || []
        }));

        return json(res, { jobs: definitions, groups });
      }
    },

    // Enqueue All Jobs - Enqueue all jobs with dependencies resolved
    {
      id: 'admin.POST./admin/jobs/enqueue-all',
      method: 'POST',
      path: '/admin/jobs/enqueue-all',
      auth: Auth.admin(),
      summary: 'Enqueue all jobs in dependency order',
      tags: ['admin'],
      handler: async (req, res) => {
        try {
          // Use new enqueue API (single source of truth)
          const { enqueueAllJobs } = await import('../../../lib/jobs/enqueue.js');
          const result = await enqueueAllJobs({ triggeredBy: req.ctx.userId });

          const { getAllJobs } = await import('../../../lib/jobs/shared/registry.js');
          const jobs = await getAllJobs();
          const jobNames = Object.keys(jobs);
          
          const enqueuedJobs = result.jobRunIds.map((id, index) => ({
            jobName: jobNames[index] || 'unknown',
            jobRunId: id.toString()
          }));

          return json(res, {
            status: 'enqueued',
            count: enqueuedJobs.length,
            jobs: enqueuedJobs
          }, 202);
        } catch (err) {
          return json(res, {
            error: 'Failed to enqueue jobs',
            details: err instanceof Error ? err.message : 'Unknown error'
          }, 500);
        }
      }
    },

    // Enqueue Jobs by Group - Enqueue all jobs in a specific group with dependencies
    {
      id: 'admin.POST./admin/jobs/enqueue-group',
      method: 'POST',
      path: '/admin/jobs/enqueue-group',
      auth: Auth.admin(),
      summary: 'Enqueue all jobs in a specific group',
      tags: ['admin'],
      handler: async (req, res) => {
        try {
          const group = req.body.group as string;

          if (!group) {
            return json(res, { error: 'Group is required' }, 400);
          }

          // Use new enqueue API (single source of truth)
          const { enqueueJobsByGroup } = await import('../../../lib/jobs/enqueue.js');
          const result = await enqueueJobsByGroup(group as any, { triggeredBy: req.ctx.userId });

          if (result.jobRunIds.length === 0) {
            return json(res, { error: `No jobs found for group: ${group}` }, 404);
          }

          const { getJobsByGroup } = await import('../../../lib/jobs/shared/registry.js');
          const jobs = await getJobsByGroup(group as any);
          
          const enqueuedJobs = result.jobRunIds.map((id, index) => ({
            jobName: jobs[index]?.name || 'unknown',
            jobRunId: id.toString(),
            group
          }));

          return json(res, {
            status: 'enqueued',
            group,
            count: enqueuedJobs.length,
            jobs: enqueuedJobs
          }, 202);
        } catch (err) {
          return json(res, {
            error: 'Failed to enqueue group jobs',
            details: err instanceof Error ? err.message : 'Unknown error'
          }, 500);
        }
      }
    },

    // Clean Up Stalled Jobs - Mark orphaned jobs as failed
    {
      id: 'admin.POST./admin/jobs/cleanup-stalled',
      method: 'POST',
      path: '/admin/jobs/cleanup-stalled',
      auth: Auth.admin(),
      summary: 'Clean up stalled/orphaned jobs',
      tags: ['admin'],
      handler: async (req, res) => {
        const STALLED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
        const threshold = new Date(Date.now() - STALLED_THRESHOLD_MS);
        
        // Find stalled jobs (RUNNING with stale heartbeat or no heartbeat)
        const stalledJobs = await prisma.jobRun.findMany({
          where: {
            status: 'RUNNING',
            OR: [
              { lastHeartbeatAt: { lt: threshold } },
              { lastHeartbeatAt: null }
            ]
          },
          select: { id: true, jobName: true, startedAt: true, lastHeartbeatAt: true }
        });

        // Mark them as FAILED
        const now = new Date();
        for (const job of stalledJobs) {
          await prisma.jobRun.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              finishedAt: now,
              error: 'Job stalled: Manually cleaned up by admin (worker not running or crashed)',
              durationMs: job.startedAt 
                ? Math.max(0, now.getTime() - job.startedAt.getTime())
                : null
            }
          });
        }

        return json(res, { 
          cleaned: stalledJobs.length,
          jobs: stalledJobs.map(j => ({
            id: j.id.toString(),
            jobName: j.jobName,
            startedAt: j.startedAt?.toISOString(),
            lastHeartbeatAt: j.lastHeartbeatAt?.toISOString()
          }))
        });
      }
    },

    // Job Details - Get single job run (MUST be after specific routes)
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

    // Job Logs - Get structured logs for a job run
    {
      id: 'admin.GET./admin/jobs/:jobRunId/logs',
      method: 'GET',
      path: '/admin/jobs/:jobRunId/logs',
      auth: Auth.admin(),
      summary: 'Get job run logs',
      tags: ['admin'],
      handler: async (req, res) => {
        const jobRunId = BigInt(req.params.jobRunId);
        const level = req.query.level as string | undefined;
        const limit = parseInt(req.query.limit as string) || 100;

        const where = {
          jobRunId,
          ...(level && { level })
        };

        const logs = await prisma.jobLog.findMany({
          where,
          orderBy: { timestamp: 'asc' },
          take: limit,
          select: {
            id: true,
            level: true,
            stage: true,
            message: true,
            context: true,
            timestamp: true
          }
        });

        return json(res, { logs });
      }
    },

    // Job Progress - Get current progress for a job run
    {
      id: 'admin.GET./admin/jobs/:jobRunId/progress',
      method: 'GET',
      path: '/admin/jobs/:jobRunId/progress',
      auth: Auth.admin(),
      summary: 'Get job run progress',
      tags: ['admin'],
      handler: async (req, res) => {
        const jobRunId = BigInt(req.params.jobRunId);
        
        const run = await prisma.jobRun.findUnique({
          where: { id: jobRunId },
          select: {
            id: true,
            jobName: true,
            status: true,
            currentStage: true,
            progressCurrent: true,
            progressTotal: true,
            progressPercent: true,
            progressMessage: true,
            entitiesProcessed: true,
            entitiesTotal: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true
          }
        });

        if (!run) {
          return json(res, { error: 'Job run not found' }, 404);
        }

        return json(res, { progress: run });
      }
    },

    // Job Outcome - Get outcome summary for a job run
    {
      id: 'admin.GET./admin/jobs/:jobRunId/outcome',
      method: 'GET',
      path: '/admin/jobs/:jobRunId/outcome',
      auth: Auth.admin(),
      summary: 'Get job run outcome summary',
      tags: ['admin'],
      handler: async (req, res) => {
        const jobRunId = BigInt(req.params.jobRunId);
        
        const run = await prisma.jobRun.findUnique({
          where: { id: jobRunId },
          select: {
            id: true,
            jobName: true,
            status: true,
            outcomeSummary: true,
            entitiesProcessed: true,
            entitiesTotal: true,
            durationMs: true,
            finishedAt: true,
            error: true
          }
        });

        if (!run) {
          return json(res, { error: 'Job run not found' }, 404);
        }

        return json(res, { outcome: run });
      }
    },

    // Worker Management
    {
    id: 'admin.GET./admin/worker/status',
    method: 'GET',
    path: '/admin/worker/status',
    auth: Auth.admin(),
    summary: 'Get worker status and health',
    tags: ['admin'],
    handler: async (req, res) => {
      const { getWorkerInstances, getActiveWorkersCount } = await import('../../../workers/workerManager.js');
      const { getWorkerStatus } = await import('../../../workers/jobWorker.js');
      
      const [instances, activeCount, localStatus] = await Promise.all([
        getWorkerInstances('job_worker'),
        getActiveWorkersCount('job_worker'),
        Promise.resolve(getWorkerStatus())
      ]);

      // Get running workers (with recent heartbeat)
      const now = Date.now();
      const runningWorkers = instances
        .filter((w: any) => w.status === 'RUNNING' && (now - new Date(w.lastHeartbeatAt).getTime()) < 30000)
        .map((w: any) => ({
          id: w.id,
          hostname: w.hostname,
          pid: w.pid,
          startedAt: w.startedAt.toISOString(),
          lastHeartbeatAt: w.lastHeartbeatAt.toISOString(),
          jobsProcessed: w.jobsProcessed,
          uptime: now - new Date(w.startedAt).getTime(),
          metadata: w.metadata as any
        }));

      return json(res, {
        hasActiveWorker: activeCount > 0,
        activeWorkersCount: activeCount,
        localWorkerRunning: localStatus.isRunning,
        workers: runningWorkers,
        recentInstances: instances.slice(0, 10).map((w: any) => ({
          id: w.id,
          status: w.status,
          hostname: w.hostname,
          startedAt: w.startedAt.toISOString(),
          stoppedAt: w.stoppedAt?.toISOString(),
          jobsProcessed: w.jobsProcessed
        }))
      });
    }
  },
  {
    id: 'admin.POST./admin/worker/start',
    method: 'POST',
    path: '/admin/worker/start',
    auth: Auth.admin(),
    summary: 'Start the job worker',
    tags: ['admin'],
    handler: async (req, res) => {
      const { workerLoop, getWorkerStatus } = await import('../../../workers/jobWorker.js');
      const { getActiveWorkersCount } = await import('../../../workers/workerManager.js');

      // Check if already running locally
      const localStatus = getWorkerStatus();
      if (localStatus.isRunning) {
        return json(res, { 
          error: 'Worker is already running in this process',
          localWorkerRunning: true
        }, 400);
      }

      // Check if another worker is running elsewhere
      const activeCount = await getActiveWorkersCount('job_worker');
      if (activeCount > 0) {
        return json(res, { 
          error: 'Another worker instance is already running',
          activeWorkersCount: activeCount
        }, 400);
      }

      // Start worker in background (non-blocking)
      workerLoop().catch((err: Error) => {
        console.error('[admin] Worker crashed:', err);
      });

      // Wait a moment for worker to register
      await new Promise(resolve => setTimeout(resolve, 500));

      return json(res, { 
        message: 'Worker started',
        status: getWorkerStatus()
      });
    }
  },
  {
    id: 'admin.POST./admin/worker/stop',
    method: 'POST',
    path: '/admin/worker/stop',
    auth: Auth.admin(),
    summary: 'Stop the job worker',
    tags: ['admin'],
    handler: async (req, res) => {
      const { stopWorker, getWorkerStatus } = await import('../../../workers/jobWorker.js');

      const localStatus = getWorkerStatus();
      if (!localStatus.isRunning) {
        return json(res, { 
          error: 'Worker is not running in this process',
          localWorkerRunning: false
        }, 400);
      }

      try {
        await stopWorker();
        return json(res, { 
          message: 'Worker stop signal sent',
          status: getWorkerStatus()
        });
      } catch (err) {
        return json(res, { 
          error: err instanceof Error ? err.message : 'Failed to stop worker'
        }, 500);
      }
    }
  },

  // Schedule Management
  {
    id: 'admin.GET./admin/schedules',
    method: 'GET',
    path: '/admin/schedules',
    auth: Auth.admin(),
    summary: 'List all job schedules',
    tags: ['admin', 'schedules'],
    handler: async (req, res) => {
      const { listSchedules } = await import('./handlers/schedules.js');
      return listSchedules(req, res);
    }
  },
  {
    id: 'admin.GET./admin/schedules/:id',
    method: 'GET',
    path: '/admin/schedules/:id',
    auth: Auth.admin(),
    summary: 'Get schedule details',
    tags: ['admin', 'schedules'],
    handler: async (req, res) => {
      const { getSchedule } = await import('./handlers/schedules.js');
      return getSchedule(req, res);
    }
  },
  {
    id: 'admin.PUT./admin/schedules/:id',
    method: 'PUT',
    path: '/admin/schedules/:id',
    auth: Auth.admin(),
    summary: 'Update schedule (enable/disable)',
    tags: ['admin', 'schedules'],
    handler: async (req, res) => {
      const { updateSchedule } = await import('./handlers/schedules.js');
      return updateSchedule(req, res);
    }
  },
  {
    id: 'admin.POST./admin/schedules/:id/trigger',
    method: 'POST',
    path: '/admin/schedules/:id/trigger',
    auth: Auth.admin(),
    summary: 'Manually trigger schedule (run now)',
    tags: ['admin', 'schedules'],
    handler: async (req, res) => {
      const { triggerSchedule } = await import('./handlers/schedules.js');
      return triggerSchedule(req, res);
    }
  },
  {
    id: 'admin.GET./admin/schedules/:id/history',
    method: 'GET',
    path: '/admin/schedules/:id/history',
    auth: Auth.admin(),
    summary: 'Get schedule run history',
    tags: ['admin', 'schedules'],
    handler: async (req, res) => {
      const { getScheduleHistory } = await import('./handlers/schedules.js');
      return getScheduleHistory(req, res);
    }
  }
  ]
};
