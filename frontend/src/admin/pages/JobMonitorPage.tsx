import { useNavigate } from 'react-router-dom';
import { useActiveJobs } from '../hooks/useActiveJobs';
import { useJobWebSocket } from '../hooks/useJobWebSocket';
import { JobRunTable } from '../components/JobRunTable';
import type { JobRun } from '../types';

export function JobMonitorPage() {
  const navigate = useNavigate();
  const { runs, loading, error, refresh } = useActiveJobs(false); // Disable auto-refresh, use WebSocket instead

  // Listen for WebSocket events
  useJobWebSocket({
    onJobStarted: () => {
      console.log('[JobMonitor] Job started, refreshing...');
      refresh();
    },
    onJobCompleted: () => {
      console.log('[JobMonitor] Job completed, refreshing...');
      refresh();
    }
  });

  const handleRowClick = (run: JobRun) => {
    navigate(`/admin/jobs/${run.id}`);
  };

  return (
    <div className="admin-page job-monitor-page">
      <div className="page-header">
        <h1>Active Jobs Monitor</h1>
        <button onClick={refresh}>Refresh</button>
      </div>

      <p className="page-description">
        Real-time monitoring of queued and running jobs. Updates automatically via WebSocket.
      </p>

      {error && <div className="error-message">{error.message}</div>}

      {!loading && runs.length === 0 && (
        <div className="no-jobs-message">
          No active jobs at the moment.
        </div>
      )}

      <JobRunTable runs={runs} onRowClick={handleRowClick} loading={loading} />
    </div>
  );
}
