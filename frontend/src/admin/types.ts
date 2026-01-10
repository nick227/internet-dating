export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export type JobRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export type JobUIStatus = JobRunStatus | 'CANCEL_REQUESTED';

export type JobTrigger = 'CRON' | 'EVENT' | 'MANUAL';

export interface JobRun {
  id: string;
  jobName: string;
  status: JobRunStatus;
  trigger: JobTrigger;
  scope?: string;
  algorithmVersion?: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  queueDelayMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  triggeredBy?: string;
  lastHeartbeatAt?: string;
}

export type JobGroup = 'matching' | 'feed' | 'search' | 'maintenance' | 'media' | 'quiz';

export interface JobDefinition {
  id: string;
  name: string;
  description: string;
  examples: string[];
  defaultParams?: Record<string, unknown>;
  group?: JobGroup;
  dependencies?: string[];
}

export interface JobStats {
  active: number;
  queued: number;
  last24h: {
    total: number;
  };
  timestamp: string;
}

export interface JobHistoryResponse {
  runs: JobRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActiveJobsResponse {
  runs: JobRun[];
}

export interface JobDefinitionsResponse {
  jobs: JobDefinition[];
  groups: JobGroup[];
}

export interface EnqueueAllJobsResponse {
  status: string;
  count: number;
  jobs: Array<{
    jobName: string;
    jobRunId: string;
  }>;
}

export interface EnqueueGroupJobsResponse {
  status: string;
  group: string;
  count: number;
  jobs: Array<{
    jobName: string;
    jobRunId: string;
    group?: string;
  }>;
}

export interface EnqueueJobResponse {
  jobRunId: string;
  status: string;
}

export interface CancelJobResponse {
  status: string;
}

export interface ApiError {
  error: string;
  details?: string;
  field?: string;
  retryable?: boolean;
}

// Schedule types
export type ScheduleExecutionMode = 'ALL_JOBS' | 'GROUP';

export interface JobSchedule {
  // From code definitions
  id: string;
  name: string;
  description: string;
  cron: string;
  timezone: string;
  executionMode: ScheduleExecutionMode;
  jobGroup?: JobGroup;
  
  // From database (runtime state)
  enabled: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  failureCount: number;
  lastRun: {
    id: string;
    status: JobRunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
  } | null;
}

export interface SchedulesResponse {
  schedules: JobSchedule[];
}

export interface ScheduleUpdateRequest {
  enabled: boolean;
}

export interface ScheduleHistoryResponse {
  runs: JobRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface WorkerInstance {
  id: string;
  hostname?: string;
  pid?: number;
  startedAt: string;
  lastHeartbeatAt: string;
  jobsProcessed: number;
  uptime: number;
  version?: string;
  metadata?: {
    version?: string;
    nodeVersion?: string;
    platform?: string;
    arch?: string;
  };
}

export interface WorkerStatus {
  hasActiveWorker: boolean;
  activeWorkersCount: number;
  localWorkerRunning: boolean;
  workers: WorkerInstance[];
  recentInstances: Array<{
    id: string;
    status: string;
    hostname?: string;
    startedAt: string;
    stoppedAt?: string;
    jobsProcessed: number;
  }>;
}

export interface DaemonStatus {
  daemonRunning: boolean;
  daemon: {
    id: string;
    hostname: string;
    pid: number;
    startedAt: string;
    lastHeartbeatAt: string;
    uptime: number;
    metadata?: {
      version?: string;
      nodeVersion?: string;
      platform?: string;
      arch?: string;
    };
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

export interface JobWebSocketEvent {
  type: 'server.admin.job_started' | 'server.admin.job_progress' | 'server.admin.job_completed';
  data: {
    jobRunId: string;
    jobName: string;
    status?: 'SUCCESS' | 'FAILED' | 'CANCELLED';
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    error?: string;
    progressPercent?: number;
    progressMessage?: string;
    triggeredBy?: string;
  };
  ts: number;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  profile: {
    displayName: string | null;
    location: string | null;
    age: number | null;
    gender: string | null;
    avatarUrl: string | undefined;
  } | null;
  stats: {
    posts: number;
    interests: number;
    quizzes: number;
    likesReceived: number;
    matches: number;
  };
}

export interface UserListResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}
