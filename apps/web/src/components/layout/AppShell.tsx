'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/components/navigation/Sidebar'
import { Header } from '@/components/navigation/Header'
import { BottomNav } from '@/components/navigation/BottomNav'
import { Loader2 } from 'lucide-react'

const PUBLIC_PATHS = ['/login', '/register', '/api/health']

export const AppShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading } = useAuth()

  const isPublicPath = PUBLIC_PATHS.includes(pathname)

  React.useEffect(() => {
    if (!isLoading && !user && !isPublicPath) {
      router.push('/login')
    }
  }, [user, isLoading, isPublicPath, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
        <span className="text-sm font-medium">Loading PocketLens...</span>
      </div>
    )
  }

  // If on login or register, render directly without navigation shell
  if (isPublicPath) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {children}
      </main>
    )
  }

  // If not authenticated and not public path, render null while redirect triggers
  if (!user) {
    return null
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-8">
        <Header />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fadeIn">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
