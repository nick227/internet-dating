import multer from 'multer';
import type { DomainRegistry } from '../../types.js';
import { Auth } from '../../../lib/auth/rules.js';
import { json } from '../../../lib/http/json.js';
import { parsePositiveBigInt } from '../../../lib/http/parse.js';
import { mediaService, MediaError } from '../../../services/media/mediaService.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
});

export const mediaDomain: DomainRegistry = {
  domain: 'media',
  routes: [
    {
      id: 'media.POST./media/upload',
      method: 'POST',
      path: '/media/upload',
      auth: Auth.user(),
      summary: 'Upload media',
      tags: ['media'],
      handler: async (req, res) => {
        upload.single('file')(req, res, async (err) => {
          if (err) {
            const status = (err as any)?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return json(res, { error: err.message ?? 'Upload failed' }, status);
          }
          const file = (req as any).file as Express.Multer.File | undefined;
          if (!file) return json(res, { error: 'file required' }, 400);

          try {
            const result = await mediaService.uploadImage({
              ownerUserId: req.ctx.userId!,
              file
            });
            return json(res, result, 201);
          } catch (e) {
            if (e instanceof MediaError) {
              return json(res, { error: e.message }, e.status);
            }
            return json(res, { error: 'Upload failed' }, 500);
          }
        });
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
    }
  ]
};
