import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import { useJobStats } from '../hooks/useJobStats';
import { useJobWebSocket } from '../hooks/useJobWebSocket';
import { useJobDefinitions } from '../hooks/useJobDefinitions';
import { JobStatsOverview } from '../components/jobs/JobStatsOverview';
import { ActiveJobsMonitor } from '../components/jobs/ActiveJobsMonitor';
import { JobHistoryList } from '../components/jobs/JobHistoryList';
import { JobDetailsModal } from '../components/jobs/JobDetailsModal';
import { RunJobModal } from '../components/jobs/RunJobModal';
import type { JobRun, JobRunStatus } from '../types';

export function JobManagerPage() {
  // State for active jobs (WS-driven, single source of truth)
  const [activeJobs, setActiveJobs] = useState<JobRun[]>([]);
  const [cancelRequested, setCancelRequested] = useState<Set<string>>(new Set());
  
  // State for history (API-driven, single source of truth)
  const [historyRuns, setHistoryRuns] = useState<JobRun[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyFilters, setHistoryFilters] = useState<{ jobName?: string; status?: JobRunStatus }>({});
  
  // State for modals
  const [detailsModalJobId, setDetailsModalJobId] = useState<string | null>(null);
  const [runJobModalOpen, setRunJobModalOpen] = useState(false);
  
  // Hooks (API-driven)
  const { stats, loading: statsLoading, refresh: refreshStats } = useJobStats(false);
  const { definitions } = useJobDefinitions();
  
  // Load initial active jobs from API on mount
  useEffect(() => {
    loadActiveJobs();
  }, []);
  
  // Load history on page/filter change
  useEffect(() => {
    loadHistory();
  }, [historyPage, historyFilters]);
  
  const loadActiveJobs = async () => {
    try {
      const response = await adminApi.getActiveJobs();
      setActiveJobs(response.runs);
    } catch (err) {
      console.error('Failed to load active jobs:', err);
    }
  };
  
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await adminApi.getJobHistory({
        limit: 50,
        offset: historyPage * 50,
        jobName: historyFilters.jobName,
        status: historyFilters.status
      });
      setHistoryRuns(response.runs);
      setHistoryTotal(response.total);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };
  
  // WebSocket handlers (single source of truth pattern)
  useJobWebSocket({
    onJobStarted: (event) => {
      // Add to active jobs list (deduplication check)
      setActiveJobs(prev => {
        if (prev.some(j => j.id === event.data.jobRunId)) {
          return prev; // Already exists
        }
        const newJob: JobRun = {
          id: event.data.jobRunId,
          jobName: event.data.jobName,
          status: 'RUNNING',
          trigger: 'MANUAL',
          queuedAt: new Date().toISOString(),
          startedAt: event.data.startedAt,
          triggeredBy: event.data.triggeredBy
        };
        return [...prev, newJob];
      });
    },
    
    onJobProgress: (event) => {
      // Update specific job in active list
      setActiveJobs(prev => prev.map(job =>
        job.id === event.data.jobRunId
          ? { ...job, lastHeartbeatAt: new Date().toISOString() }
          : job
      ));
    },
    
    onJobCompleted: (event) => {
      // Remove from active jobs
      setActiveJobs(prev => prev.filter(j => j.id !== event.data.jobRunId));
      
      // Clear cancel requested state
      setCancelRequested(prev => {
        const next = new Set(prev);
        next.delete(event.data.jobRunId);
        return next;
      });
      
      // INVALIDATE other sources (don't mutate them directly)
      refreshStats();
      
      // Refresh history if on first page
      if (historyPage === 0) {
        loadHistory();
      }
    }
  });
  
  // Actions
  const handleCancelJob = async (jobRunId: string) => {
    // Optimistic UI: Show CANCEL_REQUESTED state
    setCancelRequested(prev => new Set(prev).add(jobRunId));
    
    try {
      await adminApi.cancelJob(jobRunId);
    } catch (err) {
      // Revert on error
      setCancelRequested(prev => {
        const next = new Set(prev);
        next.delete(jobRunId);
        return next;
      });
      console.error('Failed to cancel job:', err);
    }
  };
  
  const handleCleanupStalled = async () => {
    try {
      const result = await adminApi.cleanupStalledJobs();
      alert(`Cleaned ${result.cleaned} stalled jobs`);
      refreshStats();
      loadActiveJobs();
    } catch (err) {
      console.error('Failed to cleanup stalled jobs:', err);
      alert('Failed to cleanup stalled jobs');
    }
  };
  
  const handleEnqueueJob = async (jobName: string, params: Record<string, unknown>) => {
    const result = await adminApi.enqueueJob(jobName, params);
    alert(`Job enqueued: #${result.jobRunId}`);
    refreshStats();
    loadActiveJobs(); // Will be updated by WS, but load immediately for instant feedback
  };
  
  const handleRerunJob = (jobName: string, params: Record<string, unknown>) => {
    setDetailsModalJobId(null); // Close details modal
    setRunJobModalOpen(true); // Open run modal
    // TODO: Pre-fill with job name and params
  };
  
  return (
    <div className="job-manager-page">
      <div className="page-header">
        <h1>Job Manager</h1>
      </div>
      
      <JobStatsOverview
        stats={stats}
        loading={statsLoading}
        onRefresh={refreshStats}
        onCleanupStalled={handleCleanupStalled}
      />
      
      <ActiveJobsMonitor
        jobs={activeJobs}
        loading={false}
        cancelRequested={cancelRequested}
        onCancel={handleCancelJob}
        onViewDetails={setDetailsModalJobId}
      />
      
      <JobHistoryList
        runs={historyRuns}
        total={historyTotal}
        loading={historyLoading}
        page={historyPage}
        pageSize={50}
        filters={historyFilters}
        onPageChange={setHistoryPage}
        onFilterChange={(filters) => {
          setHistoryFilters(filters);
          setHistoryPage(0); // Reset to first page
        }}
        onViewDetails={setDetailsModalJobId}
        onRunNewJob={() => setRunJobModalOpen(true)}
      />
      
      {detailsModalJobId && (
        <JobDetailsModal
          jobRunId={detailsModalJobId}
          onClose={() => setDetailsModalJobId(null)}
          onRerun={handleRerunJob}
          onCancel={handleCancelJob}
        />
      )}
      
      <RunJobModal
        open={runJobModalOpen}
        onClose={() => setRunJobModalOpen(false)}
        onSubmit={handleEnqueueJob}
        definitions={definitions}
        activeJobs={activeJobs}
      />
    </div>
  );
}
