import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import imageSize from 'image-size';
import type { Express } from 'express';
import { prisma } from '../../lib/prisma/client.js';
import { hasProfileAccess } from '../access/profileAccessService.js';
import { LocalStorageProvider } from './localStorageProvider.js';
import { MEDIA_UPLOAD_ROOT } from './config.js';
import { buildMediaUrls } from './urlBuilder.js';

type UploadResult = {
  mediaId: bigint;
  status: 'READY' | 'FAILED' | 'PENDING';
  mimeType: string;
  urls: { original: string; thumb: string | null };
};

type MediaResponse = {
  mediaId: bigint;
  status: 'READY' | 'FAILED' | 'PENDING';
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  urls: { original: string; thumb: string | null };
};

type UploadInput = {
  ownerUserId: bigint;
  visibility?: 'PUBLIC' | 'PRIVATE';
  file: Express.Multer.File;
};

const storage = new LocalStorageProvider(MEDIA_UPLOAD_ROOT);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 20000;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

const rateMap = new Map<string, { count: number; resetAt: number }>();

export class MediaError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const mediaService = {
  async uploadImage(input: UploadInput): Promise<UploadResult> {
    const { ownerUserId, visibility = 'PUBLIC', file } = input;
    if (visibility !== 'PUBLIC' && visibility !== 'PRIVATE') {
      throw new MediaError('Invalid visibility', 400);
    }
    assertRateLimit(ownerUserId);
    if (!file) throw new MediaError('file required', 400);
    if (file.mimetype === 'image/svg+xml') throw new MediaError('SVG not allowed', 400);
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) throw new MediaError('Unsupported mime type', 400);
    if (file.size > MAX_IMAGE_BYTES) throw new MediaError('File too large', 400);

