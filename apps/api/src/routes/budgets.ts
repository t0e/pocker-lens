import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  CreateBudgetSchema,
  UpdateBudgetSchema,
  CopyBudgetsSchema,
  BudgetResponse,
  BudgetMonthSummary,
  MonthlyBudgetsResponse,
  BudgetStatus,
  getMonthBounds,
} from '@pocketlens/shared';
import { prisma } from '../db/client.js';

export function formatBudgetResponse(
  budget: any,
  spent = 0
): BudgetResponse {
  const amount = parseFloat(budget.amount.toString());
  const remaining = amount - spent;
  const percentage = amount > 0 ? (spent / amount) * 100 : 0;

  let status: BudgetStatus = 'NORMAL';
  if (percentage >= 100) {
    status = 'OVER_BUDGET';
  } else if (percentage >= 80) {
    status = 'WARNING';
  }

  const overBudgetAmount = spent > amount ? spent - amount : 0;

  return {
    id: budget.id,
    userId: budget.userId,
    categoryId: budget.categoryId,
    categoryName: budget.category ? budget.category.name : 'Unknown Category',
    categoryIcon: budget.category ? budget.category.icon : null,
    amount,
    spent,
    remaining,
    percentage: Math.round(percentage * 100) / 100,
    status,
    overBudgetAmount,
    currency: budget.currency,
    month: budget.month,
    createdAt: budget.createdAt instanceof Date ? budget.createdAt.toISOString() : budget.createdAt,
    updatedAt: budget.updatedAt instanceof Date ? budget.updatedAt.toISOString() : budget.updatedAt,
  };
}

