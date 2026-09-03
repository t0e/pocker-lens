import { describe, it, expect } from 'vitest'
import {
  validateImageMagicBytes,
  MAX_RECEIPT_FILE_SIZE,
  ALLOWED_RECEIPT_MIME_TYPES,
} from './index.js'

describe('Receipt Validation & Magic Bytes', () => {
  it('should validate standard JPEG header (FF D8 FF)', () => {
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])
    const result = validateImageMagicBytes(jpegBuffer)
    expect(result.valid).toBe(true)
    expect(result.detectedMimeType).toBe('image/jpeg')
  })

  it('should validate PNG header (89 50 4E 47 0D 0A 1A 0A)', () => {
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ])
    const result = validateImageMagicBytes(pngBuffer)
    expect(result.valid).toBe(true)
    expect(result.detectedMimeType).toBe('image/png')
  })

  it('should validate WebP header (RIFF ... WEBP)', () => {
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20,
    ])
    const result = validateImageMagicBytes(webpBuffer)
    expect(result.valid).toBe(true)
    expect(result.detectedMimeType).toBe('image/webp')
  })

  it('should reject fake or text file headers', () => {
    const fakeBuffer = Buffer.from('hello this is a text file not an image')
    const result = validateImageMagicBytes(fakeBuffer)
    expect(result.valid).toBe(false)
  })

  it('should reject buffers that are too small', () => {
    const tinyBuffer = Buffer.from([0xff, 0xd8])
    const result = validateImageMagicBytes(tinyBuffer)
    expect(result.valid).toBe(false)
  })

  it('should enforce 10MB max file size constant', () => {
    expect(MAX_RECEIPT_FILE_SIZE).toBe(10485760)
    expect(ALLOWED_RECEIPT_MIME_TYPES).toContain('image/jpeg')
    expect(ALLOWED_RECEIPT_MIME_TYPES).toContain('image/png')
    expect(ALLOWED_RECEIPT_MIME_TYPES).toContain('image/webp')
  })
})
