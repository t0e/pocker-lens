import { describe, it, expect } from 'vitest'
import {
  calculateNextRunDate,
  calculateEstimatedMonthlyCost,
  getUpcomingOccurrences,
} from './index.js'

describe('Recurring Transactions & Subscriptions (Phase 7 Shared Helpers)', () => {
  describe('calculateNextRunDate', () => {
    it('calculates DAILY recurrence correctly', () => {
      const start = new Date(Date.UTC(2026, 7, 10, 12, 0, 0))
      const next = calculateNextRunDate(start, start, 'DAILY', 1)
      expect(next.toISOString()).toBe('2026-08-11T12:00:00.000Z')

      const next3Days = calculateNextRunDate(start, start, 'DAILY', 3)
      expect(next3Days.toISOString()).toBe('2026-08-13T12:00:00.000Z')
    })

    it('calculates WEEKLY recurrence correctly', () => {
      const start = new Date(Date.UTC(2026, 7, 10, 12, 0, 0))
      const next = calculateNextRunDate(start, start, 'WEEKLY', 1)
      expect(next.toISOString()).toBe('2026-08-17T12:00:00.000Z')

      const nextBiweekly = calculateNextRunDate(start, start, 'WEEKLY', 2)
      expect(nextBiweekly.toISOString()).toBe('2026-08-24T12:00:00.000Z')
    })

    it('calculates MONTHLY recurrence with standard day-of-month', () => {
      const start = new Date(Date.UTC(2026, 7, 15, 12, 0, 0))
      const next = calculateNextRunDate(start, start, 'MONTHLY', 1)
      expect(next.toISOString()).toBe('2026-09-15T12:00:00.000Z')
    })

    it('handles MONTHLY edge cases (Jan 31 -> Feb 28 in non-leap year -> Mar 31)', () => {
      const start = new Date(Date.UTC(2026, 0, 31, 12, 0, 0)) // Jan 31, 2026

      const feb = calculateNextRunDate(start, start, 'MONTHLY', 1)
      expect(feb.getUTCFullYear()).toBe(2026)
      expect(feb.getUTCMonth()).toBe(1) // February
      expect(feb.getUTCDate()).toBe(28) // 28th of Feb (clamped)

      // Next month from Feb should restore anchor day 31 for March!
      const mar = calculateNextRunDate(start, feb, 'MONTHLY', 1)
      expect(mar.getUTCFullYear()).toBe(2026)
      expect(mar.getUTCMonth()).toBe(2) // March
      expect(mar.getUTCDate()).toBe(31) // 31st of March

      const apr = calculateNextRunDate(start, mar, 'MONTHLY', 1)
      expect(apr.getUTCFullYear()).toBe(2026)
      expect(apr.getUTCMonth()).toBe(3) // April
      expect(apr.getUTCDate()).toBe(30) // 30th of April
    })

    it('handles leap year in MONTHLY recurrence (Jan 31 2024 -> Feb 29 2024)', () => {
      const start = new Date(Date.UTC(2024, 0, 31, 12, 0, 0)) // Jan 31, 2024 (leap year)
      const feb = calculateNextRunDate(start, start, 'MONTHLY', 1)
      expect(feb.getUTCFullYear()).toBe(2024)
      expect(feb.getUTCMonth()).toBe(1)
      expect(feb.getUTCDate()).toBe(29) // 29th in leap year
    })

    it('calculates YEARLY recurrence with leap year adjustment', () => {
      const leapStart = new Date(Date.UTC(2024, 1, 29, 12, 0, 0)) // Feb 29, 2024

      const yr2025 = calculateNextRunDate(leapStart, leapStart, 'YEARLY', 1)
      expect(yr2025.getUTCFullYear()).toBe(2025)
      expect(yr2025.getUTCMonth()).toBe(1)
      expect(yr2025.getUTCDate()).toBe(28) // Clamped to 28 in non-leap year

      const yr2028 = calculateNextRunDate(leapStart, yr2025, 'YEARLY', 3)
      expect(yr2028.getUTCFullYear()).toBe(2028)
      expect(yr2028.getUTCMonth()).toBe(1)
      expect(yr2028.getUTCDate()).toBe(29) // Restored to 29 in leap year
    })
  })

  describe('calculateEstimatedMonthlyCost', () => {
    it('normalizes various frequencies to estimated monthly cost', () => {
      expect(calculateEstimatedMonthlyCost(3000000, 'MONTHLY', 1)).toBe(3000000)
      expect(calculateEstimatedMonthlyCost(6000000, 'MONTHLY', 2)).toBe(3000000)
      expect(calculateEstimatedMonthlyCost(1200000, 'YEARLY', 1)).toBe(100000)
      expect(calculateEstimatedMonthlyCost(100000, 'WEEKLY', 1)).toBeCloseTo(
        433330,
        -1,
      )
    })
  })

  describe('getUpcomingOccurrences', () => {
    it('projects occurrences within the specified horizon', () => {
      const start = new Date(Date.UTC(2026, 7, 27, 12, 0, 0)) // Aug 27, 2026
      const recurring = {
        id: 'rec_1',
        description: 'Netflix',
        amount: 260000,
        currency: 'VND',
        type: 'EXPENSE' as const,
        accountId: 'acc_1',
        accountName: 'Vietcombank',
        startDate: start,
        nextRunDate: start,
        frequency: 'MONTHLY' as const,
        interval: 1,
        isActive: true,
        isSubscription: true,
      }

      const fromDate = new Date(Date.UTC(2026, 7, 24, 12, 0, 0))
      const occurrences = getUpcomingOccurrences(recurring, 40, fromDate)
      expect(occurrences.length).toBe(2)
      expect(occurrences[0].scheduledFor).toBe('2026-08-27T12:00:00.000Z')
      expect(occurrences[1].scheduledFor).toBe('2026-09-27T12:00:00.000Z')
    })

    it('respects isActive = false and returns empty array', () => {
      const recurring = {
        id: 'rec_paused',
        description: 'Paused Gym',
        amount: 500000,
        currency: 'VND',
        type: 'EXPENSE' as const,
        accountId: 'acc_1',
        accountName: 'Cash',
        startDate: new Date(),
        nextRunDate: new Date(),
        frequency: 'MONTHLY' as const,
        interval: 1,
        isActive: false,
        isSubscription: false,
      }

      const occurrences = getUpcomingOccurrences(recurring, 30)
      expect(occurrences).toHaveLength(0)
    })

    it('stops projecting past endDate', () => {
      const start = new Date(Date.UTC(2026, 7, 1, 12, 0, 0))
      const end = new Date(Date.UTC(2026, 7, 15, 12, 0, 0))
      const recurring = {
        id: 'rec_limited',
        description: 'Weekly Coaching',
        amount: 1000000,
        currency: 'VND',
        type: 'EXPENSE' as const,
        accountId: 'acc_1',
        accountName: 'Cash',
        startDate: start,
        nextRunDate: start,
        endDate: end,
        frequency: 'WEEKLY' as const,
        interval: 1,
        isActive: true,
        isSubscription: false,
      }

      const occurrences = getUpcomingOccurrences(recurring, 30, start)
      // Aug 1, Aug 8, Aug 15 -> 3 occurrences
      expect(occurrences.length).toBe(3)
    })
  })
})
