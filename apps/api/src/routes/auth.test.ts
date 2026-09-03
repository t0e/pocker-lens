import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { prisma } from '../db/client.js'
import * as authService from '../auth/service.js'

describe('Auth Endpoints (/auth/*)', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    vi.restoreAllMocks()
    app = buildApp()
  })

  describe('POST /auth/register', () => {
    it('successfully registers a new user with hashed password and sets cookie', async () => {
      const mockUser = {
        id: 'usr_123',
        email: 'alex@example.com',
        passwordHash: 'hashed_password_xyz',
        displayName: 'Alex Doe',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)
      vi.spyOn(prisma.user, 'create').mockResolvedValue(mockUser as any)
      vi.spyOn(authService, 'createSession').mockResolvedValue({
        token: 'mock_session_token_12345',
        expiresAt: new Date(Date.now() + 3600000),
      })

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'alex@example.com',
          password: 'Password123!',
          displayName: 'Alex Doe',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.user.email).toBe('alex@example.com')
      expect(body.user.displayName).toBe('Alex Doe')
      expect(body.user.passwordHash).toBeUndefined() // Never expose password hash!
      expect(res.headers['set-cookie']).toBeDefined()
    })

    it('rejects duplicate email with 409 Conflict', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'usr_existing',
        email: 'alex@example.com',
      } as any)

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'alex@example.com',
          password: 'Password123!',
          displayName: 'Alex Doe',
        },
      })

      expect(res.statusCode).toBe(409)
      const body = JSON.parse(res.body)
      expect(body.message).toContain('already exists')
    })

    it('rejects invalid password length (< 8 chars)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'alex@example.com',
          password: 'short',
          displayName: 'Alex',
        },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.message).toContain('at least 8 characters')
    })
  })

  describe('POST /auth/login', () => {
    it('successfully logs in with valid credentials', async () => {
      const mockUser = {
        id: 'usr_123',
        email: 'alex@example.com',
        passwordHash: '$2a$10$hashed',
        displayName: 'Alex Doe',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any)
      vi.spyOn(authService, 'verifyPassword').mockResolvedValue(true)
      vi.spyOn(authService, 'createSession').mockResolvedValue({
        token: 'login_token_abc',
        expiresAt: new Date(Date.now() + 3600000),
      })

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'alex@example.com',
          password: 'Password123!',
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.user.email).toBe('alex@example.com')
      expect(body.user.passwordHash).toBeUndefined()
      expect(res.headers['set-cookie']).toBeDefined()
    })

    it('rejects wrong password with generic error message', async () => {
      const mockUser = {
        id: 'usr_123',
        email: 'alex@example.com',
        passwordHash: '$2a$10$hashed',
      }

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any)
      vi.spyOn(authService, 'verifyPassword').mockResolvedValue(false)

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'alex@example.com',
          password: 'WrongPassword!',
        },
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.message).toBe('Invalid email or password.')
    })

    it('rejects unknown email with generic error message', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'unknown@example.com',
          password: 'Password123!',
        },
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.message).toBe('Invalid email or password.')
    })
  })

  describe('GET /auth/me & POST /auth/logout', () => {
    it('returns 401 on /auth/me when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('Unauthorized')
    })

    it('returns current user on /auth/me when session is valid', async () => {
      const mockUser = {
        id: 'usr_logged_in',
        email: 'user@example.com',
        displayName: 'Current User',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.spyOn(authService, 'validateSession').mockResolvedValue(
        mockUser as any,
      )

      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'Bearer valid_session_token',
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.user.id).toBe('usr_logged_in')
      expect(body.user.email).toBe('user@example.com')
    })

    it('invalidates session on /auth/logout', async () => {
      const deleteSessionSpy = vi
        .spyOn(authService, 'deleteSession')
        .mockResolvedValue()

      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          authorization: 'Bearer token_to_logout',
        },
      })

      expect(res.statusCode).toBe(200)
      expect(deleteSessionSpy).toHaveBeenCalledWith('token_to_logout')
    })
  })
})
