import type { CaptureDuration } from '../types'

export function DurationSelectPanel(props: {
  value: CaptureDuration
  onChange: (d: CaptureDuration) => void
  onContinue: () => void
}) {
  const { value, onChange, onContinue } = props
  const options: CaptureDuration[] = [10, 30, 60]

  return (
    <div className="col">
      <div className="meta">Duration</div>
      <div className="seg">
        {options.map((d) => (
          <button
            key={d}
            className={'btn' + (value === d ? ' active' : '')}
            onClick={() => onChange(d)}
            type="button"
          >
            {d}s
          </button>
        ))}
      </div>
      <button className="btn primary" onClick={onContinue} type="button">
        Open camera
      </button>
      <div className="hint">Chrome/Edge works best for MediaRecorder.</div>
    </div>
  )
}
