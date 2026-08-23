import { z } from 'zod';

export type ReceiptStatus = 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed';

export const MAX_RECEIPT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedReceiptMimeType = (typeof ALLOWED_RECEIPT_MIME_TYPES)[number];

export interface ReceiptResponse {
  id: string;
  userId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  status: ReceiptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  transactionId: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedReceiptsResponse {
  receipts: ReceiptResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Validates file signature (magic bytes) to verify it is authentic image data
 */
export function validateImageMagicBytes(buffer: Buffer): { valid: boolean; detectedMimeType?: string } {
  if (!buffer || buffer.length < 12) {
    return { valid: false };
  }

  // JPEG: Starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMimeType: 'image/jpeg' };
  }

  // PNG: Starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMimeType: 'image/png' };
  }

  // WebP: RIFF ... WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMimeType: 'image/webp' };
  }

  return { valid: false };
}
