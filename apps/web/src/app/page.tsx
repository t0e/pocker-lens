'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  Wallet,
  Plus,
  Landmark,
  CreditCard,
  PiggyBank,
  Smartphone,
  CircleDot,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  TrendingUp,
  ReceiptText,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  AccountResponse,
  AccountType,
  TransactionResponse,
  CategoryResponse,
  MonthlyFinancialSummaryResponse,
  PaginatedTransactionsResponse,
} from '@pocketlens/shared';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionResponse[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyFinancialSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);

  // Quick Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [accData, catData, txData, summaryData] = await Promise.all([
        apiClient<AccountResponse[]>('/accounts'),
        apiClient<CategoryResponse[]>('/categories'),
        apiClient<PaginatedTransactionsResponse>('/transactions?limit=5'),
        apiClient<MonthlyFinancialSummaryResponse>('/transactions/summary'),
      ]);

      setAccounts(accData);
      setCategories(catData);
      setRecentTransactions(txData.transactions);
      setMonthlySummary(summaryData);
    } catch {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const getAccountIcon = (type: AccountType) => {
    switch (type) {
      case 'bank':
        return <Landmark className="h-4 w-4" />;
      case 'credit_card':
        return <CreditCard className="h-4 w-4" />;
      case 'savings':
        return <PiggyBank className="h-4 w-4" />;
      case 'e_wallet':
        return <Smartphone className="h-4 w-4" />;
      case 'cash':
        return <Wallet className="h-4 w-4" />;
      default:
        return <CircleDot className="h-4 w-4" />;
    }
  };

  // Group balances per ISO currency
  const currencyTotals = accounts.reduce((acc, account) => {
    if (!account.isArchived) {
      const cur = account.currency;
      const balanceNum = parseFloat(account.currentBalance) || 0;
      acc[cur] = (acc[cur] || 0) + balanceNum;
    }
    return acc;
  }, {} as Record<string, number>);

  const activeAccounts = accounts.filter((a) => !a.isArchived);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Welcome back, {user?.displayName || 'User'}!
            </h2>
            <Badge variant="success" className="space-x-1 hidden sm:inline-flex">
              <ShieldCheck className="h-3 w-3" />
              <span>Phase 3 Verified</span>
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Real-time balance tracking, income/expenses, and account transfers.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="space-x-1.5 text-xs shadow-sm shadow-emerald-500/10"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Transaction</span>
          </Button>
          <Link href="/accounts">
            <Button variant="outline" size="sm" className="space-x-1.5 text-xs">
              <Wallet className="h-3.5 w-3.5" />
              <span>Accounts</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Total Balances Banner */}
      <Card className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white dark:from-zinc-900 dark:to-zinc-950 border-zinc-700/50 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Total Balance by Currency
              </span>
            </div>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title={showBalance ? 'Hide Balances' : 'Show Balances'}
            >
              {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>

          {activeAccounts.length === 0 ? (
            <div className="py-4 space-y-2">
              <div className="text-2xl sm:text-3xl font-extrabold text-zinc-300">
                No accounts added yet
              </div>
              <p className="text-xs text-zinc-400">
                Create your first cash wallet, bank account, or card to start tracking balances.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-3">
              {Object.entries(currencyTotals).map(([currency, total]) => (
                <div
                  key={currency}
                  className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-zinc-400">{currency} Balance</span>
                  <span className="text-2xl sm:text-3xl font-black text-zinc-50 mt-1">
                    {showBalance ? formatMoney(total, currency) : '••••••••'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Monthly Financial Cash Flow Summary (Per Currency, Excluding Transfers) */}
      {monthlySummary && monthlySummary.summaries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center space-x-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span>Current Month Cash Flow ({monthlySummary.month})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {monthlySummary.summaries.map((s) => (
              <Card key={s.currency} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="font-mono text-xs font-bold">
                    {s.currency} Summary
                  </Badge>
                  <span className="text-[11px] text-zinc-400">Excludes transfers</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40">
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                      Income
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 block truncate">
                      +{formatMoney(s.income, s.currency)}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40">
                    <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 block">
                      Expenses
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-rose-700 dark:text-rose-400 mt-0.5 block truncate">
                      -{formatMoney(s.expense, s.currency)}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60">
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 block">
                      Net Flow
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5 block truncate">
                      {parseFloat(s.net) >= 0 ? '+' : ''}
                      {formatMoney(s.net, s.currency)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Grid: Recent Transactions & Account Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions List */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Transactions</CardTitle>
              <CardDescription className="text-xs">Latest activity across all accounts</CardDescription>
            </div>
            <Link
              href="/transactions"
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
            >
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-xs text-zinc-400">Loading transactions...</div>
            ) : recentTransactions.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <ReceiptText className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No transactions yet
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsModalOpen(true)}
                  className="text-xs space-x-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add First Transaction</span>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recentTransactions.map((tx) => {
                  const isExpense = tx.type === 'expense';
                  const isIncome = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';

                  return (
                    <div key={tx.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center space-x-3 min-w-0 pr-2">
                        <div
                          className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isExpense
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                              : isIncome
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {isExpense ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : isIncome ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowLeftRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                            {tx.description}
                          </div>
                          <div className="text-[11px] text-zinc-400 flex items-center space-x-1">
                            <span>
                              {isTransfer
                                ? `${tx.account?.name || 'Source'} → ${tx.transferAccount?.name || 'Dest'}`
                                : tx.account?.name}
                            </span>
                            {tx.category && <span>• {tx.category.name}</span>}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`text-sm sm:text-base font-bold shrink-0 ${
                          isExpense
                            ? 'text-zinc-900 dark:text-zinc-50'
                            : isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {isExpense ? '-' : isIncome ? '+' : '⇄ '}
                        {formatMoney(tx.amount, tx.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roadmap & Status Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">Implementation Stage</CardTitle>
            </div>
            <CardDescription className="text-xs">Phase progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-1">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span>Phase 3: Transactions</span>
                <Badge variant="success">Active & Verified</Badge>
              </div>
              <p className="text-emerald-700 dark:text-emerald-400 text-[11px] leading-relaxed">
                Income, expenses, and same-currency atomic transfers with zero balance drift.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 space-y-1 opacity-80">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                <span>Phase 4: Receipt Scanning & OCR</span>
                <Badge variant="phase">Next Phase</Badge>
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                English and Vietnamese receipt extraction via background BullMQ worker pipeline.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Add Transaction Modal */}
      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchDashboardData}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
