'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Landmark,
  CreditCard,
  Wallet,
  PiggyBank,
  Smartphone,
  CircleDot,
  Plus,
  Edit2,
  Archive,
  ArchiveRestore,
  Star,
  Loader2,
  AlertCircle,
  X,
  Layers,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  AccountResponse,
  AccountType,
  ACCOUNT_TYPES,
  SUPPORTED_CURRENCIES,
  CreateAccountInput,
} from '@pocketlens/shared'
import { apiClient } from '@/lib/api-client'
import { formatMoney } from '@/lib/utils'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountResponse | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState<{
    name: string
    type: AccountType
    currency: string
    openingBalance: string
    isDefault: boolean
  }>({
    name: '',
    type: 'bank',
    currency: 'VND',
    openingBalance: '0',
    isDefault: false,
  })

  const fetchAccounts = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await apiClient<AccountResponse[]>(
        `/accounts?includeArchived=${includeArchived}`,
      )
      setAccounts(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts')
    } finally {
      setIsLoading(false)
    }
  }, [includeArchived])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const handleOpenCreate = () => {
    setFormData({
      name: '',
      type: 'bank',
      currency: 'VND',
      openingBalance: '0',
      isDefault: false,
    })
    setError(null)
    setIsCreateOpen(true)
  }

  const handleOpenEdit = (account: AccountResponse) => {
    setEditingAccount(account)
    setFormData({
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance,
      isDefault: account.isDefault,
    })
    setError(null)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await apiClient<AccountResponse>('/accounts', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
      setIsCreateOpen(false)
      await fetchAccounts()
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    if (!editingAccount) return
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await apiClient<AccountResponse>(`/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          currency: formData.currency,
          isDefault: formData.isDefault,
        }),
      })
      setEditingAccount(null)
      await fetchAccounts()
    } catch (err: any) {
      setError(err.message || 'Failed to update account')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleArchive = async (account: AccountResponse) => {
    try {
      if (account.isArchived) {
        await apiClient(`/accounts/${account.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isArchived: false }),
        })
      } else {
        await apiClient(`/accounts/${account.id}`, {
          method: 'DELETE',
        })
      }
      await fetchAccounts()
    } catch (err: any) {
      alert(err.message || 'Failed to update archive status')
    }
  }

  const getAccountIcon = (type: AccountType) => {
    switch (type) {
      case 'bank':
        return <Landmark className="h-5 w-5" />
      case 'credit_card':
        return <CreditCard className="h-5 w-5" />
      case 'savings':
        return <PiggyBank className="h-5 w-5" />
      case 'e_wallet':
        return <Smartphone className="h-5 w-5" />
      case 'cash':
        return <Wallet className="h-5 w-5" />
      default:
        return <CircleDot className="h-5 w-5" />
    }
  }

  // Group balances accurately by currency without fake exchange rate conversions
  const currencyTotals = accounts.reduce(
    (acc, account) => {
      if (!account.isArchived) {
        const cur = account.currency
        const balanceNum = parseFloat(account.currentBalance) || 0
        acc[cur] = (acc[cur] || 0) + balanceNum
      }
      return acc
    },
    {} as Record<string, number>,
  )

  const activeAccounts = accounts.filter((a) => !a.isArchived)
  const archivedAccounts = accounts.filter((a) => a.isArchived)

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Header and Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Financial Accounts
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Manage your cash, bank accounts, credit cards, and wallets
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-xs text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Show Archived</span>
          </label>
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenCreate}
            className="space-x-1.5 shadow-sm shadow-emerald-500/10"
          >
            <Plus className="h-4 w-4" />
            <span>Add Account</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center space-x-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Currency Totals Overview Banner (Multi-Currency Grouped) */}
      {!isLoading && activeAccounts.length > 0 && (
        <Card className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white border-zinc-700/50 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-sm font-semibold tracking-wider uppercase text-zinc-300">
                Total Balances by Currency
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Balances are grouped per ISO currency without exchange-rate
              assumptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
              {Object.entries(currencyTotals).map(([currency, total]) => (
                <div
                  key={currency}
                  className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-zinc-400">
                    {currency} Accounts
                  </span>
                  <span className="text-xl sm:text-2xl font-extrabold text-zinc-50 mt-1">
                    {formatMoney(total, currency)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts List / Grid */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
          <span className="text-sm">Loading your accounts...</span>
        </div>
      ) : accounts.length === 0 ? (
        /* Empty State */
        <Card className="border-dashed border-2 py-12">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Wallet className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                No accounts yet
              </h3>
              <p className="text-xs text-zinc-500">
                Add your cash, bank account, card, or wallet to start tracking
                your money.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={handleOpenCreate}
              className="space-x-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Account</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Accounts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {activeAccounts.map((account) => (
              <Card
                key={account.id}
                className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {getAccountIcon(account.type)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <CardTitle className="text-base font-bold">
                            {account.name}
                          </CardTitle>
                          {account.isDefault && (
                            <span title="Default Account">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-500 capitalize">
                          {account.type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <Badge variant="default" className="font-mono text-[11px]">
                      {account.currency}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
                    {formatMoney(account.currentBalance, account.currency)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mt-1 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                    <span>
                      Opening:{' '}
                      {formatMoney(account.openingBalance, account.currency)}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenEdit(account)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Edit Account"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleArchive(account)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Archive Account"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Archived Accounts Section (if toggled) */}
          {includeArchived && archivedAccounts.length > 0 && (
            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4">
                Archived Accounts ({archivedAccounts.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedAccounts.map((account) => (
                  <Card
                    key={account.id}
                    className="opacity-60 hover:opacity-100 transition-opacity bg-zinc-50/50 dark:bg-zinc-900/50"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm line-through text-zinc-500">
                          {account.name}
                        </span>
                        <Badge variant="warning">Archived</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-zinc-600 dark:text-zinc-400">
                        {formatMoney(account.currentBalance, account.currency)}
                      </div>
                      <div className="flex justify-end pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleArchive(account)}
                          className="text-xs space-x-1"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          <span>Restore</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Add New Account
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. Vietcombank Salary, Cash Wallet"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Account Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as AccountType,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Currency (ISO)
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Opening Balance
                </label>
                <input
                  type="text"
                  required
                  value={formData.openingBalance}
                  onChange={(e) =>
                    setFormData({ ...formData, openingBalance: e.target.value })
                  }
                  placeholder="0.00"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="create-is-default"
                  checked={formData.isDefault}
                  onChange={(e) =>
                    setFormData({ ...formData, isDefault: e.target.checked })
                  }
                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label
                  htmlFor="create-is-default"
                  className="text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Set as default account for transactions
                </label>
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Edit Account
              </h3>
              <button
                onClick={() => setEditingAccount(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Account Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value as AccountType,
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Currency (ISO)
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-is-default"
                  checked={formData.isDefault}
                  onChange={(e) =>
                    setFormData({ ...formData, isDefault: e.target.checked })
                  }
                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label
                  htmlFor="edit-is-default"
                  className="text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Default Account
                </label>
              </div>

              <div className="flex space-x-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setEditingAccount(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
