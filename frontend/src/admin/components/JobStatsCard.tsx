import type { JobStats } from '../types';

interface JobStatsCardProps {
  stats: JobStats | null;
  loading: boolean;
}

export function JobStatsCard({ stats, loading }: JobStatsCardProps) {
  if (loading) {
    return <div className="job-stats-card loading">Loading stats...</div>;
  }

  if (!stats) {
    return <div className="job-stats-card error">Failed to load stats</div>;
  }

  return (
    <div className="job-stats-card">
      <div className="stat-item">
        <div className="stat-label">Active</div>
        <div className="stat-value">{stats.active}</div>
      </div>
      <div className="stat-item">
        <div className="stat-label">Queued</div>
        <div className="stat-value">{stats.queued}</div>
      </div>
      <div className="stat-item">
        <div className="stat-label">Last 24h</div>
        <div className="stat-value">{stats.last24h.total}</div>
      </div>
    </div>
  );
}
