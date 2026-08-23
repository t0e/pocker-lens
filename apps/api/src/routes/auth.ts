import { FastifyPluginAsync } from 'fastify';
import { registerSchema, loginSchema } from '@pocketlens/shared';
import { prisma } from '../db/client.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  formatUserResponse,
} from '../auth/service.js';
import { SESSION_COOKIE_NAME } from '../plugins/auth.js';
import { config } from '../config/env.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post('/auth/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid registration input',
        details: parseResult.error.format(),
      });
    }

    const { email, password, displayName } = parseResult.data;

    // Check if email already registered
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'An account with this email address already exists.',
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
      },
    });

    // Create session & set cookie
    const session = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE_NAME, session.token, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: config.SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    });

    return reply.status(201).send({
      user: formatUserResponse(user),
      message: 'Registration successful',
    });
  });

  // POST /auth/login
  fastify.post('/auth/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid login input',
      });
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    // Create session & set cookie
    const session = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE_NAME, session.token, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: config.SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    });

    return reply.send({
      user: formatUserResponse(user),
      message: 'Login successful',
    });
  });

  // POST /auth/logout
  fastify.post('/auth/logout', async (request, reply) => {
    let token: string | undefined;
    const signedCookie = request.cookies[SESSION_COOKIE_NAME];

    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      token = unsigned.valid && unsigned.value ? unsigned.value : signedCookie;
    }

    if (!token && request.headers.authorization) {
      const [scheme, headerToken] = request.headers.authorization.split(' ');
      if (scheme === 'Bearer') token = headerToken;
    }

    if (token) {
      await deleteSession(token);
    }

    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  // GET /auth/me
  fastify.get(
    '/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      return reply.send({
        user: formatUserResponse(request.user),
      });
    }
  );
};
