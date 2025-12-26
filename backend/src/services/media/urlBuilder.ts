import { MEDIA_BASE_URL } from './config.js';

type Variant = { key: string; width?: number | null; height?: number | null };
type Variants = {
  original?: Variant;
  thumb?: Variant;
  small?: Variant;
  medium?: Variant;
  large?: Variant;
  poster?: Variant;
};

export type MediaUrlInput = {
  storageKey?: string | null;
  variants?: unknown;
  url?: string | null;
  thumbUrl?: string | null;
};

export type MediaUrls = {
  original: string;
  thumb: string | null;
};

const MEDIA_PATH_PREFIX = '/media';

export function buildMediaUrls(media: MediaUrlInput): MediaUrls {
  const variants = normalizeVariants(media.variants);
  const originalKey = variants?.original?.key ?? media.storageKey ?? null;
  const original = originalKey ? buildUrl(originalKey) : (media.url ?? '');
  const thumbKey = variants?.thumb?.key ?? null;
  const thumb = thumbKey
    ? buildUrl(thumbKey)
    : originalKey
      ? buildUrl(originalKey)
      : (media.thumbUrl ?? original);
  return { original, thumb: thumb ?? null };
}

export function buildMediaUrl(media: MediaUrlInput, variant: keyof Variants) {
  const variants = normalizeVariants(media.variants);
  const key = variants?.[variant]?.key ?? variants?.original?.key ?? media.storageKey ?? null;
  if (key) return buildUrl(key);
  return media.url ?? '';
}

function buildUrl(key: string) {
  const base = MEDIA_BASE_URL;
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${base}${MEDIA_PATH_PREFIX}/${encoded}`;
}

function normalizeVariants(value: unknown): Variants | null {
  if (!value || typeof value !== 'object') return null;
  return value as Variants;
}
