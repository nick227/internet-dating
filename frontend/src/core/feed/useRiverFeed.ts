import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { FeedCard } from '../../api/types'
import { useIntersection } from '../hooks/useIntersection'

type RiverState = { items: FeedCard[]; cursor: string | null | undefined; loading: boolean; error: string | null }

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError'
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function useRiverFeed() {
  const [state, setState] = useState<RiverState>({ items: [], cursor: undefined, loading: false, error: null })
  const inFlight = useRef(false)
  const cursorRef = useRef<string | null | undefined>(undefined)
  const errorRef = useRef<string | null>(null)
  const isIntersectingRef = useRef(false)
  const pumpingRef = useRef(false)
  const observerOptions = useMemo<IntersectionObserverInit>(() => ({
    root: null,
    rootMargin: '1200px 0px',
    threshold: 0
  }), [])

  const { ref: sentinelRef, isIntersecting } = useIntersection<HTMLDivElement>(observerOptions)

  const loadMore = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current || cursorRef.current === null) return
    inFlight.current = true
    errorRef.current = null
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await api.feed(cursorRef.current ?? undefined, signal)
      const nextCursor = res.nextCursor ?? null
      cursorRef.current = nextCursor
      setState((s) => ({
        items: s.items.concat(res.items ?? []),
        cursor: nextCursor,
        loading: false,
        error: null
      }))
    } catch (e: unknown) {
      if (isAbortError(e)) {
        setState((s) => ({ ...s, loading: false }))
        return
      }
      const message = getErrorMessage(e, 'Failed to load feed')
      errorRef.current = message
      setState((s) => ({ ...s, loading: false, error: message }))
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
    isIntersectingRef.current = isIntersecting
  }, [isIntersecting])

  useEffect(() => {
    if (!isIntersecting || state.loading || state.cursor === null || pumpingRef.current) return
    const ctrl = new AbortController()
    let cancelled = false
    pumpingRef.current = true
    const pump = async () => {
      try {
        while (!cancelled && isIntersectingRef.current && cursorRef.current !== null) {
          await loadMore(ctrl.signal)
          if (errorRef.current) break
        }
      } finally {
        pumpingRef.current = false
      }
    }
    pump()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [isIntersecting, loadMore, state.cursor, state.loading])

  useEffect(() => {
    if (state.loading || state.cursor === null || state.items.length > 0) return
    const ctrl = new AbortController()
    loadMore(ctrl.signal)
    return () => ctrl.abort()
  }, [loadMore, state.cursor, state.items.length, state.loading])

  const hasNext = useMemo(() => state.cursor !== null, [state.cursor])
  return { ...state, hasNext, loadMore, sentinelRef }
}
