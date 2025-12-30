import { useCallback, useEffect, useRef } from 'react'

type SwipeDirection = 'up' | 'down' | 'left' | 'right'

type SwipeConfig = {
  threshold?: number // Minimum distance in pixels to trigger swipe
  velocity?: number // Minimum velocity (px/ms) to trigger swipe
  preventScroll?: boolean // Prevent default scroll during swipe
  onSwipe?: (direction: SwipeDirection, distance: number, velocity: number) => void
  enabled?: boolean // Enable/disable swipe detection
}

type SwipeState = {
  startX: number
  startY: number
  startTime: number
  currentX: number
  currentY: number
  isActive: boolean
}

const DEFAULT_CONFIG: Required<Omit<SwipeConfig, 'onSwipe'>> = {
  threshold: 50,
  velocity: 0.3,
  preventScroll: false,
  enabled: true,
}

export function useSwipe(config: SwipeConfig = {}) {
  const stateRef = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    currentX: 0,
    currentY: 0,
    isActive: false,
  })

  const configRef = useRef(config)
  configRef.current = config

  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!mergedConfig.enabled) return

      const now = Date.now()
      stateRef.current = {
        startX: clientX,
        startY: clientY,
        startTime: now,
        currentX: clientX,
        currentY: clientY,
        isActive: true,
      }
    },
    [mergedConfig.enabled]
  )

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!stateRef.current.isActive || !mergedConfig.enabled) return

      const state = stateRef.current
      const deltaX = Math.abs(clientX - state.startX)
      const deltaY = Math.abs(clientY - state.startY)

      // If primarily vertical movement, check if we're in a scrollable area
      if (deltaY > deltaX) {
        const target = document.elementFromPoint(clientX, clientY) as HTMLElement
        if (target) {
          const scrollable = target.closest(
            '[data-swipe-disable], .river, .conversation__body, .profile, .inbox, .quiz'
          )
          if (scrollable) {
            // Check if element can scroll
            const canScroll = scrollable.scrollHeight > scrollable.clientHeight
            const isAtTop = scrollable.scrollTop <= 0
            const isAtBottom =
              scrollable.scrollTop >= scrollable.scrollHeight - scrollable.clientHeight - 1

            // Only allow swipe if at scroll boundary and swiping in that direction
            if (canScroll) {
              const swipingUp = clientY < state.startY
              const swipingDown = clientY > state.startY

              // Allow swipe down only if at top, swipe up only if at bottom
              if (swipingDown && !isAtTop) return
              if (swipingUp && !isAtBottom) return
            }
          }
        }
      }

      stateRef.current.currentX = clientX
      stateRef.current.currentY = clientY
    },
    [mergedConfig.enabled]
  )

  const handleEnd = useCallback(() => {
    if (!stateRef.current.isActive || !mergedConfig.enabled) return

    const state = stateRef.current
    const deltaX = state.currentX - state.startX
    const deltaY = state.currentY - state.startY
    const deltaTime = Date.now() - state.startTime
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    const velocity = distance / Math.max(deltaTime, 1)

    // Reset state
    stateRef.current.isActive = false

    // Check if swipe meets threshold and velocity requirements
    if (distance < mergedConfig.threshold || velocity < mergedConfig.velocity) {
      return
    }

    // Determine primary direction
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    let direction: SwipeDirection | null = null

    // Horizontal swipe takes precedence if it's more dominant
    if (absX > absY && absX > mergedConfig.threshold) {
      direction = deltaX > 0 ? 'right' : 'left'
    }
    // Vertical swipe
    else if (absY > absX && absY > mergedConfig.threshold) {
      direction = deltaY > 0 ? 'down' : 'up'
    }

    // Re-check scroll boundaries before triggering swipe (critical invariant)
    if (direction === 'down' || direction === 'up') {
      const target = document.elementFromPoint(state.currentX, state.currentY) as HTMLElement
      if (target) {
        const scrollable = target.closest(
          '[data-swipe-disable], .river, .conversation__body, .profile, .inbox, .quiz'
        )
        if (scrollable) {
          const canScroll = scrollable.scrollHeight > scrollable.clientHeight
          const isAtTop = scrollable.scrollTop <= 0
          const isAtBottom =
            scrollable.scrollTop >= scrollable.scrollHeight - scrollable.clientHeight - 1

          // Enforce: swipe must never cause both scrolling and navigation
          if (canScroll) {
            const swipingDown = direction === 'down'
            const swipingUp = direction === 'up'
            if (swipingDown && !isAtTop) return // Cancel swipe - would cause scroll
            if (swipingUp && !isAtBottom) return // Cancel swipe - would cause scroll
          }
        }
      }
    }

    if (direction && configRef.current.onSwipe) {
      configRef.current.onSwipe(direction, distance, velocity)
    }
  }, [mergedConfig.enabled, mergedConfig.threshold, mergedConfig.velocity])

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      // Skip mouse events (we only want touch/pen)
      if (event.pointerType === 'mouse') return

      // Only handle primary pointer
      if (!event.isPrimary) return

      // Check if target is an interactive element that should handle its own gestures
      const target = event.target as HTMLElement
      if (
        target &&
        target.closest(
          '.riverCard__media, .riverCard__mediaFrame, button, a, input, textarea, [role="button"]'
        )
      ) {
        return
      }

      handleStart(event.clientX, event.clientY)
    },
    [handleStart]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (event.isPrimary) {
        handleMove(event.clientX, event.clientY)
      }
    },
    [handleMove]
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.isPrimary) {
        handleEnd()
      }
    },
    [handleEnd]
  )

  const handlePointerCancel = useCallback((event: PointerEvent) => {
    if (event.isPrimary) {
      stateRef.current.isActive = false
    }
  }, [])

  useEffect(() => {
    if (!mergedConfig.enabled) return

    // Use pointer events for better cross-device support
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [
    mergedConfig.enabled,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  ])

  return {
    isActive: stateRef.current.isActive,
    getCurrentDelta: () => {
      const state = stateRef.current
      return {
        x: state.currentX - state.startX,
        y: state.currentY - state.startY,
        distance: Math.sqrt(
          Math.pow(state.currentX - state.startX, 2) + Math.pow(state.currentY - state.startY, 2)
        ),
      }
    },
  }
}
