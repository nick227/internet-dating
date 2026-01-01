import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FeedCard } from '../../api/types'
import { useRiverFeedPhased } from '../../core/feed/useRiverFeedPhased'
import { LazyCard } from './LazyCard'
import { RiverSkeleton } from './RiverSkeleton'
import { RiverErrorBoundary } from './RiverErrorBoundary'
import { Toast } from '../ui/Toast'
import { OptimisticFirstCard, FirstCardShell } from './OptimisticFirstCard'

const DEBUG = Boolean(import.meta.env?.DEV)

const isFeedDebugEnabled = () => {
  if (!DEBUG || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('debug:feed') === '1'
  } catch {
    return false
  }
}

const debugLog = (...args: unknown[]) => {
  if (isFeedDebugEnabled()) {
    console.log(...args)
  }
}

export function River() {
  debugLog('[DEBUG] River: Component function called')
  const nav = useNavigate()
  debugLog('[DEBUG] River: About to call useRiverFeedPhased')
  const { items, cursor, loading, error, loadMore, isPhase1, phase1Items, sentinelRef } = useRiverFeedPhased()
  debugLog('[DEBUG] River: Hook call completed', { itemsCount: items.length, loading, error })
  const [toast, setToast] = useState<string | null>(null)
  const riverRef = useRef<HTMLDivElement>(null)
  
  // Presence system deferred - not used for first card
  // Will be enabled after first paint via lazy loading in card components
  const handleOpenProfile = useCallback(
    (userId: string | number) => {
      nav(`/profiles/${encodeURIComponent(String(userId))}`)
    },
    [nav]
  )

  const hasInitiallyLoadedRef = useRef(false)
  const scrollPositionRef = useRef<number>(0)

  // Progressive Event Binding: Bind scroll only initially, defer other handlers
  // Most apps bind everything immediately - we don't need to
  useEffect(() => {
    const river = riverRef.current
    if (!river) return

    // Layer 1: Scroll only (needed for position tracking)
    const handleScroll = () => {
      scrollPositionRef.current = river.scrollTop
    }

    river.addEventListener('scroll', handleScroll, { passive: true })
    
    // Layer 2: Click handlers deferred until after first paint
    // Layer 3: Gestures deferred until after Phase-2
    
    return () => {
      river.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Scroll to top on initial mount only
  useEffect(() => {
    const river = riverRef.current
    if (!river || hasInitiallyLoadedRef.current) return

    // Single RAF call to set scroll position
    requestAnimationFrame(() => {
      if (river) {
        river.scrollTop = 0
        scrollPositionRef.current = 0
      }
    })
  }, [])

  // Scroll to top after initial data load (only once)
  useEffect(() => {
    if (hasInitiallyLoadedRef.current || items.length === 0 || loading) return

    hasInitiallyLoadedRef.current = true
    const river = riverRef.current
    if (!river) return

    // Single RAF call to set scroll position
    requestAnimationFrame(() => {
      if (river) {
        river.scrollTop = 0
        scrollPositionRef.current = 0
      }
    })
  }, [items.length, loading])

  useEffect(() => {
    const root = riverRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        if (loading || cursor === null) return
        loadMore()
      },
      {
        root,
        rootMargin: '800px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor, loadMore, loading, sentinelRef])

  // Pre-compute card keys to avoid repeated key calculations
  // Fail fast if card.id is missing - index-based fallback breaks on reorder
  const cardKeys = useMemo(
    () =>
      items.map((card, idx) => {
        if (!card.id) {
          console.error(`[River] Card at index ${idx} missing id:`, card)
          // Generate stable ID based on card content to avoid remount on reorder
          const stableId = card.actor?.id
            ? `card-actor-${card.actor.id}-${card.kind}`
            : `card-${card.kind}-${idx}-${card.content?.id || 'unknown'}`
          return stableId
        }
        return card.id
      }),
    [items]
  )

  const renderCard = useCallback(
    (card: FeedCard, idx: number) => {
      // First card: render optimistically with real layout
      if (idx === 0) {
        // Phase 1: Show optimistic shell or lite data
        if (isPhase1 && phase1Items.length > 0 && phase1Items[0]?.id === card.id) {
          return (
            <FirstCardShell
              key={cardKeys[idx]}
              card={card}
            />
          )
        }
        // Phase 1: No data yet, show optimistic placeholder
        if (isPhase1) {
          return <OptimisticFirstCard key="optimistic-first" />
        }
        // Phase 2: Full card with lazy loading
        return (
          <LazyCard
            key={cardKeys[idx]}
            card={card}
            onOpenProfile={handleOpenProfile}
            onToast={setToast}
            presenceStatus={null} // Deferred
            position={idx}
            eager={true}
          />
        )
      }

      // Subsequent cards: always lazy load
      return (
        <LazyCard
          key={cardKeys[idx]}
          card={card}
          onOpenProfile={handleOpenProfile}
          onToast={setToast}
          presenceStatus={null} // Deferred
          position={idx}
          eager={false}
        />
      )
    },
    [handleOpenProfile, setToast, cardKeys, isPhase1, phase1Items]
  )

  const handleToastClose = useCallback(() => setToast(null), [])

  // Show optimistic first card immediately if no data yet
  const showOptimistic = isPhase1 && items.length === 0 && !loading

  // Debug logging - placed after all variable definitions
  useEffect(() => {
    debugLog('[DEBUG] River: Render', { 
      itemsCount: items.length, 
      loading, 
      error, 
      isPhase1, 
      phase1ItemsCount: phase1Items.length,
      cursor,
      showOptimistic,
      cardKeys: cardKeys.length
    })
  }, [items.length, loading, error, isPhase1, phase1Items.length, cursor, showOptimistic, cardKeys.length])

  debugLog('[DEBUG] River: About to render JSX', { itemsCount: items.length, loading, error, showOptimistic })


  return (
    <>
      <Toast message={toast} onClose={handleToastClose} />
      <RiverErrorBoundary>
        <div ref={riverRef} className="river u-hide-scroll">
          <div className="river__pad">
            {/* Optimistic first card - shows immediately */}
            {showOptimistic && <OptimisticFirstCard />}
            
            {/* Render cards */}
            {items.map(renderCard)}

            {/* Skeletons for below-the-fold loading */}
            {loading && items.length > 0 && <RiverSkeleton />}

            <div ref={sentinelRef} />
            {error && (
              <RiverPanel
                title="Feed error"
                message={error}
                action={{ label: 'Retry', onClick: loadMore }}
              />
            )}
            {!loading && !error && items.length === 0 && !showOptimistic && (
              <RiverPanel
                title="No matches yet"
                message="Check back soon for fresh profiles and posts."
              />
            )}
            {cursor === null && items.length > 0 && <RiverEndNotice />}
          </div>
        </div>
      </RiverErrorBoundary>
    </>
  )
}

type RiverPanelProps = {
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
}

function RiverPanel({ title, message, action }: RiverPanelProps) {
  return (
    <div className="u-glass u-pad-4 river__panel">
      <div className="river__panelTitle">{title}</div>
      {message && <div className="u-muted u-mt-2 river__panelText">{message}</div>}
      {action && (
        <button className="actionBtn u-mt-4" onClick={action.onClick} type="button">
          {action.label}
        </button>
      )}
    </div>
  )
}

function RiverEndNotice() {
  return <div className="u-muted river__end">You are all caught up.</div>
}