export const budgetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /budgets (List budgets for a month with calculated spent/remaining/status)
  fastify.get('/budgets', async (request, reply) => {
    const query = request.query as { month?: string };
    const userId = request.user.id;

    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const month = query.month || currentMonthStr;

    let bounds: { startOfMonth: Date; endOfMonth: Date };
    try {
      bounds = getMonthBounds(month);
    } catch {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Invalid month format: ${month}. Expected YYYY-MM (e.g. 2026-08)`,
      });
    }

    // 1. Fetch user budgets for the specified month
    const budgets = await prisma.budget.findMany({
      where: { userId, month },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (budgets.length === 0) {
      const emptyResponse: MonthlyBudgetsResponse = {
        month,
        summaries: {},
        budgets: [],
      };
      return reply.send(emptyResponse);
    }

    const categoryIds = budgets.map((b) => b.categoryId);

    // 2. Efficient O(1) single grouped aggregation of actual expense transactions in this month
    const expensesGrouped = await prisma.transaction.groupBy({
      by: ['categoryId', 'currency'],
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { in: categoryIds },
        transactionDate: {
          gte: bounds.startOfMonth,
          lt: bounds.endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    // Create spending lookup key: `${categoryId}_${currency}`
    const spendingMap = new Map<string, number>();
    for (const exp of expensesGrouped) {
      if (exp.categoryId && exp.currency && exp._sum.amount) {
        const key = `${exp.categoryId}_${exp.currency}`;
        spendingMap.set(key, parseFloat(exp._sum.amount.toString()));
      }
    }

    // 3. Map budget responses and calculate month summaries per currency
    const summaries: Record<string, BudgetMonthSummary> = {};
    const formattedBudgets: BudgetResponse[] = [];

    for (const b of budgets) {
      const key = `${b.categoryId}_${b.currency}`;
      const spent = spendingMap.get(key) || 0;
      const formatted = formatBudgetResponse(b, spent);
      formattedBudgets.push(formatted);

      if (!summaries[b.currency]) {
        summaries[b.currency] = {
          month,
          currency: b.currency,
          totalBudget: 0,
          totalSpent: 0,
          totalRemaining: 0,
          overallPercentage: 0,
          budgetsCount: 0,
          overBudgetCount: 0,
        };
      }

      const sum = summaries[b.currency];
      sum.totalBudget += formatted.amount;
      sum.totalSpent += formatted.spent;
      sum.totalRemaining += formatted.remaining;
      sum.budgetsCount += 1;
      if (formatted.status === 'OVER_BUDGET') {
        sum.overBudgetCount += 1;
      }
    }

    // Finalize percentages for summaries
    for (const curr of Object.keys(summaries)) {
      const sum = summaries[curr];
      sum.overallPercentage =
        sum.totalBudget > 0
          ? Math.round((sum.totalSpent / sum.totalBudget) * 10000) / 100
          : 0;
    }

    const response: MonthlyBudgetsResponse = {
      month,
      summaries,
      budgets: formattedBudgets,
    };

    return reply.send(response);
  });

  // GET /budgets/:id (Single budget with progress)
  fastify.get<{ Params: { id: string } }>('/budgets/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const budget = await prisma.budget.findFirst({
      where: { id, userId },
      include: { category: true },
    });

    if (!budget) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Budget not found',
      });
    }

    const bounds = getMonthBounds(budget.month);

    const expenseAggregate = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: budget.categoryId,
        currency: budget.currency,
        transactionDate: {
          gte: bounds.startOfMonth,
          lt: bounds.endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const spent = expenseAggregate._sum.amount
      ? parseFloat(expenseAggregate._sum.amount.toString())
      : 0;

    return reply.send(formatBudgetResponse(budget, spent));
  });

  // POST /budgets (Create a category budget)
  fastify.post('/budgets', async (request, reply) => {
    const userId = request.user.id;

    const parseResult = CreateBudgetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid budget payload',
        details: parseResult.error.format(),
      });
    }

    const { categoryId, amount, currency, month } = parseResult.data;

    // 1. Verify Category exists and is an EXPENSE category
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
        message: 'Selected category not found',
      });
    }

    if (category.type !== 'EXPENSE') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Budgets can only be created for expense categories',
      });
    }

    // 2. Check for duplicate active budget
    const existing = await prisma.budget.findUnique({
      where: {
        userId_categoryId_currency_month: {
          userId,
          categoryId,
          currency,
          month,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `A budget for ${category.name} (${currency}) already exists for ${month}`,
      });
    }

    // 3. Create Budget
    const created = await prisma.budget.create({
      data: {
        userId,
        categoryId,
        amount: new Prisma.Decimal(amount),
        currency,
        month,
      },
      include: {
        category: true,
      },
    });

    // Calculate initial spending
    const bounds = getMonthBounds(month);
    const expenseAggregate = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'EXPENSE',
        categoryId,
        currency,
        transactionDate: {
          gte: bounds.startOfMonth,
          lt: bounds.endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const spent = expenseAggregate._sum.amount
      ? parseFloat(expenseAggregate._sum.amount.toString())
      : 0;

    return reply.status(201).send(formatBudgetResponse(created, spent));
  });

  // PATCH /budgets/:id (Update budget amount)
  fastify.patch<{ Params: { id: string } }>('/budgets/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const parseResult = UpdateBudgetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid budget update payload',
        details: parseResult.error.format(),
      });
    }

    const { amount } = parseResult.data;

    const existing = await prisma.budget.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Budget not found',
      });
    }

    const updated = await prisma.budget.update({
      where: { id },
      data: {
        amount: new Prisma.Decimal(amount),
      },
      include: {
        category: true,
      },
    });

    const bounds = getMonthBounds(updated.month);
    const expenseAggregate = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: updated.categoryId,
        currency: updated.currency,
        transactionDate: {
          gte: bounds.startOfMonth,
          lt: bounds.endOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const spent = expenseAggregate._sum.amount
      ? parseFloat(expenseAggregate._sum.amount.toString())
      : 0;

    return reply.send(formatBudgetResponse(updated, spent));
  });

  // DELETE /budgets/:id (Delete budget)
  fastify.delete<{ Params: { id: string } }>('/budgets/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    const existing = await prisma.budget.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Budget not found',
      });
    }

    await prisma.budget.delete({
      where: { id },
    });

    return reply.send({
      success: true,
      message: 'Budget deleted successfully',
    });
  });

  // POST /budgets/copy (Copy budgets from previous month to target month)
  fastify.post('/budgets/copy', async (request, reply) => {
    const userId = request.user.id;

    const parseResult = CopyBudgetsSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid copy budgets payload',
        details: parseResult.error.format(),
      });
    }

    const { fromMonth, toMonth } = parseResult.data;

    if (fromMonth === toMonth) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'fromMonth and toMonth cannot be the same',
      });
    }

    // 1. Fetch source month budgets
    const sourceBudgets = await prisma.budget.findMany({
      where: { userId, month: fromMonth },
      include: { category: true },
    });

    if (sourceBudgets.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `No budgets found in source month ${fromMonth} to copy`,
      });
    }

    // 2. Fetch existing target month budgets
    const existingTargetBudgets = await prisma.budget.findMany({
      where: { userId, month: toMonth },
    });

    const existingKeys = new Set(
      existingTargetBudgets.map((b) => `${b.categoryId}_${b.currency}`)
    );

    const budgetsToCreate = sourceBudgets.filter(
      (b) => !existingKeys.has(`${b.categoryId}_${b.currency}`)
    );

    if (budgetsToCreate.length === 0) {
      return reply.status(200).send({
        message: `All budgets from ${fromMonth} already exist in ${toMonth}`,
        copiedCount: 0,
        budgets: [],
      });
    }

    // 3. Create missing budgets in target month
    const createdList = await prisma.$transaction(
      budgetsToCreate.map((b) =>
        prisma.budget.create({
          data: {
            userId,
            categoryId: b.categoryId,
            amount: b.amount,
            currency: b.currency,
            month: toMonth,
          },
          include: {
            category: true,
          },
        })
      )
    );

    return reply.status(201).send({
      message: `Successfully copied ${createdList.length} budget(s) from ${fromMonth} to ${toMonth}`,
      copiedCount: createdList.length,
      budgets: createdList.map((b) => formatBudgetResponse(b, 0)),
    });
  });
};
