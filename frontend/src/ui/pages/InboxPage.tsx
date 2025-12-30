import { useNavigate } from 'react-router-dom'
import { useInbox } from '../../core/messaging/useInbox'
import { Avatar } from '../ui/Avatar'

export function InboxPage() {
  const nav = useNavigate()
  const { data, loading, error, refresh } = useInbox()
  const conversations = data?.conversations ?? []

  return (
    <div className="inbox u-hide-scroll">
      <div className="inbox__pad">
        <div className="u-row-between">
          <div className="u-title">Inbox</div>
          <button className="actionBtn actionBtn--rate" type="button" onClick={refresh}>
            Refresh
          </button>
        </div>

        {loading && <div className="u-muted u-mt-4">Loading conversations...</div>}

        {Boolean(error) && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>Inbox error</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              {String(error)}
            </div>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="u-glass u-pad-4 u-mt-4" style={{ borderRadius: 'var(--r-4)' }}>
            <div style={{ fontSize: 'var(--fs-3)' }}>No conversations yet</div>
            <div className="u-muted u-mt-2" style={{ fontSize: 'var(--fs-2)' }}>
              Start swiping to get matches and new chats.
            </div>
          </div>
        )}

        <div className="inbox__list u-mt-4">
          {conversations.map(c => {
            const name = c.otherUser.profile?.displayName ?? `User ${c.otherUser.id}`
            const lastBody = c.lastMessage?.body ?? 'Say hello'
            const timestamp = c.lastMessage?.createdAt ?? c.updatedAt
            const avatarUrl = c.otherUser.profile?.avatarUrl ?? null
            return (
              <button
                key={String(c.id)}
                className="inboxItem"
                type="button"
                onClick={() => nav(`/inbox/${encodeURIComponent(String(c.id))}`)}
              >
                <Avatar name={name} size="sm" src={avatarUrl} />
                <div className="inboxItem__main">
                  <div className="inboxItem__title">
                    <span>{name}</span>
                    <span className="inboxItem__time">{formatTime(timestamp)}</span>
                  </div>
                  <div className="inboxItem__preview">{lastBody}</div>
                </div>
                {c.unreadCount > 0 && <span className="inboxItem__badge">{c.unreadCount}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
