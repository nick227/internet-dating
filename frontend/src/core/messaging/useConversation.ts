import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { ApiMessageItem } from '../../api/contracts'
import type { Id } from '../../api/types'

type ConversationState = {
  messages: ApiMessageItem[]
  cursor: Id | null | undefined
  loading: boolean
  loadingMore: boolean
  error: string | null
}

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) return error.name === 'AbortError'
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError'
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function useConversation(conversationId: Id | undefined) {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    cursor: undefined,
    loading: false,
    loadingMore: false,
    error: null
  })

  useEffect(() => {
    if (!conversationId) return
    const ctrl = new AbortController()
    let cancelled = false
    setState({ messages: [], cursor: undefined, loading: true, loadingMore: false, error: null })
    api.messaging.conversation(conversationId, undefined, ctrl.signal)
      .then((res) => {
        if (cancelled) return
        const items = res.messages.slice().reverse()
        setState({ messages: items, cursor: res.nextCursorId ?? null, loading: false, loadingMore: false, error: null })
      })
      .catch((e: unknown) => {
        if (cancelled || isAbortError(e)) return
        setState({
          messages: [],
          cursor: null,
          loading: false,
          loadingMore: false,
          error: getErrorMessage(e, 'Failed to load messages')
        })
      })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [conversationId])

  const loadOlder = useCallback(async () => {
    if (!conversationId || state.loadingMore || state.cursor === null) return
    setState((s) => ({ ...s, loadingMore: true, error: null }))
    try {
      const res = await api.messaging.conversation(conversationId, state.cursor)
      const items = res.messages.slice().reverse()
      setState((s) => ({
        messages: items.concat(s.messages),
        cursor: res.nextCursorId ?? null,
        loading: false,
        loadingMore: false,
        error: null
      }))
    } catch (e: unknown) {
      if (isAbortError(e)) return
      setState((s) => ({ ...s, loadingMore: false, error: getErrorMessage(e, 'Failed to load messages') }))
    }
  }, [conversationId, state.cursor, state.loadingMore])

  const appendMessage = useCallback((message: ApiMessageItem) => {
    setState((s) => ({ ...s, messages: s.messages.concat(message) }))
  }, [])

  const removeMessage = useCallback((tempId: Id) => {
    const key = String(tempId)
    setState((s) => ({ ...s, messages: s.messages.filter((m) => String(m.id) !== key) }))
  }, [])

  const replaceMessage = useCallback((tempId: Id, next: ApiMessageItem) => {
    const key = String(tempId)
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) => (String(m.id) === key ? next : m))
    }))
  }, [])

  return { ...state, loadOlder, appendMessage, removeMessage, replaceMessage }
}
