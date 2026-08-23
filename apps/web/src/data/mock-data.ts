// PocketLens Demo Mock Data (Phase 1 Application Shell)
// Isolated to ensure clean replacement with real API data in subsequent phases.

export interface MockTransaction {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  date: string;
  type: 'expense' | 'income';
  receiptAttached?: boolean;
}

export interface MockCategorySpending {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface MockBudget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  color: string;
}

export interface MockAccount {
  id: string;
  name: string;
  type: 'Checking' | 'Savings' | 'Cash' | 'Credit';
  balance: number;
  accountNumber: string;
}

export const MOCK_FINANCIAL_SUMMARY = {
  totalBalance: 8420.50,
  monthlyIncome: 5200.00,
  monthlyExpense: 2315.40,
  savingsRate: 55.4,
  currency: 'USD',
  lastUpdated: 'Just now (Demo Data)',
};

export const MOCK_TRANSACTIONS: MockTransaction[] = [
  {
    id: 'tx_1',
    merchant: 'Whole Foods Market',
    category: 'Groceries',
    amount: 84.32,
    date: 'Today, 2:45 PM',
    type: 'expense',
    receiptAttached: true,
  },
  {
    id: 'tx_2',
    merchant: 'Blue Bottle Coffee',
    category: 'Dining',
    amount: 6.50,
    date: 'Today, 9:15 AM',
    type: 'expense',
    receiptAttached: true,
  },
  {
    id: 'tx_3',
    merchant: 'Acme Corp Payroll',
    category: 'Salary',
    amount: 2600.00,
    date: 'Yesterday',
    type: 'income',
    receiptAttached: false,
  },
  {
    id: 'tx_4',
    merchant: 'Shell Gas Station',
    category: 'Transport',
    amount: 45.00,
    date: 'Aug 21, 2026',
    type: 'expense',
    receiptAttached: true,
  },
  {
    id: 'tx_5',
    merchant: 'Netflix Subscription',
    category: 'Entertainment',
    amount: 15.99,
    date: 'Aug 20, 2026',
    type: 'expense',
    receiptAttached: false,
  },
];

export const MOCK_CATEGORY_SPENDING: MockCategorySpending[] = [
  { category: 'Groceries', amount: 620.00, percentage: 38, color: 'bg-emerald-500' },
  { category: 'Housing & Utilities', amount: 950.00, percentage: 32, color: 'bg-blue-500' },
  { category: 'Dining & Cafes', amount: 310.40, percentage: 15, color: 'bg-amber-500' },
  { category: 'Transport', amount: 185.00, percentage: 9, color: 'bg-purple-500' },
  { category: 'Entertainment', amount: 150.00, percentage: 6, color: 'bg-rose-500' },
];

export const MOCK_BUDGETS: MockBudget[] = [
  { id: 'b_1', category: 'Groceries', limit: 800, spent: 620, color: 'bg-emerald-500' },
  { id: 'b_2', category: 'Dining & Cafes', limit: 400, spent: 310.40, color: 'bg-amber-500' },
  { id: 'b_3', category: 'Transport', limit: 250, spent: 185, color: 'bg-purple-500' },
  { id: 'b_4', category: 'Entertainment', limit: 200, spent: 150, color: 'bg-rose-500' },
];

export const MOCK_ACCOUNTS: MockAccount[] = [
  { id: 'acc_1', name: 'Primary Checking', type: 'Checking', balance: 3420.50, accountNumber: '•••• 4821' },
  { id: 'acc_2', name: 'High Yield Savings', type: 'Savings', balance: 5000.00, accountNumber: '•••• 9102' },
  { id: 'acc_3', name: 'Physical Wallet', type: 'Cash', balance: 150.00, accountNumber: 'Cash' },
];
