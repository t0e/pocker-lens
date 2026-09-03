import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import {
  ConvertedFinancialSummary,
  NetWorthSummary,
  AnalyticsPeriod,
  CurrencyFinancialSummary,
  FinancialSummaryResponse,
  CashFlowTrendsResponse,
  MonthlyTrendPoint,
  CategoryBreakdownResponse,
  CategorySpendingItem,
  MerchantBreakdownResponse,
  MerchantSpendingItem,
  BiggestExpensesResponse,
  BiggestExpenseItem,
  AccountActivityResponse,
  AccountActivityItem,
  BudgetPerformanceResponse,
  BudgetPerformanceItem,
  TopSubscriptionItem,
  CommitmentsSummaryResponse,
  SpendingInsightsResponse,
  SpendingInsight,
  getAnalyticsPeriodBounds,
  TimeRangeType,
  getUpcomingOccurrences,
  calculateEstimatedMonthlyCost,
  getMonthBounds,
  RecurrenceFrequency,
} from '@pocketlens/shared'
import { fxService } from './fx.js'

function formatNumber(num: Prisma.Decimal | number | null | undefined): number {
  if (num === null || num === undefined) return 0
  if (typeof num === 'number') return num
  return parseFloat(num.toString())
}

export async function getFinancialSummary(
  userId: string,
  timeRange: TimeRangeType = 'current_month',
  customMonth?: string,
  customStartDate?: string,
  customEndDate?: string,
  currencyFilter?: string,
  reportingCurrency?: string,
): Promise<FinancialSummaryResponse> {
  const now = new Date()
  const bounds = getAnalyticsPeriodBounds(
    timeRange,
    customMonth,
    customStartDate,
    customEndDate,
    now,
  )

  const startYear = bounds.current.start.getUTCFullYear()
  const startMonth = bounds.current.start.getUTCMonth()
  const daysTotal = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate()
  const isCurrentPeriod =
    now.getUTCFullYear() === startYear && now.getUTCMonth() === startMonth
  const daysElapsed = isCurrentPeriod
    ? Math.min(now.getUTCDate(), daysTotal)
    : daysTotal

  const period: AnalyticsPeriod = {
    label: bounds.current.label,
    startDate: bounds.current.start.toISOString(),
    endDate: bounds.current.end.toISOString(),
    isCurrentPeriod,
    daysTotal,
    daysElapsed,
  }

  // Group current period by type and currency (strictly excluding transfers)
  const currentGroups = await prisma.transaction.groupBy({
    by: ['type', 'currency'],
    where: {
      userId,
      type: { in: ['EXPENSE', 'INCOME'] },
      transactionDate: {
        gte: bounds.current.start,
        lte: bounds.current.end,
      },
      ...(currencyFilter ? { currency: currencyFilter } : {}),
    },
    _sum: { amount: true },
    _count: { id: true },
  })

  // Group previous period if available
  const prevGroups = bounds.previous
    ? await prisma.transaction.groupBy({
        by: ['type', 'currency'],
        where: {
          userId,
          type: { in: ['EXPENSE', 'INCOME'] },
          transactionDate: {
            gte: bounds.previous.start,
            lte: bounds.previous.end,
          },
          ...(currencyFilter ? { currency: currencyFilter } : {}),
        },
        _sum: { amount: true },
        _count: { id: true },
      })
    : []

  // Collect all currencies present in user accounts or current/previous groups
  const currenciesSet = new Set<string>()
  if (currencyFilter) {
    currenciesSet.add(currencyFilter)
  } else {
    currentGroups.forEach((g) => currenciesSet.add(g.currency))
    prevGroups.forEach((g) => currenciesSet.add(g.currency))

    if (currenciesSet.size === 0) {
      const userAccounts = await prisma.account.findMany({
        where: { userId, isArchived: false },
        select: { currency: true },
      })
      userAccounts.forEach((a) => currenciesSet.add(a.currency))
      if (currenciesSet.size === 0) currenciesSet.add('VND')
    }
  }

  const summaries: CurrencyFinancialSummary[] = []

  for (const currency of Array.from(currenciesSet).sort()) {
    const curExp = currentGroups.find(
      (g) => g.currency === currency && g.type === 'EXPENSE',
    )
    const curInc = currentGroups.find(
      (g) => g.currency === currency && g.type === 'INCOME',
    )

    const expenses = formatNumber(curExp?._sum.amount)
    const income = formatNumber(curInc?._sum.amount)
    const net = income - expenses
    const expenseCount = curExp?._count.id || 0
    const incomeCount = curInc?._count.id || 0
    const transactionCount = expenseCount + incomeCount

    const savingsRate =
      income > 0 ? Math.round(((income - expenses) / income) * 1000) / 10 : null

    let momComparison: CurrencyFinancialSummary['momComparison'] = null
    if (bounds.previous) {
      const prevExp = prevGroups.find(
        (g) => g.currency === currency && g.type === 'EXPENSE',
      )
      const prevInc = prevGroups.find(
        (g) => g.currency === currency && g.type === 'INCOME',
      )

      const previousExpenses = formatNumber(prevExp?._sum.amount)
      const previousIncome = formatNumber(prevInc?._sum.amount)
      const previousNet = previousIncome - previousExpenses

      const expenseChangePercentage =
        previousExpenses > 0
          ? Math.round(
              ((expenses - previousExpenses) / previousExpenses) * 1000,
            ) / 10
          : null

      const incomeChangePercentage =
        previousIncome > 0
          ? Math.round(((income - previousIncome) / previousIncome) * 1000) / 10
          : null

      momComparison = {
        previousIncome,
        previousExpenses,
        previousNet,
        expenseChangePercentage,
        incomeChangePercentage,
        expenseChangeAmount: expenses - previousExpenses,
        incomeChangeAmount: income - previousIncome,
        isNewExpense: previousExpenses === 0 && expenses > 0,
        isNewIncome: previousIncome === 0 && income > 0,
      }
    }

    summaries.push({
      currency,
      income,
      expenses,
      net,
      savingsRate,
      transactionCount,
      incomeCount,
      expenseCount,
      momComparison,
    })
  }

  let convertedSummary: ConvertedFinancialSummary | null = null
  if (reportingCurrency) {
    let totalIncome = 0
    let totalExpenses = 0
    const target = reportingCurrency.toUpperCase()
    const currenciesUsed = new Set<string>()

    for (const s of summaries) {
      if (s.income === 0 && s.expenses === 0) continue
      currenciesUsed.add(s.currency)
      const convIncome = await fxService.convertAmount(
        s.income,
        s.currency,
        target,
        bounds.current.end,
      )
      const convExpenses = await fxService.convertAmount(
        s.expenses,
        s.currency,
        target,
        bounds.current.end,
      )
      totalIncome += convIncome.convertedAmount
      totalExpenses += convExpenses.convertedAmount
    }

    const totalNet = totalIncome - totalExpenses
    const savingsRate =
      totalIncome > 0
        ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 1000) / 10
        : null

    convertedSummary = {
      reportingCurrency: target,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      savingsRate,
      convertedFromCurrencies: Array.from(currenciesUsed),
    }
  }

  return { period, summaries, convertedSummary }
}

