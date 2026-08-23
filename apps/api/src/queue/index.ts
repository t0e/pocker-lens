import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, ReceiptJobData, ReceiptJobResult } from '@pocketlens/shared';
import { config } from '../config/env.js';

let redisConnection: Redis | null = null;
let receiptQueue: Queue<ReceiptJobData, ReceiptJobResult> | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redisConnection;
}

export function getReceiptQueue(): Queue<ReceiptJobData, ReceiptJobResult> {
  if (!receiptQueue) {
    receiptQueue = new Queue<ReceiptJobData, ReceiptJobResult>(QUEUE_NAMES.RECEIPT_PROCESSING, {
      connection: getRedisConnection(),
    });
  }
  return receiptQueue;
}
