import { z } from 'zod';

export const CATEGORY_TYPES = ['expense', 'income'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export interface DefaultCategorySeed {
  name: string;
  type: CategoryType;
  icon: string;
}

export const DEFAULT_SYSTEM_CATEGORIES: DefaultCategorySeed[] = [
  // Expense Categories
  { name: 'Food & Drink', type: 'expense', icon: 'utensils' },
  { name: 'Groceries', type: 'expense', icon: 'shopping-cart' },
  { name: 'Transport', type: 'expense', icon: 'car' },
  { name: 'Housing & Rent', type: 'expense', icon: 'home' },
  { name: 'Shopping', type: 'expense', icon: 'shopping-bag' },
  { name: 'Entertainment', type: 'expense', icon: 'film' },
  { name: 'Health & Medical', type: 'expense', icon: 'heart-pulse' },
  { name: 'Education', type: 'expense', icon: 'book-open' },
  { name: 'Utilities & Bills', type: 'expense', icon: 'zap' },
  { name: 'Travel & Vacation', type: 'expense', icon: 'plane' },
  { name: 'Personal Care', type: 'expense', icon: 'sparkles' },
  { name: 'Other Expense', type: 'expense', icon: 'circle-ellipsis' },

  // Income Categories
  { name: 'Salary', type: 'income', icon: 'banknote' },
  { name: 'Freelance & Side Gig', type: 'income', icon: 'briefcase' },
  { name: 'Bonus', type: 'income', icon: 'award' },
  { name: 'Investment & Dividends', type: 'income', icon: 'trending-up' },
  { name: 'Gift', type: 'income', icon: 'gift' },
  { name: 'Refund & Cashback', type: 'income', icon: 'rotate-ccw' },
  { name: 'Other Income', type: 'income', icon: 'plus-circle' },
];

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(50, 'Category name too long'),
  type: z.enum(CATEGORY_TYPES, {
    errorMap: () => ({ message: 'Category type must be either expense or income' }),
  }),
  icon: z.string().trim().max(30).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export interface CategoryResponse {
  id: string;
  userId: string | null;
  name: string;
  type: CategoryType;
  icon: string | null;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
