import { FastifyPluginAsync } from 'fastify';
import {
  Prisma,
  Transaction,
  TransactionType as PrismaTransactionType,
  CategoryType as PrismaCategoryType,
} from '@prisma/client';
import {
  createTransactionSchema,
  updateTransactionSchema,
  TransactionResponse,
  TransactionType,
  PaginatedTransactionsResponse,
  MonthlyFinancialSummaryResponse,
  CurrencyMonthlySummary,
} from '@pocketlens/shared';
import { prisma } from '../db/client.js';
import { formatAccountResponse } from './accounts.js';
import { formatCategoryResponse } from './categories.js';

export function formatTransactionResponse(tx: any): TransactionResponse {
  return {
    id: tx.id,
    userId: tx.userId,
    type: tx.type.toLowerCase() as TransactionType,
    accountId: tx.accountId,
    account: tx.account ? formatAccountResponse(tx.account) : undefined,
    transferAccountId: tx.transferAccountId,
    transferAccount: tx.transferAccount ? formatAccountResponse(tx.transferAccount) : undefined,
    categoryId: tx.categoryId,
    category: tx.category ? formatCategoryResponse(tx.category) : undefined,
    amount: tx.amount.toString(),
    currency: tx.currency,
    transactionDate: tx.transactionDate instanceof Date ? tx.transactionDate.toISOString() : tx.transactionDate,
    description: tx.description,
    merchant: tx.merchant,
    notes: tx.notes,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
    updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : tx.updatedAt,
  };
}

