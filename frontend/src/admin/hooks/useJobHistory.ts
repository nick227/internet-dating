import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import type { JobRun } from '../types';

interface UseJobHistoryParams {
  limit?: number;
  offset?: number;
  jobName?: string;
  status?: string;
}

interface UseJobHistoryResult {
  runs: JobRun[];
  total: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useJobHistory(params: UseJobHistoryParams = {}): UseJobHistoryResult {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getJobHistory(params);
      setRuns(response.runs);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch job history'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [params.limit, params.offset, params.jobName, params.status]);

  return {
    runs,
    total,
    loading,
    error,
    refresh: fetchHistory
  };
}
