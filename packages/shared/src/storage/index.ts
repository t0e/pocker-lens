import fs from 'node:fs/promises';
import path from 'node:path';
import { StorageConfig, StorageProviderType } from '../types/index.js';

export interface StorageSaveResult {
  path: string;
  size: number;
}

export interface StorageProvider {
  type: StorageProviderType;
  saveFile(key: string, buffer: Buffer, contentType?: string): Promise<StorageSaveResult>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
  getFileUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
  ensureReady(): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  public readonly type: StorageProviderType = 'local';
  private basePath: string;

  constructor(basePath: string = '/data/receipts') {
    this.basePath = basePath;
  }

  private getFullPath(key: string): string {
    // Sanitize key to prevent path traversal
    const safeKey = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.basePath, safeKey);
  }

  async ensureReady(): Promise<boolean> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async saveFile(key: string, buffer: Buffer): Promise<StorageSaveResult> {
    const fullPath = this.getFullPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return {
      path: fullPath,
      size: buffer.length,
    };
  }

  async getFile(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key);
    return await fs.readFile(fullPath);
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async getFileUrl(key: string): Promise<string> {
    return `/storage/receipts/${encodeURIComponent(key)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.getFullPath(key));
      return true;
    } catch {
      return false;
    }
  }
}

export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.provider) {
    case 'local':
      return new LocalStorageProvider(config.localBasePath || '/data/receipts');
    case 's3':
      throw new Error('S3 Storage Provider is planned for future phases and not implemented in Phase 1');
    default:
      throw new Error(`Unsupported storage provider: ${config.provider}`);
  }
}
