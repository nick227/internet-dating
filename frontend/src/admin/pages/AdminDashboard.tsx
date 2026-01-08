import { useJobStats } from '../hooks/useJobStats';
import { JobStatsCard } from '../components/JobStatsCard';

export function AdminDashboard() {
  const { stats, loading, refresh } = useJobStats();

  return (
    <div className="admin-dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <button onClick={refresh} className="btn-secondary">
          Refresh Stats
        </button>
      </div>
      
      <div className="dashboard-section">
        <h2>Job Statistics</h2>
        <JobStatsCard stats={stats} loading={loading} />
      </div>
    </div>
  );
}
