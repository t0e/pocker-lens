'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Camera,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { MAX_RECEIPT_FILE_SIZE, ALLOWED_RECEIPT_MIME_TYPES } from '@pocketlens/shared';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { apiClient } from '@/lib/api-client';

interface ReceiptUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReceiptUploadModal: React.FC<ReceiptUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setError(null);

    // Validate MIME type
    if (!ALLOWED_RECEIPT_MIME_TYPES.includes(file.type as any)) {
      setError(`Unsupported file type: ${file.type}. Please upload JPEG, PNG, or WebP.`);
      return;
    }

    // Validate size
    if (file.size > MAX_RECEIPT_FILE_SIZE) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 10MB maximum.`);
      return;
    }

    if (file.size === 0) {
      setError('Selected file is empty.');
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      await apiClient('/receipts', {
        method: 'POST',
        body: formData,
      });

      handleClear();
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload receipt');
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Upload Receipt
            </h3>
            <Badge variant="phase" className="text-[10px]">Phase 5</Badge>
          </div>
          <button
            onClick={() => {
              handleClear();
              onClose();
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start space-x-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden Inputs */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          className="hidden"
        />
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          className="hidden"
        />

        {/* Upload Dropzone or Preview */}
        {!selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <Upload className="h-6 w-6" />
            </div>

            <div className="space-y-1 mb-4">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Drag and drop your receipt here
              </p>
              <p className="text-xs text-zinc-400">
                Supports JPEG, PNG, or WebP up to 10MB
              </p>
            </div>

            {/* Mobile & Desktop action triggers */}
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="space-x-1.5 text-xs"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>Choose Image</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                className="space-x-1.5 text-xs"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Take Photo</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Image Preview & Details Card */
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 aspect-[4/3] flex items-center justify-center group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl || ''}
                alt="Receipt preview"
                className="max-h-full max-w-full object-contain"
              />
              <button
                type="button"
                onClick={handleClear}
                className="absolute top-2 right-2 p-1.5 rounded-xl bg-zinc-900/80 text-white hover:bg-zinc-900 transition-all"
                title="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between text-xs">
              <div className="min-w-0 pr-2">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {selectedFile.name}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {formatFileSize(selectedFile.size)} • {selectedFile.type}
                </div>
              </div>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleClear}
                disabled={isUploading}
                className="flex-1 text-xs"
              >
                Choose Different
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={isUploading}
                onClick={handleUpload}
                className="flex-1 text-xs font-bold space-x-1.5"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>Upload & Queue</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
