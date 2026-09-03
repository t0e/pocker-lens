import { Job } from 'bullmq'
import pino from 'pino'
import {
  ReceiptJobData,
  ReceiptJobResult,
  validateImageMagicBytes,
  extractReceiptData,
  OCRProvider,
} from '@pocketlens/shared'
import { createStorageProvider } from '@pocketlens/shared/server'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { config } from '../config/env.js'
import { LocalOCRProvider, EnhancedOCRResult } from '../ocr/local.js'

const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
})

const storage = createStorageProvider({
  provider: config.STORAGE_PROVIDER,
  localBasePath: config.RECEIPT_STORAGE_PATH,
})

let ocrProvider: OCRProvider = new LocalOCRProvider()

export function getMemoryStats(): {
  rss: number
  heapUsed: number
  heapTotal: number
  external: number
  arrayBuffers: number
} {
  const m = process.memoryUsage()
  return {
    rss: Math.round((m.rss / 1048576) * 10) / 10,
    heapUsed: Math.round((m.heapUsed / 1048576) * 10) / 10,
    heapTotal: Math.round((m.heapTotal / 1048576) * 10) / 10,
    external: Math.round((m.external / 1048576) * 10) / 10,
    arrayBuffers: Math.round((m.arrayBuffers / 1048576) * 10) / 10,
  }
}

export function formatMemUsage(stage: string): string {
  const m = getMemoryStats()
  return `[${stage}] rss=${m.rss}MB heapUsed=${m.heapUsed}MB heapTotal=${m.heapTotal}MB ext=${m.external}MB arrayBuffers=${m.arrayBuffers}MB`
}

export function setOCRProvider(provider: OCRProvider) {
  ocrProvider = provider
}

async function loadAndValidateReceiptImage(
  storageKey: string,
  receiptId: string,
): Promise<Buffer> {
  const exists = await storage.exists(storageKey)
  if (!exists) {
    throw new Error(
      `Receipt image file not found on disk at storage key: ${storageKey}`,
    )
  }

  const fileBuffer = await storage.getFile(storageKey)
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Stored receipt image file is empty or corrupted')
  }

  logger.info(
    {
      receiptId,
      sizeKB: Math.round(fileBuffer.length / 1024),
      mem: getMemoryStats(),
    },
    formatMemUsage('after.file-read'),
  )

  const magicCheck = validateImageMagicBytes(fileBuffer)
  if (!magicCheck.valid) {
    throw new Error('Stored receipt file failed signature verification')
  }

  return fileBuffer
}

function assembleFieldConfidencesMetadata(
  fieldConfidences: unknown,
  qualityInfo: EnhancedOCRResult['quality'],
  debugInfo: EnhancedOCRResult['debug'],
  bestCandidate: string | undefined,
): Prisma.InputJsonValue {
  const base =
    typeof fieldConfidences === 'object' && fieldConfidences !== null
      ? fieldConfidences
      : {}
  return {
    ...base,
    ...(qualityInfo
      ? {
          imageQuality: {
            rating: qualityInfo.rating,
            brightness: Math.round(qualityInfo.brightness),
            contrast: Math.round(qualityInfo.contrast),
            sharpness: Math.round(qualityInfo.sharpness),
            resolution: `${qualityInfo.width}x${qualityInfo.height}`,
            issues: qualityInfo.details,
          },
        }
      : {}),
    ...(debugInfo
      ? {
          ocrPipeline: {
            documentDetected: debugInfo.documentDetected,
            documentConfidence:
              Math.round(debugInfo.documentConfidence * 100) / 100,
            documentAreaPercent: Math.round(
              debugInfo.documentAreaFraction * 100,
            ),
            perspectiveCorrected: debugInfo.perspectiveCorrected,
            originalDimensions: debugInfo.originalDimensions,
            croppedDimensions: debugInfo.croppedDimensions,
            candidates: debugInfo.candidateLabels,
            bestCandidate: bestCandidate || 'unknown',
          },
        }
      : {}),
  } as Prisma.InputJsonValue
}

