import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type FacingMode = 'user' | 'environment'

export function useMediaStream() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const currentFacing = useRef<FacingMode>('user')

  const mapGetUserMediaError = useCallback((err: unknown) => {
    const name = err instanceof Error ? err.name : ''
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'PERMISSION_DENIED'
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'DEVICE_NOT_FOUND'
      case 'NotReadableError':
      case 'TrackStartError':
        return 'DEVICE_IN_USE'
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return 'CONSTRAINT_NOT_SATISFIED'
      default:
        return 'FAILED_TO_START'
    }
  }, [])

  const stop = useCallback(() => {
    setStream((s) => {
      s?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  const start = useCallback(async (opts?: { facingMode?: FacingMode }): Promise<{ stream: MediaStream | null; error: string | null }> => {
    setError(null)
    const facingMode = opts?.facingMode ?? currentFacing.current
    currentFacing.current = facingMode

    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true },
      { video: { facingMode, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false },
      { video: { facingMode }, audio: false },
      { video: true, audio: false },
    ]

    let lastError: unknown = null
    for (const constraints of attempts) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints)
        setStream(s)
        return { stream: s, error: null }
      } catch (e) {
        lastError = e
      }
    }

    const msg = mapGetUserMediaError(lastError)
    setError(msg)
    setStream(null)
    return { stream: null, error: msg }
  }, [mapGetUserMediaError])

  const toggleFacing = useCallback(async () => {
    const next: FacingMode = currentFacing.current === 'user' ? 'environment' : 'user'
    stop()
    await start({ facingMode: next })
    // Stream is updated via state, no need to return
  }, [start, stop])

  useEffect(() => () => stop(), [stop])

  return useMemo(
    () => ({
      stream,
      error,
      start,
      stop,
      toggleFacing,
      facingMode: currentFacing.current,
    }),
    [stream, error, start, stop, toggleFacing]
  )
}
