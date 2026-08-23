import { FastifyPluginAsync } from 'fastify';
import { Prisma, Account, AccountType as PrismaAccountType } from '@prisma/client';
import {
  createAccountSchema,
  updateAccountSchema,
  AccountResponse,
  AccountType,
} from '@pocketlens/shared';
import { prisma } from '../db/client.js';

export function formatAccountResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    type: account.type.toLowerCase() as AccountType,
    currency: account.currency,
    openingBalance: account.openingBalance.toString(),
    currentBalance: account.currentBalance.toString(),
    isArchived: account.isArchived,
    isDefault: account.isDefault,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export const accountRoutes: FastifyPluginAsync = async (fastify) => {
  // All account routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // POST /accounts
  fastify.post('/accounts', async (request, reply) => {
    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid account input',
        details: parseResult.error.format(),
      });
    }

    const { name, type, currency, openingBalance, isDefault } = parseResult.data;
    const userId = request.user.id;
    const openingDecimal = new Prisma.Decimal(openingBalance);

    const account = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        // Unset any existing default account for this user
        await tx.account.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return await tx.account.create({
        data: {
          userId,
          name,
          type: type.toUpperCase() as PrismaAccountType,
          currency: currency.toUpperCase(),
          openingBalance: openingDecimal,
          currentBalance: openingDecimal, // Phase 2: current_balance starts at opening_balance
          isDefault: isDefault ?? false,
          isArchived: false,
        },
      });
    });

    return reply.status(201).send(formatAccountResponse(account));
  });

  // GET /accounts
  fastify.get('/accounts', async (request, reply) => {
    const query = request.query as { includeArchived?: string | boolean };
    const includeArchived = query.includeArchived === 'true' || query.includeArchived === true;
    const userId = request.user.id;

    const accounts = await prisma.account.findMany({
      where: {
        userId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return reply.send(accounts.map(formatAccountResponse));
  });

  // GET /accounts/:id
  fastify.get<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    // Strict user ownership check: returns 404 if not found or belongs to another user
    const account = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!account) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Account not found',
      });
    }

    return reply.send(formatAccountResponse(account));
  });

  // PATCH /accounts/:id
  fastify.patch<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const parseResult = updateAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid account update input',
        details: parseResult.error.format(),
      });
    }

    // Verify ownership first
    const existing = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Account not found',
      });
    }

    const { name, type, currency, isArchived, isDefault } = parseResult.data;

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.account.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return await tx.account.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(type !== undefined && { type: type.toUpperCase() as PrismaAccountType }),
          ...(currency !== undefined && { currency: currency.toUpperCase() }),
          ...(isArchived !== undefined && { isArchived }),
          ...(isDefault !== undefined && { isDefault: isArchived ? false : isDefault }),
        },
      });
    });

    return reply.send(formatAccountResponse(updated));
  });

  // DELETE /accounts/:id (Soft-delete / Archive)
  fastify.delete<{ Params: { id: string } }>('/accounts/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    // Verify ownership
    const existing = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Account not found',
      });
    }

    // Archive the account and unset default flag
    await prisma.account.update({
      where: { id },
      data: {
        isArchived: true,
        isDefault: false,
      },
    });

    return reply.send({
      success: true,
      message: 'Account archived successfully',
    });
  });
};
