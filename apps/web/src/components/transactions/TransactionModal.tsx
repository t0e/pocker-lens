'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Loader2,
  AlertCircle,
  Calendar,
  Tag,
  Building,
  FileText,
} from 'lucide-react';
import {
  TransactionResponse,
  TransactionType,
  AccountResponse,
  CategoryResponse,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '@pocketlens/shared';
import { apiClient } from '@/lib/api-client';
import { Button } from '../ui/Button';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingTransaction?: TransactionResponse | null;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingTransaction,
  accounts,
  categories,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [accountId, setAccountId] = useState('');
  const [transferAccountId, setTransferAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset form state
  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAccountId(editingTransaction.accountId);
      setTransferAccountId(editingTransaction.transferAccountId || '');
      setCategoryId(editingTransaction.categoryId || '');
      setAmount(editingTransaction.amount);
      setDescription(editingTransaction.description);
      setMerchant(editingTransaction.merchant || '');
      setNotes(editingTransaction.notes || '');
      const txDate = editingTransaction.transactionDate.split('T')[0];
      setDate(txDate);
    } else {
      setType('expense');
      const defaultAcc = accounts.find((a) => a.isDefault && !a.isArchived) || accounts.find((a) => !a.isArchived);
      setAccountId(defaultAcc ? defaultAcc.id : '');
      setTransferAccountId('');
      setCategoryId('');
      setAmount('');
      setDescription('');
      setMerchant('');
      setNotes('');
      setDate(new Date().toISOString().split('T')[0]);
    }
    setError(null);
  }, [editingTransaction, isOpen, accounts]);

  if (!isOpen) return null;

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const selectedSourceAccount = accounts.find((a) => a.id === accountId);
  const selectedDestAccount = accounts.find((a) => a.id === transferAccountId);

  // Available categories for selected type
  const typeCategories = categories.filter((c) => c.type === type && !c.isArchived);

  // For transfers: filter destination accounts to same currency and not source
  const validTransferDestAccounts = activeAccounts.filter(
    (a) => a.id !== accountId && (!selectedSourceAccount || a.currency === selectedSourceAccount.currency)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    if (!accountId) {
      setError('Please select an account');
      return;
    }

    if (type === 'transfer') {
      if (!transferAccountId) {
        setError('Please select a destination account for the transfer');
        return;
      }
      if (accountId === transferAccountId) {
        setError('Source and destination accounts cannot be the same');
        return;
      }
      if (selectedSourceAccount && selectedDestAccount && selectedSourceAccount.currency !== selectedDestAccount.currency) {
        setError(`Cross-currency transfers are not supported. Both accounts must use ${selectedSourceAccount.currency}.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload: CreateTransactionInput = {
        type,
        accountId,
        transferAccountId: type === 'transfer' ? transferAccountId : null,
        categoryId: type !== 'transfer' && categoryId ? categoryId : null,
        amount,
        transactionDate: new Date(date).toISOString(),
        description: description.trim(),
        merchant: merchant.trim() || null,
        notes: notes.trim() || null,
      };

      if (editingTransaction) {
        await apiClient(`/transactions/${editingTransaction.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Type Selector Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setType('expense');
              setCategoryId('');
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
              setType('income');
              setCategoryId('');
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
              setType('transfer');
              setCategoryId('');
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

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start space-x-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount and Currency Display */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Amount ({selectedSourceAccount?.currency || 'Currency'})
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-3.5 pr-14 py-2.5 text-lg font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-zinc-400">
                {selectedSourceAccount?.currency || ''}
              </span>
            </div>
          </div>

          {/* Account Selectors */}
          {type === 'transfer' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  From Account (Source)
                </label>
                <select
                  required
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setTransferAccountId('');
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
                  To Account (Destination)
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
              </div>
            </div>
          )}

          {/* Description and Date */}
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
                placeholder={type === 'transfer' ? 'e.g. ATM withdrawal' : 'e.g. Lunch with team, Salary'}
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

          {/* Optional Merchant & Notes */}
          {type !== 'transfer' && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Merchant / Payee (Optional)
              </label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Starbucks, Highlands Coffee, Grab"
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
              placeholder="Additional details or context..."
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
      </div>
    </div>
  );
};
