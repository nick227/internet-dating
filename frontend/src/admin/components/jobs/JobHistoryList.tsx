import { useState } from 'react';
import type { JobRun, JobRunStatus } from '../../types';

interface JobHistoryListProps {
  runs: JobRun[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  filters: {
    jobName?: string;
    status?: JobRunStatus;
  };
  onPageChange: (page: number) => void;
  onFilterChange: (filters: { jobName?: string; status?: JobRunStatus }) => void;
  onViewDetails: (jobRunId: string) => void;
  onRunNewJob: () => void;
}

export function JobHistoryList({
  runs,
  total,
  loading,
  page,
  pageSize,
  filters,
  onPageChange,
  onFilterChange,
  onViewDetails,
  onRunNewJob
}: JobHistoryListProps) {
  const [jobNameFilter, setJobNameFilter] = useState(filters.jobName || '');
  const [statusFilter, setStatusFilter] = useState(filters.status || '');

  const handleFilterChange = () => {
    onFilterChange({
      jobName: jobNameFilter || undefined,
      status: statusFilter as JobRunStatus | undefined
    });
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const secondsAgo = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
    return `${Math.floor(secondsAgo / 86400)}d ago`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getStatusIcon = (status: JobRunStatus) => {
    switch (status) {
      case 'SUCCESS': return '✓';
      case 'FAILED': return '✗';
      case 'CANCELLED': return '⊗';
      case 'RUNNING': return '◉';
      case 'QUEUED': return '⏸';
    }
  };

  const getStatusClass = (status: JobRunStatus) => {
    return status.toLowerCase();
  };

  const totalPages = Math.ceil(total / pageSize);
  const startIndex = page * pageSize + 1;
  const endIndex = Math.min((page + 1) * pageSize, total);

  return (
    <div className="job-history-list">
      <div className="history-header">
        <h2>Job History</h2>
        <button onClick={onRunNewJob} className="btn-primary">
          Run New Job
        </button>
      </div>
      
      <div className="history-filters">
        <input
          type="text"
          placeholder="Filter by job name..."
          value={jobNameFilter}
          onChange={(e) => setJobNameFilter(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleFilterChange()}
          className="filter-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            onFilterChange({
              jobName: jobNameFilter || undefined,
              status: e.target.value as JobRunStatus | undefined
            });
          }}
          className="filter-select"
        >
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="RUNNING">Running</option>
          <option value="QUEUED">Queued</option>
        </select>
        <button onClick={handleFilterChange} className="btn-secondary">
          Apply
        </button>
      </div>

      {loading ? (
        <div className="history-content loading">Loading history...</div>
      ) : runs.length === 0 ? (
        <div className="history-content empty">No job runs found</div>
      ) : (
        <>
          <div className="history-content">
            {runs.map(run => (
              <div key={run.id} className={`history-item ${getStatusClass(run.status)}`}>
                <div className="item-header">
                  <div className="item-title">
                    <span className={`status-icon ${getStatusClass(run.status)}`}>
                      {getStatusIcon(run.status)}
                    </span>
                    <span className="job-name">{run.jobName}</span>
                    <span className="job-id">(#{run.id})</span>
                  </div>
                  <button onClick={() => onViewDetails(run.id)} className="btn-link">
                    Details
                  </button>
                </div>
                <div className="item-info">
                  <span className="trigger">{run.trigger}</span>
                  {run.durationMs && (
                    <>
                      <span className="separator">•</span>
                      <span className="duration">{formatDuration(run.durationMs)}</span>
                    </>
                  )}
                  {run.finishedAt && (
                    <>
                      <span className="separator">•</span>
                      <span className="time">Finished: {formatTimeAgo(run.finishedAt)}</span>
                    </>
                  )}
                </div>
                {run.error && (
                  <div className="item-error">
                    Error: {run.error.length > 100 ? run.error.substring(0, 100) + '...' : run.error}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="history-pagination">
            <div className="pagination-info">
              Showing {startIndex}-{endIndex} of {total}
            </div>
            <div className="pagination-controls">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 0}
                className="btn-secondary btn-small"
              >
                ← Prev
              </button>
              <span className="page-indicator">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="btn-secondary btn-small"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
