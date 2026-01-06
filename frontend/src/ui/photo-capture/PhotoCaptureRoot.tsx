import React from 'react'
import { usePhotoCaptureController } from './hooks/usePhotoCaptureController'
import { PhotoCameraStage } from './components/PhotoCameraStage'
import { PhotoReviewStage } from './components/PhotoReviewStage'

type Props = {
  onPost?: (files: File[], note: string) => void | Promise<void>
  onRequestClose?: () => void
  onExitCapture?: () => void
}

export function PhotoCaptureRoot({ onPost, onRequestClose, onExitCapture }: Props) {
  const controller = usePhotoCaptureController({ onPost, onRequestClose })
  const { photos, photoUrls, view, isPosting, isCapturing, postError, capture, addPhoto, removePhoto, goToReview, goToCamera, handlePost, handleDiscard, handleBack } = controller

  return (
    <div className="video-capture">
      <div className="card">
        <div className="topbar">
          <div className="topbar__actions">
            <button className="btn" type="button" onClick={handleBack}>
              {view === 'camera' ? 'Close' : 'Back'}
            </button>
            {view === 'review' && onExitCapture && (
              <button className="btn" type="button" onClick={onExitCapture}>
                Back to post
              </button>
            )}
          </div>
          <div className="title">
            <span>Photo Capture</span>
            {photos.length > 0 && <span className="badge">{photos.length}</span>}
          </div>
          <div className="small">Take photos to add to your post.</div>
        </div>

        <div className="content">
          <div className="stage">
            {view === 'camera' && capture.status.kind === 'requesting-permission' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 'var(--s-2)' }}>
                <div>Requesting camera permission...</div>
              </div>
            )}
            {view === 'camera' && capture.stream && (
              <PhotoCameraStage
                stream={capture.stream}
                photos={photos}
                photoUrls={photoUrls}
                isCapturing={isCapturing}
                onCapture={addPhoto}
                onReview={goToReview}
                toggleFacing={capture.toggleFacing}
                mirrored={capture.facingMode === 'user'}
              />
            )}

            {view === 'review' && photos.length > 0 && (
              <PhotoReviewStage
                photos={photos}
                photoUrls={photoUrls}
                onBackToCamera={goToCamera}
                onRemove={removePhoto}
                onPost={handlePost}
                onDiscard={handleDiscard}
                isPosting={isPosting}
                postError={postError}
              />
            )}
          </div>

          <div className="controls">
            {view === 'camera' && (
              <div className="col">
                {capture.status.kind === 'requesting-permission' && (
                  <>
                    <div style={{ fontWeight: 700 }}>Initializing Camera</div>
                    <div className="meta">Please allow camera access when prompted</div>
                  </>
                )}
                {capture.status.kind === 'ready' && capture.stream && (
                  <>
                    <div style={{ fontWeight: 700 }}>Camera Ready</div>
                    <div className="meta">
                      {photos.length > 0
                        ? `${photos.length} photo${photos.length > 1 ? 's' : ''} captured`
                        : 'Tap anywhere on the preview to capture'}
                    </div>
                  </>
                )}
                {capture.status.kind === 'error' && (
                  <div className="meta" style={{ color: 'var(--danger)' }}>
                    {capture.status.message}
                  </div>
                )}
                {capture.status.kind === 'ready' && capture.stream && photos.length > 0 && (
                  <button className="btn primary" onClick={goToReview} type="button">
                    Review ({photos.length})
                  </button>
                )}
                <button className="btn danger" onClick={capture.closeCamera} type="button" disabled={isCapturing}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
