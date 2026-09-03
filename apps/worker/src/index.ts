import pino from 'pino'
import { Worker } from 'bullmq'
import { config } from './config/env.js'
import { createRedisConnection } from './queue/index.js'
import {
  QUEUE_NAMES,
  ReceiptJobData,
  ReceiptJobResult,
} from '@pocketlens/shared'
import { createStorageProvider } from '@pocketlens/shared/server'
import { processReceiptJob } from './processor/receipt.js'
import { runRecurringScheduler } from './scheduler/recurring.js'
import { prisma } from './db/client.js'

const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
})

const WORKER_CONCURRENCY = parseInt(
  process.env.RECEIPT_WORKER_CONCURRENCY || '1',
  10,
)

let worker: Worker<ReceiptJobData, ReceiptJobResult> | null = null
let redisConnection: ReturnType<typeof createRedisConnection> | null = null
let recurringTimer: NodeJS.Timeout | null = null

async function startWorker() {
  logger.info(
    { env: config.NODE_ENV, concurrency: WORKER_CONCURRENCY },
    '🚀 Initializing PocketLens Background Worker...',
  )

  try {
    // Check storage readiness
    const storage = createStorageProvider({
      provider: config.STORAGE_PROVIDER,
      localBasePath: config.RECEIPT_STORAGE_PATH,
    })
    const storageReady = await storage.ensureReady()
    if (storageReady) {
      logger.info(
        { path: config.RECEIPT_STORAGE_PATH },
        '📦 Storage provider initialized',
      )
    } else {
      logger.warn(
        { path: config.RECEIPT_STORAGE_PATH },
        '⚠️ Storage provider path not writable',
      )
    }

    // Connect to Redis
    redisConnection = createRedisConnection(config.REDIS_URL)
    const pong = await redisConnection.ping()
    logger.info({ pong }, '✅ Redis connection established')

    // Start BullMQ Worker — concurrency=1 by default for OCR memory safety
    worker = new Worker<ReceiptJobData, ReceiptJobResult>(
      QUEUE_NAMES.RECEIPT_PROCESSING,
      processReceiptJob,
      {
        connection: redisConnection,
        concurrency: WORKER_CONCURRENCY,
      },
    )

    worker.on('completed', (job) => {
      logger.info(
        { jobId: job.id, receiptId: job.data.receiptId },
        'Job successfully completed',
      )
    })

    worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, receiptId: job?.data.receiptId, err: err.message },
        'Job failed',
      )
    })

    logger.info(
      '⚡ PocketLens BullMQ Worker active and listening for receipt jobs',
    )

    // Run recurring scheduler immediately on startup, then periodically every 60s
    try {
      await runRecurringScheduler()
    } catch (schedErr: any) {
      logger.warn(
        { err: schedErr.message },
        'Initial recurring scheduler run completed with errors',
      )
    }

    recurringTimer = setInterval(async () => {
      try {
        await runRecurringScheduler()
      } catch (err: any) {
        logger.error({ err: err.message }, 'Recurring scheduler tick error')
      }
    }, 60000)

    if (recurringTimer && typeof recurringTimer.unref === 'function') {
      recurringTimer.unref()
    }
  } catch (err) {
    logger.error({ err }, '❌ Fatal worker startup failure')
    process.exit(1)
  }
}

// Graceful Shutdown
let isShuttingDown = false
async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info(`Received ${signal}. Shutting down worker gracefully...`)

  try {
    if (recurringTimer) {
      clearInterval(recurringTimer)
      recurringTimer = null
    }

    if (worker) {
      await worker.close()
      logger.info('BullMQ worker closed')
    }

    if (redisConnection) {
      await redisConnection.quit()
      logger.info('Redis connection closed')
    }

    await prisma.$disconnect()
    logger.info('Prisma disconnected')

    logger.info('Graceful shutdown complete. Goodbye.')
    process.exit(0)
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown')
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

startWorker()
