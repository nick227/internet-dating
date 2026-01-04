import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
// eslint-disable-next-line no-restricted-imports
import type { ApiMessageItem } from '../../api/contracts'
import type { Id } from '../../api/types'
import { getErrorMessage } from '../utils/errors'
import { toIdString, idsEqual } from '../utils/ids'
import { realtime } from '../../api/realtime'

type ConversationState = {
  messages: ApiMessageItem[]
  cursor: Id | null | undefined
  loading: boolean
  loadingMore: boolean
  error: string | null
}

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

export function useConversation(conversationId: Id | undefined) {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    cursor: undefined,
    loading: false,
    loadingMore: false,
    error: null,
  })

  useEffect(() => {
    if (!conversationId) return
    const ctrl = new AbortController()
    let cancelled = false
    setState({ messages: [], cursor: undefined, loading: true, loadingMore: false, error: null })
    api.messaging
      .conversation(conversationId, undefined, ctrl.signal)
      .then(res => {
        if (cancelled) return
        // Process in reverse order (single pass)
        const items: ApiMessageItem[] = []
        for (let i = res.messages.length - 1; i >= 0; i--) {
          items.push(res.messages[i])
        }
        setState({
          messages: items,
          cursor: res.nextCursorId ?? null,
          loading: false,
          loadingMore: false,
          error: null,
        })
      })
      .catch((e: unknown) => {
        if (cancelled || isAbortError(e)) return
        setState({
          messages: [],
          cursor: null,
          loading: false,
          loadingMore: false,
          error: getErrorMessage(e, 'Failed to load messages'),
        })
      })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return

    realtime.subscribe([{ kind: 'conversation', id: String(conversationId) }])

    const unsubscribe = realtime.on('server.messenger.message_new', data => {
      if (!idsEqual(data.conversationId, conversationId)) return

      const message: ApiMessageItem = {
        id: data.messageId,
        body: data.body,
        senderId: data.senderId,
        createdAt: data.createdAt,
        isSystem: data.isSystem,
      }

      setState(s => {
        const existingIndex = s.messages.findIndex(m => idsEqual(m.id, message.id))
        if (existingIndex !== -1) return s

        return { ...s, messages: [...s.messages, message] }
      })
    })

    return unsubscribe
  }, [conversationId])

  const loadOlder = useCallback(async () => {
    if (!conversationId || state.loadingMore || state.cursor === null) return
    setState(s => ({ ...s, loadingMore: true, error: null }))
    try {
      const res = await api.messaging.conversation(conversationId, state.cursor)
      // Process in reverse order (single pass)
      const items: ApiMessageItem[] = []
      for (let i = res.messages.length - 1; i >= 0; i--) {
        items.push(res.messages[i])
      }
      setState(s => ({
        messages: [...items, ...s.messages], // Prepend using spread
        cursor: res.nextCursorId ?? null,
        loading: false,
        loadingMore: false,
        error: null,
      }))
    } catch (e: unknown) {
      if (isAbortError(e)) return
      setState(s => ({
        ...s,
        loadingMore: false,
        error: getErrorMessage(e, 'Failed to load messages'),
      }))
    }
  }, [conversationId, state.cursor, state.loadingMore])

  return { ...state, loadOlder }
}
