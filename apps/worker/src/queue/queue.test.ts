import { describe, it, expect, vi } from 'vitest'
import { createRedisConnection, createReceiptQueue } from './index.js'
import { QUEUE_NAMES } from '@pocketlens/shared'

describe('Worker Queue Setup', () => {
  it('has correct receipt processing queue name', () => {
    expect(QUEUE_NAMES.RECEIPT_PROCESSING).toBe('receipt-processing')
  })

  it('initializes BullMQ queue structure without error', () => {
    const mockRedis: any = {
      options: {},
      on: vi.fn(),
      status: 'ready',
    }
    const queue = createReceiptQueue(mockRedis)
    expect(queue.name).toBe('receipt-processing')
  })
})
