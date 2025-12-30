import { useCallback, useEffect, useRef } from 'react'
import type { FeedCard } from '../../api/types'
import { useIntersection } from '../hooks/useIntersection'

type SeenEventPayload = {
  itemType: string
  itemId: string
  position: number
  timestamp: number
}

const SEEN_STORAGE_KEY = 'feed:seen'
const SEEN_CACHE_KEY = 'feed:seen-cache'
const BATCH_DELAY_MS = 2000
const MAX_BATCH_SIZE = 50
const SEEN_CACHE_TTL = 48 * 60 * 60 * 1000 // 48 hours
const MAX_CACHE_SIZE = 1000 // Maximum entries in seen cache

// Singleton class to manage seen batch state (prevents module-level leaks)
class SeenBatchManager {
  private batch: SeenEventPayload[] = []
  private timeout: ReturnType<typeof setTimeout> | null = null
  private cache: Map<string, number> | null = null
  private cacheDirty = false

  constructor() {
    // Cleanup on hot reload (development) - Vite-specific
    if (typeof import.meta !== 'undefined' && import.meta.hot) {
      import.meta.hot.dispose(() => {
        this.cleanup()
      })
    }
  }

  getCache(): Map<string, number> {
    if (this.cache && !this.cacheDirty) {
      return this.cache
    }

    try {
      const cached = localStorage.getItem(SEEN_CACHE_KEY)
      if (!cached) {
        this.cache = new Map()
        this.cacheDirty = false
        return this.cache
      }
      const data = JSON.parse(cached)
      const now = Date.now()
      const map = new Map<string, number>()
      for (const [key, timestamp] of Object.entries(data)) {
        if (now - (timestamp as number) < SEEN_CACHE_TTL) {
          map.set(key, timestamp as number)
        }
      }
      this.cache = map
      this.cacheDirty = false
      return map
    } catch {
      this.cache = new Map()
      this.cacheDirty = false
      return this.cache
    }
  }

  markSeenInCache(cardId: string) {
    const cache = this.getCache()
    cache.set(cardId, Date.now())
    this.cacheDirty = true

    // Enforce max size with LRU eviction (remove oldest entries)
    // Only sort if we're over limit to avoid O(n log n) on every write
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries())
      entries.sort((a, b) => a[1] - b[1]) // Sort by timestamp
      const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE)
      toRemove.forEach(([key]) => cache.delete(key))
    }

    try {
      // Build object directly during iteration (single pass, no Object.fromEntries)
      const obj: Record<string, number> = {}
      for (const [key, value] of cache) {
        obj[key] = value
      }
      localStorage.setItem(SEEN_CACHE_KEY, JSON.stringify(obj))
      this.cacheDirty = false
    } catch (e) {
      // If quota exceeded, try to clear old entries
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        const entries = Array.from(cache.entries())
        entries.sort((a, b) => a[1] - b[1])
        const toKeep = entries.slice(-Math.floor(MAX_CACHE_SIZE * 0.5))
        cache.clear()
        toKeep.forEach(([key, value]) => cache.set(key, value))
        try {
          // Build object directly
          const obj: Record<string, number> = {}
          for (const [key, value] of cache) {
            obj[key] = value
          }
          localStorage.setItem(SEEN_CACHE_KEY, JSON.stringify(obj))
          this.cacheDirty = false
        } catch {
          // Still failed, clear cache
          this.cache = new Map()
          this.cacheDirty = false
        }
      }
    }
  }

  isSeenInCache(cardId: string): boolean {
    return this.getCache().has(cardId)
  }

  addToBatch(payload: SeenEventPayload) {
    this.batch.push(payload)
    this.scheduleFlush()
  }

  private scheduleFlush() {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = setTimeout(() => this.flush(), BATCH_DELAY_MS)
  }

  private flush() {
    if (this.batch.length === 0) return

    const batch = [...this.batch]
    this.batch = []

    window.dispatchEvent(
      new CustomEvent('feed:seen-batch', {
        detail: { items: batch },
      })
    )
  }

  // Force immediate flush (for unload/visibilitychange)
  forceFlush() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.flush()
  }

  cleanup() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.flush() // Flush any remaining items
  }
}

