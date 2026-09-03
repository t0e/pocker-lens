import { z } from 'zod'

// Time range query types
export const TimeRangeTypeSchema = z.enum([
  'current_month',
  'previous_month',
  'last_3_months',
  'last_6_months',
  'current_year',
  'custom',
])
export type TimeRangeType = z.infer<typeof TimeRangeTypeSchema>

export const AnalyticsQuerySchema = z.object({
  timeRange: TimeRangeTypeSchema.optional().default('current_month'),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format')
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  currency: z.string().length(3).optional(),
  reportingCurrency: z.string().length(3).optional(),
})
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>

// Period Time Range Bounds
export interface AnalyticsPeriod {
  label: string
  startDate: string // ISO string
  endDate: string // ISO string
  isCurrentPeriod: boolean
  daysTotal: number
  daysElapsed: number
}

// 1. Monthly Financial Summary DTO
export interface CurrencyFinancialSummary {
  currency: string
  income: number
  expenses: number
  net: number
  savingsRate: number | null // (income - expenses) / income * 100, null if income <= 0
  transactionCount: number
  incomeCount: number
  expenseCount: number
  momComparison: {
    previousIncome: number
    previousExpenses: number
    previousNet: number
    expenseChangePercentage: number | null // e.g. +13.7, null if baseline is 0
    incomeChangePercentage: number | null
    expenseChangeAmount: number
    incomeChangeAmount: number
    isNewExpense: boolean
    isNewIncome: boolean
  } | null
}

export interface ConvertedFinancialSummary {
  reportingCurrency: string
  totalIncome: number
  totalExpenses: number
  totalNet: number
  savingsRate: number | null
  convertedFromCurrencies: string[]
}

export interface FinancialSummaryResponse {
  period: AnalyticsPeriod
  summaries: CurrencyFinancialSummary[]
  convertedSummary?: ConvertedFinancialSummary | null
}

// 2. Cash Flow & Monthly Trends DTO
export interface MonthlyTrendPoint {
  month: string // YYYY-MM
  label: string // e.g. "Aug 2026"
  income: number
  expenses: number
  net: number
  savingsRate: number | null
  expenseCount: number
  incomeCount: number
}

export interface CashFlowTrendsResponse {
  currency: string
  months: MonthlyTrendPoint[]
}

// 3. Category Spending Breakdown DTO
export interface CategorySpendingItem {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  amount: number
  percentage: number // 0 - 100
  transactionCount: number
  previousAmount: number
  momChangePercentage: number | null
  momChangeAmount: number
  isNew: boolean
}

export interface CategoryBreakdownResponse {
  currency: string
  period: AnalyticsPeriod
  totalExpenses: number
  categories: CategorySpendingItem[]
  topCategories: CategorySpendingItem[]
}

// 4. Merchant Breakdown DTO
export interface MerchantSpendingItem {
  merchant: string
  amount: number
  percentage: number
  transactionCount: number
  averagePerTransaction: number
}

export interface MerchantBreakdownResponse {
  currency: string
  period: AnalyticsPeriod
  totalMerchantExpenses: number
  merchants: MerchantSpendingItem[]
}

// 5. Biggest Individual Expenses DTO
export interface BiggestExpenseItem {
  id: string
  description: string
  merchant: string | null
  amount: number
  currency: string
  categoryName: string
  categoryIcon: string | null
  accountName: string
  transactionDate: string
}

export interface BiggestExpensesResponse {
  currency: string
  period: AnalyticsPeriod
  expenses: BiggestExpenseItem[]
}

// 6. Account Cash Flow & Activity DTO
export interface AccountActivityItem {
  accountId: string
  accountName: string
  accountType: string
  currency: string
  currentBalance: number
  income: number
  expenses: number
  transfersIn: number
  transfersOut: number
  netMovement: number // income - expenses + transfersIn - transfersOut
  transactionCount: number
}

export interface NetWorthSummary {
  reportingCurrency: string
  totalNetWorth: number
  isConverted: boolean
  convertedFromCurrencies: string[]
}

export interface AccountActivityResponse {
  currency: string
  period: AnalyticsPeriod
  accounts: AccountActivityItem[]
  netWorth?: NetWorthSummary | null
}

// 7. Budget Performance & Spending Pace DTO
export type SpendingPaceStatus =
  'ON_TRACK' | 'AHEAD_OF_PACE' | 'BEHIND_PACE' | 'OVER_BUDGET'

export interface BudgetPerformanceItem {
  budgetId: string
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  currency: string
  budgetAmount: number
  actualSpent: number
  remaining: number
  percentageUsed: number
  status: 'NORMAL' | 'WARNING' | 'OVER_BUDGET'
  expectedPaceAmount: number // budgetAmount * (daysElapsed / daysInMonth)
  pacePercentageDiff: number // e.g. +40.0 means spent 40% more than expected for current day
  paceStatus: SpendingPaceStatus
  paceMessage: string
}

export interface BudgetPerformanceResponse {
  month: string // YYYY-MM
  currency: string
  daysInMonth: number
  daysElapsed: number
  totalBudgeted: number
  totalSpent: number
  totalRemaining: number
  budgetsCount: number
  budgetsOnTrack: number
  budgetsNearLimit: number
  budgetsOverLimit: number
  items: BudgetPerformanceItem[]
}

// 8. Subscriptions & Upcoming Commitments DTO
export interface TopSubscriptionItem {
  id: string
  description: string
  merchant: string | null
  amount: number
  currency: string
  frequency: string
  estimatedMonthlyCost: number
  nextRunDate: string
}

export interface CommitmentsSummaryResponse {
  currency: string
  activeSubscriptionsCount: number
  estimatedMonthlyCost: number
  estimatedYearlyCost: number
  next7DaysCommitment: number
  next30DaysCommitment: number
  topSubscriptions: TopSubscriptionItem[]
}