export const transactionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /transactions/summary (Monthly Income, Expense, Net per Currency)
  fastify.get('/transactions/summary', async (request, reply) => {
    const query = request.query as { month?: string };
    const userId = request.user.id;

    const now = new Date();
    const targetMonthStr = query.month || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = targetMonthStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid month format. Expected YYYY-MM (e.g. 2026-08)',
      });
    }

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Exclude transfers strictly from monthly income/expense summary
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: { in: ['EXPENSE', 'INCOME'] },
        transactionDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const aggregates: Record<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal; incomeCount: number; expenseCount: number }
    > = {};

    for (const tx of transactions) {
      const cur = tx.currency;
      if (!aggregates[cur]) {
        aggregates[cur] = {
          income: new Prisma.Decimal(0),
          expense: new Prisma.Decimal(0),
          incomeCount: 0,
          expenseCount: 0,
        };
      }

      if (tx.type === 'INCOME') {
        aggregates[cur].income = aggregates[cur].income.plus(tx.amount);
        aggregates[cur].incomeCount++;
      } else if (tx.type === 'EXPENSE') {
        aggregates[cur].expense = aggregates[cur].expense.plus(tx.amount);
        aggregates[cur].expenseCount++;
      }
    }

    const summaries: CurrencyMonthlySummary[] = Object.entries(aggregates).map(([currency, data]) => ({
      currency,
      income: data.income.toString(),
      expense: data.expense.toString(),
      net: data.income.minus(data.expense).toString(),
      incomeCount: data.incomeCount,
      expenseCount: data.expenseCount,
    }));

    const response: MonthlyFinancialSummaryResponse = {
      month: targetMonthStr,
      summaries,
    };

    return reply.send(response);
  });

  // GET /transactions (List with Pagination and Filtering)
  fastify.get('/transactions', async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      type?: string;
      accountId?: string;
      categoryId?: string;
      startDate?: string;
      endDate?: string;
    };

    const userId = request.user.id;
    const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(query.type && ['expense', 'income', 'transfer'].includes(query.type)
        ? { type: query.type.toUpperCase() as PrismaTransactionType }
        : {}),
      ...(query.accountId
        ? {
            OR: [{ accountId: query.accountId }, { transferAccountId: query.accountId }],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.startDate || query.endDate
        ? {
            transactionDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: {
          account: true,
          transferAccount: true,
          category: true,
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const response: PaginatedTransactionsResponse = {
      transactions: transactions.map(formatTransactionResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    return reply.send(response);
  });

  // GET /transactions/:id
  fastify.get<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const tx = await prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        account: true,
        transferAccount: true,
        category: true,
      },
    });

    if (!tx) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Transaction not found',
      });
    }

    return reply.send(formatTransactionResponse(tx));
  });

  // POST /transactions (Create Expense, Income, or Transfer)
  fastify.post('/transactions', async (request, reply) => {
    const parseResult = createTransactionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid transaction input',
        details: parseResult.error.format(),
      });
    }

    const {
      type,
      accountId,
      transferAccountId,
      categoryId,
      amount,
      transactionDate,
      description,
      merchant,
      notes,
    } = parseResult.data;

    const userId = request.user.id;
    const amountDecimal = new Prisma.Decimal(amount);
    const dateObj = new Date(transactionDate);

    // Verify source account ownership
    const sourceAccount = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });

    if (!sourceAccount) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Source account not found',
      });
    }

    let destinationAccount: any = null;
    if (type === 'transfer') {
      if (!transferAccountId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Destination account is required for transfers',
        });
      }

      if (accountId === transferAccountId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Source and destination accounts cannot be the same',
        });
      }

      destinationAccount = await prisma.account.findFirst({
        where: { id: transferAccountId, userId },
      });

      if (!destinationAccount) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Destination account not found',
        });
      }

      // Enforce same-currency transfers for Phase 3
      if (sourceAccount.currency !== destinationAccount.currency) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Cross-currency transfers are not supported in Phase 3. Both accounts must use ${sourceAccount.currency}.`,
        });
      }
    }

    // Verify Category if provided
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          OR: [{ isSystem: true }, { userId }],
          isArchived: false,
        },
      });

      if (!category) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Category not found',
        });
      }

      // Verify category type matches transaction type
      if (type === 'expense' && category.type !== 'EXPENSE') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Selected category is not an expense category',
        });
      }

      if (type === 'income' && category.type !== 'INCOME') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Selected category is not an income category',
        });
      }
    }

    // Atomic Database Transaction for accounting integrity
    const createdTx = await prisma.$transaction(async (tx) => {
      // 1. Update account balance(s)
      if (type === 'expense') {
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: {
            currentBalance: {
              decrement: amountDecimal,
            },
          },
        });
      } else if (type === 'income') {
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: {
            currentBalance: {
              increment: amountDecimal,
            },
          },
        });
      } else if (type === 'transfer') {
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: {
            currentBalance: {
              decrement: amountDecimal,
            },
          },
        });

        await tx.account.update({
          where: { id: destinationAccount.id },
          data: {
            currentBalance: {
              increment: amountDecimal,
            },
          },
        });
      }

      // 2. Insert transaction record
      return await tx.transaction.create({
        data: {
          userId,
          type: type.toUpperCase() as PrismaTransactionType,
          accountId: sourceAccount.id,
          transferAccountId: destinationAccount ? destinationAccount.id : null,
          categoryId: categoryId || null,
          amount: amountDecimal,
          currency: sourceAccount.currency,
          transactionDate: dateObj,
          description,
          merchant: merchant || null,
          notes: notes || null,
        },
        include: {
          account: true,
          transferAccount: true,
          category: true,
        },
      });
    });

    return reply.status(201).send(formatTransactionResponse(createdTx));
  });

  // PATCH /transactions/:id (Update Transaction with atomic balance recalculation)
  fastify.patch<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const parseResult = updateTransactionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: parseResult.error.errors[0]?.message || 'Invalid update input',
        details: parseResult.error.format(),
      });
    }

    const existingTx = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { account: true, transferAccount: true },
    });

    if (!existingTx) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Transaction not found',
      });
    }

    const updates = parseResult.data;
    const newType = (updates.type ? updates.type.toUpperCase() : existingTx.type) as PrismaTransactionType;
    const newAccountId = updates.accountId || existingTx.accountId;
    const newTransferAccountId =
      updates.transferAccountId !== undefined ? updates.transferAccountId : existingTx.transferAccountId;
    const newAmountDecimal = updates.amount ? new Prisma.Decimal(updates.amount) : existingTx.amount;
    const newDate = updates.transactionDate ? new Date(updates.transactionDate) : existingTx.transactionDate;
    const newCategoryId = updates.categoryId !== undefined ? updates.categoryId : existingTx.categoryId;

    // Verify source account ownership
    const sourceAccount = await prisma.account.findFirst({
      where: { id: newAccountId, userId },
    });

    if (!sourceAccount) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Account not found',
      });
    }

    let destinationAccount: any = null;
    if (newType === 'TRANSFER') {
      if (!newTransferAccountId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Destination account is required for transfers',
        });
      }

      if (newAccountId === newTransferAccountId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Source and destination accounts cannot be the same',
        });
      }

      destinationAccount = await prisma.account.findFirst({
        where: { id: newTransferAccountId, userId },
      });

      if (!destinationAccount) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Destination account not found',
        });
      }

      if (sourceAccount.currency !== destinationAccount.currency) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Cross-currency transfers are not supported. Both accounts must use ${sourceAccount.currency}.`,
        });
      }
    }

    // Verify category if changed
    if (newCategoryId) {
      const cat = await prisma.category.findFirst({
        where: {
          id: newCategoryId,
          OR: [{ isSystem: true }, { userId }],
          isArchived: false,
        },
      });

      if (!cat) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Category not found',
        });
      }
    }

    // Atomic Balance Reversion & Re-application
    const updatedTx = await prisma.$transaction(async (tx) => {
      // 1. Revert previous transaction effect
      if (existingTx.type === 'EXPENSE') {
        await tx.account.update({
          where: { id: existingTx.accountId },
          data: { currentBalance: { increment: existingTx.amount } },
        });
      } else if (existingTx.type === 'INCOME') {
        await tx.account.update({
          where: { id: existingTx.accountId },
          data: { currentBalance: { decrement: existingTx.amount } },
        });
      } else if (existingTx.type === 'TRANSFER' && existingTx.transferAccountId) {
        await tx.account.update({
          where: { id: existingTx.accountId },
          data: { currentBalance: { increment: existingTx.amount } },
        });
        await tx.account.update({
          where: { id: existingTx.transferAccountId },
          data: { currentBalance: { decrement: existingTx.amount } },
        });
      }

      // 2. Apply new transaction effect
      if (newType === 'EXPENSE') {
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: { currentBalance: { decrement: newAmountDecimal } },
        });
      } else if (newType === 'INCOME') {
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: { currentBalance: { increment: newAmountDecimal } },
        });
      } else if (newType === 'TRANSFER' && destinationAccount) {
        await tx.account.update({
          where: { id: sourceAccount.id },
          data: { currentBalance: { decrement: newAmountDecimal } },
        });
        await tx.account.update({
          where: { id: destinationAccount.id },
          data: { currentBalance: { increment: newAmountDecimal } },
        });
      }

      // 3. Update transaction row
      return await tx.transaction.update({
        where: { id },
        data: {
          type: newType,
          accountId: sourceAccount.id,
          transferAccountId: destinationAccount ? destinationAccount.id : null,
          categoryId: newCategoryId || null,
          amount: newAmountDecimal,
          currency: sourceAccount.currency,
          transactionDate: newDate,
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.merchant !== undefined && { merchant: updates.merchant }),
          ...(updates.notes !== undefined && { notes: updates.notes }),
        },
        include: {
          account: true,
          transferAccount: true,
          category: true,
        },
      });
    });

    return reply.send(formatTransactionResponse(updatedTx));
  });

  // DELETE /transactions/:id (Atomic Reversal and Deletion)
  fastify.delete<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const existingTx = await prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!existingTx) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Transaction not found',
      });
    }

    await prisma.$transaction(async (tx) => {
      // Revert balance effects
      if (existingTx.type === 'EXPENSE') {
        await tx.account.update({
          where: { id: existingTx.accountId },
          data: { currentBalance: { increment: existingTx.amount } },
        });
      } else if (existingTx.type === 'INCOME') {
        await tx.account.update({
          where: { id: existingTx.accountId },
          data: { currentBalance: { decrement: existingTx.amount } },
        });
      } else if (existingTx.type === 'TRANSFER' && existingTx.transferAccountId) {
        await tx.account.update({
          where: { id: existingTx.accountId },
          data: { currentBalance: { increment: existingTx.amount } },
        });
        await tx.account.update({
          where: { id: existingTx.transferAccountId },
          data: { currentBalance: { decrement: existingTx.amount } },
        });
      }

      await tx.transaction.delete({
        where: { id },
      });
    });

    return reply.send({
      success: true,
      message: 'Transaction deleted and balance adjusted successfully',
    });
  });
};
