'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Building2,
  Tag,
  Wallet,
  DollarSign,
} from 'lucide-react';
import {
  ReceiptResponse,
  ReceiptExtractionResponse,
  FieldConfidence,
  AccountResponse,
  CategoryResponse,
} from '@pocketlens/shared';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { apiClient } from '@/lib/api-client';

interface ReceiptDetailModalProps {
  receipt: ReceiptResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onConfirmed?: () => void;
}

export const ReceiptDetailModal: React.FC<ReceiptDetailModalProps> = ({
  receipt,
  isOpen,
  onClose,
  onDelete,
  onRetry,
  onConfirmed,
}) => {
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [showRawText, setShowRawText] = useState(false);

  // Form draft state
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('VND');
  const [transactionDate, setTransactionDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Load user accounts and categories
  useEffect(() => {
    if (!isOpen) return;

    apiClient<{ accounts: AccountResponse[] }>('/accounts')
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => {});

    apiClient<{ categories: CategoryResponse[] }>('/categories?type=expense')
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, [isOpen]);

  // Pre-fill form from extraction whenever receipt changes
  useEffect(() => {
    if (!receipt) return;

    const ext = receipt.extraction;
    if (ext) {
      setMerchant(ext.merchant || '');
      setAmount(ext.totalAmount !== null ? ext.totalAmount.toString() : '');
      setCurrency(ext.currency || 'VND');

      let dateStr = new Date().toISOString().split('T')[0];
      if (ext.transactionDate) {
        dateStr = new Date(ext.transactionDate).toISOString().split('T')[0];
      }
      setTransactionDate(dateStr);

      setCategoryId(ext.categoryId || '');
      setAccountId(ext.accountId || '');
      setDescription(ext.merchant || receipt.originalFilename || 'Expense');
      setNotes('');
    } else {
      setMerchant('');
      setAmount('');
      setCurrency('VND');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setDescription(receipt.originalFilename);
    }
    setConfirmError(null);
    setConfirmSuccess(false);
  }, [receipt]);

  if (!isOpen || !receipt) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const imageUrl = `${apiBase}/receipts/${receipt.id}/file`;
  const extraction = receipt.extraction;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    if (receipt.transactionId) {
      return <Badge variant="success">Confirmed & Linked</Badge>;
    }
    switch (receipt.status) {
      case 'ready':
        return <Badge variant="success">Ready for Review</Badge>;
      case 'processing':
        return <Badge variant="phase">Processing OCR...</Badge>;
      case 'queued':
        return <Badge variant="info">Queued</Badge>;
      case 'failed':
        return (
          <Badge variant="default" className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            Failed
          </Badge>
        );
      default:
        return <Badge variant="default">Uploaded</Badge>;
    }
  };

  const getConfidenceBadge = (confidence?: FieldConfidence) => {
    switch (confidence) {
      case 'high':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-semibold">
            High confidence
          </span>
        );
      case 'medium':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-semibold">
            Medium confidence
          </span>
        );
      case 'low':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
            Review needed
          </span>
        );
      default:
        return null;
    }
  };

  const handleConfirmTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || receipt.transactionId) return;

    if (!amount || parseFloat(amount) <= 0) {
      setConfirmError('Please provide a valid amount');
      return;
    }

    if (!accountId) {
      setConfirmError('Please select a payment account');
      return;
    }

    setIsSubmitting(true);
    setConfirmError(null);

    try {
      await apiClient(`/receipts/${receipt.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'EXPENSE',
          accountId,
          categoryId: categoryId || undefined,
          amount: parseFloat(amount),
          currency,
          transactionDate: new Date(transactionDate).toISOString(),
          description: description || merchant || 'Receipt expense',
          merchant: merchant || undefined,
          notes: notes || undefined,
        }),
      });

      setConfirmSuccess(true);
      if (onConfirmed) onConfirmed();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setConfirmError(err.message || 'Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReprocess = async () => {
    if (isReprocessing || receipt.transactionId) return;
    setIsReprocessing(true);
    try {
      await apiClient(`/receipts/${receipt.id}/reprocess`, {
        method: 'POST',
      });
      if (onConfirmed) onConfirmed();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to reprocess receipt');
    } finally {
      setIsReprocessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 truncate max-w-[200px] sm:max-w-md">
              {receipt.originalFilename}
            </h3>
            {getStatusBadge()}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error message banner if receipt processing failed */}
        {receipt.status === 'failed' && receipt.errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start space-x-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{receipt.errorMessage}</span>
          </div>
        )}

        {/* Confirmation Success Banner */}
        {confirmSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center space-x-2 text-xs text-emerald-700 dark:text-emerald-300 font-semibold animate-fadeIn">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>Transaction successfully created and linked to receipt!</span>
          </div>
        )}

        {/* Main Side-by-Side (Desktop) / Stacked (Mobile) Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Receipt Image & Raw Text */}
          <div className="lg:col-span-5 space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 aspect-[3/4] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={receipt.originalFilename}
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>{formatFileSize(receipt.fileSize)}</span>
              <span>{receipt.mimeType}</span>
              <span>{new Date(receipt.createdAt).toLocaleDateString()}</span>
            </div>

            {/* Collapsible Raw OCR Text */}
            {extraction?.rawText && (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRawText(!showRawText)}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950/50 flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                >
                  <span className="flex items-center space-x-1.5">
                    <FileText className="h-3.5 w-3.5 text-zinc-400" />
                    <span>View Raw OCR Text</span>
                  </span>
                  {showRawText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showRawText && (
                  <pre className="p-3 bg-zinc-950 text-zinc-300 text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed border-t border-zinc-200 dark:border-zinc-800">
                    {extraction.rawText}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Interactive Extraction Review & Confirmation Form */}
          <div className="lg:col-span-7 space-y-4">
            {extraction ? (
              <form onSubmit={handleConfirmTransaction} className="space-y-3.5">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-xs">
                  <span className="flex items-center space-x-1.5 font-semibold text-emerald-800 dark:text-emerald-200">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Extracted Draft ({extraction.detectedLanguage?.toUpperCase() || 'EN'})</span>
                  </span>
                  {extraction.confidence && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      Confidence: {extraction.confidence}%
                    </span>
                  )}
                </div>

                {confirmError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{confirmError}</span>
                  </div>
                )}

                {/* Form Inputs Grid */}
                <div className="space-y-3">
                  {/* Merchant Field */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Merchant
                      </label>
                      {getConfidenceBadge(extraction.fieldConfidences?.merchant)}
                    </div>
                    <input
                      type="text"
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      disabled={!!receipt.transactionId}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
                      placeholder="e.g. Highlands Coffee"
                    />
                  </div>

                  {/* Amount & Currency */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Total Amount *
                        </label>
                        {getConfidenceBadge(extraction.fieldConfidences?.totalAmount)}
                      </div>
                      <input
                        type="number"
                        step="any"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={!!receipt.transactionId}
                        required
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
                        placeholder="80000"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Currency
                        </label>
                      </div>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        disabled={!!receipt.transactionId}
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

                  {/* Date & Category */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Date *
                        </label>
                        {getConfidenceBadge(extraction.fieldConfidences?.transactionDate)}
                      </div>
                      <input
                        type="date"
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        disabled={!!receipt.transactionId}
                        required
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Category
                        </label>
                        {getConfidenceBadge(extraction.fieldConfidences?.category)}
                      </div>
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        disabled={!!receipt.transactionId}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
                      >
                        <option value="">-- Select Category --</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Payment Account */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Payment Account *
                      </label>
                      {getConfidenceBadge('low')}
                    </div>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      disabled={!!receipt.transactionId}
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
                    >
                      <option value="">-- Select Account --</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description / Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={!!receipt.transactionId}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:opacity-60"
                      placeholder="Transaction description"
                    />
                  </div>
                </div>

                {/* Extracted Line Items List */}
                {extraction.items && extraction.items.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Line Items ({extraction.items.length})
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs overflow-hidden">
                      {extraction.items.map((item, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/40">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]">
                            {item.description}
                          </span>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                            {item.totalPrice?.toLocaleString()} {currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Form Submit / Confirmation Actions */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {!receipt.transactionId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleReprocess}
                        disabled={isReprocessing || isSubmitting}
                        className="text-xs space-x-1.5"
                      >
                        <RotateCcw className={`h-3.5 w-3.5 ${isReprocessing ? 'animate-spin' : ''}`} />
                        <span>Reprocess</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(receipt.id)}
                      disabled={isSubmitting}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 space-x-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </Button>
                  </div>

                  <div className="flex items-center space-x-2">
                    {receipt.transactionId ? (
                      <Button type="button" variant="outline" size="sm" disabled className="text-xs space-x-1 text-emerald-600 font-bold">
                        <Check className="h-4 w-4" />
                        <span>Transaction Confirmed</span>
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={isSubmitting}
                        className="text-xs font-bold space-x-1.5"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Confirming...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            <span>Create Transaction</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            ) : (
              <div className="p-6 text-center space-y-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {receipt.status === 'failed'
                      ? 'Receipt Processing Failed'
                      : 'Processing Receipt OCR...'}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {receipt.status === 'failed'
                      ? 'The background OCR engine was unable to extract text. You can retry or delete this receipt.'
                      : 'Our local OCR engine is extracting text and merchant details.'}
                  </p>
                </div>

                <div className="flex justify-center space-x-2 pt-2">
                  {receipt.status === 'failed' && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onRetry(receipt.id)}
                      className="text-xs space-x-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Retry Processing</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(receipt.id)}
                    className="text-xs text-rose-600 space-x-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