// 9. Deterministic Spending Insights DTO
export type InsightSeverity = 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS'
export type InsightType =
  | 'CATEGORY_INCREASE'
  | 'CATEGORY_DECREASE'
  | 'BUDGET_PACE'
  | 'BUDGET_EXCEEDED'
  | 'LARGEST_EXPENSE'
  | 'SUBSCRIPTION_SHARE'
  | 'SAVINGS_RATE'
  | 'NEW_CATEGORY'

export interface SpendingInsight {
  id: string
  type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  currency: string
  metricValue?: string | number
  actionUrl?: string
}

export interface SpendingInsightsResponse {
  period: AnalyticsPeriod
  insights: SpendingInsight[]
}

// Utility: Calculate Time Range Dates in UTC
export function getAnalyticsPeriodBounds(
  timeRange: TimeRangeType = 'current_month',
  customMonth?: string,
  customStartDate?: string,
  customEndDate?: string,
  now = new Date(),
): {
  current: { start: Date; end: Date; label: string }
  previous?: { start: Date; end: Date }
} {
  const currentYear = now.getUTCFullYear()
  const currentMonthIdx = now.getUTCMonth() // 0 - 11

  if (customMonth && /^\d{4}-\d{2}$/.test(customMonth)) {
    const [yStr, mStr] = customMonth.split('-')
    const y = parseInt(yStr, 10)
    const m = parseInt(mStr, 10) // 1 - 12
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
    const prevStart = new Date(
      Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1, 0, 0, 0, 0),
    )
    const prevEnd = new Date(
      Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, 0, 23, 59, 59, 999),
    )
    const label = start.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    return {
      current: { start, end, label },
      previous: { start: prevStart, end: prevEnd },
    }
  }

  if (timeRange === 'previous_month') {
    const prevYear = currentMonthIdx === 0 ? currentYear - 1 : currentYear
    const prevMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1
    const start = new Date(Date.UTC(prevYear, prevMonthIdx, 1, 0, 0, 0, 0))
    const end = new Date(
      Date.UTC(prevYear, prevMonthIdx + 1, 0, 23, 59, 59, 999),
    )
    const beforeYear = prevMonthIdx === 0 ? prevYear - 1 : prevYear
    const beforeMonthIdx = prevMonthIdx === 0 ? 11 : prevMonthIdx - 1
    const prevStart = new Date(
      Date.UTC(beforeYear, beforeMonthIdx, 1, 0, 0, 0, 0),
    )
    const prevEnd = new Date(
      Date.UTC(beforeYear, beforeMonthIdx + 1, 0, 23, 59, 59, 999),
    )
    const label = start.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    return {
      current: { start, end, label },
      previous: { start: prevStart, end: prevEnd },
    }
  }

  if (timeRange === 'last_3_months') {
    const start = new Date(
      Date.UTC(currentYear, currentMonthIdx - 2, 1, 0, 0, 0, 0),
    )
    const end = new Date(
      Date.UTC(currentYear, currentMonthIdx + 1, 0, 23, 59, 59, 999),
    )
    const prevStart = new Date(
      Date.UTC(currentYear, currentMonthIdx - 5, 1, 0, 0, 0, 0),
    )
    const prevEnd = new Date(
      Date.UTC(currentYear, currentMonthIdx - 2, 0, 23, 59, 59, 999),
    )
    return {
      current: { start, end, label: 'Last 3 Months' },
      previous: { start: prevStart, end: prevEnd },
    }
  }

  if (timeRange === 'last_6_months') {
    const start = new Date(
      Date.UTC(currentYear, currentMonthIdx - 5, 1, 0, 0, 0, 0),
    )
    const end = new Date(
      Date.UTC(currentYear, currentMonthIdx + 1, 0, 23, 59, 59, 999),
    )
    const prevStart = new Date(
      Date.UTC(currentYear, currentMonthIdx - 11, 1, 0, 0, 0, 0),
    )
    const prevEnd = new Date(
      Date.UTC(currentYear, currentMonthIdx - 5, 0, 23, 59, 59, 999),
    )
    return {
      current: { start, end, label: 'Last 6 Months' },
      previous: { start: prevStart, end: prevEnd },
    }
  }

  if (timeRange === 'current_year') {
    const start = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999))
    const prevStart = new Date(Date.UTC(currentYear - 1, 0, 1, 0, 0, 0, 0))
    const prevEnd = new Date(Date.UTC(currentYear - 1, 11, 31, 23, 59, 59, 999))
    return {
      current: { start, end, label: 'Year ' + currentYear },
      previous: { start: prevStart, end: prevEnd },
    }
  }

  if (timeRange === 'custom' && customStartDate && customEndDate) {
    const start = new Date(customStartDate)
    const end = new Date(customEndDate)
    return {
      current: { start, end, label: 'Custom Period' },
    }
  }

  // Default: current_month
  const start = new Date(Date.UTC(currentYear, currentMonthIdx, 1, 0, 0, 0, 0))
  const end = new Date(
    Date.UTC(currentYear, currentMonthIdx + 1, 0, 23, 59, 59, 999),
  )
  const prevYear = currentMonthIdx === 0 ? currentYear - 1 : currentYear
  const prevMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1
  const prevStart = new Date(Date.UTC(prevYear, prevMonthIdx, 1, 0, 0, 0, 0))
  const prevEnd = new Date(
    Date.UTC(prevYear, prevMonthIdx + 1, 0, 23, 59, 59, 999),
  )
  const label = start.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return {
    current: { start, end, label },
    previous: { start: prevStart, end: prevEnd },
  }
}
