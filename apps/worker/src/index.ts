import pino from 'pino';
import { config } from './config/env.js';
import { createRedisConnection, createReceiptQueue } from './queue/index.js';
import { createStorageProvider } from '@pocketlens/shared';

const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
});

let redisConnection: ReturnType<typeof createRedisConnection> | null = null;
let receiptQueue: ReturnType<typeof createReceiptQueue> | null = null;

async function startWorker() {
  logger.info({ env: config.NODE_ENV }, '🚀 Initializing PocketLens Background Worker...');

  try {
    // Check storage readiness
    const storage = createStorageProvider({
      provider: config.STORAGE_PROVIDER,
      localBasePath: config.RECEIPT_STORAGE_PATH,
    });
    const storageReady = await storage.ensureReady();
    if (storageReady) {
      logger.info({ path: config.RECEIPT_STORAGE_PATH }, '📦 Storage provider initialized');
    } else {
      logger.warn({ path: config.RECEIPT_STORAGE_PATH }, '⚠️ Storage provider path not writable');
    }

    // Connect to Redis
    redisConnection = createRedisConnection(config.REDIS_URL);
    const pong = await redisConnection.ping();
    logger.info({ pong }, '✅ Redis connection established');

    // Initialize BullMQ Queue structure (ready for Phase 2 receipt jobs)
    receiptQueue = createReceiptQueue(redisConnection);
    logger.info({ queue: receiptQueue.name }, '📬 Receipt processing queue structure registered');

    logger.info('⚡ PocketLens Worker started and idle (awaiting Phase 2 job processors)');
  } catch (err) {
    logger.error({ err }, '❌ Fatal worker startup failure');
    process.exit(1);
  }
}

// Graceful Shutdown
let isShuttingDown = false;
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Shutting down worker gracefully...`);

  try {
    if (receiptQueue) {
      await receiptQueue.close();
      logger.info('BullMQ queue closed');
    }

    if (redisConnection) {
      await redisConnection.quit();
      logger.info('Redis connection closed');
    }

    logger.info('Graceful shutdown complete. Goodbye.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startWorker();
