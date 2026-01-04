import { buildMediaUrls } from '../../../../services/media/urlBuilder.js';
import type { MediaRecord, MediaForAvatar } from '../types/models.js';

export function toPublicMedia(media: MediaRecord) {
  const urls = buildMediaUrls(media);
  return {
    id: String(media.id),
    type: media.type,
    url: urls.original,
    thumbUrl: urls.thumb,
    width: media.width ?? null,
    height: media.height ?? null,
    durationSec: media.durationSec ?? null
  };
}

export function toAvatarUrl(media: MediaRecord | MediaForAvatar | null | undefined): string | null {
  if (!media) return null;
  return buildMediaUrls(media).original;
}
