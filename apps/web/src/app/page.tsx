'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  Camera,
  MessageSquarePlus,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  MOCK_FINANCIAL_SUMMARY,
  MOCK_TRANSACTIONS,
  MOCK_CATEGORY_SPENDING,
} from '@/data/mock-data';
import { formatCurrency } from '@/lib/utils';

export default function DashboardPage() {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Demo Notice Banner */}
      <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50">
        <div className="flex items-center space-x-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-300">
          <Info className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong>Phase 1 Shell Active:</strong> Financial summaries below use isolated mock values to establish mobile & desktop layouts.
          </span>
        </div>
        <Badge variant="phase" className="hidden sm:inline-flex">Phase 1</Badge>
      </div>

      {/* Primary Financial Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Net Worth / Total Balance Card */}
        <Card className="md:col-span-2 relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-800 text-white dark:from-zinc-900 dark:to-zinc-950 border-zinc-700/50 shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Total Balance / Net Worth
              </span>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
                title={showBalance ? 'Hide Balance' : 'Show Balance'}
              >
                {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-baseline space-x-3 mt-1">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                {showBalance ? formatCurrency(MOCK_FINANCIAL_SUMMARY.totalBalance) : '••••••••'}
              </span>
              <span className="inline-flex items-center text-xs font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-800/50 px-2 py-0.5 rounded-full">
                <TrendingUp className="h-3 w-3 mr-1" />
                +12.4% this month
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
              <div>
                <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Monthly Income</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-zinc-100 mt-0.5">
                  {showBalance ? formatCurrency(MOCK_FINANCIAL_SUMMARY.monthlyIncome) : '••••'}
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
                  <ArrowUpRight className="h-3.5 w-3.5 text-rose-400" />
                  <span>Monthly Expenses</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-zinc-100 mt-0.5">
                  {showBalance ? formatCurrency(MOCK_FINANCIAL_SUMMARY.monthlyExpense) : '••••'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Capture Actions Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fast Capture</CardTitle>
            <CardDescription className="text-xs">Planned capture workflows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <button
              className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-zinc-200/70 dark:border-zinc-700/60 text-left group"
              onClick={() => alert('Receipt Scanning with OCR is scheduled for Phase 2!')}
            >
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Scan Receipt</div>
                  <div className="text-[11px] text-zinc-500">English & Vietnamese OCR</div>
                </div>
              </div>
              <Badge variant="phase">Phase 2</Badge>
            </button>

            <button
              className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-zinc-200/70 dark:border-zinc-700/60 text-left group"
              onClick={() => alert('Natural Language Entry is scheduled for Phase 2!')}
            >
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400 flex items-center justify-center">
                  <MessageSquarePlus className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Quick Text Entry</div>
                  <div className="text-[11px] text-zinc-500">Natural language input</div>
                </div>
              </div>
              <Badge variant="phase">Phase 2</Badge>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid: Recent Transactions & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions List */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Transactions</CardTitle>
              <CardDescription className="text-xs">Latest recorded activity</CardDescription>
            </div>
            <Badge variant="default">Demo View</Badge>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {MOCK_TRANSACTIONS.map((tx) => (
                <div key={tx.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.type === 'income'
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                    }`}>
                      {tx.type === 'income' ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {tx.merchant}
                        </span>
                        {tx.receiptAttached && (
                          <span title="Receipt Attached" className="shrink-0">
                            <Receipt className="h-3.5 w-3.5 text-zinc-400 hover:text-emerald-500 transition-colors" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-zinc-500 mt-0.5">
                        <span>{tx.category}</span>
                        <span>•</span>
                        <span>{tx.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold shrink-0 ml-4 ${
                    tx.type === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-900 dark:text-zinc-100'
                  }`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Category Spending Breakdown */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg">Spending Breakdown</CardTitle>
            <CardDescription className="text-xs">Top expense categories this month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {MOCK_CATEGORY_SPENDING.map((item) => (
              <div key={item.category} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-zinc-700 dark:text-zinc-300">{item.category}</span>
                  <div className="space-x-2 text-right">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(item.amount)}
                    </span>
                    <span className="text-zinc-400">({item.percentage}%)</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
