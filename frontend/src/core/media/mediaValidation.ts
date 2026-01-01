/**
 * Client-side media validation and metadata extraction
 * Validates files before upload to prevent unnecessary network requests
 */

const MAX_DURATION_SEC = 180
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160
// Conservative size limits (matching backend)
const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200MB
const MAX_AUDIO_SIZE = 80 * 1024 * 1024 // 80MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
])

export type MediaMetadata = {
  type: 'image' | 'video' | 'audio'
  width?: number
  height?: number
  duration?: number
  mimeType: string
  size: number
}

export type ValidationResult = {
  valid: boolean
  error?: string
  metadata?: MediaMetadata
}

/**
 * Extract metadata from a file using native browser APIs
 */
export async function extractMediaMetadata(file: File): Promise<MediaMetadata | null> {
  const mimeType = file.type
  const isImage = mimeType.startsWith('image/')
  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')

  if (isImage) {
    return extractImageMetadata(file)
  } else if (isVideo) {
    return extractVideoMetadata(file)
  } else if (isAudio) {
    return extractAudioMetadata(file)
  }

  return null
}

async function extractImageMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        type: 'image',
        width: img.naturalWidth,
        height: img.naturalHeight,
        mimeType: file.type,
        size: file.size,
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

async function extractVideoMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)

    video.preload = 'metadata'
    video.muted = true

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        type: 'video',
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        mimeType: file.type,
        size: file.size,
      })
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video'))
    }

    video.src = url
  })
}

async function extractAudioMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)

    audio.preload = 'metadata'
    audio.muted = true

    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        type: 'audio',
        duration: audio.duration,
        mimeType: file.type,
        size: file.size,
      })
    }

    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load audio'))
    }

    audio.src = url
  })
}

/**
 * Validate file before upload
 * Returns validation result with metadata if valid
 */
export async function validateMediaFile(file: File): Promise<ValidationResult> {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `File type not supported. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
    }
  }

  // Check file size based on type
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  const isAudio = file.type.startsWith('audio/')
  
  let maxSize: number
  if (isImage) {
    maxSize = MAX_IMAGE_SIZE
  } else if (isVideo) {
    maxSize = MAX_VIDEO_SIZE
  } else if (isAudio) {
    maxSize = MAX_AUDIO_SIZE
  } else {
    maxSize = MAX_VIDEO_SIZE // Default to largest
  }
  
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024))
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSizeMB}MB`,
    }
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
    }
  }

  // Extract metadata
  let metadata: MediaMetadata | null = null
  try {
    metadata = await extractMediaMetadata(file)
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Failed to extract file metadata',
    }
  }

  if (!metadata) {
    return {
      valid: false,
      error: 'Unable to determine file type',
    }
  }

  // Validate duration (video/audio)
  if (metadata.duration !== undefined) {
    if (metadata.duration > MAX_DURATION_SEC) {
      return {
        valid: false,
        error: `Duration exceeds ${MAX_DURATION_SEC} seconds. Maximum duration is ${MAX_DURATION_SEC}s`,
      }
    }
  }

  // Validate resolution (image/video)
  if (metadata.width !== undefined && metadata.height !== undefined) {
    if (metadata.width > MAX_WIDTH || metadata.height > MAX_HEIGHT) {
      return {
        valid: false,
        error: `Resolution exceeds ${MAX_WIDTH}×${MAX_HEIGHT}. Maximum resolution is ${MAX_WIDTH}×${MAX_HEIGHT}`,
      }
    }
  }

  return {
    valid: true,
    metadata,
  }
}
