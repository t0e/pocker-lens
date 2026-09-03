import { FastifyPluginAsync } from 'fastify'
import {
  Prisma,
  RecurringTransaction,
  Account,
  Category,
  TransactionType as PrismaTransactionType,
} from '@prisma/client'
import {
  CreateRecurringTransactionSchema,
  UpdateRecurringTransactionSchema,
  RecurringTransactionResponse,
  UpcomingOccurrenceResponse,
  SubscriptionSummaryResponse,
  calculateEstimatedMonthlyCost,
  getUpcomingOccurrences,
  RecurrenceFrequency,
} from '@pocketlens/shared'
import { prisma } from '../db/client.js'
import { processDueRecurringTransactions } from '../services/recurring.js'

export function formatRecurringResponse(
  recurring: RecurringTransaction & {
    account?: Account | null
    category?: Category | null
  },
): RecurringTransactionResponse {
  const amount = parseFloat(recurring.amount.toString())
  const estimatedMonthlyCost = calculateEstimatedMonthlyCost(
    amount,
    recurring.frequency,
    recurring.interval,
  )

  return {
    id: recurring.id,
    userId: recurring.userId,
    type: recurring.type as 'EXPENSE' | 'INCOME',
    accountId: recurring.accountId,
    accountName: recurring.account ? recurring.account.name : 'Unknown Account',
    categoryId: recurring.categoryId,
    categoryName: recurring.category ? recurring.category.name : null,
    categoryIcon: recurring.category ? recurring.category.icon : null,
    amount,
    currency: recurring.currency,
    description: recurring.description,
    frequency: recurring.frequency,
    interval: recurring.interval,
    startDate:
      recurring.startDate instanceof Date
        ? recurring.startDate.toISOString()
        : recurring.startDate,
    nextRunDate:
      recurring.nextRunDate instanceof Date
        ? recurring.nextRunDate.toISOString()
        : recurring.nextRunDate,
    endDate: recurring.endDate
      ? recurring.endDate instanceof Date
        ? recurring.endDate.toISOString()
        : recurring.endDate
      : null,
    isActive: recurring.isActive,
    isSubscription: recurring.isSubscription,
    merchant: recurring.merchant,
    notes: recurring.notes,
    createdAt:
      recurring.createdAt instanceof Date
        ? recurring.createdAt.toISOString()
        : recurring.createdAt,
    updatedAt:
      recurring.updatedAt instanceof Date
        ? recurring.updatedAt.toISOString()
        : recurring.updatedAt,
    estimatedMonthlyCost: Math.round(estimatedMonthlyCost * 100) / 100,
  }
}

