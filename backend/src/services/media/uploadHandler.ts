/**
 * Unified upload handler supporting images, videos, and audio
 * Uses streaming uploads with state machine
 */

import { readFile } from 'fs/promises'
import { prisma } from '../../lib/prisma/client.js'
import { MediaError } from './mediaService.js'
import { randomUUID } from 'crypto'

function buildStorageKey(mimeType: string): string {
  const ext = mimeToExt(mimeType)
  const id = randomUUID()
  const hex = id.replace(/-/g, '')
  const prefix = `${hex.slice(0, 2)}/${hex.slice(2, 4)}`
  return `${prefix}/${id}${ext}`
}

function mimeToExt(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'video/mp4':
      return '.mp4'
    case 'video/webm':
      return '.webm'
    case 'video/ogg':
      return '.ogg'
    case 'audio/mp3':
    case 'audio/mpeg':
      return '.mp3'
    case 'audio/wav':
      return '.wav'
    case 'audio/ogg':
      return '.ogg'
    default:
      return ''
  }
}
import { buildMediaUrls } from './urlBuilder.js'
import { MEDIA_UPLOAD_ROOT } from './config.js'
import { finalizeUpload, cleanupTempFile } from './streamingUpload.js'
import imageSize from 'image-size'
import { createHash } from 'crypto'
import { assertRateLimit } from './mediaService.js'

// Conservative size limits for Railway free tier
const MAX_IMAGE_BYTES = 20 * 1024 * 1024 // 20MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200MB
const MAX_AUDIO_BYTES = 80 * 1024 * 1024 // 80MB
const MAX_DIMENSION = 3840 // Max width or height

type UploadFileInfo = {
  filePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadId: string
}

type UploadInput = {
  ownerUserId: bigint
  visibility?: 'PUBLIC' | 'PRIVATE'
  fileInfo: UploadFileInfo
}

type UploadResult = {
  mediaId: bigint
  status: string
  mimeType: string
  urls: { original: string; thumb: string | null }
}

/**
 * Determine media type from MIME type
 */
function getMediaType(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  if (mimeType.startsWith('audio/')) return 'AUDIO'
  throw new MediaError('Unsupported media type', 400)
}

/**
 * Validate image file
 */
async function validateImage(filePath: string, mimeType: string, sizeBytes: number): Promise<{ width: number; height: number }> {
  if (sizeBytes > MAX_IMAGE_BYTES) {
    throw new MediaError(`Image too large. Maximum size is ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB`, 400)
  }

  if (mimeType === 'image/svg+xml') {
    throw new MediaError('SVG not allowed', 400)
  }

  const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedMime.includes(mimeType)) {
    throw new MediaError('Unsupported image type', 400)
  }

  const buffer = await readFile(filePath)
  const meta = imageSize(buffer)
  
  if (!meta.width || !meta.height) {
    throw new MediaError('Invalid image', 400)
  }

  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    throw new MediaError(`Image dimensions too large. Maximum is ${MAX_DIMENSION}×${MAX_DIMENSION}`, 400)
  }

  return { width: meta.width, height: meta.height }
}

/**
 * Validate video file
 * Note: Duration and resolution validation requires ffprobe (job-based)
 * Client-side validation should catch these, but server validates size/MIME
 */
function validateVideo(mimeType: string, sizeBytes: number): void {
  if (sizeBytes > MAX_VIDEO_BYTES) {
    throw new MediaError(`Video too large. Maximum size is ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB`, 400)
  }

  const allowedMime = ['video/mp4', 'video/webm', 'video/ogg']
  if (!allowedMime.includes(mimeType)) {
    throw new MediaError('Unsupported video type', 400)
  }
}

/**
 * Validate audio file
 * Note: Duration validation requires metadata extraction (job-based)
 * Client-side validation should catch >180s, but server validates size/MIME
 */
function validateAudio(mimeType: string, sizeBytes: number): void {
  if (sizeBytes > MAX_AUDIO_BYTES) {
    throw new MediaError(`Audio too large. Maximum size is ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))}MB`, 400)
  }

  const allowedMime = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg']
  if (!allowedMime.includes(mimeType)) {
    throw new MediaError('Unsupported audio type', 400)
  }
  
  // Duration validation happens in processing job
  // Client-side validation should prevent >180s audio
}

