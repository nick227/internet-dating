import type { Readable } from 'stream';

export type StorageMeta = {
  contentType?: string;
};

export type StorageProvider = {
  put: (stream: Readable, key: string, meta?: StorageMeta) => Promise<void>;
  get: (key: string) => Promise<Readable>;
  delete: (key: string) => Promise<void>;
};
