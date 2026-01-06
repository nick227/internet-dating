import { useEffect, useRef } from 'react'

type Props = {
  canvas: HTMLCanvasElement
  onSample?: (normX: number, normY: number) => void
  sampleEnabled?: boolean
}

export function CanvasPreview({ canvas, onSample, sampleEnabled }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''
    host.appendChild(canvas)

    return () => {
      if (canvas.parentElement === host) {
        host.removeChild(canvas)
      }
    }
  }, [canvas])

  return (
    <div
      ref={hostRef}
      className={`video video-capture__canvas ${sampleEnabled ? 'is-sampling' : ''}`}
      onPointerDown={event => {
        if (!onSample || !sampleEnabled) return
        const host = hostRef.current
        if (!host) return
        const rect = host.getBoundingClientRect()
        const normX = (event.clientX - rect.left) / rect.width
        const normY = (event.clientY - rect.top) / rect.height
        onSample(normX, normY)
      }}
    />
  )
}
