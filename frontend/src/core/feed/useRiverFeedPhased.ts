import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { api } from '../../api/client'
import type { FeedCard } from '../../api/types'
import { usePhase1FromHTML } from './usePhase1FromHTML'
import { subscribeAuthChange } from '../auth/authEvents'

type RiverState = {
  items: FeedCard[]
  cursor: string | null | undefined
  loading: boolean
  error: string | null
  phase1Complete: boolean // Phase 1 (lite) complete
}

type FeedStatus = 'idle' | 'phase1-loading' | 'phase1-ready' | 'phase2-loading' | 'ready' | 'error'

type FeedStoreState = RiverState & {
  status: FeedStatus
  lastUpdatedAt: number | null
  lastPhase2At: number | null
}

type Phase1Snapshot = {
  items: FeedCard[]
  cursor: string | null
}

type CachedSnapshot = Phase1Snapshot & {
  timestamp: number
}

const FEED_CACHE_TTL_MS = import.meta.env?.DEV ? 60_000 : 300_000
const DEBUG = Boolean(import.meta.env?.DEV)

const isDebugEnabled = () => {
  if (!DEBUG || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('debug:feed') === '1'
  } catch {
    return false
  }
}

const debugLog = (...args: unknown[]) => {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

const isLoadingStatus = (status: FeedStatus) =>
  status === 'phase1-loading' || status === 'phase2-loading'

const FEED_TRANSITIONS: Record<FeedStatus, FeedStatus[]> = {
  idle: ['phase1-loading', 'phase1-ready', 'phase2-loading', 'ready', 'error'],
  'phase1-loading': ['phase1-ready', 'idle', 'error'],
  'phase1-ready': ['phase2-loading', 'ready', 'idle', 'error'],
  'phase2-loading': ['ready', 'phase1-ready', 'idle', 'error'],
  ready: ['phase2-loading', 'ready', 'idle', 'error'],
  error: ['phase1-loading', 'idle'],
}

const initialFeedState: FeedStoreState = {
  items: [],
  cursor: undefined,
  loading: false,
  error: null,
  phase1Complete: false,
  status: 'idle',
  lastUpdatedAt: null,
  lastPhase2At: null,
}

let feedStoreState: FeedStoreState = initialFeedState
const feedStoreListeners = new Set<() => void>()

const emitFeedStoreChange = () => {
  feedStoreListeners.forEach(listener => listener())
}

const subscribeFeedStore = (listener: () => void) => {
  feedStoreListeners.add(listener)
  return () => {
    feedStoreListeners.delete(listener)
  }
}

const getFeedStoreSnapshot = () => feedStoreState

const setFeedStoreState = (next: FeedStoreState) => {
  feedStoreState = next
  emitFeedStoreChange()
}

const transitionFeedStore = (nextStatus: FeedStatus, patch: Partial<FeedStoreState> = {}) => {
  const allowed = FEED_TRANSITIONS[feedStoreState.status] ?? []
  if (feedStoreState.status !== nextStatus && !allowed.includes(nextStatus)) {
    return false
  }
  setFeedStoreState({
    ...feedStoreState,
    ...patch,
    status: nextStatus,
    loading: isLoadingStatus(nextStatus),
  })
  return true
}

let feedEpoch = 0
let phase1Snapshot: CachedSnapshot | null = null
let phase1Promise: Promise<CachedSnapshot> | null = null
let phase2Snapshot: CachedSnapshot | null = null
let phase2Promise: Promise<CachedSnapshot> | null = null

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}

const isSnapshotFresh = (snapshot: CachedSnapshot | null) => {
  if (!snapshot) return false
  return Date.now() - snapshot.timestamp <= FEED_CACHE_TTL_MS
}

const getFreshPhase1Snapshot = () => {
  if (!phase1Snapshot) return null
  if (!isSnapshotFresh(phase1Snapshot)) {
    phase1Snapshot = null
    return null
  }
  return phase1Snapshot
}

const getFreshPhase2Snapshot = () => {
  if (!phase2Snapshot) return null
  if (!isSnapshotFresh(phase2Snapshot)) {
    phase2Snapshot = null
    return null
  }
  return phase2Snapshot
}

const expireCacheIfStale = (reason: string) => {
  const now = Date.now()
  const storeStale =
    feedStoreState.lastUpdatedAt !== null &&
    now - feedStoreState.lastUpdatedAt > FEED_CACHE_TTL_MS
  const phase2Stale = phase2Snapshot !== null && !isSnapshotFresh(phase2Snapshot)
  const phase1Stale =
    phase2Snapshot === null && phase1Snapshot !== null && !isSnapshotFresh(phase1Snapshot)

  if (storeStale || phase2Stale || phase1Stale) {
    clearFeedCache(reason)
    return true
  }
  return false
}

const clearFeedCache = (reason: string) => {
  feedEpoch += 1
  phase1Snapshot = null
  phase2Snapshot = null
  phase1Promise = null
  phase2Promise = null
  setFeedStoreState(initialFeedState)
  debugLog('[feed] cache cleared', { reason })
}

