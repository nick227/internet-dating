import { useCallback } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardMedia } from './RiverCardMedia'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardHeader } from './RiverCardHeader'
import { RiverCardBody } from './RiverCardBody'
import { RiverCardActions } from './RiverCardActions'
import { RiverCardCommentsInline } from './RiverCardCommentsInline'
import { RiverCardQuestion } from './RiverCardQuestion'
import { useRiverCardState } from './useRiverCardState'
import { useFeedSeen } from '../../core/feed/useFeedSeen'

export function RiverCard({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}) {
  const title = getCardTitle(card)
  const presenceLabel = getPresenceLabel(presenceStatus)
  const hero = card.heroUrl ?? null
  const {
    actorId,
    presentation,
    accent,
    showQuestion,
    commentLabel,
    commentEntries,
    commentOpen,
    mergedStats,
    questionAnswer,
    submitQuestionAnswer,
    toggleComment,
    submitComment,
    handleRated,
  } = useRiverCardState(card)
  const canNavigate = Boolean(actorId)
  const { cardRef, isIntersecting: cardIsIntersecting } = useFeedSeen(card, position)

  const handleOpen = useCallback(() => {
    if (!actorId) return
    onOpenProfile(actorId)
  }, [actorId, onOpenProfile])

  return (
    <article
      ref={cardRef}
      className={`riverCard${canNavigate ? '' : ' riverCard--static'}`}
      tabIndex={canNavigate ? 0 : -1}
      aria-label={canNavigate ? `Open ${title}` : undefined}
      onClick={event => {
        if (!canNavigate || isInteractiveTarget(event.target)) return
        handleOpen()
      }}
      onKeyDown={event => {
        if (!canNavigate || isInteractiveTarget(event.target)) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleOpen()
        }
      }}
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
          <RiverCardBody content={card.content} />
          {showQuestion && (
            <RiverCardQuestion
              question={card.question}
              selected={questionAnswer}
              onAnswer={answer =>
                submitQuestionAnswer(answer).catch(() => {
                  onToast?.('Answer failed')
                })
              }
            />
          )}
          <RiverCardCommentsInline
            comments={card.comments}
            entries={commentEntries}
            open={commentOpen}
            onSubmit={text =>
              submitComment(text).catch(() => {
                onToast?.('Comment failed')
              })
            }
            label={commentLabel}
          />
          <RiverCardEngagement stats={mergedStats} />
          <RiverCardActions
            actorId={actorId}
            onToast={onToast}
            initialRating={mergedStats?.myRating ?? null}
            onRated={handleRated}
            onComment={toggleComment}
            commentLabel={commentLabel}
          />
          <RiverCardHint />
        </div>
      </div>

      <span className="srOnly">{title}</span>
    </article>
  )
}

function RiverCardHint() {
  return (
    <div className="u-muted riverCard__hint">
      Tap a card to open details. Actions stay in place.
    </div>
  )
}

function getCardTitle(card: FeedCard) {
  const name = card.actor?.name ?? card.content?.title ?? 'Card'
  const age = card.actor?.age
  if (age != null) return `${name}, ${age}`
  return name
}

function isInteractiveTarget(target: EventTarget | null | undefined) {
  if (!target || !(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, select, textarea'))
}

function getPresenceLabel(status?: WsPresenceStatus | null) {
  if (status === 'online') return 'Online now'
  if (status === 'away') return 'Away'
  if (status === 'offline') return 'Offline'
  return null
}
