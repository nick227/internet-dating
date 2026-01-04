import { PortalList } from '../personality-portal/PortalList'
import { InterestRow } from './InterestRow'
import type { InterestItem } from '../../api/client'

interface InterestListProps {
  items: InterestItem[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  onToggle: (interestId: string) => void
  isProcessing: (id: string) => boolean
  isFiltered?: boolean
}

export function InterestList({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onToggle,
  isProcessing,
  isFiltered = false,
}: InterestListProps) {
  return (
    <PortalList
      items={items}
      loading={loading}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      isFiltered={isFiltered}
      empty={{ idle: 'No interests found.', filtered: 'No interests match your filters.' }}
      renderItem={interest => (
        <InterestRow
          key={interest.id}
          interest={interest}
          onToggle={onToggle}
          processing={isProcessing(interest.id)}
        />
      )}
    />
  )
}
