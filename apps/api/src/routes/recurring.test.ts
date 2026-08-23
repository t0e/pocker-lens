import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import * as authService from '../auth/service.js';

describe('Recurring Transactions & Subscriptions Endpoints (/recurring - Phase 7)', () => {
  let app: ReturnType<typeof buildApp>;

  const userA = {
    id: 'user_A_id',
    email: 'userA@example.com',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleAccount = {
    id: 'acc_1',
    userId: userA.id,
    name: 'Vietcombank',
    type: 'BANK',
    currency: 'VND',
    openingBalance: '10000000',
    currentBalance: '10000000',
    isArchived: false,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleCategory = {
    id: 'cat_ent',
    userId: null,
    name: 'Entertainment',
    type: 'EXPENSE',
    icon: 'film',
    isSystem: true,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleRecurring = {
    id: 'rec_1',
    userId: userA.id,
    type: 'EXPENSE',
    accountId: 'acc_1',
    categoryId: 'cat_ent',
    amount: '260000',
    currency: 'VND',
    description: 'Netflix',
    frequency: 'MONTHLY',
    interval: 1,
    startDate: new Date('2026-08-27T12:00:00.000Z'),
    nextRunDate: new Date('2026-08-27T12:00:00.000Z'),
    endDate: null,
    isActive: true,
    isSubscription: true,
    merchant: 'Netflix',
    notes: 'Premium 4K',
    createdAt: new Date(),
    updatedAt: new Date(),
    account: sampleAccount,
    category: sampleCategory,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any);
  });

  describe('GET /recurring', () => {
    it('returns list of recurring transactions with estimated monthly cost', async () => {
      vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([sampleRecurring] as any);

      const res = await app.inject({
        method: 'GET',
        url: '/recurring',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.recurringTransactions).toHaveLength(1);
      const item = body.recurringTransactions[0];
      expect(item.id).toBe('rec_1');
      expect(item.description).toBe('Netflix');
      expect(item.amount).toBe(260000);
      expect(item.estimatedMonthlyCost).toBe(260000);
      expect(item.isSubscription).toBe(true);
    });
  });

  describe('GET /recurring/upcoming', () => {
    it('projects upcoming occurrences within horizon without affecting balances', async () => {
      vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([sampleRecurring] as any);

      const res = await app.inject({
        method: 'GET',
        url: '/recurring/upcoming?days=35',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.upcoming.length).toBeGreaterThanOrEqual(1);
      expect(body.upcoming[0].description).toBe('Netflix');
      expect(body.upcoming[0].amount).toBe(260000);
    });
  });

  describe('GET /subscriptions', () => {
    it('returns subscriptions and estimated monthly breakdown per currency', async () => {
      vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([sampleRecurring] as any);

      const res = await app.inject({
        method: 'GET',
        url: '/subscriptions',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscriptions).toHaveLength(1);
      expect(body.monthlyEstimates.VND).toBe(260000);
    });
  });

  describe('POST /recurring', () => {
    it('creates a new recurring transaction / subscription', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(sampleAccount as any);
      vi.spyOn(prisma.category, 'findFirst').mockResolvedValue(sampleCategory as any);
      vi.spyOn(prisma.recurringTransaction, 'create').mockResolvedValue(sampleRecurring as any);

      const res = await app.inject({
        method: 'POST',
        url: '/recurring',
        headers: { authorization: 'Bearer token' },
        body: {
          type: 'EXPENSE',
          accountId: 'acc_1',
          categoryId: 'cat_ent',
          amount: 260000,
          currency: 'VND',
          description: 'Netflix',
          frequency: 'MONTHLY',
          interval: 1,
          startDate: '2026-08-27T12:00:00.000Z',
          isSubscription: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('rec_1');
      expect(body.description).toBe('Netflix');
      expect(body.isSubscription).toBe(true);
    });

    it('rejects unowned or archived account with 404', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/recurring',
        headers: { authorization: 'Bearer token' },
        body: {
          type: 'EXPENSE',
          accountId: 'unowned_acc',
          amount: 260000,
          currency: 'VND',
          description: 'Netflix',
          startDate: '2026-08-27T12:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /recurring/:id and status toggle', () => {
    it('pauses recurring item by setting isActive = false', async () => {
      vi.spyOn(prisma.recurringTransaction, 'findFirst').mockResolvedValue(sampleRecurring as any);
      vi.spyOn(prisma.recurringTransaction, 'update').mockResolvedValue({
        ...sampleRecurring,
        isActive: false,
      } as any);

      const res = await app.inject({
        method: 'PATCH',
        url: `/recurring/${sampleRecurring.id}/status`,
        headers: { authorization: 'Bearer token' },
        body: { isActive: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isActive).toBe(false);
    });
  });

  describe('DELETE /recurring/:id', () => {
    it('deletes recurring template while preserving historical transactions', async () => {
      vi.spyOn(prisma.recurringTransaction, 'findFirst').mockResolvedValue(sampleRecurring as any);
      const deleteSpy = vi.spyOn(prisma.recurringTransaction, 'delete').mockResolvedValue(sampleRecurring as any);

      const res = await app.inject({
        method: 'DELETE',
        url: `/recurring/${sampleRecurring.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: sampleRecurring.id } });
    });
  });

  describe('POST /recurring/process-due (Generation & Idempotency)', () => {
    it('generates transaction, updates balance, and advances nextRunDate', async () => {
      const dueRecurring = {
        ...sampleRecurring,
        nextRunDate: new Date('2026-08-27T00:00:00.000Z'),
      };
      vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([dueRecurring] as any);

      const mockTx = {
        recurringOccurrence: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'occ_1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        account: { update: vi.fn().mockResolvedValue({}) },
        transaction: { create: vi.fn().mockResolvedValue({ id: 'tx_gen_1' }) },
        recurringTransaction: { update: vi.fn().mockResolvedValue({}) },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const res = await app.inject({
        method: 'POST',
        url: '/recurring/process-due',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.generatedCount).toBe(1);
      expect(mockTx.account.update).toHaveBeenCalled();
      expect(mockTx.transaction.create).toHaveBeenCalled();
    });

    it('is strictly idempotent on repeat execution for same date', async () => {
      const dueRecurring = {
        ...sampleRecurring,
        nextRunDate: new Date('2026-08-27T00:00:00.000Z'),
      };
      vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([dueRecurring] as any);

      // Occurrence already exists for this date!
      const mockTx = {
        recurringOccurrence: {
          findUnique: vi.fn().mockResolvedValue({ id: 'existing_occ_1' }),
          create: vi.fn(),
          update: vi.fn(),
        },
        account: { update: vi.fn() },
        transaction: { create: vi.fn() },
        recurringTransaction: { update: vi.fn().mockResolvedValue({}) },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const res = await app.inject({
        method: 'POST',
        url: '/recurring/process-due',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.generatedCount).toBe(0);
      expect(body.skippedCount).toBe(1);
      expect(mockTx.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('Ownership & Security', () => {
    it('returns 404 when User B attempts to access User A recurring transaction', async () => {
      vi.spyOn(prisma.recurringTransaction, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/recurring/unowned_rec_id',
        headers: { authorization: 'Bearer token_user_B' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
