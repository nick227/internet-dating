import { useCallback, useEffect, useRef, useState } from 'react'

export function useRecordingTimer(maxMs: number, isRunning: boolean, onMaxReached: () => void) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startAtRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const onMaxReachedRef = useRef(onMaxReached)

  useEffect(() => {
    onMaxReachedRef.current = onMaxReached
  }, [onMaxReached])

  const reset = useCallback(() => {
    setElapsedMs(0)
    startAtRef.current = null
    firedRef.current = false
  }, [])

  useEffect(() => {
    if (!isRunning) {
      if (elapsedMs > 0) {
        console.log('[capture] timer:stop', { elapsedMs, maxMs })
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }

    if (startAtRef.current == null) startAtRef.current = performance.now()
    console.log('[capture] timer:start', { maxMs })

    const tick = () => {
      const startAt = startAtRef.current ?? performance.now()
      const now = performance.now()
      const next = now - startAt
      setElapsedMs(next)

      if (!firedRef.current && next >= maxMs) {
        firedRef.current = true
        console.log('[capture] timer:max-reached', { elapsedMs: next, maxMs })
        onMaxReachedRef.current()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isRunning, maxMs, elapsedMs])

  return { elapsedMs, reset }
}
