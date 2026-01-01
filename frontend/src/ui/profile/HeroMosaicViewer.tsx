import { useEffect, useState, useCallback, useRef, useMemo, type PointerEvent } from 'react'
import { IconButton } from '../ui/IconButton'
import { useHeroMosaicViewer } from './HeroMosaicViewerContext'
import { useModalState } from '../shell/useModalState'

type HeroMosaicViewerProps = {
  open: boolean
  onClose: () => void
}

const SWIPE_THRESHOLD = 48
const SWIPE_VELOCITY_THRESHOLD = 0.3
const SWIPE_TIME_THRESHOLD = 300

export function HeroMosaicViewer({ open, onClose }: HeroMosaicViewerProps) {
  const { viewerState, closeViewer } = useHeroMosaicViewer()
  const { closeModal } = useModalState()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const swipeRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startTime: 0,
    cancelled: false,
  })
  
  const viewerItems = viewerState?.items
  const items = useMemo(() => viewerItems ?? [], [viewerItems])
  const isOwner = viewerState?.isOwner ?? false
  const onRemove = viewerState?.onRemove
  const onChange = viewerState?.onChange
  
  const currentItem = items[currentIndex]
  const canNavigate = items.length > 1

  const handleClose = useCallback(() => {
    closeViewer()
    closeModal()
    onClose()
  }, [closeViewer, closeModal, onClose])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      const originalStyle = window.getComputedStyle(document.body).overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [open])

  useEffect(() => {
    if (open && viewerState?.items && viewerState.items.length > 0) {
      setCurrentIndex(viewerState.initialIndex)
      setIsLoading(true)
      setHasError(false)
      setImageLoaded(false)
      // Focus management for accessibility
      requestAnimationFrame(() => {
        panelRef.current?.focus()
      })
    }
  }, [open, viewerState])

  // Reset image loaded state when index changes
  useEffect(() => {
    setImageLoaded(false)
  }, [currentIndex])

  // Preload adjacent images for better UX (pattern from MediaViewer)
  useEffect(() => {
    if (!open || items.length === 0) return

    const preloadImage = (src: string) => {
      const img = new Image()
      img.src = src
    }

    // Preload next and previous images
    const nextIndex = (currentIndex + 1) % items.length
    const prevIndex = (currentIndex - 1 + items.length) % items.length

    if (items[nextIndex]?.type !== 'VIDEO' && items[nextIndex]?.src) {
      // Use preview/thumbnail if available, otherwise full src
      const src = items[nextIndex].preview ?? items[nextIndex].src
      preloadImage(src)
    }
    if (items[prevIndex]?.type !== 'VIDEO' && items[prevIndex]?.src) {
      const src = items[prevIndex].preview ?? items[prevIndex].src
      preloadImage(src)
    }
  }, [open, currentIndex, items])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePrevious()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose, handleNext, handlePrevious])

  const handlePrevious = useCallback(() => {
    if (!canNavigate) return
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
    setIsLoading(true)
    setHasError(false)
    setImageLoaded(false)
  }, [canNavigate, items.length])

  const handleNext = useCallback(() => {
    if (!canNavigate) return
    setCurrentIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
    setIsLoading(true)
    setHasError(false)
    setImageLoaded(false)
  }, [canNavigate, items.length])

  const handleMediaLoad = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
    setImageLoaded(true)
  }, [])

  // Progressive loading: upgrade to full resolution after thumbnail loads
  useEffect(() => {
    if (!imageLoaded || !currentItem || currentItem.type === 'VIDEO') return
    if (!currentItem.preview || currentItem.src === currentItem.preview) return // No thumbnail or already full resolution
    
    const img = imgRef.current
    if (!img) return
    
    // Preload full resolution image
    const fullImg = new Image()
    fullImg.onload = () => {
      // Swap to full resolution only if still showing the same item
      const currentImg = imgRef.current
      if (currentImg && currentItem && currentImg.src === (currentItem.preview ?? '')) {
        currentImg.src = currentItem.src
      }
    }
    fullImg.onerror = () => {
      // If full resolution fails, keep showing thumbnail (silent fail)
    }
    fullImg.src = currentItem.src
  }, [imageLoaded, currentItem])

  const handleMediaError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])

  // Swipe gesture handlers (pattern from RiverCardMedia)
  const releasePointer = useCallback((el: HTMLElement, pointerId: number | null) => {
    if (pointerId != null && el.hasPointerCapture(pointerId)) {
      try {
        el.releasePointerCapture(pointerId)
      } catch {
        // Ignore errors if pointer was already released
      }
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canNavigate) return
      const target = event.target as Element | null
      // Don't start swipe on navigation buttons
      if (target?.closest('.heroViewer__nav, .heroViewer__close, .heroViewer__actions')) return

      swipeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: Date.now(),
        cancelled: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [canNavigate]
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canNavigate || swipeRef.current.pointerId !== event.pointerId) return

      const deltaX = event.clientX - swipeRef.current.startX
      const deltaY = event.clientY - swipeRef.current.startY

      // Cancel swipe if vertical movement exceeds horizontal
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        swipeRef.current.cancelled = true
      }
    },
    [canNavigate]
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canNavigate) return
      const target = event.target as Element | null
      if (target?.closest('.heroViewer__nav, .heroViewer__close, .heroViewer__actions')) return

      const swipe = swipeRef.current
      if (swipe.pointerId !== event.pointerId) return

      const targetEl = event.currentTarget
      const pointerId = swipe.pointerId

      // Check if swipe was cancelled
      if (swipe.cancelled) {
        swipeRef.current.pointerId = null
        swipeRef.current.cancelled = false
        releasePointer(targetEl, pointerId)
        return
      }

      const deltaX = event.clientX - swipe.startX
      const deltaY = event.clientY - swipe.startY
      const deltaTime = Date.now() - swipe.startTime
      const velocity = deltaTime > 0 ? Math.abs(deltaX) / deltaTime : 0

      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY)
      const meetsDistanceThreshold = Math.abs(deltaX) > SWIPE_THRESHOLD
      const meetsVelocityThreshold = velocity > SWIPE_VELOCITY_THRESHOLD
      const meetsTimeThreshold = deltaTime > 0 && deltaTime < SWIPE_TIME_THRESHOLD

      if (
        isHorizontalSwipe &&
        (meetsDistanceThreshold || (meetsVelocityThreshold && meetsTimeThreshold))
      ) {
        if (deltaX < 0) {
          handleNext()
        } else {
          handlePrevious()
        }
      }

      swipeRef.current.pointerId = null
      swipeRef.current.cancelled = false
      releasePointer(targetEl, pointerId)
    },
    [canNavigate, handleNext, handlePrevious, releasePointer]
  )

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

  const handleRemove = useCallback(() => {
    if (!currentItem || !onRemove) return
    if (confirm('Remove this item from the mosaic?')) {
      onRemove(currentItem.id)
      if (items.length > 1) {
        const nextIndex = currentIndex < items.length - 1 ? currentIndex : currentIndex - 1
        setCurrentIndex(Math.max(0, nextIndex))
        setIsLoading(true)
        setHasError(false)
      } else {
        handleClose()
      }
    }
  }, [currentItem, onRemove, items.length, currentIndex, handleClose])

  const handleChange = useCallback(() => {
    if (!currentItem || !onChange) return
    // Close viewer first
    handleClose()
    // Use requestAnimationFrame for proper timing instead of setTimeout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onChange(currentItem.id)
      })
    })
  }, [currentItem, onChange, handleClose])

  // Don't render if modal is closed
  if (!open) {
    return null
  }

  // If viewerState isn't ready yet, show loading state
  if (!viewerState || items.length === 0 || !currentItem) {
    return (
      <div className="modal heroViewer" role="dialog" aria-modal="true" aria-label="View media">
        <div className="modal__backdrop" onClick={handleClose} />
        <div className="heroViewer__panel" ref={panelRef} tabIndex={-1}>
          <div className="heroViewer__loader">
            <div className="heroViewer__spinner" />
          </div>
        </div>
      </div>
    )
  }

  const isVideo = currentItem.type === 'VIDEO'
  const hasContent = currentItem.src || currentItem.text || currentItem.audioUrl
  // Use thumbnail/preview for initial load, fallback to full src
  const imageSrc = currentItem.preview ?? currentItem.src

  return (
    <div className="modal heroViewer" role="dialog" aria-modal="true" aria-label="Media viewer">
      <div className="modal__backdrop" onClick={handleClose} />
      <div
        ref={panelRef}
        className="heroViewer__panel"
        tabIndex={-1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <button className="heroViewer__close" onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {canNavigate && (
          <>
            <button
              className="heroViewer__nav heroViewer__nav--prev"
              onClick={handlePrevious}
              aria-label="Previous"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              className="heroViewer__nav heroViewer__nav--next"
              onClick={handleNext}
              aria-label="Next"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}

        <div className="heroViewer__media">
          {isLoading && (
            <div className="heroViewer__loader" aria-hidden="true">
              <div className="heroViewer__spinner" />
            </div>
          )}
          {hasError ? (
            <div className="heroViewer__error" role="alert">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <p>Failed to load media</p>
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              className="heroViewer__video"
              src={currentItem.src}
              poster={currentItem.preview ?? undefined}
              controls
              playsInline
              onLoadedData={handleMediaLoad}
              onError={handleMediaError}
              aria-label={currentItem.alt || 'Video'}
            />
          ) : currentItem.src ? (
            <img
              ref={imgRef}
              className="heroViewer__image"
              src={imageSrc}
              alt={currentItem.alt}
              onLoad={handleMediaLoad}
              onError={handleMediaError}
            />
          ) : null}

          {currentItem.text && (
            <div className="heroViewer__text">
              <p>{currentItem.text}</p>
            </div>
          )}

          {currentItem.audioUrl && (
            <div className="heroViewer__audio">
              <audio src={currentItem.audioUrl} controls onLoadedData={handleMediaLoad} onError={handleMediaError} />
            </div>
          )}

          {!hasContent && (
            <div className="heroViewer__empty">
              <p>No content yet</p>
            </div>
          )}
        </div>

        {canNavigate && (
          <div className="heroViewer__counter">
            {currentIndex + 1} / {items.length}
          </div>
        )}

        {isOwner && hasContent && (
          <div className="heroViewer__actions">
            {onRemove && (
              <IconButton label="Remove" onClick={handleRemove}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </IconButton>
            )}
            {onChange && (
              <IconButton label="Change" onClick={handleChange}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </IconButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
