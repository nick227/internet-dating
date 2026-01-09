import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardMedia } from './RiverCardMedia'
import { RiverCardHeader } from './RiverCardHeader'
import { useFeedSeen } from '../../core/feed/useFeedSeen'

type RiverCardFrameProps = {
  card: FeedCard
  presenceStatus?: WsPresenceStatus | null
  position: number
  onOpenProfile?: (userId: string | number) => void
  children: ReactNode
  commentWidgetOpen?: boolean // NEW: Track if comment widget is open
  showMedia?: boolean // Controls whether to show RiverCardMedia
}

function isInteractiveTarget(target: EventTarget | null | undefined) {
  if (!target || !(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, select, textarea'))
}

function isCommentWidget(target: EventTarget | null | undefined) {
  if (!target || !(target instanceof Element)) return false
  // Check if click is inside comment widget (including its content)
  return Boolean(target.closest('.commentWidget'))
}

export function RiverCardFrame({
  card,
  presenceStatus,
  position,
  onOpenProfile,
  children,
  commentWidgetOpen = false, // NEW: Default to false
  showMedia = true, // Default to true for backwards compatibility
}: RiverCardFrameProps) {
  // Memoize expensive string computations
  const title = useMemo(() => {
    const name = card.actor?.name ?? card.content?.title ?? 'Card'
    const age = card.actor?.age
    return age != null ? `${name}, ${age}` : name
  }, [card.actor?.name, card.content?.title, card.actor?.age])

  const presenceLabel = useMemo(() => {
    if (presenceStatus === 'online') return 'Online now'
    if (presenceStatus === 'away') return 'Away'
    if (presenceStatus === 'offline') return 'Offline'
    return null
  }, [presenceStatus])

  const hero = card.heroUrl ?? null
  const actorId = card.actor?.id
  const canNavigate = Boolean(actorId && onOpenProfile)
  const { cardRef, isIntersecting: cardIsIntersecting } = useFeedSeen(card, position)
  const presentation = card.presentation
  // Accent is determined by card kind or presentation - match cards get match accent
  const accent = presentation?.accent ?? (card.kind === 'match' ? 'match' : null)

  // Memoize className to avoid string concatenation
  const cardClassName = useMemo(() => {
    const classes = ['riverCard']
    if (!canNavigate) classes.push('riverCard--static')
    if (!showMedia) classes.push('riverCard--noMedia')
    return classes.join(' ')
  }, [canNavigate, showMedia])

  const handleOpen = useCallback(() => {
    if (!actorId || !onOpenProfile) return
    onOpenProfile(actorId)
  }, [actorId, onOpenProfile])

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      // Don't navigate if comment widget is open (user is interacting with comments)
      if (commentWidgetOpen) return
      // Don't navigate if clicking on interactive elements
      if (!canNavigate || isInteractiveTarget(event.target)) return
      // Don't navigate if clicking inside comment widget
      if (isCommentWidget(event.target)) return
      handleOpen()
    },
    [canNavigate, handleOpen, commentWidgetOpen]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Don't navigate if comment widget is open
      if (commentWidgetOpen) return
      // Don't navigate if clicking on interactive elements
      if (!canNavigate || isInteractiveTarget(event.target)) return
      // Don't navigate if inside comment widget
      if (isCommentWidget(event.target)) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleOpen()
      }
    },
    [canNavigate, handleOpen, commentWidgetOpen]
  )

  return (
    <article
      ref={cardRef}
      className={cardClassName}
      tabIndex={canNavigate ? 0 : -1}
      aria-label={canNavigate ? `Open ${title}` : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {showMedia && (
        <RiverCardMedia
          hero={hero}
          media={card.media}
          presentation={presentation}
          isCardIntersecting={cardIsIntersecting}
        />
      )}
      <div className="riverCard__scrim" />

      <div className="riverCard__meta">
        <div className="u-stack">
          <RiverCardHeader
            actor={card.actor}
            content={card.content}
            kind={card.kind}
            presenceLabel={presenceLabel}
            accent={accent}
            isOptimistic={card.flags?.optimistic}
          />
          {children}
        </div>
      </div>

      <span className="srOnly">{title}</span>
    </article>
  )
}
