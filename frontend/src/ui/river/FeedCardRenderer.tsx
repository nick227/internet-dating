import { useMemo, useEffect, useRef } from 'react'
import type { FeedCard, FeedCardKind } from '../../api/types'
import { LazyCard } from './LazyCard'

type FeedCardRendererProps = {
  items: FeedCard[]
  onOpenProfile: (userId: string | number) => void
  onToast: (message: string) => void
}

// Preload map to eagerly load first card component
const preloadMap: Partial<Record<FeedCardKind, () => Promise<unknown>>> = {
  post: () => import('./PostCard'),
  profile: () => import('./ProfileCard'),
  media: () => import('./MediaCard'),
  match: () => import('./MatchCard'),
  question: () => import('./QuestionCard'),
  highlight: () => import('./HighlightCard'),
  ad: () => import('./AdCard'),
  suggestion: () => import('./SuggestionCard'),
}

export function FeedCardRenderer({ items, onOpenProfile, onToast }: FeedCardRendererProps) {
  const preloadedRef = useRef<FeedCardKind | null>(null)

  // Preload first card component once when data arrives
  useEffect(() => {
    if (items.length > 0 && preloadedRef.current !== items[0].kind) {
      const firstCardKind = items[0].kind
      preloadedRef.current = firstCardKind
      preloadMap[firstCardKind]?.()
    }
  }, [items])

  const cardKeys = useMemo(
    () =>
      items.map((card, idx) => {
        if (!card.id) {
          console.error(`[River] Card at index ${idx} missing id - data integrity issue`, card)
          return card.actor?.id && card.kind
            ? `fallback-${card.actor.id}-${card.kind}`
            : `fallback-${card.kind}-${card.content?.id || Date.now()}`
        }
        return card.id
      }),
    [items]
  )

  return (
    <>
      {items.map((card, idx) => (
        <LazyCard
          key={cardKeys[idx]}
          card={card}
          onOpenProfile={onOpenProfile}
          onToast={onToast}
          presenceStatus={null}
          position={idx}
        />
      ))}
    </>
  )
}
