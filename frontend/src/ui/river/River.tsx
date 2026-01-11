import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiverErrorBoundary } from './RiverErrorBoundary'
import { Toast } from '../ui/Toast'
import { useFeed } from './hooks/useFeed'
import { useInfiniteScroll } from './hooks/useInfiniteScroll'
import { useScrollToTop } from './hooks/useScrollToTop'
import { FeedCardRenderer } from './FeedCardRenderer'
import { FeedStates } from './FeedStates'

export function River() {
  const nav = useNavigate()
  const [toast, setToast] = useState<string | null>(null)
  const riverRef = useRef<HTMLDivElement>(null)
  
  const { items, cursor, loading, error, loadMore } = useFeed()
  
  const { sentinelRef } = useInfiniteScroll({
    rootRef: riverRef,
    onLoadMore: loadMore,
    hasMore: cursor !== null,
    loading,
  })

  useScrollToTop(riverRef, items.length > 0 && !loading)

  const handleOpenProfile = useCallback(
    (userId: string | number) => {
      nav(`/profiles/${encodeURIComponent(String(userId))}`)
    },
    [nav]
  )

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />
      <RiverErrorBoundary>
        <div ref={riverRef} className="river u-hide-scroll">
          <div className="river__pad">
            <FeedCardRenderer
              items={items}
              onOpenProfile={handleOpenProfile}
              onToast={setToast}
            />
            
            <div ref={sentinelRef} />

            <FeedStates
              loading={loading}
              error={error}
              itemCount={items.length}
              hasMore={cursor !== null}
              onRetry={loadMore}
            />
          </div>
        </div>
      </RiverErrorBoundary>
    </>
  )
}