    const meta = safeImageSize(file.buffer);
    if (!meta.width || !meta.height) throw new MediaError('Invalid image', 400);
    if (!isAllowedImageType(meta.type)) throw new MediaError('Invalid image format', 400);
    if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
      throw new MediaError('Image dimensions too large', 400);
    }

    const storageKey = buildStorageKey(file.mimetype);
    const contentHash = sha256(file.buffer);
    const variants = { original: { key: storageKey, width: meta.width, height: meta.height } };
    const urls = buildMediaUrls({ storageKey, variants });

    const created = await prisma.media.create({
      data: {
        userId: ownerUserId,
        ownerUserId,
        type: 'IMAGE',
        status: 'PENDING',
        visibility,
        storageKey,
        variants,
        contentHash,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        width: meta.width,
        height: meta.height,
        url: urls.original,
        thumbUrl: urls.thumb
      },
      select: { id: true }
    });

    try {
      await storage.put(Readable.from(file.buffer), storageKey, { contentType: file.mimetype });
      await prisma.media.update({
        where: { id: created.id },
        data: { status: 'READY' }
      });
      return { mediaId: created.id, status: 'READY', mimeType: file.mimetype, urls };
    } catch (err) {
      await prisma.media.update({
        where: { id: created.id },
        data: { status: 'FAILED' }
      }).catch(() => null);
      throw new MediaError('Failed to store media', 500);
    }
  },

  async getMedia(mediaId: bigint, viewerId?: bigint | null): Promise<MediaResponse> {
    const media = await prisma.media.findFirst({
      where: { id: mediaId, deletedAt: null },
      select: {
        id: true,
        status: true,
        mimeType: true,
        sizeBytes: true,
        width: true,
        height: true,
        durationSec: true,
        visibility: true,
        ownerUserId: true,
        storageKey: true,
        variants: true,
        url: true,
        thumbUrl: true
      }
    });
    if (!media) throw new MediaError('Media not found', 404);
    if (media.visibility === 'PRIVATE' && media.ownerUserId !== viewerId) {
      const allowed = await hasProfileAccess(media.ownerUserId, viewerId ?? null);
      if (!allowed) throw new MediaError('Forbidden', 403);
    }

    const urls = buildMediaUrls(media);
    return {
      mediaId: media.id,
      status: media.status as UploadResult['status'],
      mimeType: media.mimeType ?? null,
      sizeBytes: media.sizeBytes ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      durationSec: media.durationSec ?? null,
      urls
    };
  },

  async getMediaStreamByKey(storageKey: string, viewerId?: bigint | null) {
    const media = await prisma.media.findFirst({
      where: { storageKey, deletedAt: null },
      select: {
        storageKey: true,
        visibility: true,
        ownerUserId: true,
        status: true,
        mimeType: true
      }
    });
    if (!media || !media.storageKey) throw new MediaError('Media not found', 404);
    if (media.visibility === 'PRIVATE' && media.ownerUserId !== viewerId) {
      const allowed = await hasProfileAccess(media.ownerUserId, viewerId ?? null);
      if (!allowed) throw new MediaError('Forbidden', 403);
    }
    if (media.status !== 'READY') {
      throw new MediaError('Media not ready', 409);
    }
    const stream = await storage.get(media.storageKey);
    return { stream, mimeType: media.mimeType ?? 'application/octet-stream' };
  },

  async assertProfileMedia(mediaId: bigint, ownerUserId: bigint) {
    const media = await prisma.media.findFirst({
      where: { id: mediaId, deletedAt: null },
      select: { ownerUserId: true, status: true, visibility: true, type: true }
    });
    if (!media || media.ownerUserId !== ownerUserId) {
      throw new MediaError('Invalid media owner', 403);
    }
    if (media.status !== 'READY') {
      throw new MediaError('Media not ready', 400);
    }
    if (media.type !== 'IMAGE') {
      throw new MediaError('Media must be an image', 400);
    }
    if (media.visibility !== 'PUBLIC') {
      throw new MediaError('Media must be public', 400);
    }
  },

  async assertOwnedMediaIds(
    mediaIds: bigint[],
    ownerUserId: bigint,
    options: { requireReady?: boolean; requirePublic?: boolean; type?: 'IMAGE' | 'VIDEO' } = {}
  ) {
    if (!mediaIds.length) return;
    const seen = new Set<string>();
    const uniqueIds: bigint[] = [];
    for (const id of mediaIds) {
      const key = id.toString();
      if (seen.has(key)) {
        throw new MediaError('Duplicate mediaIds not allowed', 400);
      }
      seen.add(key);
      uniqueIds.push(id);
    }
    const media = await prisma.media.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, ownerUserId: true, status: true, visibility: true, type: true }
    });
    if (media.length !== uniqueIds.length) {
      throw new MediaError('Invalid mediaIds', 400);
    }
    for (const entry of media) {
      if (entry.ownerUserId !== ownerUserId) {
        throw new MediaError('Invalid media owner', 403);
      }
      if (options.requireReady && entry.status !== 'READY') {
        throw new MediaError('Media not ready', 400);
      }
      if (options.requirePublic && entry.visibility !== 'PUBLIC') {
        throw new MediaError('Media must be public', 400);
      }
      if (options.type && entry.type !== options.type) {
        throw new MediaError('Invalid media type', 400);
      }
    }
  }
};

function safeImageSize(buffer: Buffer) {
  try {
    return imageSize(buffer);
  } catch {
    return { width: 0, height: 0 };
  }
}

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildStorageKey(mimeType: string) {
  const ext = mimeToExt(mimeType);
  const id = randomUUID();
  const hex = id.replace(/-/g, '');
  const prefix = `${hex.slice(0, 2)}/${hex.slice(2, 4)}`;
  return `${prefix}/${id}${ext}`;
}

function mimeToExt(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

function isAllowedImageType(type?: string) {
  return type === 'jpg' || type === 'jpeg' || type === 'png' || type === 'webp';
}

function assertRateLimit(ownerUserId: bigint) {
  const key = ownerUserId.toString();
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || entry.resetAt <= now) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    throw new MediaError('Rate limit exceeded', 429);
  }
  entry.count += 1;
}
