import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { prisma } from '../db/client.js'
import * as authService from '../auth/service.js'
import { Prisma } from '@prisma/client'

describe('Accounts Endpoints (/accounts/*)', () => {
  let app: ReturnType<typeof buildApp>

  const userA = {
    id: 'user_A_id',
    email: 'userA@example.com',
    displayName: 'User A',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const userB = {
    id: 'user_B_id',
    email: 'userB@example.com',
    displayName: 'User B',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    app = buildApp()
    // Default mock auth to User A
    vi.spyOn(authService, 'validateSession').mockResolvedValue(userA as any)
  })

  describe('POST /accounts', () => {
    it('creates an account with decimal opening balance without floating point loss', async () => {
      const testBalance = '999999999.99'
      const mockCreated = {
        id: 'acc_123',
        userId: userA.id,
        name: 'High Yield Savings',
        type: 'SAVINGS',
        currency: 'USD',
        openingBalance: new Prisma.Decimal(testBalance),
        currentBalance: new Prisma.Decimal(testBalance),
        isArchived: false,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb(prisma)
      })
      vi.spyOn(prisma.account, 'create').mockResolvedValue(mockCreated as any)

      const res = await app.inject({
        method: 'POST',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
        payload: {
          name: 'High Yield Savings',
          type: 'savings',
          currency: 'USD',
          openingBalance: testBalance,
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.id).toBe('acc_123')
      expect(body.userId).toBe(userA.id)
      expect(
        new Prisma.Decimal(body.openingBalance).equals(
          new Prisma.Decimal(testBalance),
        ),
      ).toBe(true)
      expect(
        new Prisma.Decimal(body.currentBalance).equals(
          new Prisma.Decimal(testBalance),
        ),
      ).toBe(true)
      expect(body.currency).toBe('USD')
      expect(body.type).toBe('savings')
    })

    it('creates accounts with different currencies (e.g. VND, EUR, JPY)', async () => {
      const mockCreated = {
        id: 'acc_vnd',
        userId: userA.id,
        name: 'Vietcombank Salary',
        type: 'BANK',
        currency: 'VND',
        openingBalance: new Prisma.Decimal('18000000'),
        currentBalance: new Prisma.Decimal('18000000'),
        isArchived: false,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        return cb(prisma)
      })
      vi.spyOn(prisma.account, 'updateMany').mockResolvedValue({ count: 0 })
      vi.spyOn(prisma.account, 'create').mockResolvedValue(mockCreated as any)

      const res = await app.inject({
        method: 'POST',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
        payload: {
          name: 'Vietcombank Salary',
          type: 'bank',
          currency: 'VND',
          openingBalance: '18000000',
          isDefault: true,
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.currency).toBe('VND')
      expect(body.openingBalance).toBe('18000000')
    })

    it('rejects invalid currency', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
        payload: {
          name: 'Test Account',
          type: 'cash',
          currency: 'FAKE_CURRENCY',
          openingBalance: '100',
        },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.message).toContain('Invalid currency')
    })

    it('rejects invalid account type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
        payload: {
          name: 'Test Account',
          type: 'unsupported_type',
          currency: 'USD',
          openingBalance: '100',
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /accounts', () => {
    it('lists only non-archived accounts belonging to authenticated user by default', async () => {
      const mockAccounts = [
        {
          id: 'acc_1',
          userId: userA.id,
          name: 'Cash Wallet',
          type: 'CASH',
          currency: 'USD',
          openingBalance: new Prisma.Decimal('150.00'),
          currentBalance: new Prisma.Decimal('150.00'),
          isArchived: false,
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const findManySpy = vi
        .spyOn(prisma.account, 'findMany')
        .mockResolvedValue(mockAccounts as any)

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toHaveLength(1)
      expect(body[0].name).toBe('Cash Wallet')
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: userA.id, isArchived: false },
        }),
      )
    })

    it('returns a plain array (not wrapped in an object) for receipt form consumption', async () => {
      const mockAccounts = [
        {
          id: 'acc_1',
          userId: userA.id,
          name: 'Cash',
          type: 'CASH',
          currency: 'VND',
          openingBalance: new Prisma.Decimal('500000'),
          currentBalance: new Prisma.Decimal('500000'),
          isArchived: false,
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'acc_2',
          userId: userA.id,
          name: 'Vietcombank',
          type: 'BANK',
          currency: 'VND',
          openingBalance: new Prisma.Decimal('10000000'),
          currentBalance: new Prisma.Decimal('10000000'),
          isArchived: false,
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      vi.spyOn(prisma.account, 'findMany').mockResolvedValue(
        mockAccounts as any,
      )

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      // CRITICAL: response must be a plain array, not { accounts: [...] }
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(2)
      expect(body[0].id).toBe('acc_1')
      expect(body[1].id).toBe('acc_2')
    })

    it('returns empty array when user has no accounts', async () => {
      vi.spyOn(prisma.account, 'findMany').mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(0)
    })

    it('does not return other users accounts (ownership isolation)', async () => {
      vi.spyOn(prisma.account, 'findMany').mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts',
        headers: { authorization: 'Bearer test_token' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(0)
      // Verify the query filters by userA.id
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: userA.id }),
        }),
      )
    })

    it('includes archived accounts when includeArchived=true query param is set', async () => {
      const findManySpy = vi
        .spyOn(prisma.account, 'findMany')
        .mockResolvedValue([])

      const res = await app.inject({
        method: 'GET',
        url: '/accounts?includeArchived=true',
        headers: { authorization: 'Bearer test_token' },
      })

      expect(res.statusCode).toBe(200)
      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: userA.id },
        }),
      )
    })
  })

  describe('CRITICAL: Ownership Isolation Tests', () => {
    it('User A cannot retrieve User B’s account by ID (returns 404)', async () => {
      // prisma findFirst will filter by userId: userA.id, so User B's account returns null
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/accounts/user_B_secret_account_id',
        headers: { authorization: 'Bearer user_A_token' },
      })

      expect(res.statusCode).toBe(404)
      const body = JSON.parse(res.body)
      expect(body.message).toBe('Account not found')
    })

    it('User A cannot update User B’s account (returns 404)', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null)

      const res = await app.inject({
        method: 'PATCH',
        url: '/accounts/user_B_account_id',
        headers: { authorization: 'Bearer user_A_token' },
        payload: {
          name: 'Hacked by User A',
        },
      })

      expect(res.statusCode).toBe(404)
    })

    it('User A cannot archive/delete User B’s account (returns 404)', async () => {
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null)

      const res = await app.inject({
        method: 'DELETE',
        url: '/accounts/user_B_account_id',
        headers: { authorization: 'Bearer user_A_token' },
      })

      expect(res.statusCode).toBe(404)
    })

    it('Inverse check: User B cannot access User A’s account (returns 404)', async () => {
      // Mock session to User B
      vi.spyOn(authService, 'validateSession').mockResolvedValue(userB as any)
      vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/accounts/user_A_account_id',
        headers: { authorization: 'Bearer user_B_token' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('Money Precision Verification', () => {
    const precisionValues = [
      '0.01',
      '1000.10',
      '999999999.99',
      '0.0001',
      '1234567.8901',
    ]

    precisionValues.forEach((amount) => {
      it(`accurately handles precision value ${amount} without floating point error`, async () => {
        const decimalVal = new Prisma.Decimal(amount)
        const mockAccount = {
          id: `acc_prec_${amount}`,
          userId: userA.id,
          name: 'Precision Test Account',
          type: 'BANK',
          currency: 'USD',
          openingBalance: decimalVal,
          currentBalance: decimalVal,
          isArchived: false,
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        vi.spyOn(prisma.account, 'findFirst').mockResolvedValue(
          mockAccount as any,
        )

        const res = await app.inject({
          method: 'GET',
          url: `/accounts/${mockAccount.id}`,
          headers: { authorization: 'Bearer test_token' },
        })

        expect(res.statusCode).toBe(200)
        const body = JSON.parse(res.body)
        expect(new Prisma.Decimal(body.openingBalance).equals(decimalVal)).toBe(
          true,
        )
        expect(new Prisma.Decimal(body.currentBalance).equals(decimalVal)).toBe(
          true,
        )
      })
    })
  })
})
