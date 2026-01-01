/**
 * Metadata extraction job for video/audio media
 * Uses ffprobe to extract duration, resolution, and validate constraints
 * Should be enqueued after video/audio upload completes
 */

import { prisma } from '../lib/prisma/client.js'
import { MediaError } from '../services/media/mediaService.js'
import { runJob } from '../lib/jobs/runJob.js'
import { LocalStorageProvider } from '../services/media/localStorageProvider.js'
import { MEDIA_UPLOAD_ROOT } from '../services/media/config.js'

const storage = new LocalStorageProvider(MEDIA_UPLOAD_ROOT)

const MAX_DURATION_SEC = 180
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160

export type MediaMetadataJobOptions = {
  mediaId: bigint
}

type FFProbeResult = {
  format?: {
    duration?: string
  }
  streams?: Array<{
    width?: number
    height?: number
    duration?: string
    codec_type?: string
  }>
}

/**
 * Extract metadata from video/audio file using ffprobe
 * Validates duration and resolution constraints
 */
async function extractMetadataWithFFProbe(filePath: string): Promise<{
  durationSec: number | null
  width: number | null
  height: number | null
}> {
  // TODO: Implement ffprobe integration
  // For now, return null values (validation happens client-side)
  // When ffprobe is available:
  // 1. Run: ffprobe -v quiet -print_format json -show_format -show_streams <file>
  // 2. Parse JSON result
  // 3. Extract duration from format.duration or streams[0].duration
  // 4. Extract width/height from video stream
  // 5. Validate constraints
  
  return {
    durationSec: null,
    width: null,
    height: null,
  }
}

/**
 * Process media metadata extraction
 * Updates Media record with duration/resolution and validates constraints
 */
export async function runMediaMetadataJob(options: MediaMetadataJobOptions) {
  const { mediaId } = options

  return runJob(
    {
      jobName: 'media-metadata',
      trigger: 'EVENT',
      scope: 'processing',
      algorithmVersion: 'v1',
      metadata: { mediaId: String(mediaId) },
    },
    async () => {
      const media = await prisma.media.findFirst({
        where: { id: mediaId, deletedAt: null },
        select: {
          id: true,
          type: true,
          status: true,
          storageKey: true,
          mimeType: true,
          durationSec: true,
          width: true,
          height: true,
        },
      })

      if (!media) {
        throw new MediaError('Media not found', 404)
      }

      // Only process VIDEO and AUDIO types
      if (media.type !== 'VIDEO' && media.type !== 'AUDIO') {
        return { skipped: true, reason: 'Not video/audio type' }
      }

      // Only process if status is UPLOADED or READY (not already processed)
      if (media.status !== 'UPLOADED' && media.status !== 'READY') {
        return { skipped: true, reason: `Status is ${media.status}, expected UPLOADED or READY` }
      }

      if (!media.storageKey) {
        throw new MediaError('Media has no storage key', 400)
      }

      try {
        // Get file path from storage
        const filePath = `${MEDIA_UPLOAD_ROOT}/${media.storageKey}`

        // Extract metadata using ffprobe
        // TODO: Implement when ffprobe is available
        const metadata = await extractMetadataWithFFProbe(filePath)

        // Validate constraints
        const errors: string[] = []

        if (metadata.durationSec !== null) {
          if (metadata.durationSec > MAX_DURATION_SEC) {
            errors.push(`Duration ${metadata.durationSec}s exceeds maximum ${MAX_DURATION_SEC}s`)
          }
        }

        if (media.type === 'VIDEO' && metadata.width !== null && metadata.height !== null) {
          if (metadata.width > MAX_WIDTH || metadata.height > MAX_HEIGHT) {
            errors.push(
              `Resolution ${metadata.width}×${metadata.height} exceeds maximum ${MAX_WIDTH}×${MAX_HEIGHT}`
            )
          }
        }

        if (errors.length > 0) {
          // Mark as REJECTED and update with metadata for debugging
          await prisma.media.update({
            where: { id: mediaId },
            data: {
              status: 'REJECTED',
              durationSec: metadata.durationSec ? Math.round(metadata.durationSec) : null,
              width: metadata.width ?? null,
              height: metadata.height ?? null,
            },
          })

          return {
            rejected: true,
            errors,
            metadata: {
              durationSec: metadata.durationSec,
              width: metadata.width,
              height: metadata.height,
            },
          }
        }

        // Update media with metadata and mark as READY
        await prisma.media.update({
          where: { id: mediaId },
          data: {
            status: 'READY',
            durationSec: metadata.durationSec ? Math.round(metadata.durationSec) : null,
            width: metadata.width ?? null,
            height: metadata.height ?? null,
          },
        })

        return {
          success: true,
          metadata: {
            durationSec: metadata.durationSec,
            width: metadata.width,
            height: metadata.height,
          },
        }
      } catch (err) {
        // Mark as FAILED_PROCESSING
        await prisma.media.update({
          where: { id: mediaId },
          data: { status: 'FAILED_PROCESSING' },
        }).catch(() => null)

        throw err
      }
    }
  )
}

/**
 * Process batch of media for metadata extraction
 * Useful for backfilling existing media
 */
export async function runMediaMetadataBatchJob(options: {
  batchSize?: number
  maxAgeHours?: number
  pauseMs?: number
} = {}) {
  const { batchSize = 50, maxAgeHours = 24, pauseMs = 100 } = options

  return runJob(
    {
      jobName: 'media-metadata-batch',
      trigger: 'CRON',
      scope: 'processing',
      algorithmVersion: 'v1',
      metadata: { batchSize, maxAgeHours },
    },
    async () => {
      const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)

      // Find video/audio media that needs metadata extraction
      const mediaToProcess = await prisma.media.findMany({
        where: {
          deletedAt: null,
          type: { in: ['VIDEO', 'AUDIO'] },
          status: { in: ['UPLOADED', 'READY'] },
          createdAt: { gte: cutoffTime },
          OR: [
            { durationSec: null },
            { width: null },
            { height: null },
          ],
        },
        select: { id: true },
        take: batchSize,
      })

      let processed = 0
      let rejected = 0
      let failed = 0

      for (const media of mediaToProcess) {
        try {
          const result = await runMediaMetadataJob({ mediaId: media.id })
          if (result.rejected) {
            rejected++
          } else if (result.success) {
            processed++
          }
        } catch (err) {
          failed++
          console.error(`Failed to process media ${media.id}:`, err)
        }

        // Pause between items to avoid overwhelming system
        if (pauseMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, pauseMs))
        }
      }

      return {
        total: mediaToProcess.length,
        processed,
        rejected,
        failed,
      }
    }
  )
}
