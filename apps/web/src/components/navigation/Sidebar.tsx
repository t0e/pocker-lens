'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ReceiptText,
  Landmark,
  PieChart,
  Camera,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/Badge';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/accounts', label: 'Accounts', icon: Landmark },
  { href: '/budgets', label: 'Budgets', icon: PieChart },
  { href: '/receipts', label: 'Receipts', icon: Camera },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 select-none shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-sm font-bold text-lg">
            PL
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight text-zinc-900 dark:text-zinc-50 text-lg leading-tight">
              PocketLens
            </span>
            <span className="text-xs text-zinc-400 font-medium">Finance Tracker</span>
          </div>
        </Link>
        <Badge variant="phase">Phase 1</Badge>
      </div>

      {/* Navigation Links */}
      <nav className="space-y-1.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all',
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-900'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive ? 'text-emerald-400 dark:text-emerald-600' : 'text-zinc-400')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / System Status */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-3 border border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span>Phase 1: Foundation</span>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
            Application shell, Docker, API, and Worker ready.
          </p>
        </div>
      </div>
    </aside>
  );
};
