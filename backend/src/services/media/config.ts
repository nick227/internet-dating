import path from 'path';

const envDir = process.env.MEDIA_UPLOAD_DIR;
export const MEDIA_UPLOAD_ROOT = envDir
  ? path.resolve(envDir)
  : path.resolve(process.cwd(), 'uploads', 'media');

const fallbackBase = `http://localhost:${process.env.PORT ?? 4000}`;
export const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL ?? process.env.API_BASE_URL ?? fallbackBase).replace(/\/$/, '');
