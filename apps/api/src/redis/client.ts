import { Redis } from 'ioredis'
import { config } from '../config/env.js'

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000)
    return delay
  },
  lazyConnect: true,
})

redis.on('error', (err) => {
  // Prevent unhandled error event crashes while attempting reconnections
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Redis Client Error]', err.message)
  }
})

export async function checkRedisHealth(): Promise<
  'connected' | 'disconnected' | 'error'
> {
  try {
    if (
      redis.status !== 'ready' &&
      redis.status !== 'connecting' &&
      redis.status !== 'connect'
    ) {
      await redis.connect()
    }
    const pong = await redis.ping()
    return pong === 'PONG' ? 'connected' : 'error'
  } catch {
    return 'error'
  }
}