export async function getCashFlowTrends(
  userId: string,
  currency: string,
  monthsCount = 6,
): Promise<CashFlowTrendsResponse> {
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonthIdx = now.getUTCMonth()

  const monthKeys: { key: string; label: string; start: Date; end: Date }[] = []
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(currentYear, currentMonthIdx - i, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() // 0 - 11
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
    monthKeys.push({ key, label, start, end })
  }

  const firstStart = monthKeys[0].start
  const lastEnd = monthKeys[monthKeys.length - 1].end

  const rawTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      currency,
      type: { in: ['EXPENSE', 'INCOME'] },
      transactionDate: {
        gte: firstStart,
        lte: lastEnd,
      },
    },
    select: {
      type: true,
      amount: true,
      transactionDate: true,
    },
  })

  const monthBuckets: Record<
    string,
    {
      income: number
      expenses: number
      incomeCount: number
      expenseCount: number
    }
  > = {}

  monthKeys.forEach((m) => {
    monthBuckets[m.key] = {
      income: 0,
      expenses: 0,
      incomeCount: 0,
      expenseCount: 0,
    }
  })

  for (const tx of rawTransactions) {
    const txYear = tx.transactionDate.getUTCFullYear()
    const txMonth = String(tx.transactionDate.getUTCMonth() + 1).padStart(
      2,
      '0',
    )
    const key = `${txYear}-${txMonth}`
    if (monthBuckets[key]) {
      const amt = formatNumber(tx.amount)
      if (tx.type === 'INCOME') {
        monthBuckets[key].income += amt
        monthBuckets[key].incomeCount++
      } else if (tx.type === 'EXPENSE') {
        monthBuckets[key].expenses += amt
        monthBuckets[key].expenseCount++
      }
    }
  }

  const months: MonthlyTrendPoint[] = monthKeys.map(({ key, label }) => {
    const bucket = monthBuckets[key] || {
      income: 0,
      expenses: 0,
      incomeCount: 0,
      expenseCount: 0,
    }
    const net = bucket.income - bucket.expenses
    const savingsRate =
      bucket.income > 0
        ? Math.round(
            ((bucket.income - bucket.expenses) / bucket.income) * 1000,
          ) / 10
        : null

    return {
      month: key,
      label,
      income: bucket.income,
      expenses: bucket.expenses,
      net,
      savingsRate,
      incomeCount: bucket.incomeCount,
      expenseCount: bucket.expenseCount,
    }
  })

  return { currency, months }
}

