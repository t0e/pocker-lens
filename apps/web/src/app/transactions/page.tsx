'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Filter,
  Calendar,
  Layers,
  Edit2,
  Trash2,
  RotateCcw,
  Loader2,
  ReceiptText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Utensils,
  Car,
  Home,
  Film,
  HeartPulse,
  BookOpen,
  Zap,
  Plane,
  Sparkles,
  CircleEllipsis,
  Banknote,
  Briefcase,
  Award,
  TrendingUp,
  Gift,
  PlusCircle,
  Tag,
} from 'lucide-react';
import {
  TransactionResponse,
  TransactionType,
  AccountResponse,
  CategoryResponse,
  PaginatedTransactionsResponse,
} from '@pocketlens/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TransactionModal } from '@/components/transactions/TransactionModal';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filtering state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('date_desc');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionResponse | null>(null);
  const [repeatTransaction, setRepeatTransaction] = useState<TransactionResponse | null>(null);

  // Fetch accounts & categories once
  useEffect(() => {
    async function loadAuxData() {
      try {
        const [accs, cats] = await Promise.all([
          apiClient<AccountResponse[]>('/accounts?includeArchived=true'),
          apiClient<CategoryResponse[]>('/categories'),
        ]);
        setAccounts(accs);
        setCategories(cats);
      } catch (err: any) {
        console.error('Failed to load accounts or categories:', err);
      }
    }
    loadAuxData();
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sortBy,
      });

      if (typeFilter !== 'all') {
        params.append('type', typeFilter);
      }
      if (accountFilter !== 'all') {
        params.append('accountId', accountFilter);
      }
      if (categoryFilter !== 'all') {
        params.append('categoryId', categoryFilter);
      }
      if (currencyFilter !== 'all') {
        params.append('currency', currencyFilter);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }

      const data = await apiClient<PaginatedTransactionsResponse>(`/transactions?${params.toString()}`);
      setTransactions(data.transactions);
      setTotalPages(data.pagination.totalPages);
      setTotalCount(data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter, accountFilter, categoryFilter, currencyFilter, searchQuery, sortBy]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Keyboard shortcut listener ('N' or 'Cmd+K' / 'Ctrl+K')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === 'n' || e.key === 'N' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        setEditingTransaction(null);
        setRepeatTransaction(null);
        setIsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenCreate = () => {
    setEditingTransaction(null);
    setRepeatTransaction(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: TransactionResponse) => {
    setRepeatTransaction(null);
    setEditingTransaction(tx);
    setIsModalOpen(true);
  };

  const handleRepeat = (tx: TransactionResponse) => {
    setEditingTransaction(null);
    setRepeatTransaction(tx);
    setIsModalOpen(true);
  };

  const handleDelete = async (tx: TransactionResponse) => {
    if (!confirm(`Are you sure you want to delete "${tx.description}"? Account balances will be adjusted.`)) {
      return;
    }

    try {
      await apiClient(`/transactions/${tx.id}`, { method: 'DELETE' });
      await fetchTransactions();
    } catch (err: any) {
      alert(err.message || 'Failed to delete transaction');
    }
  };

  // Group transactions by date heading
  const groupedTransactions = transactions.reduce((groups, tx) => {
    const dateObj = new Date(tx.transactionDate);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    let dateLabel = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (dateObj.toDateString() === today.toDateString()) {
      dateLabel = 'Today';
    } else if (dateObj.toDateString() === yesterday.toDateString()) {
      dateLabel = 'Yesterday';
    }

    if (!groups[dateLabel]) {
      groups[dateLabel] = [];
    }
    groups[dateLabel].push(tx);
    return groups;
  }, {} as Record<string, TransactionResponse[]>);

  const getCategoryIcon = (iconName?: string | null) => {
    switch (iconName) {
      case 'utensils':
        return <Utensils className="h-3.5 w-3.5" />;
      case 'shopping-cart':
      case 'shopping-bag':
        return <ShoppingBag className="h-3.5 w-3.5" />;
      case 'car':
        return <Car className="h-3.5 w-3.5" />;
      case 'home':
        return <Home className="h-3.5 w-3.5" />;
      case 'film':
        return <Film className="h-3.5 w-3.5" />;
      case 'heart-pulse':
        return <HeartPulse className="h-3.5 w-3.5" />;
      case 'book-open':
        return <BookOpen className="h-3.5 w-3.5" />;
      case 'zap':
        return <Zap className="h-3.5 w-3.5" />;
      case 'plane':
        return <Plane className="h-3.5 w-3.5" />;
      case 'sparkles':
        return <Sparkles className="h-3.5 w-3.5" />;
      case 'banknote':
        return <Banknote className="h-3.5 w-3.5" />;
      case 'briefcase':
        return <Briefcase className="h-3.5 w-3.5" />;
      case 'award':
        return <Award className="h-3.5 w-3.5" />;
      case 'trending-up':
        return <TrendingUp className="h-3.5 w-3.5" />;
      case 'gift':
        return <Gift className="h-3.5 w-3.5" />;
      case 'rotate-ccw':
        return <RotateCcw className="h-3.5 w-3.5" />;
      case 'plus-circle':
        return <PlusCircle className="h-3.5 w-3.5" />;
      default:
        return <Tag className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Header and Quick Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Transactions
            </h2>
            <Badge variant="phase" className="text-[10px] hidden sm:inline-flex">Press &apos;N&apos; for Quick Add</Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Log and manage your expenses, income, and account transfers
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          className="space-x-1.5 shadow-sm shadow-emerald-500/10"
        >
          <Sparkles className="h-4 w-4" />
          <span>Quick Add</span>
        </Button>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center space-x-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="flex flex-col space-y-3 p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        {/* Search Bar & Type Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search description, merchant, notes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="absolute left-2.5 top-2.5 text-zinc-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>

          {/* Type Pills */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { label: 'All', value: 'all' },
              { label: 'Expenses', value: 'expense' },
              { label: 'Income', value: 'income' },
              { label: 'Transfers', value: 'transfer' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setTypeFilter(tab.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                  typeFilter === tab.value
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdown Filters and Sort */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
          {/* Account Filter */}
          <select
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Currency Filter */}
          <select
            value={currencyFilter}
            onChange={(e) => {
              setCurrencyFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Currencies</option>
            <option value="VND">VND</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 ml-auto"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="amount_desc">Highest Amount</option>
            <option value="amount_asc">Lowest Amount</option>
          </select>
        </div>
      </div>

      {/* Transactions List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
          <span className="text-sm">Loading transactions...</span>
        </div>
      ) : totalCount === 0 ? (
        /* Empty State */
        <Card className="border-dashed border-2 py-14">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ReceiptText className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                No transactions recorded
              </h3>
              <p className="text-xs text-zinc-500">
                {typeFilter !== 'all' || accountFilter !== 'all' || categoryFilter !== 'all'
                  ? 'No transactions match the selected filters.'
                  : 'Start logging your daily expenses, salary income, or account transfers with natural language or manual entry.'}
              </p>
            </div>
            <Button variant="primary" size="md" onClick={handleOpenCreate} className="space-x-1.5">
              <Sparkles className="h-4 w-4" />
              <span>Add First Transaction</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTransactions).map(([dateHeader, items]) => (
            <div key={dateHeader} className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1">
                {dateHeader}
              </div>

              <Card className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden shadow-sm">
                {items.map((tx) => {
                  const isExpense = tx.type === 'expense';
                  const isIncome = tx.type === 'income';
                  const isTransfer = tx.type === 'transfer';

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-zinc-50/70 dark:hover:bg-zinc-900/60 transition-colors group"
                    >
                      {/* Left side: Icon + Descriptions */}
                      <div className="flex items-center space-x-3.5 min-w-0 pr-2">
                        {/* Transaction Type Icon Badge */}
                        <div
                          className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            isExpense
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                              : isIncome
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {isExpense ? (
                            <ArrowDownLeft className="h-5 w-5" />
                          ) : isIncome ? (
                            <ArrowUpRight className="h-5 w-5" />
                          ) : (
                            <ArrowLeftRight className="h-5 w-5" />
                          )}
                        </div>

                        {/* Title, Merchant, Account, Category */}
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {tx.description}
                            </span>
                            {tx.merchant && (
                              <span className="hidden sm:inline-block text-xs text-zinc-400 truncate">
                                • {tx.merchant}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-zinc-500">
                            {/* Account Badge */}
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              {isTransfer
                                ? `${tx.account?.name || 'Source'} → ${tx.transferAccount?.name || 'Destination'}`
                                : tx.account?.name || 'Account'}
                            </span>

                            {/* Category Badge */}
                            {tx.category && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                                {getCategoryIcon(tx.category.icon)}
                                <span>{tx.category.name}</span>
                              </span>
                            )}

                            {isTransfer && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium">
                                Transfer
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Amount + Action Buttons */}
                      <div className="flex items-center space-x-3 shrink-0">
                        <div className="text-right">
                          <div
                            className={`text-base sm:text-lg font-black tracking-tight ${
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
                          {tx.notes && (
                            <span className="hidden sm:block text-[10px] text-zinc-400 max-w-[150px] truncate">
                              {tx.notes}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleRepeat(tx)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="Repeat Transaction"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(tx)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="Edit Transaction"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(tx)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="Delete Transaction"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 px-1 text-xs text-zinc-500">
              <div>
                Showing page {page} of {totalPages} ({totalCount} transactions)
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="space-x-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  className="space-x-1"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchTransactions}
        editingTransaction={editingTransaction}
        repeatTransaction={repeatTransaction}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
