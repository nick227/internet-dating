import { useEffect, useRef, useState } from 'react'
import { videoPlaybackManager } from './videoPlaybackManager'

type VideoPlaybackOptions = {
  autoplay?: boolean
  muted?: boolean
  loop?: boolean
  pauseOnLeave?: boolean
}

export function useVideoPlayback(
  videoRef: React.RefObject<HTMLVideoElement>,
  isIntersecting: boolean,
  options: VideoPlaybackOptions = {}
) {
  const { autoplay = true, loop = false, pauseOnLeave = true } = options

  const [isPlaying, setIsPlaying] = useState(false)
  const hasPlayedRef = useRef(false)
  const playPromiseRef = useRef<Promise<void> | null>(null)

  // Handle viewport intersection
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isIntersecting) {
      // Card entered viewport - play if autoplay enabled
      if (autoplay && !hasPlayedRef.current) {
        if (videoPlaybackManager.requestPlay(video)) {
          const playPromise = video.play()
          playPromiseRef.current = playPromise

          playPromise
            .then(() => {
              setIsPlaying(true)
              hasPlayedRef.current = true
            })
            .catch(e => {
              // Autoplay failed (user interaction required, policy restriction, etc.)
              if (import.meta.env?.DEV) {
                console.debug('[video] autoplay failed', e)
              }
              setIsPlaying(false)
            })
            .finally(() => {
              playPromiseRef.current = null
            })
        }
      }
    } else if (pauseOnLeave && isPlaying) {
      // Card left viewport - pause
      video.pause()
      setIsPlaying(false)
    }
  }, [isIntersecting, autoplay, pauseOnLeave, videoRef, isPlaying])

  // Handle video events
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      setIsPlaying(true)
    }

    const handlePause = () => {
      setIsPlaying(false)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      if (loop) {
        video.play().catch(() => {
          // Ignore loop play errors
        })
      }
    }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      videoPlaybackManager.release(video)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [videoRef, loop])

  const togglePlayPause = async () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      if (videoPlaybackManager.requestPlay(video)) {
        try {
          await video.play()
        } catch (e) {
          if (import.meta.env?.DEV) {
            console.debug('[video] play failed', e)
          }
        }
      }
    }
  }

  return {
    isPlaying,
    togglePlayPause,
  }
}
