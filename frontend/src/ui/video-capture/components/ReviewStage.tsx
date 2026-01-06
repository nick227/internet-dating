import { useEffect, useRef, useState } from 'react'
import { useObjectUrl } from '../hooks/useObjectUrl'
import type { RecordedMedia } from '../types'
import type { AudioOverlayState } from '../hooks/useAudioOverlay'

export function ReviewStage(props: {
  recorded: RecordedMedia
  overlay: AudioOverlayState
  onPost: (note: string) => void
  onDiscard: () => void
  greenScreenEnabled: boolean
  backgroundColor: string
  backgroundOptions: { id: string; label: string; color: string }[]
  onToggleGreenScreen: (next: boolean) => void
  onSelectBackground: (color: string) => void
  isPosting?: boolean
  postError?: string | null
}) {
  const url = useObjectUrl(props.recorded.blob)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [note, setNote] = useState('')
  const hasOverlay = !!props.overlay.url

  const targetUrl = url

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return
    const audioEl = audioRef.current

    if (!hasOverlay || !audioEl) {
      videoEl.muted = false
      return
    }

    videoEl.muted = true
    audioEl.volume = props.overlay.volume
    audioEl.loop = videoEl.loop

    const syncAudio = () => {
      const offset = (props.overlay.offsetMs ?? 0) / 1000
      audioEl.currentTime = Math.max(0, videoEl.currentTime - offset)
    }

    const shouldPlayAudio = () => {
      const offset = (props.overlay.offsetMs ?? 0) / 1000
      return offset <= 0 || videoEl.currentTime >= offset
    }

    const handlePlay = () => {
      syncAudio()
      if (shouldPlayAudio()) {
        void audioEl.play().catch(() => {})
      } else {
        audioEl.pause()
      }
    }
    const handlePause = () => {
      audioEl.pause()
    }
    const handleSeeked = () => {
      syncAudio()
      if (!videoEl.paused && shouldPlayAudio()) {
        void audioEl.play().catch(() => {})
      } else {
        audioEl.pause()
      }
    }
    const handleEnded = () => {
      audioEl.pause()
    }

    videoEl.addEventListener('play', handlePlay)
    videoEl.addEventListener('pause', handlePause)
    videoEl.addEventListener('seeked', handleSeeked)
    videoEl.addEventListener('ended', handleEnded)

    return () => {
      videoEl.removeEventListener('play', handlePlay)
      videoEl.removeEventListener('pause', handlePause)
      videoEl.removeEventListener('seeked', handleSeeked)
      videoEl.removeEventListener('ended', handleEnded)
      audioEl.pause()
    }
  }, [hasOverlay, props.overlay.offsetMs, props.overlay.volume])

  return (
    <div className="col video-capture__review">

      <div className="col video-capture__preview">
        <video
          ref={videoRef}
          className="video"
          src={targetUrl ?? ''}
          controls
          playsInline
          loop
        />
        {hasOverlay && (
          <audio ref={audioRef} src={props.overlay.url ?? ''} preload="auto" style={{ display: 'none' }} />
        )}
      </div>

      <div className="col">
        <label className="small">Caption</label>
        <input
          className="video-capture__caption"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Say something..."
        />
      </div>

      <div className="row video-capture__reviewActions">
        <button className="btn danger" onClick={props.onDiscard} type="button">
          Retry
        </button>

        <button className="btn primary" onClick={() => props.onPost(note)} type="button" disabled={props.isPosting}>
          Post
        </button>
      </div>
      {!!props.postError && <div className="hint">{props.postError}</div>}

      <div className="video-capture__panel">
        <div className="row video-capture__panelHeader hidden">
          <div className="small">Green screen</div>
          <button
            className={`btn ${props.greenScreenEnabled ? 'primary' : ''}`}
            type="button"
            disabled={props.isPosting}
            onClick={() => props.onToggleGreenScreen(!props.greenScreenEnabled)}
          >
            {props.greenScreenEnabled ? 'On' : 'Off'}
          </button>
        </div>
        {props.greenScreenEnabled && (
          <>
            <div className="video-capture__swatches">
              {props.backgroundOptions.map(option => (
                <button
                  key={option.id}
                  className={`video-capture__swatch ${props.backgroundColor === option.color ? 'is-active' : ''}`}
                  type="button"
                  aria-label={option.label}
                  title={option.label}
                  style={{ background: option.color }}
                  disabled={props.isPosting}
                  onClick={() => props.onSelectBackground(option.color)}
                />
              ))}
            </div>
            <div className="hint">Solid backgrounds for now. Applies to next recording.</div>
          </>
        )}
      </div>
    </div>
  )
}