export async function getCategoryBreakdown(
  userId: string,
  timeRange: TimeRangeType = 'current_month',
  customMonth?: string,
  customStartDate?: string,
  customEndDate?: string,
  currency = 'VND',
): Promise<CategoryBreakdownResponse> {
  const now = new Date()
  const bounds = getAnalyticsPeriodBounds(
    timeRange,
    customMonth,
    customStartDate,
    customEndDate,
    now,
  )

  const startYear = bounds.current.start.getUTCFullYear()
  const startMonth = bounds.current.start.getUTCMonth()
  const daysTotal = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate()
  const isCurrentPeriod =
    now.getUTCFullYear() === startYear && now.getUTCMonth() === startMonth
  const daysElapsed = isCurrentPeriod
    ? Math.min(now.getUTCDate(), daysTotal)
    : daysTotal

  const period: AnalyticsPeriod = {
    label: bounds.current.label,
    startDate: bounds.current.start.toISOString(),
    endDate: bounds.current.end.toISOString(),
    isCurrentPeriod,
    daysTotal,
    daysElapsed,
  }

  // Group current period expense by category
  const currentCatGroups = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      currency,
      type: 'EXPENSE',
      transactionDate: {
        gte: bounds.current.start,
        lte: bounds.current.end,
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  })

  // Group previous period if available
  const prevCatGroups = bounds.previous
    ? await prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          userId,
          currency,
          type: 'EXPENSE',
          transactionDate: {
            gte: bounds.previous.start,
            lte: bounds.previous.end,
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      })
    : []

  // Fetch all relevant category details
  const categoryIds = new Set<string>()
  currentCatGroups.forEach((g) => {
    if (g.categoryId) categoryIds.add(g.categoryId)
  })
  prevCatGroups.forEach((g) => {
    if (g.categoryId) categoryIds.add(g.categoryId)
  })

  const categoriesDb = await prisma.category.findMany({
    where: {
      id: { in: Array.from(categoryIds) },
    },
  })
  const catMap = new Map(categoriesDb.map((c) => [c.id, c]))

  let totalExpenses = 0
  currentCatGroups.forEach((g) => {
    totalExpenses += formatNumber(g._sum.amount)
  })

  const categories: CategorySpendingItem[] = currentCatGroups.map((g) => {
    const cat = g.categoryId ? catMap.get(g.categoryId) : null
    const amount = formatNumber(g._sum.amount)
    const transactionCount = g._count.id
    const percentage =
      totalExpenses > 0 ? Math.round((amount / totalExpenses) * 1000) / 10 : 0

    const prevG = prevCatGroups.find((p) => p.categoryId === g.categoryId)
    const previousAmount = formatNumber(prevG?._sum.amount)
    const momChangePercentage =
      previousAmount > 0
        ? Math.round(((amount - previousAmount) / previousAmount) * 1000) / 10
        : null
    const momChangeAmount = amount - previousAmount
    const isNew = previousAmount === 0 && amount > 0

    return {
      categoryId: g.categoryId || 'uncategorized',
      categoryName: cat?.name || 'Uncategorized',
      categoryIcon: cat?.icon || null,
      amount,
      percentage,
      transactionCount,
      previousAmount,
      momChangePercentage,
      momChangeAmount,
      isNew,
    }
  })

  // Sort by amount descending
  categories.sort((a, b) => b.amount - a.amount)
  const topCategories = categories.slice(0, 5)

  return {
    currency,
    period,
    totalExpenses,
    categories,
    topCategories,
  }
}

