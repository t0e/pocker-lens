'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Sparkles,
  Edit3,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CornerDownLeft,
} from 'lucide-react'
import {
  TransactionResponse,
  TransactionType,
  AccountResponse,
  CategoryResponse,
  CreateTransactionInput,
  ParseTransactionResult,
  CategorySuggestionResponse,
  DuplicateMatch,
  DuplicateCheckResult,
} from '@pocketlens/shared'
import { apiClient } from '@/lib/api-client'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { formatMoney } from '@/lib/utils'
import { CategorySuggestionBadge } from '../intelligence/CategorySuggestionBadge'
import { DuplicateWarningModal } from '../intelligence/DuplicateWarningModal'

interface TransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  editingTransaction?: TransactionResponse | null
  repeatTransaction?: TransactionResponse | null
  accounts: AccountResponse[]
  categories: CategoryResponse[]
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingTransaction,
  repeatTransaction,
  accounts,
  categories,
}) => {
  // Mode: 'quick' (Natural Language) vs 'manual'
  const [entryMode, setEntryMode] = useState<'quick' | 'manual'>('quick')

  // Quick Input State
  const [naturalText, setNaturalText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseTransactionResult | null>(
    null,
  )

  // Manual / Draft Form State
  const [type, setType] = useState<TransactionType>('expense')
  const [accountId, setAccountId] = useState('')
  const [transferAccountId, setTransferAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [merchant, setMerchant] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])

  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Intelligence States
  const [suggestedCategory, setSuggestedCategory] =
    useState<CategorySuggestionResponse | null>(null)
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(
    null,
  )
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false)

  // Fetch category suggestion on merchant/description typing
  useEffect(() => {
    if (
      type === 'transfer' ||
      categoryId ||
      (!merchant.trim() && !description.trim())
    ) {
      setSuggestedCategory(null)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiClient<CategorySuggestionResponse>(
          '/categories/suggest',
          {
            method: 'POST',
            body: JSON.stringify({
              merchant: merchant.trim() || undefined,
              description: description.trim() || undefined,
              amount: parseFloat(amount) || undefined,
            }),
          },
        )
        if (res && res.categoryId && res.confidence !== 'NONE') {
          setSuggestedCategory(res)
        } else {
          setSuggestedCategory(null)
        }
      } catch {
        setSuggestedCategory(null)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [merchant, description, amount, type, categoryId])

  // Initialize or reset form state
  useEffect(() => {
    if (editingTransaction) {
      setEntryMode('manual')
      setType(editingTransaction.type)
      setAccountId(editingTransaction.accountId)
      setTransferAccountId(editingTransaction.transferAccountId || '')
      setCategoryId(editingTransaction.categoryId || '')
      setAmount(editingTransaction.amount)
      setDescription(editingTransaction.description)
      setMerchant(editingTransaction.merchant || '')
      setNotes(editingTransaction.notes || '')
      const txDate = editingTransaction.transactionDate.split('T')[0]
      setDate(txDate)
      setParseResult(null)
    } else if (repeatTransaction) {
      setEntryMode('manual')
      setType(repeatTransaction.type)
      setAccountId(repeatTransaction.accountId)
      setTransferAccountId(repeatTransaction.transferAccountId || '')
      setCategoryId(repeatTransaction.categoryId || '')
      setAmount(repeatTransaction.amount)
      setDescription(repeatTransaction.description)
      setMerchant(repeatTransaction.merchant || '')
      setNotes(repeatTransaction.notes || '')
      setDate(new Date().toISOString().split('T')[0])
      setParseResult(null)
    } else {
      setEntryMode('quick')
      setNaturalText('')
      setParseResult(null)
      setType('expense')
      const defaultAcc =
        accounts.find((a) => a.isDefault && !a.isArchived) ||
        accounts.find((a) => !a.isArchived)
      setAccountId(defaultAcc ? defaultAcc.id : '')
      setTransferAccountId('')
      setCategoryId('')
      setAmount('')
      setDescription('')
      setMerchant('')
      setNotes('')
      setDate(new Date().toISOString().split('T')[0])
    }
    setError(null)
  }, [editingTransaction, repeatTransaction, isOpen, accounts])

  if (!isOpen) return null

  const activeAccounts = accounts.filter((a) => !a.isArchived)
  const selectedSourceAccount = accounts.find((a) => a.id === accountId)
  const selectedDestAccount = accounts.find((a) => a.id === transferAccountId)

  // Available categories for selected type
  const typeCategories = categories.filter(
    (c) => c.type === type && !c.isArchived,
  )

  // For transfers: filter destination accounts to same currency and not source
  const validTransferDestAccounts = activeAccounts.filter(
    (a) =>
      a.id !== accountId &&
      (!selectedSourceAccount || a.currency === selectedSourceAccount.currency),
  )

  // Parse natural language text
  const handleParse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!naturalText.trim()) return

    setIsParsing(true)
    setError(null)

    try {
      const result = await apiClient<ParseTransactionResult>(
        '/transactions/parse',
        {
          method: 'POST',
          body: JSON.stringify({ text: naturalText.trim() }),
        },
      )

      setParseResult(result)

      // Populate draft fields
      const p = result.parsed
      setType(p.type)
      if (p.accountId) setAccountId(p.accountId)
      if (p.transferAccountId) setTransferAccountId(p.transferAccountId)
      if (p.categoryId) setCategoryId(p.categoryId)
      if (p.amount) setAmount(p.amount)
      if (p.description) setDescription(p.description)
      if (p.merchant) setMerchant(p.merchant)
      if (p.transactionDate) setDate(p.transactionDate.split('T')[0])
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to parse transaction input'
      setError(message)
    } finally {
      setIsParsing(false)
    }
  }

  // Submit confirmed transaction
  const handleConfirmAndSave = async (forceSave = false) => {
    setError(null)

    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid amount greater than 0')
      return
    }

    if (!accountId) {
      setError('Please select an account')
      return
    }

    if (type === 'transfer') {
      if (!transferAccountId) {
        setError('Please select a destination account for the transfer')
        return
      }
      if (accountId === transferAccountId) {
        setError('Source and destination accounts cannot be the same')
        return
      }
      if (
        selectedSourceAccount &&
        selectedDestAccount &&
        selectedSourceAccount.currency !== selectedDestAccount.currency
      ) {
        setError(
          `Cross-currency transfers are not supported. Both accounts must use ${selectedSourceAccount.currency}.`,
        )
        return
      }
    }

    // Check for duplicates before creation (if not editing and modal not already dismissed)
    if (!editingTransaction && !forceSave) {
      try {
        const dupRes = await apiClient<DuplicateCheckResult>(
          '/transactions/check-duplicates',
          {
            method: 'POST',
            body: JSON.stringify({
              accountId,
              amount: num,
              currency: selectedSourceAccount?.currency || 'VND',
              transactionDate: new Date(date).toISOString(),
              description:
                description.trim() ||
                (type === 'transfer'
                  ? 'Transfer'
                  : type === 'income'
                    ? 'Income'
                    : 'Expense'),
              merchant: merchant.trim() || null,
              type,
            }),
          },
        )

        if (dupRes && dupRes.hasDuplicate && dupRes.matches.length > 0) {
          setDuplicateMatch(dupRes.matches[0])
          setIsDuplicateModalOpen(true)
          return
        }
      } catch {
        // If check fails gracefully continue
      }
    }

    setIsSubmitting(true)

    try {
      const payload: CreateTransactionInput = {
        type,
        accountId,
        transferAccountId: type === 'transfer' ? transferAccountId : null,
        categoryId: type !== 'transfer' && categoryId ? categoryId : null,
        amount,
        transactionDate: new Date(date).toISOString(),
        description:
          description.trim() ||
          (type === 'transfer'
            ? 'Transfer'
            : type === 'income'
              ? 'Income'
              : 'Expense'),
        merchant: merchant.trim() || null,
        notes: notes.trim() || null,
      }

      if (editingTransaction) {
        await apiClient(`/transactions/${editingTransaction.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiClient('/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      onSuccess()
      onClose()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save transaction'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {editingTransaction
                ? 'Edit Transaction'
                : repeatTransaction
                  ? 'Repeat Transaction'
                  : 'Add Transaction'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs (Only when creating new) */}
        {!editingTransaction && !repeatTransaction && (
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setEntryMode('quick')}
              className={`flex items-center justify-center space-x-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                entryMode === 'quick'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span>Natural Quick Add</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('manual')}
              className={`flex items-center justify-center space-x-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                entryMode === 'manual'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5 text-zinc-400" />
              <span>Manual Entry</span>
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start space-x-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. NATURAL LANGUAGE QUICK ADD MODE */}
        {entryMode === 'quick' && (
          <div className="space-y-4">
            <form onSubmit={handleParse} className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                What happened? (English or Vietnamese)
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  value={naturalText}
                  onChange={(e) => setNaturalText(e.target.value)}
                  placeholder="e.g. Lunch 85k cash, Ăn trưa 80k tiền mặt, Lương 32tr..."
                  className="w-full pl-3.5 pr-24 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isParsing || !naturalText.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs px-3 h-8 space-x-1"
                >
                  {isParsing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>Parse</span>
                      <CornerDownLeft className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] text-zinc-400">
                <span>Try:</span>
                <button
                  type="button"
                  onClick={() => setNaturalText('Lunch 85k cash')}
                  className="underline hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  Lunch 85k cash
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setNaturalText('ăn trưa 80k tiền mặt')}
                  className="underline hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  ăn trưa 80k tiền mặt
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() =>
                    setNaturalText('nhận lương 32tr vào Vietcombank')
                  }
                  className="underline hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  lương 32tr
                </button>
              </div>
            </form>

            {/* STRUCTURED PREVIEW CARD */}
            {parseResult && (
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 space-y-3.5 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                      Parsed Preview
                    </span>
                  </div>
                  <Badge
                    variant={
                      type === 'expense'
                        ? 'default'
                        : type === 'income'
                          ? 'success'
                          : 'info'
                    }
                    className="capitalize text-[11px]"
                  >
                    {type}
                  </Badge>
                </div>

                {/* Amount and Description */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
                      {type === 'expense'
                        ? '-'
                        : type === 'income'
                          ? '+'
                          : '⇄ '}
                      {amount
                        ? formatMoney(
                            amount,
                            selectedSourceAccount?.currency || 'VND',
                          )
                        : 'Amount missing'}
                    </div>
                    <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
                      {description || 'No description'}
                      {merchant && (
                        <span className="text-zinc-400 font-normal">
                          {' '}
                          ({merchant})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-zinc-400">
                    <div>{date}</div>
                  </div>
                </div>

                {/* Account & Category Badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {type === 'transfer' ? (
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                      {selectedSourceAccount?.name || 'Select Source'} →{' '}
                      {selectedDestAccount?.name || 'Select Dest'}
                    </span>
                  ) : (
                    <>
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
                        Account: {selectedSourceAccount?.name || 'Not assigned'}
                      </span>
                      {categoryId && (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
                          Category:{' '}
                          {categories.find((c) => c.id === categoryId)?.name ||
                            'Category'}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Warnings if any */}
                {parseResult.warnings.length > 0 && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                    {parseResult.warnings.join(' ')}
                  </div>
                )}

                {/* Action Controls for Quick Add */}
                <div className="flex space-x-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEntryMode('manual')}
                    className="flex-1 text-xs"
                  >
                    Edit Draft
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting || !amount || !accountId}
                    onClick={() => handleConfirmAndSave(false)}
                    className="flex-1 text-xs font-bold"
                  >
                    {isSubmitting ? 'Saving...' : 'Confirm & Save'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. MANUAL ENTRY / DRAFT EDIT MODE */}
        {entryMode === 'manual' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleConfirmAndSave(false)
            }}
            className="space-y-4"
          >
            {/* Type Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setType('expense')
                  setCategoryId('')
                }}
                className={`flex items-center justify-center space-x-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  type === 'expense'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
                <span>Expense</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('income')
                  setCategoryId('')
                }}
                className={`flex items-center justify-center space-x-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  type === 'income'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>Income</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('transfer')
                  setCategoryId('')
                }}
                className={`flex items-center justify-center space-x-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  type === 'transfer'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span>Transfer</span>
              </button>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Amount ({selectedSourceAccount?.currency || 'VND'})
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-3.5 pr-14 py-2 text-lg font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-zinc-400">
                  {selectedSourceAccount?.currency || 'VND'}
                </span>
              </div>
            </div>

            {/* Account Selectors */}
            {type === 'transfer' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    From Account
                  </label>
                  <select
                    required
                    value={accountId}
                    onChange={(e) => {
                      setAccountId(e.target.value)
                      setTransferAccountId('')
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="" disabled>
                      Select source...
                    </option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    To Account
                  </label>
                  <select
                    required
                    value={transferAccountId}
                    onChange={(e) => setTransferAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="" disabled>
                      Select destination...
                    </option>
                    {validTransferDestAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Account
                  </label>
                  <select
                    required
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="" disabled>
                      Select account...
                    </option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">No Category / General</option>
                    {typeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {suggestedCategory && !categoryId && (
                    <div className="mt-1.5">
                      <CategorySuggestionBadge
                        suggestion={suggestedCategory}
                        onApply={(catId) => setCategoryId(catId)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Description & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Lunch with team"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Merchant & Notes */}
            {type !== 'transfer' && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Merchant / Payee (Optional)
                </label>
                <input
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="e.g. Highlands Coffee, Grab"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional details..."
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onClose}
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
                {isSubmitting ? (
                  <span className="flex items-center space-x-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </span>
                ) : editingTransaction ? (
                  'Update Transaction'
                ) : (
                  'Save Transaction'
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Duplicate Warning Modal */}
        {duplicateMatch && (
          <DuplicateWarningModal
            isOpen={isDuplicateModalOpen}
            match={duplicateMatch}
            newTransactionData={{
              description:
                description.trim() ||
                (type === 'transfer'
                  ? 'Transfer'
                  : type === 'income'
                    ? 'Income'
                    : 'Expense'),
              amount: parseFloat(amount) || 0,
              currency: selectedSourceAccount?.currency || 'VND',
              transactionDate: date,
            }}
            onKeepBoth={() => {
              setIsDuplicateModalOpen(false)
              handleConfirmAndSave(true)
            }}
            onUseExisting={(_existingId) => {
              setIsDuplicateModalOpen(false)
              onClose()
            }}
            onCancel={() => {
              setIsDuplicateModalOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
