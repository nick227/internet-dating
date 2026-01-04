import { useEffect, useMemo, useRef, useState } from 'react'
import type { CaptureDuration } from './types'
import { useVideoCapture } from './hooks/useVideoCapture'
import { DurationSelectPanel } from './components/DurationSelectPanel'
import { CameraStage } from './components/CameraStage'
import { ReviewStage } from './components/ReviewStage'
import { useAudioOverlay } from './hooks/useAudioOverlay'
import { AudioOverlayPanel } from './components/AudioOverlayPanel'

type Props = {
  onPost?: (file: File, note: string) => void
  onRequestClose?: () => void
  onExitCapture?: () => void
}

function createCaptureFile(blob: Blob) {
  const type = blob.type || 'video/webm'
  const ext = type.includes('mp4') ? 'mp4' : 'webm'
  return new File([blob], `capture-${Date.now()}.${ext}`, { type })
}

export function VideoCaptureRoot({ onPost, onRequestClose, onExitCapture }: Props) {
  const [duration, setDuration] = useState<CaptureDuration>(10)
  const [greenScreenEnabled, setGreenScreenEnabled] = useState(false)
  const [backgroundColor, setBackgroundColor] = useState('#0f172a')
  const cap = useVideoCapture(duration, { greenScreenEnabled, backgroundColor })
  const audio = useAudioOverlay()
  const pendingDiscardRef = useRef(false)

  const isRecording = cap.status.kind === 'recording'

  const backgroundOptions = [
    { id: 'midnight', label: 'Midnight', color: '#0f172a' },
    { id: 'noir', label: 'Noir', color: '#111827' },
    { id: 'berry', label: 'Berry', color: '#4c1d95' },
    { id: 'rose', label: 'Rose', color: '#9f1239' },
    { id: 'sunset', label: 'Sunset', color: '#92400e' },
    { id: 'mint', label: 'Mint', color: '#065f46' },
  ]

  const headerBadge = useMemo(() => {
    if (cap.status.kind === 'requesting-permission') return 'permissions'
    if (cap.status.kind === 'recording') return 'recording'
    if (cap.mode === 'review') return 'review'
    return 'ready'
  }, [cap.status.kind, cap.mode])

  const handleBack = () => {
    if (cap.mode === 'review') {
      audio.clear()
      cap.discard()
      void cap.begin()
      return
    }

    if (cap.mode === 'record') {
      const ok = window.confirm('Discard this recording and go back?')
      if (!ok) return

      if (cap.status.kind === 'recording') {
        pendingDiscardRef.current = true
        cap.stopRecording()
        return
      }

      cap.discard()
      return
    }

    onRequestClose?.()
  }

  useEffect(() => {
    if (!pendingDiscardRef.current || !cap.recorded) return
    pendingDiscardRef.current = false
    cap.discard()
  }, [cap.recorded, cap.discard])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      handleBack()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleBack])

  return (
    <div className="video-capture">
      <div className="card">
        <div className="topbar">
          <div className="topbar__actions">
            <button className="btn" type="button" onClick={handleBack}>
              {cap.mode === 'select' ? 'Close' : 'Back'}
            </button>
            {cap.mode !== 'select' && onExitCapture && (
              <button className="btn" type="button" onClick={onExitCapture}>
                Back to post
              </button>
            )}
          </div>
          <div className="title">
            <span>Capture</span>
            <span className="badge">{duration}s</span>
            <span className="badge">{headerBadge}</span>
          </div>
          <div className="small">Record, preview, post.</div>
        </div>

        <div className="content">
          <div className="stage">
            {cap.mode === 'select' && (
              <div style={{ padding: 16 }}>
                <div className="meta" style={{ marginBottom: 10 }}>
                  Pick a duration. Tap once to start.
                </div>
              </div>
            )}

            {cap.mode === 'record' && cap.stream && (
              <CameraStage
                stream={cap.stream}
                previewCanvas={cap.previewCanvas ?? undefined}
                maxMs={cap.msMax}
                isRecording={isRecording}
                onStart={cap.startRecording}
                onStop={cap.stopRecording}
                toggleFacing={cap.toggleFacing}
              />
            )}

            {cap.mode === 'review' && cap.recorded && (
              <div style={{ padding: 14 }}>
              <ReviewStage
                recorded={cap.recorded}
                overlay={audio.overlay}
                greenScreenEnabled={greenScreenEnabled}
                backgroundColor={backgroundColor}
                backgroundOptions={backgroundOptions}
                onToggleGreenScreen={setGreenScreenEnabled}
                onSelectBackground={setBackgroundColor}
                onDiscard={() => { audio.clear(); cap.discard() }}
                onPost={(finalBlob, note) => {
                    if (onPost) {
                      onPost(createCaptureFile(finalBlob), note)
                    } else {
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(finalBlob)
                      a.download = 'post.webm'
                      a.click()
                      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
                      console.log('[POST]', { size: finalBlob.size, note, duration })
                    }
                    audio.clear()
                    cap.discard()
                  }}
                />
              </div>
            )}

            {cap.mode === 'select' && (
              <div style={{ padding: 14 }}>
                <div className="hint">Select a duration on the right, then open camera.</div>
              </div>
            )}
          </div>

          <div className="side">
            {cap.mode === 'select' && (
              <DurationSelectPanel
                value={duration}
                onChange={setDuration}
                onContinue={cap.begin}
              />
            )}

          {cap.mode === 'record' && (
            <div className="col">
              <div style={{ fontWeight: 700 }}>Recording</div>
              <div className="meta">
                Stops automatically at {duration}s.
              </div>
              <button className="btn danger" onClick={cap.discard} type="button" disabled={isRecording}>
                Cancel
              </button>
            </div>
          )}

            {cap.mode === 'review' && (
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
