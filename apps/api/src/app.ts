import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import authPlugin from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { accountRoutes } from './routes/accounts.js';
import { categoryRoutes } from './routes/categories.js';
import { transactionRoutes } from './routes/transactions.js';
import { receiptRoutes } from './routes/receipts.js';
import { budgetRoutes } from './routes/budgets.js';
import { recurringRoutes } from './routes/recurring.js';
import { analyticsRoutes } from './routes/analytics.js';
import { fxRoutes } from './routes/fx.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { config } from './config/env.js';
import { MAX_RECEIPT_FILE_SIZE } from '@pocketlens/shared';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    disableRequestLogging: false,
  });

  // CORS configured to allow cookie credentials from configured origins
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.register(helmet, {
    contentSecurityPolicy: false,
  });

  app.register(sensible);

  // Multipart support for receipt image uploads
  app.register(multipart, {
    limits: {
      fileSize: MAX_RECEIPT_FILE_SIZE,
      files: 1,
    },
  });

  // Cookie parser & signer
  app.register(cookie, {
    secret: config.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // Auth Decorator & Hooks
  app.register(authPlugin);

  // Routes
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(accountRoutes);
  app.register(categoryRoutes);
  app.register(transactionRoutes);
  app.register(receiptRoutes);
  app.register(budgetRoutes);
  app.register(recurringRoutes);
  app.register(analyticsRoutes);
  app.register(fxRoutes);
  app.register(intelligenceRoutes);

  // Centralized error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Internal Server Error',
      message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
