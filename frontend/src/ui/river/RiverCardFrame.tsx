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
}

function isInteractiveTarget(target: EventTarget | null | undefined) {
  if (!target || !(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, select, textarea'))
}

export function RiverCardFrame({
  card,
  presenceStatus,
  position,
  onOpenProfile,
  children,
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
  const cardClassName = useMemo(
    () => (canNavigate ? 'riverCard' : 'riverCard riverCard--static'),
    [canNavigate]
  )

  const handleOpen = useCallback(() => {
    if (!actorId || !onOpenProfile) return
    onOpenProfile(actorId)
  }, [actorId, onOpenProfile])

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!canNavigate || isInteractiveTarget(event.target)) return
      handleOpen()
    },
    [canNavigate, handleOpen]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!canNavigate || isInteractiveTarget(event.target)) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleOpen()
      }
    },
    [canNavigate, handleOpen]
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
      <RiverCardMedia
        hero={hero}
        media={card.media}
        presentation={presentation}
        isCardIntersecting={cardIsIntersecting}
      />
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
