import { useState } from 'react'
import type { CaptureDuration } from './types'
import { useCaptureController } from './hooks/useCaptureController'
import { DurationSelectPanel } from './components/DurationSelectPanel'
import { CameraStage } from './components/CameraStage'
import { ReviewStage } from './components/ReviewStage'
import { AudioOverlayPanel } from './components/AudioOverlayPanel'

type Props = {
  onPost?: (file: File, note: string) => void
  onRequestClose?: () => void
  onExitCapture?: () => void
}

export function VideoCaptureRoot({ onPost, onRequestClose, onExitCapture }: Props) {
  const [duration, setDuration] = useState<CaptureDuration>(10)
  const [greenScreenEnabled, setGreenScreenEnabled] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState('#0f172a')
  const controller = useCaptureController({
    duration,
    greenScreenEnabled,
    backgroundColor,
    onRequestClose,
    onPost,
  })
  const { cap, audio, timer, remainingSeconds, headerBadge, view, isPosting, postError } = controller

  const backgroundOptions = [
    { id: 'midnight', label: 'Midnight', color: '#0f172a' },
    { id: 'noir', label: 'Noir', color: '#111827' },
    { id: 'berry', label: 'Berry', color: '#4c1d95' },
    { id: 'rose', label: 'Rose', color: '#9f1239' },
    { id: 'sunset', label: 'Sunset', color: '#92400e' },
    { id: 'mint', label: 'Mint', color: '#065f46' },
  ]

  const isRecording = cap.isRecording

  return (
    <div className="video-capture">
      <div className="card">
        <div className="topbar">
          <div className="topbar__actions">
            <button className="btn" type="button" onClick={controller.handleBack}>
              {view === 'select' ? 'Close' : 'Back'}
            </button>
            {view !== 'select' && onExitCapture && (
              <button className="btn" type="button" onClick={onExitCapture}>
                Back to post
              </button>
            )}
          </div>
          <div className="title">
            <span>Capture</span>
            <span className="badge">{isRecording ? remainingSeconds : duration}s</span>
            <span className="badge">{headerBadge}</span>
          </div>
          <div className="small">Record, preview, post.</div>
        </div>

        <div className="content">
          <div className="stage">

            {view === 'record' && cap.stream && (
              <CameraStage
                stream={cap.stream}
                previewCanvas={cap.previewCanvas ?? undefined}
                maxMs={cap.msMax}
                isRecording={isRecording}
                elapsedMs={timer.elapsedMs}
                onResetTimer={timer.reset}
                onStart={cap.startRecording}
                onStop={cap.stopRecording}
                toggleFacing={cap.toggleFacing}
                onSampleKeyColor={cap.sampleKeyColor}
                sampleEnabled={greenScreenEnabled && !isRecording}
                mirrored={cap.facingMode === 'user'}
              />
            )}

            {view === 'review' && cap.recorded && (
                <ReviewStage
                  recorded={cap.recorded}
                  overlay={audio.overlay}
                  greenScreenEnabled={greenScreenEnabled}
                  backgroundColor={backgroundColor}
                  backgroundOptions={backgroundOptions}
                  onToggleGreenScreen={setGreenScreenEnabled}
                  onSelectBackground={setBackgroundColor}
                  onDiscard={controller.handleReviewDiscard}
                  onPost={controller.post}
                  isPosting={isPosting}
                  postError={postError}
                />
            )}
          </div>

          <div className="controls">
            {view === 'select' && (
              <div className="col">
                <DurationSelectPanel
                  value={duration}
                  onChange={setDuration}
                  onContinue={cap.begin}
                />
              </div>
            )}

            {view === 'record' && (
              <div className="col">
                <div style={{ fontWeight: 700 }}>Recording</div>
                <div className="meta">
                  {isRecording ? `Remaining: ${remainingSeconds}` : `Stops automatically in ${duration}s.`}
                </div>
                {greenScreenEnabled && !isRecording && (
                  <div className="hint">Tap the preview to sample your green screen.</div>
                )}
                <button className="btn danger" onClick={cap.discard} type="button" disabled={isRecording}>
                  Cancel
                </button>
              </div>
            )}

            {view === 'review' && (
              <AudioOverlayPanel
                overlay={audio.overlay}
                onPickFile={audio.setFile}
                onVolume={audio.setVolume}
                onOffsetMs={audio.setOffsetMs}
                onClear={audio.clear}
              />
            )}

            {cap.status.kind === 'error' && (
              <div className="col">
                <div style={{ fontWeight: 700 }}>Error</div>
                <div className="meta">{cap.status.message}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
