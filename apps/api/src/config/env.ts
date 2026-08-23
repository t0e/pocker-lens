import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import os from 'node:os';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  RECEIPT_STORAGE_PATH: z.string().default('/data/receipts'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const rawData: Record<string, unknown> = { ...process.env };

  if (process.env.NODE_ENV === 'test') {
    rawData.RECEIPT_STORAGE_PATH = path.join(os.tmpdir(), 'pocketlens-test-receipts');
    if (!rawData.DATABASE_URL) {
      rawData.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/pocketlens_test';
    }
    if (!rawData.REDIS_URL) {
      rawData.REDIS_URL = 'redis://localhost:6379';
    }
  }

  const result = envSchema.safeParse(rawData);
  if (!result.success) {
    const errorMsg = JSON.stringify(result.error.format(), null, 2);
    if (process.env.NODE_ENV === 'test') {
      throw new Error(`Invalid environment variables:\n${errorMsg}`);
    }
    console.error('❌ Invalid environment variables:');
    console.error(errorMsg);
    process.exit(1);
  }
  return result.data;
}

export const config = loadEnv();