let authUnsubscribe: (() => void) | null = null
const ensureAuthSubscription = () => {
  if (authUnsubscribe || typeof window === 'undefined') return
  authUnsubscribe = subscribeAuthChange(() => {
    clearFeedCache('auth-change')
  })
}

const toCachedSnapshot = (snapshot: Phase1Snapshot): CachedSnapshot => ({
  ...snapshot,
  timestamp: Date.now(),
})

const applyPhase1SnapshotToStore = (snapshot: CachedSnapshot) => {
  phase1Snapshot = snapshot
  transitionFeedStore('phase1-ready', {
    items: snapshot.items ?? [],
    cursor: snapshot.cursor,
    error: null,
    phase1Complete: true,
    lastUpdatedAt: snapshot.timestamp,
  })
}

const applyPhase2SnapshotToStore = (snapshot: CachedSnapshot) => {
  phase2Snapshot = snapshot
  transitionFeedStore('ready', {
    items: snapshot.items ?? [],
    cursor: snapshot.cursor,
    error: null,
    phase1Complete: true,
    lastUpdatedAt: snapshot.timestamp,
    lastPhase2At: snapshot.timestamp,
  })
}

/**
 * Two-phase feed loading:
 * Phase 1: Fetch 1-2 cards with lite=true (minimal fields, no media)
 * Phase 2: Fetch full feed after first paint
 */
