import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useMediaViewer } from './MediaViewerContext'

type MediaViewerProps = {
  open: boolean
  onClose: () => void
}

export function MediaViewer({ open, onClose }: MediaViewerProps) {
  const { viewerState, closeViewer } = useMediaViewer()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const viewerItems = viewerState?.items
  const items = useMemo(() => viewerItems ?? [], [viewerItems])
  const currentItem = items[currentIndex]

  const handleClose = useCallback(() => {
    closeViewer()
    onClose()
  }, [closeViewer, onClose])

  useEffect(() => {
    if (open && viewerState) {
      setCurrentIndex(viewerState.initialIndex)
      setIsLoading(true)
      setHasError(false)
      // Focus management for accessibility
      requestAnimationFrame(() => {
        panelRef.current?.focus()
      })
    }
  }, [open, viewerState])

  // Preload adjacent images for better UX
  useEffect(() => {
    if (!open || items.length === 0) return

    const preloadImage = (src: string) => {
      const img = new Image()
      img.src = src
    }

    // Preload next and previous images
    const nextIndex = (currentIndex + 1) % items.length
    const prevIndex = (currentIndex - 1 + items.length) % items.length

    if (items[nextIndex]?.type !== 'video' && items[nextIndex]?.src) {
      preloadImage(items[nextIndex].src)
    }
    if (items[prevIndex]?.type !== 'video' && items[prevIndex]?.src) {
      preloadImage(items[prevIndex].src)
    }
  }, [open, currentIndex, items])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
        setIsLoading(true)
        setHasError(false)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
        setIsLoading(true)
        setHasError(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, items.length, handleClose])

  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
    setIsLoading(true)
    setHasError(false)
  }, [items.length])

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
    setIsLoading(true)
    setHasError(false)
  }, [items.length])

  const handleMediaLoad = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
  }, [])

  const handleMediaError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])

  // Cleanup video on unmount or index change
  useEffect(() => {
    const video = videoRef.current
    return () => {
      if (video) {
        video.pause()
        video.src = ''
        video.load()
      }
    }
  }, [currentIndex])

  if (!open || !viewerState || !currentItem || items.length === 0) {
    return null
  }

  const isVideo = currentItem.type === 'video'

  return (
    <div className="modal mediaViewer" role="dialog" aria-modal="true" aria-label="Media viewer">
      <div className="mediaViewer__backdrop" onClick={handleClose} />
      <div ref={panelRef} className="mediaViewer__panel" tabIndex={-1}>
        <button className="mediaViewer__close" onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {items.length > 1 && (
          <>
            <button
              className="mediaViewer__nav mediaViewer__nav--prev"
              onClick={handlePrevious}
              aria-label="Previous"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              className="mediaViewer__nav mediaViewer__nav--next"
              onClick={handleNext}
              aria-label="Next"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}

        <div className="mediaViewer__content">
          {isLoading && (
            <div className="mediaViewer__loader" aria-hidden="true">
              <div className="mediaViewer__spinner" />
            </div>
          )}
          {hasError ? (
            <div className="mediaViewer__error" role="alert">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <p>Failed to load media</p>
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              className="mediaViewer__media"
              src={currentItem.src}
              poster={currentItem.poster}
              controls
              autoPlay
              playsInline
              onLoadedData={handleMediaLoad}
              onError={handleMediaError}
              aria-label={currentItem.alt || 'Video'}
            />
          ) : (
            <img
              className="mediaViewer__media"
              src={currentItem.src}
              alt={currentItem.alt || 'Media'}
              onLoad={handleMediaLoad}
              onError={handleMediaError}
            />
          )}
        </div>

        {items.length > 1 && (
          <div className="mediaViewer__counter">
            {currentIndex + 1} / {items.length}
          </div>
        )}
      </div>
    </div>
  )
}
