import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

type NavigationDirection = 'forward' | 'back' | 'same' | 'tab'

const MAIN_TABS = ['/feed', '/matches', '/quiz', '/inbox']

export function useNavigationDirection(): NavigationDirection {
  const location = useLocation()
  const navigationType = useNavigationType()
  const previousPathRef = useRef<string | null>(null)

  useEffect(() => {
    previousPathRef.current = location.pathname
  }, [location.pathname])

  const currentPath = location.pathname
  const previousPath = previousPathRef.current

  if (!previousPath || currentPath === previousPath) {
    return 'same'
  }

  // Browser back/forward button
  if (navigationType === 'POP') {
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
