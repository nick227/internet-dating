import type { JobStats } from '../../types';

interface JobStatsOverviewProps {
  stats: JobStats | null;
  loading: boolean;
  onRefresh: () => void;
  onCleanupStalled: () => void;
  wsConnected?: boolean;
}

export function JobStatsOverview({ stats, loading, onRefresh, onCleanupStalled, wsConnected }: JobStatsOverviewProps) {
  if (loading) {
    return (
      <div className="job-stats-overview">
        <div className="stats-header">
          <h2>Job Statistics</h2>
        </div>
        <div className="stats-content loading">Loading stats...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="job-stats-overview">
        <div className="stats-header">
          <h2>Job Statistics</h2>
          <button onClick={onRefresh} className="btn-secondary">
            Refresh
          </button>
        </div>
        <div className="stats-content error">Failed to load stats</div>
      </div>
    );
  }

  const updatedAgo = new Date(stats.timestamp);
  const secondsAgo = Math.floor((Date.now() - updatedAgo.getTime()) / 1000);
  const timeAgo = secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <div className="job-stats-overview">
      <div className="stats-header">
        <h2>Job Statistics</h2>
        <div className="header-actions">
          {wsConnected !== undefined && (
            <div className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`}>
              <span className="status-dot">●</span>
              <span className="status-text">{wsConnected ? 'Live' : 'Reconnecting...'}</span>
            </div>
          )}
          <button onClick={onRefresh} className="btn-secondary" disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      <div className="stats-content">
        <div className="stat-item">
          <div className="stat-icon running">◉</div>
          <div className="stat-details">
            <div className="stat-label">Active</div>
            <div className="stat-value">{stats.active}</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-icon queued">⏸</div>
          <div className="stat-details">
            <div className="stat-label">Queued</div>
            <div className="stat-value">{stats.queued}</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="stat-icon success">✓</div>
          <div className="stat-details">
            <div className="stat-label">Last 24h</div>
            <div className="stat-value">{stats.last24h.total}</div>
          </div>
        </div>
      </div>
      <div className="stats-footer">
        <button onClick={onCleanupStalled} className="btn-secondary btn-small">
          Clean Up Stalled Jobs
        </button>
        <span className="update-time">Updated: {timeAgo}</span>
      </div>
    </div>
  );
}
