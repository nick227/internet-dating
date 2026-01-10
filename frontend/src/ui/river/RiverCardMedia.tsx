import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import type { FeedCardPresentation, FeedMedia } from '../../api/types'
import { useVideoPlayback } from '../../core/feed/useVideoPlayback'
import { videoPlaybackManager } from '../../core/feed/videoPlaybackManager'
import { useMediaPreferences } from '../../core/feed/useMediaPreferences'
import { useIntersectionThreshold } from '../../core/feed/useIntersectionThreshold'
import { parseEmbedUrl } from '../../core/media/embedMedia'
import { EmbedMedia } from '../ui/EmbedMedia'
import { optimizeMosaicLayout } from '../../core/feed/mosaicMediaSelector'

const SWIPE_THRESHOLD = 48
const SWIPE_VELOCITY_THRESHOLD = 0.3
const SWIPE_TIME_THRESHOLD = 300
const CONTROLS_FADE_DELAY = 3000
const CONTROLS_HOVER_DELAY = 2000
const SHORT_VIDEO_DURATION = 10
const MEDIA_NAV_BUTTON_CLASS = 'riverCard__mediaBtn'

export function RiverCardMedia({
  hero,
  media,
  presentation,
  isCardIntersecting,
}: {
  hero: string | null
  media?: FeedMedia[]
  presentation?: FeedCardPresentation
  isCardIntersecting?: boolean
}) {
  const mode = presentation?.mode ?? 'single'
  const items = useMemo(
    () => selectMedia(media, hero, presentation?.heroIndex),
    [media, hero, presentation?.heroIndex]
  )
  const hasMedia = items.length > 0
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startTime: 0,
    cancelled: false,
  })
  const releasePointer = useCallback((el: HTMLElement, pointerId: number | null) => {
    if (pointerId != null && el.hasPointerCapture(pointerId)) {
      try {
        el.releasePointerCapture(pointerId)
      } catch {
        // Ignore errors if pointer was already released
      }
    }
  }, [])
  const canNavigate = mode === 'single' && items.length > 1
  const active = items[activeIndex] ?? null
  // Smart mosaic: Optimize layout for best media presentation
  const mosaicItems = mode === 'mosaic' 
    ? optimizeMosaicLayout(items.slice(0, 3)) 
    : []

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(0)
    }
  }, [items.length, activeIndex])

  useEffect(() => {
    if (mode === 'mosaic') {
      setActiveIndex(0)
    }
  }, [mode])

  // Cleanup pointer capture on unmount
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    return () => {
      const currentPointerId = swipeRef.current.pointerId
      if (currentPointerId != null) {
        releasePointer(container, currentPointerId)
        swipeRef.current.pointerId = null
      }
    }
  }, [releasePointer])

  const handlePrev = useCallback(() => {
    if (!canNavigate) return
    setActiveIndex(prev => (prev - 1 + items.length) % items.length)
  }, [canNavigate, items.length])

  const handleNext = useCallback(() => {
    if (!canNavigate) return
    setActiveIndex(prev => (prev + 1) % items.length)
  }, [canNavigate, items.length])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canNavigate) return
      const target = event.target as Element | null
      if (target?.closest(`.${MEDIA_NAV_BUTTON_CLASS}`)) return

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
      if (target?.closest(`.${MEDIA_NAV_BUTTON_CLASS}`)) return

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
          handlePrev()
        }
      }

      swipeRef.current.pointerId = null
      swipeRef.current.cancelled = false
      releasePointer(targetEl, pointerId)
    },
    [canNavigate, handleNext, handlePrev, releasePointer]
  )

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const swipe = swipeRef.current
      const targetEl = event.currentTarget

      if (swipe.pointerId === event.pointerId) {
        releasePointer(targetEl, swipe.pointerId)
        swipeRef.current.pointerId = null
        swipeRef.current.cancelled = false
      }
    },
    [releasePointer]
  )

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null
    if (target?.closest(`.${MEDIA_NAV_BUTTON_CLASS}`)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // Swipe navigation already handled by pointer events, no need to prevent clicks
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!canNavigate) return
      const target = event.target as Element | null
      if (target?.closest(`.${MEDIA_NAV_BUTTON_CLASS}`)) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        handlePrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        handleNext()
      }
    },
    [canNavigate, handlePrev, handleNext]
  )

  return (
    <div
      ref={containerRef}
      className="riverCard__media"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={canNavigate ? 0 : -1}
      role={canNavigate ? 'region' : undefined}
      aria-label={
        canNavigate
          ? `Media gallery, ${items.length} items, ${activeIndex + 1} of ${items.length}`
          : undefined
      }
    >
      {canNavigate && <AriaLiveAnnouncement index={activeIndex} total={items.length} />}
      {hasMedia ? (
        mode === 'mosaic' ? (
          <MosaicMedia items={mosaicItems} isCardIntersecting={isCardIntersecting} />
        ) : (
          <div className="riverCard__mediaFrame">
            {active ? <MediaItem item={active} isCardIntersecting={isCardIntersecting} /> : null}
          </div>
        )
      ) : (
        <div className="riverCard__mediaEmpty" role="img" aria-label="Profile media not available">
          <div className="riverCard__mediaEmptyLabel">Photos coming soon</div>
        </div>
      )}
      {canNavigate && (
        <div className="riverCard__mediaNav">
          <button
            className={`${MEDIA_NAV_BUTTON_CLASS} ${MEDIA_NAV_BUTTON_CLASS}--prev`}
            type="button"
            aria-label="Previous media"
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              handlePrev()
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M15 6l-6 6 6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={`${MEDIA_NAV_BUTTON_CLASS} ${MEDIA_NAV_BUTTON_CLASS}--next`}
            type="button"
            aria-label="Next media"
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              handleNext()
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M9 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function AriaLiveAnnouncement({ index, total }: { index: number; total: number }) {
  const prevIndexRef = useRef(index)
  const [announcementKey, setAnnouncementKey] = useState(0)

  useEffect(() => {
    if (prevIndexRef.current !== index) {
      prevIndexRef.current = index
      setAnnouncementKey(prev => prev + 1)
    }
  }, [index])

  // Use key to force re-render only when index changes, preventing unnecessary announcements
  return (
    <div key={announcementKey} className="srOnly" aria-live="polite" aria-atomic="true">
      Item {index + 1} of {total}
    </div>
  )
}

function MediaItem({
  item,
  isCardIntersecting,
}: {
  item: FeedMedia
  isCardIntersecting?: boolean
}) {
  const preview = item.thumbUrl ?? item.url
  const isVideo = item.type === 'VIDEO' || isVideoUrl(item.url)
  const embedInfo = item.type === 'EMBED' ? parseEmbedUrl(item.url) : null
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showControls, setShowControls] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [posterError, setPosterError] = useState(false)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const retryCountRef = useRef(0)

  const { autoplayEnabled } = useMediaPreferences()
  // Note: containerRef is only attached for videos, so threshold check only works for videos
  // This is intentional - videos need 50%+ visibility for autoplay, images don't
  const isThresholdMet = useIntersectionThreshold(containerRef, 0.5)
  const shouldLoop = isVideo && item.durationSec != null && item.durationSec <= SHORT_VIDEO_DURATION
  const shouldAutoplay = isVideo && Boolean(isCardIntersecting) && isThresholdMet && autoplayEnabled

  const { isPlaying, togglePlayPause } = useVideoPlayback(videoRef, shouldAutoplay, {
    autoplay: autoplayEnabled,
    muted: true,
    loop: shouldLoop,
    pauseOnLeave: true,
  })

  useEffect(() => {
    isMountedRef.current = true
    const video = videoRef.current

    return () => {
      isMountedRef.current = false
      if (video) {
        videoPlaybackManager.release(video)
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
        controlsTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = null
    }

    if (!isMountedRef.current) return

    if (isPlaying) {
      setShowControls(true)
      controlsTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setShowControls(false)
        }
        controlsTimeoutRef.current = null
      }, CONTROLS_FADE_DELAY)
    } else {
      setShowControls(true)
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
        controlsTimeoutRef.current = null
      }
    }
  }, [isPlaying])

  const handleMouseEnter = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = null
    }
    setShowControls(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (isPlaying && isMountedRef.current) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setShowControls(false)
        }
        controlsTimeoutRef.current = null
      }, CONTROLS_HOVER_DELAY)
    }
  }, [isPlaying])

  const handleMediaError = useCallback(() => {
    setHasError(true)
  }, [])

  const handlePosterError = useCallback(() => {
    setPosterError(true)
  }, [])

  const handleRetry = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (retryCountRef.current >= 3) return
      retryCountRef.current += 1
      setHasError(false)
      setPosterError(false)

      const video = videoRef.current
      if (video && isVideo) {
        videoPlaybackManager.release(video)
        video.load()
      }
    },
    [isVideo]
  )

  if (embedInfo) {
    return <EmbedMedia url={item.url} embed={embedInfo} className="riverCard__mediaEmbed" />
  }

  if (isVideo) {
    if (hasError) {
      return (
        <div
          className="riverCard__mediaItem riverCard__mediaItem--error"
          role="img"
          aria-label="Video failed to load"
        >
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {retryCountRef.current < 3 && (
            <button
              type="button"
              className="riverCard__mediaRetryBtn"
              onClick={handleRetry}
              aria-label="Retry loading video"
            >
              Retry
            </button>
          )}
        </div>
      )
    }

    return (
      <div
        ref={containerRef}
        className="riverCard__videoContainer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={() => setShowControls(true)}
      >
        <video
          ref={videoRef}
          className="riverCard__mediaItem"
          src={item.url}
          poster={posterError ? undefined : (preview ?? undefined)}
          muted
          playsInline
          loop={shouldLoop}
          preload={shouldAutoplay ? 'metadata' : 'none'}
          onError={handleMediaError}
        />
        {!posterError && preview && (
          <img
            src={preview}
            alt=""
            className="riverCard__videoPoster"
            onError={handlePosterError}
            aria-hidden="true"
          />
        )}
        <div
          className={`riverCard__videoControls ${showControls ? 'riverCard__videoControls--visible' : ''}`}
        >
          <button
            type="button"
            className="riverCard__videoPlayBtn"
            onClick={e => {
              e.stopPropagation()
              togglePlayPause()
            }}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? (
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    )
  }

  if (hasError) {
    return (
      <div
        className="riverCard__mediaItem riverCard__mediaItem--error"
        role="img"
        aria-label="Image failed to load"
      >
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
          <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {retryCountRef.current < 3 && (
          <button
            type="button"
            className="riverCard__mediaRetryBtn"
            onClick={handleRetry}
            aria-label="Retry loading image"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <img
      className="riverCard__mediaItem"
      src={preview ?? item.url}
      alt=""
      loading="lazy"
      onError={handleMediaError}
    />
  )
}

function MosaicMedia({
  items,
  isCardIntersecting,
}: {
  items: FeedMedia[]
  isCardIntersecting?: boolean
}) {
  if (items.length === 0) {
    return (
      <div className="riverCard__mediaMosaic riverCard__mediaMosaic--empty">
        <div className="riverCard__mediaTile riverCard__mediaTile--empty" aria-hidden="true" />
      </div>
    )
  }

  if (items.length === 1) {
    return (
      <div className="riverCard__mediaMosaic">
        <div className="riverCard__mediaTile riverCard__mediaTile--single">
          <MediaItem item={items[0]} isCardIntersecting={isCardIntersecting} />
        </div>
      </div>
    )
  }

  if (items.length === 2) {
    return (
      <div className="riverCard__mediaMosaic">
        <div className="riverCard__mediaTile riverCard__mediaTile--a">
          <MediaItem item={items[0]} isCardIntersecting={isCardIntersecting} />
        </div>
        <div className="riverCard__mediaTile riverCard__mediaTile--b">
          <MediaItem item={items[1]} isCardIntersecting={isCardIntersecting} />
        </div>
      </div>
    )
  }

  return (
    <div className="riverCard__mediaMosaic">
      <MosaicTile
        item={items[0]}
        className="riverCard__mediaTile riverCard__mediaTile--a"
        isCardIntersecting={isCardIntersecting}
      />
      <MosaicTile
        item={items[1]}
        className="riverCard__mediaTile riverCard__mediaTile--b"
        isCardIntersecting={isCardIntersecting}
      />
      <MosaicTile
        item={items[2]}
        className="riverCard__mediaTile riverCard__mediaTile--c"
        isCardIntersecting={isCardIntersecting}
      />
    </div>
  )
}

function MosaicTile({
  item,
  className,
  isCardIntersecting,
}: {
  item?: FeedMedia
  className: string
  isCardIntersecting?: boolean
}) {
  if (!item) {
    return <div className={`${className} riverCard__mediaTile--empty`} aria-hidden="true" />
  }
  return (
    <div className={className}>
      <MediaItem item={item} isCardIntersecting={isCardIntersecting} />
    </div>
  )
}

function selectMedia(
  media: FeedMedia[] | undefined,
  hero: string | null,
  heroIndex?: number
): FeedMedia[] {
  const items = buildMediaItems(media, hero)
  if (heroIndex != null && heroIndex >= 0 && heroIndex < items.length) {
    return moveToFront(items, heroIndex)
  }
  return preferVideo(items)
}

function buildMediaItems(media: FeedMedia[] | undefined, hero: string | null): FeedMedia[] {
  if (media?.length) {
    const filtered = media.filter(item => Boolean(item?.url))
    if (filtered.length) return filtered
  }
  if (hero) {
    return [
      {
        id: `hero-${hero}`,
        type: 'IMAGE',
        url: hero,
        thumbUrl: null,
        width: null,
        height: null,
        durationSec: null,
      },
    ]
  }
  return []
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)
}

function preferVideo(items: FeedMedia[]) {
  const index = items.findIndex(
    item => item.type === 'VIDEO' || item.type === 'EMBED' || isVideoUrl(item.url)
  )
  if (index <= 0) return items
  return moveToFront(items, index)
}

function moveToFront(items: FeedMedia[], index: number) {
  const next = [...items]
  const [item] = next.splice(index, 1)
  if (item) next.unshift(item)
  return next
}
