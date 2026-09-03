import { Prisma } from '@prisma/client'
import pino from 'pino'
import { prisma } from '../db/client.js'
import { calculateNextRunDate, RecurrenceFrequency } from '@pocketlens/shared'

const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
})

export interface ProcessDueResult {
  processedCount: number
  generatedCount: number
  skippedCount: number
}

/**
 * Finds and executes due recurring transactions idempotently.
 * Updates nextRunDate, creates financial transaction, and adjusts account balance.
 */
export async function processDueRecurringTransactions(
  now = new Date(),
  targetUserId?: string,
): Promise<ProcessDueResult> {
  const where: Prisma.RecurringTransactionWhereInput = {
    isActive: true,
    nextRunDate: {
      lte: now,
    },
  }

  if (targetUserId) {
    where.userId = targetUserId
  }

  const dueItems = await prisma.recurringTransaction.findMany({
    where,
    include: {
      account: true,
      category: true,
    },
    orderBy: { nextRunDate: 'asc' },
  })

  let generatedCount = 0
  let skippedCount = 0

  for (const recurring of dueItems) {
    // 1. Safety check: If account is archived, auto-pause recurring transaction
    if (recurring.account.isArchived) {
      logger.warn(
        { recurringId: recurring.id, accountId: recurring.accountId },
        'Account is archived. Auto-pausing recurring transaction.',
      )
      await prisma.recurringTransaction.update({
        where: { id: recurring.id },
        data: { isActive: false },
      })
      skippedCount++
      continue
    }

    // 2. Safety check: If past end date, deactivate
    if (recurring.endDate && recurring.nextRunDate > recurring.endDate) {
      await prisma.recurringTransaction.update({
        where: { id: recurring.id },
        data: { isActive: false },
      })
      skippedCount++
      continue
    }

    const scheduledFor = new Date(recurring.nextRunDate)
    const nextRun = calculateNextRunDate(
      recurring.startDate,
      scheduledFor,
      recurring.frequency as RecurrenceFrequency,
      recurring.interval,
    )

    const willDeactivate = recurring.endDate
      ? nextRun > recurring.endDate
      : false

    try {
      // 3. Database-level Idempotency Check & Transaction Execution
      const result = await prisma.$transaction(async (tx) => {
        // Check if an occurrence for this exact date already exists
        const existingOccurrence = await tx.recurringOccurrence.findUnique({
          where: {
            recurringTransactionId_scheduledFor: {
              recurringTransactionId: recurring.id,
              scheduledFor,
            },
          },
        })

        if (existingOccurrence) {
          logger.info(
            {
              recurringId: recurring.id,
              scheduledFor: scheduledFor.toISOString(),
            },
            'Occurrence already generated for this date. Advancing nextRunDate without duplicate transaction.',
          )
          await tx.recurringTransaction.update({
            where: { id: recurring.id },
            data: {
              nextRunDate: nextRun,
              isActive: willDeactivate ? false : recurring.isActive,
            },
          })
          return { skipped: true }
        }

        // Create occurrence record
        const occurrence = await tx.recurringOccurrence.create({
          data: {
            recurringTransactionId: recurring.id,
            scheduledFor,
            status: 'GENERATED',
          },
        })

        // Balance adjustment
        const amountDecimal = new Prisma.Decimal(recurring.amount.toString())
        let balanceChange = new Prisma.Decimal(0)
        if (recurring.type === 'EXPENSE') {
          balanceChange = amountDecimal.negated()
        } else if (recurring.type === 'INCOME') {
          balanceChange = amountDecimal
        }

        await tx.account.update({
          where: { id: recurring.accountId },
          data: {
            currentBalance: {
              increment: balanceChange,
            },
          },
        })

        // Create financial transaction using existing Phase 3 accounting model
        const transaction = await tx.transaction.create({
          data: {
            userId: recurring.userId,
            type: recurring.type,
            accountId: recurring.accountId,
            categoryId: recurring.categoryId,
            amount: amountDecimal,
            currency: recurring.currency,
            transactionDate: scheduledFor,
            description: recurring.description,
            merchant: recurring.merchant,
            notes: recurring.notes,
            recurringTransactionId: recurring.id,
          },
        })

        // Link occurrence to transaction
        await tx.recurringOccurrence.update({
          where: { id: occurrence.id },
          data: { transactionId: transaction.id },
        })

        // Advance nextRunDate
        await tx.recurringTransaction.update({
          where: { id: recurring.id },
          data: {
            nextRunDate: nextRun,
            isActive: willDeactivate ? false : recurring.isActive,
          },
        })

        return { skipped: false, transactionId: transaction.id }
      })

      if (result.skipped) {
        skippedCount++
      } else {
        generatedCount++
        logger.info(
          {
            recurringId: recurring.id,
            transactionId: result.transactionId,
            amount: recurring.amount.toString(),
            currency: recurring.currency,
          },
          'Generated recurring transaction successfully',
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(
        { err: message, recurringId: recurring.id },
        'Failed to process recurring transaction item',
      )
      skippedCount++
    }
  }

  return {
    processedCount: dueItems.length,
    generatedCount,
    skippedCount,
  }
}
