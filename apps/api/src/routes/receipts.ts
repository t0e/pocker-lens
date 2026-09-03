import { FastifyPluginAsync } from 'fastify'
import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import {
  ReceiptResponse,
  ReceiptStatus,
  ReceiptExtractionResponse,
  ReceiptItemResponse,
  PaginatedReceiptsResponse,
  MAX_RECEIPT_FILE_SIZE,
  ALLOWED_RECEIPT_MIME_TYPES,
  validateImageMagicBytes,
  ConfirmReceiptDraftSchema,
} from '@pocketlens/shared'
import { createStorageProvider } from '@pocketlens/shared/server'
import { prisma } from '../db/client.js'
import { config } from '../config/env.js'
import { getReceiptQueue } from '../queue/index.js'
import { formatTransactionResponse } from './transactions.js'

const storage = createStorageProvider({
  provider: config.STORAGE_PROVIDER,
  localBasePath: config.RECEIPT_STORAGE_PATH,
})

export function formatExtractionResponse(
  extraction: any,
): ReceiptExtractionResponse {
  const items: ReceiptItemResponse[] = (extraction.items || []).map(
    (item: any) => ({
      id: item.id,
      extractionId: item.extractionId,
      description: item.description,
      quantity:
        item.quantity !== null && item.quantity !== undefined
          ? parseFloat(item.quantity.toString())
          : null,
      unitPrice:
        item.unitPrice !== null && item.unitPrice !== undefined
          ? parseFloat(item.unitPrice.toString())
          : null,
      totalPrice:
        item.totalPrice !== null && item.totalPrice !== undefined
          ? parseFloat(item.totalPrice.toString())
          : null,
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : item.createdAt,
      updatedAt:
        item.updatedAt instanceof Date
          ? item.updatedAt.toISOString()
          : item.updatedAt,
    }),
  )

  const fieldConfidences = extraction.fieldConfidences || {
    merchant: 'none',
    transactionDate: 'none',
    totalAmount: 'none',
    currency: 'none',
    category: 'none',
    account: 'none',
  }

  return {
    id: extraction.id,
    receiptId: extraction.receiptId,
    merchant: extraction.merchant,
    transactionDate: extraction.transactionDate
      ? extraction.transactionDate instanceof Date
        ? extraction.transactionDate.toISOString()
        : extraction.transactionDate
      : null,
    totalAmount:
      extraction.totalAmount !== null && extraction.totalAmount !== undefined
        ? parseFloat(extraction.totalAmount.toString())
        : null,
    currency: extraction.currency,
    categoryId: extraction.categoryId,
    accountId: extraction.accountId,
    rawText: extraction.rawText,
    detectedLanguage: extraction.detectedLanguage,
    confidence:
      extraction.confidence !== null && extraction.confidence !== undefined
        ? parseFloat(extraction.confidence.toString())
        : null,
    fieldConfidences,
    status: extraction.status,
    createdAt:
      extraction.createdAt instanceof Date
        ? extraction.createdAt.toISOString()
        : extraction.createdAt,
    updatedAt:
      extraction.updatedAt instanceof Date
        ? extraction.updatedAt.toISOString()
        : extraction.updatedAt,
    items,
    suggestedCategoryName: extraction.category
      ? extraction.category.name
      : undefined,
    suggestedAccountName: extraction.account
      ? extraction.account.name
      : undefined,
  }
}

export function formatReceiptResponse(receipt: any): ReceiptResponse {
  return {
    id: receipt.id,
    userId: receipt.userId,
    originalFilename: receipt.originalFilename,
    mimeType: receipt.mimeType,
    fileSize: receipt.fileSize,
    status: receipt.status.toLowerCase() as ReceiptStatus,
    errorCode: receipt.errorCode,
    errorMessage: receipt.errorMessage,
    transactionId: receipt.transactionId,
    processingStartedAt: receipt.processingStartedAt
      ? receipt.processingStartedAt instanceof Date
        ? receipt.processingStartedAt.toISOString()
        : receipt.processingStartedAt
      : null,
    processingCompletedAt: receipt.processingCompletedAt
      ? receipt.processingCompletedAt instanceof Date
        ? receipt.processingCompletedAt.toISOString()
        : receipt.processingCompletedAt
      : null,
    createdAt:
      receipt.createdAt instanceof Date
        ? receipt.createdAt.toISOString()
        : receipt.createdAt,
    updatedAt:
      receipt.updatedAt instanceof Date
        ? receipt.updatedAt.toISOString()
        : receipt.updatedAt,
    extraction: receipt.extraction
      ? formatExtractionResponse(receipt.extraction)
      : null,
  }
}

