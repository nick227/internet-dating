import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '../api/admin';
import { useJobStats } from '../hooks/useJobStats';
import { useJobWebSocket } from '../hooks/useJobWebSocket';
import { useJobDefinitions } from '../hooks/useJobDefinitions';
import { JobStatsOverview } from '../components/jobs/JobStatsOverview';
import { ActiveJobsMonitor } from '../components/jobs/ActiveJobsMonitor';
import { JobHistoryList } from '../components/jobs/JobHistoryList';
import { JobDetailsModal } from '../components/jobs/JobDetailsModal';
import { RunJobModal } from '../components/jobs/RunJobModal';
import { WorkerControl } from '../components/jobs/WorkerControl';
import { BulkEnqueueModal } from '../components/jobs/BulkEnqueueModal';
import { trackError } from '../utils/errorTracking';
import type { JobRun, JobRunStatus, JobGroup } from '../types';

export function JobManagerPage() {
  // State for active jobs (WS-driven, single source of truth)
  const [activeJobs, setActiveJobs] = useState<JobRun[]>([]);
  const [cancelRequested, setCancelRequested] = useState<Set<string>>(new Set());
  const [wsConnected, setWsConnected] = useState(false);
  
  // State for history (API-driven, single source of truth)
  const [historyRuns, setHistoryRuns] = useState<JobRun[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyFilters, setHistoryFilters] = useState<{ jobName?: string; status?: JobRunStatus }>({});
  
  // State for modals
  const [detailsModalJobId, setDetailsModalJobId] = useState<string | null>(null);
  const [runJobModalOpen, setRunJobModalOpen] = useState(false);
  const [prefillJob, setPrefillJob] = useState<{ jobName: string; params: Record<string, unknown> } | null>(null);
  const [bulkEnqueueModalOpen, setBulkEnqueueModalOpen] = useState(false);
  
  // Hooks (API-driven)
  const { stats, loading: statsLoading, refresh: refreshStats } = useJobStats(false);
  const { definitions } = useJobDefinitions();
  
  // Group definitions by group for UI
  const { jobsByGroup, groups } = useMemo(() => {
    const byGroup = new Map<JobGroup, typeof definitions>();
    const groupSet = new Set<JobGroup>();
    
    definitions.forEach(def => {
      if (def.group) {
        groupSet.add(def.group);
        const existing = byGroup.get(def.group) || [];
        byGroup.set(def.group, [...existing, def]);
      }
    });
    
    return {
      jobsByGroup: byGroup,
      groups: Array.from(groupSet).sort()
    };
  }, [definitions]);
  
  // Load initial active jobs from API on mount
  useEffect(() => {
    loadActiveJobs();
  }, []);
  
  // Load history on page/filter change
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPage, historyFilters]);
  
  const loadActiveJobs = async () => {
    try {
      const response = await adminApi.getActiveJobs();
      setActiveJobs(response.runs);
    } catch (err) {
      trackError(err, {
        action: 'loadActiveJobs',
        component: 'JobManagerPage'
      });
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
      trackError(err, {
        action: 'loadHistory',
        component: 'JobManagerPage',
        page: historyPage,
        filters: historyFilters
      });
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };
  
  // WebSocket handlers (single source of truth pattern)
  useJobWebSocket({
    onConnectionChange: (connected) => {
      setWsConnected(connected);
    },
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
      trackError(err, {
        action: 'cancelJob',
        component: 'JobManagerPage',
        jobRunId
      });
      console.error('Failed to cancel job:', err);
      alert('Failed to cancel job. Please try again.');
    }
  };
  
  const handleCleanupStalled = async () => {
    try {
      const result = await adminApi.cleanupStalledJobs();
      alert(`Cleaned ${result.cleaned} stalled jobs`);
      refreshStats();
      loadActiveJobs();
    } catch (err) {
      trackError(err, {
        action: 'cleanupStalled',
        component: 'JobManagerPage'
      });
      console.error('Failed to cleanup stalled jobs:', err);
      alert('Failed to cleanup stalled jobs');
    }
  };
  
  const handleEnqueueJob = async (jobName: string, params: Record<string, unknown>) => {
    try {
      const result = await adminApi.enqueueJob(jobName, params);
      alert(`Job enqueued: #${result.jobRunId}`);
      refreshStats();
      loadActiveJobs(); // Will be updated by WS, but load immediately for instant feedback
    } catch (err) {
      trackError(err, {
        action: 'enqueueJob',
        component: 'JobManagerPage',
        jobName,
        params
      });
      // Error is handled in RunJobModal, just re-throw
      throw err;
    }
  };
  
  const handleRerunJob = (jobName: string, params: Record<string, unknown>) => {
    setDetailsModalJobId(null); // Close details modal
    setPrefillJob({ jobName, params }); // Set prefill data
    setRunJobModalOpen(true); // Open run modal
  };
  
  const handleBulkEnqueue = async (type: 'all' | 'group', group?: JobGroup) => {
    try {
      if (type === 'all') {
        const result = await adminApi.enqueueAllJobs();
        alert(`✓ Successfully enqueued ${result.count} jobs in dependency order`);
      } else if (group) {
        const result = await adminApi.enqueueJobsByGroup(group);
        alert(`✓ Successfully enqueued ${result.count} jobs in "${group}" group`);
      }
      
      refreshStats();
      loadActiveJobs();
      setBulkEnqueueModalOpen(false);
    } catch (err) {
      trackError(err, {
        action: 'bulkEnqueue',
        component: 'JobManagerPage',
        type,
        group
      });
      console.error('Failed to enqueue jobs:', err);
      alert('Failed to enqueue jobs. Please try again.');
      throw err; // Re-throw so modal can handle
    }
  };
  
  return (
    <>
    <div className="job-manager-page">
      <div className="page-header">
        <h1>Job Manager</h1>
        <a 
          href="/docs/jobs-user-guide.md" 
          target="_blank" 
          rel="noopener noreferrer"
          className="help-link"
          title="View user guide"
        >
          📖 User Guide
        </a>
      </div>
      
      <div className="help-banner">
        <strong>💡 New to Job Manager?</strong> Jobs are automated tasks that keep your platform running smoothly. 
        <a href="/docs/jobs-user-guide.md" target="_blank" rel="noopener noreferrer" className="help-link-inline">
          Read the guide
        </a> to learn what each job does.
      </div>

      <WorkerControl onStatusChange={() => {
        // Refresh stats when worker status changes
        refreshStats();
        loadActiveJobs();
      }} />
      
      <JobStatsOverview
        stats={stats}
        loading={statsLoading}
        onRefresh={refreshStats}
        onCleanupStalled={handleCleanupStalled}
        wsConnected={wsConnected}
      />
      
      <ActiveJobsMonitor
        jobs={activeJobs}
        loading={false}
        cancelRequested={cancelRequested}
        onCancel={handleCancelJob}
        onViewDetails={setDetailsModalJobId}
        onCleanupStalled={handleCleanupStalled}
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
        onBulkEnqueue={() => setBulkEnqueueModalOpen(true)}
      />
    </div>
      
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
        onClose={() => {
          setRunJobModalOpen(false);
          setPrefillJob(null); // Clear prefill on close
        }}
        onSubmit={handleEnqueueJob}
        definitions={definitions}
        activeJobs={activeJobs}
        prefillJob={prefillJob}
      />
      
      <BulkEnqueueModal
        isOpen={bulkEnqueueModalOpen}
        onClose={() => setBulkEnqueueModalOpen(false)}
        onConfirm={handleBulkEnqueue}
        groups={groups}
        jobsByGroup={jobsByGroup}
        totalJobs={definitions.length}
      />
    </>
  );
}
