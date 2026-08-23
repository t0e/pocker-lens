import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import * as dbModule from '../db/client.js';
import * as redisModule from '../redis/client.js';

describe('GET /health', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
  });

  it('returns 200 ok when all services are healthy', async () => {
    vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValue('connected');
    vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue('connected');

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.services.postgres).toBe('connected');
    expect(body.services.redis).toBe('connected');
    expect(body.services.storage).toBe('ready');
  });

  it('returns 503 degraded when postgres is down', async () => {
    vi.spyOn(dbModule, 'checkDatabaseHealth').mockResolvedValue('error');
    vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValue('connected');

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.services.postgres).toBe('error');
  });
});
