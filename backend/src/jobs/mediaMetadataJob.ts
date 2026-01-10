/**
 * Metadata extraction job for video/audio media
 * Uses ffprobe to extract duration, resolution, and validate constraints
 * Should be enqueued after video/audio upload completes
 */

import { prisma } from '../lib/prisma/client.js'
import { MediaError } from '../services/media/mediaService.js'
import { runJob } from '../lib/jobs/runJob.js'
import { createJobLogger } from '../lib/jobs/jobLogger.js'
import { LocalStorageProvider } from '../services/media/localStorageProvider.js'
import { MEDIA_UPLOAD_ROOT } from '../services/media/config.js'

const storage = new LocalStorageProvider(MEDIA_UPLOAD_ROOT)

const MAX_DURATION_SEC = 180
const MAX_WIDTH = 3840
const MAX_HEIGHT = 2160
const MEDIA_METADATA_BATCH_SIZE = 200

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

function buildUncheckedMediaWhere(options?: {
  cutoffTime?: Date
  includeReady?: boolean
}) {
  const { cutoffTime, includeReady } = options ?? {}
  return {
    deletedAt: null,
    type: { in: ['VIDEO', 'AUDIO'] },
    status: { in: includeReady ? ['UPLOADED', 'READY'] : ['UPLOADED'] },
    ...(cutoffTime ? { createdAt: { gte: cutoffTime } } : {}),
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
 * 
 * ✨ Enhanced with JobLogger for live feedback
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
    async (ctx) => {
      // Create logger for live feedback
      const logger = createJobLogger(ctx.jobRunId, ctx.jobName);
      
      try {
        // ===== STAGE 1: Initialize =====
        await logger.setStage('Initializing', 'Loading configuration');
        await logger.info('Job started', { batchSize, maxAgeHours, pauseMs });
        
        // ===== STAGE 2: Scanning for media =====
        await logger.setStage('Scanning for media');
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

        // Find video/audio media that needs metadata extraction
        const mediaToProcess = await prisma.media.findMany({
          where: buildUncheckedMediaWhere({ cutoffTime }),
          select: { id: true, type: true },
          take: batchSize,
        });
        
        await logger.setTotal(mediaToProcess.length, 'media files');
        await logger.milestone(`Found ${mediaToProcess.length} media files to process`, {
          batchSize,
          found: mediaToProcess.length
        });
        
        if (mediaToProcess.length === 0) {
          await logger.info('No media files need processing');
          await logger.logSummary();
          return { total: 0, processed: 0, rejected: 0, failed: 0 };
        }

        // ===== STAGE 3: Processing media files =====
        await logger.setStage('Processing media');
        
        let processed = 0;
        let rejected = 0;
        let failed = 0;

        for (let i = 0; i < mediaToProcess.length; i++) {
          const media = mediaToProcess[i];
          
          try {
            const result = await runMediaMetadataJob({ mediaId: media.id });
            
            if (result.rejected) {
              rejected++;
              logger.addOutcome('rejected', 1);
              await logger.warning(`Media ${media.id} rejected`, {
                mediaId: media.id.toString(),
                errors: result.errors
              });
            } else if (result.success) {
              processed++;
              logger.addOutcome('updates', 1);
            } else if (result.skipped) {
              logger.addOutcome('skipped', 1);
            }
          } catch (err) {
            failed++;
            logger.addOutcome('errors', 1);
            await logger.error(`Failed to process media ${media.id}`, {
              mediaId: media.id.toString(),
              error: err instanceof Error ? err.message : String(err)
            });
          }
          
          // Update progress
          await logger.incrementProgress();
          
          // Log batch milestones every 10 items
          if ((i + 1) % 10 === 0) {
            await logger.info(`Batch progress: ${i + 1}/${mediaToProcess.length}`, {
              processed,
              rejected,
              failed
            });
          }

          // Pause between items to avoid overwhelming system
          if (pauseMs > 0 && i < mediaToProcess.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, pauseMs));
          }
        }
        
        // ===== STAGE 4: Finalizing =====
        await logger.setStage('Finalizing');
        await logger.milestone('All media processed', {
          total: mediaToProcess.length,
          processed,
          rejected,
          failed
        });
        
        // Log final summary
        await logger.logSummary();

        return {
          total: mediaToProcess.length,
          processed,
          rejected,
          failed,
        };
        
      } catch (err) {
        await logger.error('Job failed with error', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        });
        throw err;
      }
    }
  )
}

/**
 * Process all unchecked media for metadata extraction
 * Useful for full backfills without age limits
 */
export async function runMediaMetadataAllJob() {
  return runJob(
    {
      jobName: 'media-metadata-all',
      trigger: 'MANUAL',
      scope: 'processing',
      algorithmVersion: 'v1',
      metadata: { batchSize: MEDIA_METADATA_BATCH_SIZE },
    },
    async (ctx) => {
      const logger = createJobLogger(ctx.jobRunId, ctx.jobName);

      await logger.setStage('Initializing', 'Scanning unchecked media');

      const total = await prisma.media.count({
        where: buildUncheckedMediaWhere(),
      });

      await logger.setTotal(total, 'media files');
      await logger.milestone(`Found ${total} media files to process`, { total });

      if (total === 0) {
        await logger.info('No media files need processing');
        await logger.logSummary();
        return { total: 0, processed: 0, rejected: 0, failed: 0 };
      }

      await logger.setStage('Processing media');

      let processed = 0;
      let rejected = 0;
      let failed = 0;
      let lastId: bigint | null = null;

      while (true) {
        const where = {
          ...buildUncheckedMediaWhere(),
          ...(lastId ? { id: { gt: lastId } } : {}),
        };

        const mediaToProcess = await prisma.media.findMany({
          where,
          select: { id: true },
          orderBy: { id: 'asc' },
          take: MEDIA_METADATA_BATCH_SIZE,
        });

        if (mediaToProcess.length === 0) {
          break;
        }

        for (const media of mediaToProcess) {
          lastId = media.id;
          try {
            const result = await runMediaMetadataJob({ mediaId: media.id });

            if (result.rejected) {
              rejected++;
              logger.addOutcome('rejected', 1);
              await logger.warning(`Media ${media.id} rejected`, {
                mediaId: media.id.toString(),
                errors: result.errors
              });
            } else if (result.success) {
              processed++;
              logger.addOutcome('updates', 1);
            } else if (result.skipped) {
              logger.addOutcome('skipped', 1);
            }
          } catch (err) {
            failed++;
            logger.addOutcome('errors', 1);
            await logger.error(`Failed to process media ${media.id}`, {
              mediaId: media.id.toString(),
              error: err instanceof Error ? err.message : String(err)
            });
          }

          await logger.incrementProgress();
        }
      }

      await logger.setStage('Finalizing');
      await logger.milestone('All media processed', {
        total,
        processed,
        rejected,
        failed
      });

      await logger.logSummary();

      return {
        total,
        processed,
        rejected,
        failed,
      };
    }
  )
}
