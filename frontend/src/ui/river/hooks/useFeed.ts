import { useRiverFeedPhased } from '../../../core/feed/useRiverFeedPhased'
import type { FeedCard } from '../../../api/types'

export type FeedState = {
  items: FeedCard[]
  cursor: string | null | undefined
  loading: boolean
  error: string | null
  loadMore: () => void
}

export function useFeed(): FeedState {
  const { items, cursor, loading, error, loadMore } = useRiverFeedPhased()

  return {
    items,
    cursor,
    loading,
    error,
    loadMore,
  }
}
