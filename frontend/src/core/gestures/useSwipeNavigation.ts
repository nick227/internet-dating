import { useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSwipe } from './useSwipe'

type SwipeNavigationConfig = {
  enabled?: boolean
  onSwipeUp?: () => void | null
  onSwipeDown?: () => void | null
  onSwipeLeft?: () => void | null
  onSwipeRight?: () => void | null
  preventDefault?: boolean
  threshold?: number
  velocity?: number
}

const MAIN_TABS = ['/feed', '/connections', '/quiz']

function getCurrentTabIndex(pathname: string): number {
  return MAIN_TABS.findIndex(tab => pathname.startsWith(tab))
}

function canNavigateBack(pathname: string): boolean {
  // Can go back if not on a main tab or if we're deeper than base route
  const depth = pathname.split('/').filter(Boolean).length
  return depth > 1
}

export function useSwipeNavigation(config: SwipeNavigationConfig = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const configRef = useRef(config)
  configRef.current = config
  const lastSwipeRef = useRef<number>(0)

  const {
    enabled = true,
    onSwipeUp,
    onSwipeDown,
    onSwipeLeft,
    onSwipeRight,
    preventDefault = true,
    threshold = 50,
    velocity = 0.3,
  } = config

  const handleSwipe = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right', _distance: number, _swipeVelocity: number) => {
      if (!enabled) return

      // Debounce rapid swipes (prevent double navigation)
      const now = Date.now()
      if (now - lastSwipeRef.current < 300) return
      lastSwipeRef.current = now

      // Check for custom handlers first
      if (direction === 'up' && onSwipeUp) {
        const result = onSwipeUp()
        if (result !== null) return
      }
      if (direction === 'down' && onSwipeDown) {
        const result = onSwipeDown()
        if (result !== null) return
      }
      if (direction === 'left' && onSwipeLeft) {
        const result = onSwipeLeft()
        if (result !== null) return
      }
      if (direction === 'right' && onSwipeRight) {
        const result = onSwipeRight()
        if (result !== null) return
      }

      // Default navigation behavior
      const currentPath = location.pathname
      const currentTabIndex = getCurrentTabIndex(currentPath)

      switch (direction) {
        case 'down':
          // Swipe down = go back
          if (canNavigateBack(currentPath)) {
            navigate(-1)
          }
          break

        case 'up':
          // Swipe up = Intentionally unused (per spec)
          // Must never trigger navigation unless explicitly enabled per route
          // Reserved for future custom implementations only
          // Custom handlers can be provided via onSwipeUp prop
          break

        case 'left':
          // Swipe left = next tab (if on main tabs)
          if (currentTabIndex >= 0 && currentTabIndex < MAIN_TABS.length - 1) {
            navigate(MAIN_TABS[currentTabIndex + 1])
          }
          break

        case 'right':
          // Swipe right = previous tab (if on main tabs)
          if (currentTabIndex > 0) {
            navigate(MAIN_TABS[currentTabIndex - 1])
          } else if (currentTabIndex === 0) {
            // On root tab - check if history exists
            if (canNavigateBack(currentPath)) {
              navigate(-1)
            }
            // Otherwise do nothing (no history exists)
          } else if (currentTabIndex === -1 && canNavigateBack(currentPath)) {
            // If not on a main tab, swipe right = go back
            navigate(-1)
          }
          break
      }
    },
    [enabled, navigate, location.pathname, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight]
  )

  const { isActive } = useSwipe({
    enabled,
    threshold,
    velocity,
    onSwipe: handleSwipe,
    preventScroll: preventDefault,
  })

  return {
    isSwiping: isActive,
  }
}
