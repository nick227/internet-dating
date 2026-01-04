import { useEffect } from 'react'
import { realtime } from '../../api/realtime'

const STRICT_MODE_DISCONNECT_DELAY_MS = 150

let activeConnections = 0
let pendingDisconnectTimer: number | null = null

function requestConnect() {
  activeConnections += 1
  if (pendingDisconnectTimer != null) {
    window.clearTimeout(pendingDisconnectTimer)
    pendingDisconnectTimer = null
  }
  if (activeConnections === 1) {
    realtime.connect()
  }
}

function requestDisconnect() {
  activeConnections = Math.max(0, activeConnections - 1)
  if (activeConnections !== 0 || pendingDisconnectTimer != null) return
  pendingDisconnectTimer = window.setTimeout(() => {
    pendingDisconnectTimer = null
    if (activeConnections === 0) {
      realtime.disconnect()
    }
  }, STRICT_MODE_DISCONNECT_DELAY_MS)
}

export function useRealtime(userId: string | number | null | undefined, loading = false) {
  useEffect(() => {
    if (loading || !userId) {
      return
    }
    requestConnect()
    return () => {
      requestDisconnect()
    }
  }, [userId, loading])
}
