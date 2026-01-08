import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useActiveJobs } from '../hooks/useActiveJobs';
import { useJobWebSocket } from '../hooks/useJobWebSocket';
import { JobRunTable } from '../components/JobRunTable';
import { adminApi } from '../api/admin';
import type { JobRun } from '../types';

export function JobMonitorPage() {
  const navigate = useNavigate();
  const { runs, loading, error, refresh } = useActiveJobs(false); // Disable auto-refresh, use WebSocket instead
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

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

  const handleCleanupStalled = async () => {
    if (!confirm('Clean up stalled jobs? This will mark jobs with no heartbeat as FAILED.')) {
      return;
    }

    setCleaning(true);
    setCleanupMessage(null);

    try {
      const result = await adminApi.cleanupStalledJobs();
      if (result.cleaned > 0) {
        setCleanupMessage(`Cleaned up ${result.cleaned} stalled job(s)`);
        refresh();
      } else {
        setCleanupMessage('No stalled jobs found');
      }
    } catch (err) {
      setCleanupMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCleaning(false);
    }
  };

  // Check for stalled jobs (no heartbeat in last 5 minutes)
  const stalledCount = runs.filter(run => {
    if (!run.lastHeartbeatAt) return true;
    const lastHeartbeat = new Date(run.lastHeartbeatAt).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastHeartbeat < fiveMinutesAgo;
  }).length;

  return (
    <div className="admin-page job-monitor-page">
      <div className="page-header">
        <h1>Active Jobs Monitor</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={refresh} disabled={loading}>
            Refresh
          </button>
          {stalledCount > 0 && (
            <button 
              onClick={handleCleanupStalled} 
              disabled={cleaning}
              className="btn-warning"
            >
              {cleaning ? 'Cleaning...' : `Clean Up ${stalledCount} Stalled`}
            </button>
          )}
        </div>
      </div>

      <p className="page-description">
        Real-time monitoring of queued and running jobs. Updates automatically via WebSocket.
      </p>

      {stalledCount > 0 && (
        <div className="warning-banner">
          ⚠️ <strong>{stalledCount} stalled job(s) detected</strong> - No heartbeat in last 5 minutes. 
          These jobs may be orphaned (worker crashed or not running).
        </div>
      )}

      {cleanupMessage && (
        <div className="info-banner">
          {cleanupMessage}
        </div>
      )}

      {error && <div className="error-message">{error.message}</div>}

      {!loading && runs.length === 0 && (
        <div className="no-jobs-message">
          No active jobs at the moment.
        </div>
      )}

      <JobRunTable runs={runs} onRowClick={handleRowClick} loading={loading} showStaleIndicator />
    </div>
  );
}
