import fs from 'node:fs/promises'
import path from 'node:path'
import { StorageConfig, StorageProviderType } from '../types/index.js'
import { StorageProvider, StorageSaveResult } from './types.js'

export class LocalStorageProvider implements StorageProvider {
  public readonly type: StorageProviderType = 'local'
  private basePath: string

  constructor(basePath: string = '/data/receipts') {
    this.basePath = path.resolve(basePath)
  }

  private getFullPath(key: string): string {
    // Prevent path traversal
    const safeKey = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')
    const resolvedPath = path.resolve(this.basePath, safeKey)

    if (!resolvedPath.startsWith(this.basePath)) {
      throw new Error(`Invalid storage key: path traversal detected (${key})`)
    }

    return resolvedPath
  }

  async ensureReady(): Promise<boolean> {
    try {
      await fs.mkdir(this.basePath, { recursive: true })
      return true
    } catch {
      return false
    }
  }

  async saveFile(key: string, buffer: Buffer): Promise<StorageSaveResult> {
    const fullPath = this.getFullPath(key)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, buffer)
    return {
      path: fullPath,
      size: buffer.length,
    }
  }

  async getFile(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key)
    return await fs.readFile(fullPath)
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.getFullPath(key)
    try {
      await fs.unlink(fullPath)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }
  }

  async getFileUrl(key: string): Promise<string> {
    return `/storage/receipts/${encodeURIComponent(key)}`
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(key)
      await fs.access(fullPath)
      return true
    } catch {
      return false
    }
  }
}

export function createStorageProvider(config: StorageConfig): StorageProvider {
  switch (config.provider) {
    case 'local':
      return new LocalStorageProvider(config.localBasePath || '/data/receipts')
    case 's3':
      throw new Error(
        'S3 Storage Provider is planned for future phases and not implemented in Phase 1/2',
      )
    default:
      throw new Error(`Unsupported storage provider: ${config.provider}`)
  }
}
