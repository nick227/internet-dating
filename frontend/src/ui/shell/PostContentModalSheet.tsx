import type { ComponentProps } from 'react'
import { PostContentModalBody } from './PostContentModalBody'
import { MediaCaptureRoot } from '../media-capture/MediaCaptureRoot'

type Props = ComponentProps<typeof PostContentModalBody> & {
  showCameraCapture: boolean
  onCloseCameraCapture: () => void
  onVideoPost: (files: File[], note: string) => void
  onRequestClose: () => void
}

export function PostContentModalSheet({
  showCameraCapture,
  onCloseCameraCapture,
  onVideoPost,
  onRequestClose,
  ...bodyProps
}: Props) {
  if (showCameraCapture) {
    return (
      <div className="modal__body" data-testid="post-content-camera-sheet">
        <MediaCaptureRoot onPost={onVideoPost} onRequestClose={onRequestClose} onExitCapture={onCloseCameraCapture} />
      </div>
    )
  }

  return <PostContentModalBody {...bodyProps} />
}
