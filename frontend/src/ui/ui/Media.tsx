import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaViewer } from './MediaViewerContext'
import { useModalState } from '../shell/useModalState'
import { useIntersectionThreshold } from '../../core/feed/useIntersectionThreshold'
import { useMediaPreferences } from '../../core/feed/useMediaPreferences'
import { useVideoPlayback } from '../../core/feed/useVideoPlayback'

type MediaProps = {
  src: string
  alt?: string
  type?: 'image' | 'video' | 'audio'
  poster?: string
  width?: number | string
  height?: number | string
  className?: string
  onClick?: () => void
  loading?: 'lazy' | 'eager'
  preload?: 'none' | 'metadata' | 'auto'
  muted?: boolean
  playsInline?: boolean
  controls?: boolean
  overlay?: 'none' | 'light'
  enableViewer?: boolean
  autoplayOnScroll?: boolean
  gallery?: Array<{ src: string; alt?: string; type?: 'image' | 'video' | 'audio'; poster?: string }>
  galleryIndex?: number
}

export function Media({
  src,
  alt = '',
  type = 'image',
  poster,
  width,
  height,
  className = '',
  onClick,
  loading = 'lazy',
  preload = 'metadata',
  muted = true,
  playsInline = true,
  controls = true,
  overlay = 'none',
  enableViewer = true,
  autoplayOnScroll = false,
  gallery,
  galleryIndex = 0,
}: MediaProps) {
  const hasValidSrc = src.trim() !== ''
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { openViewer } = useMediaViewer()
  const { openMediaViewer } = useModalState()
  const { autoplayEnabled } = useMediaPreferences()
  const isThresholdMet = useIntersectionThreshold(containerRef, 0.5)
  const shouldAutoplay = type === 'video' && autoplayOnScroll && autoplayEnabled && isThresholdMet
  const shouldPauseOnLeave = type === 'video' && autoplayOnScroll
  const showOverlay = overlay === 'light'

  useVideoPlayback(videoRef, shouldAutoplay, {
    autoplay: autoplayEnabled,
    pauseOnLeave: shouldPauseOnLeave,
  })

  // Reset loading state when src changes
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
  }, [src, type])

  const handleLoad = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
  }, [])

  const handleError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])

  // Memoize gallery items to avoid recreating on every render
  const galleryItems = useMemo(() => {
    if (gallery && gallery.length > 0) {
      return gallery
    }
    return [{ src, alt, type, poster: poster ?? undefined }]
  }, [gallery, src, alt, type, poster])

  const handleClick = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      if (onClick) {
        e.preventDefault()
        e.stopPropagation()
        onClick()
        return
      }

      if (!enableViewer) return

      if (galleryItems.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        const index = gallery ? galleryIndex : 0
        let items = galleryItems
        if (type === 'video') {
          const currentSrc = videoRef.current?.currentSrc || videoRef.current?.src
          if (currentSrc) {
            items = galleryItems.map((item, idx) =>
              idx === index ? { ...item, src: currentSrc, type: item.type ?? 'video' } : item
            )
          }
        }
        openViewer(items, index)
        openMediaViewer()
      }
    },
    [onClick, enableViewer, galleryItems, gallery, galleryIndex, openViewer, openMediaViewer, type]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleClick(e)
      }
    },
    [handleClick]
  )

  // Check if image is already loaded (cached)
  useEffect(() => {
    if (type === 'image' && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoading(false)
    }
  }, [type, src])

  // Check if audio metadata is already loaded
  useEffect(() => {
    if (type === 'audio' && audioRef.current && audioRef.current.readyState >= 2) {
      setIsLoading(false)
    }
  }, [type, src])

  // Memoize style object
  const style = useMemo<React.CSSProperties>(() => {
    const s: React.CSSProperties = {}
    if (width) s.width = typeof width === 'number' ? `${width}px` : width
    if (height) s.height = typeof height === 'number' ? `${height}px` : height
    return s
  }, [width, height])

  // Memoize class name
  const containerClass = useMemo(() => {
    const classes = ['media']
    if (isLoading) classes.push('media--loading')
    if (hasError) classes.push('media--error')
    if (onClick || (enableViewer && galleryItems.length > 0)) classes.push('media--clickable')
    if (showOverlay) classes.push('media--overlay-light')
    if (className) classes.push(className)
    return classes.join(' ')
  }, [isLoading, hasError, onClick, enableViewer, galleryItems.length, className, showOverlay])

  if (!hasValidSrc) {
    return (
      <div className={`media media--error ${className}`.trim()}>
        <div className="media__error" role="img" aria-label="Invalid media source">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
    )
  }

  const hasClickHandler = Boolean(onClick || (enableViewer && galleryItems.length > 0))
  const showVideoControls = controls !== false && !hasClickHandler && !showOverlay
  const showAudioControls = controls !== false && !showOverlay

  if (type === 'audio') {
    return (
      <div
        ref={containerRef}
        className={containerClass}
        style={style}
        onClick={hasClickHandler ? handleClick : undefined}
        onKeyDown={hasClickHandler ? handleKeyDown : undefined}
        role={hasClickHandler ? 'button' : undefined}
        tabIndex={hasClickHandler ? 0 : undefined}
        aria-label={hasClickHandler ? alt || 'View audio' : undefined}
      >
        {showOverlay && <div className="media__overlay media__overlay--light" aria-hidden="true" />}
        {isLoading && (
          <div className="media__loader" aria-hidden="true">
            <div className="media__spinner" />
          </div>
        )}
        {hasError ? (
          <div className="media__error" role="img" aria-label={alt || 'Audio failed to load'}>
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        ) : (
          <audio
            ref={audioRef}
            src={src}
            preload={preload}
            controls={showAudioControls}
            onLoadedData={handleLoad}
            onError={handleError}
            className="media__element media__element--audio"
            aria-label={alt}
          />
        )}
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div
        ref={containerRef}
        className={containerClass}
        style={style}
        onClick={hasClickHandler ? handleClick : undefined}
        onKeyDown={hasClickHandler ? handleKeyDown : undefined}
        role={hasClickHandler ? 'button' : undefined}
        tabIndex={hasClickHandler ? 0 : undefined}
        aria-label={hasClickHandler ? alt || 'View media' : undefined}
      >
        {showOverlay && <div className="media__overlay media__overlay--light" aria-hidden="true" />}
        {isLoading && (
          <div className="media__loader" aria-hidden="true">
            <div className="media__spinner" />
          </div>
        )}
        {hasError ? (
          <div className="media__error" role="img" aria-label={alt || 'Media failed to load'}>
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            muted={muted}
            controls={showVideoControls}
            playsInline={playsInline}
            preload={preload}
            onLoadedData={handleLoad}
            onError={handleError}
            className={`media__element${showVideoControls ? ' media__element--interactive' : ''}`}
            aria-label={alt}
          />
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={containerClass}
      style={style}
      onClick={hasClickHandler ? handleClick : undefined}
      onKeyDown={hasClickHandler ? handleKeyDown : undefined}
      role={hasClickHandler ? 'button' : undefined}
      tabIndex={hasClickHandler ? 0 : undefined}
      aria-label={hasClickHandler ? alt || 'View image' : undefined}
    >
      {showOverlay && <div className="media__overlay media__overlay--light" aria-hidden="true" />}
      {isLoading && (
        <div className="media__loader" aria-hidden="true">
          <div className="media__spinner" />
        </div>
      )}
      {hasError ? (
        <div className="media__error" role="img" aria-label={alt || 'Media failed to load'}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading={loading}
          onLoad={handleLoad}
          onError={handleError}
          className="media__element"
        />
      )}
    </div>
  )
}
