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
    process.stdout.write(`[media] Storage.put: saving to ${filePath}\n`);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const out = fs.createWriteStream(filePath);
    await pipeline(stream, out);
    // Verify file was written
    try {
      const stats = await fs.promises.stat(filePath);
      process.stdout.write(`[media] Storage.put: file saved successfully (${stats.size} bytes)\n`);
    } catch (err) {
      process.stderr.write(`[media] Storage.put: WARNING - file not found after write: ${filePath}\n`);
    }
  }

  async get(key: string) {
    const filePath = this.resolvePath(key);
    process.stdout.write(`[media] Storage.get: reading from ${filePath}\n`);
    // Check if file exists before creating stream
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      const stats = await fs.promises.stat(filePath);
      process.stdout.write(`[media] Storage.get: file found (${stats.size} bytes)\n`);
    } catch (err) {
      process.stderr.write(`[media] Storage.get: file not found: ${filePath}\n`);
      if (err instanceof Error && err.stack) {
        process.stderr.write(`[media] Storage.get: error: ${err.stack}\n`);
      }
      throw new Error(`File not found: ${filePath}`);
    }
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
