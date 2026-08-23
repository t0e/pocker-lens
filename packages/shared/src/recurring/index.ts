import { z } from 'zod';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringTransactionResponse {
  id: string;
  userId: string;
  type: 'EXPENSE' | 'INCOME';
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  amount: number;
  currency: string;
  description: string;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  isActive: boolean;
  isSubscription: boolean;
  merchant: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  estimatedMonthlyCost?: number;
}

export interface UpcomingOccurrenceResponse {
  recurringTransactionId: string;
  description: string;
  amount: number;
  currency: string;
  type: 'EXPENSE' | 'INCOME';
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  scheduledFor: string;
  isSubscription: boolean;
  merchant: string | null;
}

export interface SubscriptionSummaryResponse {
  subscriptions: RecurringTransactionResponse[];
  monthlyEstimates: Record<string, number>;
}

export const CreateRecurringTransactionSchema = z.object({
  type: z.enum(['EXPENSE', 'INCOME']).default('EXPENSE'),
  accountId: z.string().min(1, 'Account is required'),
  categoryId: z.string().optional().nullable(),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  currency: z.string().min(3).max(3),
  description: z.string().min(1, 'Description is required'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('MONTHLY'),
  interval: z.coerce.number().int().min(1).default(1),
  startDate: z.string().min(1, 'Start date is required'),
  nextRunDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  isSubscription: z.boolean().default(false),
  merchant: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateRecurringTransactionInput = z.infer<typeof CreateRecurringTransactionSchema>;

export const UpdateRecurringTransactionSchema = z.object({
  type: z.enum(['EXPENSE', 'INCOME']).optional(),
  accountId: z.string().min(1).optional(),
  categoryId: z.string().optional().nullable(),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  description: z.string().min(1).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).optional(),
  interval: z.coerce.number().int().min(1).optional(),
  startDate: z.string().optional(),
  nextRunDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  isSubscription: z.boolean().optional(),
  merchant: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type UpdateRecurringTransactionInput = z.infer<typeof UpdateRecurringTransactionSchema>;

/**
 * Calculates the next occurrence date based on start date anchor, current run date, frequency, and interval.
 * Correctly preserves end-of-month anchors (e.g. Jan 31 -> Feb 28 -> Mar 31).
 */
export function calculateNextRunDate(
  startDate: Date,
  currentRunDate: Date,
  frequency: RecurrenceFrequency,
  interval = 1
): Date {
  const safeInterval = Math.max(1, interval);

  if (frequency === 'DAILY') {
    const next = new Date(currentRunDate.getTime());
    next.setUTCDate(next.getUTCDate() + safeInterval);
    return next;
  }

  if (frequency === 'WEEKLY') {
    const next = new Date(currentRunDate.getTime());
    next.setUTCDate(next.getUTCDate() + safeInterval * 7);
    return next;
  }

  if (frequency === 'MONTHLY') {
    const anchorDay = startDate.getUTCDate();
    let targetYear = currentRunDate.getUTCFullYear();
    let targetMonth = currentRunDate.getUTCMonth() + safeInterval;

    targetYear += Math.floor(targetMonth / 12);
    targetMonth = ((targetMonth % 12) + 12) % 12;

    const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const targetDay = Math.min(anchorDay, daysInTargetMonth);

    return new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        targetDay,
        currentRunDate.getUTCHours(),
        currentRunDate.getUTCMinutes(),
        currentRunDate.getUTCSeconds(),
        currentRunDate.getUTCMilliseconds()
      )
    );
  }

  if (frequency === 'YEARLY') {
    const anchorDay = startDate.getUTCDate();
    const anchorMonth = startDate.getUTCMonth();
    const targetYear = currentRunDate.getUTCFullYear() + safeInterval;

    const daysInTargetMonth = new Date(Date.UTC(targetYear, anchorMonth + 1, 0)).getUTCDate();
    const targetDay = Math.min(anchorDay, daysInTargetMonth);

    return new Date(
      Date.UTC(
        targetYear,
        anchorMonth,
        targetDay,
        currentRunDate.getUTCHours(),
        currentRunDate.getUTCMinutes(),
        currentRunDate.getUTCSeconds(),
        currentRunDate.getUTCMilliseconds()
      )
    );
  }

  throw new Error(`Unsupported recurrence frequency: ${frequency}`);
}

/**
 * Calculates estimated monthly cost of a recurring expense/subscription.
 */
export function calculateEstimatedMonthlyCost(
  amount: number,
  frequency: RecurrenceFrequency,
  interval = 1
): number {
  const safeInterval = Math.max(1, interval);
  if (frequency === 'MONTHLY') {
    return amount / safeInterval;
  }
  if (frequency === 'DAILY') {
    return (amount / safeInterval) * 30.4375;
  }
  if (frequency === 'WEEKLY') {
    return (amount / safeInterval) * 4.3333;
  }
  if (frequency === 'YEARLY') {
    return amount / safeInterval / 12;
  }
  return amount;
}

/**
 * Projects upcoming occurrences within horizonDays for a given recurring transaction.
 */
export function getUpcomingOccurrences(
  recurring: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    type: 'EXPENSE' | 'INCOME';
    accountId: string;
    accountName: string;
    categoryId?: string | null;
    categoryName?: string | null;
    categoryIcon?: string | null;
    startDate: Date;
    nextRunDate: Date;
    endDate?: Date | null;
    frequency: RecurrenceFrequency;
    interval: number;
    isActive: boolean;
    isSubscription: boolean;
    merchant?: string | null;
  },
  horizonDays = 30,
  fromDate = new Date()
): UpcomingOccurrenceResponse[] {
  if (!recurring.isActive) return [];

  const results: UpcomingOccurrenceResponse[] = [];
  const maxDate = new Date(fromDate.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  let current = new Date(recurring.nextRunDate.getTime());
  const maxIterations = 50; // Safety guard
  let iterations = 0;

  while (current <= maxDate && iterations < maxIterations) {
    iterations++;

    if (recurring.endDate && current > recurring.endDate) {
      break;
    }

    if (current >= fromDate || current.toISOString().slice(0, 10) === fromDate.toISOString().slice(0, 10)) {
      results.push({
        recurringTransactionId: recurring.id,
        description: recurring.description,
        amount: recurring.amount,
        currency: recurring.currency,
        type: recurring.type,
        accountId: recurring.accountId,
        accountName: recurring.accountName,
        categoryId: recurring.categoryId || null,
        categoryName: recurring.categoryName || null,
        categoryIcon: recurring.categoryIcon || null,
        scheduledFor: current.toISOString(),
        isSubscription: recurring.isSubscription,
        merchant: recurring.merchant || null,
      });
    }

    current = calculateNextRunDate(
      recurring.startDate,
      current,
      recurring.frequency,
      recurring.interval
    );
  }

  return results;
}
