import { useEffect, useRef } from 'react'

export function CameraPreview(props: { stream: MediaStream; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = props.stream
    ref.current.play().catch(() => {})
  }, [props.stream])

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
