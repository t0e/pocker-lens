"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FinancialSummaryResponse,
  CashFlowTrendsResponse,
  CategoryBreakdownResponse,
  MerchantBreakdownResponse,
  BiggestExpensesResponse,
  BudgetPerformanceResponse,
  CommitmentsSummaryResponse,
  SpendingInsightsResponse,
  TimeRangeType,
} from "@pocketlens/shared";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CashFlowChart } from "@/components/analytics/CashFlowChart";
import { CategoryBreakdownChart } from "@/components/analytics/CategoryBreakdownChart";
import { SpendingPaceIndicator } from "@/components/analytics/SpendingPaceIndicator";
import { DeterministicInsightsCard } from "@/components/analytics/DeterministicInsightsCard";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  ShoppingBag,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  CreditCard,
  Receipt,
  Sparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { ReportingCurrencySelector } from "@/components/fx/ReportingCurrencySelector";
import { formatCurrencyAmount } from "@pocketlens/shared";

const TIME_RANGES: { value: TimeRangeType; label: string }[] = [
  { value: "current_month", label: "This Month" },
  { value: "previous_month", label: "Last Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "last_6_months", label: "Last 6 Months" },
  { value: "current_year", label: "This Year" },
];

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeType>("current_month");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("VND");
  const [reportingCurrency, setReportingCurrency] = useState<string>("VND");
  const [isLoading, setIsLoading] = useState(true);

  // Analytics Datasets
  const [summary, setSummary] = useState<FinancialSummaryResponse | null>(null);
  const [trends, setTrends] = useState<CashFlowTrendsResponse | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdownResponse | null>(null);
  const [merchants, setMerchants] = useState<MerchantBreakdownResponse | null>(null);
  const [biggestExpenses, setBiggestExpenses] = useState<BiggestExpensesResponse | null>(null);
  const [budgetPerf, setBudgetPerf] = useState<BudgetPerformanceResponse | null>(null);
  const [commitments, setCommitments] = useState<CommitmentsSummaryResponse | null>(null);
  const [insights, setInsights] = useState<SpendingInsightsResponse | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams({
        timeRange,
        currency: selectedCurrency,
        reportingCurrency,
      }).toString();

      const [
        summaryData,
        trendsData,
        categoriesData,
        merchantsData,
        biggestData,
        budgetData,
        commitmentsData,
        insightsData,
      ] = await Promise.all([
        apiClient<FinancialSummaryResponse>(`/analytics/summary?${queryParams}`),
        apiClient<CashFlowTrendsResponse>(`/analytics/trends?currency=${selectedCurrency}&months=6`),
        apiClient<CategoryBreakdownResponse>(`/analytics/categories?${queryParams}`),
        apiClient<MerchantBreakdownResponse>(`/analytics/merchants?${queryParams}&limit=6`),
        apiClient<BiggestExpensesResponse>(`/analytics/expenses/biggest?${queryParams}&limit=5`),
        apiClient<BudgetPerformanceResponse>(`/analytics/budgets?currency=${selectedCurrency}`),
        apiClient<CommitmentsSummaryResponse>(`/analytics/subscriptions?currency=${selectedCurrency}`),
        apiClient<SpendingInsightsResponse>(`/analytics/insights?currency=${selectedCurrency}`),
      ]);

      setSummary(summaryData);
      setTrends(trendsData);
      setCategories(categoriesData);
      setMerchants(merchantsData);
      setBiggestExpenses(biggestData);
      setBudgetPerf(budgetData);
      setCommitments(commitmentsData);
      setInsights(insightsData);

      // Auto-select currency if current selection has no data and another has data
      if (summaryData.summaries.length > 0 && !summaryData.summaries.find((s) => s.currency === selectedCurrency)) {
        setSelectedCurrency(summaryData.summaries[0].currency);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, selectedCurrency, reportingCurrency]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const activeSummary =
    summary?.summaries.find((s) => s.currency === selectedCurrency) || summary?.summaries[0];

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* Page Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Financial Analytics
            </h1>
            <Badge variant="phase">Phase 9 Multi-Currency</Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Multi-currency cashflow trends, spending pace, category breakdowns, and cross-currency converted insights.
          </p>
        </div>

        {/* Time Range and Currency Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Reporting Currency Selector */}
          <ReportingCurrencySelector
            currentCurrency={reportingCurrency}
            onCurrencyChange={(c) => setReportingCurrency(c)}
          />

          {/* Time Range Selector */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  timeRange === tr.value
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>

          {/* Currency Switcher */}
          {summary && summary.summaries.length > 1 && (
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {summary.summaries.map((s) => (
                <option key={s.currency} value={s.currency}>
                  {s.currency}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-colors"
            title="Refresh Analytics"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isLoading && !summary ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-sm text-zinc-400 font-medium">Aggregating financial analytics...</p>
        </div>
      ) : (
        <>
          {/* Converted Summary Banner (when user has multi-currency data) */}
          {summary?.convertedSummary && (
            <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-900 dark:to-zinc-950 border-l-4 border-l-emerald-500">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Cross-Currency Converted Period Total ({summary.convertedSummary.reportingCurrency})
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-xl sm:text-2xl font-black text-white">
                    Net: ≈ {formatCurrencyAmount(summary.convertedSummary.totalNet, summary.convertedSummary.reportingCurrency)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    (Income: {formatCurrencyAmount(summary.convertedSummary.totalIncome, summary.convertedSummary.reportingCurrency)} • Expense: {formatCurrencyAmount(summary.convertedSummary.totalExpenses, summary.convertedSummary.reportingCurrency)})
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-zinc-400">
                Converted from: {summary.convertedSummary.convertedFromCurrencies.join(", ") || selectedCurrency}
              </div>
            </Card>
          )}

          {/* Section 1: Financial Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Income */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-semibold">Income</span>
                  <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {formatMoney(activeSummary?.income || 0, selectedCurrency)}
                </div>
                <div className="text-[11px] flex items-center space-x-1 text-zinc-400">
                  {activeSummary?.momComparison?.incomeChangePercentage !== null &&
                  activeSummary?.momComparison?.incomeChangePercentage !== undefined ? (
                    <span
                      className={`flex items-center font-medium ${
                        activeSummary.momComparison.incomeChangePercentage >= 0
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }`}
                    >
                      {activeSummary.momComparison.incomeChangePercentage >= 0 ? (
                        <ArrowUpRight className="h-3 w-3 inline" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 inline" />
                      )}
                      {activeSummary.momComparison.incomeChangePercentage >= 0 ? "+" : ""}
                      {activeSummary.momComparison.incomeChangePercentage}% vs last period
                    </span>
                  ) : (
                    <span>{activeSummary?.incomeCount || 0} income entries</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Total Expenses */}
            <Card className="border-l-4 border-l-rose-500">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-semibold">Expenses</span>
                  <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                    <TrendingDown className="h-4 w-4" />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {formatMoney(activeSummary?.expenses || 0, selectedCurrency)}
                </div>
                <div className="text-[11px] flex items-center space-x-1 text-zinc-400">
                  {activeSummary?.momComparison?.expenseChangePercentage !== null &&
                  activeSummary?.momComparison?.expenseChangePercentage !== undefined ? (
                    <span
                      className={`flex items-center font-medium ${
                        activeSummary.momComparison.expenseChangePercentage > 0
                          ? "text-rose-500"
                          : "text-emerald-500"
                      }`}
                    >
                      {activeSummary.momComparison.expenseChangePercentage > 0 ? (
                        <ArrowUpRight className="h-3 w-3 inline" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 inline" />
                      )}
                      {activeSummary.momComparison.expenseChangePercentage > 0 ? "+" : ""}
                      {activeSummary.momComparison.expenseChangePercentage}% vs last period
                    </span>
                  ) : (
                    <span>{activeSummary?.expenseCount || 0} expense entries</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Net Cash Flow */}
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-semibold">Net Cash Flow</span>
                  <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                    <DollarSign className="h-4 w-4" />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {(activeSummary?.net || 0) >= 0 ? "+" : ""}
                  {formatMoney(activeSummary?.net || 0, selectedCurrency)}
                </div>
                <div className="text-[11px] text-zinc-400">
                  <span>
                    {(activeSummary?.net || 0) >= 0 ? "Surplus" : "Deficit"} for {summary?.period.label}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Savings Rate */}
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-semibold">Savings Rate</span>
                  <span className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {activeSummary?.savingsRate !== null ? `${activeSummary?.savingsRate}%` : "N/A"}
                </div>
                <div className="text-[11px] text-zinc-400">
                  <span>
                    {activeSummary?.income && activeSummary.income > 0
                      ? "Calculated as Net / Total Income"
                      : "No income recorded in period"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 2: Deterministic Spending Insights */}
          {insights && insights.insights.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center space-x-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  <span>Spending Insights ({summary?.period.label})</span>
                </h2>
              </div>
              <DeterministicInsightsCard insights={insights.insights} />
            </div>
          )}

          {/* Section 3: Monthly Trends & Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Cash Flow Trends Chart (7 cols) */}
            <Card className="lg:col-span-7">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span>Cash Flow Trend ({selectedCurrency})</span>
                </CardTitle>
                <CardDescription>Monthly income vs. expense progression over time</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <CashFlowChart months={trends?.months || []} currency={selectedCurrency} />
              </CardContent>
            </Card>

            {/* Category Breakdown (5 cols) */}
            <Card className="lg:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-blue-500" />
                  <span>Category Breakdown</span>
                </CardTitle>
                <CardDescription>Expense allocation for {summary?.period.label}</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <CategoryBreakdownChart
                  categories={categories?.categories || []}
                  currency={selectedCurrency}
                />
              </CardContent>
            </Card>
          </div>

          {/* Section 4: Budget Pace & Commitments */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Spending Pace Indicator (7 cols) */}
            <Card className="lg:col-span-7">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  <span>Budget Pace & Limits</span>
                </CardTitle>
                <CardDescription>
                  Real-time calendar pace vs. actual monthly category budgets
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <SpendingPaceIndicator
                  items={budgetPerf?.items || []}
                  daysInMonth={budgetPerf?.daysInMonth || 30}
                  daysElapsed={budgetPerf?.daysElapsed || 15}
                  currency={selectedCurrency}
                />
              </CardContent>
            </Card>

            {/* Subscriptions & Commitments Summary (5 cols) */}
            <Card className="lg:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center space-x-2">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  <span>Subscriptions & Commitments</span>
                </CardTitle>
                <CardDescription>Normalized recurring payment commitments</CardDescription>
              </CardHeader>
              <CardContent className="pt-2 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1">
                    <span className="text-[11px] text-zinc-500 font-medium">Estimated Monthly</span>
                    <div className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100">
                      {formatMoney(commitments?.estimatedMonthlyCost || 0, selectedCurrency)}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1">
                    <span className="text-[11px] text-zinc-500 font-medium">Next 30 Days Due</span>
                    <div className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100">
                      {formatMoney(commitments?.next30DaysCommitment || 0, selectedCurrency)}
                    </div>
                  </div>
                </div>

                {/* Subscriptions List */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Active Subscriptions ({commitments?.activeSubscriptionsCount || 0})
                  </span>
                  {commitments && commitments.topSubscriptions.length > 0 ? (
                    <div className="space-y-2">
                      {commitments.topSubscriptions.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100 block truncate">
                              {sub.description}
                            </span>
                            <span className="text-[10px] text-zinc-400 capitalize">
                              {sub.frequency.toLowerCase()}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            {formatMoney(sub.estimatedMonthlyCost, selectedCurrency)}/mo
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">No active subscriptions configured.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 5: Top Merchants & Largest Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Top Merchants (6 cols) */}
            <Card className="lg:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center space-x-2">
                  <ShoppingBag className="h-4 w-4 text-teal-500" />
                  <span>Top Merchants</span>
                </CardTitle>
                <CardDescription>Highest spending destinations for {summary?.period.label}</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {merchants && merchants.merchants.length > 0 ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {merchants.merchants.map((m) => (
                      <div key={m.merchant} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="min-w-0">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 block truncate">
                            {m.merchant}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {m.transactionCount} transactions (avg. {formatMoney(m.averagePerTransaction, selectedCurrency)})
                          </span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 block">
                            {formatMoney(m.amount, selectedCurrency)}
                          </span>
                          <span className="text-[10px] text-zinc-400">{m.percentage}% of merchant spend</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 p-4 text-center">
                    No merchant-identified transactions in this period.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Biggest Expenses (6 cols) */}
            <Card className="lg:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center space-x-2">
                  <Receipt className="h-4 w-4 text-rose-500" />
                  <span>Largest Single Expenses</span>
                </CardTitle>
                <CardDescription>Top individual purchases in {summary?.period.label}</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {biggestExpenses && biggestExpenses.expenses.length > 0 ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {biggestExpenses.expenses.map((exp) => (
                      <div key={exp.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="min-w-0">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 block truncate">
                            {exp.description}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {exp.categoryName} • {exp.accountName}
                          </span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="font-bold text-rose-600 dark:text-rose-400 block">
                            -{formatMoney(exp.amount, selectedCurrency)}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {new Date(exp.transactionDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 p-4 text-center">
                    No individual expense entries in this period.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
