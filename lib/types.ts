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
  Savings: '#10b981',
  Other: '#6b7280',
};

export interface IncomeStream {
  id: string;
  name: string;
  amount: number;
  frequency: PayFrequency;
  nextPayDate?: string; // ISO date string (YYYY-MM-DD) of the next/last known pay date
  startDate?: string;  // ISO date string (YYYY-MM-DD); income excluded from all calculations before this date
  endDate?: string;    // ISO date string (YYYY-MM-DD); income excluded from all calculations after this date
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
  startDate?: string; // ISO date (YYYY-MM-DD); expense is excluded from all calculations before this date
  endDate?: string;   // ISO date (YYYY-MM-DD); expense is excluded from all calculations after this date
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
  /** ISO date (YYYY-MM-DD); debt is excluded from all calculations before this date */
  startDate?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  color: string;
}

export interface CustomPeriodItem {
  id: string;
  name: string;
  amount: number;
}

export interface WeekEntry {
  weekId: string;
  startDate: string;
  endDate: string;
  paidExpenseIds: string[];
  paidOffDebtIds: string[]; // debts paid off via the suggestion button in this period
  /** Balance paid for each debt when it was marked via the suggestion button — keyed by debt ID */
  paidOffAmounts?: { [debtId: string]: number };
  /** Partial debt payments applied via the suggestion this period — keyed by debt ID */
  partialPayments?: { [debtId: string]: number };
  extraIncome: number;
  notes: string;
  /** Per-item overrides: exclude an item or change its amount just for this period */
  itemOverrides?: { [itemId: string]: { amount?: number; excluded?: boolean } };
  /** One-time items added only to this period */
  customItems?: CustomPeriodItem[];
}

export interface PayPeriodConfig {
  /** Pay period type. 'bi-weekly' = 14-day cycle from anchorDate; 'semi-monthly' = two fixed days per month. Default: 'bi-weekly' */
  type: 'semi-monthly' | 'bi-weekly';
  /** Semi-monthly only: day of month period 1 starts (1–28). Default: 1 */
  period1Start: number;
  /** Semi-monthly only: day of month period 2 starts (1–28), must be > period1Start. Default: 16 */
  period2Start: number;
  /** Bi-weekly only: ISO date string (YYYY-MM-DD) of any known pay period start date */
  anchorDate?: string;
}

export const DEFAULT_PAY_PERIOD_CONFIG: PayPeriodConfig = {
  type: 'bi-weekly',
  period1Start: 1,
  period2Start: 16,
  anchorDate: '2026-09-25',
};

export interface BudgetState {
  incomeStreams: IncomeStream[];
  expenses: Expense[];
  debts: Debt[];
  savingsGoals: SavingsGoal[];
  payoffStrategy: PayoffStrategy;
  viewMode: 'semi-monthly' | 'monthly';
  weekEntries: WeekEntry[];
  /** Custom pay period split days; defaults to 1st and 16th if omitted */
  payPeriodConfig?: PayPeriodConfig;
  /** Custom debt payment priority order (array of debt IDs). When set, overrides
   *  the strategy sort in both the payoff timeline and the extra-payment suggestion. */
  debtOrder?: string[];
}
