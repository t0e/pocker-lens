'use client'

import React, { useState, useEffect } from 'react'
import { X, PieChart, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { CategoryResponse, BudgetResponse } from '@pocketlens/shared'
import { Button } from '../ui/Button'
import { apiClient } from '@/lib/api-client'

interface BudgetModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: CategoryResponse[]
  initialMonth: string
  budgetToEdit?: BudgetResponse | null
}

export const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
  initialMonth,
  budgetToEdit,
}) => {
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('VND')
  const [month, setMonth] = useState(initialMonth)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter only EXPENSE categories
  const expenseCategories = categories.filter(
    (c) => c.type === 'expense' && !c.isArchived,
  )

  useEffect(() => {
    if (budgetToEdit) {
      setCategoryId(budgetToEdit.categoryId)
      setAmount(budgetToEdit.amount.toString())
      setCurrency(budgetToEdit.currency)
      setMonth(budgetToEdit.month)
    } else {
      const firstExp = categories.find(
        (c) => c.type === 'expense' && !c.isArchived,
      )
      setCategoryId(firstExp?.id || '')
      setAmount('')
      setCurrency('VND')
      setMonth(initialMonth)
    }
    setError(null)
  }, [budgetToEdit, initialMonth, isOpen, categories])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please provide a valid budget amount')
      return
    }

    if (!budgetToEdit && !categoryId) {
      setError('Please select an expense category')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (budgetToEdit) {
        // Edit existing budget amount
        await apiClient(`/budgets/${budgetToEdit.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            amount: parseFloat(amount),
          }),
        })
      } else {
        // Create new budget
        await apiClient('/budgets', {
          method: 'POST',
          body: JSON.stringify({
            categoryId,
            amount: parseFloat(amount),
            currency,
            month,
          }),
        })
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save budget')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <PieChart className="h-4 w-4" />
            </div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              {budgetToEdit ? 'Edit Budget' : 'Set Category Budget'}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Expense Category *
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={!!budgetToEdit}
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
            >
              {expenseCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount and Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Monthly Limit *
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="3000000"
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
                disabled={!!budgetToEdit}
                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="JPY">JPY</option>
                <option value="SGD">SGD</option>
              </select>
            </div>
          </div>

          {/* Month Target */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Month (YYYY-MM) *
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={!!budgetToEdit}
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Actions */}
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
                    {budgetToEdit ? 'Update Budget' : 'Create Budget'}
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
