import { memo } from 'react'
import type { FeedCard } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverCardFrame } from './RiverCardFrame'
import { RiverCardBody } from './RiverCardBody'
import { RiverCardEngagement } from './RiverCardEngagement'
import { useRiverCardState } from './useRiverCardState'
import { Pill } from '../ui/Pill'

type AdCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

function AdCardComponent({ card, onOpenProfile, presenceStatus, position }: AdCardProps) {
  const { mergedStats } = useRiverCardState(card)

  return (
    <RiverCardFrame
      card={card}
      presenceStatus={presenceStatus}
      position={position}
      onOpenProfile={onOpenProfile}
    >
      <div className="riverCard__adLabel">
        <Pill>Sponsored</Pill>
        <Pill>Ad</Pill>
      </div>
      <RiverCardBody content={card.content} />
      <RiverCardEngagement stats={mergedStats} />
    </RiverCardFrame>
  )
}

export const AdCard = memo(AdCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.stats === nextProps.card.stats &&
    prevProps.position === nextProps.position &&
    prevProps.presenceStatus === nextProps.presenceStatus &&
    prevProps.onOpenProfile === nextProps.onOpenProfile
  )
})
