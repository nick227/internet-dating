import { useCallback } from 'react'
import { CameraPreview } from './CameraPreview'
import { CanvasPreview } from './CanvasPreview'
import { RecordingOverlay } from './RecordingOverlay'
import { useRecordingTimer } from '../hooks/useRecordingTimer'

export function CameraStage(props: {
  stream: MediaStream
  maxMs: number
  onStart: () => void
  onStop: () => void
  isRecording: boolean
  toggleFacing: () => void
  previewCanvas?: HTMLCanvasElement | null
}) {
  const onMaxReached = useCallback(() => props.onStop(), [props])

  const timer = useRecordingTimer(props.maxMs, props.isRecording, onMaxReached)

  return (
    <>
      {props.previewCanvas ? (
        <CanvasPreview canvas={props.previewCanvas} />
      ) : (
        <CameraPreview stream={props.stream} mirrored={true} />
      )}
      {props.isRecording ? (
        <RecordingOverlay
          elapsedMs={timer.elapsedMs}
          maxMs={props.maxMs}
          onStop={props.onStop}
          onFlip={props.toggleFacing}
          canFlip={!props.isRecording}
        />
      ) : (
        <div className="overlayBottom" style={{ pointerEvents: 'auto' }}>
          <button className="btn primary" onClick={() => { timer.reset(); props.onStart() }} type="button">
            Start
          </button>
          <button className="btn" onClick={props.toggleFacing} type="button">
            Flip
          </button>
        </div>
      )}
    </>
  )
}