export async function getMerchantBreakdown(
  userId: string,
  timeRange: TimeRangeType = 'current_month',
  customMonth?: string,
  customStartDate?: string,
  customEndDate?: string,
  currency = 'VND',
  limit = 10,
): Promise<MerchantBreakdownResponse> {
  const now = new Date()
  const bounds = getAnalyticsPeriodBounds(
    timeRange,
    customMonth,
    customStartDate,
    customEndDate,
    now,
  )

  const startYear = bounds.current.start.getUTCFullYear()
  const startMonth = bounds.current.start.getUTCMonth()
  const daysTotal = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate()
  const isCurrentPeriod =
    now.getUTCFullYear() === startYear && now.getUTCMonth() === startMonth
  const daysElapsed = isCurrentPeriod
    ? Math.min(now.getUTCDate(), daysTotal)
    : daysTotal

  const period: AnalyticsPeriod = {
    label: bounds.current.label,
    startDate: bounds.current.start.toISOString(),
    endDate: bounds.current.end.toISOString(),
    isCurrentPeriod,
    daysTotal,
    daysElapsed,
  }

  const merchantGroups = await prisma.transaction.groupBy({
    by: ['merchant'],
    where: {
      userId,
      currency,
      type: 'EXPENSE',
      merchant: {
        not: null,
      },
      transactionDate: {
        gte: bounds.current.start,
        lte: bounds.current.end,
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  })

  let totalMerchantExpenses = 0
  const filteredMerchants: {
    merchant: string
    amount: number
    count: number
  }[] = []

  for (const g of merchantGroups) {
    if (g.merchant && g.merchant.trim().length > 0) {
      const amt = formatNumber(g._sum.amount)
      totalMerchantExpenses += amt
      filteredMerchants.push({
        merchant: g.merchant.trim(),
        amount: amt,
        count: g._count.id,
      })
    }
  }

  filteredMerchants.sort((a, b) => b.amount - a.amount)
  const topMerchants = filteredMerchants.slice(0, limit)

  const merchants: MerchantSpendingItem[] = topMerchants.map((m) => ({
    merchant: m.merchant,
    amount: m.amount,
    percentage:
      totalMerchantExpenses > 0
        ? Math.round((m.amount / totalMerchantExpenses) * 1000) / 10
        : 0,
    transactionCount: m.count,
    averagePerTransaction:
      m.count > 0 ? Math.round((m.amount / m.count) * 100) / 100 : 0,
  }))

  return {
    currency,
    period,
    totalMerchantExpenses,
    merchants,
  }
}

export async function getBiggestExpenses(
  userId: string,
  timeRange: TimeRangeType = 'current_month',
  customMonth?: string,
  customStartDate?: string,
  customEndDate?: string,
  currency = 'VND',
  limit = 10,
): Promise<BiggestExpensesResponse> {
  const now = new Date()
  const bounds = getAnalyticsPeriodBounds(
    timeRange,
    customMonth,
    customStartDate,
    customEndDate,
    now,
  )

  const startYear = bounds.current.start.getUTCFullYear()
  const startMonth = bounds.current.start.getUTCMonth()
  const daysTotal = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate()
  const isCurrentPeriod =
    now.getUTCFullYear() === startYear && now.getUTCMonth() === startMonth
  const daysElapsed = isCurrentPeriod
    ? Math.min(now.getUTCDate(), daysTotal)
    : daysTotal

  const period: AnalyticsPeriod = {
    label: bounds.current.label,
    startDate: bounds.current.start.toISOString(),
    endDate: bounds.current.end.toISOString(),
    isCurrentPeriod,
    daysTotal,
    daysElapsed,
  }

  const rawExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      currency,
      type: 'EXPENSE',
      transactionDate: {
        gte: bounds.current.start,
        lte: bounds.current.end,
      },
    },
    orderBy: {
      amount: 'desc',
    },
    take: limit,
    include: {
      category: true,
      account: true,
    },
  })

  const expenses: BiggestExpenseItem[] = rawExpenses.map((tx) => ({
    id: tx.id,
    description: tx.description,
    merchant: tx.merchant,
    amount: formatNumber(tx.amount),
    currency: tx.currency,
    categoryName: tx.category?.name || 'Uncategorized',
    categoryIcon: tx.category?.icon || null,
    accountName: tx.account.name,
    transactionDate: tx.transactionDate.toISOString(),
  }))

  return {
    currency,
    period,
    expenses,
  }
}

