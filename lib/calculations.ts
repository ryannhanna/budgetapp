import { Debt, Expense, ExpenseFrequency, IncomeStream, PayFrequency, PayoffStrategy } from './types';

export function toBiWeekly(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'weekly': return amount * 2;
    case 'bi-weekly': return amount;
    case 'monthly': return (amount * 12) / 26;
    case 'annual': return amount / 26;
  }
}

export function toMonthly(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'weekly': return amount * 4.333;
    case 'bi-weekly': return (amount * 26) / 12;
    case 'monthly': return amount;
    case 'annual': return amount / 12;
  }
}

export function incomeToBiWeekly(amount: number, freq: PayFrequency): number {
  switch (freq) {
    case 'weekly': return amount * 2;
    case 'bi-weekly': return amount;
    case 'semi-monthly': return (amount * 24) / 26;
    case 'monthly': return (amount * 12) / 26;
    case 'one-time': return 0;
  }
}

export function incomeToMonthly(amount: number, freq: PayFrequency): number {
  switch (freq) {
    case 'weekly': return amount * 4.333;
    case 'bi-weekly': return (amount * 26) / 12;
    case 'semi-monthly': return amount * 2;
    case 'monthly': return amount;
    case 'one-time': return 0;
  }
}

export function getTotalIncome(streams: IncomeStream[], mode: 'bi-weekly' | 'monthly'): number {
  return streams.reduce((sum, s) => {
    const normalized = mode === 'bi-weekly'
      ? incomeToBiWeekly(s.amount, s.frequency)
      : incomeToMonthly(s.amount, s.frequency);
    return sum + normalized;
  }, 0);
}

export function getTotalExpenses(expenses: Expense[], mode: 'bi-weekly' | 'monthly'): number {
  return expenses.reduce((sum, e) => {
    const normalized = mode === 'bi-weekly'
      ? toBiWeekly(e.amount, e.frequency)
      : toMonthly(e.amount, e.frequency);
    return sum + normalized;
  }, 0);
}

export function getTotalDebtMinimums(debts: Debt[]): number {
  return debts.filter(d => !d.isPaidOff).reduce((sum, d) => sum + d.minimumPayment, 0);
}

export function debtRatio(debt: Debt): number {
  if (debt.balance === 0) return Infinity;
  return debt.minimumPayment / debt.balance;
}

export function sortByStrategy(debts: Debt[], strategy: PayoffStrategy): Debt[] {
  const active = debts.filter(d => !d.isPaidOff);
  switch (strategy) {
    case 'avalanche':
      return [...active].sort((a, b) => (b.interestRate ?? 0) - (a.interestRate ?? 0));
    case 'snowball':
      return [...active].sort((a, b) => a.balance - b.balance);
    case 'ratio':
      return [...active].sort((a, b) => debtRatio(b) - debtRatio(a));
  }
}

export interface PayoffEvent {
  month: number;
  date: Date;
  debtName: string;
  amountApplied: number;
  cascadeAdded: number;
  interestPaid: number;
}

export interface PayoffResult {
  events: PayoffEvent[];
  totalInterestPaid: number;
  payoffDate: Date | null;
  monthsToFree: number;
}

export function calculatePayoffTimeline(
  debts: Debt[],
  strategy: PayoffStrategy,
  monthlyLeftover: number,
  extraPayment: number
): PayoffResult {
  const sorted = sortByStrategy(debts, strategy);
  if (sorted.length === 0) return { events: [], totalInterestPaid: 0, payoffDate: null, monthsToFree: 0 };

  // Deep clone debts for simulation
  const working = sorted.map(d => ({ ...d }));
  let extra = extraPayment;
  const events: PayoffEvent[] = [];
  let totalInterestPaid = 0;
  const now = new Date();
  let month = 0;
  const MAX_MONTHS = 600;

  while (working.some(d => d.balance > 0) && month < MAX_MONTHS) {
    month++;
    // Apply interest to each debt
    for (const d of working) {
      if (d.balance <= 0) continue;
      if (d.interestRate) {
        const monthlyRate = d.interestRate / 100 / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        totalInterestPaid += interest;
      }
    }

    // Pay minimums on all but first
    for (let i = 1; i < working.length; i++) {
      const d = working[i];
      if (d.balance <= 0) continue;
      const payment = Math.min(d.balance, d.minimumPayment);
      d.balance -= payment;
    }

    // Pay minimum + extra on first active debt
    const first = working.find(d => d.balance > 0);
    if (!first) break;
    const payment = Math.min(first.balance, first.minimumPayment + extra);
    first.balance -= payment;

    if (first.balance <= 0.01) {
      first.balance = 0;
      const date = new Date(now);
      date.setMonth(date.getMonth() + month);
      events.push({
        month,
        date,
        debtName: first.name,
        amountApplied: payment,
        cascadeAdded: first.minimumPayment,
        interestPaid: totalInterestPaid,
      });
      extra += first.minimumPayment;
    }
  }

  const payoffDate = events.length > 0 ? events[events.length - 1].date : null;
  return { events, totalInterestPaid, payoffDate, monthsToFree: month };
}

export const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
