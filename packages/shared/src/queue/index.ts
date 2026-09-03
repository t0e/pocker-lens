export const QUEUE_NAMES = {
  RECEIPT_PROCESSING: 'receipt-processing',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

export interface ReceiptJobData {
  receiptId: string
  fileKey: string
  mimeType: string
  userId?: string
  createdAt: string
}

export interface ReceiptJobResult {
  receiptId: string
  success: boolean
  processedAt: string
}
