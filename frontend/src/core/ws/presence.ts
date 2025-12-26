import { useEffect, useMemo, useState } from 'react'
import type { WsPresenceStatus, WsSubscribeTopic } from '@app/shared/ws/contracts'
import { realtime } from '../../api/realtime'

type Listener = () => void

const listeners = new Set<Listener>()
const presence = new Map<string, WsPresenceStatus>()
const subscriptions = new Map<string, { topic: WsSubscribeTopic; count: number }>()
let syncPending = false

realtime.on('server.presence.update', (data) => {
  setPresence(String(data.userId), data.status)
})

realtime.on('server.presence.batch', (data) => {
  presence.clear()
  for (const user of data.users) {
    presence.set(String(user.userId), user.status)
  }
  notify()
})

function setPresence(userId: string, status: WsPresenceStatus) {
  const prev = presence.get(userId)
  if (prev === status) return
  presence.set(userId, status)
  notify()
}

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function topicKey(topic: WsSubscribeTopic) {
  return `${topic.kind}:${topic.id}`
}

function syncSubscriptions() {
  const topics = Array.from(subscriptions.values(), (entry) => entry.topic)
  realtime.subscribe(topics)
}

function scheduleSync() {
  if (syncPending) return
  syncPending = true
  queueMicrotask(() => {
    syncPending = false
    syncSubscriptions()
  })
}

export function subscribePresence(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPresence(userId: string) {
  return presence.get(userId) ?? null
}

export function trackPresence(userIds: Array<string | number>) {
  const topics = userIds
    .filter((id): id is string | number => id !== null && id !== undefined)
    .map((id) => ({ kind: 'user', id: String(id) }) satisfies WsSubscribeTopic)

  for (const topic of topics) {
    const key = topicKey(topic)
    const existing = subscriptions.get(key)
    if (existing) {
      existing.count += 1
    } else {
      subscriptions.set(key, { topic, count: 1 })
    }
  }

  scheduleSync()

  return () => {
    for (const topic of topics) {
      const key = topicKey(topic)
      const existing = subscriptions.get(key)
      if (!existing) continue
      existing.count -= 1
      if (existing.count <= 0) {
        subscriptions.delete(key)
      }
    }
    scheduleSync()
  }
}

export function usePresence(userId?: string | number | null) {
  const id = useMemo(() => (userId != null ? String(userId) : null), [userId])
  const [status, setStatus] = useState<WsPresenceStatus | null>(() =>
    id ? getPresence(id) : null
  )

  useEffect(() => {
    if (!id) {
      setStatus(null)
      return
    }
    const update = () => setStatus(getPresence(id))
    const unsubscribe = subscribePresence(update)
    const release = trackPresence([id])
    update()

    return () => {
      unsubscribe()
      release()
    }
  }, [id])

  return status
}
