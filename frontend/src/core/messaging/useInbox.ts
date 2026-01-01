import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
// eslint-disable-next-line no-restricted-imports
import type { ApiInboxConversation } from '../../api/contracts'
import type { Id } from '../../api/types'
import { getErrorMessage } from '../utils/errors'

export function useInbox() {
  const [state, setState] = useState<{
    conversations: ApiInboxConversation[]
    nextCursorId: Id | null
    loading: boolean
    loadingMore: boolean
    error: string | null
  }>({
    conversations: [],
    nextCursorId: null,
    loading: true,
    loadingMore: false,
    error: null,
  })
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick(v => v + 1), [])

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    setState(s => ({ ...s, loading: true, error: null }))
    api.messaging
      .inbox(undefined, undefined, ctrl.signal)
      .then(res => {
        if (cancelled) return
        setState({
          conversations: res.conversations ?? [],
          nextCursorId: res.nextCursorId ?? null,
          loading: false,
          loadingMore: false,
          error: null,
        })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState(s => ({
          ...s,
          loading: false,
          loadingMore: false,
          error: getErrorMessage(e, 'Failed to load inbox'),
        }))
      })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [tick])

  const loadMore = useCallback(async () => {
    if (state.loadingMore || state.nextCursorId == null) return
    setState(s => ({ ...s, loadingMore: true, error: null }))
    try {
      const res = await api.messaging.inbox(state.nextCursorId)
      setState(s => ({
        ...s,
        conversations: [...s.conversations, ...(res.conversations ?? [])],
        nextCursorId: res.nextCursorId ?? null,
        loadingMore: false,
        error: null,
      }))
    } catch (e: unknown) {
      setState(s => ({
        ...s,
        loadingMore: false,
        error: getErrorMessage(e, 'Failed to load more'),
      }))
    }
  }, [state.loadingMore, state.nextCursorId])

  return {
    data: { conversations: state.conversations, nextCursorId: state.nextCursorId },
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    refresh,
    loadMore,
  }
}
