import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import type { JobRun } from '../types';

interface UseActiveJobsResult {
  runs: JobRun[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useActiveJobs(autoRefresh = true, intervalMs = 5000): UseActiveJobsResult {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchActiveJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getActiveJobs();
      setRuns(response.runs);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch active jobs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveJobs();

    if (autoRefresh) {
      const interval = setInterval(fetchActiveJobs, intervalMs);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, intervalMs]);

  return {
    runs,
    loading,
    error,
    refresh: fetchActiveJobs
  };
}
