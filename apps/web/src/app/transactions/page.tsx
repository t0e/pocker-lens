'use client';

import React from 'react';
import { Search, Filter, ArrowDownLeft, ArrowUpRight, Receipt, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MOCK_TRANSACTIONS } from '@/data/mock-data';
import { formatCurrency } from '@/lib/utils';

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Transactions</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Filter, search, and review all captured transactions</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="phase">Phase 2: Live CRUD</Badge>
        </div>
      </div>

      {/* Filter and Search Bar Shell */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search merchant, category, or note..."
            disabled
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 disabled:opacity-60"
          />
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" className="space-x-1 text-xs" disabled>
            <Filter className="h-3.5 w-3.5" />
            <span>Filters</span>
          </Button>
          <Button variant="secondary" size="sm" className="text-xs" disabled>
            Export
          </Button>
        </div>
      </div>

      {/* Transactions List */}
      <Card>
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              August 2026 Activity (Demo Preview)
            </CardTitle>
            <span className="text-xs text-zinc-400">{MOCK_TRANSACTIONS.length} items</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {MOCK_TRANSACTIONS.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                <div className="flex items-center space-x-3.5">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    tx.type === 'income'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}>
                    {tx.type === 'income' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{tx.merchant}</span>
                      {tx.receiptAttached && (
                        <span title="Receipt Scanned">
                          <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
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
                <div className={`text-sm font-bold ${
                  tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'
                }`}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
