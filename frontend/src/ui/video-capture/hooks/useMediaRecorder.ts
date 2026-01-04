import { useCallback, useMemo, useRef, useState } from 'react'

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const c of candidates) {
    if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c
  }
  return ''
}

export function useMediaRecorder(stream: MediaStream | null) {
  const [isRecording, setIsRecording] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [mimeType, setMimeType] = useState<string>('video/webm')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const canRecord = useMemo(() => !!stream && typeof (window as any).MediaRecorder !== 'undefined', [stream])

  const start = useCallback(() => {
    if (!stream) throw new Error('No MediaStream')
    if (!canRecord) throw new Error('MediaRecorder unsupported')
    setBlob(null)

    const mt = pickMimeType()
    const rec = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined)
    recorderRef.current = rec
    chunksRef.current = []

    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
    }
    rec.onstop = () => {
      const out = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
      setMimeType(rec.mimeType || 'video/webm')
      setBlob(out)
      setIsRecording(false)
    }

    rec.start(250)
    setIsRecording(true)
  }, [stream, canRecord])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (!rec) return
    if (rec.state === 'inactive') return
    rec.stop()
  }, [])

  return { canRecord, isRecording, blob, mimeType, start, stop }
}
