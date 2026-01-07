import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { json } from '../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../lib/http/parse.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';
import { uploadMedia } from '../../../services/media/uploadHandler.js';
import { streamUploadToDisk } from '../../../services/media/streamingUpload.js';

export const mediaDomain: DomainRegistry = {
  domain: 'media',
  routes: [
    {
      id: 'media.POST./media/upload',
      method: 'POST',
      path: '/media/upload',
      auth: Auth.user(),
      summary: 'Upload media (streaming)',
      tags: ['media'],
      handler: async (req, res) => {
        try {
          process.stdout.write(`[media] Starting upload for user ${req.ctx.userId}\n`);
          // Stream upload to temp file on disk (no memory buffering)
          // Conservative limits: 200MB max, 5min total, 30s idle timeout
          const fileInfo = await streamUploadToDisk(req, res, {
            maxBytes: 200 * 1024 * 1024, // 200MB (for videos)
            maxTimeMs: 5 * 60 * 1000, // 5 minutes (fail fast)
            idleTimeoutMs: 30 * 1000, // 30 seconds (fail fast)
          });

          process.stdout.write(`[media] Upload streamed to temp file: ${fileInfo.filePath}\n`);
          process.stdout.write(`[media] File info: ${fileInfo.mimeType}, ${fileInfo.sizeBytes} bytes\n`);

          // Process and finalize upload
          const result = await uploadMedia({
            ownerUserId: req.ctx.userId!,
            visibility: 'PUBLIC', // TODO: get from form field
            fileInfo,
          });

          process.stdout.write(`[media] Upload successful: mediaId=${result.mediaId}\n`);
          return json(res, result, 201);
        } catch (e) {
          process.stderr.write(`[media] Upload error: ${String(e)}\n`);
          if (e instanceof Error && e.stack) {
            process.stderr.write(`[media] Stack: ${e.stack}\n`);
          }
          if (e instanceof MediaError) {
            return json(res, { error: e.message }, e.status);
          }
          if (e instanceof Error) {
            // Handle upload errors (timeout, size limit, etc.)
            if (e.message.includes('timeout') || e.message.includes('exceed')) {
              return json(res, { error: e.message }, 413);
            }
            return json(res, { error: e.message }, 400);
          }
          return json(res, { error: 'Upload failed' }, 500);
        }
      }
    },
    {
      id: 'media.GET./media/:mediaId',
      method: 'GET',
      path: '/media/:mediaId',
      auth: Auth.public(),
      summary: 'Get media',
      tags: ['media'],
      handler: async (req, res) => {
        const parsed = parsePositiveBigInt(req.params.mediaId, 'mediaId');
        if (!parsed.ok) return json(res, { error: parsed.error }, 400);
        try {
          const media = await mediaService.getMedia(parsed.value, req.ctx.userId ?? null);
          return json(res, media);
        } catch (e) {
          if (e instanceof MediaError) {
            return json(res, { error: e.message }, e.status);
          }
          return json(res, { error: 'Failed to fetch media' }, 500);
        }
      }
    },
    {
      id: 'media.DELETE./media/:mediaId',
      method: 'DELETE',
      path: '/media/:mediaId',
      auth: Auth.user(),
      summary: 'Delete media',
      tags: ['media'],
      handler: async (req, res) => {
        const userId = req.ctx.userId!;
        const parsed = parsePositiveBigInt(req.params.mediaId, 'mediaId');
        if (!parsed.ok) return json(res, { error: parsed.error }, 400);
        const mediaId = parsed.value;

        const { prisma } = await import('../../../lib/prisma/client.js');
        const media = await prisma.media.findFirst({
          where: { id: mediaId, deletedAt: null },
          select: { id: true, ownerUserId: true }
        });
        if (!media) return json(res, { error: 'Media not found' }, 404);
        if (media.ownerUserId !== userId) return json(res, { error: 'Forbidden' }, 403);

        await prisma.media.update({
          where: { id: mediaId },
          data: { deletedAt: new Date() }
        });

        return json(res, { ok: true });
      }
    }
  ]
};
