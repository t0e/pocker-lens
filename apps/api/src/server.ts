import { buildApp } from './app.js';
import { config } from './config/env.js';
import { prisma } from './db/client.js';
import { redis } from './redis/client.js';

const app = buildApp();

async function startServer() {
  try {
    // Attempt initial Redis connection
    try {
      await redis.connect();
      app.log.info('✅ Redis connection initialized');
    } catch (redisErr) {
      app.log.warn({ err: redisErr }, '⚠️ Redis initial connection failed, will retry on demand');
    }

    await app.listen({
      port: config.API_PORT,
      host: config.HOST,
    });

    app.log.info(`🚀 PocketLens API server listening on http://${config.HOST}:${config.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful Shutdown
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    await app.close();
    app.log.info('HTTP server closed');

    await prisma.$disconnect();
    app.log.info('Database client disconnected');

    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.quit();
      app.log.info('Redis client disconnected');
    }

    app.log.info('Graceful shutdown completed. Exiting.');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();
