import React from 'react'
import { CategorySpendingItem } from '@pocketlens/shared'
import { formatMoney } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react'

interface CategoryBreakdownChartProps {
  categories: CategorySpendingItem[]
  currency: string
}

const CATEGORY_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-cyan-500',
]

export const CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = ({
  categories,
  currency,
}) => {
  if (!categories || categories.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 text-sm">
        No expense transactions recorded in this period.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Category Progress Bars */}
      <div className="space-y-3">
        {categories.map((cat, idx) => {
          const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]

          return (
            <div key={cat.categoryId} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 min-w-0">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${color} shrink-0`}
                  />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {cat.categoryName}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    ({cat.transactionCount}{' '}
                    {cat.transactionCount === 1 ? 'tx' : 'txs'})
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0 font-mono">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(cat.amount, currency)}
                  </span>
                  <span className="text-zinc-400 font-normal">
                    ({cat.percentage}%)
                  </span>
                </div>
              </div>

              {/* Progress Bar Container */}
              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${Math.max(cat.percentage, 1)}%` }}
                  className={`${color} rounded-full transition-all duration-500`}
                />
              </div>

              {/* MoM Delta Indicator */}
              <div className="flex items-center justify-end text-[10px]">
                {cat.momChangePercentage !== null ? (
                  <div
                    className={`flex items-center space-x-0.5 ${
                      cat.momChangePercentage > 0
                        ? 'text-rose-500'
                        : cat.momChangePercentage < 0
                          ? 'text-emerald-500'
                          : 'text-zinc-400'
                    }`}
                  >
                    {cat.momChangePercentage > 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    <span>
                      {cat.momChangePercentage > 0 ? '+' : ''}
                      {cat.momChangePercentage}% vs last month
                    </span>
                  </div>
                ) : cat.isNew ? (
                  <div className="flex items-center space-x-1 text-blue-500">
                    <Sparkles className="h-3 w-3" />
                    <span>New category spending</span>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
