import type { AudioOverlayState } from '../hooks/useAudioOverlay'
import { renderMixedWebm } from './renderMixedWebm'

type RenderAudioMixParams = {
  videoBlob: Blob
  overlay: AudioOverlayState
  signal?: AbortSignal
}

export async function renderAudioMix(params: RenderAudioMixParams) {
  const { videoBlob, overlay, signal } = params
  if (!overlay.blob) {
    throw new Error('No audio overlay selected')
  }
  if (videoBlob.size === 0) {
    throw new Error('Recording is empty')
  }
  if (signal?.aborted) {
    throw new Error('Mix cancelled')
  }

  let hiddenVideo: HTMLVideoElement | null = null
  const url = URL.createObjectURL(videoBlob)
  try {
    hiddenVideo = document.createElement('video')
    hiddenVideo.src = url
    hiddenVideo.crossOrigin = 'anonymous'
    hiddenVideo.playsInline = true
    hiddenVideo.muted = true
    hiddenVideo.style.position = 'fixed'
    hiddenVideo.style.left = '-99999px'
    hiddenVideo.style.top = '-99999px'
    document.body.appendChild(hiddenVideo)

    await new Promise<void>((res, rej) => {
      if (hiddenVideo.readyState >= 1) return res()
      const onLoaded = () => {
        hiddenVideo?.removeEventListener('error', onError)
        res()
      }
      const onError = () => {
        hiddenVideo?.removeEventListener('loadedmetadata', onLoaded)
        rej(new Error('Failed to load video metadata'))
      }
      hiddenVideo.addEventListener('loadedmetadata', onLoaded, { once: true })
      hiddenVideo.addEventListener('error', onError, { once: true })
    })

    return await renderMixedWebm({
      videoEl: hiddenVideo,
      audioBlob: overlay.blob,
      audioVolume: overlay.volume,
      audioOffsetMs: overlay.offsetMs,
      signal,
    })
  } finally {
    hiddenVideo?.remove()
    URL.revokeObjectURL(url)
  }
}
