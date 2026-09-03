import { describe, it, expect } from 'vitest'
import { getMonthBounds } from './index.js'

describe('Budgets Shared Helpers (Phase 7)', () => {
  describe('getMonthBounds', () => {
    it('returns exact start and end UTC dates for a regular month', () => {
      const bounds = getMonthBounds('2026-08')
      expect(bounds.startOfMonth.toISOString()).toBe('2026-08-01T00:00:00.000Z')
      expect(bounds.endOfMonth.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    })

    it('handles year rollover (December -> January next year)', () => {
      const bounds = getMonthBounds('2026-12')
      expect(bounds.startOfMonth.toISOString()).toBe('2026-12-01T00:00:00.000Z')
      expect(bounds.endOfMonth.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    })

    it('throws error for invalid format', () => {
      expect(() => getMonthBounds('2026-13')).toThrow()
      expect(() => getMonthBounds('invalid-month')).toThrow()
    })
  })
})
