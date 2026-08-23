'use client';

import React from 'react';
import { PieChart, Plus, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MOCK_BUDGETS } from '@/data/mock-data';
import { formatCurrency } from '@/lib/utils';

export default function BudgetsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Budgets & Limits</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Monitor category spending against monthly targets</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="phase">Phase 2: Budget Tracking</Badge>
          <Button variant="primary" size="sm" className="text-xs space-x-1" disabled>
            <Plus className="h-3.5 w-3.5" />
            <span>New Budget</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {MOCK_BUDGETS.map((budget) => {
          const percent = Math.round((budget.spent / budget.limit) * 100);
          const remaining = budget.limit - budget.spent;
          const isOver = remaining < 0;

          return (
            <Card key={budget.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{budget.category}</CardTitle>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isOver
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}>
                    {percent}% spent
                  </span>
                </div>
                <CardDescription className="text-xs">
                  {formatCurrency(budget.spent)} of {formatCurrency(budget.limit)} limit
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${budget.color}`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                  <span>Remaining</span>
                  <span className={`font-semibold ${isOver ? 'text-rose-600' : 'text-zinc-900 dark:text-zinc-100'}`}>
                    {formatCurrency(Math.abs(remaining))} {isOver && 'over limit'}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
