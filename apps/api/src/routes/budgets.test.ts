import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import * as authService from '../auth/service.js';

describe('Budgets Endpoints (/budgets - Phase 7)', () => {
  let app: ReturnType<typeof buildApp>;

  const userA = {
    id: 'user_A_id',
    email: 'userA@example.com',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleFoodCategory = {
    id: 'cat_food',
    userId: null,
    name: 'Food & Drink',
    type: 'EXPENSE',
    icon: 'utensils',
    isSystem: true,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleSalaryCategory = {
    id: 'cat_salary',
    userId: null,
    name: 'Salary',
    type: 'INCOME',
    icon: 'wallet',
    isSystem: true,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleBudget = {
    id: 'budget_1',
    userId: userA.id,
    categoryId: 'cat_food',
    amount: '3000000',
    currency: 'VND',
    month: '2026-08',
    createdAt: new Date(),
    updatedAt: new Date(),
    category: sampleFoodCategory,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any);
  });

  describe('GET /budgets', () => {
    it('returns monthly budgets with aggregated spent, remaining, percentage and summary', async () => {
      vi.spyOn(prisma.budget, 'findMany').mockResolvedValue([sampleBudget] as any);

      // Mock aggregated expenses of 2,450,000 VND in Food & Drink
      vi.spyOn(prisma.transaction as any, 'groupBy').mockResolvedValue([
        {
          categoryId: 'cat_food',
          currency: 'VND',
          _sum: { amount: '2450000' },
        },
      ] as any);

      const res = await app.inject({
        method: 'GET',
        url: '/budgets?month=2026-08',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.month).toBe('2026-08');
      expect(body.budgets).toHaveLength(1);

      const b = body.budgets[0];
      expect(b.id).toBe('budget_1');
      expect(b.amount).toBe(3000000);
      expect(b.spent).toBe(2450000);
      expect(b.remaining).toBe(550000);
      expect(b.percentage).toBe(81.67);
      expect(b.status).toBe('WARNING'); // 80-99% is WARNING

      // Summary
      expect(body.summaries.VND).toBeDefined();
      expect(body.summaries.VND.totalBudget).toBe(3000000);
      expect(body.summaries.VND.totalSpent).toBe(2450000);
      expect(body.summaries.VND.totalRemaining).toBe(550000);
    });

    it('returns OVER_BUDGET status and overBudgetAmount when spending exceeds budget', async () => {
      vi.spyOn(prisma.budget, 'findMany').mockResolvedValue([sampleBudget] as any);

      vi.spyOn(prisma.transaction as any, 'groupBy').mockResolvedValue([
        {
          categoryId: 'cat_food',
          currency: 'VND',
          _sum: { amount: '3250000' },
        },
      ] as any);

      const res = await app.inject({
        method: 'GET',
        url: '/budgets?month=2026-08',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const b = body.budgets[0];
      expect(b.spent).toBe(3250000);
      expect(b.remaining).toBe(-250000);
      expect(b.overBudgetAmount).toBe(250000);
      expect(b.status).toBe('OVER_BUDGET');
    });

    it('rejects invalid month format with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/budgets?month=2026-13',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /budgets', () => {
    it('creates a new budget for an expense category', async () => {
      vi.spyOn(prisma.category, 'findFirst').mockResolvedValue(sampleFoodCategory as any);
      vi.spyOn(prisma.budget, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.budget, 'create').mockResolvedValue(sampleBudget as any);
      vi.spyOn(prisma.transaction, 'aggregate').mockResolvedValue({
        _sum: { amount: '0' },
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/budgets',
        headers: { authorization: 'Bearer token' },
        body: {
          categoryId: 'cat_food',
          amount: 3000000,
          currency: 'VND',
          month: '2026-08',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('budget_1');
      expect(body.amount).toBe(3000000);
    });

    it('rejects creating budget for INCOME category with 400', async () => {
      vi.spyOn(prisma.category, 'findFirst').mockResolvedValue(sampleSalaryCategory as any);

      const res = await app.inject({
        method: 'POST',
        url: '/budgets',
        headers: { authorization: 'Bearer token' },
        body: {
          categoryId: 'cat_salary',
          amount: 50000000,
          currency: 'VND',
          month: '2026-08',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('only be created for expense categories');
    });

    it('rejects duplicate budget for same user/category/currency/month with 409 Conflict', async () => {
      vi.spyOn(prisma.category, 'findFirst').mockResolvedValue(sampleFoodCategory as any);
      vi.spyOn(prisma.budget, 'findUnique').mockResolvedValue(sampleBudget as any);

      const res = await app.inject({
        method: 'POST',
        url: '/budgets',
        headers: { authorization: 'Bearer token' },
        body: {
          categoryId: 'cat_food',
          amount: 3000000,
          currency: 'VND',
          month: '2026-08',
        },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('PATCH /budgets/:id', () => {
    it('updates budget amount and recalculates progress', async () => {
      vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(sampleBudget as any);
      vi.spyOn(prisma.budget, 'update').mockResolvedValue({
        ...sampleBudget,
        amount: '4000000',
      } as any);
      vi.spyOn(prisma.transaction, 'aggregate').mockResolvedValue({
        _sum: { amount: '2000000' },
      } as any);

      const res = await app.inject({
        method: 'PATCH',
        url: `/budgets/${sampleBudget.id}`,
        headers: { authorization: 'Bearer token' },
        body: {
          amount: 4000000,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.amount).toBe(4000000);
      expect(body.spent).toBe(2000000);
      expect(body.remaining).toBe(2000000);
      expect(body.percentage).toBe(50);
      expect(body.status).toBe('NORMAL');
    });
  });

  describe('DELETE /budgets/:id', () => {
    it('deletes budget cleanly', async () => {
      vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(sampleBudget as any);
      const deleteSpy = vi.spyOn(prisma.budget, 'delete').mockResolvedValue(sampleBudget as any);

      const res = await app.inject({
        method: 'DELETE',
        url: `/budgets/${sampleBudget.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: sampleBudget.id } });
    });
  });

  describe('POST /budgets/copy', () => {
    it('copies budgets from previous month to target month', async () => {
      vi.spyOn(prisma.budget, 'findMany')
        .mockResolvedValueOnce([sampleBudget] as any) // Source month budgets
        .mockResolvedValueOnce([] as any); // Target month existing budgets (none)

      const mockCreate = vi.fn().mockResolvedValue({
        ...sampleBudget,
        id: 'budget_new_month',
        month: '2026-09',
      });
      vi.spyOn(prisma, '$transaction').mockImplementation(async (list: any) => Promise.all(list));
      vi.spyOn(prisma.budget, 'create').mockImplementation(mockCreate);

      const res = await app.inject({
        method: 'POST',
        url: '/budgets/copy',
        headers: { authorization: 'Bearer token' },
        body: {
          fromMonth: '2026-08',
          toMonth: '2026-09',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.copiedCount).toBe(1);
    });
  });

  describe('Ownership & Security', () => {
    it('rejects access to another user budget with 404', async () => {
      vi.spyOn(prisma.budget, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/budgets/unowned_budget_id',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
