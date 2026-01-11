import { useEffect, useRef, useCallback } from 'react'

const VIEWPORT_PRELOAD_MARGIN = '200px'

type VisibilityCallback = (isVisible: boolean) => void

/**
 * Shared IntersectionObserver for all cards
 * More efficient than creating one observer per card
 */
class CardVisibilityManager {
  private observer: IntersectionObserver | null = null
  private callbacks = new Map<Element, VisibilityCallback>()

  private ensureObserver() {
    if (!this.observer) {
      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            const callback = this.callbacks.get(entry.target)
            if (callback && entry.isIntersecting) {
              callback(true)
              this.unobserve(entry.target)
            }
          })
        },
        {
          rootMargin: `${VIEWPORT_PRELOAD_MARGIN} 0px`,
          threshold: 0,
        }
      )
    }
    return this.observer
  }

  observe(element: Element, callback: VisibilityCallback) {
    const observer = this.ensureObserver()
    this.callbacks.set(element, callback)
    observer.observe(element)
  }

  unobserve(element: Element) {
    this.callbacks.delete(element)
    this.observer?.unobserve(element)
  }

  cleanup() {
    this.observer?.disconnect()
    this.observer = null
    this.callbacks.clear()
  }
}

const visibilityManager = new CardVisibilityManager()

/**
 * Hook to track when an element becomes visible in the viewport
 * @param onVisible - Callback fired once when element enters viewport
 * @param skip - If true, skips observation (element is already visible)
 * @returns Ref to attach to the element you want to observe
 */
export function useCardVisibility(
  onVisible: (isVisible: boolean) => void,
  skip = false
) {
  const elementRef = useRef<HTMLDivElement>(null)

  const handleVisible = useCallback(() => {
    onVisible(true)
  }, [onVisible])

  useEffect(() => {
    if (skip || !elementRef.current) return

    const element = elementRef.current
    visibilityManager.observe(element, handleVisible)

    return () => {
      visibilityManager.unobserve(element)
    }
  }, [handleVisible, skip])

  return elementRef
}
