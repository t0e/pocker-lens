import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import * as authService from '../auth/service.js';
import * as queueService from '../queue/index.js';

describe('Receipts Endpoints (/receipts)', () => {
  let app: ReturnType<typeof buildApp>;

  const userA = {
    id: 'user_A_id',
    email: 'userA@example.com',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB = {
    id: 'user_B_id',
    email: 'userB@example.com',
    displayName: 'User B',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleReceipt = {
    id: 'receipt_123',
    userId: userA.id,
    originalFilename: 'lunch-receipt.jpg',
    storageKey: 'receipts/user_A_id/receipt_123.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    status: 'READY',
    errorCode: null,
    errorMessage: null,
    transactionId: null,
    processingStartedAt: new Date(),
    processingCompletedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any);
  });

  describe('GET /receipts (List Receipts)', () => {
    it('returns paginated receipts for authenticated user', async () => {
      vi.spyOn(prisma.receipt, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.receipt, 'findMany').mockResolvedValue([sampleReceipt] as any);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts?page=1&limit=20',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.receipts).toHaveLength(1);
      expect(body.receipts[0].id).toBe(sampleReceipt.id);
      expect(body.receipts[0].originalFilename).toBe('lunch-receipt.jpg');
      expect(body.receipts[0].status).toBe('ready');
      expect(body.pagination.total).toBe(1);
    });
  });

  describe('GET /receipts/:id (Single Receipt)', () => {
    it('returns receipt details when owned by user', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(sampleReceipt as any);

      const res = await app.inject({
        method: 'GET',
        url: `/receipts/${sampleReceipt.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(sampleReceipt.id);
      expect(body.status).toBe('ready');
    });

    it('returns 404 when receipt belongs to another user (User B)', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts/user_B_receipt_id',
        headers: { authorization: 'Bearer token_user_A' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Receipt not found');
    });
  });

  describe('DELETE /receipts/:id', () => {
    it('successfully deletes a receipt and unlinks file', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(sampleReceipt as any);
      const deleteSpy = vi.spyOn(prisma.receipt, 'delete').mockResolvedValue(sampleReceipt as any);

      const res = await app.inject({
        method: 'DELETE',
        url: `/receipts/${sampleReceipt.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: sampleReceipt.id } });
    });

    it('rejects deleting a receipt currently in PROCESSING status with 400', async () => {
      const processingReceipt = { ...sampleReceipt, status: 'PROCESSING' };
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(processingReceipt as any);

      const res = await app.inject({
        method: 'DELETE',
        url: `/receipts/${processingReceipt.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Cannot delete a receipt currently being processed');
    });
  });

  describe('POST /receipts/:id/retry', () => {
    it('retries a failed receipt by updating to QUEUED and adding to queue', async () => {
      const failedReceipt = { ...sampleReceipt, status: 'FAILED' };
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(failedReceipt as any);
      vi.spyOn(prisma.receipt, 'update').mockResolvedValue({ ...failedReceipt, status: 'QUEUED' } as any);

      const mockQueue = { add: vi.fn().mockResolvedValue({}) };
      vi.spyOn(queueService, 'getReceiptQueue').mockReturnValue(mockQueue as any);

      const res = await app.inject({
        method: 'POST',
        url: `/receipts/${failedReceipt.id}/retry`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('queued');
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('rejects retrying a non-failed receipt with 400', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(sampleReceipt as any);

      const res = await app.inject({
        method: 'POST',
        url: `/receipts/${sampleReceipt.id}/retry`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Only failed receipts can be retried');
    });
  });

  describe('GET /receipts/:id/file (Stream Receipt Image)', () => {
    it('returns 404 when receipt is not owned by user', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts/other_user_receipt/file',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Receipt not found');
    });
  });

  describe('POST /receipts (Upload Validation)', () => {
    it('rejects non-multipart requests with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/receipts',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ filename: 'test.jpg' }),
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('multipart');
    });
  });

  describe('Authentication & Ownership enforcement', () => {
    it('rejects unauthenticated requests with 401', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
