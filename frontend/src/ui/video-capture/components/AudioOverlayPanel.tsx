import type { AudioOverlayState } from '../hooks/useAudioOverlay'

export function AudioOverlayPanel(props: {
  overlay: AudioOverlayState
  onPickFile: (f: File | null) => void
  onVolume: (v: number) => void
  onOffsetMs: (ms: number) => void
  onClear: () => void
  disabled?: boolean
}) {
  const { overlay } = props
  return (
    <div className="col">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700 }}>Audio overlay</div>
        {overlay.url ? (
          <button className="btn" onClick={props.onClear} type="button" disabled={props.disabled}>
            Clear
          </button>
        ) : null}
      </div>

      <input
        type="file"
        accept="audio/*"
        disabled={props.disabled}
        onChange={(e) => props.onPickFile(e.target.files?.[0] ?? null)}
      />

      <div className="col">
        <div className="small">Volume</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={overlay.volume}
          disabled={props.disabled || !overlay.url}
          onChange={(e) => props.onVolume(Number(e.target.value))}
        />
        <div className="hint">{Math.round(overlay.volume * 100)}%</div>
      </div>

      <div className="col">
        <div className="small">Start delay (ms)</div>
        <input
          type="range"
          min={0}
          max={5000}
          step={100}
          value={overlay.offsetMs}
          disabled={props.disabled || !overlay.url}
          onChange={(e) => props.onOffsetMs(Number(e.target.value))}
        />
        <div className="hint">{overlay.offsetMs} ms</div>
      </div>

      <div className="hint">
        POC approach: render a mixed <code>webm</code> by recording <code>video.captureStream()</code> + WebAudio track.
      </div>
    </div>
  )
}
