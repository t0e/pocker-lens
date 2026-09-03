import { z } from 'zod'
import { CURRENCY_CODES, isValidCurrencyCode } from '../currency/index.js'

export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'credit_card',
  'savings',
  'e_wallet',
  'other',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

// Matches a valid decimal string or number with optional sign and up to 4 decimal places
const decimalRegex = /^-?\d+(\.\d{1,4})?$/

export const createAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Account name is required')
    .max(100, 'Account name must not exceed 100 characters'),
  type: z.enum(ACCOUNT_TYPES, {
    errorMap: () => ({
      message: `Invalid account type. Must be one of: ${ACCOUNT_TYPES.join(', ')}`,
    }),
  }),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidCurrencyCode, {
      message: `Invalid currency. Supported: ${CURRENCY_CODES.join(', ')}`,
    }),
  openingBalance: z
    .union([z.string(), z.number()])
    .transform((val) => String(val).trim())
    .refine((val) => decimalRegex.test(val), {
      message:
        'Opening balance must be a valid number or decimal string (e.g. 1000.50)',
    })
    .default('0'),
  isDefault: z.boolean().optional().default(false),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>

export const updateAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Account name cannot be empty')
    .max(100, 'Account name must not exceed 100 characters')
    .optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidCurrencyCode, {
      message: `Invalid currency. Supported: ${CURRENCY_CODES.join(', ')}`,
    })
    .optional(),
  isArchived: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

export interface AccountResponse {
  id: string
  userId: string
  name: string
  type: AccountType
  currency: string
  openingBalance: string
  currentBalance: string
  isArchived: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountsGroupedByCurrency {
  currency: string
  totalBalance: string
  accountCount: number
  accounts: AccountResponse[]
}
