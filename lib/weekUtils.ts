import { Debt, Expense, IncomeStream, PayFrequency } from './types';
import { incomeToBiWeekly } from './calculations';

export interface WeekRange {
  weekId: string;
  start: Date;
  end: Date;
}

/**
 * Returns 14-day pay period ranges that overlap with the given month.
 * Periods are anchored to the provided pay date (or the 1st if none given),
 * so each period boundary lines up with an actual payday.
 */
export function getBiWeeklyRanges(year: number, month: number, anchor?: Date): WeekRange[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from anchor (known pay date) or fall back to the 1st of the month
  const cursor = anchor ? new Date(anchor) : new Date(firstDay);

  // Walk cursor backward until it's at or before firstDay
  while (cursor > firstDay) cursor.setDate(cursor.getDate() - 14);
  // If we went more than 13 days before firstDay, step forward once
  while (new Date(cursor.getTime() + 13 * 24 * 3600 * 1000) < firstDay) {
    cursor.setDate(cursor.getDate() + 14);
  }

  const ranges: WeekRange[] = [];
  let periodNum = 1;

  while (cursor <= lastDay) {
    const periodStart = new Date(cursor);
    const periodEnd = new Date(cursor);
    periodEnd.setDate(periodEnd.getDate() + 13);

    if (periodEnd >= firstDay) {
      ranges.push({
        weekId: `${year}-${String(month + 1).padStart(2, '0')}-B${periodNum}`,
        start: periodStart,
        end: periodEnd,
      });
      periodNum++;
    }

    cursor.setDate(cursor.getDate() + 14);
  }

  return ranges;
}

/** Returns the week ranges (Mon–Sun) that overlap with the given month */
export function getWeekRanges(year: number, month: number): WeekRange[] {
  const ranges: WeekRange[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from the Monday of the week containing the 1st
  const startMonday = new Date(firstDay);
  const dow = firstDay.getDay(); // 0=Sun
  const daysBack = dow === 0 ? 6 : dow - 1;
  startMonday.setDate(firstDay.getDate() - daysBack);

  const cursor = new Date(startMonday);
  let weekNum = 1;

  while (cursor <= lastDay) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Only include if the week overlaps with this month
    if (weekStart <= lastDay && weekEnd >= firstDay) {
      ranges.push({
        weekId: `${year}-${String(month + 1).padStart(2, '0')}-W${weekNum}`,
        start: weekStart,
        end: weekEnd,
      });
      weekNum++;
    }

    cursor.setDate(cursor.getDate() + 7);
  }

  return ranges;
}

export function getExpensesDueInWeek(
  expenses: Expense[],
  debts: Debt[],
  weekStart: Date,
  weekEnd: Date
): Array<{ item: Expense | Debt; type: 'expense' | 'debt' }> {
  const results: Array<{ item: Expense | Debt; type: 'expense' | 'debt' }> = [];

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Collect all days in the week range
  const daysInWeek: Date[] = [];
  const cursor = new Date(weekStart);
  while (cursor <= weekEnd) {
    daysInWeek.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const expense of expenses) {
    if (expense.dueDay !== undefined) {
      // Check if any day in the week has this day-of-month
      if (daysInWeek.some(d => d.getDate() === expense.dueDay)) {
        results.push({ item: expense, type: 'expense' });
      }
    } else if (expense.dueWeekday) {
      if (daysInWeek.some(d => WEEKDAYS[d.getDay()] === expense.dueWeekday)) {
        results.push({ item: expense, type: 'expense' });
      }
    }
  }

  for (const debt of debts) {
    if (debt.isPaidOff) continue;
    if (debt.dueDay !== undefined) {
      if (daysInWeek.some(d => d.getDate() === debt.dueDay)) {
        results.push({ item: debt, type: 'debt' });
      }
    } else if (debt.dueWeekday) {
      if (daysInWeek.some(d => WEEKDAYS[d.getDay()] === debt.dueWeekday)) {
        results.push({ item: debt, type: 'debt' });
      }
    }
  }

  return results;
}

