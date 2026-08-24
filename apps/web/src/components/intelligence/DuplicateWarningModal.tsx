"use client";

import React from "react";
import { AlertTriangle, CheckCircle, Copy, X } from "lucide-react";
import { DuplicateMatch, formatCurrencyAmount } from "@pocketlens/shared";

interface DuplicateWarningModalProps {
  isOpen: boolean;
  match: DuplicateMatch;
  newTransactionData: {
    description: string;
    amount: number;
    currency: string;
    transactionDate: string;
  };
  onKeepBoth: () => void;
  onUseExisting: (existingId: string) => void;
  onCancel: () => void;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  isOpen,
  match,
  newTransactionData,
  onKeepBoth,
  onUseExisting,
  onCancel,
}) => {
  if (!isOpen) return null;

  const existing = match.existingTransaction;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Possible Duplicate Transaction</h3>
              <p className="text-xs text-amber-300/90 font-medium">Confidence: {match.confidence} Match</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
          {match.reason}
        </p>

        {/* Side-by-side Comparison */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* New Transaction */}
          <div className="bg-slate-800/40 border border-slate-700/60 p-3.5 rounded-xl space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New Entry</span>
            <p className="font-semibold text-white truncate">{newTransactionData.description}</p>
            <p className="text-emerald-400 font-bold text-sm">
              {formatCurrencyAmount(newTransactionData.amount, newTransactionData.currency)}
            </p>
            <p className="text-slate-400 text-[11px]">{new Date(newTransactionData.transactionDate).toLocaleDateString()}</p>
          </div>

          {/* Existing Transaction */}
          <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Existing in DB</span>
            <p className="font-semibold text-white truncate">{existing.description}</p>
            <p className="text-amber-300 font-bold text-sm">
              {formatCurrencyAmount(existing.amount, existing.currency)}
            </p>
            <p className="text-slate-400 text-[11px]">
              {new Date(existing.transactionDate).toLocaleDateString()} • {existing.accountName}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => onUseExisting(existing.id)}
            className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/30 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Use Existing
          </button>
          <button
            type="button"
            onClick={onKeepBoth}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Keep Both
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-4 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
