'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Plus, Bell, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts & Cards',
  '/budgets': 'Monthly Budgets',
  '/receipts': 'Receipt Scanner',
  '/settings': 'Settings & Config',
};

export const Header: React.FC = () => {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || 'PocketLens';

  return (
    <header className="sticky top-0 z-40 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-800/60 px-4 sm:px-8 py-3.5 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <div className="hidden sm:inline-flex">
          <Badge variant="success" className="space-x-1">
            <ShieldCheck className="h-3 w-3" />
            <span>Phase 1 Active</span>
          </Badge>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex space-x-1 text-xs"
          onClick={() => alert('Fast Transaction & Receipt Entry is scheduled for Phase 2!')}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Entry</span>
        </Button>
        <button
          className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
};
