import { memo } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { RiverCardEngagement } from './RiverCardEngagement'
import { RiverCardActions } from './RiverCardActions'
import { useRiverCardState } from './useRiverCardState'

type MatchCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

function MatchCardComponent({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: MatchCardProps) {
  const { actorId, mergedStats, handleRated } = useRiverCardState(card)

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
      {actorId && (
        <div className="riverCard__actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className="actionBtn actionBtn--primary"
            onClick={() => onOpenProfile(actorId)}
          >
            View Match
          </button>
        </div>
      )}
    </RiverCardFrame>
  )
}

export const MatchCard = memo(MatchCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.stats === nextProps.card.stats &&
    prevProps.position === nextProps.position &&
    prevProps.presenceStatus === nextProps.presenceStatus &&
    prevProps.onOpenProfile === nextProps.onOpenProfile &&
    prevProps.onToast === nextProps.onToast
  )
})
