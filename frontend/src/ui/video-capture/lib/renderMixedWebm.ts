export type RenderMixOptions = {
  videoEl: HTMLVideoElement
  audioEl: HTMLAudioElement | null
  audioVolume: number
  audioOffsetMs: number
}

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const c of candidates) {
    if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c
  }
  return ''
}

export async function renderMixedWebm(opts: RenderMixOptions): Promise<Blob> {
  const { videoEl, audioEl, audioVolume, audioOffsetMs } = opts

  if (!videoEl.captureStream) {
    throw new Error('captureStream() not supported on <video> in this browser')
  }
  if (typeof (window as any).MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder unsupported in this browser')
  }

  // Ensure metadata loaded
  if (Number.isNaN(videoEl.duration) || videoEl.duration === 0) {
    await new Promise<void>((res) => {
      const on = () => { videoEl.removeEventListener('loadedmetadata', on); res() }
      videoEl.addEventListener('loadedmetadata', on)
    })
  }

  // Build combined stream: video track from captureStream + audio track from WebAudio destination (if any)
  const vStream: MediaStream = videoEl.captureStream()
  const tracks: MediaStreamTrack[] = []
  const vTrack = vStream.getVideoTracks()[0]
  if (!vTrack) throw new Error('No video track from captureStream()')
  tracks.push(vTrack)

  let audioCtx: AudioContext | null = null
  let dest: MediaStreamAudioDestinationNode | null = null

  if (audioEl) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    dest = audioCtx.createMediaStreamDestination()

    // Route audioEl -> gain -> dest
    const source = audioCtx.createMediaElementSource(audioEl)
    const gain = audioCtx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, audioVolume))
    source.connect(gain)
    gain.connect(dest)

    // Also connect to speakers for preview? Keep muted by default; we'll avoid double audio.
    // gain.connect(audioCtx.destination) // optional

    const aTrack = dest.stream.getAudioTracks()[0]
    if (aTrack) tracks.push(aTrack)
  }

  const outStream = new MediaStream(tracks)

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(outStream, mimeType ? { mimeType } : undefined)
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
  videoEl.playsInline = true

  if (audioEl) {
    audioEl.pause()
    audioEl.currentTime = 0
    audioEl.volume = 1 // gain node controls volume
  }

  // Make sure audio context running (user gesture already likely from button click)
  if (audioCtx) await audioCtx.resume()

  recorder.start(250)

  await videoEl.play()

  if (audioEl) {
    const startAudioAt = Math.max(0, audioOffsetMs) / 1000
    // Delay audio start until desired offset relative to video
    if (startAudioAt > 0) {
      await new Promise((r) => setTimeout(r, startAudioAt * 1000))
    }
    await audioEl.play()
  }

  // Wait for video to end
  await new Promise<void>((resolve) => {
    const onEnd = () => {
      videoEl.removeEventListener('ended', onEnd)
      resolve()
    }
    videoEl.addEventListener('ended', onEnd)
  })

  recorder.stop()
  await stopped

  // Cleanup
  if (audioEl) audioEl.pause()
  videoEl.pause()
  vStream.getTracks().forEach((t) => t.stop())
  if (dest) dest.stream.getTracks().forEach((t) => t.stop())
  if (audioCtx) await audioCtx.close()

  return new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
}
