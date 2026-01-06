import { useState } from 'react'
import type { MediaType } from './components/MediaTypeSelectPanel'
import { MediaTypeSelectPanel } from './components/MediaTypeSelectPanel'
import { VideoCaptureRoot } from '../video-capture/VideoCaptureRoot'
import { PhotoCaptureRoot } from '../photo-capture/PhotoCaptureRoot'

type Props = {
  onPost?: (files: File[], note: string) => void
  onRequestClose?: () => void
  onExitCapture?: () => void
}

export function MediaCaptureRoot({ onPost, onRequestClose, onExitCapture }: Props) {
  const [mediaType, setMediaType] = useState<MediaType | null>(null)

  const handlePhotoPost = (files: File[], note: string) => {
    onPost?.(files, note)
    setMediaType(null)
  }

  const handleVideoPost = (file: File, note: string) => {
    onPost?.([file], note)
    setMediaType(null)
  }

  const handleRequestClose = () => {
    if (mediaType) {
      setMediaType(null)
    } else {
      onRequestClose?.()
    }
  }

  if (mediaType === null) {
    return (
      <div className="video-capture">
        <div className="card">
          <div className="topbar">
            <div className="topbar__actions">
              <button className="btn" type="button" onClick={onRequestClose}>
                Close
              </button>
            </div>
            <div className="title">
              <span>Capture</span>
            </div>
            <div className="small">Choose photo or video.</div>
          </div>
          <div className="content">
            <div className="stage" />
            <div className="controls">
              <MediaTypeSelectPanel
                onSelectPhoto={() => setMediaType('photo')}
                onSelectVideo={() => setMediaType('video')}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (mediaType === 'video') {
    return (
      <VideoCaptureRoot
        onPost={handleVideoPost}
        onRequestClose={handleRequestClose}
        onExitCapture={onExitCapture}
      />
    )
  }

  return (
    <PhotoCaptureRoot
      onPost={handlePhotoPost}
      onRequestClose={handleRequestClose}
      onExitCapture={onExitCapture}
    />
  )
}
