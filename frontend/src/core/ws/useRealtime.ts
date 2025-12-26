import { useEffect } from 'react'
import { realtime } from '../../api/realtime'

export function useRealtime(userId: string | number | null | undefined, loading = false) {
  useEffect(() => {
    if (loading) return
    if (!userId) {
      realtime.disconnect()
      return
    }
    realtime.connect()
    return () => {
      realtime.disconnect()
    }
  }, [userId, loading])
}
