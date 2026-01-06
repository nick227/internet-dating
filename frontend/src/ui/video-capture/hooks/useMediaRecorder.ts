import { useCallback, useMemo, useRef, useState } from 'react'

function pickMimeType(hasAudio: boolean) {
  const candidates = hasAudio
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
    : [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ]
  type WindowWithMediaRecorder = Window & {
    MediaRecorder?: {
      isTypeSupported?: (mimeType: string) => boolean
    }
  }
  for (const c of candidates) {
    if ((window as WindowWithMediaRecorder).MediaRecorder?.isTypeSupported?.(c)) return c
  }
  return ''
}

export function useMediaRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [mimeType, setMimeType] = useState<string>('video/webm')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recorderIdRef = useRef(0)
  const stopPromiseRef = useRef<{
    id: number
    resolve: (blob: Blob | null) => void
  } | null>(null)
  const finalizedIdRef = useRef<number | null>(null)
  const stopRequestedRef = useRef(false)
  const stopResultRef = useRef<Promise<Blob | null> | null>(null)

  type WindowWithMediaRecorder = Window & {
    MediaRecorder?: typeof MediaRecorder
  }
  const canRecord = useMemo(() => typeof (window as WindowWithMediaRecorder).MediaRecorder !== 'undefined', [])

  const finalize = useCallback((recorderId: number, blob: Blob | null, reason: string) => {
    if (finalizedIdRef.current === recorderId) return
    finalizedIdRef.current = recorderId
    stopResultRef.current = null
    stopRequestedRef.current = false
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null
      recorderRef.current.onstop = null
      recorderRef.current.onerror = null
    }
    if (blob) {
      setBlob(blob)
      setMimeType(blob.type || 'video/webm')
    }
    setIsRecording(false)
    recorderRef.current = null
    if (stopPromiseRef.current?.id === recorderId) {
      stopPromiseRef.current.resolve(blob)
      stopPromiseRef.current = null
    }
    console.log('[capture] recorder:finalize', { reason, size: blob?.size ?? 0 })
  }, [])

  const start = useCallback((activeStream?: MediaStream | null) => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      return recorderIdRef.current
    }
    if (!activeStream) throw new Error('No MediaStream')
    type WindowWithMediaRecorder = Window & {
      MediaRecorder?: typeof MediaRecorder
    }
    if (typeof (window as WindowWithMediaRecorder).MediaRecorder === 'undefined') throw new Error('MediaRecorder unsupported')
    if (activeStream.getTracks().length === 0) throw new Error('No media tracks')
    setBlob(null)
    const hasAudio = activeStream.getAudioTracks().length > 0
    const mt = pickMimeType(hasAudio)
    const rec = new MediaRecorder(activeStream, mt ? { mimeType: mt } : undefined)
    recorderRef.current = rec
    recorderIdRef.current += 1
    const recorderId = recorderIdRef.current
    finalizedIdRef.current = null
    stopRequestedRef.current = false
    chunksRef.current = []

    rec.onstart = () => {
      setIsRecording(true)
      if (stopRequestedRef.current) {
        try {
          rec.stop()
        } catch {
          finalize(recorderId, null, 'stop-error')
        }
      }
    }
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data)
      }
    }
    rec.onstop = () => {
      const out = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
      finalize(recorderId, out, 'onstop')
    }
    rec.onerror = () => {
      finalize(recorderId, null, 'onerror')
    }

    rec.start()
    if (rec.state === 'recording') {
      setIsRecording(true)
    } else {
      setTimeout(() => {
        if (rec.state === 'recording') {
          setIsRecording(true)
        }
      }, 300)
    }
    return recorderId
  }, [finalize])

  const stop = useCallback((recorderId?: number) => {
    if (stopResultRef.current) {
      return stopResultRef.current
    }
    const rec = recorderRef.current
    if (!rec) {
      return Promise.resolve(null)
    }
    if (rec.state === 'inactive') {
      return Promise.resolve(null)
    }
    if (recorderId != null && recorderId !== recorderIdRef.current) {
      return Promise.resolve(null)
    }
    const stopPromise = new Promise<Blob | null>((resolve) => {
      stopPromiseRef.current = { id: recorderIdRef.current, resolve }
      stopRequestedRef.current = true
      if (rec.state === 'recording') {
        try {
          rec.stop()
        } catch {
          finalize(recorderIdRef.current, null, 'stop-error')
        }
      }
    })
    stopResultRef.current = stopPromise
    return stopPromise
  }, [finalize])

  return useMemo(
    () => ({
      canRecord,
      isRecording,
      blob,
      mimeType,
      start,
      stop,
    }),
    [canRecord, isRecording, blob, mimeType, start, stop]
  )
}
