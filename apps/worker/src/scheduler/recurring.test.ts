import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRecurringScheduler } from './recurring.js'
import { prisma } from '../db/client.js'

describe('Worker Recurring Scheduler (Phase 7)', () => {
  const sampleRecurring = {
    id: 'rec_worker_1',
    userId: 'user_1',
    type: 'EXPENSE',
    accountId: 'acc_1',
    categoryId: 'cat_1',
    amount: '500000',
    currency: 'VND',
    description: 'Gym Membership',
    frequency: 'MONTHLY',
    interval: 1,
    startDate: new Date('2026-08-01T12:00:00.000Z'),
    nextRunDate: new Date('2026-08-01T12:00:00.000Z'),
    endDate: null,
    isActive: true,
    isSubscription: true,
    account: { id: 'acc_1', isArchived: false },
    category: { id: 'cat_1', name: 'Health' },
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('processes due recurring items and creates financial transaction and occurrence', async () => {
    vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([
      sampleRecurring,
    ] as any)

    const mockCreateTx = vi.fn().mockResolvedValue({ id: 'tx_sched_1' })
    const mockUpdateAccount = vi.fn().mockResolvedValue({})
    const mockCreateOcc = vi.fn().mockResolvedValue({ id: 'occ_1' })
    const mockUpdateOcc = vi.fn().mockResolvedValue({})
    const mockUpdateRec = vi.fn().mockResolvedValue({})

    const mockTx = {
      recurringOccurrence: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: mockCreateOcc,
        update: mockUpdateOcc,
      },
      account: { update: mockUpdateAccount },
      transaction: { create: mockCreateTx },
      recurringTransaction: { update: mockUpdateRec },
    }

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) =>
      cb(mockTx),
    )

    const result = await runRecurringScheduler(
      new Date('2026-08-02T00:00:00.000Z'),
    )

    expect(result.processedCount).toBe(1)
    expect(result.generatedCount).toBe(1)
    expect(mockCreateTx).toHaveBeenCalled()
    expect(mockUpdateAccount).toHaveBeenCalled()
    expect(mockCreateOcc).toHaveBeenCalled()
  })

  it('auto-pauses recurring item if the linked account is archived', async () => {
    const archivedRecurring = {
      ...sampleRecurring,
      account: { id: 'acc_1', isArchived: true },
    }
    vi.spyOn(prisma.recurringTransaction, 'findMany').mockResolvedValue([
      archivedRecurring,
    ] as any)
    const updateSpy = vi
      .spyOn(prisma.recurringTransaction, 'update')
      .mockResolvedValue({} as any)

    const result = await runRecurringScheduler(
      new Date('2026-08-02T00:00:00.000Z'),
    )

    expect(result.processedCount).toBe(1)
    expect(result.generatedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: archivedRecurring.id },
      data: { isActive: false },
    })
  })
})
