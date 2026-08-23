import { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  ReceiptResponse,
  ReceiptStatus,
  PaginatedReceiptsResponse,
  MAX_RECEIPT_FILE_SIZE,
  ALLOWED_RECEIPT_MIME_TYPES,
  validateImageMagicBytes,
} from '@pocketlens/shared';
import { createStorageProvider } from '@pocketlens/shared/server';
import { prisma } from '../db/client.js';
import { config } from '../config/env.js';
import { getReceiptQueue } from '../queue/index.js';

const storage = createStorageProvider({
  provider: config.STORAGE_PROVIDER,
  localBasePath: config.RECEIPT_STORAGE_PATH,
});

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
    createdAt: receipt.createdAt instanceof Date ? receipt.createdAt.toISOString() : receipt.createdAt,
    updatedAt: receipt.updatedAt instanceof Date ? receipt.updatedAt.toISOString() : receipt.updatedAt,
  };
}

export const receiptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /receipts (Multipart Upload + Validation + Queueing)
  fastify.post('/receipts', async (request, reply) => {
    const userId = request.user.id;

    // Check if multipart data is present
    if (!request.isMultipart()) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Request must be multipart/form-data',
      });
    }

    const data = await request.file({
      limits: {
        fileSize: MAX_RECEIPT_FILE_SIZE,
      },
    });

    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'No file uploaded',
      });
    }

    const originalFilename = data.filename || 'receipt.jpg';
    const providedMimeType = data.mimetype;

    // 1. Validate MIME Type against allowed list
    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(providedMimeType as any)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Unsupported file type: ${providedMimeType}. Allowed types: ${ALLOWED_RECEIPT_MIME_TYPES.join(', ')}`,
      });
    }

    // 2. Read file buffer
    const buffer = await data.toBuffer();

    // 3. Validate file size and non-empty
    if (!buffer || buffer.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Uploaded file is empty',
      });
    }

    if (buffer.length > MAX_RECEIPT_FILE_SIZE) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `File size exceeds maximum allowed limit of ${MAX_RECEIPT_FILE_SIZE / (1024 * 1024)}MB`,
      });
    }

    // 4. Validate magic bytes (genuine image header detection)
    const magicCheck = validateImageMagicBytes(buffer);
    if (!magicCheck.valid) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid image format: file contents do not match supported image signatures',
      });
    }

    const detectedMime = magicCheck.detectedMimeType || providedMimeType;
    let ext = '.jpg';
    if (detectedMime === 'image/png') ext = '.png';
    else if (detectedMime === 'image/webp') ext = '.webp';

    const receiptId = crypto.randomUUID();
    const storageKey = `receipts/${userId}/${receiptId}${ext}`;

    let savedFile = false;

    try {
      // 5. Save to storage provider
      await storage.saveFile(storageKey, buffer);
      savedFile = true;

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
      });

      // 7. Enqueue background job to BullMQ
      try {
        const queue = getReceiptQueue();
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
          }
        );

        // Transition to QUEUED
        const queuedReceipt = await prisma.receipt.update({
          where: { id: receipt.id },
          data: { status: 'QUEUED' },
        });

        fastify.log.info({ receiptId: receipt.id, userId }, 'receipt.uploaded & receipt.queued');
        return reply.status(201).send(formatReceiptResponse(queuedReceipt));
      } catch (queueErr) {
        fastify.log.error({ err: queueErr, receiptId: receipt.id }, 'Failed to enqueue receipt job, keeping in UPLOADED state');
        return reply.status(201).send(formatReceiptResponse(receipt));
      }
    } catch (err) {
      if (savedFile) {
        try {
          await storage.deleteFile(storageKey);
        } catch {
          // Ignore cleanup error
        }
      }
      throw err;
    }
  });

  // GET /receipts (Paginated user receipts list)
  fastify.get('/receipts', async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      status?: string;
    };

    const userId = request.user.id;
    const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
      ...(query.status && ['uploaded', 'queued', 'processing', 'ready', 'failed'].includes(query.status)
        ? { status: query.status.toUpperCase() }
        : {}),
    };

    const [total, receipts] = await Promise.all([
      prisma.receipt.count({ where }),
      prisma.receipt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const response: PaginatedReceiptsResponse = {
      receipts: receipts.map(formatReceiptResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    return reply.send(response);
  });

  // GET /receipts/:id (Single receipt metadata)
  fastify.get<{ Params: { id: string } }>('/receipts/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    });

    if (!receipt) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Receipt not found',
      });
    }

    return reply.send(formatReceiptResponse(receipt));
  });

  // GET /receipts/:id/file (Stream receipt image file to authenticated owner)
  fastify.get<{ Params: { id: string } }>('/receipts/:id/file', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    });

    if (!receipt) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Receipt not found',
      });
    }

    try {
      const fileBuffer = await storage.getFile(receipt.storageKey);

      reply.header('Content-Type', receipt.mimeType);
      reply.header('Content-Length', fileBuffer.length);
      reply.header('Cache-Control', 'private, max-age=3600');
      reply.header('Content-Disposition', `inline; filename="${receipt.originalFilename}"`);

      return reply.send(fileBuffer);
    } catch (err) {
      fastify.log.error({ err, receiptId: id }, 'Failed to read receipt file from storage');
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Receipt image file not found on storage',
      });
    }
  });

  // DELETE /receipts/:id (Delete DB record and storage file)
  fastify.delete<{ Params: { id: string } }>('/receipts/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    });

    if (!receipt) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Receipt not found',
      });
    }

    if (receipt.status === 'PROCESSING') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Cannot delete a receipt currently being processed',
      });
    }

    // Delete DB record
    await prisma.receipt.delete({
      where: { id },
    });

    // Delete file from storage
    try {
      await storage.deleteFile(receipt.storageKey);
    } catch (err) {
      fastify.log.warn({ err, storageKey: receipt.storageKey }, 'Failed to unlink stored receipt file');
    }

    return reply.send({
      success: true,
      message: 'Receipt deleted successfully',
    });
  });

  // POST /receipts/:id/retry (Re-enqueue failed receipt)
  fastify.post<{ Params: { id: string } }>('/receipts/:id/retry', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const receipt = await prisma.receipt.findFirst({
      where: { id, userId },
    });

    if (!receipt) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Receipt not found',
      });
    }

    if (receipt.status !== 'FAILED') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Only failed receipts can be retried',
      });
    }

    const queue = getReceiptQueue();
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
      }
    );

    const updated = await prisma.receipt.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorCode: null,
        errorMessage: null,
      },
    });

    return reply.send(formatReceiptResponse(updated));
  });
};
