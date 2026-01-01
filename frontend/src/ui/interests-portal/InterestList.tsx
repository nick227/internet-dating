import { useEffect, useRef } from 'react'
import { InterestRow } from './InterestRow'
import type { InterestItem } from '../../../api/client'

interface InterestListProps {
  items: InterestItem[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  onToggle: (interestId: string, selected: boolean) => void
  isProcessing: (id: string) => boolean
}

const LOAD_MORE_ROOT_MARGIN = '200px'
const LOAD_MORE_THRESHOLD = 0.1

export function InterestList({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onToggle,
  isProcessing,
}: InterestListProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || typeof IntersectionObserver === 'undefined') return
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
      <div className="interest-list-empty">
        <div className="interest-list-empty__spinner"></div>
        <p className="interest-list-empty__text">Loading interests...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="interest-list-empty">
        <p className="interest-list-empty__text">No interests found.</p>
        <p className="interest-list-empty__hint">Try adjusting your search or filters.</p>
      </div>
    )
  }

  return (
    <div className="interest-list">
      {items.map(interest => (
        <InterestRow
          key={interest.id}
          interest={interest}
          onToggle={onToggle}
          processing={isProcessing(interest.id)}
        />
      ))}
      {hasMore && (
        <div ref={loadMoreRef} className="interest-list__load-more">
          {loadingMore && (
            <div className="interest-list__load-more-spinner"></div>
          )}
        </div>
      )}
    </div>
  )
}