export const recurringRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  // GET /recurring (List recurring transactions)
  fastify.get('/recurring', async (request, reply) => {
    const query = request.query as {
      isSubscription?: string
      type?: string
      isActive?: string
    }
    const userId = request.user.id

    const where: Prisma.RecurringTransactionWhereInput = { userId }
    if (query.isSubscription !== undefined) {
      where.isSubscription = query.isSubscription === 'true'
    }
    if (query.type && ['EXPENSE', 'INCOME'].includes(query.type)) {
      where.type = query.type as PrismaTransactionType
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true'
    }

    const items = await prisma.recurringTransaction.findMany({
      where,
      include: {
        account: true,
        category: true,
      },
      orderBy: [{ isActive: 'desc' }, { nextRunDate: 'asc' }],
    })

    return reply.send({
      recurringTransactions: items.map(formatRecurringResponse),
    })
  })

  // GET /recurring/upcoming (Project upcoming occurrences in next N days)
  fastify.get('/recurring/upcoming', async (request, reply) => {
    const query = request.query as { days?: string }
    const userId = request.user.id
    const days = Math.min(
      Math.max(parseInt(query.days || '30', 10) || 30, 1),
      365,
    )

    const activeRecurring = await prisma.recurringTransaction.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        account: true,
        category: true,
      },
    })

    const allOccurrences: UpcomingOccurrenceResponse[] = []
    const fromDate = new Date()

    for (const rec of activeRecurring) {
      const occurrences = getUpcomingOccurrences(
        {
          id: rec.id,
          description: rec.description,
          amount: parseFloat(rec.amount.toString()),
          currency: rec.currency,
          type: (rec.type ? rec.type.toUpperCase() : 'EXPENSE') as
            'EXPENSE' | 'INCOME',
          accountId: rec.accountId,
          accountName: rec.account ? rec.account.name : 'Unknown Account',
          categoryId: rec.categoryId,
          categoryName: rec.category ? rec.category.name : null,
          categoryIcon: rec.category ? rec.category.icon : null,
          startDate: rec.startDate,
          nextRunDate: rec.nextRunDate,
          endDate: rec.endDate,
          frequency: rec.frequency as RecurrenceFrequency,
          interval: rec.interval,
          isActive: rec.isActive,
          isSubscription: rec.isSubscription,
          merchant: rec.merchant,
        },
        days,
        fromDate,
      )

      allOccurrences.push(...occurrences)
    }

    // Sort upcoming occurrences chronologically
    allOccurrences.sort(
      (a, b) =>
        new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
    )

    return reply.send({
      horizonDays: days,
      upcoming: allOccurrences,
    })
  })

  // GET /subscriptions (List user subscriptions with estimated monthly breakdown)
  fastify.get('/subscriptions', async (request, reply) => {
    const userId = request.user.id

    const subscriptions = await prisma.recurringTransaction.findMany({
      where: {
        userId,
        isSubscription: true,
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: [{ isActive: 'desc' }, { nextRunDate: 'asc' }],
    })

    const monthlyEstimates: Record<string, number> = {}
    const formattedSubs = subscriptions.map((s) => {
      const formatted = formatRecurringResponse(s)
      if (s.isActive) {
        const est = formatted.estimatedMonthlyCost || 0
        monthlyEstimates[s.currency] = (monthlyEstimates[s.currency] || 0) + est
      }
      return formatted
    })

    for (const curr of Object.keys(monthlyEstimates)) {
      monthlyEstimates[curr] = Math.round(monthlyEstimates[curr] * 100) / 100
    }

    const response: SubscriptionSummaryResponse = {
      subscriptions: formattedSubs,
      monthlyEstimates,
    }

    return reply.send(response)
  })

  // GET /recurring/:id (Single recurring item)
  fastify.get<{ Params: { id: string } }>(
    '/recurring/:id',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const recurring = await prisma.recurringTransaction.findFirst({
        where: { id, userId },
        include: {
          account: true,
          category: true,
        },
      })

      if (!recurring) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Recurring transaction not found',
        })
      }

      return reply.send(formatRecurringResponse(recurring))
    },
  )

  // POST /recurring (Create recurring transaction / subscription)
  fastify.post('/recurring', async (request, reply) => {
    const userId = request.user.id

    const parseResult = CreateRecurringTransactionSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid recurring transaction payload',
        details: parseResult.error.format(),
      })
    }

    const {
      type,
      accountId,
      categoryId,
      amount,
      currency,
      description,
      frequency,
      interval,
      startDate,
      nextRunDate,
      endDate,
      isSubscription,
      merchant,
      notes,
    } = parseResult.data

    // 1. Verify Account ownership & active status
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, isArchived: false },
    })

    if (!account) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Selected account not found or is archived',
      })
    }

    // 2. Verify Category ownership if specified
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          OR: [{ isSystem: true }, { userId }],
          isArchived: false,
        },
      })

      if (!category) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Selected category not found',
        })
      }
    }

    const start = new Date(startDate)
    const nextRun = nextRunDate ? new Date(nextRunDate) : start
    const end = endDate ? new Date(endDate) : null

    if (end && end < start) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'End date cannot be before start date',
      })
    }

    const created = await prisma.recurringTransaction.create({
      data: {
        userId,
        type: type as PrismaTransactionType,
        accountId,
        categoryId: categoryId || null,
        amount: new Prisma.Decimal(amount),
        currency,
        description,
        frequency: frequency as RecurrenceFrequency,
        interval,
        startDate: start,
        nextRunDate: nextRun,
        endDate: end,
        isSubscription,
        merchant: merchant || null,
        notes: notes || null,
        isActive: true,
      },
      include: {
        account: true,
        category: true,
      },
    })

    return reply.status(201).send(formatRecurringResponse(created))
  })

  // PATCH /recurring/:id (Update recurring template)
  fastify.patch<{ Params: { id: string } }>(
    '/recurring/:id',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const parseResult = UpdateRecurringTransactionSchema.safeParse(
        request.body,
      )
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid update payload',
          details: parseResult.error.format(),
        })
      }

      const existing = await prisma.recurringTransaction.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Recurring transaction not found',
        })
      }

      const data: Prisma.RecurringTransactionUpdateInput = {}
      const payload = parseResult.data

      if (payload.accountId) {
        const acc = await prisma.account.findFirst({
          where: { id: payload.accountId, userId, isArchived: false },
        })
        if (!acc) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Selected account not found',
          })
        }
        data.account = { connect: { id: payload.accountId } }
      }

      if (payload.categoryId !== undefined) {
        if (payload.categoryId) {
          const cat = await prisma.category.findFirst({
            where: {
              id: payload.categoryId,
              OR: [{ isSystem: true }, { userId }],
              isArchived: false,
            },
          })
          if (!cat) {
            return reply.status(404).send({
              statusCode: 404,
              error: 'Not Found',
              message: 'Selected category not found',
            })
          }
          data.category = { connect: { id: payload.categoryId } }
        } else {
          data.category = { disconnect: true }
        }
      }

      if (payload.amount !== undefined)
        data.amount = new Prisma.Decimal(payload.amount)
      if (payload.currency !== undefined) data.currency = payload.currency
      if (payload.description !== undefined)
        data.description = payload.description
      if (payload.frequency !== undefined)
        data.frequency = payload.frequency as RecurrenceFrequency
      if (payload.interval !== undefined) data.interval = payload.interval
      if (payload.type !== undefined)
        data.type = payload.type as PrismaTransactionType
      if (payload.startDate !== undefined)
        data.startDate = new Date(payload.startDate)
      if (payload.nextRunDate !== undefined)
        data.nextRunDate = new Date(payload.nextRunDate)
      if (payload.endDate !== undefined)
        data.endDate = payload.endDate ? new Date(payload.endDate) : null
      if (payload.isActive !== undefined) data.isActive = payload.isActive
      if (payload.isSubscription !== undefined)
        data.isSubscription = payload.isSubscription
      if (payload.merchant !== undefined) data.merchant = payload.merchant
      if (payload.notes !== undefined) data.notes = payload.notes

      const updated = await prisma.recurringTransaction.update({
        where: { id },
        data,
        include: {
          account: true,
          category: true,
        },
      })

      return reply.send(formatRecurringResponse(updated))
    },
  )

  // PATCH /recurring/:id/status (Toggle/set active state)
  fastify.patch<{ Params: { id: string }; Body: { isActive: boolean } }>(
    '/recurring/:id/status',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id
      const { isActive } = request.body || {}

      if (typeof isActive !== 'boolean') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'isActive boolean is required',
        })
      }

      const existing = await prisma.recurringTransaction.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Recurring transaction not found',
        })
      }

      const updated = await prisma.recurringTransaction.update({
        where: { id },
        data: { isActive },
        include: {
          account: true,
          category: true,
        },
      })

      return reply.send(formatRecurringResponse(updated))
    },
  )

  // DELETE /recurring/:id (Delete recurring template without deleting historical transactions)
  fastify.delete<{ Params: { id: string } }>(
    '/recurring/:id',
    async (request, reply) => {
      const { id } = request.params
      const userId = request.user.id

      const existing = await prisma.recurringTransaction.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Recurring transaction not found',
        })
      }

      // Delete recurring template (foreign keys on transactions set null, occurrences cascade)
      await prisma.recurringTransaction.delete({
        where: { id },
      })

      return reply.send({
        success: true,
        message:
          'Recurring template deleted successfully. Historical transactions remain intact.',
      })
    },
  )

  // POST /recurring/process-due (Trigger due recurring transactions generation)
  fastify.post('/recurring/process-due', async (request, reply) => {
    const userId = request.user.id
    const result = await processDueRecurringTransactions(new Date(), userId)
    return reply.send(result)
  })
}
