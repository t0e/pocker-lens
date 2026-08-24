import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import * as authService from '../auth/service.js';
import * as queueService from '../queue/index.js';

describe('Receipts Endpoints (/receipts - Phase 6)', () => {
  let app: ReturnType<typeof buildApp>;

  const userA = {
    id: 'user_A_id',
    email: 'userA@example.com',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleExtraction = {
    id: 'ext_1',
    receiptId: 'receipt_123',
    merchant: 'Highlands Coffee',
    transactionDate: new Date('2026-08-24T12:00:00.000Z'),
    totalAmount: '80000',
    currency: 'VND',
    categoryId: 'cat_food',
    accountId: 'acc_cash',
    rawText: 'HIGHLANDS COFFEE\nCà phê sữa đá 45.000\nBánh mì 35.000\nTỔNG CỘNG 80.000 VNĐ',
    detectedLanguage: 'vi',
    confidence: '95',
    fieldConfidences: {
      merchant: 'high',
      transactionDate: 'high',
      totalAmount: 'high',
      currency: 'high',
      category: 'high',
      account: 'low',
    },
    status: 'PENDING_REVIEW',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item_1',
        extractionId: 'ext_1',
        description: 'Cà phê sữa đá',
        quantity: '1',
        unitPrice: '45000',
        totalPrice: '45000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'item_2',
        extractionId: 'ext_1',
        description: 'Bánh mì',
        quantity: '1',
        unitPrice: '35000',
        totalPrice: '35000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    category: { id: 'cat_food', name: 'Food & Drink' },
    account: { id: 'acc_cash', name: 'Cash' },
  };

  const sampleReceipt = {
    id: 'receipt_123',
    userId: userA.id,
    originalFilename: 'highlands-receipt.jpg',
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
    extraction: sampleExtraction,
  };

  const sampleAccount = {
    id: 'acc_cash',
    userId: userA.id,
    name: 'Cash Wallet',
    type: 'CASH',
    currency: 'VND',
    openingBalance: '1000000',
    currentBalance: '1000000',
    isArchived: false,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any);
  });

  describe('GET /receipts (List Receipts with Extractions)', () => {
    it('returns paginated receipts with extractions and items', async () => {
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
      expect(body.receipts[0].extraction).toBeDefined();
      expect(body.receipts[0].extraction.merchant).toBe('Highlands Coffee');
      expect(body.receipts[0].extraction.totalAmount).toBe(80000);
      expect(body.receipts[0].extraction.items).toHaveLength(2);
    });
  });

  describe('GET /receipts/:id/extraction', () => {
    it('returns extraction draft details', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(sampleReceipt as any);

      const res = await app.inject({
        method: 'GET',
        url: `/receipts/${sampleReceipt.id}/extraction`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.merchant).toBe('Highlands Coffee');
      expect(body.totalAmount).toBe(80000);
      expect(body.currency).toBe('VND');
      expect(body.items).toHaveLength(2);
    });

    it('returns 404 when receipt belongs to another user', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts/unowned_receipt_id/extraction',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /receipts/:id/confirm (Create Transaction from Receipt)', () => {
    it('creates transaction, adjusts account balance, links receipt, and updates extraction status', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(sampleReceipt as any);
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(sampleAccount as any);
      vi.spyOn(prisma.category, 'findFirst').mockResolvedValue({ id: 'cat_food', name: 'Food & Drink' } as any);

      const createdTransaction = {
        id: 'tx_confirmed_1',
        userId: userA.id,
        type: 'EXPENSE',
        accountId: 'acc_cash',
        categoryId: 'cat_food',
        amount: '80000',
        currency: 'VND',
        transactionDate: new Date('2026-08-24T12:00:00.000Z'),
        description: 'Highlands Coffee',
        merchant: 'Highlands Coffee',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        account: sampleAccount,
        category: {
          id: 'cat_food',
          userId: null,
          name: 'Food & Drink',
          type: 'EXPENSE',
          icon: null,
          isSystem: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const mockTx = {
        account: { update: vi.fn().mockResolvedValue({}) },
        transaction: { create: vi.fn().mockResolvedValue(createdTransaction) },
        receipt: {
          update: vi.fn().mockResolvedValue({ ...sampleReceipt, transactionId: 'tx_confirmed_1' }),
        },
        receiptExtraction: { update: vi.fn().mockResolvedValue({}) },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const res = await app.inject({
        method: 'POST',
        url: `/receipts/${sampleReceipt.id}/confirm`,
        headers: { authorization: 'Bearer token' },
        body: {
          type: 'EXPENSE',
          accountId: 'acc_cash',
          categoryId: 'cat_food',
          amount: 80000,
          currency: 'VND',
          transactionDate: '2026-08-24T12:00:00.000Z',
          description: 'Highlands Coffee',
          merchant: 'Highlands Coffee',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.transaction.id).toBe('tx_confirmed_1');
      expect(body.receipt.transactionId).toBe('tx_confirmed_1');
      expect(mockTx.account.update).toHaveBeenCalled();
      expect(mockTx.transaction.create).toHaveBeenCalled();
      expect(mockTx.receiptExtraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'CONFIRMED' },
        })
      );
    });

    it('rejects duplicate confirmation if receipt already has a transaction (400 Bad Request)', async () => {
      const alreadyConfirmedReceipt = { ...sampleReceipt, transactionId: 'tx_already_created' };
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(alreadyConfirmedReceipt as any);

      const res = await app.inject({
        method: 'POST',
        url: `/receipts/${alreadyConfirmedReceipt.id}/confirm`,
        headers: { authorization: 'Bearer token' },
        body: {
          type: 'EXPENSE',
          accountId: 'acc_cash',
          amount: 80000,
          currency: 'VND',
          transactionDate: '2026-08-24T12:00:00.000Z',
          description: 'Highlands Coffee',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('already been confirmed');
    });
  });

  describe('POST /receipts/:id/reprocess', () => {
    it('re-enqueues receipt for extraction when not confirmed', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(sampleReceipt as any);
      vi.spyOn(prisma.receipt, 'update').mockResolvedValue({ ...sampleReceipt, status: 'QUEUED' } as any);

      const mockQueue = { add: vi.fn().mockResolvedValue({}) };
      vi.spyOn(queueService, 'getReceiptQueue').mockReturnValue(mockQueue as any);

      const res = await app.inject({
        method: 'POST',
        url: `/receipts/${sampleReceipt.id}/reprocess`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('queued');
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('rejects reprocessing if receipt is already linked to a transaction', async () => {
      const confirmedReceipt = { ...sampleReceipt, transactionId: 'tx_existing' };
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(confirmedReceipt as any);

      const res = await app.inject({
        method: 'POST',
        url: `/receipts/${confirmedReceipt.id}/reprocess`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('already linked');
    });
  });

  describe('GET /receipts/:id/file', () => {
    it('rejects unauthenticated file retrieval with 401', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: `/receipts/${sampleReceipt.id}/file`,
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 404 when receipt does not exist or belongs to another user', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts/unknown_id/file',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(404);
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

  describe('Ownership & Security', () => {
    it('rejects unauthenticated requests with 401', async () => {
      vi.spyOn(authService, 'validateSession').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts',
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 404 when User B attempts to access User A receipt details', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts/user_A_receipt',
        headers: { authorization: 'Bearer token_user_B' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when User B attempts to access User A receipt image file', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/receipts/user_A_receipt/file',
        headers: { authorization: 'Bearer token_user_B' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when User B attempts to confirm User A receipt', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/receipts/user_A_receipt/confirm',
        headers: { authorization: 'Bearer token_user_B' },
        body: {
          type: 'EXPENSE',
          accountId: 'acc_cash',
          amount: 80000,
          currency: 'VND',
          transactionDate: '2026-08-24T12:00:00.000Z',
          description: 'Highlands Coffee',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Receipt not found');
    });

    it('returns 404 when User B attempts to reprocess User A receipt', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/receipts/user_A_receipt/reprocess',
        headers: { authorization: 'Bearer token_user_B' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when User B attempts to delete User A receipt', async () => {
      vi.spyOn(prisma.receipt, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'DELETE',
        url: '/receipts/user_A_receipt',
        headers: { authorization: 'Bearer token_user_B' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
