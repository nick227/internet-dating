import { useEffect, useState } from 'react'

export function useIntersectionThreshold(
  elementRef: React.RefObject<HTMLElement | null>,
  threshold = 0.5
): boolean {
  const [isThresholdMet, setIsThresholdMet] = useState(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) {
      setIsThresholdMet(false)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          setIsThresholdMet(entry.intersectionRatio >= threshold)
        }
      },
      { threshold }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [elementRef, threshold])

  return isThresholdMet
}
