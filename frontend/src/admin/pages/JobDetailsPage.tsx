import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { JobStatusBadge } from '../components/JobStatusBadge';
import type { JobRun } from '../types';

export function JobDetailsPage() {
  const { jobRunId } = useParams<{ jobRunId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadJob = async () => {
    if (!jobRunId) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getJobRun(jobRunId);
      setJob(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load job'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
  }, [jobRunId]);

  const handleCancel = async () => {
    if (!jobRunId || !job) return;
    
    if (!confirm('Are you sure you want to cancel this job?')) return;
    
    try {
      setCancelling(true);
      await adminApi.cancelJob(jobRunId);
      await loadJob();
    } catch (err) {
      alert('Failed to cancel job: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  if (loading) {
    return <div className="admin-page">Loading job details...</div>;
  }

  if (error || !job) {
    return (
      <div className="admin-page">
        <div className="error-message">{error?.message || 'Job not found'}</div>
        <button onClick={() => navigate('/admin/jobs/history')}>Back to History</button>
      </div>
    );
  }

  const canCancel = job.status === 'QUEUED' || job.status === 'RUNNING';

  return (
    <div className="admin-page job-details-page">
      <div className="page-header">
        <h1>Job Details</h1>
        <div className="actions">
          {canCancel && (
            <button onClick={handleCancel} disabled={cancelling} className="btn-danger">
              {cancelling ? 'Cancelling...' : 'Cancel Job'}
            </button>
          )}
          <button onClick={() => navigate('/admin/jobs/history')}>Back</button>
        </div>
      </div>

      <div className="job-details">
        <div className="detail-row">
          <span className="label">Job ID:</span>
          <span className="value">{job.id}</span>
        </div>
        <div className="detail-row">
          <span className="label">Job Name:</span>
          <span className="value">{job.jobName}</span>
        </div>
        <div className="detail-row">
          <span className="label">Status:</span>
          <span className="value"><JobStatusBadge status={job.status} /></span>
        </div>
        <div className="detail-row">
          <span className="label">Trigger:</span>
          <span className="value">{job.trigger}</span>
        </div>
        <div className="detail-row">
          <span className="label">Queued At:</span>
          <span className="value">{formatDate(job.queuedAt)}</span>
        </div>
        <div className="detail-row">
          <span className="label">Started At:</span>
          <span className="value">{formatDate(job.startedAt)}</span>
        </div>
        <div className="detail-row">
          <span className="label">Finished At:</span>
          <span className="value">{formatDate(job.finishedAt)}</span>
        </div>
        <div className="detail-row">
          <span className="label">Queue Delay:</span>
          <span className="value">{formatDuration(job.queueDelayMs)}</span>
        </div>
        <div className="detail-row">
          <span className="label">Duration:</span>
          <span className="value">{formatDuration(job.durationMs)}</span>
        </div>
        {job.triggeredBy && (
          <div className="detail-row">
            <span className="label">Triggered By:</span>
            <span className="value">{job.triggeredBy}</span>
          </div>
        )}
        {job.scope && (
          <div className="detail-row">
            <span className="label">Scope:</span>
            <span className="value">{job.scope}</span>
          </div>
        )}
        {job.algorithmVersion && (
          <div className="detail-row">
            <span className="label">Algorithm Version:</span>
            <span className="value">{job.algorithmVersion}</span>
          </div>
        )}
        {job.lastHeartbeatAt && (
          <div className="detail-row">
            <span className="label">Last Heartbeat:</span>
            <span className="value">{formatDate(job.lastHeartbeatAt)}</span>
          </div>
        )}
        {job.metadata && (
          <div className="detail-row">
            <span className="label">Metadata:</span>
            <pre className="value">{JSON.stringify(job.metadata, null, 2)}</pre>
          </div>
        )}
        {job.error && (
          <div className="detail-row error">
            <span className="label">Error:</span>
            <pre className="value error-text">{job.error}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