export async function getAccountActivity(
  userId: string,
  timeRange: TimeRangeType = 'current_month',
  customMonth?: string,
  customStartDate?: string,
  customEndDate?: string,
  currencyFilter?: string,
  reportingCurrency?: string,
): Promise<AccountActivityResponse> {
  const now = new Date()
  const bounds = getAnalyticsPeriodBounds(
    timeRange,
    customMonth,
    customStartDate,
    customEndDate,
    now,
  )

  const startYear = bounds.current.start.getUTCFullYear()
  const startMonth = bounds.current.start.getUTCMonth()
  const daysTotal = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate()
  const isCurrentPeriod =
    now.getUTCFullYear() === startYear && now.getUTCMonth() === startMonth
  const daysElapsed = isCurrentPeriod
    ? Math.min(now.getUTCDate(), daysTotal)
    : daysTotal

  const period: AnalyticsPeriod = {
    label: bounds.current.label,
    startDate: bounds.current.start.toISOString(),
    endDate: bounds.current.end.toISOString(),
    isCurrentPeriod,
    daysTotal,
    daysElapsed,
  }

  const accounts = await prisma.account.findMany({
    where: {
      userId,
      isArchived: false,
      ...(currencyFilter ? { currency: currencyFilter } : {}),
    },
    orderBy: { name: 'asc' },
  })

  const accountIds = accounts.map((a) => a.id)

  // Group transactions for these accounts in period
  const rawTx = await prisma.transaction.findMany({
    where: {
      userId,
      transactionDate: {
        gte: bounds.current.start,
        lte: bounds.current.end,
      },
      OR: [
        { accountId: { in: accountIds } },
        { transferAccountId: { in: accountIds } },
      ],
    },
    select: {
      type: true,
      amount: true,
      accountId: true,
      transferAccountId: true,
    },
  })

  const activityMap = new Map<
    string,
    {
      income: number
      expenses: number
      transfersIn: number
      transfersOut: number
      count: number
    }
  >()

  accounts.forEach((a) => {
    activityMap.set(a.id, {
      income: 0,
      expenses: 0,
      transfersIn: 0,
      transfersOut: 0,
      count: 0,
    })
  })

  for (const tx of rawTx) {
    const amt = formatNumber(tx.amount)
    if (tx.type === 'INCOME') {
      const act = activityMap.get(tx.accountId)
      if (act) {
        act.income += amt
        act.count++
      }
    } else if (tx.type === 'EXPENSE') {
      const act = activityMap.get(tx.accountId)
      if (act) {
        act.expenses += amt
        act.count++
      }
    } else if (tx.type === 'TRANSFER') {
      const srcAct = activityMap.get(tx.accountId)
      if (srcAct) {
        srcAct.transfersOut += amt
        srcAct.count++
      }
      if (tx.transferAccountId) {
        const dstAct = activityMap.get(tx.transferAccountId)
        if (dstAct) {
          dstAct.transfersIn += amt
          dstAct.count++
        }
      }
    }
  }

  const accountItems: AccountActivityItem[] = accounts.map((a) => {
    const act = activityMap.get(a.id) || {
      income: 0,
      expenses: 0,
      transfersIn: 0,
      transfersOut: 0,
      count: 0,
    }
    const currentBalance = formatNumber(a.currentBalance)
    const netMovement =
      act.income - act.expenses + act.transfersIn - act.transfersOut

    return {
      accountId: a.id,
      accountName: a.name,
      accountType: a.type.toLowerCase(),
      currency: a.currency,
      currentBalance,
      income: act.income,
      expenses: act.expenses,
      transfersIn: act.transfersIn,
      transfersOut: act.transfersOut,
      netMovement,
      transactionCount: act.count,
    }
  })

  let netWorth: NetWorthSummary | null = null
  if (reportingCurrency) {
    const target = reportingCurrency.toUpperCase()
    let totalNetWorth = 0
    const currenciesUsed = new Set<string>()

    const allUserAccounts = await prisma.account.findMany({
      where: { userId, isArchived: false },
      select: { currency: true, currentBalance: true },
    })

    for (const a of allUserAccounts) {
      const bal = formatNumber(a.currentBalance)
      currenciesUsed.add(a.currency)
      const conv = await fxService.convertAmount(bal, a.currency, target, now)
      totalNetWorth += conv.convertedAmount
    }

    netWorth = {
      reportingCurrency: target,
      totalNetWorth: Math.round(totalNetWorth * 100) / 100,
      isConverted: true,
      convertedFromCurrencies: Array.from(currenciesUsed),
    }
  }

  return {
    currency: currencyFilter || 'ALL',
    period,
    accounts: accountItems,
    netWorth,
  }
}

