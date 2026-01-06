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

        <div className="row">
          <div style={{ fontWeight: 700 }}>Audio overlay</div>
          {overlay.url ? (
            <button className="btn" onClick={props.onClear} type="button" disabled={props.disabled}>
              Clear
            </button>
          ) : null}
        </div>

        <div className="col">
          <input
            type="file"
            accept="audio/*"
            disabled={props.disabled}
            onChange={(e) => props.onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>

      </div>
    </div>
  )
}
