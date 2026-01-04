import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type PortalListEmptyCopy = {
  idle: string
  filtered?: string
}

type PortalListProps<T> = {
  items: T[]
  loading: boolean
  renderItem: (item: T) => ReactNode
  isFiltered?: boolean
  empty?: PortalListEmptyCopy
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

const LOAD_MORE_ROOT_MARGIN = '200px'
const LOAD_MORE_THRESHOLD = 0.1

export function PortalList<T>({
  items,
  loading,
  renderItem,
  isFiltered = false,
  empty = { idle: 'Nothing here yet.', filtered: 'No results found.' },
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: PortalListProps<T>) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!onLoadMore || !hasMore || !loadMoreRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting) && !loadingMore) {
          onLoadMore()
        }
      },
      { root: null, rootMargin: LOAD_MORE_ROOT_MARGIN, threshold: LOAD_MORE_THRESHOLD }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [onLoadMore, loadingMore, hasMore])

  if (loading && items.length === 0) {
    return (
      <div className="portal-list-empty">
        <div className="portal-list-empty__spinner"></div>
        <p className="portal-list-empty__text">Loading...</p>
      </div>
    )
  }

  if (items.length === 0) {
    const emptyCopy = isFiltered ? (empty.filtered ?? empty.idle) : empty.idle
    return (
      <div className="portal-list-empty">
        <p className="portal-list-empty__text">{emptyCopy}</p>
        <p className="portal-list-empty__hint">Try adjusting your search or filters.</p>
      </div>
    )
  }

  return (
    <div className="portal-grid">
      {items.map(renderItem)}
      {hasMore && (
        <div ref={loadMoreRef} className="portal-list__load-more">
          {loadingMore && <div className="portal-list__load-more-spinner"></div>}
        </div>
      )}
    </div>
  )
}
