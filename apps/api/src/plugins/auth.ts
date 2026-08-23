import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateSession } from '../auth/service.js';
import { User } from '@prisma/client';

export const SESSION_COOKIE_NAME = 'pocketlens_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // 1. Check signed cookie
      let token: string | undefined;
      const signedCookie = request.cookies[SESSION_COOKIE_NAME];

      if (signedCookie) {
        const unsigned = request.unsignCookie(signedCookie);
        token = unsigned.valid && unsigned.value ? unsigned.value : signedCookie;
      }

      // 2. Check Authorization header (e.g. Bearer <token>) as fallback
      if (!token && request.headers.authorization) {
        const [scheme, headerToken] = request.headers.authorization.split(' ');
        if (scheme === 'Bearer' && headerToken) {
          token = headerToken;
        }
      }

      if (!token) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Authentication required. Please log in.',
        });
      }

      const user = await validateSession(token);
      if (!user) {
        // Clear invalid cookie
        reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Session has expired or is invalid. Please log in again.',
        });
      }

      request.user = user;
    }
  );
};

export default fp(authPlugin);
