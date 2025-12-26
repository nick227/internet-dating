import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { useCurrentUser } from '../../core/auth/useCurrentUser'
import { prettyIntent } from '../../core/format/prettyIntent'
import { useMatches } from '../../core/matches/useMatches'
import { useConversation } from '../../core/messaging/useConversation'
import { IconButton } from '../ui/IconButton'
import { Avatar } from '../ui/Avatar'

export function ConversationPage() {
  const nav = useNavigate()
  const { conversationId } = useParams()
  const id = conversationId ? decodeURIComponent(conversationId) : undefined
  const { userId } = useCurrentUser()
  const { data: matchData } = useMatches()
  const { messages, cursor, loading, loadingMore, error, loadOlder, appendMessage, removeMessage, replaceMessage } = useConversation(id)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const markedRef = useRef(new Set<string>())
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const suppressScrollRef = useRef(false)

  useEffect(() => {
    if (userId == null) return
    const me = String(userId)
    for (const msg of messages) {
      const key = String(msg.id)
      if (String(msg.senderId) === me || markedRef.current.has(key)) continue
      markedRef.current.add(key)
      api.messaging.markRead(msg.id).catch(() => null)
    }
  }, [messages, userId])

  useEffect(() => {
    if (loadingMore) return
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false
      return
    }
    requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [loadingMore, messages.length])

  const sortedMessages = useMemo(() => messages, [messages])
  const match = useMemo(() => {
    if (!id) return null
    return matchData?.matches.find((m) => String(m.conversation?.id ?? '') === String(id)) ?? null
  }, [id, matchData?.matches])
  const otherUser = useMemo(() => {
    if (!match || userId == null) return null
    const isA = String(match.userAId) === String(userId)
    return isA ? match.userB : match.userA
  }, [match, userId])
  const headerName = otherUser?.profile?.displayName ?? (otherUser ? `User ${otherUser.id}` : 'Conversation')
  const headerAvatar = otherUser?.profile?.avatarUrl ?? null
  const headerMeta = otherUser?.profile
    ? [otherUser.profile.locationText, otherUser.profile.intent ? prettyIntent(otherUser.profile.intent) : null]
        .filter(Boolean)
        .join(' | ')
    : null
  const handleLoadOlder = () => {
    suppressScrollRef.current = true
    loadOlder()
  }

  async function handleSend() {
    const body = draft.trim()
    if (!body || !id || userId == null) return
    setSending(true)
    setSendError(null)
    const tempId = `local-${Date.now()}`
    const optimistic = { id: tempId, body, senderId: userId, createdAt: new Date().toISOString() }
    appendMessage(optimistic)
    setDraft('')
    try {
      const res = await api.messaging.sendMessage(id, { body })
      replaceMessage(tempId, { id: res.id, body, senderId: userId, createdAt: res.createdAt })
    } catch {
      setDraft(body)
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
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
        <div className="conversation__title">
          <Avatar name={headerName} size="sm" src={headerAvatar} />
          <div className="conversation__titleText">
            <div>{headerName}</div>
            {headerMeta && <div className="conversation__meta">{headerMeta}</div>}
          </div>
        </div>
        <div style={{ width: 44 }} />
      </div>

      <div className="conversation__body">
        {cursor != null && (
          <button className="actionBtn conversation__more" type="button" onClick={handleLoadOlder} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load older'}
          </button>
        )}
        {loading && <div className="u-muted">Loading messages...</div>}
        {error && (
          <div className="u-glass u-pad-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Message error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>{error}</div>
          </div>
        )}
        {!loading && !error && sortedMessages.length === 0 && (
          <div className="u-muted">Start the conversation with a message.</div>
        )}
        <div className="conversation__list">
          {sortedMessages.map((msg) => {
            const isMine = userId != null && String(msg.senderId) === String(userId)
            return (
              <div key={String(msg.id)} className={`message ${isMine ? 'message--mine' : ''}`}>
                <div className="message__bubble">{msg.body}</div>
                <div className="message__time">{formatTime(msg.createdAt)}</div>
              </div>
            )
          })}
          <div ref={listEndRef} />
        </div>
      </div>

      <div className="conversation__composer">
        <input
          className="u-input conversation__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <button className="actionBtn actionBtn--like" type="button" onClick={handleSend} disabled={sending}>
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