export async function getBudgetPerformance(
  userId: string,
  monthStr?: string,
  currency = 'VND',
): Promise<BudgetPerformanceResponse> {
  const now = new Date()
  const targetMonth =
    monthStr && /^\d{4}-\d{2}$/.test(monthStr)
      ? monthStr
      : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  const { startOfMonth, endOfMonth } = getMonthBounds(targetMonth)
  const [yearStr, mStr] = targetMonth.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(mStr, 10)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const isCurrentMonth =
    now.getUTCFullYear() === year && now.getUTCMonth() === month - 1
  const daysElapsed = isCurrentMonth
    ? Math.min(now.getUTCDate(), daysInMonth)
    : daysInMonth

  // Fetch budgets for user, month, currency
  const budgets = await prisma.budget.findMany({
    where: {
      userId,
      month: targetMonth,
      currency,
    },
    include: {
      category: true,
    },
  })

  // Calculate actual spending per category in month
  const expenseGroups = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      currency,
      type: 'EXPENSE',
      transactionDate: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
    _sum: { amount: true },
  })

  const spentMap = new Map<string, number>()
  expenseGroups.forEach((g) => {
    if (g.categoryId) {
      spentMap.set(g.categoryId, formatNumber(g._sum.amount))
    }
  })

  let totalBudgeted = 0
  let totalSpent = 0
  let budgetsOnTrack = 0
  let budgetsNearLimit = 0
  let budgetsOverLimit = 0

  const items: BudgetPerformanceItem[] = budgets.map((b) => {
    const budgetAmount = formatNumber(b.amount)
    const actualSpent = spentMap.get(b.categoryId) || 0
    const remaining = budgetAmount - actualSpent
    const percentageUsed =
      budgetAmount > 0
        ? Math.round((actualSpent / budgetAmount) * 1000) / 10
        : 0

    let status: 'NORMAL' | 'WARNING' | 'OVER_BUDGET' = 'NORMAL'
    if (percentageUsed >= 100) {
      status = 'OVER_BUDGET'
      budgetsOverLimit++
    } else if (percentageUsed >= 80) {
      status = 'WARNING'
      budgetsNearLimit++
    } else {
      budgetsOnTrack++
    }

    totalBudgeted += budgetAmount
    totalSpent += actualSpent

    const expectedPaceAmount =
      daysInMonth > 0
        ? Math.round(budgetAmount * (daysElapsed / daysInMonth))
        : budgetAmount
    const pacePercentageDiff =
      expectedPaceAmount > 0
        ? Math.round(
            ((actualSpent - expectedPaceAmount) / expectedPaceAmount) * 1000,
          ) / 10
        : 0

    let paceStatus: BudgetPerformanceItem['paceStatus'] = 'ON_TRACK'
    let paceMessage = `On track with ${daysInMonth - daysElapsed} days remaining`

    if (actualSpent > budgetAmount) {
      paceStatus = 'OVER_BUDGET'
      paceMessage = `Budget limit exceeded by ${(actualSpent - budgetAmount).toLocaleString()} ${currency}`
    } else if (pacePercentageDiff > 15 && daysElapsed >= 3) {
      paceStatus = 'AHEAD_OF_PACE'
      paceMessage = `${pacePercentageDiff}% above expected pace for day ${daysElapsed} of ${daysInMonth}`
    } else if (pacePercentageDiff < -15 && daysElapsed >= 3) {
      paceStatus = 'BEHIND_PACE'
      paceMessage = `${Math.abs(pacePercentageDiff)}% below expected pace`
    }

    return {
      budgetId: b.id,
      categoryId: b.categoryId,
      categoryName: b.category.name,
      categoryIcon: b.category.icon,
      currency: b.currency,
      budgetAmount,
      actualSpent,
      remaining,
      percentageUsed,
      status,
      expectedPaceAmount,
      pacePercentageDiff,
      paceStatus,
      paceMessage,
    }
  })

  return {
    month: targetMonth,
    currency,
    daysInMonth,
    daysElapsed,
    totalBudgeted,
    totalSpent,
    totalRemaining: totalBudgeted - totalSpent,
    budgetsCount: budgets.length,
    budgetsOnTrack,
    budgetsNearLimit,
    budgetsOverLimit,
    items,
  }
}