/** Days between pay cycles for each frequency */
const FREQ_INTERVAL_DAYS: Partial<Record<PayFrequency, number>> = {
  weekly: 7,
  'bi-weekly': 14,
};

/**
 * Given an income stream with a known nextPayDate, returns how much income
 * lands in [weekStart, weekEnd] by walking forward/back from the reference date.
 * Falls back to 0 if no nextPayDate is set.
 */
export function getIncomeInWeek(stream: IncomeStream, weekStart: Date, weekEnd: Date): number {
  if (!stream.nextPayDate) return 0;

  const ref = new Date(stream.nextPayDate + 'T00:00:00'); // parse as local date
  const { frequency, amount } = stream;

  // One-time: pay only if the date falls in the week
  if (frequency === 'one-time') {
    return ref >= weekStart && ref <= weekEnd ? amount : 0;
  }

  // Monthly: pay on the same day of month
  if (frequency === 'monthly') {
    const dom = ref.getDate();
    const daysInWeek: Date[] = [];
    const c = new Date(weekStart);
    while (c <= weekEnd) { daysInWeek.push(new Date(c)); c.setDate(c.getDate() + 1); }
    return daysInWeek.some(d => d.getDate() === dom) ? amount : 0;
  }

  // Semi-monthly: two pays per month. Use ref date and ref + 15 days (mod month).
  if (frequency === 'semi-monthly') {
    const dom1 = ref.getDate();
    const dom2 = dom1 <= 15 ? dom1 + 15 : dom1 - 15;
    const daysInWeek: Date[] = [];
    const c = new Date(weekStart);
    while (c <= weekEnd) { daysInWeek.push(new Date(c)); c.setDate(c.getDate() + 1); }
    const hits = daysInWeek.filter(d => d.getDate() === dom1 || d.getDate() === dom2).length;
    return hits * amount;
  }

  // Weekly (7) or Bi-weekly (14): walk from ref date to cover the week range
  const intervalDays = FREQ_INTERVAL_DAYS[frequency];
  if (!intervalDays) return 0;

  // Find the closest pay date on or before weekEnd
  // Walk ref forward until past weekEnd, then check if any hit the week
  const cursor = new Date(ref);
  // Step backwards until before weekStart - intervalDays to ensure we cover the range
  while (cursor > weekEnd) cursor.setDate(cursor.getDate() - intervalDays);
  while (cursor < new Date(weekStart.getTime() - intervalDays * 24 * 3600 * 1000)) {
    cursor.setDate(cursor.getDate() + intervalDays);
  }

  let total = 0;
  const seen = new Set<string>();
  while (cursor <= weekEnd) {
    const key = cursor.toISOString().slice(0, 10);
    if (!seen.has(key) && cursor >= weekStart && cursor <= weekEnd) {
      total += amount;
      seen.add(key);
    }
    cursor.setDate(cursor.getDate() + intervalDays);
  }
  return total;
}

/** Next pay date after (or on) a given date for a stream with a known nextPayDate */
export function getNextPayDate(stream: IncomeStream, after: Date = new Date()): Date | null {
  if (!stream.nextPayDate) return null;

  const ref = new Date(stream.nextPayDate + 'T00:00:00');
  const { frequency } = stream;

  if (frequency === 'one-time') return ref >= after ? ref : null;

  if (frequency === 'monthly') {
    const candidate = new Date(after.getFullYear(), after.getMonth(), ref.getDate());
    if (candidate < after) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
  }

  if (frequency === 'semi-monthly') {
    const dom1 = ref.getDate();
    const dom2 = dom1 <= 15 ? dom1 + 15 : dom1 - 15;
    const candidates = [
      new Date(after.getFullYear(), after.getMonth(), dom1),
      new Date(after.getFullYear(), after.getMonth(), dom2),
      new Date(after.getFullYear(), after.getMonth() + 1, dom1),
      new Date(after.getFullYear(), after.getMonth() + 1, dom2),
    ].filter(d => d >= after).sort((a, b) => a.getTime() - b.getTime());
    return candidates[0] ?? null;
  }

  const intervalDays = FREQ_INTERVAL_DAYS[frequency];
  if (!intervalDays) return null;

  const cursor = new Date(ref);
  while (cursor < after) cursor.setDate(cursor.getDate() + intervalDays);
  while (cursor >= new Date(after.getTime() + intervalDays * 24 * 3600 * 1000)) {
    cursor.setDate(cursor.getDate() - intervalDays);
  }
  // Final forward walk to first date >= after
  while (cursor < after) cursor.setDate(cursor.getDate() + intervalDays);
  return cursor;
}

