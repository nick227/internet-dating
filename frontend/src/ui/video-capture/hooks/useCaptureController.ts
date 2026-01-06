import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CaptureDuration } from '../types'
import { useAudioOverlay } from './useAudioOverlay'
import { useRecordingTimer } from './useRecordingTimer'
import { useVideoCapture } from './useVideoCapture'
import { renderAudioMix } from '../lib/renderAudioMix'

type Params = {
  duration: CaptureDuration
  greenScreenEnabled: boolean
  backgroundColor: string
  onPost?: (file: File, note: string) => void
  onRequestClose?: () => void
}

function createCaptureFile(blob: Blob) {
  const type = (blob.type || 'video/webm').split(';')[0]
  const ext = type.includes('mp4') ? 'mp4' : 'webm'
  return new File([blob], `capture-${Date.now()}.${ext}`, { type })
}

export function useCaptureController(params: Params) {
  const { duration, greenScreenEnabled, backgroundColor, onRequestClose, onPost } = params
  const cap = useVideoCapture(duration, { greenScreenEnabled, backgroundColor })
  const audio = useAudioOverlay()
  const pendingDiscardRef = useRef(false)
  const rerecordInFlightRef = useRef(false)
  const mixAbortRef = useRef<AbortController | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  const discardRef = useRef(cap.discard)
  const stopRecordingRef = useRef(cap.stopRecording)
  const onRequestCloseRef = useRef(onRequestClose)

  useEffect(() => {
    discardRef.current = cap.discard
    stopRecordingRef.current = cap.stopRecording
    onRequestCloseRef.current = onRequestClose
  }, [cap.discard, cap.stopRecording, onRequestClose])

  const onMaxReached = useCallback(() => {
    console.log('[capture] timer:callback')
    stopRecordingRef.current()
  }, [])

  const cancelMix = useCallback(() => {
    mixAbortRef.current?.abort()
    mixAbortRef.current = null
  }, [])

  const timer = useRecordingTimer(cap.msMax, cap.isRecording, onMaxReached)
  const remainingSeconds = Math.max(0, Math.ceil((cap.msMax - timer.elapsedMs) / 1000))

  const headerBadge = useMemo(() => {
    if (cap.status.kind === 'requesting-permission') return 'permissions'
    if (cap.status.kind === 'recording') return 'recording'
    if (cap.mode === 'review') return 'review'
    return 'ready'
  }, [cap.status.kind, cap.mode])

  const modeRef = useRef(cap.mode)
  const isRecordingRef = useRef(cap.isRecording)
  const clearRef = useRef(audio.clear)

  modeRef.current = cap.mode
  isRecordingRef.current = cap.isRecording
  clearRef.current = audio.clear

  const handleBack = useCallback(() => {
    console.log('[capture] ui:back', { mode: modeRef.current, isRecording: isRecordingRef.current })
    const currentMode = modeRef.current
    const currentIsRecording = isRecordingRef.current

    if (currentMode === 'review') {
      cancelMix()
      clearRef.current()
      discardRef.current()
      return
    }

    if (currentMode === 'record') {
      const ok = window.confirm('Discard this recording and go back?')
      if (!ok) return

      if (currentIsRecording) {
        pendingDiscardRef.current = true
        stopRecordingRef.current()
        return
      }

      cancelMix()
      discardRef.current()
      return
    }

    onRequestCloseRef.current?.()
  }, [cancelMix])

  useEffect(() => {
    if (!pendingDiscardRef.current || !cap.recorded) return
    pendingDiscardRef.current = false
    cancelMix()
    discardRef.current()
  }, [cap.recorded, cancelMix])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      handleBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleBack])

  const handleReviewDiscard = useCallback(async () => {
    console.log('[capture] review:discard')
    if (rerecordInFlightRef.current) return
    rerecordInFlightRef.current = true
    cancelMix()
    audio.clear()
    cap.discard()
    try {
      await cap.begin()
    } finally {
      rerecordInFlightRef.current = false
    }
  }, [audio, cap])

  const handlePostComplete = useCallback(() => {
    console.log('[capture] post:complete')
    cancelMix()
    audio.clear()
    cap.discard()
  }, [audio, cap, cancelMix])

  useEffect(() => {
    return () => cancelMix()
  }, [cancelMix])

  const post = useCallback(
    async (note: string) => {
      if (!cap.recorded) return
      if (isPosting) return
      setPostError(null)
      setIsPosting(true)
      try {
        const trimmedNote = note.trim()
        let finalBlob = cap.recorded.blob
        if (audio.overlay.blob) {
          cancelMix()
          const controller = new AbortController()
          mixAbortRef.current = controller
          finalBlob = await renderAudioMix({
            videoBlob: cap.recorded.blob,
            overlay: audio.overlay,
            signal: controller.signal,
          })
          mixAbortRef.current = null
        }

        if (onPost) {
          onPost(createCaptureFile(finalBlob), trimmedNote)
        } else {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(finalBlob)
          a.download = 'post.webm'
          a.click()
          setTimeout(() => URL.revokeObjectURL(a.href), 1000)
          console.log('[POST]', { size: finalBlob.size, note: trimmedNote, duration })
        }

        handlePostComplete()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to post'
        if (msg !== 'Mix cancelled') {
          setPostError(msg)
        }
      } finally {
        mixAbortRef.current = null
        setIsPosting(false)
      }
    },
    [cap.recorded, audio.overlay, onPost, handlePostComplete, duration, isPosting, cancelMix]
  )

  return {
    view: cap.mode,
    cap,
    audio,
    timer,
    remainingSeconds,
    headerBadge,
    isPosting,
    postError,
    post,
    handleBack,
    handleReviewDiscard,
    handlePostComplete,
  }
}