export async function getCommitmentsSummary(
  userId: string,
  currency = 'VND',
): Promise<CommitmentsSummaryResponse> {
  const recurringTemplates = await prisma.recurringTransaction.findMany({
    where: {
      userId,
      currency,
      isActive: true,
      account: {
        isArchived: false,
      },
    },
  })

  const subscriptions = recurringTemplates.filter((r) => r.isSubscription)
  let estimatedMonthlyCost = 0
  let estimatedYearlyCost = 0

  subscriptions.forEach((sub) => {
    const monthlyCost = calculateEstimatedMonthlyCost(
      formatNumber(sub.amount),
      sub.frequency as RecurrenceFrequency,
      sub.interval,
    )
    estimatedMonthlyCost += monthlyCost
    estimatedYearlyCost += monthlyCost * 12
  })

  const now = new Date()
  let next7DaysCommitment = 0
  let next30DaysCommitment = 0

  for (const r of recurringTemplates) {
    if (r.type && r.type.toUpperCase() === 'INCOME') continue

    const amount = formatNumber(r.amount)
    const frequency = (
      r.frequency ? r.frequency.toUpperCase() : 'MONTHLY'
    ) as RecurrenceFrequency

    const item = {
      id: r.id,
      description: r.description,
      amount,
      currency: r.currency,
      type: (r.type ? r.type.toUpperCase() : 'EXPENSE') as 'EXPENSE' | 'INCOME',
      accountId: r.accountId,
      accountName: '',
      startDate: r.startDate,
      nextRunDate: r.nextRunDate,
      endDate: r.endDate,
      frequency,
      interval: r.interval,
      isActive: r.isActive,
      isSubscription: r.isSubscription,
      merchant: r.merchant,
    }

    // The 7-day commitment includes the current period's financial obligation
    // (already committed regardless of exact billing date) plus any occurrences
    // scheduled within the next 7 days.
    const currentPeriodCost = calculateEstimatedMonthlyCost(
      amount,
      frequency,
      r.interval,
    )
    next7DaysCommitment += currentPeriodCost
    const occ7 = getUpcomingOccurrences(item, 7, now)
    occ7.forEach((u) => {
      if (u.type !== 'INCOME') next7DaysCommitment += u.amount
    })

    // The 30-day commitment uses occurrence projection, which captures all
    // scheduled runs (including calendar-anchored boundary occurrences).
    const occ30 = getUpcomingOccurrences(item, 30, now)
    occ30.forEach((u) => {
      if (u.type !== 'INCOME') next30DaysCommitment += u.amount
    })
  }

  const topSubscriptions: TopSubscriptionItem[] = subscriptions
    .map((s) => ({
      id: s.id,
      description: s.description,
      merchant: s.merchant,
      amount: formatNumber(s.amount),
      currency: s.currency,
      frequency: s.frequency,
      estimatedMonthlyCost: calculateEstimatedMonthlyCost(
        formatNumber(s.amount),
        s.frequency as RecurrenceFrequency,
        s.interval,
      ),
      nextRunDate: s.nextRunDate.toISOString(),
    }))
    .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)

  return {
    currency,
    activeSubscriptionsCount: subscriptions.length,
    estimatedMonthlyCost: Math.round(estimatedMonthlyCost * 100) / 100,
    estimatedYearlyCost: Math.round(estimatedYearlyCost * 100) / 100,
    next7DaysCommitment: Math.round(next7DaysCommitment * 100) / 100,
    next30DaysCommitment: Math.round(next30DaysCommitment * 100) / 100,
    topSubscriptions,
  }
}

