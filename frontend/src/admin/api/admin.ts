import { http } from '../../api/http';
import type {
  JobHistoryResponse,
  ActiveJobsResponse,
  JobStats,
  JobDefinitionsResponse,
  EnqueueJobResponse,
  CancelJobResponse,
  JobRun,
  EnqueueAllJobsResponse,
  EnqueueGroupJobsResponse,
  JobGroup
} from '../types';

export const adminApi = {
  // Get job history with filters
  async getJobHistory(params?: {
    limit?: number;
    offset?: number;
    jobName?: string;
    status?: string;
  }): Promise<JobHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.jobName) searchParams.set('jobName', params.jobName);
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return http(`/api/admin/jobs/history${query ? `?${query}` : ''}`, 'GET');
  },

  // Get single job run details
  async getJobRun(jobRunId: string): Promise<JobRun> {
    return http(`/api/admin/jobs/${jobRunId}`, 'GET');
  },

  // Get active jobs
  async getActiveJobs(): Promise<ActiveJobsResponse> {
    return http('/api/admin/jobs/active', 'GET');
  },

  // Get job statistics
  async getJobStats(): Promise<JobStats> {
    return http('/api/admin/jobs/stats', 'GET');
  },

  // Enqueue a job
  async enqueueJob(jobName: string, parameters?: Record<string, unknown>): Promise<EnqueueJobResponse> {
    return http('/api/admin/jobs/enqueue', 'POST', { body: { jobName, parameters } });
  },

  // Cancel a job
  async cancelJob(jobRunId: string): Promise<CancelJobResponse> {
    return http(`/api/admin/jobs/${jobRunId}/cancel`, 'POST', { body: {} });
  },

  // Get available job definitions
  async getJobDefinitions(): Promise<JobDefinitionsResponse> {
    return http('/api/admin/jobs/definitions', 'GET');
  },

  // Enqueue all jobs
  async enqueueAllJobs(): Promise<EnqueueAllJobsResponse> {
    return http('/api/admin/jobs/enqueue-all', 'POST', { body: {} });
  },

  // Enqueue jobs by group
  async enqueueJobsByGroup(group: JobGroup): Promise<EnqueueGroupJobsResponse> {
    return http('/api/admin/jobs/enqueue-group', 'POST', { body: { group } });
  },

  // Clean up stalled jobs
  async cleanupStalledJobs(): Promise<{
    cleaned: number;
    jobs: Array<{
      id: string;
      jobName: string;
      startedAt?: string;
      lastHeartbeatAt?: string;
    }>;
  }> {
    return http('/api/admin/jobs/cleanup-stalled', 'POST', { body: {} });
  },

  // Worker Management
  async getWorkerStatus(): Promise<import('../types').WorkerStatus> {
    return http('/api/admin/worker/status', 'GET');
  },

  async startWorker(): Promise<{ message: string }> {
    return http('/api/admin/worker/start', 'POST', { body: {} });
  },

  async stopWorker(): Promise<{ message: string }> {
    return http('/api/admin/worker/stop', 'POST', { body: {} });
  }
};