export function useRiverFeedPhased() {
  const state = useSyncExternalStore(
    subscribeFeedStore,
    getFeedStoreSnapshot,
    getFeedStoreSnapshot
  )
  const phase1FromHTML = usePhase1FromHTML()

  useEffect(() => {
    ensureAuthSubscription()
    expireCacheIfStale('ttl-expired')

    const cachedPhase2 = getFreshPhase2Snapshot()
    if (cachedPhase2 && feedStoreState.status === 'idle') {
      applyPhase2SnapshotToStore(cachedPhase2)
      return
    }

    const cachedPhase1 = getFreshPhase1Snapshot()
    if (cachedPhase1 && feedStoreState.status === 'idle') {
      applyPhase1SnapshotToStore(cachedPhase1)
    }
  }, [])

  const getPhase1Snapshot = useCallback(async (): Promise<CachedSnapshot> => {
    const cached = getFreshPhase1Snapshot()
    if (cached) return cached
    const epoch = feedEpoch

    if (!phase1Promise) {
      phase1Promise = (async () => {
        if (phase1FromHTML.found && phase1FromHTML.data) {
          const res = phase1FromHTML.data as {
            items?: FeedCard[]
            nextCursor?: string | null
          }
          return toCachedSnapshot({
            items: res.items ?? [],
            cursor: res.nextCursor ?? null,
          })
        }

        const res = await api.feed(undefined, undefined, { limit: 2, lite: true })
        return toCachedSnapshot({
          items: res.items ?? [],
          cursor: res.nextCursor ?? null,
        })
      })()
    }

    try {
      const snapshot = await phase1Promise
      if (epoch !== feedEpoch) {
        return snapshot
      }
      phase1Snapshot = snapshot
      if (import.meta.env?.DEV && typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            'phase1-feed-dev',
            JSON.stringify({ items: snapshot.items ?? [], nextCursor: snapshot.cursor })
          )
        } catch {
          // Ignore storage errors in dev
        }
      }
      return snapshot
    } finally {
      phase1Promise = null
    }
  }, [phase1FromHTML])

  const getPhase2Snapshot = useCallback(async (): Promise<CachedSnapshot> => {
    const cached = getFreshPhase2Snapshot()
    if (cached) return cached
    const epoch = feedEpoch

    if (!phase2Promise) {
      phase2Promise = (async () => {
        const store = getFeedStoreSnapshot()
        const res = await api.feed(store.cursor ?? undefined, undefined)
        return toCachedSnapshot({
          items: res.items ?? [],
          cursor: res.nextCursor ?? null,
        })
      })()
    }

    try {
      const snapshot = await phase2Promise
      if (epoch !== feedEpoch) {
        return snapshot
      }
      phase2Snapshot = snapshot
      return snapshot
    } finally {
      phase2Promise = null
    }
  }, [])

  const loadPhase1 = useCallback(async () => {
    if (expireCacheIfStale('ttl-expired')) return

    const cached = getFreshPhase1Snapshot()
    if (cached) {
      applyPhase1SnapshotToStore(cached)
      return
    }

    const epoch = feedEpoch
    const store = getFeedStoreSnapshot()
    if (store.phase1Complete || isLoadingStatus(store.status)) {
      debugLog('[feed] phase1 skipped', {
        status: store.status,
        phase1Complete: store.phase1Complete,
      })
      return
    }

    if (!transitionFeedStore('phase1-loading', { error: null })) return

    try {
      const snapshot = await getPhase1Snapshot()
      if (epoch !== feedEpoch) return
      applyPhase1SnapshotToStore(snapshot)
    } catch (e: unknown) {
      if (isAbortError(e)) {
        transitionFeedStore('idle', { error: null })
        return
      }
      const message = getErrorMessage(e, 'Failed to load feed')
      transitionFeedStore('error', { error: message })
    }
  }, [getPhase1Snapshot])

  const loadPhase2 = useCallback(async () => {
    if (expireCacheIfStale('ttl-expired')) return

    const cached = getFreshPhase2Snapshot()
    if (cached) {
      applyPhase2SnapshotToStore(cached)
      return
    }

    const epoch = feedEpoch
    const store = getFeedStoreSnapshot()
    if (!store.phase1Complete || store.status === 'phase2-loading') {
      return
    }

    const prevStatus = store.status
    if (!transitionFeedStore('phase2-loading', { error: null })) return

    try {
      const snapshot = await getPhase2Snapshot()
      if (epoch !== feedEpoch) return
      applyPhase2SnapshotToStore(snapshot)
    } catch (e: unknown) {
      if (isAbortError(e)) {
        transitionFeedStore(prevStatus, { error: null })
        return
      }
      const message = getErrorMessage(e, 'Failed to load feed')
      transitionFeedStore('error', { error: message })
    }
  }, [getPhase2Snapshot])

  // Load Phase 1 immediately on mount
  useEffect(() => {
    if (state.phase1Complete || isLoadingStatus(state.status)) return
    if (state.items.length > 0) return
    if (state.error) return

    void loadPhase1()
  }, [loadPhase1, state.error, state.items.length, state.phase1Complete, state.status])

  // Load Phase 2 after first paint (defer heavy work)
  // Browser Scheduler Control: Use scheduler.postTask for better control
  // Better than setTimeout and better than requestIdleCallback
  // Guarantees: zero interference with scrolling, zero starvation of paint/input
  useEffect(() => {
    if (!state.phase1Complete || state.status === 'phase2-loading' || phase2Snapshot) return

    let rafId1: number
    let rafId2: number
    let taskHandle: { abort: () => void } | null = null
    let timeoutId: ReturnType<typeof setTimeout>

    // Double RAF ensures paint is committed and layout is stable
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        // Use scheduler.postTask if available (Chrome/modern browsers)
        // Falls back to setTimeout for older browsers
        if ('scheduler' in window && 'postTask' in (window as { scheduler?: { postTask?: unknown } }).scheduler!) {
          const scheduler = (window as {
            scheduler: {
              postTask: (fn: () => void, opts?: { priority?: string }) => { abort: () => void }
            }
          }).scheduler
          const maybeHandle = scheduler.postTask(
            () => {
              if (!isLoadingStatus(getFeedStoreSnapshot().status)) {
                loadPhase2()
              }
            },
            { priority: 'background' }
          )
          if (maybeHandle && typeof (maybeHandle as { abort?: unknown }).abort === 'function') {
            taskHandle = maybeHandle as { abort: () => void }
          }
        } else {
          // Fallback: setTimeout(0) to avoid microtask flooding
          timeoutId = setTimeout(() => {
            if (!isLoadingStatus(getFeedStoreSnapshot().status)) {
              loadPhase2()
            }
          }, 0)
        }
      })
    })

    // Safety timeout for slow devices (max 500ms delay)
    const safetyTimeout = setTimeout(() => {
      if (!isLoadingStatus(getFeedStoreSnapshot().status)) {
        loadPhase2()
      }
    }, 500)

    return () => {
      if (rafId1) cancelAnimationFrame(rafId1)
      if (rafId2) cancelAnimationFrame(rafId2)
      if (taskHandle) taskHandle.abort()
      if (timeoutId) clearTimeout(timeoutId)
      if (safetyTimeout) clearTimeout(safetyTimeout)
    }
  }, [loadPhase2, state.phase1Complete, state.status])

  const loadMore = useCallback(async (signal?: AbortSignal) => {
    if (expireCacheIfStale('ttl-expired')) return

    const store = getFeedStoreSnapshot()
    if (store.cursor === null || store.status !== 'ready') return

    const epoch = feedEpoch
    const prevStatus = store.status
    if (!transitionFeedStore('phase2-loading', { error: null })) return

    try {
      const res = await api.feed(store.cursor ?? undefined, signal)
      const nextCursor = res.nextCursor ?? null
      const latest = getFeedStoreSnapshot()
      const mergedItems = [...latest.items, ...(res.items ?? [])]
      if (epoch !== feedEpoch) return
      applyPhase2SnapshotToStore({
        items: mergedItems,
        cursor: nextCursor,
        timestamp: Date.now(),
      })
    } catch (e: unknown) {
      if (isAbortError(e)) {
        transitionFeedStore(prevStatus, { error: null })
        return
      }
      const message = getErrorMessage(e, 'Failed to load feed')
      transitionFeedStore('error', { error: message })
    }
  }, [])

  const hasNext = useMemo(() => state.cursor !== null, [state.cursor])

  // Sentinel ref for intersection observer (deferred)
  const sentinelRef = useRef<HTMLDivElement>(null)

  return {
    ...state,
    hasNext,
    loadMore,
    sentinelRef,
    // Expose phase info
    isPhase1: !state.phase1Complete,
    phase1Items: state.phase1Complete ? [] : state.items,
  }
}
