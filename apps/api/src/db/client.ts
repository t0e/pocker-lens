import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['error'],
})

export async function checkDatabaseHealth(): Promise<
  'connected' | 'disconnected' | 'error'
> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'connected'
  } catch {
    return 'error'
  }
}
