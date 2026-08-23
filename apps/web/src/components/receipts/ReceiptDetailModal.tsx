'use client';

import React from 'react';
import {
  X,
  Calendar,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { ReceiptResponse } from '@pocketlens/shared';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface ReceiptDetailModalProps {
  receipt: ReceiptResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

export const ReceiptDetailModal: React.FC<ReceiptDetailModalProps> = ({
  receipt,
  isOpen,
  onClose,
  onDelete,
  onRetry,
}) => {
  if (!isOpen || !receipt) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const imageUrl = `${apiBase}/receipts/${receipt.id}/file`;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    switch (receipt.status) {
      case 'ready':
        return <Badge variant="success">Ready</Badge>;
      case 'processing':
        return <Badge variant="phase">Processing...</Badge>;
      case 'queued':
        return <Badge variant="info">Queued</Badge>;
      case 'failed':
        return <Badge variant="default" className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Failed</Badge>;
      default:
        return <Badge variant="default">Uploaded</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 truncate max-w-[280px] sm:max-w-md">
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

        {/* Authenticated Receipt Image Display */}
        <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 aspect-[4/3] flex items-center justify-center">
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

        {/* Error message if failed */}
        {receipt.status === 'failed' && receipt.errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start space-x-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{receipt.errorMessage}</span>
          </div>
        )}

        {/* Metadata Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs">
          <div>
            <div className="text-zinc-400 font-medium">Uploaded</div>
            <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
              {new Date(receipt.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>

          <div>
            <div className="text-zinc-400 font-medium">File Size</div>
            <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
              {formatFileSize(receipt.fileSize)}
            </div>
          </div>

          <div>
            <div className="text-zinc-400 font-medium">MIME Type</div>
            <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">
              {receipt.mimeType}
            </div>
          </div>

          <div className="sm:col-span-3 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
            <div className="text-zinc-400 font-medium">Linked Transaction</div>
            <div className="text-zinc-600 dark:text-zinc-400 mt-0.5 flex items-center space-x-1">
              <span>Not created yet</span>
              <span className="text-[10px] text-zinc-400 font-mono">(Phase 6 OCR)</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDelete(receipt.id)}
            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 space-x-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Receipt</span>
          </Button>

          <div className="flex items-center space-x-2">
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
              onClick={onClose}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
