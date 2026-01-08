import type { JobRun, JobUIStatus } from '../../types';

interface ActiveJobsMonitorProps {
  jobs: JobRun[];
  loading: boolean;
  cancelRequested: Set<string>;
  onCancel: (jobRunId: string) => void;
  onViewDetails: (jobRunId: string) => void;
  onCleanupStalled?: () => void;
}

export function ActiveJobsMonitor({ 
  jobs, 
  loading, 
  cancelRequested, 
  onCancel, 
  onViewDetails,
  onCleanupStalled
}: ActiveJobsMonitorProps) {
  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const secondsAgo = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    return `${Math.floor(secondsAgo / 3600)}h ago`;
  };

  const getJobUIStatus = (job: JobRun): JobUIStatus => {
    if (cancelRequested.has(job.id)) return 'CANCEL_REQUESTED';
    return job.status;
  };

  const getStatusIcon = (status: JobUIStatus) => {
    switch (status) {
      case 'RUNNING': return '◉';
      case 'QUEUED': return '⏸';
      case 'CANCEL_REQUESTED': return '🔄';
      default: return '';
    }
  };

  const getStatusClass = (status: JobUIStatus) => {
    switch (status) {
      case 'RUNNING': return 'running';
      case 'QUEUED': return 'queued';
      case 'CANCEL_REQUESTED': return 'cancelling';
      default: return '';
    }
  };

  // Detect stalled jobs (running > 30 minutes)
  const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  const stalledJobs = jobs.filter(job => {
    if (job.status !== 'RUNNING' || !job.startedAt) return false;
    const elapsed = Date.now() - new Date(job.startedAt).getTime();
    return elapsed > STALL_THRESHOLD_MS;
  });

  if (loading && jobs.length === 0) {
    return (
      <div className="active-jobs-monitor">
        <div className="monitor-header">
          <h2>Active & Queued Jobs</h2>
          <span className="monitor-subtitle">(updates via WebSocket)</span>
        </div>
        <div className="jobs-list loading">Loading active jobs...</div>
      </div>
    );
  }

  return (
    <div className="active-jobs-monitor">
      <div className="monitor-header">
        <h2>Active & Queued Jobs</h2>
        <span className="monitor-subtitle">(updates via WebSocket)</span>
      </div>
      
      {stalledJobs.length > 0 && onCleanupStalled && (
        <div className="alert alert-warning">
          <div className="alert-content">
            <span className="alert-icon">⚠️</span>
            <div className="alert-text">
              <strong>{stalledJobs.length} job(s) may be stalled</strong>
              <span className="alert-detail">
                Running for more than 30 minutes without completion
              </span>
            </div>
          </div>
          <button onClick={onCleanupStalled} className="btn-secondary btn-small">
            Clean Up Stalled
          </button>
        </div>
      )}
      
      <div className="jobs-list">
        {jobs.length === 0 ? (
          <div className="no-jobs">(No active jobs)</div>
        ) : (
          jobs.map(job => {
            const uiStatus = getJobUIStatus(job);
            const isCancelling = uiStatus === 'CANCEL_REQUESTED';
            
            return (
              <div key={job.id} className={`job-card ${getStatusClass(uiStatus)}`}>
                <div className="job-header">
                  <div className="job-title">
                    <span className="status-icon">{getStatusIcon(uiStatus)}</span>
                    <span className="job-name">{job.jobName}</span>
                    <span className="job-id">(#{job.id})</span>
                  </div>
                  <div className="job-actions">
                    <button 
                      onClick={() => onCancel(job.id)} 
                      className="btn-secondary btn-small"
                      disabled={isCancelling || job.status !== 'RUNNING' && job.status !== 'QUEUED'}
                    >
                      {isCancelling ? '⏳ Stopping...' : 'Cancel'}
                    </button>
                    <button onClick={() => onViewDetails(job.id)} className="btn-link">
                      Details
                    </button>
                  </div>
                </div>
                <div className="job-info">
                  {job.status === 'RUNNING' && job.startedAt && (
                    <span>Started: {formatTimeAgo(job.startedAt)}</span>
                  )}
                  {job.status === 'QUEUED' && (
                    <span>Queued: {formatTimeAgo(job.queuedAt)}</span>
                  )}
                  {isCancelling && (
                    <span className="cancel-message">Cancel requested...</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
