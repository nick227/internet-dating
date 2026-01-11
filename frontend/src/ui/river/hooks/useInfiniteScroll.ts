import { type RefObject, useEffect, useRef } from 'react'

type UseInfiniteScrollOptions = {
  rootRef: RefObject<HTMLDivElement>
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  rootMargin?: string
}

export function useInfiniteScroll({
  rootRef,
  onLoadMore,
  hasMore,
  loading,
  rootMargin = '800px 0px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        if (loading || !hasMore) return
        onLoadMore()
      },
      {
        root,
        rootMargin,
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [rootRef, hasMore, onLoadMore, loading, rootMargin])

  return { sentinelRef }
}
