import React from "react";
import { BudgetPerformanceItem } from "@pocketlens/shared";
import { formatMoney } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface SpendingPaceIndicatorProps {
  items: BudgetPerformanceItem[];
  daysInMonth: number;
  daysElapsed: number;
  currency: string;
}

export const SpendingPaceIndicator: React.FC<SpendingPaceIndicatorProps> = ({
  items,
  daysInMonth,
  daysElapsed,
  currency,
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 text-sm">
        No active budgets set for this month.
      </div>
    );
  }

  const daysRemaining = daysInMonth - daysElapsed;
  const monthProgressPct = Math.round((daysElapsed / daysInMonth) * 100);

  return (
    <div className="space-y-4">
      {/* Month Calendar Progress Header */}
      <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center space-x-1.5">
            <Clock className="h-4 w-4 text-emerald-500" />
            <span>Month Progress</span>
          </span>
          <span className="font-mono text-zinc-500">
            Day {daysElapsed} of {daysInMonth} ({daysRemaining} days left)
          </span>
        </div>
        <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            style={{ width: `${monthProgressPct}%` }}
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
          />
        </div>
      </div>

      {/* Individual Budget Pace Cards */}
      <div className="space-y-3">
        {items.map((b) => {
          let statusBadge = (
            <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="h-3 w-3" />
              <span>On Track</span>
            </span>
          );

          if (b.status === "OVER_BUDGET") {
            statusBadge = (
              <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3 w-3" />
                <span>Over Budget</span>
              </span>
            );
          } else if (b.paceStatus === "AHEAD_OF_PACE") {
            statusBadge = (
              <span className="inline-flex items-center space-x-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>Ahead of Pace</span>
              </span>
            );
          }

          return (
            <div
              key={b.budgetId}
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all space-y-2 bg-white dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {b.categoryName}
                </span>
                {statusBadge}
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">
                  Spent: <strong className="text-zinc-900 dark:text-zinc-100">{formatMoney(b.actualSpent, currency)}</strong>
                </span>
                <span className="text-zinc-500">
                  Budget: <strong className="text-zinc-900 dark:text-zinc-100">{formatMoney(b.budgetAmount, currency)}</strong>
                </span>
              </div>

              {/* Progress Bar with Expected Pace Marker */}
              <div className="relative h-2.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.min(b.percentageUsed, 100)}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${
                    b.status === "OVER_BUDGET"
                      ? "bg-rose-500"
                      : b.percentageUsed >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
                <span>{b.percentageUsed}% used</span>
                <span className="font-medium text-zinc-600 dark:text-zinc-400">{b.paceMessage}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
