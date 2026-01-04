import { useRef, useState } from 'react'
import { useObjectUrl } from '../hooks/useObjectUrl'
import type { RecordedMedia } from '../types'
import type { AudioOverlayState } from '../hooks/useAudioOverlay'
import { renderMixedWebm } from '../lib/renderMixedWebm'

export function ReviewStage(props: {
  recorded: RecordedMedia
  overlay: AudioOverlayState
  onPost: (finalBlob: Blob, note: string) => void
  onDiscard: () => void
  greenScreenEnabled: boolean
  backgroundColor: string
  backgroundOptions: { id: string; label: string; color: string }[]
  onToggleGreenScreen: (next: boolean) => void
  onSelectBackground: (color: string) => void
}) {
  const url = useObjectUrl(props.recorded.blob)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [note, setNote] = useState('')
  const [rendering, setRendering] = useState(false)
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null)
  const renderedUrl = useObjectUrl(renderedBlob)

  const hasOverlay = !!props.overlay.url

  const targetUrl = renderedUrl ?? url
  const targetLabel = renderedUrl ? 'Mixed (video+audio)' : 'Original'

  const canRender = hasOverlay && !rendering

  const doRender = async () => {
    if (!videoRef.current) return
    setRendering(true)
    setRenderedBlob(null)
    try {
      // Use hidden elements to avoid interfering with the visible player
      const hiddenVideo = document.createElement('video')
      hiddenVideo.src = url ?? ''
      hiddenVideo.crossOrigin = 'anonymous'
      hiddenVideo.playsInline = true
      hiddenVideo.muted = true
      hiddenVideo.style.position = 'fixed'
      hiddenVideo.style.left = '-99999px'
      hiddenVideo.style.top = '-99999px'
      document.body.appendChild(hiddenVideo)

      const hiddenAudio = hasOverlay ? document.createElement('audio') : null
      if (hiddenAudio && props.overlay.url) {
        hiddenAudio.src = props.overlay.url
        hiddenAudio.crossOrigin = 'anonymous'
        hiddenAudio.preload = 'auto'
        hiddenAudio.style.position = 'fixed'
        hiddenAudio.style.left = '-99999px'
        hiddenAudio.style.top = '-99999px'
        document.body.appendChild(hiddenAudio)
      }

      // Wait for both to be ready
      await Promise.all([
        new Promise<void>((res) => {
          if (hiddenVideo.readyState >= 1) return res()
          hiddenVideo.addEventListener('loadedmetadata', () => res(), { once: true })
        }),
        hiddenAudio
          ? new Promise<void>((res) => {
              if (hiddenAudio.readyState >= 1) return res()
              hiddenAudio.addEventListener('loadedmetadata', () => res(), { once: true })
            })
          : Promise.resolve(),
      ])

      const out = await renderMixedWebm({
        videoEl: hiddenVideo,
        audioEl: hiddenAudio,
        audioVolume: props.overlay.volume,
        audioOffsetMs: props.overlay.offsetMs,
      })

      setRenderedBlob(out)

      hiddenVideo.remove()
      hiddenAudio?.remove()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to render mix')
    } finally {
      setRendering(false)
    }
  }

  const onPost = () => {
    const finalBlob = renderedBlob ?? props.recorded.blob
    props.onPost(finalBlob, note.trim())
  }

  return (
    <div className="col video-capture__review">
      <div className="meta">Preview. Add music if you want, then post.</div>

      <div className="row video-capture__reviewRow">
        <span className="pill">{targetLabel}</span>
        <span className="small">{props.recorded.mimeType}</span>
      </div>

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
          <audio ref={audioRef} src={props.overlay.url ?? ''} controls />
        )}
        {hasOverlay && (
          <div className="hint">
            Tap play on the video, then the audio. Rendering bakes the mix.
          </div>
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
          Discard
        </button>

        <button className="btn" onClick={doRender} type="button" disabled={!canRender}>
          {rendering ? 'Rendering...' : 'Render mix'}
        </button>

        <button className="btn primary" onClick={onPost} type="button" disabled={rendering}>
          Post
        </button>
      </div>

      {renderedBlob && (
        <div className="hint">
          Mixed output ready. You can post it, or <a className="link" href={renderedUrl ?? ''} download="mixed.webm">download mixed.webm</a>.
        </div>
      )}

      <div className="video-capture__panel">
        <div className="row video-capture__panelHeader">
          <div className="small">Green screen</div>
          <button
            className={`btn ${props.greenScreenEnabled ? 'primary' : ''}`}
            type="button"
            disabled={rendering}
            onClick={() => props.onToggleGreenScreen(!props.greenScreenEnabled)}
          >
            {props.greenScreenEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="video-capture__swatches">
          {props.backgroundOptions.map(option => (
            <button
              key={option.id}
              className={`video-capture__swatch ${props.backgroundColor === option.color ? 'is-active' : ''}`}
              type="button"
              aria-label={option.label}
              title={option.label}
              style={{ background: option.color }}
              disabled={!props.greenScreenEnabled || rendering}
              onClick={() => props.onSelectBackground(option.color)}
            />
          ))}
        </div>
        <div className="hint">Solid backgrounds for now. Applies to next recording.</div>
      </div>
    </div>
  )
}