export function getUpcomingPayments(
  expenses: Expense[],
  debts: Debt[]
): Array<{ item: Expense | Debt; type: 'expense' | 'debt'; dueDate: Date }> {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const results: Array<{ item: Expense | Debt; type: 'expense' | 'debt'; dueDate: Date }> = [];

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const items: Array<{ item: Expense | Debt; type: 'expense' | 'debt' }> = [
    ...expenses.map(e => ({ item: e as Expense | Debt, type: 'expense' as const })),
    ...debts.filter(d => !d.isPaidOff).map(d => ({ item: d as Expense | Debt, type: 'debt' as const })),
  ];

  for (const { item, type } of items) {
    const dueDay = (item as Expense).dueDay ?? (item as Debt).dueDay;
    const dueWeekday = (item as Expense).dueWeekday ?? (item as Debt).dueWeekday;

    if (dueDay !== undefined) {
      // Find next occurrence of this day of month
      const candidate = new Date(now.getFullYear(), now.getMonth(), dueDay);
      if (candidate < now) candidate.setMonth(candidate.getMonth() + 1);
      if (candidate <= weekEnd) {
        results.push({ item, type, dueDate: candidate });
      }
    } else if (dueWeekday) {
      const targetDow = WEEKDAYS.indexOf(dueWeekday);
      const candidate = new Date(now);
      while (candidate.getDay() !== targetDow) candidate.setDate(candidate.getDate() + 1);
      if (candidate <= weekEnd) {
        results.push({ item, type, dueDate: candidate });
      }
    }
  }

  return results.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/**
 * Sums the leftover (income minus expenses) across all bi-weekly periods in
 * the given month. Mirrors the WeeklyView calculation: rent is split evenly
 * across periods; all other items appear in full in their due period.
 */
export function getBiWeeklyMonthlyLeftover(
  incomeStreams: IncomeStream[],
  expenses: Expense[],
  debts: Debt[],
  year: number,
  month: number
): number {
  const anchorStream = incomeStreams.find(s => s.frequency === 'bi-weekly' && s.nextPayDate);
  const anchor = anchorStream ? new Date(anchorStream.nextPayDate + 'T00:00:00') : undefined;
  const periods = getBiWeeklyRanges(year, month, anchor);

  const rentExpenses = expenses.filter(e => e.name.toLowerCase() === 'rent');
  const nonRentExpenses = expenses.filter(e => e.name.toLowerCase() !== 'rent');
  const rentPerPeriod = rentExpenses.reduce((s, e) => s + e.amount, 0) / (periods.length || 1);

  const fallbackPerPeriod = incomeStreams
    .filter(s => !s.nextPayDate && s.frequency !== 'one-time')
    .reduce((sum, s) => sum + incomeToBiWeekly(s.amount, s.frequency), 0);

  let total = 0;
  for (const period of periods) {
    const due = getExpensesDueInWeek(nonRentExpenses, debts, period.start, period.end);
    const dueCost = due.reduce((s, { item, type }) =>
      s + (type === 'expense' ? (item as Expense).amount : (item as Debt).minimumPayment), 0);

    const exactIncome = incomeStreams
      .filter(s => s.nextPayDate)
      .reduce((sum, s) => sum + getIncomeInWeek(s, period.start, period.end), 0);

    total += (exactIncome + fallbackPerPeriod) - (dueCost + rentPerPeriod);
  }

  return Math.max(0, total);
}
