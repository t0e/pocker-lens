import { FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '../db/client.js';
import { checkRedisHealth } from '../redis/client.js';
import { createStorageProvider, HealthStatus } from '@pocketlens/shared';
import { config } from '../config/env.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const storage = createStorageProvider({
    provider: config.STORAGE_PROVIDER,
    localBasePath: config.RECEIPT_STORAGE_PATH,
  });

  fastify.get('/health', async (request, reply) => {
    const startTime = process.uptime();
    const [pgStatus, redisStatus, storageReady] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      storage.ensureReady(),
    ]);

    const isHealthy = pgStatus === 'connected' && redisStatus === 'connected' && storageReady;

    const response: HealthStatus = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Number(startTime.toFixed(2)),
      environment: config.NODE_ENV,
      services: {
        postgres: pgStatus,
        redis: redisStatus,
        storage: storageReady ? 'ready' : 'unavailable',
      },
      version: '0.1.0',
    };

    return reply.status(isHealthy ? 200 : 503).send(response);
  });
};
