import { useEffect } from 'react'
import { realtime } from '../../api/realtime'

const DEBUG = Boolean(import.meta.env?.DEV)

export function useRealtime(userId: string | number | null | undefined, loading = false) {
  useEffect(() => {
    if (loading) return
    if (!userId) {
      if (DEBUG) console.debug('[ws] realtime:disconnect', { reason: 'no-user' })
      realtime.disconnect()
      return
    }
    if (DEBUG) console.debug('[ws] realtime:connect', { userId })
    realtime.connect()
    return () => {
      if (DEBUG) console.debug('[ws] realtime:disconnect', { reason: 'cleanup' })
      realtime.disconnect()
    }
  }, [userId, loading])
}
