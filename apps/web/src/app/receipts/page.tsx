'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Camera,
  Loader2,
  AlertCircle,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react'
import { ReceiptResponse, PaginatedReceiptsResponse } from '@pocketlens/shared'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ReceiptUploadModal } from '@/components/receipts/ReceiptUploadModal'
import { ReceiptDetailModal } from '@/components/receipts/ReceiptDetailModal'
import { apiClient } from '@/lib/api-client'

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Pagination & Filtering
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [selectedReceipt, setSelectedReceipt] =
    useState<ReceiptResponse | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const fetchReceipts = useCallback(
    async (isPolling = false) => {
      try {
        if (!isPolling) setIsLoading(true)
        setError(null)

        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
        })

        if (statusFilter !== 'all') {
          params.append('status', statusFilter)
        }

        const data = await apiClient<PaginatedReceiptsResponse>(
          `/receipts?${params.toString()}`,
        )
        setReceipts(data.receipts)
        setTotalPages(data.pagination.totalPages)
        setTotalCount(data.pagination.total)
      } catch (err) {
        if (!isPolling) {
          const message =
            err instanceof Error ? err.message : 'Failed to load receipts'
          setError(message)
        }
      } finally {
        if (!isPolling) setIsLoading(false)
      }
    },
    [page, statusFilter],
  )

  useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  // Polling effect: poll every 3 seconds if any receipt is in non-terminal status ('uploaded', 'queued', 'processing')
  useEffect(() => {
    const hasActiveReceipts = receipts.some(
      (r) =>
        r.status === 'uploaded' ||
        r.status === 'queued' ||
        r.status === 'processing',
    )

    if (!hasActiveReceipts) return

    const interval = setInterval(() => {
      fetchReceipts(true)
    }, 2500)

    return () => clearInterval(interval)
  }, [receipts, fetchReceipts])

  const handleOpenDetail = (receipt: ReceiptResponse) => {
    setSelectedReceipt(receipt)
    setIsDetailModalOpen(true)
  }

  const handleDeleteReceipt = async (id: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this receipt and its stored image?',
      )
    ) {
      return
    }

    try {
      await apiClient(`/receipts/${id}`, { method: 'DELETE' })
      setIsDetailModalOpen(false)
      setSelectedReceipt(null)
      await fetchReceipts()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete receipt'
      alert(message)
    }
  }

  const handleRetryReceipt = async (id: string) => {
    try {
      await apiClient(`/receipts/${id}/retry`, { method: 'POST' })
      await fetchReceipts()
      if (selectedReceipt && selectedReceipt.id === id) {
        setIsDetailModalOpen(false)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to retry receipt'
      alert(message)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Group receipts by date heading
  const groupedReceipts = receipts.reduce(
    (groups, r) => {
      const dateObj = new Date(r.createdAt)
      const today = new Date()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      let dateLabel = dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      if (dateObj.toDateString() === today.toDateString()) {
        dateLabel = 'Today'
      } else if (dateObj.toDateString() === yesterday.toDateString()) {
        dateLabel = 'Yesterday'
      }

      if (!groups[dateLabel]) {
        groups[dateLabel] = []
      }
      groups[dateLabel].push(r)
      return groups
    },
    {} as Record<string, ReceiptResponse[]>,
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="success">Ready</Badge>
      case 'processing':
        return (
          <Badge variant="info" className="space-x-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <span>Processing...</span>
          </Badge>
        )
      case 'queued':
        return <Badge variant="info">Queued</Badge>
      case 'failed':
        return (
          <Badge
            variant="default"
            className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          >
            Failed
          </Badge>
        )
      default:
        return <Badge variant="default">Uploaded</Badge>
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Header and Upload Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Receipt Scanner & OCR
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Extract details from English & Vietnamese receipts and confirm
            transactions with a tap
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setIsUploadModalOpen(true)}
          className="space-x-1.5 shadow-sm shadow-emerald-500/10"
        >
          <Camera className="h-4 w-4" />
          <span>Upload Receipt</span>
        </Button>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center space-x-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 p-1 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl overflow-x-auto shadow-sm">
        {[
          { label: 'All Receipts', value: 'all' },
          { label: 'Ready', value: 'ready' },
          { label: 'Processing', value: 'processing' },
          { label: 'Queued', value: 'queued' },
          { label: 'Failed', value: 'failed' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value)
              setPage(1)
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
              statusFilter === tab.value
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Receipts List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
          <span className="text-sm">Loading receipts & extractions...</span>
        </div>
      ) : totalCount === 0 ? (
        /* Empty State */
        <Card className="border-dashed border-2 py-14">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Camera className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                No receipts uploaded
              </h3>
              <p className="text-xs text-zinc-500">
                {statusFilter !== 'all'
                  ? 'No receipts match the selected status filter.'
                  : 'Capture or upload receipt photos to extract structured drafts with English & Vietnamese OCR.'}
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsUploadModalOpen(true)}
              className="space-x-1.5"
            >
              <Camera className="h-4 w-4" />
              <span>Upload First Receipt</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedReceipts).map(([dateHeader, items]) => (
            <div key={dateHeader} className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-1">
                {dateHeader}
              </div>

              <Card className="divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden shadow-sm">
                {items.map((receipt) => {
                  const merchantName = receipt.extraction?.merchant
                  const totalAmt = receipt.extraction?.totalAmount
                  const currencyCode = receipt.extraction?.currency || 'VND'

                  return (
                    <div
                      key={receipt.id}
                      className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-zinc-50/70 dark:hover:bg-zinc-900/60 transition-colors group cursor-pointer"
                      onClick={() => handleOpenDetail(receipt)}
                    >
                      {/* Left: Thumbnail placeholder + Metadata */}
                      <div className="flex items-center space-x-3.5 min-w-0 pr-2">
                        <div className="h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center shrink-0 border border-zinc-200/60 dark:border-zinc-700/60">
                          <Receipt className="h-6 w-6 text-emerald-500" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {merchantName || receipt.originalFilename}
                            </span>
                            {receipt.transactionId && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">
                                Confirmed
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                            {merchantName && (
                              <>
                                <span className="truncate max-w-[140px] text-zinc-500 dark:text-zinc-400">
                                  {receipt.originalFilename}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span>{formatFileSize(receipt.fileSize)}</span>
                            <span>•</span>
                            <span>
                              {new Date(receipt.createdAt).toLocaleTimeString(
                                [],
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </span>
                            {receipt.errorMessage && (
                              <>
                                <span>•</span>
                                <span className="text-rose-500 truncate max-w-[160px]">
                                  {receipt.errorMessage}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Status Badge & Amount & Actions */}
                      <div className="flex items-center space-x-3 shrink-0">
                        {totalAmt !== null && totalAmt !== undefined && (
                          <div className="hidden sm:block text-right">
                            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                              {totalAmt.toLocaleString()} {currencyCode}
                            </div>
                            {receipt.extraction?.suggestedCategoryName && (
                              <div className="text-[10px] text-zinc-400">
                                {receipt.extraction.suggestedCategoryName}
                              </div>
                            )}
                          </div>
                        )}

                        <div>{getStatusBadge(receipt.status)}</div>

                        <div
                          className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {receipt.status === 'failed' && (
                            <button
                              onClick={() => handleRetryReceipt(receipt.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              title="Retry Processing"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDetail(receipt)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="View Receipt & Extraction"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </Card>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 px-1 text-xs text-zinc-500">
              <span>
                Showing {receipts.length} of {totalCount} receipts (Page {page}{' '}
                of {totalPages})
              </span>
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

      {/* Upload Modal */}
      <ReceiptUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={fetchReceipts}
      />

      {/* Detail View & Confirmation Modal */}
      <ReceiptDetailModal
        receipt={selectedReceipt}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedReceipt(null)
        }}
        onDelete={handleDeleteReceipt}
        onRetry={handleRetryReceipt}
        onConfirmed={fetchReceipts}
      />
    </div>
  )
}
