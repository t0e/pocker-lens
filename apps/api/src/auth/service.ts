import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { prisma } from '../db/client.js'
import { redis } from '../redis/client.js'
import { config } from '../config/env.js'
import { UserResponse } from '@pocketlens/shared'
import { User } from '@prisma/client'

const SALT_ROUNDS = 10
const SESSION_PREFIX = 'session:'

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function formatUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(
    Date.now() + config.SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  )

  // Store in database
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  })

  // Cache in Redis for ultra-fast validation
  try {
    const ttlSeconds = config.SESSION_EXPIRY_DAYS * 24 * 60 * 60
    await redis.setex(`${SESSION_PREFIX}${token}`, ttlSeconds, userId)
  } catch (redisErr) {
    // Redis cache failure is non-fatal; database remains source of truth
  }

  return { token, expiresAt }
}

export async function validateSession(token: string): Promise<User | null> {
  if (!token) return null

  try {
    // 1. Try Redis cache first
    let userId: string | null = null
    try {
      userId = await redis.get(`${SESSION_PREFIX}${token}`)
    } catch {
      // Ignore redis read error, fall through to DB
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      })
      if (user) return user
    }

    // 2. Fallback to PostgreSQL database lookup
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!session) {
      return null
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      await deleteSession(token)
      return null
    }

    // Populate Redis cache if missing
    try {
      const remainingTtl = Math.max(
        Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        60,
      )
      await redis.setex(
        `${SESSION_PREFIX}${token}`,
        remainingTtl,
        session.userId,
      )
    } catch {
      // Ignore
    }

    return session.user
  } catch (error) {
    return null
  }
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return

  // Evict from Redis
  try {
    await redis.del(`${SESSION_PREFIX}${token}`)
  } catch {
    // Ignore
  }

  // Delete from DB
  try {
    await prisma.session.deleteMany({
      where: { token },
    })
  } catch {
    // Ignore
  }
}
