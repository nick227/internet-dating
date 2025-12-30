import { Suspense, lazy, useRef, useEffect, useState } from 'react'
import type { FeedCard, FeedCardKind } from '../../api/types'
import type { WsPresenceStatus } from '@app/shared/ws/contracts'
import { RiverSkeleton } from './RiverSkeleton'
import { RiverCardErrorBoundary } from './RiverCardErrorBoundary'

type RiverCardRenderProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
}

// Eagerly import first card components (for position 0)
import { PostCard as PostCardEager } from './PostCard'
import { ProfileCard as ProfileCardEager } from './ProfileCard'
import { MatchCard as MatchCardEager } from './MatchCard'
import { QuestionCard as QuestionCardEager } from './QuestionCard'
import { SuggestionCard as SuggestionCardEager } from './SuggestionCard'
import { AdCard as AdCardEager } from './AdCard'
import { MediaCard as MediaCardEager } from './MediaCard'
import { HighlightCard as HighlightCardEager } from './HighlightCard'

// Lazy load card components for below-the-fold cards
const PostCardLazy = lazy(() => import('./PostCard').then(m => ({ default: m.PostCard })))
const ProfileCardLazy = lazy(() => import('./ProfileCard').then(m => ({ default: m.ProfileCard })))
const MatchCardLazy = lazy(() => import('./MatchCard').then(m => ({ default: m.MatchCard })))
const QuestionCardLazy = lazy(() => import('./QuestionCard').then(m => ({ default: m.QuestionCard })))
const SuggestionCardLazy = lazy(() => import('./SuggestionCard').then(m => ({ default: m.SuggestionCard })))
const AdCardLazy = lazy(() => import('./AdCard').then(m => ({ default: m.AdCard })))
const MediaCardLazy = lazy(() => import('./MediaCard').then(m => ({ default: m.MediaCard })))
const HighlightCardLazy = lazy(() => import('./HighlightCard').then(m => ({ default: m.HighlightCard })))

// Eager components (for first card)
const cardComponentsEager: Record<FeedCardKind, (props: RiverCardRenderProps) => JSX.Element> = {
  post: props => <PostCardEager {...props} />,
  profile: props => <ProfileCardEager {...props} />,
  media: props => <MediaCardEager {...props} />,
  match: props => <MatchCardEager {...props} />,
  question: props => <QuestionCardEager {...props} />,
  highlight: props => <HighlightCardEager {...props} />,
  ad: props => <AdCardEager {...props} />,
  suggestion: props => <SuggestionCardEager {...props} />,
}

// Lazy components (for below-the-fold cards)
const cardComponentsLazy: Record<FeedCardKind, React.LazyExoticComponent<React.ComponentType<RiverCardRenderProps>>> = {
  post: PostCardLazy,
  profile: ProfileCardLazy,
  media: MediaCardLazy,
  match: MatchCardLazy,
  question: QuestionCardLazy,
  highlight: HighlightCardLazy,
  ad: AdCardLazy,
  suggestion: SuggestionCardLazy,
}

type LazyCardProps = {
  card: FeedCard
  onOpenProfile: (userId: string | number) => void
  onToast?: (message: string) => void
  presenceStatus?: WsPresenceStatus | null
  position: number
  eager?: boolean
}

/**
 * LazyCard - Lazy loads card components below the fold
 * First card (position 0) should be eager loaded for instant rendering
 */
export function LazyCard({ card, onOpenProfile, onToast, presenceStatus, position, eager = false }: LazyCardProps) {
  const [shouldLoad, setShouldLoad] = useState(eager)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (eager || shouldLoad) return

    // Use IntersectionObserver to detect when card enters viewport
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setShouldLoad(true)
            observer.disconnect()
          }
        })
      },
      {
        // Start loading when card is 200px before viewport
        rootMargin: '200px 0px',
        threshold: 0,
      }
    )

    const element = cardRef.current
    if (element) {
      observer.observe(element)
    }

    return () => {
      if (element) {
        observer.disconnect()
      }
    }
  }, [eager, shouldLoad])

  // Use eager components for first card, lazy for others
  const EagerComponent = cardComponentsEager[card.kind]
  const LazyComponent = cardComponentsLazy[card.kind]

  if (!EagerComponent || !LazyComponent) {
    if (import.meta.env?.DEV) {
      console.error(`[LazyCard] Unknown card kind: ${card.kind}`)
    }
    // Fallback to PostCard
    const FallbackEager = cardComponentsEager.post
    const FallbackLazy = cardComponentsLazy.post
    const FallbackComponent = eager ? FallbackEager : FallbackLazy
    
    if (eager) {
      return (
        <div ref={cardRef}>
          <RiverCardErrorBoundary card={card}>
            <FallbackComponent
              card={card}
              onOpenProfile={onOpenProfile}
              onToast={onToast}
              presenceStatus={presenceStatus}
              position={position}
            />
          </RiverCardErrorBoundary>
        </div>
      )
    }
    
    return (
      <div ref={cardRef}>
        {!shouldLoad ? (
          <div className="riverCard riverCard--skeleton">
            <RiverSkeleton />
          </div>
        ) : (
          <Suspense fallback={<RiverSkeleton />}>
            <RiverCardErrorBoundary card={card}>
              <FallbackComponent
                card={card}
                onOpenProfile={onOpenProfile}
                onToast={onToast}
                presenceStatus={presenceStatus}
                position={position}
              />
            </RiverCardErrorBoundary>
          </Suspense>
        )}
      </div>
    )
  }

  // Eager load first card (no lazy loading, no Suspense)
  if (eager) {
    return (
      <div ref={cardRef}>
        <RiverCardErrorBoundary card={card}>
          <EagerComponent
            card={card}
            onOpenProfile={onOpenProfile}
            onToast={onToast}
            presenceStatus={presenceStatus}
            position={position}
          />
        </RiverCardErrorBoundary>
      </div>
    )
  }

  // Lazy load subsequent cards
  if (!shouldLoad) {
    return (
      <div ref={cardRef} className="riverCard riverCard--skeleton">
        <RiverSkeleton />
      </div>
    )
  }

  return (
    <div ref={cardRef}>
      <Suspense fallback={<RiverSkeleton />}>
        <RiverCardErrorBoundary card={card}>
          <LazyComponent
            card={card}
            onOpenProfile={onOpenProfile}
            onToast={onToast}
            presenceStatus={presenceStatus}
            position={position}
          />
        </RiverCardErrorBoundary>
      </Suspense>
    </div>
  )
}
