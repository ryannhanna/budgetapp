export type PayFrequency = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' | 'one-time';
export type ExpenseFrequency = 'weekly' | 'bi-weekly' | 'monthly' | 'annual';
export type ExpenseType = 'fixed' | 'variable';
export type DebtOwner = 'me' | 'partner' | 'joint';
export type PayoffStrategy = 'avalanche' | 'snowball' | 'ratio';

export type ExpenseCategory =
  | 'Housing'
  | 'Transportation'
  | 'Food & Groceries'
  | 'Healthcare'
  | 'Entertainment'
  | 'Utilities'
  | 'Subscriptions'
  | 'Clothing'
  | 'Personal Care'
  | 'Education'
  | 'Debt Payment'
  | 'Savings'
  | 'Other';

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Housing: '#3b82f6',
  Transportation: '#f97316',
  'Food & Groceries': '#22c55e',
  Healthcare: '#ef4444',
  Entertainment: '#a855f7',
  Utilities: '#eab308',
  Subscriptions: '#ec4899',
  Clothing: '#14b8a6',
  'Personal Care': '#f43f5e',
  Education: '#6366f1',
  'Debt Payment': '#f59e0b',
  Savings: '#10b981',
  Other: '#6b7280',
};

export interface IncomeStream {
  id: string;
  name: string;
  amount: number;
  frequency: PayFrequency;
  nextPayDate?: string; // ISO date string (YYYY-MM-DD) of the next/last known pay date
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  type: ExpenseType;
  frequency: ExpenseFrequency;
  dueDay?: number;
  dueWeekday?: string;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  interestRate?: number;
  dueDay?: number;
  dueWeekday?: string;
  owner: DebtOwner;
  isPaidOff: boolean;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  color: string;
}

export interface WeekEntry {
  weekId: string;
  startDate: string;
  endDate: string;
  paidExpenseIds: string[];
  extraIncome: number;
  notes: string;
}

export interface BudgetState {
  incomeStreams: IncomeStream[];
  expenses: Expense[];
  debts: Debt[];
  savingsGoals: SavingsGoal[];
  payoffStrategy: PayoffStrategy;
  viewMode: 'bi-weekly' | 'monthly';
  weekEntries: WeekEntry[];
  activeTab: string;
}
