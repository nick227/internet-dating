import { useState, useEffect } from 'react';
import { adminApi } from '../../api/admin';
import type { WorkerStatus } from '../../types';

interface WorkerControlProps {
  onStatusChange?: (hasActiveWorker: boolean) => void;
}

export function WorkerControl({ onStatusChange }: WorkerControlProps) {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadStatus = async () => {
    try {
      const workerStatus = await adminApi.getWorkerStatus();
      setStatus(workerStatus);
      setError(null);
      onStatusChange?.(workerStatus.hasActiveWorker);
    } catch (err) {
      console.error('Failed to load worker status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load worker status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(loadStatus, 5000); // Refresh every 5 seconds
    return () => clearInterval(timer);
  }, [autoRefresh]);

  const handleStart = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await adminApi.startWorker();
      setTimeout(loadStatus, 500); // Wait a moment before refreshing
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start worker';
      setError(errorMsg);
      alert(`Error: ${errorMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!confirm('Are you sure you want to stop the worker? Running jobs will be marked as stalled.')) {
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await adminApi.stopWorker();
      setTimeout(loadStatus, 500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop worker';
      setError(errorMsg);
      alert(`Error: ${errorMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="worker-control">
        <h3>Job Worker Status</h3>
        <p className="status-loading">Loading...</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="worker-control">
        <h3>Job Worker Status</h3>
        <p className="status-error">Failed to load worker status</p>
      </div>
    );
  }

  const hasActiveWorker = status.hasActiveWorker;
  const activeWorker = status.workers[0];

  return (
    <div className="worker-control">
      <div className="worker-header">
        <h3>Job Worker</h3>
        <div className="worker-actions">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={loadStatus} className="btn-secondary" disabled={actionLoading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="worker-status-card">
        <div className="status-row">
          <div className="status-indicator">
            <span className={`status-badge ${hasActiveWorker ? 'running' : 'stopped'}`}>
              {hasActiveWorker ? '● RUNNING' : '○ STOPPED'}
            </span>
            {status.activeWorkersCount > 1 && (
              <span className="warning-badge">
                ⚠ {status.activeWorkersCount} workers detected
              </span>
            )}
          </div>

          <div className="worker-controls">
            {hasActiveWorker ? (
              <>
                {status.localWorkerRunning && (
                  <button
                    onClick={handleStop}
                    className="btn-danger"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Stopping...' : 'Stop Worker'}
                  </button>
                )}
                {!status.localWorkerRunning && (
                  <span className="external-worker-note">
                    Running elsewhere (PID: {activeWorker?.pid})
                  </span>
                )}
              </>
            ) : (
              <button
                onClick={handleStart}
                className="btn-primary"
                disabled={actionLoading}
              >
                {actionLoading ? 'Starting...' : 'Start Worker'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {hasActiveWorker && activeWorker && (
          <div className="worker-details">
            <div className="detail-row">
              <span className="label">Hostname:</span>
              <span className="value">{activeWorker.hostname || 'Unknown'}</span>
            </div>
            <div className="detail-row">
              <span className="label">PID:</span>
              <span className="value">{activeWorker.pid || 'Unknown'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Version:</span>
              <span className="value version-badge">
                {(activeWorker as any).version || (activeWorker as any).metadata?.version || 'Unknown'}
              </span>
            </div>
            <div className="detail-row">
              <span className="label">Started:</span>
              <span className="value">{new Date(activeWorker.startedAt).toLocaleString()}</span>
            </div>
            <div className="detail-row">
              <span className="label">Uptime:</span>
              <span className="value">{formatUptime(activeWorker.uptime)}</span>
            </div>
            <div className="detail-row">
              <span className="label">Jobs Processed:</span>
              <span className="value">{activeWorker.jobsProcessed}</span>
            </div>
            <div className="detail-row">
              <span className="label">Last Heartbeat:</span>
              <span className="value">{formatRelativeTime(activeWorker.lastHeartbeatAt)}</span>
            </div>
          </div>
        )}

        {!hasActiveWorker && (
          <div className="worker-stopped-message">
            <p>⚠ No worker is currently running. Enqueued jobs will not be processed.</p>
            <p className="helper-text">
              Start the worker above or run manually: <code>pnpm worker:jobs</code>
            </p>
          </div>
        )}
      </div>

      {status.recentInstances.length > 0 && (
        <details className="recent-workers">
          <summary>Recent Worker History ({status.recentInstances.length})</summary>
          <div className="worker-history-list">
            {status.recentInstances.map((instance) => (
              <div key={instance.id} className="history-item">
                <span className={`history-status ${instance.status.toLowerCase()}`}>
                  {instance.status}
                </span>
                <span className="history-hostname">{instance.hostname || 'Unknown'}</span>
                <span className="history-time">
                  {new Date(instance.startedAt).toLocaleString()}
                </span>
                <span className="history-jobs">{instance.jobsProcessed} jobs</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatRelativeTime(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(ms / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
