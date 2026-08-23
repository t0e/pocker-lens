'use client';

import React from 'react';
import { Globe, DollarSign, HardDrive, Shield, Server, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Settings & Architecture</h2>
          <p className="text-xs text-zinc-500 mt-0.5">System preferences, localization, and container status</p>
        </div>
        <Badge variant="phase">Phase 1 Active</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Localization Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Globe className="h-5 w-5 text-emerald-500" />
              <CardTitle className="text-base">Localization & Language</CardTitle>
            </div>
            <CardDescription className="text-xs">Multilingual receipt extraction support</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Primary Language</label>
              <select
                disabled
                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100"
                defaultValue="en"
              >
                <option value="en">English (US)</option>
                <option value="vi">Tiếng Việt (Vietnamese)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Default Currency</label>
              <select
                disabled
                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100"
                defaultValue="USD"
              >
                <option value="USD">USD ($ - United States Dollar)</option>
                <option value="VND">VND (₫ - Vietnamese Đồng)</option>
                <option value="EUR">EUR (€ - Euro)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Infrastructure & Storage Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Server className="h-5 w-5 text-emerald-500" />
              <CardTitle className="text-base">Phase 1 Infrastructure</CardTitle>
            </div>
            <CardDescription className="text-xs">Docker containers and services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Next.js Web Frontend</span>
              <Badge variant="success">Port 3000</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Node.js API Server</span>
              <Badge variant="success">Port 4000</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">Background Worker</span>
              <Badge variant="success">BullMQ / Redis</Badge>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-400">PostgreSQL 16</span>
              <Badge variant="success">Port 5432</Badge>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-zinc-600 dark:text-zinc-400">Receipt Storage Volume</span>
              <Badge variant="info">/data/receipts</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
