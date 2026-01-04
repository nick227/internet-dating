import { useCallback, useEffect, useRef, useState } from 'react'

export function useRecordingTimer(maxMs: number, isRunning: boolean, onMaxReached: () => void) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startAtRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  const reset = useCallback(() => {
    setElapsedMs(0)
    startAtRef.current = null
    firedRef.current = false
  }, [])

  useEffect(() => {
    if (!isRunning) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }

    if (startAtRef.current == null) startAtRef.current = performance.now()

    const tick = () => {
      const startAt = startAtRef.current ?? performance.now()
      const now = performance.now()
      const next = now - startAt
      setElapsedMs(next)

      if (!firedRef.current && next >= maxMs) {
        firedRef.current = true
        onMaxReached()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isRunning, maxMs, onMaxReached])

  return { elapsedMs, reset }
}
