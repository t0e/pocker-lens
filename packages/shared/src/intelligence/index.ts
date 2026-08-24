import { z } from "zod";

/**
 * Conservative Merchant Normalization:
 * - Lowercases and trims whitespace
 * - Collapses consecutive whitespace to single space
 * - Strips trailing store numbers/hashtags (#01, - store 2) conservatively
 * - Strips excessive punctuation while keeping alphanumeric tokens
 */
export function normalizeMerchant(merchant: string | null | undefined): string {
  if (!merchant) return "";
  let normalized = merchant.toLowerCase().trim();

  // Replace multiple whitespace/newlines with a single space
  normalized = normalized.replace(/\s+/g, " ");

  // Remove common prefix/suffix noise while preserving brand identities
  // e.g. "highlands coffee - branch 12" -> "highlands coffee branch 12"
  normalized = normalized.replace(/[^a-z0-9\s\u00C0-\u024F\u1EA0-\u1EF9]/gi, " ");

  // Collapse spaces again
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

export type CategorySuggestionConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface CategorySuggestionResponse {
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  confidence: CategorySuggestionConfidence;
  reason: string;
}

export const SuggestCategorySchema = z.object({
  merchant: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().optional().nullable(),
});

export type SuggestCategoryInput = z.infer<typeof SuggestCategorySchema>;

export type DuplicateConfidence = "EXACT" | "LIKELY" | "POSSIBLE";

export interface DuplicateMatch {
  existingTransactionId: string;
  confidence: DuplicateConfidence;
  score: number; // 0.0 to 1.0
  reason: string;
  existingTransaction: {
    id: string;
    description: string;
    merchant: string | null;
    amount: number;
    currency: string;
    transactionDate: string;
    accountId: string;
    accountName: string;
    categoryId: string | null;
    categoryName?: string | null;
  };
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  highestConfidence: DuplicateConfidence | null;
  matches: DuplicateMatch[];
}

export const CheckDuplicatesSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  currency: z.string().min(3).max(3),
  transactionDate: z.string().min(1, "Transaction date is required"),
  description: z.string().min(1, "Description is required"),
  merchant: z.string().optional().nullable(),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "expense", "income", "transfer"]).default("EXPENSE"),
  excludeTransactionId: z.string().optional().nullable(),
});

export type CheckDuplicatesInput = z.infer<typeof CheckDuplicatesSchema>;

export interface UncategorizedTransactionItem {
  id: string;
  description: string;
  merchant: string | null;
  amount: number;
  currency: string;
  transactionDate: string;
  accountId: string;
  accountName: string;
  suggestedCategory: CategorySuggestionResponse | null;
}

export interface DataQualityReportResponse {
  uncategorizedCount: number;
  potentialDuplicatesCount: number;
  pendingReceiptsCount: number;
  uncategorizedTransactions: UncategorizedTransactionItem[];
}
