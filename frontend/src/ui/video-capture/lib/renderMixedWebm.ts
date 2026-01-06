export type RenderMixOptions = {
  videoEl: HTMLVideoElement
  audioBlob?: Blob | null
  audioVolume: number
  audioOffsetMs: number
  signal?: AbortSignal
}

function pickMimeType(hasAudio: boolean) {
  const candidates = hasAudio
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
    : [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ]
  type WindowWithMediaRecorder = Window & {
    MediaRecorder?: {
      isTypeSupported?: (mimeType: string) => boolean
    }
  }
  for (const c of candidates) {
    if ((window as WindowWithMediaRecorder).MediaRecorder?.isTypeSupported?.(c)) return c
  }
  return ''
}

export async function renderMixedWebm(opts: RenderMixOptions): Promise<Blob> {
  const { videoEl, audioBlob, audioVolume, audioOffsetMs, signal } = opts

  if (!videoEl) {
    throw new Error('Missing video element')
  }
  type WindowWithMediaRecorder = Window & {
    MediaRecorder?: typeof MediaRecorder
  }
  if (typeof (window as WindowWithMediaRecorder).MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder unsupported in this browser')
  }
  if (!HTMLCanvasElement.prototype.captureStream) {
    throw new Error('captureStream() not supported on <canvas> in this browser')
  }

  if (signal?.aborted) {
    throw new Error('Mix cancelled')
  }

  // Ensure metadata loaded
  if (Number.isNaN(videoEl.duration) || videoEl.duration === 0) {
    await new Promise<void>((res) => {
      const on = () => { videoEl.removeEventListener('loadedmetadata', on); res() }
      videoEl.addEventListener('loadedmetadata', on)
    })
  }

  const width = videoEl.videoWidth || 720
  const height = videoEl.videoHeight || 1280
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas rendering unavailable')

  const vStream = canvas.captureStream(30)
  const tracks: MediaStreamTrack[] = []
  const vTrack = vStream.getVideoTracks()[0]
  if (!vTrack) throw new Error('No video track from canvas captureStream()')
  tracks.push(vTrack)

  let audioCtx: AudioContext | null = null
  let dest: MediaStreamAudioDestinationNode | null = null
  let source: AudioBufferSourceNode | null = null
  let audioDuration = 0
  let audioStartTime = 0
  let bufferOffset = 0
  let audioStarted = false

  if (audioBlob) {
    type WindowWithAudioContext = Window & {
      webkitAudioContext?: typeof AudioContext
    }
    audioCtx = new (window.AudioContext || (window as WindowWithAudioContext).webkitAudioContext)()
    dest = audioCtx.createMediaStreamDestination()

    const audioBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer())
    const gain = audioCtx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, audioVolume))

    source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(gain)
    gain.connect(dest)

    const offsetSec = audioOffsetMs / 1000
    bufferOffset = Math.max(0, -offsetSec)
    const startDelay = Math.max(0, offsetSec)
    const maxDuration = Math.max(0, videoEl.duration - startDelay)
    const remainingAudio = Math.max(0, audioBuffer.duration - bufferOffset)
    audioDuration = Math.max(0, Math.min(remainingAudio, maxDuration))
    audioStartTime = startDelay

    const aTrack = dest.stream.getAudioTracks()[0]
    if (aTrack) tracks.push(aTrack)
  }

  const outStream = new MediaStream(tracks)

  const mimeType = pickMimeType(!!audioBlob)
  const recorder = new MediaRecorder(outStream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 1_200_000,
    audioBitsPerSecond: 64_000,
  })
  const chunks: BlobPart[] = []

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  // Sync playback: start recorder, then play video, then start audio at offset
  videoEl.currentTime = 0
  videoEl.muted = true
  videoEl.loop = false
  videoEl.playsInline = true

  const draw = () => {
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
    return requestAnimationFrame(draw)
  }

  let rafId = 0
  const abortPromise = new Promise<void>((_, rej) => {
    if (signal?.aborted) {
      rej(new Error('Mix cancelled'))
      return
    }
    signal?.addEventListener(
      'abort',
      () => {
        rej(new Error('Mix cancelled'))
      },
      { once: true }
    )
  })

  try {
    recorder.start(250)

    // Make sure audio context running (user gesture already likely from button click)
    if (audioCtx) await audioCtx.resume()

    if (signal?.aborted) {
      throw new Error('Mix cancelled')
    }

    await videoEl.play()
    rafId = draw()

    if (audioCtx && source && audioDuration > 0) {
      source.start(audioCtx.currentTime + audioStartTime, bufferOffset, audioDuration)
      audioStarted = true
    }

    // Wait for video to end
    const ended = new Promise<void>((resolve) => {
      const onEnd = () => {
        videoEl.removeEventListener('ended', onEnd)
        resolve()
      }
      videoEl.addEventListener('ended', onEnd)
    })
    await (signal ? Promise.race([ended, abortPromise]) : ended)

    recorder.stop()
    await stopped
  } finally {
    if (rafId) cancelAnimationFrame(rafId)
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Ignore; cleanup should continue.
      }
    }
    if (source && audioStarted) source.stop()
    videoEl.pause()
    vStream.getTracks().forEach((t) => t.stop())
    if (dest) dest.stream.getTracks().forEach((t) => t.stop())
    if (audioCtx) await audioCtx.close()
  }

  return new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
}
