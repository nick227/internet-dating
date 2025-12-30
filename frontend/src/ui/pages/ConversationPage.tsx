import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../core/auth/useAuth'
import { prettyIntent } from '../../core/format/prettyIntent'
import { useMatches } from '../../core/matches/useMatches'
import { useConversation } from '../../core/messaging/useConversation'
import { getRandomSuggestions } from '../../core/messaging/messageHelpers'
import { IconButton } from '../ui/IconButton'
import { Avatar } from '../ui/Avatar'
import { SmartTextarea } from '../form/SmartTextarea'
import { toIdString, idsEqual } from '../../core/utils/ids'

export function ConversationPage() {
  const nav = useNavigate()
  const { conversationId } = useParams()
  const id = conversationId ? decodeURIComponent(conversationId) : undefined
  const { userId } = useAuth()
  const { data: matchData } = useMatches()
  const {
    messages,
    cursor,
    loading,
    loadingMore,
    error,
    loadOlder,
    appendMessage,
    removeMessage,
    replaceMessage,
  } = useConversation(id)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const markedRef = useRef(new Set<string>())
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const suppressScrollRef = useRef(false)
  const [messageSuggestions, setMessageSuggestions] = useState<string[]>([])

  const match = id ? (matchData?.matches.find(m => idsEqual(m.conversation?.id, id)) ?? null) : null
  const otherUser =
    match && userId ? (idsEqual(match.userAId, userId) ? match.userB : match.userA) : null
  const headerName =
    otherUser?.profile?.displayName ?? (otherUser ? `User ${otherUser.id}` : 'Conversation')
  const headerAvatar = otherUser?.profile?.avatarUrl ?? null
  const headerMeta = otherUser?.profile
    ? [
        otherUser.profile.locationText,
        otherUser.profile.intent ? prettyIntent(otherUser.profile.intent) : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : null

  useEffect(() => {
    if (userId == null) return
    const unmarked = messages.filter(msg => {
      const key = toIdString(msg.id)
      if (idsEqual(msg.senderId, userId) || markedRef.current.has(key)) return false
      markedRef.current.add(key)
      return true
    })
    for (const msg of unmarked) {
      api.messaging.markRead(msg.id).catch(() => null)
    }
    if (markedRef.current.size > messages.length * 2) {
      markedRef.current.clear()
      messages.forEach(msg => markedRef.current.add(toIdString(msg.id)))
    }
  }, [messages, userId])

  useEffect(() => {
    if (loadingMore || suppressScrollRef.current) {
      suppressScrollRef.current = false
      return
    }
    requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [loadingMore, messages.length])

  useEffect(() => {
    setMessageSuggestions(getRandomSuggestions(3, messages.length === 0))
  }, [messages.length])

  async function sendMessage(body: string) {
    if (!body.trim() || !id || userId == null) return
    setSending(true)
    setSendError(null)
    setMessageSuggestions([])
    const tempId = `local-${Date.now()}`
    const optimistic = {
      id: tempId,
      body: body.trim(),
      senderId: userId,
      createdAt: new Date().toISOString(),
      isSystem: false,
    }
    appendMessage(optimistic)
    setDraft('')
    try {
      const res = await api.messaging.sendMessage(id, { body: body.trim() })
      replaceMessage(tempId, {
        id: res.id,
        body: body.trim(),
        senderId: userId,
        createdAt: res.createdAt,
        isSystem: false,
      })
    } catch {
      setDraft(body.trim())
      removeMessage(tempId)
      setSendError('Message failed to send. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="conversation u-hide-scroll">
      <div className="conversation__header">
        <IconButton label="Back" onClick={() => nav('/inbox')}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconButton>
        <div className="conversation__title">
          <Avatar name={headerName} size="sm" src={headerAvatar} />
          <div className="conversation__titleText">
            <div>{headerName}</div>
            {headerMeta && <div className="conversation__meta">{headerMeta}</div>}
          </div>
        </div>
        <div className="conversation__spacer" />
      </div>

      <div className="conversation__body">
        {cursor != null && (
          <button
            className="actionBtn conversation__more"
            type="button"
            onClick={() => {
              suppressScrollRef.current = true
              loadOlder()
            }}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load older'}
          </button>
        )}
        {loading && <div className="u-muted">Loading messages...</div>}
        {Boolean(error) && (
          <div className="u-glass u-pad-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Message error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {String(error)}
            </div>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="u-glass u-pad-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Start the conversation</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              Send a message to get started.
            </div>
          </div>
        )}
        <div className="conversation__list">
          {messages.map(msg => {
            const isMine = userId != null && idsEqual(msg.senderId, userId)
            return (
              <div
                key={toIdString(msg.id)}
                className={`message ${isMine ? 'message--mine' : ''}${msg.isSystem ? ' message--system' : ''}`}
              >
                <div className="message__bubble">{msg.body}</div>
                <div className="message__time">{formatTime(msg.createdAt)}</div>
              </div>
            )
          })}
          <div ref={listEndRef} />
        </div>
      </div>

      <div className="conversation__composer">
        <div className="conversation__input">
          <SmartTextarea
            value={draft}
            onChange={setDraft}
            placeholder="Write a message"
            disabled={sending}
            messageSuggestions={messageSuggestions}
            onSuggestionSelect={message => sendMessage(message)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(draft)
              }
            }}
            className="smartTextarea--conversation"
          />
        </div>
        <button
          className="actionBtn actionBtn--like"
          type="button"
          onClick={() => sendMessage(draft)}
          disabled={sending || !draft.trim()}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
      {sendError && <div className="conversation__error">{sendError}</div>}
    </div>
  )
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
