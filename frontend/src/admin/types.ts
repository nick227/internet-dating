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

export interface JobDefinition {
  id: string;
  name: string;
  description: string;
  examples: string[];
  defaultParams?: Record<string, unknown>;
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

export interface WorkerInstance {
  id: string;
  hostname?: string;
  pid?: number;
  startedAt: string;
  lastHeartbeatAt: string;
  jobsProcessed: number;
  uptime: number;
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
