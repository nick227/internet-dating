import { Suspense, lazy, useState } from 'react'
import type { FeedCard, FeedCardKind } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverSkeleton } from './RiverSkeleton'
import { RiverCardErrorBoundary } from './RiverCardErrorBoundary'
import { useCardVisibility } from './hooks/useCardVisibility'

type RiverCardRenderProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

const cardComponents = {
  post: lazy(() => import('./PostCard').then(m => ({ default: m.PostCard }))),
  profile: lazy(() => import('./ProfileCard').then(m => ({ default: m.ProfileCard }))),
  media: lazy(() => import('./MediaCard').then(m => ({ default: m.MediaCard }))),
  match: lazy(() => import('./MatchCard').then(m => ({ default: m.MatchCard }))),
  question: lazy(() => import('./QuestionCard').then(m => ({ default: m.QuestionCard }))),
  highlight: lazy(() => import('./HighlightCard').then(m => ({ default: m.HighlightCard }))),
  ad: lazy(() => import('./AdCard').then(m => ({ default: m.AdCard }))),
  suggestion: lazy(() => import('./SuggestionCard').then(m => ({ default: m.SuggestionCard }))),
  mosaic: lazy(() => import('./MosaicCard').then(m => ({ default: m.MosaicCard }))),
} satisfies Record<FeedCardKind | 'mosaic', React.LazyExoticComponent<React.ComponentType<RiverCardRenderProps>>>

const FallbackCard = lazy(() => import('./PostCard').then(m => ({ default: m.PostCard })))

type LazyCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

export function LazyCard({
  card,
  onOpenProfile,
  onToast,
  presenceStatus,
  position,
}: LazyCardProps) {
  const isFirstCard = position === 0
  const [shouldLoad, setShouldLoad] = useState(isFirstCard)
  const cardRef = useCardVisibility(setShouldLoad, shouldLoad)

  // Smart component selection: Use MosaicCard if presentation.mode is 'mosaic'
  const componentKey = card.presentation?.mode === 'mosaic' ? 'mosaic' : card.kind
  const Component = cardComponents[componentKey as keyof typeof cardComponents] || FallbackCard

  return (
    <div ref={cardRef}>
      {!shouldLoad ? (
        <div className="riverCard riverCard--skeleton">
          <RiverSkeleton />
        </div>
      ) : (
        <RiverCardErrorBoundary card={card}>
          <Suspense fallback={<RiverSkeleton />}>
            <Component
              card={card}
              onOpenProfile={onOpenProfile}
              onToast={onToast}
              presenceStatus={presenceStatus}
              position={position}
            />
          </Suspense>
        </RiverCardErrorBoundary>
      )}
    </div>
  )
}
