import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Job } from 'bullmq'
import { Receipt } from '@prisma/client'
import { processReceiptJob, setOCRProvider } from './receipt.js'
import { prisma } from '../db/client.js'
import { LocalStorageProvider } from '@pocketlens/shared/server'
import {
  OCRResult,
  OCRProvider,
  ReceiptJobData,
  ReceiptJobResult,
} from '@pocketlens/shared'

// Mock OCR provider that returns quality info (simulates EnhancedOCRResult)
class MockEnhancedOCRProvider {
  private mockText: string
  private confidence: number

  constructor(mockText: string, confidence = 90) {
    this.mockText = mockText
    this.confidence = confidence
  }

  async extractText(
    _imageBuffer: Buffer,
    _mimeType: string,
  ): Promise<OCRResult> {
    return {
      rawText: this.mockText,
      confidence: this.confidence,
      detectedLanguage: 'eng+vie',
      durationMs: 50,
      provider: 'tesseract.js-local',
    } as OCRResult
  }
}

describe('Receipt Background Worker Processor (processReceiptJob Phase 6)', () => {
  const mockUser = {
    id: 'user_1',
    categories: [{ id: 'cat_1', name: 'Food & Drink', isArchived: false }],
    accounts: [
      {
        id: 'acc_1',
        name: 'Checking',
        currency: 'VND',
        isDefault: true,
        isArchived: false,
      },
    ],
  }

  const mockReceipt = {
    id: 'rcpt_1',
    userId: 'user_1',
    storageKey: 'receipts/user_1/sample.jpg',
    storagePath: '/tmp/receipts/sample.jpg',
    fileName: 'sample.jpg',
    mimeType: 'image/jpeg',
    status: 'QUEUED',
    user: mockUser,
    extraction: null,
  }

  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ])

  const sampleOCRText = `
HIGHLANDS COFFEE
24/08/2026

Cà phê sữa đá     45.000
Bánh mì chả lụa   35.000
TỔNG CỘNG         80.000 VNĐ
  `

  beforeEach(() => {
    vi.restoreAllMocks()
    setOCRProvider(
      new MockEnhancedOCRProvider(sampleOCRText, 95) as unknown as OCRProvider,
    )
  })

  it('processes valid receipt with OCR and creates structured extraction and items', async () => {
    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(
      mockReceipt as unknown as Receipt,
    )
    const updateSpy = vi.spyOn(prisma.receipt, 'update').mockResolvedValue({
      ...mockReceipt,
      status: 'READY',
    } as unknown as Receipt)

    vi.spyOn(LocalStorageProvider.prototype, 'exists').mockResolvedValue(true)
    vi.spyOn(LocalStorageProvider.prototype, 'getFile').mockResolvedValue(
      validJpegBuffer,
    )

    const mockCreateExtraction = vi.fn().mockResolvedValue({ id: 'ext_1' })
    const mockTx = {
      receiptExtraction: { create: mockCreateExtraction, delete: vi.fn() },
      receiptItem: { deleteMany: vi.fn() },
      receipt: { update: updateSpy },
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(((
      cb: (tx: unknown) => Promise<unknown>,
    ) => cb(mockTx)) as never)

    const mockJob = {
      id: 'job_1',
      data: { receiptId: mockReceipt.id },
    } as unknown as Job<ReceiptJobData, ReceiptJobResult>

    const result = await processReceiptJob(mockJob)

    expect(result.success).toBe(true)
    expect(result.receiptId).toBe(mockReceipt.id)

    // Verify extraction creation was called with extracted fields
    expect(mockCreateExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiptId: mockReceipt.id,
          merchant: 'HIGHLANDS COFFEE',
          totalAmount: 80000,
          currency: 'VND',
          status: 'PENDING_REVIEW',
        }),
      }),
    )
  })

  it('handles idempotency cleanly if receipt is already READY with extraction', async () => {
    const readyReceipt = {
      ...mockReceipt,
      status: 'READY',
      extraction: { id: 'ext_1', items: [] },
    }
    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(
      readyReceipt as unknown as Receipt,
    )
    const updateSpy = vi.spyOn(prisma.receipt, 'update')

    const mockJob = {
      id: 'job_2',
      data: { receiptId: mockReceipt.id },
    } as unknown as Job<ReceiptJobData, ReceiptJobResult>

    const result = await processReceiptJob(mockJob)

    expect(result.success).toBe(true)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('re-processes receipt by deleting old extraction and creating new extraction cleanly', async () => {
    const existingReceipt = {
      ...mockReceipt,
      status: 'QUEUED',
      extraction: {
        id: 'old_ext_1',
        items: [{ id: 'old_item_1' }],
      },
    }

    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(
      existingReceipt as unknown as Receipt,
    )
    const updateSpy = vi.spyOn(prisma.receipt, 'update').mockResolvedValue({
      ...existingReceipt,
      status: 'READY',
    } as unknown as Receipt)

    vi.spyOn(LocalStorageProvider.prototype, 'exists').mockResolvedValue(true)
    vi.spyOn(LocalStorageProvider.prototype, 'getFile').mockResolvedValue(
      validJpegBuffer,
    )

    const mockCreateExtraction = vi.fn().mockResolvedValue({ id: 'new_ext_2' })
    const mockDeleteExtraction = vi.fn().mockResolvedValue({})
    const mockDeleteItems = vi.fn().mockResolvedValue({})

    const mockTx = {
      receiptExtraction: {
        create: mockCreateExtraction,
        delete: mockDeleteExtraction,
      },
      receiptItem: { deleteMany: mockDeleteItems },
      receipt: { update: updateSpy },
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(((
      cb: (tx: unknown) => Promise<unknown>,
    ) => cb(mockTx)) as never)

    const mockJob = {
      id: 'job_reprocess',
      data: { receiptId: existingReceipt.id },
    } as unknown as Job<ReceiptJobData, ReceiptJobResult>

    const result = await processReceiptJob(mockJob)

    expect(result.success).toBe(true)
    expect(mockDeleteItems).toHaveBeenCalledWith({
      where: { extractionId: 'old_ext_1' },
    })
    expect(mockDeleteExtraction).toHaveBeenCalledWith({
      where: { id: 'old_ext_1' },
    })
    expect(mockCreateExtraction).toHaveBeenCalled()
  })

  it('marks receipt as FAILED when OCR provider throws an error', async () => {
    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(
      mockReceipt as unknown as Receipt,
    )
    const updateSpy = vi.spyOn(prisma.receipt, 'update').mockResolvedValue({
      ...mockReceipt,
      status: 'FAILED',
    } as unknown as Receipt)

    vi.spyOn(LocalStorageProvider.prototype, 'exists').mockResolvedValue(true)
    vi.spyOn(LocalStorageProvider.prototype, 'getFile').mockResolvedValue(
      validJpegBuffer,
    )

    // Mock OCR provider that fails
    setOCRProvider({
      extractText: vi.fn().mockRejectedValue(new Error('Corrupted image data')),
    })

    const mockJob = {
      id: 'job_ocr_fail',
      data: { receiptId: mockReceipt.id },
    } as unknown as Job<ReceiptJobData, ReceiptJobResult>

    await expect(processReceiptJob(mockJob)).rejects.toThrow(
      'Corrupted image data',
    )

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockReceipt.id },
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'PROCESSING_FAILED',
        }),
      }),
    )
  })
})
