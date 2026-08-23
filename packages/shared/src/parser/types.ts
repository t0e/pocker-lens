import { TransactionType } from '../transaction/index.js';

export interface ParseConfidence {
  amount: number;
  type: number;
  account: number;
  category: number;
  date: number;
  overall: number;
}

export interface ParsedTransactionDraft {
  type: TransactionType;
  amount: string | null;
  currency: string | null;
  accountId: string | null;
  accountName: string | null;
  transferAccountId: string | null;
  transferAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  description: string;
  merchant: string | null;
  transactionDate: string; // ISO 8601 UTC
  confidence: ParseConfidence;
}

export interface ParseTransactionResult {
  rawText: string;
  parsed: ParsedTransactionDraft;
  warnings: string[];
  requiresConfirmation: boolean;
}

export interface UserAccountContext {
  id: string;
  name: string;
  type: string;
  currency: string;
  isDefault: boolean;
  isArchived: boolean;
}

export interface UserCategoryContext {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string | null;
  isSystem: boolean;
}

export interface RecentTransactionContext {
  description: string;
  merchant: string | null;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
}

export interface ParserUserContext {
  accounts: UserAccountContext[];
  categories: UserCategoryContext[];
  recentTransactions?: RecentTransactionContext[];
  preferredCurrency?: string;
}

export interface TransactionInputParser {
  parse(text: string, context: ParserUserContext): ParseTransactionResult;
}
