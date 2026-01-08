import { Link } from 'react-router-dom';
import { useJobStats } from '../hooks/useJobStats';
import { JobStatsCard } from '../components/JobStatsCard';

export function AdminDashboard() {
  const { stats, loading, refresh } = useJobStats();

  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      
      <div className="dashboard-section">
        <div className="section-header">
          <h2>Job Statistics</h2>
          <button onClick={refresh}>Refresh</button>
        </div>
        <JobStatsCard stats={stats} loading={loading} />
      </div>

      <div className="dashboard-section">
        <h2>Quick Links</h2>
        <nav className="admin-nav">
          <Link to="/admin/jobs/history" className="nav-link">
            Job History
          </Link>
          <Link to="/admin/jobs/monitor" className="nav-link">
            Active Jobs Monitor
          </Link>
        </nav>
      </div>
    </div>
  );
}
