import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import * as authService from '../auth/service.js';
import { Prisma } from '@prisma/client';

describe('Transactions Endpoints (/transactions)', () => {
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

  const bankAccount = {
    id: 'acc_bank',
    userId: userA.id,
    name: 'Vietcombank',
    type: 'BANK',
    currency: 'VND',
    openingBalance: new Prisma.Decimal('10000000'),
    currentBalance: new Prisma.Decimal('10000000'),
    isArchived: false,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const cashAccount = {
    id: 'acc_cash',
    userId: userA.id,
    name: 'Cash',
    type: 'CASH',
    currency: 'VND',
    openingBalance: new Prisma.Decimal('1000000'),
    currentBalance: new Prisma.Decimal('1000000'),
    isArchived: false,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const usdAccount = {
    id: 'acc_usd',
    userId: userA.id,
    name: 'USD Account',
    type: 'BANK',
    currency: 'USD',
    openingBalance: new Prisma.Decimal('1000.00'),
    currentBalance: new Prisma.Decimal('1000.00'),
    isArchived: false,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const foodCategory = {
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

  const salaryCategory = {
    id: 'cat_salary',
    userId: null,
    name: 'Salary',
    type: 'INCOME',
    icon: 'banknote',
    isSystem: true,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any);
  });

  describe('POST /transactions/parse (Phase 4 Natural Language Parsing)', () => {
    beforeEach(() => {
      vi.spyOn(prisma.account, 'findMany').mockResolvedValue([bankAccount, cashAccount] as any);
      vi.spyOn(prisma.category, 'findMany').mockResolvedValue([foodCategory, salaryCategory] as any);
      vi.spyOn(prisma.transaction, 'findMany').mockResolvedValue([]);
    });

    it('parses English expense "Lunch 85k cash" into structured draft without saving to DB', async () => {
      const createTxSpy = vi.spyOn(prisma.transaction, 'create');

      const res = await app.inject({
        method: 'POST',
        url: '/transactions/parse',
        headers: { authorization: 'Bearer token' },
        payload: { text: 'Lunch 85k cash' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.parsed.type).toBe('expense');
      expect(body.parsed.amount).toBe('85000');
      expect(body.parsed.currency).toBe('VND');
      expect(body.parsed.accountId).toBe(cashAccount.id);
      expect(body.parsed.categoryName).toBe('Food & Drink');
      expect(body.parsed.description).toContain('Lunch');

      // CRITICAL: Must not write to database during parse!
      expect(createTxSpy).not.toHaveBeenCalled();
    });

    it('parses Vietnamese expense "ăn trưa 80k tiền mặt"', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions/parse',
        headers: { authorization: 'Bearer token' },
        payload: { text: 'ăn trưa 80k tiền mặt' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.parsed.type).toBe('expense');
      expect(body.parsed.amount).toBe('80000');
      expect(body.parsed.accountId).toBe(cashAccount.id);
      expect(body.parsed.categoryName).toBe('Food & Drink');
    });

    it('parses Vietnamese transfer "chuyển 2tr từ Vietcombank sang tiền mặt"', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions/parse',
        headers: { authorization: 'Bearer token' },
        payload: { text: 'chuyển 2tr từ Vietcombank sang tiền mặt' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.parsed.type).toBe('transfer');
      expect(body.parsed.amount).toBe('2000000');
      expect(body.parsed.accountId).toBe(bankAccount.id);
      expect(body.parsed.transferAccountId).toBe(cashAccount.id);
    });

    it('parses English income "Salary 32m to Vietcombank"', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions/parse',
        headers: { authorization: 'Bearer token' },
        payload: { text: 'Salary 32m to Vietcombank' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.parsed.type).toBe('income');
      expect(body.parsed.amount).toBe('32000000');
      expect(body.parsed.categoryName).toBe('Salary');
      expect(body.parsed.accountId).toBe(bankAccount.id);
    });

    it('rejects empty input text with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/transactions/parse',
        headers: { authorization: 'Bearer token' },
        payload: { text: '' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Accounting Lifecycle: Expense', () => {
    it('creates expense and decreases account balance correctly', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(bankAccount as any);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));

      const accountUpdateSpy = vi.spyOn(prisma.account, 'update').mockResolvedValue(bankAccount as any);
      const txCreateSpy = vi.spyOn(prisma.transaction, 'create').mockResolvedValue({
        id: 'tx_exp_1',
        userId: userA.id,
        type: 'EXPENSE',
        accountId: bankAccount.id,
        amount: new Prisma.Decimal('200000'),
        currency: 'VND',
        transactionDate: new Date(),
        description: 'Groceries',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token' },
        payload: {
          type: 'expense',
          accountId: bankAccount.id,
          amount: '200000',
          description: 'Groceries',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.amount).toBe('200000');
      expect(body.type).toBe('expense');

      // Verify decrement of balance
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: bankAccount.id },
          data: { currentBalance: { decrement: new Prisma.Decimal('200000') } },
        })
      );
    });

    it('deletes expense and restores balance by incrementing amount', async () => {
      const existingTx = {
        id: 'tx_exp_1',
        userId: userA.id,
        type: 'EXPENSE',
        accountId: bankAccount.id,
        amount: new Prisma.Decimal('200000'),
      };

      vi.spyOn(prisma.transaction, 'findFirst').mockResolvedValue(existingTx as any);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));
      const accountUpdateSpy = vi.spyOn(prisma.account, 'update').mockResolvedValue(bankAccount as any);
      const txDeleteSpy = vi.spyOn(prisma.transaction, 'delete').mockResolvedValue(existingTx as any);

      const res = await app.inject({
        method: 'DELETE',
        url: `/transactions/${existingTx.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: bankAccount.id },
          data: { currentBalance: { increment: new Prisma.Decimal('200000') } },
        })
      );
      expect(txDeleteSpy).toHaveBeenCalledWith({ where: { id: existingTx.id } });
    });
  });

  describe('Accounting Lifecycle: Income', () => {
    it('creates income and increases account balance', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(bankAccount as any);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));

      const accountUpdateSpy = vi.spyOn(prisma.account, 'update').mockResolvedValue(bankAccount as any);
      vi.spyOn(prisma.transaction, 'create').mockResolvedValue({
        id: 'tx_inc_1',
        userId: userA.id,
        type: 'INCOME',
        accountId: bankAccount.id,
        amount: new Prisma.Decimal('5000000'),
        currency: 'VND',
        transactionDate: new Date(),
        description: 'Salary Bonus',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token' },
        payload: {
          type: 'income',
          accountId: bankAccount.id,
          amount: '5000000',
          description: 'Salary Bonus',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: bankAccount.id },
          data: { currentBalance: { increment: new Prisma.Decimal('5000000') } },
        })
      );
    });
  });

  describe('Accounting Lifecycle: Transfers', () => {
    it('creates transfer from Bank to Cash: debits Bank and credits Cash atomically', async () => {
      vi.spyOn(prisma.account, 'findFirst')
        .mockResolvedValueOnce(bankAccount as any) // Source
        .mockResolvedValueOnce(cashAccount as any); // Destination

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));
      const accountUpdateSpy = vi.spyOn(prisma.account, 'update').mockResolvedValue(bankAccount as any);
      vi.spyOn(prisma.transaction, 'create').mockResolvedValue({
        id: 'tx_transfer_1',
        userId: userA.id,
        type: 'TRANSFER',
        accountId: bankAccount.id,
        transferAccountId: cashAccount.id,
        amount: new Prisma.Decimal('2000000'),
        currency: 'VND',
        transactionDate: new Date(),
        description: 'ATM Withdrawal',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token' },
        payload: {
          type: 'transfer',
          accountId: bankAccount.id,
          transferAccountId: cashAccount.id,
          amount: '2000000',
          description: 'ATM Withdrawal',
        },
      });

      expect(res.statusCode).toBe(201);

      // Verify Source Debited
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: bankAccount.id },
          data: { currentBalance: { decrement: new Prisma.Decimal('2000000') } },
        })
      );

      // Verify Destination Credited
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: cashAccount.id },
          data: { currentBalance: { increment: new Prisma.Decimal('2000000') } },
        })
      );
    });

    it('rejects cross-currency transfers (e.g. VND to USD) with 400', async () => {
      vi.spyOn(prisma.account, 'findFirst')
        .mockResolvedValueOnce(bankAccount as any) // VND
        .mockResolvedValueOnce(usdAccount as any); // USD

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token' },
        payload: {
          type: 'transfer',
          accountId: bankAccount.id,
          transferAccountId: usdAccount.id,
          amount: '100',
          description: 'Cross currency test',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('Cross-currency transfers are not supported in Phase 3');
    });

    it('deleting transfer reverses both source and destination accounts atomically', async () => {
      const existingTransfer = {
        id: 'tx_tr_1',
        userId: userA.id,
        type: 'TRANSFER',
        accountId: bankAccount.id,
        transferAccountId: cashAccount.id,
        amount: new Prisma.Decimal('2000000'),
      };

      vi.spyOn(prisma.transaction, 'findFirst').mockResolvedValue(existingTransfer as any);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));
      const accountUpdateSpy = vi.spyOn(prisma.account, 'update').mockResolvedValue(bankAccount as any);
      vi.spyOn(prisma.transaction, 'delete').mockResolvedValue(existingTransfer as any);

      const res = await app.inject({
        method: 'DELETE',
        url: `/transactions/${existingTransfer.id}`,
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);

      // Source should be refunded (+amount)
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: bankAccount.id },
          data: { currentBalance: { increment: new Prisma.Decimal('2000000') } },
        })
      );

      // Destination should be reversed (-amount)
      expect(accountUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: cashAccount.id },
          data: { currentBalance: { decrement: new Prisma.Decimal('2000000') } },
        })
      );
    });
  });

  describe('Monthly Summary & Transfer Reporting Isolation', () => {
    it('GET /transactions/summary calculates income, expense, and net per currency while strictly excluding transfers', async () => {
      const mockMonthlyTransactions = [
        {
          id: 'tx_1',
          type: 'INCOME',
          amount: new Prisma.Decimal('10000000'),
          currency: 'VND',
        },
        {
          id: 'tx_2',
          type: 'EXPENSE',
          amount: new Prisma.Decimal('2000000'),
          currency: 'VND',
        },
        {
          id: 'tx_3',
          type: 'INCOME',
          amount: new Prisma.Decimal('500.00'),
          currency: 'USD',
        },
        {
          id: 'tx_4',
          type: 'EXPENSE',
          amount: new Prisma.Decimal('100.00'),
          currency: 'USD',
        },
      ];

      const findManySpy = vi.spyOn(prisma.transaction, 'findMany').mockResolvedValue(mockMonthlyTransactions as any);

      const res = await app.inject({
        method: 'GET',
        url: '/transactions/summary?month=2026-08',
        headers: { authorization: 'Bearer token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.month).toBe('2026-08');

      // Verify transfers are excluded from where clause
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: userA.id,
            type: { in: ['EXPENSE', 'INCOME'] },
          }),
        })
      );

      const vndSummary = body.summaries.find((s: any) => s.currency === 'VND');
      expect(vndSummary.income).toBe('10000000');
      expect(vndSummary.expense).toBe('2000000');
      expect(vndSummary.net).toBe('8000000');

      const usdSummary = body.summaries.find((s: any) => s.currency === 'USD');
      expect(usdSummary.income).toBe('500');
      expect(usdSummary.expense).toBe('100');
      expect(usdSummary.net).toBe('400');
    });
  });

  describe('CRITICAL: Ownership Isolation', () => {
    it('User A cannot retrieve User B transaction by ID (returns 404)', async () => {
      vi.spyOn(prisma.transaction, 'findFirst').mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/transactions/user_B_tx_id',
        headers: { authorization: 'Bearer token_user_A' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Transaction not found');
    });

    it('User A cannot create a transaction on User B’s account (returns 404)', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null); // Account not found for User A

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token_user_A' },
        payload: {
          type: 'expense',
          accountId: 'user_B_secret_account',
          amount: '100',
          description: 'Hacked',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Source account not found');
    });

    it('User A cannot transfer from User A to User B’s account (destination not found -> 404)', async () => {
      vi.spyOn(prisma.account, 'findFirst')
        .mockResolvedValueOnce(bankAccount as any) // Source found for User A
        .mockResolvedValueOnce(null); // Dest belongs to User B, not found for User A

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token_user_A' },
        payload: {
          type: 'transfer',
          accountId: bankAccount.id,
          transferAccountId: 'user_B_account_id',
          amount: '500',
          description: 'Cross-user transfer attempt',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe('Destination account not found');
    });
  });

  describe('Money Precision & Decimals Survival', () => {
    it('accurately computes and stores exact decimal precision without floating-point artifacts', async () => {
      const precisionAmount = '123456789.99';
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(usdAccount as any);
      vi.spyOn(prisma.account, 'update').mockResolvedValue(usdAccount as any);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(prisma));

      vi.spyOn(prisma.transaction, 'create').mockResolvedValue({
        id: 'tx_prec',
        userId: userA.id,
        type: 'INCOME',
        accountId: usdAccount.id,
        amount: new Prisma.Decimal(precisionAmount),
        currency: 'USD',
        transactionDate: new Date(),
        description: 'Large Precision Income',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/transactions',
        headers: { authorization: 'Bearer token' },
        payload: {
          type: 'income',
          accountId: usdAccount.id,
          amount: precisionAmount,
          description: 'Large Precision Income',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(new Prisma.Decimal(body.amount).equals(new Prisma.Decimal(precisionAmount))).toBe(true);
    });
  });
});
