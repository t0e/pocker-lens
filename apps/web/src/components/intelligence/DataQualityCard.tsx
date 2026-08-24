"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, AlertCircle, FileText, Check, ChevronRight } from "lucide-react";
import { DataQualityReportResponse, formatCurrencyAmount } from "@pocketlens/shared";

interface DataQualityCardProps {
  onCategorizeClick?: (transactionId: string, categoryId: string) => void;
  className?: string;
}

export const DataQualityCard: React.FC<DataQualityCardProps> = ({
  onCategorizeClick,
  className = "",
}) => {
  const [report, setReport] = useState<DataQualityReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    try {
      const res = await fetch("/api/proxy/analytics/data-quality");
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch {
      // Ignored in offline preview
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading || !report) return null;

  const totalIssues = report.uncategorizedCount + report.potentialDuplicatesCount + report.pendingReceiptsCount;
  if (totalIssues === 0) {
    return (
      <div className={`bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between ${className}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">Financial Data Quality: 100%</h4>
            <p className="text-[11px] text-slate-400">All transactions categorized, 0 duplicates detected.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Data Quality & Smart Hygiene</h4>
            <p className="text-[11px] text-slate-400">{totalIssues} items need your attention</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report.uncategorizedCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-semibold rounded-full border border-amber-500/30">
              {report.uncategorizedCount} Uncategorized
            </span>
          )}
          {report.pendingReceiptsCount > 0 && (
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-semibold rounded-full border border-purple-500/30">
              {report.pendingReceiptsCount} Receipts
            </span>
          )}
        </div>
      </div>

      {/* Uncategorized list with 1-click suggested actions */}
      {report.uncategorizedTransactions.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Quick Categorization Suggestions:
          </span>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {report.uncategorizedTransactions.slice(0, 3).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 p-2.5 rounded-xl text-xs"
              >
                <div className="truncate pr-2">
                  <p className="font-medium text-white truncate">{tx.description}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatCurrencyAmount(tx.amount, tx.currency)} • {tx.accountName}
                  </p>
                </div>
                {tx.suggestedCategory && tx.suggestedCategory.categoryId ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (onCategorizeClick) {
                        onCategorizeClick(tx.id, tx.suggestedCategory!.categoryId!);
                      } else {
                        await fetch(`/api/proxy/transactions/${tx.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ categoryId: tx.suggestedCategory!.categoryId }),
                        }).catch(() => {});
                        fetchReport();
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[11px] font-semibold border border-emerald-500/30 transition-all shrink-0"
                  >
                    <Check className="w-3 h-3" />
                    {tx.suggestedCategory.categoryName}
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 italic">No suggestion</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