/**
 * Calculate content hash
 */
async function calculateHash(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Upload media file (images, videos, audio)
 * Uses streaming upload with state machine
 */
export async function uploadMedia(input: UploadInput): Promise<UploadResult> {
  const { ownerUserId, visibility = 'PUBLIC', fileInfo } = input
  const { filePath, mimeType, sizeBytes } = fileInfo

  // Rate limiting
  assertRateLimit(ownerUserId)

  if (visibility !== 'PUBLIC' && visibility !== 'PRIVATE') {
    throw new MediaError('Invalid visibility', 400)
  }

  const mediaType = getMediaType(mimeType)

  // Validate based on type
  let width: number | null = null
  let height: number | null = null

  if (mediaType === 'IMAGE') {
    const dims = await validateImage(filePath, mimeType, sizeBytes)
    width = dims.width
    height = dims.height
  } else if (mediaType === 'VIDEO') {
    validateVideo(mimeType, sizeBytes)
    // Video dimensions/duration extracted client-side, stored in metadata
    // Backend validation is basic (size, MIME)
  } else if (mediaType === 'AUDIO') {
    validateAudio(mimeType, sizeBytes)
  }

  // Generate storage key and hash
  const storageKey = buildStorageKey(mimeType)
  const contentHash = await calculateHash(filePath)

  // Build variants (for images, original is the variant)
  const variants = mediaType === 'IMAGE' && width && height
    ? { original: { key: storageKey, width, height } }
    : { original: { key: storageKey } }

  const urls = buildMediaUrls({ storageKey, variants })

  // Create media record with PENDING_UPLOAD status
  const created = await prisma.media.create({
    data: {
      userId: ownerUserId,
      ownerUserId,
      type: mediaType,
      status: 'PENDING_UPLOAD',
      visibility,
      storageKey,
      variants,
      contentHash,
      mimeType,
      sizeBytes,
      width,
      height,
      url: urls.original,
      thumbUrl: urls.thumb,
    },
    select: { id: true },
  })

  try {
    // Move temp file to final storage location
    const finalPath = `${MEDIA_UPLOAD_ROOT}/${storageKey}`
    process.stdout.write(`[media] Moving temp file to final location: ${finalPath}\n`);
    await finalizeUpload(filePath, finalPath)
    process.stdout.write(`[media] File moved successfully\n`);

    // Update status to UPLOADED
    await prisma.media.update({
      where: { id: created.id },
      data: { status: 'UPLOADED' },
    })

    // Update status based on type
    // Images: validated during upload, mark as READY
    // Video/Audio: Mark as STORED, then PROBING (metadata extraction job)
    if (mediaType === 'IMAGE') {
      // Images are fully validated (dimensions checked), ready to serve
      await prisma.media.update({
        where: { id: created.id },
        data: { status: 'READY' },
      })
    } else {
      // Video/audio: Mark as UPLOADED, then enqueue metadata extraction job
      // Job will validate duration/resolution and update to READY or REJECTED
      await prisma.media.update({
        where: { id: created.id },
        data: { status: 'UPLOADED' },
      })
      
      // Enqueue metadata extraction job (non-blocking)
      // Job will extract duration/resolution and validate constraints
      try {
        const { runMediaMetadataJob } = await import('../../jobs/mediaMetadataJob.js')
        // Run job asynchronously (don't await - let it process in background)
        runMediaMetadataJob({ mediaId: created.id }).catch((err) => {
          console.error(`Failed to enqueue metadata job for media ${created.id}:`, err)
        })
      } catch (err) {
        // If job system unavailable, mark as READY (client-side validation should catch issues)
        console.warn(`Metadata job system unavailable for media ${created.id}:`, err)
        await prisma.media.update({
          where: { id: created.id },
          data: { status: 'READY' },
        })
      }
    }

    return {
      mediaId: created.id,
      status: 'READY',
      mimeType,
      urls,
    }
  } catch (err) {
    // Clean up on failure
    await prisma.media.update({
      where: { id: created.id },
      data: { status: 'FAILED_UPLOAD' },
    }).catch(() => null)

    await cleanupTempFile(filePath).catch(() => null)

    if (err instanceof MediaError) {
      throw err
    }
    throw new MediaError('Failed to store media', 500)
  }
}
