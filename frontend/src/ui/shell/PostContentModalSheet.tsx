import type { ComponentProps } from 'react'
import { PostContentModalBody } from './PostContentModalBody'
import { VideoCaptureRoot } from '../video-capture/VideoCaptureRoot'

type Props = ComponentProps<typeof PostContentModalBody> & {
  showCameraCapture: boolean
  onCloseCameraCapture: () => void
  onVideoPost: (file: File, note: string) => void
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
        <VideoCaptureRoot onPost={onVideoPost} onRequestClose={onRequestClose} onExitCapture={onCloseCameraCapture} />
      </div>
    )
  }

  return <PostContentModalBody {...bodyProps} />
}
