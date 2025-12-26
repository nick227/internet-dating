import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FeedCard } from '../../api/types'
import { useRiverFeed } from '../../core/feed/useRiverFeed'
import { RiverCard } from './RiverCard'
import { RiverSkeleton } from './RiverSkeleton'
import { Toast } from '../ui/Toast'

export function River() {
  const nav = useNavigate()
  const { items, cursor, loading, error, loadMore, sentinelRef } = useRiverFeed()
  const [toast, setToast] = useState<string | null>(null)

  const data = useMemo(() => items, [items])
  const getCardKey = (card: FeedCard, index: number) => (
    card.kind === 'profile' ? card.userId : card.postId ?? index
  )

  return (
    <>
      <Toast message={toast} onClose={() => setToast(null)} />
      <div className="river u-hide-scroll">
        <div className="river__pad">
          {data.map((card, idx) => (
            <RiverCard
              key={getCardKey(card, idx)}
              card={card}
              onOpenProfile={(userId) => nav(`/profiles/${encodeURIComponent(String(userId))}`)}
              onToast={setToast}
            />
          ))}

          {loading && <RiverSkeleton />}

          <div ref={sentinelRef} />
          {error && (
            <div className="u-glass u-pad-4" style={{ borderRadius: 'var(--r-4)' }}>
              <div style={{ fontSize: 'var(--fs-3)' }}>Feed error</div>
              <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>{error}</div>
              <button className="actionBtn u-mt-4" onClick={loadMore} type="button">Retry</button>
            </div>
          )}
          {!loading && !error && data.length === 0 && (
            <div className="u-glass u-pad-4" style={{ borderRadius: 'var(--r-4)' }}>
              <div style={{ fontSize: 'var(--fs-3)' }}>No matches yet</div>
              <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
                Check back soon for fresh profiles and posts.
              </div>
            </div>
          )}
          {cursor === null && data.length > 0 && (
            <div className="u-muted" style={{ textAlign: 'center', padding: '12px 0 16px' }}>
              You are all caught up.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
