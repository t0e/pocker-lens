import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, ReceiptJobData, ReceiptJobResult } from '@pocketlens/shared';

export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });
}

export function createReceiptQueue(connection: Redis): Queue<ReceiptJobData, ReceiptJobResult> {
  return new Queue<ReceiptJobData, ReceiptJobResult>(QUEUE_NAMES.RECEIPT_PROCESSING, {
    connection,
  });
}
