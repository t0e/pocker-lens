'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  Wallet,
  Plus,
  Landmark,
  CreditCard,
  PiggyBank,
  Smartphone,
  CircleDot,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AccountResponse, AccountType } from '@pocketlens/shared';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBalance, setShowBalance] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient<AccountResponse[]>('/accounts');
      setAccounts(data);
    } catch {
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const getAccountIcon = (type: AccountType) => {
    switch (type) {
      case 'bank':
        return <Landmark className="h-4 w-4" />;
      case 'credit_card':
        return <CreditCard className="h-4 w-4" />;
      case 'savings':
        return <PiggyBank className="h-4 w-4" />;
      case 'e_wallet':
        return <Smartphone className="h-4 w-4" />;
      case 'cash':
        return <Wallet className="h-4 w-4" />;
      default:
        return <CircleDot className="h-4 w-4" />;
    }
  };

  // Group balances per ISO currency accurately
  const currencyTotals = accounts.reduce((acc, account) => {
    if (!account.isArchived) {
      const cur = account.currency;
      const balanceNum = parseFloat(account.currentBalance) || 0;
      acc[cur] = (acc[cur] || 0) + balanceNum;
    }
    return acc;
  }, {} as Record<string, number>);

  const activeAccounts = accounts.filter((a) => !a.isArchived);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Welcome back, {user?.displayName || 'User'}!
            </h2>
            <Badge variant="success" className="space-x-1 hidden sm:inline-flex">
              <ShieldCheck className="h-3 w-3" />
              <span>Phase 2 Verified</span>
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Your private financial ledger is active with secure user ownership.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/accounts">
            <Button variant="primary" size="sm" className="space-x-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Account</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Balance Overview Card */}
      <Card className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white dark:from-zinc-900 dark:to-zinc-950 border-zinc-700/50 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Financial Accounts Overview
              </span>
            </div>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title={showBalance ? 'Hide Balances' : 'Show Balances'}
            >
              {showBalance ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>

          {activeAccounts.length === 0 ? (
            <div className="py-4 space-y-2">
              <div className="text-2xl sm:text-3xl font-extrabold text-zinc-300">
                No accounts added yet
              </div>
              <p className="text-xs text-zinc-400">
                Create your first cash wallet, bank account, or card to start tracking balances.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-3">
              {Object.entries(currencyTotals).map(([currency, total]) => (
                <div
                  key={currency}
                  className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-zinc-400">{currency} Total</span>
                  <span className="text-2xl sm:text-3xl font-black text-zinc-50 mt-1">
                    {showBalance ? formatMoney(total, currency) : '••••••••'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Real Accounts Preview & Next Phase Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real Accounts List */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Your Accounts</CardTitle>
              <CardDescription className="text-xs">
                {activeAccounts.length} active account{activeAccounts.length === 1 ? '' : 's'}
              </CardDescription>
            </div>
            <Link href="/accounts" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1">
              <span>Manage all</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-xs text-zinc-400">Loading accounts...</div>
            ) : activeAccounts.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Ready to add your first account
                </div>
                <Link href="/accounts">
                  <Button variant="primary" size="sm" className="text-xs space-x-1">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Account</span>
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {activeAccounts.map((account) => (
                  <div key={account.id} className="py-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                        {getAccountIcon(account.type)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-1.5">
                          <span>{account.name}</span>
                          {account.isDefault && <Badge variant="default" className="text-[10px]">Default</Badge>}
                        </div>
                        <span className="text-xs text-zinc-500 capitalize">
                          {account.type.replace('_', ' ')} • {account.currency}
                        </span>
                      </div>
                    </div>
                    <div className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                      {showBalance ? formatMoney(account.currentBalance, account.currency) : '••••'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phase Roadmap Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-base">Roadmap Status</CardTitle>
            </div>
            <CardDescription className="text-xs">Active implementation stage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-1">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span>Phase 2: Auth & Accounts</span>
                <Badge variant="success">Completed</Badge>
              </div>
              <p className="text-emerald-700 dark:text-emerald-400 text-[11px] leading-relaxed">
                Secure cookie sessions, user ownership, and multi-currency financial accounts.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 space-y-1 opacity-80">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                <span>Phase 3: Transactions</span>
                <Badge variant="phase">Next Phase</Badge>
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                Fast income/expense logging, transfers, categories, and live balance updates.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
