'use client';

import React from 'react';
import { Globe, User, Shield, Server, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Settings & Profile
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Manage your user session, account security, and application preferences
          </p>
        </div>
        <Badge variant="success">Phase 2 Active</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-emerald-500" />
              <CardTitle className="text-base">Authenticated User</CardTitle>
            </div>
            <CardDescription className="text-xs">Your personal account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-0.5">Display Name</label>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {user?.displayName || 'N/A'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-0.5">Email Address</label>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {user?.email || 'N/A'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-0.5">User ID</label>
              <div className="text-xs font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg truncate">
                {user?.id || 'N/A'}
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout()}
                className="text-xs space-x-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security & Ownership Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-emerald-500" />
              <CardTitle className="text-base">Security & Architecture</CardTitle>
            </div>
            <CardDescription className="text-xs">Multi-layer security verification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Authentication</span>
              <Badge variant="success">HttpOnly Cookie Sessions</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Password Encryption</span>
              <Badge variant="success">Bcrypt (Salted)</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Account Ownership</span>
              <Badge variant="success">Strict Database Scoping</Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-zinc-600 dark:text-zinc-400">Money Precision</span>
              <Badge variant="success">PostgreSQL NUMERIC(19,4)</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
