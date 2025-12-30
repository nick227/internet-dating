import { memo, useState, useCallback, useEffect, useRef } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardState } from './useRiverCardState'

type SuggestionCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

function SuggestionCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: SuggestionCardProps) {
  const { actorId, mergedStats, handleRated } = useRiverCardState(card)
  const [isHiding, setIsHiding] = useState(false)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>()
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>()

  // Cleanup timeouts on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
      }
    }
  }, [])

  const handleNotInterested = useCallback(() => {
    if (isHiding) return
    setIsHiding(true)
    window.dispatchEvent(
      new CustomEvent('feed:hide', {
        detail: {
          itemType: card.kind, // Use canonical kind, not legacy 'suggestion'
          itemId: card.id,
        },
      })
    )
    onToast?.('Suggestion hidden')
    // Clear any existing timeout before setting a new one
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsHiding(false)
      hideTimeoutRef.current = undefined
    }, 1000)
  }, [isHiding, card.id, card.kind, onToast])

  const handleSeeMoreLikeThis = useCallback(() => {
    if (isSubmittingFeedback) return
    setIsSubmittingFeedback(true)
    window.dispatchEvent(
      new CustomEvent('feed:suggestion-feedback', {
        detail: {
          itemType: card.kind, // Use canonical kind
          itemId: card.id,
          feedback: 'positive',
        },
      })
    )
    onToast?.('Thanks for the feedback')
    // Clear any existing timeout before setting a new one
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current)
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      setIsSubmittingFeedback(false)
      feedbackTimeoutRef.current = undefined
    }, 1000)
  }, [isSubmittingFeedback, card.id, card.kind, onToast])

  return (
    <RiverCardFrame
      card={card}
      presenceStatus={presenceStatus}
      position={position}
      onOpenProfile={onOpenProfile}
    >
      <RiverCardBody content={card.content} />
      <RiverCardEngagement stats={mergedStats} />
      <RiverCardActions
        actorId={actorId}
        onToast={onToast}
        initialRating={mergedStats?.myRating ?? null}
        onRated={handleRated}
      />
      <div className="riverCard__actions" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="actionBtn"
          onClick={handleNotInterested}
          disabled={isHiding || isSubmittingFeedback}
        >
          {isHiding ? 'Hiding...' : 'Not interested'}
        </button>
        <button
          type="button"
          className="actionBtn actionBtn--primary"
          onClick={handleSeeMoreLikeThis}
          disabled={isHiding || isSubmittingFeedback}
        >
          {isSubmittingFeedback ? 'Sending...' : 'See more like this'}
        </button>
      </div>
    </RiverCardFrame>
  )
}

export const SuggestionCard = memo(SuggestionCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.stats === nextProps.card.stats &&
    prevProps.position === nextProps.position &&
    prevProps.presenceStatus === nextProps.presenceStatus &&
    prevProps.onOpenProfile === nextProps.onOpenProfile &&
    prevProps.onToast === nextProps.onToast
  )
})
