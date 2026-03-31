import { Debt, Expense } from './types';

export interface WeekRange {
  weekId: string;
  start: Date;
  end: Date;
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
