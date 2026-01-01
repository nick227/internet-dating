import { Avatar } from '../ui/Avatar'
import type { AccessStatus } from '../../api/types'

type Props = {
  id: string
  conversationId: string
  profileId: string | null
  name: string
  avatarUrl: string | null
  lastBody: string
  timestamp: string | Date
  unreadCount: number
  isFromMe: boolean
  isSystem: boolean
  followRequest?: { id: string; status: AccessStatus } | null
  canRespond?: boolean
  busy?: boolean
  onApprove?: (requestId: string) => void
  onDeny?: (requestId: string) => void
  onDeleteThread?: (conversationId: string, name: string) => void
  onOpen: () => void
  onOpenProfile: () => void
}

export function InboxItem({
  conversationId,
  name,
  avatarUrl,
  lastBody,
  timestamp,
  unreadCount,
  isFromMe,
  isSystem,
  followRequest,
  canRespond = false,
  busy = false,
  onApprove,
  onDeny,
  onDeleteThread,
  onOpen,
  onOpenProfile,
}: Props) {
  const showActions =
    Boolean(followRequest?.id) &&
    followRequest?.status === 'PENDING' &&
    canRespond &&
    isSystem &&
    Boolean(onApprove) &&
    Boolean(onDeny)
  const showDelete = Boolean(onDeleteThread)
  const preview = lastBody || 'Say hello'
  const previewText = isFromMe ? `You: ${preview}` : preview
  const isUnread = unreadCount > 0

  return (
    <div className={`inboxItem${isUnread ? ' inboxItem--unread' : ''}`} role="listitem">
      <Avatar
        name={name}
        size="sm"
        src={avatarUrl}
        onClick={() => {
          onOpenProfile()
        }}
      />

      <button
        className="inboxItem__open"
        type="button"
        onClick={onOpen}
        onKeyDown={e => e.key === 'Enter' && onOpen()}
      >
        <div className="inboxItem__main">
          <div className="inboxItem__title">
            <span>{name}</span>
            <span className="inboxItem__time">{formatTime(timestamp)}</span>
          </div>
          <div className="inboxItem__preview">{previewText}</div>
        </div>
        {isUnread && (
          <span className="inboxItem__badge" aria-label={`${unreadCount} unread messages`}>
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>

      {showActions && followRequest && (
        <div className="inboxItem__actions">
          <button
            className="topBar__btn topBar__btn--primary inboxItem__actionBtn"
            type="button"
            onClick={e => {
              e.stopPropagation()
              onApprove?.(followRequest.id)
            }}
            disabled={busy}
          >
            Accept
          </button>
          <button
            className="topBar__btn inboxItem__actionBtn"
            type="button"
            onClick={e => {
              e.stopPropagation()
              onDeny?.(followRequest.id)
            }}
            disabled={busy}
          >
            Deny
          </button>
        </div>
      )}

      {showDelete && (
        <button
          className="topBar__btn inboxItem__deleteBtn"
          type="button"
          onClick={() => onDeleteThread?.(conversationId, name)}
          disabled={busy}
        >
          Delete
        </button>
      )}
    </div>
  )
}

function formatTime(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
