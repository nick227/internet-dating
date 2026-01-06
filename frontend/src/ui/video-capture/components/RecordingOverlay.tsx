function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}`
}

export function RecordingOverlay(props: {
  elapsedMs: number
  maxMs: number
  onStop: () => void
  onFlip: () => void
  canFlip: boolean
}) {
  const remaining = Math.max(0, props.maxMs - props.elapsedMs)
  return (
    <>
      <div className="overlayTop">
        <div className="counter">{fmt(remaining)}</div>
        <div className="row" style={{ gap: 8, pointerEvents: 'auto' }}>
          <span className="pill">REC</span>
        </div>
      </div>
      <div className="overlayBottom" style={{ pointerEvents: 'auto' }}>
        <button
          className="btn danger"
          onClick={() => {
            console.log('[capture] ui:stop-click')
            props.onStop()
          }}
          type="button"
        >
          Stop
        </button>
      </div>
    </>
  )
}
