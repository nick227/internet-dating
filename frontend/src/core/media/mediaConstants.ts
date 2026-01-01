/**
 * Shared constants for media handling across the application
 */

// Supported file types for file input accept attribute
export const ACCEPTED_MEDIA_TYPES =
  'image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/webm,video/ogg,audio/mp3,audio/mpeg,audio/wav,audio/ogg'

// Legacy: Images only (for backward compatibility where needed)
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/jpg,image/png,image/webp'

// MIME types as Set for validation
export const ALLOWED_MIME_TYPES = new Set([
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

// Maximum file size (conservative limits matching backend)
export const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB (for videos)
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200MB
export const MAX_AUDIO_SIZE = 80 * 1024 * 1024 // 80MB

// Maximum duration for video/audio (180 seconds)
export const MAX_DURATION_SEC = 180

// Maximum resolution (3840×2160)
export const MAX_WIDTH = 3840
export const MAX_HEIGHT = 2160