// Singleton instance (exported for useFeedSync)
export const seenBatchManager = new SeenBatchManager()

function markSeenInCache(cardId: string) {
  seenBatchManager.markSeenInCache(cardId)
}

function isSeenInCache(cardId: string): boolean {
  return seenBatchManager.isSeenInCache(cardId)
}

function saveSeenToLocalStorage(payload: SeenEventPayload) {
  try {
    const existing = localStorage.getItem(SEEN_STORAGE_KEY)
    const items: SeenEventPayload[] = existing ? JSON.parse(existing) : []
    items.push(payload)

    // Keep only last MAX_BATCH_SIZE items to prevent storage bloat
    const trimmed = items.slice(-MAX_BATCH_SIZE)
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
}

export function useFeedSeen(card: FeedCard, position: number) {
  const hasSeenRef = useRef(false)
  const hasEmittedRef = useRef(false)
  const cardElementRef = useRef<HTMLElement | null>(null)
  const observerOptions = useRef<IntersectionObserverInit>({
    root: null,
    rootMargin: '0px',
    threshold: 0.5, // Card is considered seen when 50% visible
  })

  const { ref: intersectionRef, isIntersecting } = useIntersection<HTMLElement>(
    observerOptions.current
  )

  // Combined ref callback that sets both refs
  const combinedRef = useCallback(
    (element: HTMLElement | null) => {
      cardElementRef.current = element
      intersectionRef(element)
    },
    [intersectionRef]
  )

  // Extract stable values for dependency array
  const cardId = card.id
  const cardKind = card.kind
  const isOptimistic = card.flags?.optimistic ?? false

  useEffect(() => {
    // Skip seen tracking for optimistic cards
    if (isOptimistic) return

    // Skip if already emitted (idempotency - prevent repeated writes)
    if (hasEmittedRef.current) return

    // Only process when card enters viewport
    if (!isIntersecting) return

    // Check cache first (prevent déjà vu on refresh)
    // If in cache, mark as seen but don't emit again
    if (isSeenInCache(cardId)) {
      hasSeenRef.current = true
      hasEmittedRef.current = true
      return
    }

    // Skip if already marked as seen in this session
    if (hasSeenRef.current) return

    // Mark as seen and emit event (idempotent - only once per card per session)
    hasSeenRef.current = true
    hasEmittedRef.current = true

    // Calculate actual scroll position (distance from top of feed container)
    // Fallback to position index * estimated card height if element not available
    let scrollPosition = position * 400 // Fallback: estimate ~400px per card
    if (cardElementRef.current) {
      const rect = cardElementRef.current.getBoundingClientRect()
      const riverContainer = document.querySelector('.river')
      if (riverContainer) {
        const containerRect = riverContainer.getBoundingClientRect()
        scrollPosition = riverContainer.scrollTop + (rect.top - containerRect.top)
      } else {
        scrollPosition = window.scrollY + rect.top
      }
    }

    const payload: SeenEventPayload = {
      itemType: cardKind,
      itemId: cardId,
      position: Math.round(scrollPosition), // Use actual scroll position instead of array index
      timestamp: Date.now(),
    }

    // Save to cache (prevents déjà vu on refresh)
    markSeenInCache(cardId)

    // Save to localStorage immediately (fast, no API)
    saveSeenToLocalStorage(payload)

    // Add to batch for API sync (using singleton manager)
    seenBatchManager.addToBatch(payload)

    // Dispatch individual event for immediate use
    window.dispatchEvent(
      new CustomEvent('feed:seen', {
        detail: payload,
      })
    )
  }, [isIntersecting, cardId, cardKind, isOptimistic, position])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Reset refs when card unmounts (allows re-tracking if card is re-mounted)
      hasSeenRef.current = false
      hasEmittedRef.current = false
    }
  }, [cardId])

  return { cardRef: combinedRef, isIntersecting }
}
