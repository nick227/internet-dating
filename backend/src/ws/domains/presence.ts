import type WebSocket from 'ws'
import type { WsPresenceStatus } from '@app/shared'
import type { WsRouter } from '../router.js'

const AWAY_AFTER_MS = 5 * 60 * 1000

type PresenceEntry = {
  sockets: Set<WebSocket>
  status: WsPresenceStatus
  lastSeenAt: number
}

const presence = new Map<string, PresenceEntry>()

export function registerHandlers(_router: WsRouter) {
  return
}

export function onConnect(userId: string, socket: WebSocket) {
  const now = Date.now()
  const entry = presence.get(userId) ?? {
    sockets: new Set<WebSocket>(),
    status: 'online' as WsPresenceStatus,
    lastSeenAt: now
  }

  entry.sockets.add(socket)
  entry.status = 'online'
  entry.lastSeenAt = now
  presence.set(userId, entry)
  return entry
}

export function onDisconnect(userId: string, socket: WebSocket) {
  const entry = presence.get(userId)
  if (!entry) return null
  entry.sockets.delete(socket)
  entry.lastSeenAt = Date.now()
  if (entry.sockets.size === 0) {
    entry.status = 'offline'
  }
  return entry
}

export function recordActivity(userId: string) {
  const entry = presence.get(userId)
  if (!entry) return null
  entry.lastSeenAt = Date.now()
  if (entry.sockets.size > 0 && entry.status === 'away') {
    entry.status = 'online'
  }
  return entry
}

export function tick(now = Date.now()) {
  const updates: { userId: string; status: WsPresenceStatus; lastSeenAt: string }[] = []
  for (const [userId, entry] of presence.entries()) {
    if (entry.sockets.size === 0 && entry.status !== 'offline') {
      entry.status = 'offline'
      updates.push({
        userId,
        status: entry.status,
        lastSeenAt: new Date(entry.lastSeenAt).toISOString()
      })
      continue
    }

    if (entry.sockets.size > 0 && entry.status === 'online') {
      if (now - entry.lastSeenAt > AWAY_AFTER_MS) {
        entry.status = 'away'
        updates.push({
          userId,
          status: entry.status,
          lastSeenAt: new Date(entry.lastSeenAt).toISOString()
        })
      }
    }
  }
  return updates
}
