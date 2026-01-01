import { useEffect, useRef } from 'react'

type PerformanceMetrics = {
  observerCount: number
  cardCount: number
  localStorageSize: number
  lastUpdated: number
}

const MAX_OBSERVERS_WARNING = 50
const MAX_CARDS_WARNING = 200
const MAX_STORAGE_KB = 500

function getLocalStorageSize(): number {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key)
        if (value) {
          total += key.length + value.length
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return total
}

function countIntersectionObservers(): number {
  // IntersectionObserver instances are not directly countable
  // Approximate by counting rendered cards.
  return document.querySelectorAll('.riverCard').length
}

export function useFeedPerformance() {
  const metricsRef = useRef<PerformanceMetrics>({
    observerCount: 0,
    cardCount: 0,
    localStorageSize: 0,
    lastUpdated: Date.now(),
  })

  useEffect(() => {
    if (!import.meta.env?.DEV) return

    const updateMetrics = () => {
      const cardCount = document.querySelectorAll('.riverCard').length
      const observerCount = countIntersectionObservers()
      const storageSize = getLocalStorageSize()

      metricsRef.current = {
        observerCount,
        cardCount,
        localStorageSize: storageSize,
        lastUpdated: Date.now(),
      }

      // Warn if approaching limits
      if (import.meta.env?.DEV) {
        if (observerCount > MAX_OBSERVERS_WARNING) {
          console.warn(`[feed:perf] High observer count: ${observerCount}`)
        }
        if (cardCount > MAX_CARDS_WARNING) {
          console.warn(`[feed:perf] High card count: ${cardCount}`)
        }
        if (storageSize > MAX_STORAGE_KB * 1024) {
          console.warn(`[feed:perf] Large localStorage: ${(storageSize / 1024).toFixed(2)}KB`)
        }
      }
    }

    // Update metrics periodically
    const interval = setInterval(updateMetrics, 5000)
    updateMetrics() // Initial update

    return () => {
      clearInterval(interval)
    }
  }, [])

  return {
    getMetrics: () => metricsRef.current,
    checkHealth: () => {
      const m = metricsRef.current
      return {
        healthy:
          m.observerCount < MAX_OBSERVERS_WARNING &&
          m.cardCount < MAX_CARDS_WARNING &&
          m.localStorageSize < MAX_STORAGE_KB * 1024,
        metrics: m,
      }
    },
  }
}
