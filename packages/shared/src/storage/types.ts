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
