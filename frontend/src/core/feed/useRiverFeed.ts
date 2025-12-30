import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { FeedCard } from '../../api/types'
import { HttpError } from '../../api/http'
import { useIntersection } from '../hooks/useIntersection'
import { loadNegativeActions } from './useFeedSync'

type RiverState = {
  items: FeedCard[]
  cursor: string | null | undefined
  loading: boolean
  error: string | null
}

const MAX_PAGES_PER_INTERSECTION = 2

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

const getFeedKey = (card: FeedCard): string => `${card.kind}:${card.id}`

export function useRiverFeed() {
  const [state, setState] = useState<RiverState>({
    items: [],
    cursor: undefined,
    loading: false,
    error: null,
  })
  const inFlight = useRef(false)
  const cursorRef = useRef<string | null | undefined>(undefined)
  const errorRef = useRef<string | null>(null)
  const itemsCountRef = useRef(0)
  const isIntersectingRef = useRef(false)
  const pumpingRef = useRef(false)
  const optimisticItemsRef = useRef<Map<string, FeedCard>>(new Map())
  // Use Map with timestamps for proper FIFO eviction (Set doesn't preserve insertion order reliably)
  const seenItemsRef = useRef<Map<string, number>>(new Map())
  const retryCountRef = useRef(0) // Track retry attempts for exponential backoff
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null) // Track retry timeout for cleanup
  const MAX_SEEN_ITEMS = 500 // Maximum items to track in session deduplication
  const observerOptions = useMemo<IntersectionObserverInit>(
    () => ({
      root: null,
      rootMargin: '1200px 0px',
      threshold: 0,
    }),
    []
  )

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>(observerOptions)

  const loadMore = useCallback(async (signal?: AbortSignal, isRefresh = false) => {
    if (inFlight.current || (cursorRef.current === null && !isRefresh)) return
    inFlight.current = true
    errorRef.current = null
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const cursor = isRefresh ? undefined : (cursorRef.current ?? undefined)
      const res = await api.feed(cursor, signal)
      const nextCursor = res.nextCursor ?? null
      cursorRef.current = nextCursor

      // Session-level deduplication: filter out items already seen in this session
      // Optimistic items are excluded from deduplication (they're temporary)
      const newItems = (res.items ?? []).filter(item => {
        if (item.flags?.optimistic) return true // Optimistic cards are not deduped
        const key = getFeedKey(item)
        if (seenItemsRef.current.has(key)) return false

        // Enforce max size: if at limit, remove oldest entry (FIFO)
        // Map preserves insertion order, so first entry is oldest
        if (seenItemsRef.current.size >= MAX_SEEN_ITEMS) {
          const firstKey = seenItemsRef.current.keys().next().value
          if (firstKey) seenItemsRef.current.delete(firstKey)
        }

        // Store with timestamp for potential future use (e.g., TTL-based eviction)
        seenItemsRef.current.set(key, Date.now())
        return true
      })

      // Deterministic reconciliation: match optimistic items to server responses
      // Match by content similarity (text, timestamp) or explicit ID mapping
      if (isRefresh && optimisticItemsRef.current.size > 0) {
        const optimisticItems = Array.from(optimisticItemsRef.current.values())

        // For each optimistic item, try to find matching server item
        for (const optimisticItem of optimisticItems) {
          // Check if server returned item with matching content/timestamp
          const matched = newItems.find(serverItem => {
            // Match by explicit ID if provided in refresh event
            // Or match by content similarity (text, timestamp within 5 seconds)
            const textMatch =
              optimisticItem.content?.body && serverItem.content?.body
                ? optimisticItem.content.body.trim() === serverItem.content.body.trim()
                : false
            const timeMatch =
              optimisticItem.content?.createdAt && serverItem.content?.createdAt
                ? Math.abs(
                    new Date(optimisticItem.content.createdAt).getTime() -
                      new Date(serverItem.content.createdAt).getTime()
                  ) < 5000
                : false
            return textMatch && timeMatch
          })

          if (matched) {
            // Server confirmed optimistic post - remove from optimistic map
            optimisticItemsRef.current.delete(optimisticItem.id)
          }
          // If no match found, optimistic item remains (will be handled by explicit remove event)
        }
      }

      // Reset retry counter on successful fetch
      retryCountRef.current = 0
      // Clear any pending retry timeout
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      
      setState(s => ({
        items: isRefresh ? newItems : [...s.items, ...newItems],
        cursor: nextCursor,
        loading: false,
        error: null,
      }))
    } catch (e: unknown) {
      if (isAbortError(e)) {
        setState(s => ({ ...s, loading: false }))
        return
      }

      // Check if this is a retryable error (network failures, 5xx errors)
      // Don't retry on 4xx (client errors) or if explicitly aborted
      const isRetryable =
        e instanceof HttpError
          ? e.status >= 500 // Server errors are retryable
          : e instanceof Error &&
            (e.message.includes('network') ||
              e.message.includes('fetch') ||
              e.message.includes('timeout') ||
              e.name === 'TypeError') // Network errors often throw TypeError

      const message = getErrorMessage(e, 'Failed to load feed')
      errorRef.current = message
      setState(s => ({ ...s, loading: false, error: message }))

      // Auto-retry on transient errors (max 3 attempts with exponential backoff)
      if (isRetryable && !isRefresh && !signal?.aborted) {
        const currentRetry = retryCountRef.current
        if (currentRetry < 3) {
          retryCountRef.current = currentRetry + 1
          const delay = Math.min(1000 * Math.pow(2, currentRetry), 4000)
          
          // Clear any existing retry timeout before setting a new one
          if (retryTimeoutRef.current !== null) {
            clearTimeout(retryTimeoutRef.current)
          }
          
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null
            if (!inFlight.current && cursorRef.current !== null && !signal?.aborted) {
              void loadMore(signal, isRefresh)
            }
          }, delay)
        } else {
          retryCountRef.current = 0 // Reset for next error
        }
      } else {
        retryCountRef.current = 0 // Reset on non-retryable errors
      }
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    cursorRef.current = state.cursor
  }, [state.cursor])

  useEffect(() => {
    errorRef.current = state.error
  }, [state.error])

  useEffect(() => {
    itemsCountRef.current = state.items.length
  }, [state.items.length])

  useEffect(() => {
    isIntersectingRef.current = isIntersecting
  }, [isIntersecting])

  useEffect(() => {
    if (!isIntersecting || cursorRef.current === null || pumpingRef.current || inFlight.current)
      return
    const ctrl = new AbortController()
    let pagesFetched = 0
    pumpingRef.current = true
    const pump = async () => {
      try {
        while (
          pagesFetched < MAX_PAGES_PER_INTERSECTION &&
          isIntersectingRef.current &&
          cursorRef.current !== null
        ) {
          pagesFetched += 1
          await loadMore(ctrl.signal)
          if (errorRef.current) break
        }
      } finally {
        pumpingRef.current = false
      }
    }
    void pump()

    // Cleanup: abort any in-flight requests on unmount or dependency change
    return () => {
      ctrl.abort()
    }
  }, [isIntersecting, loadMore])

  useEffect(() => {
    if (inFlight.current || state.cursor === null || state.items.length > 0) return
    const ctrl = new AbortController()
    loadMore(ctrl.signal)
    return () => ctrl.abort()
  }, [loadMore, state.cursor, state.items.length])

  // Filter out hidden/blocked items on initial load
  useEffect(() => {
    const negativeActions = loadNegativeActions()
    if (negativeActions.length === 0) return

    const hiddenIds = new Set(
      negativeActions.filter(a => a.action === 'hide' || a.action === 'report').map(a => a.itemId)
    )
    const blockedActorIds = new Set(
      negativeActions.filter(a => a.action === 'block' && a.actorId).map(a => String(a.actorId))
    )

    if (hiddenIds.size > 0 || blockedActorIds.size > 0) {
      setState(s => ({
        ...s,
        items: s.items.filter(item => {
          if (hiddenIds.has(item.id)) return false
          if (item.actor?.id && blockedActorIds.has(String(item.actor.id))) return false
          return true
        }),
      }))
    }
  }, [])

  // Handle optimistic feed inserts
  useEffect(() => {
    const handleOptimisticInsert = (event: CustomEvent<{ card: FeedCard }>) => {
      const card = event.detail.card
      optimisticItemsRef.current.set(card.id, card)
      // Optimistic cards excluded from dedupe (flags.optimistic: true)
      setState(s => ({
        ...s,
        items: [card, ...s.items],
      }))

      // Scroll to top to show the new post immediately
      requestAnimationFrame(() => {
        const river = document.querySelector('.river')
        if (river) {
          river.scrollTop = 0
          // Also try smooth scroll
          river.scrollTo({ top: 0, behavior: 'smooth' })
        }
      })
    }

    const handleRefresh = (
      event: CustomEvent<{ removeOptimisticId: string; newPostId: string }>
    ) => {
      const { removeOptimisticId } = event.detail
      const optimisticItem = optimisticItemsRef.current.get(removeOptimisticId)

      // Store optimistic item temporarily in case refresh fails
      const optimisticBackup = optimisticItem ? { ...optimisticItem } : null

      // Don't remove optimistic post yet - wait for server confirmation
      // Mark it for removal but keep it visible until server confirms
      if (!inFlight.current) {
        cursorRef.current = undefined
        const ctrl = new AbortController()
        loadMore(ctrl.signal, true)
          .then(() => {
            // Refresh succeeded - server should have returned the new post
            // Remove optimistic post only after successful refresh
            optimisticItemsRef.current.delete(removeOptimisticId)
            setState(s => ({
              ...s,
              items: s.items.filter(item => item.id !== removeOptimisticId),
            }))
          })
          .catch(e => {
            // Refresh failed - restore optimistic post to prevent silent disappearance
            if (!isAbortError(e) && optimisticBackup) {
              // Re-add optimistic post if refresh failed
              optimisticItemsRef.current.set(removeOptimisticId, optimisticBackup)
              setState(s => {
                // Ensure optimistic post is still in items
                const hasOptimistic = s.items.some(item => item.id === removeOptimisticId)
                if (!hasOptimistic) {
                  return { ...s, items: [optimisticBackup, ...s.items] }
                }
                return s
              })

              // Show error with retry option
              const message = getErrorMessage(e, 'Failed to refresh feed')
              errorRef.current = message
              setState(s => ({ ...s, error: message }))

              // Dispatch event for explicit error state UI
              window.dispatchEvent(
                new CustomEvent('feed:optimistic-error', {
                  detail: { optimisticId: removeOptimisticId, error: message },
                })
              )
            }
          })
      }
    }

    const handleRemoveOptimistic = (
      event: CustomEvent<{ optimisticId: string; error: string }>
    ) => {
      const { optimisticId, error } = event.detail
      const optimisticItem = optimisticItemsRef.current.get(optimisticId)

      // Only remove if user explicitly dismisses or post is confirmed rejected
      // Mark as failed but keep in feed with error state
      if (optimisticItem) {
        // Update optimistic item to show error state instead of removing
        const failedItem: FeedCard = {
          ...optimisticItem,
          flags: { ...optimisticItem.flags, optimistic: true, failed: true },
          content: optimisticItem.content
            ? {
                ...optimisticItem.content,
                body: optimisticItem.content.body
                  ? `${optimisticItem.content.body}\n\n[Failed to post: ${error}]`
                  : undefined,
              }
            : undefined,
        }

        optimisticItemsRef.current.set(optimisticId, failedItem)
        setState(s => ({
          ...s,
          items: s.items.map(item => (item.id === optimisticId ? failedItem : item)),
        }))

        // Dispatch event for explicit error state UI (retry button, etc.)
        window.dispatchEvent(
          new CustomEvent('feed:optimistic-error', {
            detail: { optimisticId, error },
          })
        )
      }
    }

    // Handle explicit user dismissal of failed optimistic post
    const handleDismissOptimistic = (event: CustomEvent<{ optimisticId: string }>) => {
      const { optimisticId } = event.detail
      optimisticItemsRef.current.delete(optimisticId)
      setState(s => ({
        ...s,
        items: s.items.filter(item => item.id !== optimisticId),
      }))
    }

    const handleHide = (event: CustomEvent<{ itemType: string; itemId: string }>) => {
      const { itemId } = event.detail
      setState(s => ({
        ...s,
        items: s.items.filter(item => item.id !== itemId),
      }))
    }

    const handleBlock = (
      event: CustomEvent<{ itemType: string; itemId: string; actorId?: string | number }>
    ) => {
      const { itemId, actorId } = event.detail
      setState(s => ({
        ...s,
        items: s.items.filter(item => {
          if (item.id === itemId) return false
          if (actorId && item.actor?.id === actorId) return false
          return true
        }),
      }))
    }

    const handleReport = (event: CustomEvent<{ itemType: string; itemId: string }>) => {
      const { itemId } = event.detail
      setState(s => ({
        ...s,
        items: s.items.filter(item => item.id !== itemId),
      }))
    }

    window.addEventListener('feed:optimistic-insert', handleOptimisticInsert as EventListener)
    window.addEventListener('feed:refresh', handleRefresh as EventListener)
    window.addEventListener('feed:remove-optimistic', handleRemoveOptimistic as EventListener)
    window.addEventListener('feed:dismiss-optimistic', handleDismissOptimistic as EventListener)
    window.addEventListener('feed:hide', handleHide as EventListener)
    window.addEventListener('feed:block', handleBlock as EventListener)
    window.addEventListener('feed:report', handleReport as EventListener)

    return () => {
      window.removeEventListener('feed:optimistic-insert', handleOptimisticInsert as EventListener)
      window.removeEventListener('feed:refresh', handleRefresh as EventListener)
      window.removeEventListener('feed:remove-optimistic', handleRemoveOptimistic as EventListener)
      window.removeEventListener(
        'feed:dismiss-optimistic',
        handleDismissOptimistic as EventListener
      )
      window.removeEventListener('feed:hide', handleHide as EventListener)
      window.removeEventListener('feed:block', handleBlock as EventListener)
      window.removeEventListener('feed:report', handleReport as EventListener)
    }
  }, [loadMore])

  // Cleanup on unmount: clear seen items, optimistic items, and retry timers
  useEffect(() => {
    const seenItems = seenItemsRef.current
    const optimisticItems = optimisticItemsRef.current
    return () => {
      seenItems.clear()
      optimisticItems.clear()
      // Clear any pending retry timeout to prevent post-unmount execution
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [])

  const hasNext = useMemo(() => state.cursor !== null, [state.cursor])
  return { ...state, hasNext, loadMore, sentinelRef }
}
