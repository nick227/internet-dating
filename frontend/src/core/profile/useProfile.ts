import { useCallback, useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { api } from '../../api/client'

export function useProfile(userId: string | number | undefined) {
  const [tick, setTick] = useState(0)
  const { data, loading, error } = useAsync(async (signal) => {
    if (!userId) throw new Error('Missing userId')
    return api.profile(userId, signal)
  }, [userId, tick])
  const refresh = useCallback(() => setTick((value) => value + 1), [])

  return { data, loading, error, refresh }
}
