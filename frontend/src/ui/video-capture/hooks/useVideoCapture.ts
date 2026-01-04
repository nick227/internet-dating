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

  const msMax = useMemo(() => duration * 1000, [duration])

  const media = useMediaStream()
  const recordStream = options.greenScreenEnabled && composerStream ? composerStream : media.stream
  const rec = useMediaRecorder(recordStream)

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

  const ensureComposer = useCallback(async () => {
    if (!options.greenScreenEnabled) return false
    const stream = media.stream ?? (await media.start())
    if (!stream) return false

    if (!composerRef.current) {
      const width = 720
      const height = 1280
      composerRef.current = new CanvasComposer({
        width,
        height,
        backgroundColor: options.backgroundColor ?? '#0f172a',
      })
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

    composerVideoRef.current.srcObject = stream
    await composerVideoRef.current.play().catch(() => {})
    composerRef.current.setSource(composerVideoRef.current)
    composerRef.current.start()
    return true
  }, [media, options.backgroundColor, options.greenScreenEnabled])

  const openCamera = useCallback(async () => {
    setStatus({ kind: 'requesting-permission' })
    const s = await media.start()
    if (!s) {
      setStatus({ kind: 'error', message: media.error ?? 'Camera permission denied' })
      return false
    }
    setStatus({ kind: 'ready' })
    return true
  }, [media])

  const closeCamera = useCallback(() => {
    media.stop()
    setStatus({ kind: 'idle' })
  }, [media])

  const begin = useCallback(async () => {
    setRecorded(null)
    const ok = await openCamera()
    if (!ok) return
    if (options.greenScreenEnabled) {
      const composerReady = await ensureComposer()
      if (!composerReady) {
        setStatus({ kind: 'error', message: 'Green screen unavailable' })
        closeCamera()
        return
      }
    }
    setMode('record')
  }, [openCamera, options.greenScreenEnabled, ensureComposer, closeCamera])

  const startRecording = useCallback(() => {
    if (options.greenScreenEnabled && !composerStream) {
      setStatus({ kind: 'error', message: 'Green screen pipeline not ready' })
      return
    }
    if (!rec.canRecord) {
      setStatus({ kind: 'error', message: 'MediaRecorder unsupported (try Chrome/Edge)' })
      return
    }
    setStatus({ kind: 'recording' })
    rec.start()
  }, [rec])

  const stopRecording = useCallback(() => {
    if (!rec.isRecording) return
    setStatus({ kind: 'stopping' })
    rec.stop()
  }, [rec])

  // When recorder produces blob, transition to review
  useEffect(() => {
    if (!rec.blob) return
    setRecorded({ blob: rec.blob, mimeType: rec.mimeType, createdAt: Date.now() })
    setMode('review')
    closeCamera()
    composerRef.current?.stop()
    setStatus({ kind: 'idle' })
  }, [rec.blob, rec.mimeType, closeCamera])

  const discard = useCallback(() => {
    setRecorded(null)
    setMode('select')
    setStatus({ kind: 'idle' })
    closeCamera()
    destroyComposer()
  }, [closeCamera, destroyComposer])

  useEffect(() => {
    if (!options.greenScreenEnabled) {
      destroyComposer()
      return
    }
    if (options.backgroundColor && composerRef.current) {
      composerRef.current.setBackgroundColor(options.backgroundColor)
    }
  }, [options.backgroundColor, options.greenScreenEnabled, destroyComposer])

  useEffect(() => {
    return () => destroyComposer()
  }, [destroyComposer])

  return {
    mode,
    setMode,
    status,
    duration,
    msMax,
    stream: media.stream,
    error: media.error,
    toggleFacing: media.toggleFacing,
    begin,
    startRecording,
    stopRecording,
    discard,
    recorded,
    previewCanvas: options.greenScreenEnabled ? composerCanvas : null,
  }
}
