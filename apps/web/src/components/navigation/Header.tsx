'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '../ui/Button'
import { TransactionModal } from '../transactions/TransactionModal'
import { AccountResponse, CategoryResponse } from '@pocketlens/shared'
import { apiClient } from '@/lib/api-client'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Financial Overview',
  '/transactions': 'Transactions & Activity',
  '/accounts': 'Accounts & Wallets',
  '/receipts': 'Receipt Scanner & Vault',
  '/budgets': 'Budgets & Recurring',
  '/settings': 'Settings & Profile',
}

export const Header: React.FC = () => {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const title = PAGE_TITLES[pathname] || 'PocketLens'

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [accounts, setAccounts] = useState<AccountResponse[]>([])
  const [categories, setCategories] = useState<CategoryResponse[]>([])

  useEffect(() => {
    if (user) {
      Promise.all([
        apiClient<AccountResponse[]>('/accounts'),
        apiClient<CategoryResponse[]>('/categories'),
      ])
        .then(([accs, cats]) => {
          setAccounts(accs)
          setCategories(cats)
        })
        .catch(() => {})
    }
  }, [user])

  return (
    <header className="sticky top-0 z-40 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-800/60 px-4 sm:px-8 py-3.5 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {user && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="space-x-1.5 text-xs shadow-sm shadow-emerald-500/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Quick Add</span>
          </Button>
        )}

        {user && (
          <div className="flex items-center space-x-2 pl-2 border-l border-zinc-200 dark:border-zinc-800">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {user.displayName}
              </span>
              <span className="text-[10px] text-zinc-400 leading-tight">
                {user.email}
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Quick Entry Modal */}
      {user && (
        <TransactionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('transaction-updated'))
            }
          }}
          accounts={accounts}
          categories={categories}
        />
      )}
    </header>
  )
}
