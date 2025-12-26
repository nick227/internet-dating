import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import type { StorageMeta, StorageProvider } from './storage.js';

export class LocalStorageProvider implements StorageProvider {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  async put(stream: Readable, key: string, _meta?: StorageMeta) {
    const filePath = this.resolvePath(key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const out = fs.createWriteStream(filePath);
    await pipeline(stream, out);
  }

  async get(key: string) {
    const filePath = this.resolvePath(key);
    return fs.createReadStream(filePath);
  }

  async delete(key: string) {
    const filePath = this.resolvePath(key);
    await fs.promises.unlink(filePath).catch(() => null);
  }

  private resolvePath(key: string) {
    const safeKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const filePath = path.resolve(this.root, safeKey);
    const rootPath = path.resolve(this.root);
    if (!filePath.startsWith(rootPath)) {
      throw new Error('Invalid storage key');
    }
    return filePath;
  }
}
