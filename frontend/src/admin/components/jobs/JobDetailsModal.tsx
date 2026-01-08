import { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';
import { trackError } from '../../utils/errorTracking';
import type { JobRun } from '../../types';

interface JobDetailsModalProps {
  jobRunId: string;
  onClose: () => void;
  onRerun?: (jobName: string, params: Record<string, unknown>) => void;
  onCancel?: (jobRunId: string) => void;
}

export function JobDetailsModal({ jobRunId, onClose, onRerun, onCancel }: JobDetailsModalProps) {
  const [job, setJob] = useState<JobRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobDetails();
  }, [jobRunId]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getJobRun(jobRunId);
      setJob(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load job details';
      setError(errorMessage);
      trackError(err, {
        action: 'loadJobDetails',
        component: 'JobDetailsModal',
        jobRunId
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return '✓';
      case 'FAILED': return '✗';
      case 'CANCELLED': return '⊗';
      case 'RUNNING': return '◉';
      case 'QUEUED': return '⏸';
      default: return '';
    }
  };

  const handleRerun = () => {
    const confirm = window.confirm('Are you sure you want to re-run this job?');
    if (!confirm) return;
    if (job && onRerun) {
      onRerun(job.jobName, job.metadata || {});
      onClose();
    }
  };

  const handleCancel = () => {
    const confirm = window.confirm('Are you sure you want to cancel this job?');
    if (!confirm) return;
    if (onCancel) {
      onCancel(jobRunId);
    }
  };

  const copyJobId = () => {
    navigator.clipboard.writeText(jobRunId);
  };

  // Truncate large metadata
  const displayMetadata = (metadata: Record<string, unknown>) => {
    const jsonString = JSON.stringify(metadata, null, 2);
    if (jsonString.length > 5000) {
      return '(Metadata too large to display - ' + Math.floor(jsonString.length / 1024) + 'KB)';
    }
    return jsonString;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content job-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Job Run Details{job && `: ${job.jobName} (#${job.id})`}</h2>
          <button onClick={onClose} className="btn-icon close-btn">✕</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading">Loading job details...</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : job ? (
            <div className="job-details">
              <div className="detail-section">
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className={`detail-value status-${job.status.toLowerCase()}`}>
                    {getStatusIcon(job.status)} {job.status}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Trigger:</span>
                  <span className="detail-value">{job.trigger}</span>
                </div>
                {job.triggeredBy && (
                  <div className="detail-row">
                    <span className="detail-label">Triggered By:</span>
                    <span className="detail-value">{job.triggeredBy}</span>
                  </div>
                )}
                {job.algorithmVersion && (
                  <div className="detail-row">
                    <span className="detail-label">Algorithm:</span>
                    <span className="detail-value">{job.algorithmVersion}</span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h3>Timeline</h3>
                <div className="detail-row">
                  <span className="detail-label">Queued:</span>
                  <span className="detail-value">{formatTimestamp(job.queuedAt)}</span>
                </div>
                {job.startedAt && (
                  <div className="detail-row">
                    <span className="detail-label">Started:</span>
                    <span className="detail-value">
                      {formatTimestamp(job.startedAt)}
                      {job.queueDelayMs && ` (delay: ${formatDuration(job.queueDelayMs)})`}
                    </span>
                  </div>
                )}
                {job.finishedAt && (
                  <div className="detail-row">
                    <span className="detail-label">Finished:</span>
                    <span className="detail-value">
                      {formatTimestamp(job.finishedAt)}
                      {job.durationMs && ` (duration: ${formatDuration(job.durationMs)})`}
                    </span>
                  </div>
                )}
              </div>

              {job.metadata && Object.keys(job.metadata).length > 0 && (
                <div className="detail-section">
                  <h3>Parameters / Metadata</h3>
                  <pre className="metadata-json">
                    {displayMetadata(job.metadata)}
                  </pre>
                </div>
              )}

              {job.error && (
                <div className="detail-section error-section">
                  <h3>Error</h3>
                  <pre className="error-message">{job.error}</pre>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button onClick={copyJobId} className="btn-secondary">
            Copy Run ID
          </button>
          {job && onRerun && (
            <button onClick={handleRerun} className="btn-secondary">
              Re-run Job
            </button>
          )}
          {job && (job.status === 'RUNNING' || job.status === 'QUEUED') && onCancel && (
            <button onClick={handleCancel} className="btn-danger">
              Cancel
            </button>
          )}
          <button onClick={onClose} className="btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
