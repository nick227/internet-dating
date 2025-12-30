export type CaptureOptions = {
  video?: boolean
  audio?: boolean
  facingMode?: 'user' | 'environment'
}

export async function captureFromCamera(options: CaptureOptions = {}): Promise<File | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: options.video !== false,
      audio: options.audio === true,
    })

    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx?.drawImage(video, 0, 0)
        stream.getTracks().forEach(track => track.stop())

        canvas.toBlob(
          blob => {
            if (blob) {
              const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' })
              resolve(file)
            } else {
              reject(new Error('Failed to capture image'))
            }
          },
          'image/png',
          0.9
        )
      })

      video.addEventListener('error', () => {
        stream.getTracks().forEach(track => track.stop())
        reject(new Error('Failed to capture from camera'))
      })
    })
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied')
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No camera found')
      }
    }
    throw err
  }
}

export async function captureAudio(duration: number = 60000): Promise<File | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    return new Promise((resolve, reject) => {
      const mediaRecorder = new MediaRecorder(stream)
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
        resolve(file)
      }

      mediaRecorder.onerror = () => {
        stream.getTracks().forEach(track => track.stop())
        reject(new Error('Failed to record audio'))
      }

      mediaRecorder.start()
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop()
        }
      }, duration)
    })
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission denied')
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No microphone found')
      }
    }
    throw err
  }
}
