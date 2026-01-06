import { CameraPreview } from './CameraPreview'
import { CanvasPreview } from './CanvasPreview'
import { RecordingOverlay } from './RecordingOverlay'

export function CameraStage(props: {
  stream: MediaStream
  maxMs: number
  onStart: () => void
  onStop: () => void
  isRecording: boolean
  toggleFacing: () => void
  elapsedMs: number
  onResetTimer: () => void
  previewCanvas?: HTMLCanvasElement | null
  onSampleKeyColor?: (normX: number, normY: number) => void
  sampleEnabled?: boolean
  mirrored?: boolean
}) {
  return (
    <>
      {props.previewCanvas ? (
        <CanvasPreview
          canvas={props.previewCanvas}
          onSample={props.onSampleKeyColor}
          sampleEnabled={props.sampleEnabled}
        />
      ) : (
        <CameraPreview stream={props.stream} mirrored={props.mirrored} />
      )}
      {props.isRecording ? (
        <RecordingOverlay
          elapsedMs={props.elapsedMs}
          maxMs={props.maxMs}
          onStop={props.onStop}
          onFlip={props.toggleFacing}
          canFlip={!props.isRecording}
        />
      ) : (
        <div className="overlayBottom" style={{ pointerEvents: 'auto' }}>
          <button
            className="btn primary"
            onClick={() => {
              props.onResetTimer()
              props.onStart()
            }}
            type="button"
          >
            Start
          </button>
        </div>
      )}
    </>
  )
}
