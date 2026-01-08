import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobHistory } from '../hooks/useJobHistory';
import { JobRunTable } from '../components/JobRunTable';
import { JobTriggerModal } from '../components/JobTriggerModal';
import { adminApi } from '../api/admin';
import type { JobDefinition, JobRun } from '../types';

export function JobHistoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    jobName: '',
    status: '',
    limit: 50,
    offset: 0
  });
  const [definitions, setDefinitions] = useState<JobDefinition[]>([]);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  
  const { runs, total, loading, error, refresh } = useJobHistory(filters);

  useEffect(() => {
    // Load job definitions
    adminApi.getJobDefinitions()
      .then(response => setDefinitions(response.jobs))
      .catch(err => console.error('Failed to load job definitions:', err));
  }, []);

  const handleTriggerJob = async (jobName: string, parameters?: Record<string, unknown>) => {
    await adminApi.enqueueJob(jobName, parameters);
    refresh();
  };

  const handleRowClick = (run: JobRun) => {
    navigate(`/admin/jobs/${run.id}`);
  };

  const handleNextPage = () => {
    setFilters(prev => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  const handlePrevPage = () => {
    setFilters(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
  };

  return (
    <div className="admin-page job-history-page">
      <div className="page-header">
        <h1>Job History</h1>
        <button onClick={() => setShowTriggerModal(true)}>
          Trigger Job
        </button>
      </div>

      <div className="filters">
        <select 
          value={filters.status} 
          onChange={(e) => setFilters({ ...filters, status: e.target.value, offset: 0 })}
        >
          <option value="">All Statuses</option>
          <option value="QUEUED">Queued</option>
          <option value="RUNNING">Running</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select 
          value={filters.jobName} 
          onChange={(e) => setFilters({ ...filters, jobName: e.target.value, offset: 0 })}
        >
          <option value="">All Jobs</option>
          {definitions.map((def) => (
            <option key={def.id} value={def.id}>{def.name}</option>
          ))}
        </select>

        <button onClick={refresh}>Refresh</button>
      </div>

      {error && <div className="error-message">{error.message}</div>}

      <JobRunTable runs={runs} onRowClick={handleRowClick} loading={loading} />

      <div className="pagination">
        <button onClick={handlePrevPage} disabled={filters.offset === 0}>
          Previous
        </button>
        <span>
          Showing {filters.offset + 1} - {Math.min(filters.offset + filters.limit, total)} of {total}
        </span>
        <button onClick={handleNextPage} disabled={filters.offset + filters.limit >= total}>
          Next
        </button>
      </div>

      {showTriggerModal && (
        <JobTriggerModal
          definitions={definitions}
          onTrigger={handleTriggerJob}
          onClose={() => setShowTriggerModal(false)}
        />
      )}
    </div>
  );
}
