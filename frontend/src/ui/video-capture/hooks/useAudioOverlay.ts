import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useObjectUrl } from './useObjectUrl'

export type AudioOverlayState = {
  file: File | null
  blob: Blob | null
  url: string | null
  volume: number // 0..1
  offsetMs: number
}

export function useAudioOverlay() {
  const [file, setFile] = useState<File | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [volume, setVolume] = useState(0.9)
  const [offsetMs, setOffsetMs] = useState(0)

  useEffect(() => {
    if (!file) {
      setBlob(null)
      return
    }
    setBlob(file)
  }, [file])

  const url = useObjectUrl(blob)

  const clear = useCallback(() => {
    setFile(null)
    setBlob(null)
    setOffsetMs(0)
    setVolume(0.9)
  }, [])

  return {
    overlay: { file, blob, url, volume, offsetMs } as AudioOverlayState,
    setFile,
    setVolume,
    setOffsetMs,
    clear,
  }
}