async function persistReceiptExtractionResults(
  receiptId: string,
  oldExtractionId: string | undefined,
  extracted: ReturnType<typeof extractReceiptData>,
  fieldConfidencesJson: Prisma.InputJsonValue,
  defaultAccountId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (oldExtractionId) {
      await tx.receiptItem.deleteMany({
        where: { extractionId: oldExtractionId },
      })
      await tx.receiptExtraction.delete({
        where: { id: oldExtractionId },
      })
    }

    await tx.receiptExtraction.create({
      data: {
        receiptId,
        merchant: extracted.merchant,
        transactionDate: extracted.transactionDate,
        totalAmount:
          extracted.totalAmount !== null ? extracted.totalAmount : undefined,
        currency: extracted.currency,
        categoryId: extracted.suggestedCategoryId || null,
        accountId: defaultAccountId,
        rawText: extracted.rawText,
        detectedLanguage: extracted.detectedLanguage,
        confidence: extracted.confidence,
        fieldConfidences: fieldConfidencesJson,
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
    })

    await tx.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'READY',
        processingCompletedAt: new Date(),
      },
    })
  })
}

async function handleReceiptProcessingError(
  receiptId: string,
  startTime: number,
  err: unknown,
): Promise<never> {
  const durationMs = Date.now() - startTime
  const message = err instanceof Error ? err.message : String(err)
  logger.error(
    { err: message, receiptId, durationMs, mem: getMemoryStats() },
    'receipt.failed',
  )

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: 'FAILED',
      errorCode: 'PROCESSING_FAILED',
      errorMessage:
        'Receipt OCR and extraction failed. Please verify the file and retry.',
      processingCompletedAt: new Date(),
    },
  })

  throw err
}

export async function processReceiptJob(
  job: Job<ReceiptJobData, ReceiptJobResult>,
): Promise<ReceiptJobResult> {
  const { receiptId } = job.data
  const startTime = Date.now()

  logger.info(
    { receiptId, jobId: job.id, mem: getMemoryStats() },
    formatMemUsage('job.start'),
  )

  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      user: {
        include: {
          categories: { where: { isArchived: false } },
          accounts: { where: { isArchived: false } },
        },
      },
      extraction: { include: { items: true } },
    },
  })

  if (!receipt) {
    logger.warn({ receiptId }, 'Receipt record not found in database for job')
    return { receiptId, success: false, processedAt: new Date().toISOString() }
  }

  if (receipt.status === 'READY' && receipt.extraction) {
    logger.info(
      { receiptId },
      'Receipt already processed and READY. Idempotent skip.',
    )
    return { receiptId, success: true, processedAt: new Date().toISOString() }
  }

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  })

  try {
    const fileBuffer = await loadAndValidateReceiptImage(
      receipt.storageKey,
      receiptId,
    )

    logger.info({ receiptId }, formatMemUsage('before.ocr'))
    const ocrResult = await ocrProvider.extractText(
      fileBuffer,
      receipt.mimeType,
    )
    logger.info(
      { receiptId, mem: getMemoryStats() },
      formatMemUsage('after.ocr'),
    )

    const enhancedResult = ocrResult as EnhancedOCRResult
    const userCategories = receipt.user.categories.map((c) => ({
      id: c.id,
      name: c.name,
    }))
    const defaultAccount =
      receipt.user.accounts.find((a) => a.isDefault) || receipt.user.accounts[0]

    const extracted = extractReceiptData(ocrResult.rawText, {
      userCategories,
      defaultCurrency: defaultAccount?.currency || 'VND',
    })

    const fieldConfidencesWithQuality = assembleFieldConfidencesMetadata(
      extracted.fieldConfidences,
      enhancedResult.quality,
      enhancedResult.debug,
      enhancedResult.bestCandidate,
    )

    await persistReceiptExtractionResults(
      receipt.id,
      receipt.extraction?.id,
      extracted,
      fieldConfidencesWithQuality,
      defaultAccount?.id || null,
    )

    const durationMs = Date.now() - startTime
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
        durationMs,
        mem: getMemoryStats(),
      },
      formatMemUsage('job.end'),
    )

    return { receiptId, success: true, processedAt: new Date().toISOString() }
  } catch (err) {
    return await handleReceiptProcessingError(receiptId, startTime, err)
  }
}
