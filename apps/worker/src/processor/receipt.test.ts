import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processReceiptJob } from './receipt.js';
import { prisma } from '../db/client.js';
import { LocalStorageProvider } from '@pocketlens/shared/server';

describe('Receipt Background Worker Processor (processReceiptJob)', () => {
  const mockReceipt = {
    id: 'receipt_worker_1',
    userId: 'user_1',
    originalFilename: 'coffee.jpg',
    storageKey: 'receipts/user_1/receipt_worker_1.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    status: 'QUEUED',
    errorCode: null,
    errorMessage: null,
    transactionId: null,
    processingStartedAt: null,
    processingCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes valid receipt and transitions status to READY', async () => {
    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(mockReceipt as any);
    const updateSpy = vi.spyOn(prisma.receipt, 'update').mockResolvedValue({
      ...mockReceipt,
      status: 'READY',
    } as any);

    vi.spyOn(LocalStorageProvider.prototype, 'exists').mockResolvedValue(true);
    vi.spyOn(LocalStorageProvider.prototype, 'getFile').mockResolvedValue(validJpegBuffer);

    const mockJob = {
      id: 'job_1',
      data: { receiptId: mockReceipt.id },
    } as any;

    const result = await processReceiptJob(mockJob);

    expect(result.success).toBe(true);
    expect(result.receiptId).toBe(mockReceipt.id);

    // Verify status was updated to PROCESSING then READY
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockReceipt.id },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      })
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockReceipt.id },
        data: expect.objectContaining({ status: 'READY' }),
      })
    );
  });

  it('handles idempotency cleanly if receipt is already READY', async () => {
    const readyReceipt = { ...mockReceipt, status: 'READY' };
    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(readyReceipt as any);
    const updateSpy = vi.spyOn(prisma.receipt, 'update');

    const mockJob = {
      id: 'job_2',
      data: { receiptId: mockReceipt.id },
    } as any;

    const result = await processReceiptJob(mockJob);

    expect(result.success).toBe(true);
    // Should NOT call update again if already READY
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('marks receipt as FAILED when file does not exist on storage', async () => {
    vi.spyOn(prisma.receipt, 'findUnique').mockResolvedValue(mockReceipt as any);
    const updateSpy = vi.spyOn(prisma.receipt, 'update').mockResolvedValue({
      ...mockReceipt,
      status: 'FAILED',
    } as any);

    vi.spyOn(LocalStorageProvider.prototype, 'exists').mockResolvedValue(false);

    const mockJob = {
      id: 'job_3',
      data: { receiptId: mockReceipt.id },
    } as any;

    await expect(processReceiptJob(mockJob)).rejects.toThrow();

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockReceipt.id },
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'PROCESSING_FAILED',
        }),
      })
    );
  });
});
