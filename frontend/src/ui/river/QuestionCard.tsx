import { memo, useCallback } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { RiverCardQuestion } from './RiverCardQuestion'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardState } from './useRiverCardState'

type QuestionCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

function QuestionCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: QuestionCardProps) {
  const { actorId, mergedStats, questionAnswer, submitQuestionAnswer, handleRated } =
    useRiverCardState(card)

  const handleAnswer = useCallback(
    (answer: string) => {
      submitQuestionAnswer(answer).catch(() => {
        onToast?.('Answer failed')
      })
    },
    [submitQuestionAnswer, onToast]
  )

  return (
    <RiverCardFrame
      card={card}
      presenceStatus={presenceStatus}
      position={position}
      onOpenProfile={onOpenProfile}
      showMedia={false}
    >
      <RiverCardBody content={card.content} />
      {card.question && (
        <RiverCardQuestion
          question={card.question}
          selected={questionAnswer}
          onAnswer={handleAnswer}
        />
      )}
      <RiverCardEngagement stats={mergedStats} />
      <RiverCardActions
        actorId={actorId}
        onToast={onToast}
        initialRating={mergedStats?.myRating ?? null}
        onRated={handleRated}
      />
    </RiverCardFrame>
  )
}

export const QuestionCard = memo(QuestionCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.stats === nextProps.card.stats &&
    prevProps.card.question === nextProps.card.question &&
    prevProps.position === nextProps.position &&
    prevProps.presenceStatus === nextProps.presenceStatus &&
    prevProps.onOpenProfile === nextProps.onOpenProfile &&
    prevProps.onToast === nextProps.onToast
  )
})
