import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import type { JobStats } from '../types';

interface UseJobStatsResult {
  stats: JobStats | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useJobStats(autoRefresh = true, intervalMs = 30000): UseJobStatsResult {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getJobStats();
      setStats(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch job stats'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    if (autoRefresh) {
      const interval = setInterval(fetchStats, intervalMs);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, intervalMs]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats
  };
}
