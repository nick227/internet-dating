import { useEffect, useRef } from 'react'
import { api } from '../../api/client'
import { seenBatchManager } from './useFeedSeen'

type SeenEventPayload = {
  itemType: string
  itemId: string
  position: number
  timestamp: number
}

type NegativeActionPayload = {
  itemType: string
  itemId: string
  action: 'hide' | 'block' | 'report'
  timestamp: number
  actorId?: string | number
  reason?: string
}

type SuggestionFeedbackPayload = {
  itemType: string // Canonical card kind: 'profile' | 'match' | etc.
  itemId: string
  feedback: 'positive' | 'negative'
  timestamp: number
}

const NEGATIVE_ACTIONS_STORAGE_KEY = 'feed:negative-actions'
const MAX_STORED_ACTIONS = 100

function saveNegativeAction(payload: NegativeActionPayload) {
  try {
    const existing = localStorage.getItem(NEGATIVE_ACTIONS_STORAGE_KEY)
    const items: NegativeActionPayload[] = existing ? JSON.parse(existing) : []
    items.push(payload)

    // Keep only last MAX_STORED_ACTIONS to prevent storage bloat
    const trimmed = items.slice(-MAX_STORED_ACTIONS)
    localStorage.setItem(NEGATIVE_ACTIONS_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore localStorage errors
  }
}

export function loadNegativeActions(): NegativeActionPayload[] {
  try {
    const existing = localStorage.getItem(NEGATIVE_ACTIONS_STORAGE_KEY)
    return existing ? JSON.parse(existing) : []
  } catch {
    return []
  }
}

let seenBatchQueue: SeenEventPayload[] = []
let seenSyncInFlight = false
let seenSyncTimeout: ReturnType<typeof setTimeout> | null = null

async function syncSeenBatch() {
  if (seenSyncInFlight || seenBatchQueue.length === 0) return

  seenSyncInFlight = true
  const batch = [...seenBatchQueue]
  seenBatchQueue = []

  try {
    // Sync seen events to backend (stub implementation - replace with actual endpoint)
    await api.feedSync.seen(batch, undefined)

    if (import.meta.env?.DEV) {
      console.debug('[feed:sync] seen batch synced', { count: batch.length })
    }
  } catch (e) {
    // On error, re-queue items for retry
    seenBatchQueue.unshift(...batch)
    if (import.meta.env?.DEV) {
      console.warn('[feed:sync] seen batch failed, will retry', e)
    }
  } finally {
    seenSyncInFlight = false
    scheduleSeenSync()
  }
}

function scheduleSeenSync() {
  if (seenSyncTimeout) clearTimeout(seenSyncTimeout)
  if (seenBatchQueue.length === 0) return

  seenSyncTimeout = setTimeout(() => {
    void syncSeenBatch()
  }, 2000)
}

// Force immediate sync (for unload/visibilitychange)
function forceSyncSeenBatch() {
  if (seenSyncTimeout) {
    clearTimeout(seenSyncTimeout)
    seenSyncTimeout = null
  }
  void syncSeenBatch()
}

// Flush pending events using sendBeacon (for beforeunload)
function flushWithBeacon() {
  if (seenBatchQueue.length === 0) return

  const batch = [...seenBatchQueue]
  seenBatchQueue = []

  // Use sendBeacon for reliable delivery on page unload
  if (navigator.sendBeacon) {
    try {
      const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/feed/seen`
      const blob = new Blob([JSON.stringify({ items: batch })], { type: 'application/json' })
      const sent = navigator.sendBeacon(url, blob)
      if (import.meta.env?.DEV) {
        console.debug('[feed:sync] sent beacon', { count: batch.length, sent })
      }
      if (!sent) {
        // Fallback: re-queue if beacon failed
        seenBatchQueue.unshift(...batch)
      }
    } catch (e) {
      // Fallback: re-queue on error
      seenBatchQueue.unshift(...batch)
      if (import.meta.env?.DEV) {
        console.warn('[feed:sync] beacon failed', e)
      }
    }
  } else {
    // No sendBeacon support - re-queue for next session
    seenBatchQueue.unshift(...batch)
  }
}

export function useFeedSync() {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Handle batched seen events
    const handleSeenBatch = (event: CustomEvent<{ items: SeenEventPayload[] }>) => {
      seenBatchQueue.push(...event.detail.items)
      scheduleSeenSync()
    }

    // Handle negative actions
    const handleHide = (event: CustomEvent<{ itemType: string; itemId: string }>) => {
      const payload: NegativeActionPayload = {
        itemType: event.detail.itemType,
        itemId: event.detail.itemId,
        action: 'hide',
        timestamp: Date.now(),
      }
      saveNegativeAction(payload)

      // Sync to API (stub - replace with actual endpoint)
      api.feedSync.hide(event.detail.itemId).catch(e => {
        if (import.meta.env?.DEV) {
          console.warn('[feed:sync] hide failed', e)
        }
      })
    }

    const handleBlock = (
      event: CustomEvent<{ itemType: string; itemId: string; actorId?: string | number }>
    ) => {
      const payload: NegativeActionPayload = {
        itemType: event.detail.itemType,
        itemId: event.detail.itemId,
        action: 'block',
        timestamp: Date.now(),
        actorId: event.detail.actorId,
      }
      saveNegativeAction(payload)

      // Sync to API (stub - replace with actual endpoint)
      if (event.detail.actorId) {
        api.feedSync.block(event.detail.actorId).catch(e => {
          if (import.meta.env?.DEV) {
            console.warn('[feed:sync] block failed', e)
          }
        })
      }
    }

    const handleReport = (
      event: CustomEvent<{ itemType: string; itemId: string; reason?: string }>
    ) => {
      const payload: NegativeActionPayload = {
        itemType: event.detail.itemType,
        itemId: event.detail.itemId,
        action: 'report',
        timestamp: Date.now(),
        reason: event.detail.reason,
      }
      saveNegativeAction(payload)

      // Sync to API (stub - replace with actual endpoint)
      api.feedSync.report(event.detail.itemId, event.detail.reason).catch(e => {
        if (import.meta.env?.DEV) {
          console.warn('[feed:sync] report failed', e)
        }
      })
    }

    const handleSuggestionFeedback = (
      event: CustomEvent<{ itemType: string; itemId: string; feedback: 'positive' | 'negative' }>
    ) => {
      const payload: SuggestionFeedbackPayload = {
        itemType: event.detail.itemType, // Canonical card kind
        itemId: event.detail.itemId,
        feedback: event.detail.feedback,
        timestamp: Date.now(),
      }

      // Save to localStorage for persistence
      try {
        const key = 'feed:suggestion-feedback'
        const existing = localStorage.getItem(key)
        const items: SuggestionFeedbackPayload[] = existing ? JSON.parse(existing) : []
        items.push(payload)
        const trimmed = items.slice(-MAX_STORED_ACTIONS)
        localStorage.setItem(key, JSON.stringify(trimmed))
      } catch {
        // Ignore localStorage errors
      }

      // Sync to API (stub - replace with actual endpoint)
      api.feedSync.suggestionFeedback(payload).catch(e => {
        if (import.meta.env?.DEV) {
          console.warn('[feed:sync] suggestion feedback failed', e)
        }
      })
    }

    window.addEventListener('feed:seen-batch', handleSeenBatch as EventListener)
    window.addEventListener('feed:hide', handleHide as EventListener)
    window.addEventListener('feed:block', handleBlock as EventListener)
    window.addEventListener('feed:report', handleReport as EventListener)
    window.addEventListener('feed:suggestion-feedback', handleSuggestionFeedback as EventListener)

    // Initial sync on mount
    scheduleSeenSync()

    // Flush pending events on visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab is hidden - flush immediately
        forceSyncSeenBatch()
        seenBatchManager.forceFlush()
      }
    }

    // Flush pending events on page unload (with sendBeacon fallback)
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery
      flushWithBeacon()
      seenBatchManager.forceFlush()
    }

    // Flush on pagehide (more reliable than beforeunload on mobile)
    const handlePageHide = () => {
      flushWithBeacon()
      seenBatchManager.forceFlush()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('feed:seen-batch', handleSeenBatch as EventListener)
      window.removeEventListener('feed:hide', handleHide as EventListener)
      window.removeEventListener('feed:block', handleBlock as EventListener)
      window.removeEventListener('feed:report', handleReport as EventListener)
      window.removeEventListener(
        'feed:suggestion-feedback',
        handleSuggestionFeedback as EventListener
      )
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)

      if (seenSyncTimeout) {
        clearTimeout(seenSyncTimeout)
      }
    }
  }, [])

  return {
    loadNegativeActions,
    getStoredActionCount: () => loadNegativeActions().length,
  }
}
