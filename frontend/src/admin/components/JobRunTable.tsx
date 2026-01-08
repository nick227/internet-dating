import { JobStatusBadge } from './JobStatusBadge';
import type { JobRun } from '../types';

interface JobRunTableProps {
  runs: JobRun[];
  onRowClick?: (run: JobRun) => void;
  loading?: boolean;
  showStaleIndicator?: boolean;
}

export function JobRunTable({ runs, onRowClick, loading, showStaleIndicator }: JobRunTableProps) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const isStale = (run: JobRun): boolean => {
    if (run.status !== 'RUNNING') return false;
    if (!run.lastHeartbeatAt) return true;
    const lastHeartbeat = new Date(run.lastHeartbeatAt).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastHeartbeat < fiveMinutesAgo;
  };

  const formatHeartbeat = (dateStr?: string): string => {
    if (!dateStr) return 'No heartbeat';
    const timestamp = new Date(dateStr).getTime();
    const minutesAgo = Math.floor((Date.now() - timestamp) / 60000);
    if (minutesAgo < 1) return 'Just now';
    if (minutesAgo === 1) return '1 min ago';
    return `${minutesAgo} mins ago`;
  };

  if (loading) {
    return <div className="job-run-table-loading">Loading jobs...</div>;
  }

  if (runs.length === 0) {
    return <div className="job-run-table-empty">No jobs found</div>;
  }

  return (
    <div className="job-run-table">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Job Name</th>
            <th>Status</th>
            <th>Queued At</th>
            <th>Started At</th>
            {showStaleIndicator && <th>Heartbeat</th>}
            <th>Duration</th>
            <th>Trigger</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const stale = showStaleIndicator && isStale(run);
            return (
              <tr
                key={run.id}
                onClick={() => onRowClick?.(run)}
                className={`${onRowClick ? 'clickable' : ''} ${stale ? 'stale-job' : ''}`}
              >
                <td>{run.id}</td>
                <td>
                  {run.jobName}
                  {stale && <span className="stale-indicator" title="Stalled job - no heartbeat">⚠️</span>}
                </td>
                <td><JobStatusBadge status={run.status} /></td>
                <td>{formatDate(run.queuedAt)}</td>
                <td>{formatDate(run.startedAt)}</td>
                {showStaleIndicator && (
                  <td className={stale ? 'stale-heartbeat' : ''}>
                    {formatHeartbeat(run.lastHeartbeatAt)}
                  </td>
                )}
                <td>{formatDuration(run.durationMs)}</td>
                <td>{run.trigger}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
