import { z } from 'zod'

export type BudgetStatus = 'NORMAL' | 'WARNING' | 'OVER_BUDGET'

export interface BudgetResponse {
  id: string
  userId: string
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  amount: number
  spent: number
  remaining: number
  percentage: number
  status: BudgetStatus
  overBudgetAmount: number
  currency: string
  month: string
  createdAt: string
  updatedAt: string
}

export interface BudgetMonthSummary {
  month: string
  currency: string
  totalBudget: number
  totalSpent: number
  totalRemaining: number
  overallPercentage: number
  budgetsCount: number
  overBudgetCount: number
}

export interface MonthlyBudgetsResponse {
  month: string
  summaries: Record<string, BudgetMonthSummary>
  budgets: BudgetResponse[]
}

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export const CreateBudgetSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.coerce.number().positive('Budget amount must be greater than zero'),
  currency: z.string().min(3).max(3),
  month: z
    .string()
    .regex(MONTH_REGEX, 'Month must be in YYYY-MM format (e.g. 2026-08)'),
})

export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>

export const UpdateBudgetSchema = z.object({
  amount: z.coerce.number().positive('Budget amount must be greater than zero'),
})

export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>

export const CopyBudgetsSchema = z.object({
  fromMonth: z
    .string()
    .regex(MONTH_REGEX, 'fromMonth must be in YYYY-MM format'),
  toMonth: z.string().regex(MONTH_REGEX, 'toMonth must be in YYYY-MM format'),
})

export type CopyBudgetsInput = z.infer<typeof CopyBudgetsSchema>

/**
 * Returns UTC Date boundaries for a YYYY-MM string.
 * Example: "2026-08" -> startOfMonth: 2026-08-01T00:00:00.000Z, endOfMonth: 2026-09-01T00:00:00.000Z
 */
export function getMonthBounds(monthStr: string): {
  startOfMonth: Date
  endOfMonth: Date
} {
  const match = monthStr.match(MONTH_REGEX)
  if (!match) {
    throw new Error(`Invalid month format: ${monthStr}. Expected YYYY-MM.`)
  }

  const [yearStr, monthNumStr] = monthStr.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthNumStr, 10) // 1 to 12

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))

  let nextYear = year
  let nextMonth = month
  if (nextMonth === 12) {
    nextYear += 1
    nextMonth = 0
  }
  const endOfMonth = new Date(Date.UTC(nextYear, nextMonth, 1, 0, 0, 0, 0))

  return { startOfMonth, endOfMonth }
}
