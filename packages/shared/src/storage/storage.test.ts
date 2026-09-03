import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { LocalStorageProvider } from './local.js'

describe('LocalStorageProvider', () => {
  let tempDir: string
  let provider: LocalStorageProvider

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pocketlens-storage-test-'),
    )
    provider = new LocalStorageProvider(tempDir)
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it('should ensure storage directory is ready', async () => {
    const ready = await provider.ensureReady()
    expect(ready).toBe(true)
  })

  it('should save and retrieve a file buffer', async () => {
    const key = 'receipts/user123/test-receipt.jpg'
    const testContent = Buffer.from('fake receipt binary content')

    const saveResult = await provider.saveFile(key, testContent)
    expect(saveResult.path).toContain('test-receipt.jpg')
    expect(saveResult.size).toBe(testContent.length)

    const exists = await provider.exists(key)
    expect(exists).toBe(true)

    const retrieved = await provider.getFile(key)
    expect(retrieved.toString()).toBe('fake receipt binary content')
  })

  it('should delete a file', async () => {
    const key = 'receipts/user123/delete-me.png'
    await provider.saveFile(key, Buffer.from('test'))
    expect(await provider.exists(key)).toBe(true)

    await provider.deleteFile(key)
    expect(await provider.exists(key)).toBe(false)
  })

  it('should prevent path traversal attempts', async () => {
    const maliciousKey = '../../etc/passwd'
    // Path resolution normalizes and contains inside base path, or throws error
    const fullPath = (provider as LocalStorageProvider).getFullPath(
      maliciousKey,
    )
    expect(fullPath.startsWith(tempDir)).toBe(true)
  })
})
