import { z } from 'zod';
import { CategoryResponse } from '../category/index.js';
import { AccountResponse } from '../account/index.js';

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

const decimalRegex = /^-?\d+(\.\d{1,4})?$/;

export const createTransactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES, {
      errorMap: () => ({ message: 'Transaction type must be expense, income, or transfer' }),
    }),
    accountId: z.string().min(1, 'Account is required'),
    transferAccountId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    amount: z
      .union([z.string(), z.number()])
      .transform((val) => String(val).trim())
      .refine((val) => decimalRegex.test(val) && parseFloat(val) > 0, {
        message: 'Amount must be a positive decimal number greater than 0',
      }),
    transactionDate: z
      .string()
      .optional()
      .default(() => new Date().toISOString()),
    description: z.string().trim().min(1, 'Description is required').max(255, 'Description too long'),
    merchant: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return !!data.transferAccountId && data.accountId !== data.transferAccountId;
      }
      return true;
    },
    {
      message: 'Transfer requires a destination account different from the source account',
      path: ['transferAccountId'],
    }
  );

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  accountId: z.string().min(1).optional(),
  transferAccountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  amount: z
    .union([z.string(), z.number()])
    .transform((val) => String(val).trim())
    .refine((val) => decimalRegex.test(val) && parseFloat(val) > 0, {
      message: 'Amount must be a positive decimal number greater than 0',
    })
    .optional(),
  transactionDate: z.string().optional(),
  description: z.string().trim().min(1).max(255).optional(),
  merchant: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export interface TransactionResponse {
  id: string;
  userId: string;
  type: TransactionType;
  accountId: string;
  account?: AccountResponse;
  transferAccountId?: string | null;
  transferAccount?: AccountResponse | null;
  categoryId?: string | null;
  category?: CategoryResponse | null;
  amount: string;
  currency: string;
  transactionDate: string;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyMonthlySummary {
  currency: string;
  income: string;
  expense: string;
  net: string;
  incomeCount: number;
  expenseCount: number;
}

export interface MonthlyFinancialSummaryResponse {
  month: string; // YYYY-MM format (e.g. 2026-08)
  summaries: CurrencyMonthlySummary[];
}

export interface PaginatedTransactionsResponse {
  transactions: TransactionResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
