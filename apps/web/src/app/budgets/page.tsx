'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PieChart,
  Plus,
  RotateCcw,
  Calendar,
  CreditCard,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Pause,
  Play,
  Copy,
  Loader2,
  TrendingDown,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  MonthlyBudgetsResponse,
  BudgetResponse,
  CategoryResponse,
  AccountResponse,
  RecurringTransactionResponse,
  UpcomingOccurrenceResponse,
  SubscriptionSummaryResponse,
} from '@pocketlens/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BudgetModal } from '@/components/budgets/BudgetModal';
import { RecurringModal } from '@/components/recurring/RecurringModal';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';

export default function BudgetsPage() {
  // Tabs: 'budgets' | 'subscriptions' | 'upcoming' | 'recurring'
  const [activeTab, setActiveTab] = useState<'budgets' | 'subscriptions' | 'upcoming' | 'recurring'>('budgets');

  // Month state for budgets
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Data states
  const [budgetsData, setBudgetsData] = useState<MonthlyBudgetsResponse | null>(null);
  const [subscriptionsData, setSubscriptionsData] = useState<SubscriptionSummaryResponse | null>(null);
  const [upcomingList, setUpcomingList] = useState<UpcomingOccurrenceResponse[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringTransactionResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingDue, setIsProcessingDue] = useState(false);

  // Modals state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState<BudgetResponse | null>(null);

  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [recurringToEdit, setRecurringToEdit] = useState<RecurringTransactionResponse | null>(null);
  const [modalIsSubscription, setModalIsSubscription] = useState(false);

  // Load categories and accounts once
  useEffect(() => {
    apiClient<CategoryResponse[]>('/categories')
      .then((res) => setCategories(res || []))
      .catch(() => {});

    apiClient<AccountResponse[]>('/accounts')
      .then((res) => setAccounts(res || []))
      .catch(() => {});
  }, []);

  // Fetch budgets data whenever currentMonth changes
  const fetchBudgets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient<MonthlyBudgetsResponse>(`/budgets?month=${currentMonth}`);
      setBudgetsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load budgets');
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  // Fetch subscriptions
  const fetchSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient<SubscriptionSummaryResponse>('/subscriptions');
      setSubscriptionsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscriptions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch upcoming
  const fetchUpcoming = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient<{ upcoming: UpcomingOccurrenceResponse[] }>('/recurring/upcoming?days=35');
      setUpcomingList(data.upcoming || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load upcoming payments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch all recurring
  const fetchRecurring = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient<{ recurringTransactions: RecurringTransactionResponse[] }>('/recurring');
      setRecurringList(data.recurringTransactions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load recurring transactions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'budgets') {
      fetchBudgets();
    } else if (activeTab === 'subscriptions') {
      fetchSubscriptions();
    } else if (activeTab === 'upcoming') {
      fetchUpcoming();
    } else if (activeTab === 'recurring') {
      fetchRecurring();
    }
  }, [activeTab, fetchBudgets, fetchSubscriptions, fetchUpcoming, fetchRecurring]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevYear -= 1;
      prevMonth = 12;
    }
    setCurrentMonth(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth === 13) {
      nextYear += 1;
      nextMonth = 1;
    }
    setCurrentMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, 1));
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };

  // Budget Actions
  const handleDeleteBudget = async (id: string) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;
    try {
      await apiClient(`/budgets/${id}`, { method: 'DELETE' });
      fetchBudgets();
    } catch (err: any) {
      alert(err.message || 'Failed to delete budget');
    }
  };

  const handleCopyPreviousMonth = async () => {
    const [year, month] = currentMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevYear -= 1;
      prevMonth = 12;
    }
    const fromMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    try {
      const res: any = await apiClient('/budgets/copy', {
        method: 'POST',
        body: JSON.stringify({
          fromMonth,
          toMonth: currentMonth,
        }),
      });
      alert(res.message || 'Budgets copied successfully');
      fetchBudgets();
    } catch (err: any) {
      alert(err.message || 'Failed to copy budgets from previous month');
    }
  };

  // Recurring / Subscription Actions
  const handleToggleRecurringStatus = async (item: RecurringTransactionResponse) => {
    try {
      await apiClient(`/recurring/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (activeTab === 'subscriptions') fetchSubscriptions();
      else if (activeTab === 'recurring') fetchRecurring();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recurring template? Historical transactions will remain intact.')) {
      return;
    }
    try {
      await apiClient(`/recurring/${id}`, { method: 'DELETE' });
      if (activeTab === 'subscriptions') fetchSubscriptions();
      else if (activeTab === 'recurring') fetchRecurring();
    } catch (err: any) {
      alert(err.message || 'Failed to delete recurring transaction');
    }
  };

  const handleProcessDue = async () => {
    setIsProcessingDue(true);
    try {
      const res: any = await apiClient('/recurring/process-due', { method: 'POST' });
      alert(`Processed due items: ${res.generatedCount} transaction(s) generated.`);
      if (activeTab === 'upcoming') fetchUpcoming();
      else if (activeTab === 'recurring') fetchRecurring();
      else if (activeTab === 'subscriptions') fetchSubscriptions();
    } catch (err: any) {
      alert(err.message || 'Failed to process due recurring transactions');
    } finally {
      setIsProcessingDue(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Budgets & Recurring Planning
            </h2>
            <Badge variant="phase" className="text-[10px]">Phase 7 Planning</Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Category spending limits, subscription tracking, and automated recurring expenses
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'budgets' ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setBudgetToEdit(null);
                setIsBudgetModalOpen(true);
              }}
              className="space-x-1.5 shadow-sm shadow-emerald-500/10"
            >
              <Plus className="h-4 w-4" />
              <span>New Budget</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setRecurringToEdit(null);
                setModalIsSubscription(activeTab === 'subscriptions');
                setIsRecurringModalOpen(true);
              }}
              className="space-x-1.5 shadow-sm shadow-emerald-500/10"
            >
              <Plus className="h-4 w-4" />
              <span>{activeTab === 'subscriptions' ? 'Add Subscription' : 'Add Recurring'}</span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center space-x-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-1 p-1 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl overflow-x-auto shadow-sm">
        {[
          { label: 'Category Budgets', value: 'budgets', icon: PieChart },
          { label: 'Subscriptions', value: 'subscriptions', icon: CreditCard },
          { label: 'Upcoming Payments', value: 'upcoming', icon: Calendar },
          { label: 'All Recurring', value: 'recurring', icon: RotateCcw },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as any)}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: CATEGORY BUDGETS */}
      {activeTab === 'budgets' && (
        <div className="space-y-6">
          {/* Month Selector Bar */}
          <div className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handlePrevMonth} className="p-2">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-50 min-w-[150px] text-center">
                {formatMonthLabel(currentMonth)}
              </span>
              <Button variant="outline" size="sm" onClick={handleNextMonth} className="p-2">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPreviousMonth}
                className="hidden sm:flex items-center space-x-1.5 text-xs"
                title="Copy previous month budgets to this month"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy from Prev Month</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(new Date().toISOString().slice(0, 7))}
                className="text-xs"
              >
                Current Month
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
              <span className="text-sm">Calculating budget usage & progress...</span>
            </div>
          ) : !budgetsData || budgetsData.budgets.length === 0 ? (
            /* Empty State */
            <Card className="border-dashed border-2 py-14">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <PieChart className="h-8 w-8" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    No budgets set for {formatMonthLabel(currentMonth)}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Set category spending limits to track how much you can still spend this month.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setBudgetToEdit(null);
                      setIsBudgetModalOpen(true);
                    }}
                    className="space-x-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Budget</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={handleCopyPreviousMonth}
                    className="space-x-1.5"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy Prev Month</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Month Summaries Cards per Currency */}
              {Object.entries(budgetsData.summaries).map(([currency, sum]) => (
                <Card key={currency} className="p-4 sm:p-5 bg-gradient-to-br from-zinc-900 to-zinc-800 text-white dark:from-zinc-900 dark:to-zinc-950 border-zinc-700/50 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-700/60">
                    <div>
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        {currency} Monthly Budget Overview
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-zinc-50 mt-0.5">
                        {formatMoney(sum.totalSpent, currency)} / {formatMoney(sum.totalBudget, currency)}
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className={`text-xs sm:text-sm font-extrabold px-2.5 py-1 rounded-full ${
                        sum.overallPercentage >= 100
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : sum.overallPercentage >= 80
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}>
                        {sum.overallPercentage}% Used
                      </span>
                      <div className="text-xs text-zinc-400 mt-1">
                        {sum.totalRemaining >= 0
                          ? `${formatMoney(sum.totalRemaining, currency)} remaining`
                          : `Over budget by ${formatMoney(Math.abs(sum.totalRemaining), currency)}`}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="pt-3 space-y-1">
                    <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sum.overallPercentage >= 100
                            ? 'bg-rose-500'
                            : sum.overallPercentage >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(sum.overallPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </Card>
              ))}

              {/* Category Budgets Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {budgetsData.budgets.map((b) => {
                  const isOver = b.status === 'OVER_BUDGET';
                  const isWarning = b.status === 'WARNING';

                  return (
                    <Card key={b.id} className="p-4 sm:p-5 space-y-3.5 hover:shadow-md transition-shadow">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                              {b.categoryName}
                            </span>
                            <Badge variant="default" className="text-[10px] font-mono">
                              {b.currency}
                            </Badge>
                          </div>
                          <span className="text-xs text-zinc-400 font-medium">
                            {formatMoney(b.spent, b.currency)} of {formatMoney(b.amount, b.currency)}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="text-right">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1 ${
                              isOver
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : isWarning
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            <span>{b.percentage}%</span>
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOver ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(b.percentage, 100)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-zinc-400">
                            {isOver ? 'Over budget by' : 'Remaining'}
                          </span>
                          <span
                            className={`font-bold font-mono ${
                              isOver
                                ? 'text-rose-600 dark:text-rose-400'
                                : isWarning
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            {isOver
                              ? formatMoney(b.overBudgetAmount, b.currency)
                              : formatMoney(b.remaining, b.currency)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                        <button
                          onClick={() => {
                            setBudgetToEdit(b);
                            setIsBudgetModalOpen(true);
                          }}
                          className="p-1.5 text-xs text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center space-x-1"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteBudget(b.id)}
                          className="p-1.5 text-xs text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center space-x-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBSCRIPTIONS */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
              <span className="text-sm">Loading active subscriptions...</span>
            </div>
          ) : !subscriptionsData || subscriptionsData.subscriptions.length === 0 ? (
            <Card className="border-dashed border-2 py-14">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CreditCard className="h-8 w-8" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    No subscriptions tracked yet
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Add services like Netflix, Spotify, iCloud, or gym memberships to monitor monthly recurring costs.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setRecurringToEdit(null);
                    setModalIsSubscription(true);
                    setIsRecurringModalOpen(true);
                  }}
                  className="space-x-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add First Subscription</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Estimated Monthly Cost Banners per Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(subscriptionsData.monthlyEstimates).map(([currency, est]) => (
                  <Card key={currency} className="p-4 bg-zinc-900 text-white dark:bg-zinc-950 border-zinc-800">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      {currency} Monthly Estimated Cost
                    </span>
                    <div className="text-2xl font-black text-zinc-50 mt-1">
                      {formatMoney(est, currency)}
                      <span className="text-xs font-normal text-zinc-400 ml-1">/ month</span>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Subscriptions List */}
              <Card className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden shadow-sm">
                {subscriptionsData.subscriptions.map((sub) => (
                  <div key={sub.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/60 transition-colors">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="h-11 w-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {sub.description}
                          </span>
                          {!sub.isActive && (
                            <Badge variant="default" className="bg-zinc-100 text-zinc-500 text-[10px]">
                              Paused
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-zinc-400">
                          <span>{sub.accountName}</span>
                          {sub.categoryName && (
                            <>
                              <span>•</span>
                              <span>{sub.categoryName}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                            Next: {new Date(sub.nextRunDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-4 shrink-0">
                      <div className="text-left sm:text-right">
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                          {formatMoney(sub.amount, sub.currency)}
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {sub.frequency.toLowerCase()}
                          {sub.interval > 1 ? ` (every ${sub.interval})` : ''}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleToggleRecurringStatus(sub)}
                          className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title={sub.isActive ? 'Pause subscription' : 'Resume subscription'}
                        >
                          {sub.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setRecurringToEdit(sub);
                            setModalIsSubscription(true);
                            setIsRecurringModalOpen(true);
                          }}
                          className="p-2 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRecurring(sub.id)}
                          className="p-2 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: UPCOMING PAYMENTS */}
      {activeTab === 'upcoming' && (
        <div className="space-y-6">
          <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-start space-x-2 text-xs text-indigo-900 dark:text-indigo-200">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Upcoming payments are scheduled projections over the next 35 days. They do not affect account balances or category budgets until actually generated.
            </span>
          </div>

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
              <span className="text-sm">Calculating upcoming scheduled dates...</span>
            </div>
          ) : upcomingList.length === 0 ? (
            <Card className="border-dashed border-2 py-14">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center">
                  <Calendar className="h-8 w-8" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    No upcoming payments scheduled
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Active recurring expenses and subscriptions will automatically appear here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden shadow-sm">
              {upcomingList.map((item, idx) => {
                const dateObj = new Date(item.scheduledFor);
                const isToday = new Date().toDateString() === dateObj.toDateString();

                return (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-zinc-50/70 dark:hover:bg-zinc-900/60 transition-colors">
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="h-11 w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex flex-col items-center justify-center shrink-0 border border-zinc-200/60 dark:border-zinc-700/60 font-bold">
                        <span className="text-[10px] uppercase text-zinc-400">
                          {dateObj.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span className="text-xs">{dateObj.getUTCDate()}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {item.description}
                          </span>
                          {isToday && (
                            <Badge variant="success" className="text-[10px]">
                              Due Today
                            </Badge>
                          )}
                          {item.isSubscription && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
                              Subscription
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          <span>{item.accountName}</span>
                          {item.categoryName && <span> • {item.categoryName}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono font-bold text-sm text-zinc-900 dark:text-zinc-50">
                      {item.type === 'EXPENSE' ? '-' : '+'}
                      {formatMoney(item.amount, item.currency)}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: ALL RECURRING */}
      {activeTab === 'recurring' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-medium">
              Manage recurring expense and income generators
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleProcessDue}
              disabled={isProcessingDue}
              className="text-xs space-x-1.5"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isProcessingDue ? 'animate-spin' : ''}`} />
              <span>Check Due Items</span>
            </Button>
          </div>

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
              <span className="text-sm">Loading recurring templates...</span>
            </div>
          ) : recurringList.length === 0 ? (
            <Card className="border-dashed border-2 py-14">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center">
                  <RotateCcw className="h-8 w-8" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    No recurring templates
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Automate repeating expenses like rent, utilities, and income like monthly salaries.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setRecurringToEdit(null);
                    setModalIsSubscription(false);
                    setIsRecurringModalOpen(true);
                  }}
                  className="space-x-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Recurring Item</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden shadow-sm">
              {recurringList.map((rec) => (
                <div key={rec.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/60 transition-colors">
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0">
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {rec.description}
                        </span>
                        {!rec.isActive ? (
                          <Badge variant="default" className="bg-zinc-100 text-zinc-500 text-[10px]">
                            Paused
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-zinc-400">
                        <span>{rec.accountName}</span>
                        {rec.categoryName && <span>• {rec.categoryName}</span>}
                        <span>•</span>
                        <span>Repeat: {rec.frequency.toLowerCase()}</span>
                        <span>•</span>
                        <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                          Next: {new Date(rec.nextRunDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 shrink-0">
                    <div className="text-left sm:text-right font-mono font-bold text-sm text-zinc-900 dark:text-zinc-50">
                      {rec.type === 'EXPENSE' ? '-' : '+'}
                      {formatMoney(rec.amount, rec.currency)}
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleToggleRecurringStatus(rec)}
                        className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title={rec.isActive ? 'Pause' : 'Resume'}
                      >
                        {rec.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => {
                          setRecurringToEdit(rec);
                          setModalIsSubscription(rec.isSubscription);
                          setIsRecurringModalOpen(true);
                        }}
                        className="p-2 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRecurring(rec.id)}
                        className="p-2 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Budget Modal */}
      <BudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => {
          setIsBudgetModalOpen(false);
          setBudgetToEdit(null);
        }}
        onSuccess={fetchBudgets}
        categories={categories}
        initialMonth={currentMonth}
        budgetToEdit={budgetToEdit}
      />

      {/* Recurring / Subscription Modal */}
      <RecurringModal
        isOpen={isRecurringModalOpen}
        onClose={() => {
          setIsRecurringModalOpen(false);
          setRecurringToEdit(null);
        }}
        onSuccess={() => {
          if (activeTab === 'subscriptions') fetchSubscriptions();
          else if (activeTab === 'upcoming') fetchUpcoming();
          else if (activeTab === 'recurring') fetchRecurring();
        }}
        accounts={accounts}
        categories={categories}
        itemToEdit={recurringToEdit}
        defaultIsSubscription={modalIsSubscription}
      />
    </div>
  );
}