export const receiptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  // POST /receipts (Multipart Upload + Validation + Queueing)
  fastify.post('/receipts', async (request, reply) => {
    const userId = request.user.id

    // Check if multipart data is present
    if (!request.isMultipart()) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request must be multipart/form-data',
      })
    }

    const data = await request.file({
      limits: {
        fileSize: MAX_RECEIPT_FILE_SIZE,
      },
    })

    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No file uploaded',
      })
    }

    const originalFilename = data.filename || 'receipt.jpg'
    const providedMimeType = data.mimetype

    // 1. Validate MIME Type against allowed list
    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(providedMimeType as any)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Unsupported file type: ${providedMimeType}. Allowed types: ${ALLOWED_RECEIPT_MIME_TYPES.join(', ')}`,
      })
    }

    // 2. Read file buffer
    const buffer = await data.toBuffer()

    // 3. Validate file size and non-empty
    if (!buffer || buffer.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Uploaded file is empty',
      })
    }

    if (buffer.length > MAX_RECEIPT_FILE_SIZE) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `File size exceeds maximum allowed limit of ${MAX_RECEIPT_FILE_SIZE / (1024 * 1024)}MB`,
      })
    }

    // 4. Validate magic bytes (genuine image header detection)
    const magicCheck = validateImageMagicBytes(buffer)
    if (!magicCheck.valid) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message:
          'Invalid image format: file contents do not match supported image signatures',
      })
    }

    const detectedMime = magicCheck.detectedMimeType || providedMimeType
    let ext = '.jpg'
    if (detectedMime === 'image/png') ext = '.png'
    else if (detectedMime === 'image/webp') ext = '.webp'

    const receiptId = crypto.randomUUID()
    const storageKey = `receipts/${userId}/${receiptId}${ext}`

    let savedFile = false

    try {
      // 5. Save to storage provider
      await storage.saveFile(storageKey, buffer)
      savedFile = true

      // 6. Create database record
      const receipt = await prisma.receipt.create({
        data: {
          id: receiptId,
          userId,
          originalFilename,
          storageKey,
          mimeType: detectedMime,
          fileSize: buffer.length,
          status: 'UPLOADED',
        },
      })

      // 7. Enqueue background job to BullMQ
      try {
        const queue = getReceiptQueue()
        await queue.add(
          'process-receipt',
          {
            receiptId: receipt.id,
            fileKey: storageKey,
            mimeType: detectedMime,
            userId,
            createdAt: new Date().toISOString(),
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: true,
          },
        )

        // Transition to QUEUED
        const queuedReceipt = await prisma.receipt.update({
          where: { id: receipt.id },
          data: { status: 'QUEUED' },
          include: {
            extraction: {
              include: { items: true, category: true, account: true },
            },
          },
        })

        fastify.log.info(
          { receiptId: receipt.id, userId },
          'receipt.uploaded & receipt.queued',
        )
        return reply.status(201).send(formatReceiptResponse(queuedReceipt))
      } catch (queueErr) {
        fastify.log.error(
          { err: queueErr, receiptId: receipt.id },
          'Failed to enqueue receipt job, keeping in UPLOADED state',
        )
        return reply.status(201).send(formatReceiptResponse(receipt))
      }
    } catch (err) {
      if (savedFile) {
        try {
          await storage.deleteFile(storageKey)
        } catch {
          // Ignore cleanup error
        }
      }
      throw err
    }
  })

  // GET /receipts (Paginated user receipts list)
  fastify.get('/receipts', async (request, reply) => {
    const query = request.query as {
      page?: string
      limit?: string
      status?: string
    }

    const userId = request.user.id
    const page = Math.max(parseInt(query.page || '1', 10) || 1, 1)
    const limit = Math.min(
      Math.max(parseInt(query.limit || '20', 10) || 20, 1),
      100,
    )
    const skip = (page - 1) * limit

    const where: any = {
      userId,
      ...(query.status &&
      ['uploaded', 'queued', 'processing', 'ready', 'failed'].includes(
        query.status,
      )
        ? { status: query.status.toUpperCase() }
        : {}),
    }

    const [total, receipts] = await Promise.all([
      prisma.receipt.count({ where }),
      prisma.receipt.findMany({
        where,
        include: {
          extraction: {
            include: { items: true, category: true, account: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    const response: PaginatedReceiptsResponse = {
      receipts: receipts.map(formatReceiptResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    }

    return reply.send(response)
  })

  // GET /receipts/:id (Single receipt with extraction)
  fastify.get<{ Params: { id: string } }>(
    '/receipts/:id',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
        include: {
          extraction: {
            include: { items: true, category: true, account: true },
          },
        },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      return reply.send(formatReceiptResponse(receipt))
    },
  )

  // GET /receipts/:id/extraction (Get only extraction draft)
  fastify.get<{ Params: { id: string } }>(
    '/receipts/:id/extraction',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
        include: {
          extraction: {
            include: { items: true, category: true, account: true },
          },
        },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      if (!receipt.extraction) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt extraction draft not available yet',
        })
      }

      return reply.send(formatExtractionResponse(receipt.extraction))
    },
  )

  // POST /receipts/:id/confirm (Confirm extraction draft and create transaction)
  fastify.post<{ Params: { id: string } }>(
    '/receipts/:id/confirm',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const parseResult = ConfirmReceiptDraftSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid transaction confirmation payload',
          details: parseResult.error.format(),
        })
      }

      const {
        type,
        accountId,
        categoryId,
        amount,
        currency,
        transactionDate,
        description,
        merchant,
        notes,
      } = parseResult.data

      // 1. Fetch receipt and verify ownership
      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
        include: { extraction: true },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      // 2. Prevent duplicate confirmation
      if (receipt.transactionId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message:
            'Receipt has already been confirmed and linked to a transaction',
        })
      }

      // 3. Verify Account
      const account = await prisma.account.findFirst({
        where: { id: accountId, userId, isArchived: false },
      })

      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Selected account not found',
        })
      }

      // 4. Verify Category if provided
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: {
            id: categoryId,
            OR: [{ isSystem: true }, { userId }],
            isArchived: false,
          },
        })

        if (!category) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Selected category not found',
          })
        }
      }

      const amountDecimal = new Prisma.Decimal(amount)
      const dateObj = new Date(transactionDate)

      // 5. Create Transaction and Link Receipt in single atomic transaction
      const { createdTx, updatedReceipt } = await prisma.$transaction(
        async (tx) => {
          // Balance adjustment
          let balanceChange = new Prisma.Decimal(0)
          if (type === 'EXPENSE') {
            balanceChange = amountDecimal.negated()
          } else if (type === 'INCOME') {
            balanceChange = amountDecimal
          }

          await tx.account.update({
            where: { id: accountId },
            data: {
              currentBalance: {
                increment: balanceChange,
              },
            },
          })

          // Create transaction
          const transaction = await tx.transaction.create({
            data: {
              userId,
              type: type as any,
              accountId,
              categoryId: categoryId || null,
              amount: amountDecimal,
              currency,
              transactionDate: dateObj,
              description,
              merchant: merchant || null,
              notes: notes || null,
            },
            include: {
              account: true,
              category: true,
            },
          })

          // Link receipt and update extraction status
          const updatedR = await tx.receipt.update({
            where: { id },
            data: {
              transactionId: transaction.id,
            },
            include: {
              extraction: {
                include: { items: true, category: true, account: true },
              },
            },
          })

          if (receipt.extraction) {
            await tx.receiptExtraction.update({
              where: { id: receipt.extraction.id },
              data: { status: 'CONFIRMED' },
            })
          }

          return { createdTx: transaction, updatedReceipt: updatedR }
        },
      )

      fastify.log.info(
        { receiptId: id, transactionId: createdTx.id, userId, amount },
        'receipt.confirmed -> transaction.created',
      )

      return reply.status(201).send({
        transaction: formatTransactionResponse(createdTx),
        receipt: formatReceiptResponse(updatedReceipt),
      })
    },
  )

  // POST /receipts/:id/reprocess (Re-enqueue receipt for OCR & extraction)
  fastify.post<{ Params: { id: string } }>(
    '/receipts/:id/reprocess',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      if (receipt.transactionId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message:
            'Cannot reprocess receipt that is already linked to a confirmed transaction',
        })
      }

      if (receipt.status === 'PROCESSING') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Receipt is currently being processed',
        })
      }

      const queue = getReceiptQueue()
      await queue.add(
        'process-receipt',
        {
          receiptId: receipt.id,
          fileKey: receipt.storageKey,
          mimeType: receipt.mimeType,
          userId,
          createdAt: new Date().toISOString(),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        },
      )

      const updated = await prisma.receipt.update({
        where: { id },
        data: {
          status: 'QUEUED',
          errorCode: null,
          errorMessage: null,
        },
        include: {
          extraction: {
            include: { items: true, category: true, account: true },
          },
        },
      })

      return reply.send(formatReceiptResponse(updated))
    },
  )

  // GET /receipts/:id/file (Stream receipt image file to authenticated owner)
  fastify.get<{ Params: { id: string } }>(
    '/receipts/:id/file',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      try {
        const fileBuffer = await storage.getFile(receipt.storageKey)

        reply.header('Content-Type', receipt.mimeType)
        reply.header('Content-Length', fileBuffer.length)
        reply.header('Cache-Control', 'private, max-age=3600')
        reply.header(
          'Content-Disposition',
          `inline; filename="${receipt.originalFilename}"`,
        )

        return reply.send(fileBuffer)
      } catch (err) {
        fastify.log.error(
          { err, receiptId: id },
          'Failed to read receipt file from storage',
        )
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt image file not found on storage',
        })
      }
    },
  )

  // DELETE /receipts/:id (Delete DB record and storage file)
  fastify.delete<{ Params: { id: string } }>(
    '/receipts/:id',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      if (receipt.status === 'PROCESSING') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot delete a receipt currently being processed',
        })
      }

      // Delete DB record (cascades to receipt_extractions and receipt_items)
      await prisma.receipt.delete({
        where: { id },
      })

      // Delete file from storage
      try {
        await storage.deleteFile(receipt.storageKey)
      } catch (err) {
        fastify.log.warn(
          { err, storageKey: receipt.storageKey },
          'Failed to unlink stored receipt file',
        )
      }

      return reply.send({
        success: true,
        message: 'Receipt deleted successfully',
      })
    },
  )

  // POST /receipts/:id/retry (Re-enqueue failed receipt)
  fastify.post<{ Params: { id: string } }>(
    '/receipts/:id/retry',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const receipt = await prisma.receipt.findFirst({
        where: { id, userId },
      })

      if (!receipt) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Receipt not found',
        })
      }

      if (receipt.status !== 'FAILED') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only failed receipts can be retried',
        })
      }

      const queue = getReceiptQueue()
      await queue.add(
        'process-receipt',
        {
          receiptId: receipt.id,
          fileKey: receipt.storageKey,
          mimeType: receipt.mimeType,
          userId,
          createdAt: new Date().toISOString(),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        },
      )

      const updated = await prisma.receipt.update({
        where: { id },
        data: {
          status: 'QUEUED',
          errorCode: null,
          errorMessage: null,
        },
        include: {
          extraction: {
            include: { items: true, category: true, account: true },
          },
        },
      })

      return reply.send(formatReceiptResponse(updated))
    },
  )
}
