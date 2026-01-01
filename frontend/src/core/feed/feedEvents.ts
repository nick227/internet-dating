import type { FeedCard } from '../../api/types'

export type FeedOptimisticInsertDetail = {
  card: FeedCard
}

export type FeedRefreshDetail = {
  removeOptimisticId: string
  newPostId: string
}

export type FeedRemoveOptimisticDetail = {
  optimisticId: string
  error?: string
}

const canDispatch = () => typeof window !== 'undefined'

export const dispatchFeedOptimisticInsert = (card: FeedCard) => {
  if (!canDispatch()) return
  window.dispatchEvent(
    new CustomEvent<FeedOptimisticInsertDetail>('feed:optimistic-insert', {
      detail: { card },
    })
  )
}

export const dispatchFeedRefresh = (detail: FeedRefreshDetail) => {
  if (!canDispatch()) return
  window.dispatchEvent(new CustomEvent<FeedRefreshDetail>('feed:refresh', { detail }))
}

export const dispatchFeedRemoveOptimistic = (detail: FeedRemoveOptimisticDetail) => {
  if (!canDispatch()) return
  window.dispatchEvent(new CustomEvent<FeedRemoveOptimisticDetail>('feed:remove-optimistic', { detail }))
}
