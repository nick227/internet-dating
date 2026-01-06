import { useEffect, useRef } from 'react'

type WindowWithDebug = Window & {
  __CAPTURE_DEBUG__?: boolean
}

export function CameraPreview(props: { stream: MediaStream; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const debug = typeof window !== 'undefined' && (window as WindowWithDebug).__CAPTURE_DEBUG__ === true

  useEffect(() => {
    const videoEl = ref.current
    if (!videoEl) return
    videoEl.srcObject = props.stream
    if (debug) console.log('[capture] preview:setStream')
    videoEl.play().catch(() => {
      if (debug) console.log('[capture] preview:play:failed')
    })
    return () => {
      if (!videoEl) return
      if (debug) console.log('[capture] preview:cleanup')
      videoEl.pause()
      videoEl.srcObject = null
      videoEl.load()
    }
  }, [props.stream, debug])

  return (
    <video
      ref={ref}
      className="video"
      playsInline
      muted
      style={{ transform: props.mirrored ? 'scaleX(-1)' : undefined }}
    />
  )
}
