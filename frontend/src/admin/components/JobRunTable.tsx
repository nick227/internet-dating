import { JobStatusBadge } from './JobStatusBadge';
import type { JobRun } from '../types';

interface JobRunTableProps {
  runs: JobRun[];
  onRowClick?: (run: JobRun) => void;
  loading?: boolean;
}

export function JobRunTable({ runs, onRowClick, loading }: JobRunTableProps) {
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
            <th>Duration</th>
            <th>Trigger</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              onClick={() => onRowClick?.(run)}
              className={onRowClick ? 'clickable' : ''}
            >
              <td>{run.id}</td>
              <td>{run.jobName}</td>
              <td><JobStatusBadge status={run.status} /></td>
              <td>{formatDate(run.queuedAt)}</td>
              <td>{formatDate(run.startedAt)}</td>
              <td>{formatDuration(run.durationMs)}</td>
              <td>{run.trigger}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
