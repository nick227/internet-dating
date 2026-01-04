import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook for conditional auto-scroll
 * SRP: Only auto-scrolls if user is near bottom, otherwise shows affordance
 */
const NEAR_BOTTOM_THRESHOLD = 120 // pixels from bottom

export function useConditionalAutoScroll(
  containerRef: React.RefObject<HTMLElement>,
  trigger: unknown // Dependency that triggers scroll check
) {
  const [showNewCommentsAffordance, setShowNewCommentsAffordance] = useState(false)
  const isNearBottomRef = useRef(true)

  const checkScrollPosition = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const isNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD

    isNearBottomRef.current = isNearBottom
    setShowNewCommentsAffordance(!isNearBottom)
  }, [containerRef])

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
    setShowNewCommentsAffordance(false)
  }, [containerRef])

  // Check position on scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', checkScrollPosition, { passive: true })
    return () => container.removeEventListener('scroll', checkScrollPosition)
  }, [checkScrollPosition])

  // Check position when trigger changes (new comment added)
  useEffect(() => {
    checkScrollPosition()

    // Auto-scroll only if near bottom
    if (isNearBottomRef.current) {
      const container = containerRef.current
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        })
      }
    }
  }, [trigger, checkScrollPosition])

  return {
    showNewCommentsAffordance,
    scrollToBottom,
  }
}
