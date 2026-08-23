'use client';

import React from 'react';
import { Camera, UploadCloud, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function ReceiptsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Receipt Scanner</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Automated English & Vietnamese OCR receipt extraction</p>
        </div>
        <Badge variant="phase">Phase 2: AI / OCR</Badge>
      </div>

      {/* Receipt Dropzone Mock */}
      <Card className="border-dashed border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30">
        <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <UploadCloud className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Drag & Drop receipt image or take a photo
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm">
              Supports JPEG, PNG, HEIC, PDF. Worker will process queue in background.
            </p>
          </div>
          <Button variant="primary" size="md" disabled className="space-x-2">
            <Camera className="h-4 w-4" />
            <span>Select Receipt (Phase 2)</span>
          </Button>
        </CardContent>
      </Card>

      {/* Background Processing Queue Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Background Queue Status</CardTitle>
          <CardDescription className="text-xs">BullMQ & Redis background worker pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Clock className="h-5 w-5 text-emerald-500" />
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Worker Infrastructure Ready</div>
                <div className="text-xs text-zinc-500">Storage path: /data/receipts • Redis Queue: receipt-processing</div>
              </div>
            </div>
            <Badge variant="success">Online</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
