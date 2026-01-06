import React, { useState, useEffect, useRef } from 'react'
import { CameraPreview } from '../../video-capture/components/CameraPreview'
import { useObjectUrl } from '../../video-capture/hooks/useObjectUrl'

export function PhotoCameraStage(props: {
  stream: MediaStream
  photos: Blob[]
  photoUrls: string[]
  isCapturing: boolean
  onCapture: (blob: Blob) => void
  onReview: () => void
  toggleFacing: () => void
  mirrored?: boolean
}) {
  const { stream, photos, photoUrls, isCapturing, onCapture, onReview, toggleFacing, mirrored } = props
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [showThumbnail, setShowThumbnail] = useState(false)
  const [isCapturingLocal, setIsCapturingLocal] = useState(false)
  const capturedUrl = useObjectUrl(capturedBlob)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const handleCapture = async () => {
    if (isCapturing || isCapturingLocal) return

    const video = videoRef.current
    if (!video) return

    setIsCapturingLocal(true)

    try {
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          const onLoadedMetadata = () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata)
            resolve()
          }
          const onError = () => {
            video.removeEventListener('error', onError)
            reject(new Error('Video failed to load'))
          }
          video.addEventListener('loadedmetadata', onLoadedMetadata)
          video.addEventListener('error', onError)
        })
      }

      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('Video dimensions not available')
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context unavailable')

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
      })

      if (blob) {
        setCapturedBlob(blob)
        onCapture(blob)
      }
    } catch (error) {
      console.error('Failed to capture photo:', error)
    } finally {
      setIsCapturingLocal(false)
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      video.play().catch(() => {})
    }
    return () => {
      if (video) {
        video.pause()
        video.srcObject = null
      }
    }
  }, [stream])

  useEffect(() => {
    if (capturedBlob) {
      setShowThumbnail(false)
      const timer = setTimeout(() => {
        setCapturedBlob(null)
        setTimeout(() => setShowThumbnail(true), 50)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [capturedBlob])

  const handlePreviewClick = () => {
    if (!isCapturing && !isCapturingLocal) {
      handleCapture()
    }
  }

  return (
    <>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <CameraPreview stream={stream} mirrored={mirrored} />
          <video
            ref={videoRef}
            style={{ display: 'none' }}
            playsInline
            muted
            autoPlay
          />
        </div>
        {capturedBlob && capturedUrl && !showThumbnail && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10,
            }}
          >
            <img
              src={capturedUrl}
              alt="Captured"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            cursor: isCapturing || isCapturingLocal ? 'not-allowed' : 'pointer',
            zIndex: 5,
          }}
          onClick={handlePreviewClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handlePreviewClick()
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Tap to capture photo"
        />
        {photos.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '80px',
              left: 'var(--s-3)',
              right: 'var(--s-3)',
              display: 'flex',
              gap: 'var(--s-2)',
              overflowX: 'auto',
              padding: 'var(--s-2)',
              zIndex: 20,
            }}
          >
            {photos.map((photo, index) => {
              const url = photoUrls[index]
              const isNewest = index === photos.length - 1
              return (
                <div
                  key={`${photo.size}-${index}`}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    flexShrink: 0,
                    transition: isNewest ? 'all 0.3s ease' : 'none',
                    transform: isNewest && !showThumbnail ? 'scale(0)' : 'scale(1)',
                    opacity: isNewest && !showThumbnail ? 0 : 1,
                  }}
                >
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="overlayBottom" style={{ pointerEvents: 'auto' }}>
        <button
          className="btn"
          onClick={toggleFacing}
          type="button"
          disabled={isCapturing || isCapturingLocal}
        >
          Flip
        </button>
        {photos.length > 0 && (
          <button
            className="btn primary"
            onClick={onReview}
            type="button"
          >
            Next ({photos.length})
          </button>
        )}
      </div>
    </>
  )
}
