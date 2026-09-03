import React, { useState } from 'react'
import { MonthlyTrendPoint } from '@pocketlens/shared'
import { formatMoney } from '@/lib/utils'
import { Table, BarChart2 } from 'lucide-react'

interface CashFlowChartProps {
  months: MonthlyTrendPoint[]
  currency: string
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  months,
  currency,
}) => {
  const [showTable, setShowTable] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!months || months.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 text-sm">
        No cashflow trend data available for this period.
      </div>
    )
  }

  const maxVal = Math.max(
    ...months.map((m) => Math.max(m.income, m.expenses)),
    1,
  )

  return (
    <div className="flex flex-col space-y-4">
      {/* Header Controls & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-500" />
            <span className="font-medium text-zinc-600 dark:text-zinc-400">
              Income
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-sm bg-rose-500" />
            <span className="font-medium text-zinc-600 dark:text-zinc-400">
              Expenses
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-3 rounded-full bg-blue-500" />
            <span className="font-medium text-zinc-600 dark:text-zinc-400">
              Net Flow
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowTable(!showTable)}
          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          title="Toggle Accessible Table View"
        >
          {showTable ? (
            <>
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Chart View</span>
            </>
          ) : (
            <>
              <Table className="h-3.5 w-3.5" />
              <span>Table View</span>
            </>
          )}
        </button>
      </div>

      {/* Accessible Table View */}
      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="p-2.5 font-semibold">Month</th>
                <th className="p-2.5 font-semibold text-right">Income</th>
                <th className="p-2.5 font-semibold text-right">Expenses</th>
                <th className="p-2.5 font-semibold text-right">Net Flow</th>
                <th className="p-2.5 font-semibold text-right">Savings Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {months.map((m) => (
                <tr
                  key={m.month}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <td className="p-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                    {m.month} ({m.label})
                  </td>
                  <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                    +{formatMoney(m.income, currency)}
                  </td>
                  <td className="p-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                    -{formatMoney(m.expenses, currency)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {m.net >= 0 ? '+' : ''}
                    {formatMoney(m.net, currency)}
                  </td>
                  <td className="p-2.5 text-right font-mono text-zinc-500">
                    {m.savingsRate !== null ? `${m.savingsRate}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Visual Chart View */
        <div className="relative pt-4 pb-2">
          {/* Hover Details Popover */}
          {hoveredIdx !== null && months[hoveredIdx] && (
            <div className="mb-3 p-3 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-lg flex items-center justify-between text-xs animate-in fade-in zoom-in-95 duration-150">
              <span className="font-bold">
                {months[hoveredIdx].month} ({months[hoveredIdx].label})
              </span>
              <div className="flex items-center space-x-3">
                <span className="text-emerald-400 dark:text-emerald-600">
                  +{formatMoney(months[hoveredIdx].income, currency)}
                </span>
                <span className="text-rose-400 dark:text-rose-600">
                  -{formatMoney(months[hoveredIdx].expenses, currency)}
                </span>
                <span className="font-bold">
                  Net: {formatMoney(months[hoveredIdx].net, currency)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-48 sm:h-56 px-2 border-b border-zinc-200 dark:border-zinc-800">
            {months.map((m, idx) => {
              const incomeHeight = Math.max((m.income / maxVal) * 100, 2)
              const expenseHeight = Math.max((m.expenses / maxVal) * 100, 2)

              return (
                <div
                  key={m.month}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="flex flex-col items-center h-full justify-end group cursor-pointer"
                >
                  {/* Bars Container */}
                  <div className="flex items-end space-x-1 sm:space-x-1.5 w-full max-w-[48px] h-full justify-center pb-2">
                    {/* Income Bar */}
                    <div
                      style={{ height: `${m.income > 0 ? incomeHeight : 0}%` }}
                      className="w-full bg-emerald-500/80 group-hover:bg-emerald-500 rounded-t-sm transition-all duration-300 relative"
                    />
                    {/* Expense Bar */}
                    <div
                      style={{
                        height: `${m.expenses > 0 ? expenseHeight : 0}%`,
                      }}
                      className="w-full bg-rose-500/80 group-hover:bg-rose-500 rounded-t-sm transition-all duration-300 relative"
                    />
                  </div>

                  {/* Month Label */}
                  <span className="text-[11px] font-medium text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors pt-2">
                    {m.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
