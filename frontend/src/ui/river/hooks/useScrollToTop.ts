import { type RefObject, useEffect, useRef } from 'react'

export function useScrollToTop(containerRef: RefObject<HTMLDivElement>, shouldScroll: boolean) {
  const hasScrolledRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || hasScrolledRef.current || !shouldScroll) return

    hasScrolledRef.current = true
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = 0
      }
    })
  }, [containerRef, shouldScroll])
}
