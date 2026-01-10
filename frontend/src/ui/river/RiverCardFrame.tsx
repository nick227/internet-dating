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
  showMedia?: boolean // Controls whether to show RiverCardMedia
  commentWidgetOpen?: boolean // Controls layout when comments are open
}

export function RiverCardFrame({
  card,
  presenceStatus,
  position,
  onOpenProfile,
  children,
  showMedia = true, // Default to true for backwards compatibility
  commentWidgetOpen = false,
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
  const { cardRef, isIntersecting: cardIsIntersecting } = useFeedSeen(card, position)
  const presentation = card.presentation
  // Accent is determined by card kind or presentation - match cards get match accent
  const accent = presentation?.accent ?? (card.kind === 'match' ? 'match' : null)

  // Memoize className to avoid string concatenation
  const cardClassName = useMemo(() => {
    const classes = ['riverCard']
    if (!showMedia) classes.push('riverCard--noMedia')
    if (commentWidgetOpen) classes.push('riverCard--commentsOpen')
    return classes.join(' ')
  }, [showMedia, commentWidgetOpen])

  const handleOpen = useCallback(() => {
    if (!actorId || !onOpenProfile) return
    onOpenProfile(actorId)
  }, [actorId, onOpenProfile])

  return (
    <article ref={cardRef} className={cardClassName}>
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
            onOpenProfile={handleOpen}
          />
          {children}
        </div>
      </div>

      <span className="srOnly">{title}</span>
    </article>
  )
}
