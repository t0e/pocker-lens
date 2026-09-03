import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { prisma } from '../db/client.js'
import { Prisma } from '@prisma/client'
import * as authService from '../auth/service.js'

describe('Analytics Endpoints (/analytics - Phase 8)', () => {
  let app: ReturnType<typeof buildApp>

  const userA = {
    id: 'user_analytics_A',
    email: 'user_a@pocketlens.test',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    app = buildApp()
  })

  it('GET /analytics/summary returns monthly summary with MoM comparison and savings rate', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'groupBy')
      .mockResolvedValueOnce([
        {
          type: 'EXPENSE',
          currency: 'VND',
          _sum: { amount: new Prisma.Decimal(18420000) },
          _count: { id: 24 },
        },
        {
          type: 'INCOME',
          currency: 'VND',
          _sum: { amount: new Prisma.Decimal(32000000) },
          _count: { id: 2 },
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          type: 'EXPENSE',
          currency: 'VND',
          _sum: { amount: new Prisma.Decimal(16200000) },
          _count: { id: 20 },
        },
        {
          type: 'INCOME',
          currency: 'VND',
          _sum: { amount: new Prisma.Decimal(30000000) },
          _count: { id: 2 },
        },
      ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/summary?month=2026-08&currency=VND',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    if (res.statusCode !== 200) console.log('SUBS ERROR:', res.body)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.period).toBeDefined()
    expect(body.summaries).toHaveLength(1)

    const vndSummary = body.summaries[0]
    expect(vndSummary.currency).toBe('VND')
    expect(vndSummary.income).toBe(32000000)
    expect(vndSummary.expenses).toBe(18420000)
    expect(vndSummary.net).toBe(13580000)
    expect(vndSummary.savingsRate).toBe(42.4)
    expect(vndSummary.transactionCount).toBe(26)

    expect(vndSummary.momComparison).toBeDefined()
    expect(vndSummary.momComparison.previousExpenses).toBe(16200000)
    expect(vndSummary.momComparison.expenseChangePercentage).toBe(13.7)
  })

  it('GET /analytics/summary handles zero-baseline MoM without Infinity', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'groupBy')
      .mockResolvedValueOnce([
        {
          type: 'EXPENSE',
          currency: 'VND',
          _sum: { amount: new Prisma.Decimal(1000000) },
          _count: { id: 5 },
        },
      ] as any)
      .mockResolvedValueOnce([] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/summary?month=2026-08&currency=VND',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const vnd = body.summaries[0]
    expect(vnd.momComparison.expenseChangePercentage).toBeNull()
    expect(vnd.momComparison.isNewExpense).toBe(true)
  })

  it('GET /analytics/trends returns monthly trend series with strict currency isolation', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'findMany').mockResolvedValueOnce([
      {
        type: 'INCOME',
        amount: new Prisma.Decimal(32000000),
        transactionDate: new Date('2026-08-05T00:00:00.000Z'),
      },
      {
        type: 'EXPENSE',
        amount: new Prisma.Decimal(18420000),
        transactionDate: new Date('2026-08-12T00:00:00.000Z'),
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/trends?currency=VND&months=6',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.currency).toBe('VND')
    expect(body.months).toHaveLength(6)

    const augMonth = body.months.find((m: any) => m.month === '2026-08')
    expect(augMonth).toBeDefined()
    expect(augMonth.income).toBe(32000000)
    expect(augMonth.expenses).toBe(18420000)
    expect(augMonth.net).toBe(13580000)
  })

  it('GET /analytics/categories returns category breakdown and top categories', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'groupBy')
      .mockResolvedValueOnce([
        {
          categoryId: 'cat_food',
          _sum: { amount: new Prisma.Decimal(5000000) },
          _count: { id: 10 },
        },
        {
          categoryId: 'cat_transport',
          _sum: { amount: new Prisma.Decimal(3000000) },
          _count: { id: 6 },
        },
        {
          categoryId: 'cat_shopping',
          _sum: { amount: new Prisma.Decimal(2000000) },
          _count: { id: 4 },
        },
      ] as any)
      .mockResolvedValueOnce([] as any)

    vi.spyOn(prisma.category as any, 'findMany').mockResolvedValueOnce([
      { id: 'cat_food', name: 'Food & Dining', icon: 'utensils' },
      { id: 'cat_transport', name: 'Transportation', icon: 'car' },
      { id: 'cat_shopping', name: 'Shopping', icon: 'shopping-bag' },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/categories?month=2026-08&currency=VND',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.totalExpenses).toBe(10000000)
    expect(body.categories).toHaveLength(3)

    expect(body.categories[0].categoryName).toBe('Food & Dining')
    expect(body.categories[0].percentage).toBe(50)
    expect(body.categories[1].percentage).toBe(30)
    expect(body.categories[2].percentage).toBe(20)
    expect(body.topCategories).toHaveLength(3)
  })

  it('GET /analytics/merchants aggregates spending by merchant', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'groupBy').mockResolvedValueOnce([
      {
        merchant: 'Highlands Coffee',
        _sum: { amount: new Prisma.Decimal(1240000) },
        _count: { id: 12 },
      },
      {
        merchant: 'Grab',
        _sum: { amount: new Prisma.Decimal(1080000) },
        _count: { id: 18 },
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/merchants?currency=VND',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.merchants).toHaveLength(2)
    expect(body.merchants[0].merchant).toBe('Highlands Coffee')
    expect(body.merchants[0].amount).toBe(1240000)
    expect(body.merchants[0].transactionCount).toBe(12)
  })

  it('GET /analytics/expenses/biggest returns largest individual expenses', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'findMany').mockResolvedValueOnce([
      {
        id: 'tx_rent',
        description: 'Monthly Rent',
        merchant: 'Landlord',
        amount: new Prisma.Decimal(8000000),
        currency: 'VND',
        transactionDate: new Date('2026-08-01T00:00:00.000Z'),
        category: { name: 'Housing', icon: 'home' },
        account: { name: 'Bank Account' },
      },
      {
        id: 'tx_laptop',
        description: 'New Laptop',
        merchant: 'Apple',
        amount: new Prisma.Decimal(4500000),
        currency: 'VND',
        transactionDate: new Date('2026-08-15T00:00:00.000Z'),
        category: { name: 'Shopping', icon: 'laptop' },
        account: { name: 'Bank Account' },
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/expenses/biggest?currency=VND&limit=5',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.expenses).toHaveLength(2)
    expect(body.expenses[0].description).toBe('Monthly Rent')
    expect(body.expenses[0].amount).toBe(8000000)
  })

  it('GET /analytics/budgets calculates budget vs actual and deterministic spending pace', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.budget as any, 'findMany').mockResolvedValueOnce([
      {
        id: 'b_food',
        userId: 'user_analytics_A',
        categoryId: 'cat_food',
        amount: new Prisma.Decimal(3000000),
        currency: 'VND',
        month: '2026-08',
        category: { name: 'Food', icon: 'utensils' },
      },
    ] as any)

    vi.spyOn(prisma.transaction as any, 'groupBy').mockResolvedValueOnce([
      {
        categoryId: 'cat_food',
        _sum: { amount: new Prisma.Decimal(2450000) },
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/budgets?month=2026-08&currency=VND',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.items).toHaveLength(1)

    const item = body.items[0]
    expect(item.categoryName).toBe('Food')
    expect(item.budgetAmount).toBe(3000000)
    expect(item.actualSpent).toBe(2450000)
    expect(item.remaining).toBe(550000)
    expect(item.percentageUsed).toBe(81.7)
    expect(item.expectedPaceAmount).toBeGreaterThan(0)
    expect(item.paceMessage).toBeDefined()
  })

  it('GET /analytics/subscriptions returns normalized subscription costs and commitments', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(
      prisma.recurringTransaction as any,
      'findMany',
    ).mockResolvedValueOnce([
      {
        id: 'rec_netflix',
        userId: 'user_analytics_A',
        type: 'EXPENSE',
        description: 'Netflix',
        merchant: 'Netflix',
        amount: new Prisma.Decimal(260000),
        currency: 'VND',
        frequency: 'MONTHLY',
        interval: 1,
        isSubscription: true,
        isActive: true,
        accountId: 'acc_bank',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        nextRunDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        endDate: null,
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/analytics/subscriptions?currency=VND',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.activeSubscriptionsCount).toBe(1)
    expect(body.estimatedMonthlyCost).toBe(260000)
    expect(body.estimatedYearlyCost).toBe(3120000)
    expect(body.next7DaysCommitment).toBe(520000)
    expect(body.next30DaysCommitment).toBe(520000)
  })

  it('GET /transactions search and sorting query extensions work properly', async () => {
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)

    vi.spyOn(prisma.transaction as any, 'count').mockResolvedValueOnce(1)
    vi.spyOn(prisma.transaction as any, 'findMany').mockResolvedValueOnce([
      {
        id: 'tx_coffee',
        userId: 'user_analytics_A',
        type: 'EXPENSE',
        accountId: 'acc_bank',
        transferAccountId: null,
        categoryId: 'cat_food',
        recurringTransactionId: null,
        amount: new Prisma.Decimal(45000),
        currency: 'VND',
        transactionDate: new Date('2026-08-20T10:00:00.000Z'),
        description: 'Highlands Coffee Cà phê sữa',
        merchant: 'Highlands Coffee',
        notes: 'With ice',
        createdAt: new Date(),
        updatedAt: new Date(),
        account: {
          id: 'acc_bank',
          userId: 'user_analytics_A',
          name: 'Bank Account',
          type: 'BANK',
          currency: 'VND',
          currentBalance: new Prisma.Decimal(10000000),
          openingBalance: new Prisma.Decimal(10000000),
          isDefault: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        transferAccount: null,
        category: {
          id: 'cat_food',
          userId: 'user_analytics_A',
          name: 'Food',
          type: 'EXPENSE',
          icon: 'utensils',
          isSystem: true,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/transactions?search=Highlands&sortBy=amount_desc',
      headers: { authorization: 'Bearer mock_token_a' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].description).toContain('Highlands')
  })
})
