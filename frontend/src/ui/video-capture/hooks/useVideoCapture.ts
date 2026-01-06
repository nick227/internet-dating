import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaptureDuration, CaptureMode, CaptureStatus, RecordedMedia } from '../types'
import { useMediaStream } from './useMediaStream'
import { useMediaRecorder } from './useMediaRecorder'
import { CanvasComposer } from '../render/CanvasComposer'

type Options = {
  greenScreenEnabled?: boolean
  backgroundColor?: string
}

export function useVideoCapture(duration: CaptureDuration, options: Options = {}) {
  const [mode, setMode] = useState<CaptureMode>('select')
  const [status, setStatus] = useState<CaptureStatus>({ kind: 'idle' })
  const [recorded, setRecorded] = useState<RecordedMedia | null>(null)
  const [composerCanvas, setComposerCanvas] = useState<HTMLCanvasElement | null>(null)
  const [composerStream, setComposerStream] = useState<MediaStream | null>(null)
  const composerRef = useRef<CanvasComposer | null>(null)
  const composerVideoRef = useRef<HTMLVideoElement | null>(null)
  const recorderIdRef = useRef<number | null>(null)
  const beginInFlightRef = useRef(false)

  const msMax = useMemo(() => duration * 1000, [duration])

  const media = useMediaStream()
  const rec = useMediaRecorder()

  const destroyComposer = useCallback(() => {
    composerRef.current?.destroy()
    composerRef.current = null
    setComposerCanvas(null)
    setComposerStream(null)
    if (composerVideoRef.current) {
      composerVideoRef.current.srcObject = null
      composerVideoRef.current.remove()
      composerVideoRef.current = null
    }
  }, [])

  const ensureComposer = useCallback(async (sourceStream?: MediaStream | null) => {
    if (!options.greenScreenEnabled) return false
    
    const streamResult = sourceStream
      ? { stream: sourceStream, error: null }
      : media.stream
        ? { stream: media.stream, error: null }
        : await media.start()
    if (!streamResult.stream) return false
    const stream = streamResult.stream
    
    if (!composerRef.current) {
      const width = 720
      const height = 1280
      try {
        composerRef.current = new CanvasComposer({
          width,
          height,
          backgroundColor: options.backgroundColor ?? '#0f172a',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Green screen unavailable'
        setStatus({ kind: 'error', message: msg })
        return false
      }
      
      setComposerCanvas(composerRef.current.getCanvas())
      setComposerStream(composerRef.current.getStream(30))
    } else if (options.backgroundColor) {
      composerRef.current.setBackgroundColor(options.backgroundColor)
    }

    if (!composerVideoRef.current) {
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.style.position = 'fixed'
      video.style.left = '-99999px'
      video.style.top = '-99999px'
      document.body.appendChild(video)
      composerVideoRef.current = video
    }

    // Verify refs exist before using (safety check)
    if (!composerVideoRef.current || !composerRef.current) {
      return false
    }

    composerVideoRef.current.srcObject = stream
    await composerVideoRef.current.play().catch(() => {})
    
    // Final safety check before starting composer
    if (!composerRef.current || !composerVideoRef.current) {
      return false
    }
    
    composerRef.current.setMirror(media.facingMode === 'user')
    composerRef.current.setSource(composerVideoRef.current)
    composerRef.current.start()
    return true
  }, [media, options.backgroundColor, options.greenScreenEnabled])

  const openCamera = useCallback(async (): Promise<MediaStream | null> => {
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus({ kind: 'error', message: 'Camera not supported in this browser' })
      return null
    }

    console.log('[capture] openCamera:request')
    setStatus({ kind: 'requesting-permission' })
    const result = await media.start()
    if (!result.stream) {
      const errorMsg = result.error || 'Camera permission denied'
      setStatus({ kind: 'error', message: errorMsg })
      console.log('[capture] openCamera:error', { error: errorMsg })
      return null
    }
    console.log('[capture] openCamera:success')
    setStatus({ kind: 'ready' })
    return result.stream
  }, [media])

  const closeCamera = useCallback(() => {
    media.stop()
    setStatus({ kind: 'idle' })
  }, [media])

  const begin = useCallback(async () => {
    if (beginInFlightRef.current) return
    beginInFlightRef.current = true
    setRecorded(null)
    console.log('[capture] begin')
    try {
      const stream = await openCamera()
      if (!stream) return
      if (options.greenScreenEnabled) {
        const composerReady = await ensureComposer(stream)
        if (!composerReady) {
          setStatus({ kind: 'error', message: 'Green screen unavailable' })
          closeCamera()
          return
        }
      }
      setMode('record')
    } finally {
      beginInFlightRef.current = false
    }
  }, [openCamera, options.greenScreenEnabled, ensureComposer, closeCamera])

  const startRecording = useCallback(() => {
    if (status.kind === 'stopping') {
      console.warn('[capture] startRecording:ignored', { reason: 'stopping' })
      return
    }
    if (recorderIdRef.current != null) {
      console.warn('[capture] startRecording:ignored', { reason: 'already-started', id: recorderIdRef.current })
      return
    }
    if (options.greenScreenEnabled && !composerStream) {
      setStatus({ kind: 'error', message: 'Green screen pipeline not ready' })
      return
    }
    if (!rec.canRecord) {
      setStatus({ kind: 'error', message: 'MediaRecorder unsupported (try Chrome/Edge)' })
      return
    }
    const streamSnapshot = options.greenScreenEnabled ? composerStream ?? null : media.stream
    if (!streamSnapshot) {
      setStatus({ kind: 'error', message: 'Camera stream unavailable' })
      return
    }
    try {
      console.log('[capture] startRecording')
      setStatus({ kind: 'recording' })
      recorderIdRef.current = rec.start(streamSnapshot)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording'
      setStatus({ kind: 'error', message: msg })
    }
  }, [status.kind, rec, options.greenScreenEnabled, composerStream, media.stream])

  const stopRecording = useCallback(async () => {
    try {
      console.log('[capture] stopRecording')
      if (rec.isRecording) {
        setStatus({ kind: 'stopping' })
      }
      await rec.stop(recorderIdRef.current ?? undefined)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop recording'
      setStatus({ kind: 'error', message: msg })
    } finally {
      recorderIdRef.current = null
    }
  }, [rec])

  // When recorder produces blob, transition to review
  useEffect(() => {
    if (!rec.blob) return
    
    console.log('[capture] blob:ready', { size: rec.blob.size, type: rec.mimeType })
    setRecorded({ blob: rec.blob, mimeType: rec.mimeType, createdAt: Date.now() })
    setMode('review')
    closeCamera()
    composerRef.current?.stop()
    destroyComposer()
    setStatus({ kind: 'idle' })
  }, [rec.blob, rec.mimeType, closeCamera, destroyComposer])

  const discard = useCallback(() => {
    // Cleanup: clear recorded blob (cleanup handled by useEffect cleanup)
    setRecorded(null)
    setMode('select')
    setStatus({ kind: 'idle' })
    closeCamera()
    destroyComposer()
  }, [closeCamera, destroyComposer])

  const sampleKeyColor = useCallback((normX: number, normY: number) => {
    if (!options.greenScreenEnabled) return false
    return composerRef.current?.sampleKeyColor(normX, normY) ?? false
  }, [options.greenScreenEnabled])

  useEffect(() => {
    if (!options.greenScreenEnabled) {
      destroyComposer()
      return
    }
    if (options.backgroundColor && composerRef.current) {
      composerRef.current.setBackgroundColor(options.backgroundColor)
    }
    if (composerRef.current) {
      composerRef.current.setMirror(media.facingMode === 'user')
    }
  }, [options.backgroundColor, options.greenScreenEnabled, destroyComposer, media.facingMode])

  useEffect(() => {
    return () => destroyComposer()
  }, [destroyComposer])

  // Create stable status key for comparison - use this consistently
  const statusKey = useMemo(
    () => (status.kind === 'error' ? `${status.kind}:${status.message}` : status.kind),
    [status]
  )

  // Memoize status object to prevent unnecessary re-renders
  // statusKey tracks meaningful content changes (kind + message for errors)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableStatus = useMemo(() => status, [statusKey])

  return useMemo(
    () => ({
      mode,
      setMode,
      status: stableStatus,
      isRecording: rec.isRecording,
      duration,
      msMax,
      stream: media.stream,
      error: media.error,
      toggleFacing: media.toggleFacing,
      facingMode: media.facingMode,
      begin,
      startRecording,
      stopRecording,
      discard,
      recorded,
      previewCanvas: options.greenScreenEnabled ? composerCanvas : null,
      sampleKeyColor,
    }),
    [
      mode,
      setMode,
      stableStatus,
      rec.isRecording,
      duration,
      msMax,
      media.stream,
      media.error,
      media.toggleFacing,
      media.facingMode,
      begin,
      startRecording,
      stopRecording,
      discard,
      recorded,
      composerCanvas,
      options.greenScreenEnabled,
      sampleKeyColor,
    ]
  )
}
