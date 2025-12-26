import { buildMediaUrls } from './urlBuilder.js';

type MediaRecord = {
  id: bigint;
  type: string;
  storageKey?: string | null;
  variants?: unknown;
  url?: string | null;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
};

export function toPublicMedia(media: MediaRecord) {
  const urls = buildMediaUrls(media);
  return {
    id: media.id,
    type: media.type,
    url: urls.original,
    thumbUrl: urls.thumb,
    width: media.width ?? null,
    height: media.height ?? null,
    durationSec: media.durationSec ?? null
  };
}

export function toAvatarUrl(media: MediaRecord | null | undefined) {
  if (!media) return null;
  return buildMediaUrls(media).original;
}
