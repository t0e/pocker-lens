'use client';

import React from 'react';
import { Landmark, CreditCard, Wallet, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MOCK_ACCOUNTS } from '@/data/mock-data';
import { formatCurrency } from '@/lib/utils';

export default function AccountsPage() {
  const getIcon = (type: string) => {
    switch (type) {
      case 'Checking':
      case 'Savings':
        return <Landmark className="h-5 w-5" />;
      case 'Credit':
        return <CreditCard className="h-5 w-5" />;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Accounts & Wallets</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Manage bank accounts, credit cards, and cash wallets</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="phase">Phase 2: Multi-Account</Badge>
          <Button variant="primary" size="sm" className="text-xs space-x-1" disabled>
            <Plus className="h-3.5 w-3.5" />
            <span>Add Account</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MOCK_ACCOUNTS.map((account) => (
          <Card key={account.id} className="hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {getIcon(account.type)}
                </div>
                <Badge variant="default">{account.type}</Badge>
              </div>
              <CardTitle className="text-base mt-2">{account.name}</CardTitle>
              <CardDescription className="text-xs">{account.accountNumber}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {formatCurrency(account.balance)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
