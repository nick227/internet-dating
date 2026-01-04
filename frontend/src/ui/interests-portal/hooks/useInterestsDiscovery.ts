import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type InterestItem } from '../../../api/client'

export function useInterestsDiscovery(
  subjectId: string | null,
  searchQuery: string,
  onReconcile?: (items: Array<{ id: string; selected: boolean }>) => void
) {
  const [items, setItems] = useState<InterestItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadInterests = useCallback(async (cursor: string | null = null, append = false) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const isLoadingMore = cursor !== null
    if (isLoadingMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError(null)
    }

    try {
      const res = await api.interests.list({
        subjectId: subjectId || undefined,
        q: searchQuery || undefined,
        cursorId: cursor || undefined,
        take: 20,
      }, abortControllerRef.current.signal)

      setItems(prev => {
        const nextItems = append ? [...prev, ...res.items] : res.items
        if (onReconcile) {
          onReconcile(nextItems.map(item => ({ id: item.id, selected: item.selected })))
        }
        return nextItems
      })
      setNextCursor(res.nextCursor)
      setHasMore(res.hasMore)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Failed to load interests')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [subjectId, searchQuery])

  useEffect(() => {
    // Reset state when filters change
    setItems([])
    setNextCursor(null)
    setHasMore(true)
    loadInterests(null, false)
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [loadInterests])

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && nextCursor) {
      loadInterests(nextCursor, true)
    }
  }, [loadInterests, loadingMore, hasMore, nextCursor])

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh: () => loadInterests(null, false),
  }
}
