import { Job } from 'bullmq';
import pino from 'pino';
import {
  ReceiptJobData,
  ReceiptJobResult,
  validateImageMagicBytes,
  extractReceiptData,
  OCRProvider,
} from '@pocketlens/shared';
import { createStorageProvider } from '@pocketlens/shared/server';
import { prisma } from '../db/client.js';
import { config } from '../config/env.js';
import { LocalOCRProvider, EnhancedOCRResult } from '../ocr/local.js';

const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
});

const storage = createStorageProvider({
  provider: config.STORAGE_PROVIDER,
  localBasePath: config.RECEIPT_STORAGE_PATH,
});

let ocrProvider: OCRProvider = new LocalOCRProvider();

export function setOCRProvider(provider: OCRProvider) {
  ocrProvider = provider;
}

export async function processReceiptJob(job: Job<ReceiptJobData, ReceiptJobResult>): Promise<ReceiptJobResult> {
  const { receiptId } = job.data;
  const startTime = Date.now();

  logger.info({ receiptId, jobId: job.id }, 'receipt.processing started');

  // 1. Fetch receipt and user details from database
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      user: {
        include: {
          categories: { where: { isArchived: false } },
          accounts: { where: { isArchived: false } },
        },
      },
      extraction: {
        include: { items: true },
      },
    },
  });

  if (!receipt) {
    logger.warn({ receiptId }, 'Receipt record not found in database for job');
    return { receiptId, success: false, processedAt: new Date().toISOString() };
  }

  // Idempotency check: if already READY and has extraction, skip
  if (receipt.status === 'READY' && receipt.extraction) {
    logger.info({ receiptId }, 'Receipt already processed with extraction and marked READY. Idempotent skip.');
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

    // 4. Perform multi-pass OCR text extraction with preprocessing
    logger.info({ receiptId }, 'receipt.ocr extracting text (multi-pass)...');
    const ocrResult = await ocrProvider.extractText(fileBuffer, receipt.mimeType);

    // Extract quality and debug info if available (EnhancedOCRResult)
    const enhancedResult = ocrResult as EnhancedOCRResult;
    const qualityInfo = enhancedResult.quality || null;
    const debugInfo = enhancedResult.debug || null;

    // 5. Perform deterministic structured extraction (English + Vietnamese)
    const userCategories = receipt.user.categories.map((c) => ({ id: c.id, name: c.name }));
    const defaultAccount = receipt.user.accounts.find((a) => a.isDefault) || receipt.user.accounts[0];

    const extracted = extractReceiptData(ocrResult.rawText, {
      userCategories,
      defaultCurrency: defaultAccount?.currency || 'VND',
    });

    // 6. Persist extraction and line items in database atomically
    await prisma.$transaction(async (tx) => {
      // Delete old extraction items if re-processing
      if (receipt.extraction) {
        await tx.receiptItem.deleteMany({
          where: { extractionId: receipt.extraction.id },
        });
        await tx.receiptExtraction.delete({
          where: { id: receipt.extraction.id },
        });
      }

      // Merge image quality + debug info into fieldConfidences JSON (dev inspection)
      const fieldConfidencesWithQuality = {
        ...extracted.fieldConfidences,
        ...(qualityInfo ? {
          imageQuality: {
            rating: qualityInfo.rating,
            brightness: Math.round(qualityInfo.brightness),
            contrast: Math.round(qualityInfo.contrast),
            sharpness: Math.round(qualityInfo.sharpness),
            resolution: `${qualityInfo.width}x${qualityInfo.height}`,
            issues: qualityInfo.details,
          },
        } : {}),
        ...(debugInfo ? {
          ocrPipeline: {
            documentDetected: debugInfo.documentDetected,
            documentConfidence: Math.round(debugInfo.documentConfidence * 100) / 100,
            documentAreaPercent: Math.round(debugInfo.documentAreaFraction * 100),
            perspectiveCorrected: debugInfo.perspectiveCorrected,
            originalDimensions: debugInfo.originalDimensions,
            croppedDimensions: debugInfo.croppedDimensions,
            candidates: debugInfo.candidateLabels,
            bestCandidate: enhancedResult.bestCandidate || 'unknown',
          },
        } : {}),
      };

      const extractionRecord = await tx.receiptExtraction.create({
        data: {
          receiptId: receipt.id,
          merchant: extracted.merchant,
          transactionDate: extracted.transactionDate,
          totalAmount: extracted.totalAmount !== null ? extracted.totalAmount : undefined,
          currency: extracted.currency,
          categoryId: extracted.suggestedCategoryId || null,
          accountId: defaultAccount?.id || null,
          rawText: extracted.rawText,
          detectedLanguage: extracted.detectedLanguage,
          confidence: extracted.confidence,
          fieldConfidences: fieldConfidencesWithQuality as any,
          status: 'PENDING_REVIEW',
          items: {
            create: extracted.items.map((item) => ({
              description: item.description,
              quantity: item.quantity !== null ? item.quantity : undefined,
              unitPrice: item.unitPrice !== null ? item.unitPrice : undefined,
              totalPrice: item.totalPrice !== null ? item.totalPrice : undefined,
            })),
          },
        },
      });

      // 7. Mark receipt READY for user review
      await tx.receipt.update({
        where: { id: receiptId },
        data: {
          status: 'READY',
          processingCompletedAt: new Date(),
        },
      });

      return extractionRecord;
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        receiptId,
        userId: receipt.userId,
        merchant: extracted.merchant,
        total: extracted.totalAmount,
        currency: extracted.currency,
        itemsCount: extracted.items.length,
        ocrConfidence: ocrResult.confidence,
        extractionConfidence: extracted.confidence,
        qualityRating: qualityInfo?.rating || 'unknown',
        documentDetected: debugInfo?.documentDetected ?? false,
        perspectiveCorrected: debugInfo?.perspectiveCorrected ?? false,
        candidateCount: enhancedResult.candidateCount || 1,
        bestCandidate: enhancedResult.bestCandidate || 'unknown',
        durationMs,
      },
      'receipt.ready (enhanced OCR & extraction complete)'
    );

    return {
      receiptId,
      success: true,
      processedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logger.error({ err: err.message, receiptId, durationMs }, 'receipt.failed');

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'FAILED',
        errorCode: 'PROCESSING_FAILED',
        errorMessage: 'Receipt OCR and extraction failed. Please verify the file and retry.',
        processingCompletedAt: new Date(),
      },
    });

    throw err;
  }
}
