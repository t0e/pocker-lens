import { Job } from 'bullmq';
import pino from 'pino';
import {
  ReceiptJobData,
  ReceiptJobResult,
  validateImageMagicBytes,
} from '@pocketlens/shared';
import { createStorageProvider } from '@pocketlens/shared/server';
import { prisma } from '../db/client.js';
import { config } from '../config/env.js';

const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
});

const storage = createStorageProvider({
  provider: config.STORAGE_PROVIDER,
  localBasePath: config.RECEIPT_STORAGE_PATH,
});

export async function processReceiptJob(job: Job<ReceiptJobData, ReceiptJobResult>): Promise<ReceiptJobResult> {
  const { receiptId } = job.data;
  const startTime = Date.now();

  logger.info({ receiptId, jobId: job.id }, 'receipt.processing started');

  // 1. Fetch receipt from database
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
  });

  if (!receipt) {
    logger.warn({ receiptId }, 'Receipt record not found in database for job');
    return { receiptId, success: false, processedAt: new Date().toISOString() };
  }

  // Idempotency check: if already READY, skip and return success
  if (receipt.status === 'READY') {
    logger.info({ receiptId }, 'Receipt already processed and marked READY. Idempotent skip.');
    return { receiptId, success: true, processedAt: new Date().toISOString() };
  }

  // 2. Mark PROCESSING
  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });

  try {
    // 3. Read and validate stored file
    const exists = await storage.exists(receipt.storageKey);
    if (!exists) {
      throw new Error(`Receipt image file not found on disk at storage key: ${receipt.storageKey}`);
    }

    const fileBuffer = await storage.getFile(receipt.storageKey);
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Stored receipt image file is empty or corrupted');
    }

    const magicCheck = validateImageMagicBytes(fileBuffer);
    if (!magicCheck.valid) {
      throw new Error('Stored receipt file failed signature verification');
    }

    // 4. Mark READY (Phase 5: successfully stored, validated, and processed by background worker)
    const completedAt = new Date();
    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'READY',
        processingCompletedAt: completedAt,
      },
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      { receiptId, userId: receipt.userId, size: fileBuffer.length, durationMs },
      'receipt.ready (Phase 5 verification complete)'
    );

    return {
      receiptId,
      success: true,
      processedAt: completedAt.toISOString(),
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logger.error({ err: err.message, receiptId, durationMs }, 'receipt.failed');

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'FAILED',
        errorCode: 'PROCESSING_FAILED',
        errorMessage: 'Receipt processing failed. Please verify the file and retry.',
        processingCompletedAt: new Date(),
      },
    });

    throw err;
  }
}
