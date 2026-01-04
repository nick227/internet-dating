import { ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType, Routes } from 'react-router-dom'

type TransitionType = 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'

type PageTransitionProps = {
  children: ReactNode
}

type NavigationDirection = 'forward' | 'back' | 'same' | 'tab'

const MAIN_TABS = ['/feed', '/connections', '/quiz', '/personality']

function getTransitionType(
  currentPath: string,
  previousPath: string | null,
  direction: NavigationDirection
): TransitionType {
  // Same path or initial load
  if (!previousPath || currentPath === previousPath) {
    return 'fade'
  }

  // Tab navigation (switching between main tabs)
  const isCurrentTab = MAIN_TABS.some(tab => currentPath.startsWith(tab))
  const isPreviousTab = previousPath ? MAIN_TABS.some(tab => previousPath.startsWith(tab)) : false

  if (direction === 'tab' || (isCurrentTab && isPreviousTab && currentPath !== previousPath)) {
    const currentIndex = MAIN_TABS.findIndex(tab => currentPath.startsWith(tab))
    const previousIndex = MAIN_TABS.findIndex(tab => previousPath.startsWith(tab))
    // Only apply tab transition if both are valid tab indices
    if (currentIndex >= 0 && previousIndex >= 0) {
      // Next tab (index increases) → slide-left (new content from right)
      if (currentIndex > previousIndex) return 'slide-left'
      // Previous tab (index decreases) → slide-right (new content from left)
      if (currentIndex < previousIndex) return 'slide-right'
    }
  }

  // Forward navigation (deeper into app)
  if (direction === 'forward') {
    return 'slide-up'
  }

  // Back navigation
  if (direction === 'back') {
    return 'slide-down'
  }

  // Default to fade
  return 'fade'
}

function detectDirection(
  currentPath: string,
  previousPath: string | null,
  historyAction: 'POP' | 'PUSH' | 'REPLACE'
): NavigationDirection {
  if (!previousPath) return 'same'
  if (currentPath === previousPath) return 'same'

  // Browser back/forward button
  if (historyAction === 'POP') {
    return 'back'
  }

  // Check if navigating between main tabs
  const isCurrentTab = MAIN_TABS.some(tab => currentPath.startsWith(tab))
  const isPreviousTab = MAIN_TABS.some(tab => previousPath.startsWith(tab))
  if (isCurrentTab && isPreviousTab) {
    return 'tab'
  }

  // Check depth (more slashes = deeper)
  const currentDepth = currentPath.split('/').filter(Boolean).length
  const previousDepth = previousPath.split('/').filter(Boolean).length

  if (currentDepth > previousDepth) return 'forward'
  if (currentDepth < previousDepth) return 'back'

  // Same depth, likely forward
  return 'forward'
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [previousLocation, setPreviousLocation] = useState<typeof location | null>(null)
  const [transitionType, setTransitionType] = useState<TransitionType>('fade')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const previousPathRef = useRef<string | null>(null)

  useEffect(() => {
    // Detect navigation direction
    const direction = detectDirection(location.pathname, previousPathRef.current, navigationType)

    // Get transition type
    const type = getTransitionType(location.pathname, previousPathRef.current, direction)

    // Only animate if path actually changed
    if (location.pathname !== previousPathRef.current) {
      setTransitionType(type)
      setIsTransitioning(true)
      setPreviousLocation(displayLocation)

      // Start transition
      requestAnimationFrame(() => {
        setDisplayLocation(location)

        // End transition after animation completes
        const duration = type === 'fade' ? 200 : 250
        setTimeout(() => {
          setIsTransitioning(false)
          setPreviousLocation(null)
        }, duration)
      })
    } else {
      // Same path, update immediately
      setDisplayLocation(location)
      setPreviousLocation(null)
    }

    previousPathRef.current = location.pathname
  }, [location, navigationType, displayLocation])

  return (
    <div
      className={`page-transition page-transition--${transitionType}${isTransitioning ? ' page-transition--active' : ''}`}
      data-transition={transitionType}
    >
      {previousLocation && isTransitioning && (
        <div key={`prev-${previousLocation.pathname}-${previousLocation.key}`} className="page-transition__content">
          <Routes location={previousLocation}>{children}</Routes>
        </div>
      )}
      <div key={`current-${displayLocation.pathname}-${displayLocation.key}`} className="page-transition__content">
        <Routes location={displayLocation}>{children}</Routes>
      </div>
    </div>
  )
}
