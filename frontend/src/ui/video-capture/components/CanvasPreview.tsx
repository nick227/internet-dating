import { useEffect, useRef } from 'react'

export function CanvasPreview({ canvas }: { canvas: HTMLCanvasElement }) {
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

  return <div ref={hostRef} className="video video-capture__canvas" />
}