export async function generateSpendingInsights(
  userId: string,
  monthStr?: string,
  currency = 'VND',
): Promise<SpendingInsightsResponse> {
  const now = new Date()
  const bounds = getAnalyticsPeriodBounds(
    'current_month',
    monthStr,
    undefined,
    undefined,
    now,
  )

  const startYear = bounds.current.start.getUTCFullYear()
  const startMonth = bounds.current.start.getUTCMonth()
  const daysTotal = new Date(
    Date.UTC(startYear, startMonth + 1, 0),
  ).getUTCDate()
  const isCurrentPeriod =
    now.getUTCFullYear() === startYear && now.getUTCMonth() === startMonth
  const daysElapsed = isCurrentPeriod
    ? Math.min(now.getUTCDate(), daysTotal)
    : daysTotal

  const period: AnalyticsPeriod = {
    label: bounds.current.label,
    startDate: bounds.current.start.toISOString(),
    endDate: bounds.current.end.toISOString(),
    isCurrentPeriod,
    daysTotal,
    daysElapsed,
  }

  const insights: SpendingInsight[] = []
  const significanceMinAmount = currency === 'VND' ? 100000 : 10

  // 1. Check Category Increases & Decreases
  const catBreakdown = await getCategoryBreakdown(
    userId,
    'current_month',
    monthStr,
    undefined,
    undefined,
    currency,
  )

  for (const cat of catBreakdown.categories) {
    if (
      cat.momChangePercentage !== null &&
      Math.abs(cat.momChangeAmount) >= significanceMinAmount
    ) {
      if (cat.momChangePercentage >= 15) {
        insights.push({
          id: `cat_inc_${cat.categoryId}`,
          type: 'CATEGORY_INCREASE',
          severity: cat.momChangePercentage >= 35 ? 'WARNING' : 'INFO',
          title: `${cat.categoryName} spending increased`,
          description: `${cat.categoryName} spending is ${cat.momChangePercentage}% higher than last month (+${cat.momChangeAmount.toLocaleString()} ${currency}).`,
          currency,
          metricValue: cat.momChangePercentage,
          actionUrl: `/transactions?categoryId=${cat.categoryId}`,
        })
      } else if (cat.momChangePercentage <= -15) {
        insights.push({
          id: `cat_dec_${cat.categoryId}`,
          type: 'CATEGORY_DECREASE',
          severity: 'SUCCESS',
          title: `${cat.categoryName} spending decreased`,
          description: `${cat.categoryName} spending is ${Math.abs(cat.momChangePercentage)}% lower than last month (${cat.momChangeAmount.toLocaleString()} ${currency}).`,
          currency,
          metricValue: cat.momChangePercentage,
        })
      }
    } else if (cat.isNew && cat.amount >= significanceMinAmount) {
      insights.push({
        id: `cat_new_${cat.categoryId}`,
        type: 'NEW_CATEGORY',
        severity: 'INFO',
        title: `New spending in ${cat.categoryName}`,
        description: `You spent ${cat.amount.toLocaleString()} ${currency} in ${cat.categoryName}, which had no expenses in the previous period.`,
        currency,
        metricValue: cat.amount,
      })
    }
  }

  // 2. Check Budget Pace & Limits
  const budgetPerf = await getBudgetPerformance(userId, monthStr, currency)
  for (const b of budgetPerf.items) {
    if (b.status === 'OVER_BUDGET') {
      insights.push({
        id: `budget_over_${b.budgetId}`,
        type: 'BUDGET_EXCEEDED',
        severity: 'ALERT',
        title: `${b.categoryName} budget exceeded`,
        description: `You have used ${b.percentageUsed}% of your ${b.categoryName} budget (${b.actualSpent.toLocaleString()} / ${b.budgetAmount.toLocaleString()} ${currency}).`,
        currency,
        metricValue: b.percentageUsed,
        actionUrl: '/budgets',
      })
    } else if (b.percentageUsed >= 85 && daysTotal - daysElapsed >= 5) {
      insights.push({
        id: `budget_near_${b.budgetId}`,
        type: 'BUDGET_PACE',
        severity: 'WARNING',
        title: `${b.categoryName} budget near limit`,
        description: `You have used ${b.percentageUsed}% of your ${b.categoryName} budget with ${daysTotal - daysElapsed} days remaining.`,
        currency,
        metricValue: b.percentageUsed,
        actionUrl: '/budgets',
      })
    } else if (
      b.pacePercentageDiff >= 25 &&
      daysElapsed >= 7 &&
      b.actualSpent < b.budgetAmount
    ) {
      insights.push({
        id: `budget_pace_${b.budgetId}`,
        type: 'BUDGET_PACE',
        severity: 'WARNING',
        title: `${b.categoryName} spending ahead of pace`,
        description: `${b.categoryName} spending is ${b.pacePercentageDiff}% above expected calendar pace for day ${daysElapsed}.`,
        currency,
        metricValue: b.pacePercentageDiff,
        actionUrl: '/budgets',
      })
    }
  }

  // 3. Check Largest Individual Expense
  const biggestExp = await getBiggestExpenses(
    userId,
    'current_month',
    monthStr,
    undefined,
    undefined,
    currency,
    1,
  )
  if (biggestExp.expenses.length > 0 && catBreakdown.totalExpenses > 0) {
    const topExp = biggestExp.expenses[0]
    const share = (topExp.amount / catBreakdown.totalExpenses) * 100
    if (share >= 20 && topExp.amount >= significanceMinAmount) {
      insights.push({
        id: `largest_exp_${topExp.id}`,
        type: 'LARGEST_EXPENSE',
        severity: 'INFO',
        title: 'Largest expense of the period',
        description: `Your largest expense was ${topExp.description} at ${topExp.amount.toLocaleString()} ${currency} (${Math.round(share)}% of total spending).`,
        currency,
        metricValue: topExp.amount,
      })
    }
  }

  // 4. Check Savings Rate Milestone
  const summary = await getFinancialSummary(
    userId,
    'current_month',
    monthStr,
    undefined,
    undefined,
    currency,
  )
  const curSummary = summary.summaries.find((s) => s.currency === currency)
  if (curSummary && curSummary.savingsRate !== null && curSummary.income > 0) {
    if (curSummary.savingsRate >= 30) {
      insights.push({
        id: `savings_rate_${currency}`,
        type: 'SAVINGS_RATE',
        severity: 'SUCCESS',
        title: 'Strong savings rate',
        description: `Your savings rate is ${curSummary.savingsRate}% this period (net ${curSummary.net.toLocaleString()} ${currency}).`,
        currency,
        metricValue: curSummary.savingsRate,
      })
    }
  }

  // 5. Subscription Share
  const commitments = await getCommitmentsSummary(userId, currency)
  if (
    commitments.estimatedMonthlyCost > 0 &&
    catBreakdown.totalExpenses > 0 &&
    (commitments.estimatedMonthlyCost / catBreakdown.totalExpenses) * 100 >= 15
  ) {
    const subShare = Math.round(
      (commitments.estimatedMonthlyCost / catBreakdown.totalExpenses) * 100,
    )
    insights.push({
      id: `sub_share_${currency}`,
      type: 'SUBSCRIPTION_SHARE',
      severity: 'INFO',
      title: 'Subscription commitments',
      description: `Active subscriptions account for ${subShare}% of your monthly spending (${commitments.estimatedMonthlyCost.toLocaleString()} ${currency}/month).`,
      currency,
      metricValue: subShare,
      actionUrl: '/budgets',
    })
  }

  return { period, insights }
}
