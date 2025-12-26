import { useCallback, useState } from 'react'
import { api } from '../../api/client'
import { useAsync } from '../hooks/useAsync'

export function useMatches() {
  const [tick, setTick] = useState(0)
  const { data, loading, error } = useAsync((signal) => api.messaging.matches(signal), [tick])
  const refresh = useCallback(() => setTick((v) => v + 1), [])

  return { data, loading, error, refresh }
}
