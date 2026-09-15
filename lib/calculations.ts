import { Debt, Expense, ExpenseFrequency, IncomeStream, PayFrequency, PayoffStrategy } from './types';

export function toBiWeekly(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'weekly': return amount * 2;
    case 'bi-weekly': return amount;
    case 'monthly': return (amount * 12) / 26;
    case 'annual': return amount / 26;
  }
}

export function toSemiMonthly(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'weekly': return (amount * 52) / 24;
    case 'bi-weekly': return (amount * 26) / 24;
    case 'monthly': return amount / 2;
    case 'annual': return amount / 24;
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

export function incomeToSemiMonthly(amount: number, freq: PayFrequency): number {
  switch (freq) {
    case 'weekly': return (amount * 52) / 24;
    case 'bi-weekly': return (amount * 26) / 24;
    case 'semi-monthly': return amount;
    case 'monthly': return amount / 2;
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

/** Returns false if asOf is before the stream's startDate or after its endDate. */
export function isIncomeActive(stream: IncomeStream, asOf: Date = new Date()): boolean {
  const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (stream.startDate) {
    const start = new Date(stream.startDate + 'T00:00:00');
    if (asOfDay < start) return false;
  }
  if (stream.endDate) {
    const end = new Date(stream.endDate + 'T00:00:00');
    if (asOfDay > end) return false;
  }
  return true;
}

export function getTotalIncome(streams: IncomeStream[], mode: 'semi-monthly' | 'bi-weekly' | 'monthly', asOf: Date = new Date()): number {
  return streams.filter(s => isIncomeActive(s, asOf)).reduce((sum, s) => {
    let normalized: number;
    if (mode === 'semi-monthly') normalized = incomeToSemiMonthly(s.amount, s.frequency);
    else if (mode === 'bi-weekly') normalized = incomeToBiWeekly(s.amount, s.frequency);
    else normalized = incomeToMonthly(s.amount, s.frequency);
    return sum + normalized;
  }, 0);
}

/** Returns false if asOf is before the expense's startDate or after its endDate. */
export function isExpenseActive(expense: Expense, asOf: Date = new Date()): boolean {
  const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (expense.startDate) {
    const start = new Date(expense.startDate + 'T00:00:00');
    if (asOfDay < start) return false;
  }
  if (expense.endDate) {
    const end = new Date(expense.endDate + 'T00:00:00');
    if (asOfDay > end) return false;
  }
  return true;
}

export function getTotalExpenses(expenses: Expense[], mode: 'semi-monthly' | 'bi-weekly' | 'monthly', asOf: Date = new Date()): number {
  return expenses.filter(e => isExpenseActive(e, asOf)).reduce((sum, e) => {
    let normalized: number;
    if (mode === 'semi-monthly') normalized = toSemiMonthly(e.amount, e.frequency);
    else if (mode === 'bi-weekly') normalized = toBiWeekly(e.amount, e.frequency);
    else normalized = toMonthly(e.amount, e.frequency);
    return sum + normalized;
  }, 0);
}

/** Returns false if asOf is before the debt's startDate, or if the debt is paid off. */
export function isDebtActive(debt: Debt, asOf: Date = new Date()): boolean {
  if (debt.isPaidOff) return false;
  if (debt.startDate) {
    const start = new Date(debt.startDate + 'T00:00:00');
    const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    if (asOfDay < start) return false;
  }
  return true;
}

export function getTotalDebtMinimums(debts: Debt[], asOf: Date = new Date()): number {
  return debts.filter(d => isDebtActive(d, asOf)).reduce((sum, d) => sum + d.minimumPayment, 0);
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
  extraPayment: number,
  incomeStreams?: IncomeStream[],
  expenses?: Expense[],
  /** Optional pre-rolled balances (e.g. from getRolledDownBalances). When
   *  provided, the simulation starts from these balances instead of each
   *  debt's stored balance, so it agrees with the pay-period view. */
  startingBalances?: Map<string, number>
): PayoffResult {
  const sorted = sortByStrategy(debts, strategy);
  if (sorted.length === 0) return { events: [], totalInterestPaid: 0, payoffDate: null, monthsToFree: 0 };

  // Deep clone debts for simulation, optionally seeding with rolled-down balances
  const working = sorted.map(d => ({
    ...d,
    balance: startingBalances?.get(d.id) ?? d.balance,
  }));
  const events: PayoffEvent[] = [];
  let totalInterestPaid = 0;
  const now = new Date();
  let month = 0;
  const MAX_MONTHS = 600;
  // Track which working debts have already been recorded as paid off
  const paidOff = new Array(working.length).fill(false);

  // Accumulated freed minimums for the fixed-leftover fallback path (no incomeStreams/expenses).
  let cascadeTotal = 0;

  // Pre-loop: detect debts already zeroed by startingBalances. This happens when the
  // current month's pay-period rolling sim had a large enough surplus to cover them all
  // (e.g., very large income). Emit payoff events dated to the current month so the
  // timeline shows them rather than appearing completely blank.
  if (startingBalances) {
    const curMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < working.length; i++) {
      const origBal = sorted[i].balance;
      if (origBal > 0 && working[i].balance === 0) {
        paidOff[i] = true;
        cascadeTotal += sorted[i].minimumPayment;
        events.push({
          month: 1,
          date: new Date(curMonthDate),
          debtName: working[i].name,
          amountApplied: origBal,
          cascadeAdded: sorted[i].minimumPayment,
          interestPaid: 0,
        });
      }
    }
    // Ensure monthsToFree reflects at least 1 if any debts were pre-zeroed
    if (events.length > 0) month = Math.max(month, 1);
  }

  while (working.some(d => d.balance > 0) && month < MAX_MONTHS) {
    month++;

    // The calendar month this simulation step represents.
    const simDate = new Date(now.getFullYear(), now.getMonth() + month, 1);

    // A working debt is "active this month" if it has a positive balance AND its
    // startDate (if set) is on or before simDate. This correctly excludes:
    //   • fully-paid debts (balance = 0) — enables the cascade effect
    //   • future-start debts (startDate > simDate) — prevents them from consuming
    //     extra payment or inflating simMins in months before they begin
    const activeThisMonth = (d: (typeof working)[0]) =>
      d.balance > 0 && isDebtActive(d as Debt, simDate);

    // Recompute extra each month using only active debts' minimums so that:
    //   • paid-off debts free their minimum into extra (cascade)
    //   • debts not yet started don't reduce the available surplus prematurely
    let extra: number;
    if (incomeStreams && expenses) {
      const simIncome = getTotalIncome(incomeStreams, 'monthly', simDate);
      const simExpenses = getTotalExpenses(expenses, 'monthly', simDate);
      const simMins = working.filter(activeThisMonth).reduce((s, d) => s + d.minimumPayment, 0);
      extra = Math.max(0, simIncome - simExpenses - simMins) + extraPayment;
    } else {
      extra = monthlyLeftover + extraPayment + cascadeTotal;
    }

    // Apply interest only to debts active this month
    for (const d of working) {
      if (!activeThisMonth(d)) continue;
      if (d.interestRate) {
        const monthlyRate = d.interestRate / 100 / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        totalInterestPaid += interest;
      }
    }

    // Pay minimums only to debts active this month
    for (const d of working) {
      if (!activeThisMonth(d)) continue;
      d.balance -= Math.min(d.balance, d.minimumPayment);
    }

    // Cascade extra through active debts in priority order within the same month
    let remainingExtra = extra;
    for (const d of working) {
      if (!activeThisMonth(d) || remainingExtra <= 0) continue;
      const payment = Math.min(d.balance, remainingExtra);
      d.balance -= payment;
      remainingExtra -= payment;
    }

    // Clamp floating-point dust
    for (const d of working) {
      if (d.balance > 0 && d.balance < 0.01) d.balance = 0;
    }

    // Record newly paid-off debts; accumulate freed minimums for the fallback path
    // Subtract 1 so month-1 = current month, month-2 = next month, etc.
    // This aligns the displayed payoff date with what the pay-period view shows.
    const date = new Date(now.getFullYear(), now.getMonth() + month - 1, 1);
    for (let i = 0; i < working.length; i++) {
      if (!paidOff[i] && working[i].balance === 0) {
        paidOff[i] = true;
        cascadeTotal += working[i].minimumPayment;
        events.push({
          month,
          date: new Date(date),
          debtName: working[i].name,
          amountApplied: working[i].minimumPayment,
          cascadeAdded: working[i].minimumPayment,
          interestPaid: totalInterestPaid,
        });
      }
    }
  }

  const payoffDate = events.length > 0 ? events[events.length - 1].date : null;
  return { events, totalInterestPaid, payoffDate, monthsToFree: month };
}

export const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
