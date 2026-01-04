import { useCallback, useEffect, useRef, useState } from 'react'

type FacingMode = 'user' | 'environment'

export function useMediaStream() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const currentFacing = useRef<FacingMode>('user')

  const stop = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  const start = useCallback(async (opts?: { facingMode?: FacingMode }) => {
    setError(null)
    const facingMode = opts?.facingMode ?? currentFacing.current
    currentFacing.current = facingMode

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      })
      setStream(s)
      return s
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to getUserMedia()'
      setError(msg)
      setStream(null)
      return null
    }
  }, [])

  const toggleFacing = useCallback(async () => {
    const next: FacingMode = currentFacing.current === 'user' ? 'environment' : 'user'
    stop()
    return start({ facingMode: next })
  }, [start, stop])

  useEffect(() => () => stop(), [stop])

  return { stream, error, start, stop, toggleFacing, facingMode: currentFacing.current }
}
