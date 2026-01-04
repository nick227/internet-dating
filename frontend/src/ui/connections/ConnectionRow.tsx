import type { CSSProperties, PointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../ui/Avatar'

export type ConnectionRowAction = {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

type ConnectionRowProps = {
  id: string
  title: string
  subtitle?: string | null
  statusLabel?: string | null
  timestamp?: string | null
  badgeCount?: number
  avatarUrl?: string | null
  profileId?: string | null
  emphasize?: boolean
  actions?: ConnectionRowAction[]
  onOpen: () => void
  onOpenProfile?: () => void
}

export function ConnectionRow({
  title,
  subtitle,
  statusLabel,
  timestamp,
  badgeCount,
  avatarUrl,
  profileId,
  emphasize = false,
  actions,
  onOpen,
  onOpenProfile,
}: ConnectionRowProps) {
  const showBadge = typeof badgeCount === 'number' && badgeCount > 0
  const [actionsOpen, setActionsOpen] = useState(false)
  const swipeStart = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const actionCount = actions?.length ?? 0
  const actionWidth = actionCount ? 152 : 0
  const rowStyle = actionWidth
    ? ({ '--inbox-actions-width': `${actionWidth}px` } as CSSProperties)
    : undefined

  useEffect(() => {
    if (!actions?.length) {
      setActionsOpen(false)
    }
  }, [actions])

  const handleOpen = () => {
    if (actionsOpen) setActionsOpen(false)
    onOpen()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!actions?.length) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    swipeStart.current = { x: event.clientX, y: event.clientY, active: true }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!swipeStart.current?.active) return
    const dx = event.clientX - swipeStart.current.x
    const dy = event.clientY - swipeStart.current.y
    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) + 6) return
    if (dx < -28) {
      setActionsOpen(true)
      swipeStart.current.active = false
    }
  }

  const handlePointerEnd = () => {
    swipeStart.current = null
  }

  return (
    <div
      className={`inboxItem${emphasize ? ' inboxItem--unread' : ''}${
        actionsOpen ? ' inboxItem--actions' : ''
      }`}
      role="listitem"
      style={rowStyle}
    >
      {actions && actions.length > 0 && (
        <div className="inboxItem__actionsTray" aria-hidden={!actionsOpen}>
          <div className="inboxItem__actions">
            {actions.map(action => (
              <button
                key={action.label}
                className={getActionClass(action.variant)}
                type="button"
                onClick={() => {
                  if (action.disabled) return
                  setActionsOpen(false)
                  action.onClick()
                }}
                disabled={action.disabled}
                aria-disabled={action.disabled}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="inboxItem__content"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <Avatar
          name={title}
          size="md"
          src={avatarUrl ?? null}
          profileId={profileId ?? null}
          onClick={onOpenProfile}
        />

        <button
          className="inboxItem__open"
          type="button"
          onClick={handleOpen}
          onKeyDown={e => e.key === 'Enter' && handleOpen()}
        >
          <div className="inboxItem__main">
            <div className="inboxItem__title">
              <span>{title}</span>
              {timestamp && <span className="inboxItem__time">{timestamp}</span>}
            </div>
            {subtitle && <div className="inboxItem__subtitle">{subtitle}</div>}
            {statusLabel && <div className="inboxItem__status">{statusLabel}</div>}
          </div>
          {showBadge && (
            <span className="inboxItem__badge" aria-label={`${badgeCount} unread items`}>
              {Math.min(badgeCount ?? 0, 99)}
            </span>
          )}
        </button>

        {actions && actions.length > 0 && (
          <button
            className="inboxItem__overflow"
            type="button"
            onClick={() => setActionsOpen(prev => !prev)}
            aria-label={actionsOpen ? 'Close actions' : 'More actions'}
          >
            ...
          </button>
        )}
      </div>
    </div>
  )
}

function getActionClass(variant?: ConnectionRowAction['variant']) {
  if (variant === 'primary') {
    return 'topBar__btn topBar__btn--primary inboxItem__actionBtn'
  }
  if (variant === 'danger') {
    return 'topBar__btn inboxItem__actionBtn connections__actionBtn--danger'
  }
  return 'topBar__btn inboxItem__actionBtn'
}
