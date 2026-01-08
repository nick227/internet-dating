import { useState, useEffect } from 'react';
import { adminApi } from '../api/admin';
import type { JobDefinition } from '../types';

interface UseJobDefinitionsResult {
  definitions: JobDefinition[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useJobDefinitions(): UseJobDefinitionsResult {
  const [definitions, setDefinitions] = useState<JobDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDefinitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApi.getJobDefinitions();
      setDefinitions(response.jobs);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch job definitions'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDefinitions();
  }, []);

  return {
    definitions,
    loading,
    error,
    refresh: fetchDefinitions
  };
}
