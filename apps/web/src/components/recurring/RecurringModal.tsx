'use client'

import React, { useState, useEffect } from 'react'
import { X, RotateCcw, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import {
  AccountResponse,
  CategoryResponse,
  RecurringTransactionResponse,
  RecurrenceFrequency,
} from '@pocketlens/shared'
import { Button } from '../ui/Button'
import { apiClient } from '@/lib/api-client'

interface RecurringModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  accounts: AccountResponse[]
  categories: CategoryResponse[]
  itemToEdit?: RecurringTransactionResponse | null
  defaultIsSubscription?: boolean
}

export const RecurringModal: React.FC<RecurringModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  accounts,
  categories,
  itemToEdit,
  defaultIsSubscription = false,
}) => {
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('VND')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('MONTHLY')
  const [interval, setInterval] = useState(1)
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [endDate, setEndDate] = useState('')
  const [isSubscription, setIsSubscription] = useState(defaultIsSubscription)
  const [merchant, setMerchant] = useState('')
  const [notes, setNotes] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeAccounts = accounts.filter((a) => !a.isArchived)
  const filteredCategories = categories.filter(
    (c) => c.type.toLowerCase() === type.toLowerCase() && !c.isArchived,
  )

  useEffect(() => {
    if (itemToEdit) {
      setType(itemToEdit.type)
      setDescription(itemToEdit.description)
      setAmount(itemToEdit.amount.toString())
      setCurrency(itemToEdit.currency)
      setAccountId(itemToEdit.accountId)
      setCategoryId(itemToEdit.categoryId || '')
      setFrequency(itemToEdit.frequency)
      setInterval(itemToEdit.interval)
      setStartDate(new Date(itemToEdit.startDate).toISOString().split('T')[0])
      setEndDate(
        itemToEdit.endDate
          ? new Date(itemToEdit.endDate).toISOString().split('T')[0]
          : '',
      )
      setIsSubscription(itemToEdit.isSubscription)
      setMerchant(itemToEdit.merchant || '')
      setNotes(itemToEdit.notes || '')
    } else {
      setType('EXPENSE')
      setDescription('')
      setAmount('')
      const firstAcc = accounts.find((a) => !a.isArchived)
      setAccountId(firstAcc?.id || '')
      setCategoryId('')
      setFrequency('MONTHLY')
      setInterval(1)
      setStartDate(new Date().toISOString().split('T')[0])
      setEndDate('')
      setIsSubscription(defaultIsSubscription)
      setMerchant('')
      setNotes('')
    }
    setError(null)
  }, [itemToEdit, defaultIsSubscription, isOpen, accounts])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!description.trim()) {
      setError('Description is required')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount greater than zero')
      return
    }

    if (!accountId) {
      setError('Please select an account')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        type,
        accountId,
        categoryId: categoryId || undefined,
        amount: parseFloat(amount),
        currency,
        description: description.trim(),
        frequency,
        interval: Math.max(1, interval),
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        isSubscription,
        merchant: merchant.trim() || undefined,
        notes: notes.trim() || undefined,
      }

      if (itemToEdit) {
        await apiClient(`/recurring/${itemToEdit.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiClient('/recurring', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      onSuccess()
      onClose()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to save recurring transaction'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <RotateCcw className="h-4 w-4" />
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {itemToEdit
                ? isSubscription
                  ? 'Edit Subscription'
                  : 'Edit Recurring Transaction'
                : isSubscription
                  ? 'New Subscription'
                  : 'New Recurring Transaction'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center space-x-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Type Selector Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setType('EXPENSE')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                type === 'EXPENSE'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('INCOME')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                type === 'INCOME'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Income
            </button>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder={
                isSubscription
                  ? 'e.g. Netflix, Spotify, iCloud'
                  : 'e.g. Rent, Gym, Salary'
              }
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Amount *
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="260000"
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="JPY">JPY</option>
                <option value="SGD">SGD</option>
              </select>
            </div>
          </div>

          {/* Account & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Account *
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
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
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">-- None / General --</option>
                {filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Repeat Frequency & Interval */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Repeat Frequency *
              </label>
              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as RecurrenceFrequency)
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Every (Interval)
              </label>
              <input
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Dates: Start & Optional End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Start / Next Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Checkbox: Mark as Subscription */}
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <label
                htmlFor="isSubscriptionCheck"
                className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer"
              >
                Mark as Subscription
              </label>
              <p className="text-[11px] text-zinc-400">
                Track in the Subscriptions dashboard and calculate estimated
                monthly costs.
              </p>
            </div>
            <input
              type="checkbox"
              id="isSubscriptionCheck"
              checked={isSubscription}
              onChange={(e) => setIsSubscription(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    {itemToEdit ? 'Update Template' : 'Save Recurring Item'}
                  </span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
