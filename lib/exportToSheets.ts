import * as XLSX from 'xlsx';
import { BudgetState, Expense, Debt } from './types';
import {
  getTotalIncome, getTotalExpenses, getTotalDebtMinimums,
  sortByStrategy, calculatePayoffTimeline, debtRatio,
  isExpenseActive, isIncomeActive, incomeToSemiMonthly,
} from './calculations';
import { getSemiMonthlyRanges, getExpensesDueInWeek, getIncomeInWeek } from './weekUtils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Sheet 1: Overall Budget ────────────────────────────────────────────────

function buildOverallBudget(state: BudgetState): XLSX.WorkSheet {
  const { incomeStreams, expenses, debts } = state;
  const now = new Date();

  const rows: (string | number)[][] = [];

  // ── Income ──
  rows.push(['INCOME']);
  rows.push(['Name', 'Amount per Period', 'Frequency', 'Semi-Monthly Equiv.', 'Monthly Equiv.', 'Start Date']);
  for (const s of incomeStreams) {
    const bw = incomeToSemiMonthly(s.amount, s.frequency);
    const mo = bw * 2;
    const active = isIncomeActive(s, now);
    rows.push([
      s.name,
      s.amount,
      s.frequency,
      active ? bw : 0,
      active ? mo : 0,
      s.startDate ? `Starts ${s.startDate}` : 'Active',
    ]);
  }
  const monthlyIncome = getTotalIncome(incomeStreams, 'monthly');
  rows.push(['', '', '', 'Total Monthly Income →', monthlyIncome]);
  rows.push([]);

  // ── Expenses ──
  rows.push(['EXPENSES']);
  rows.push(['Name', 'Amount', 'Frequency', 'Category', 'Due Day', 'Monthly Equiv.', 'End Date']);
  const activeExpenses = expenses.filter(e => isExpenseActive(e, now));
  for (const e of activeExpenses) {
    const mo = e.frequency === 'monthly' ? e.amount
      : e.frequency === 'annual' ? e.amount / 12
      : e.frequency === 'bi-weekly' ? e.amount * 26 / 12
      : e.amount * 4.333;
    rows.push([
      e.name,
      e.amount,
      e.frequency,
      e.category,
      e.dueDay ? `${e.dueDay}th` : (e.dueWeekday ?? '—'),
      mo,
      e.endDate ? `Ends ${e.endDate}` : '',
    ]);
  }
  const monthlyExpenses = getTotalExpenses(expenses, 'monthly');
  rows.push(['', '', '', '', 'Total Monthly Expenses →', monthlyExpenses]);
  rows.push([]);

  // ── Debts ──
  rows.push(['DEBTS — sorted by payoff strategy: ' + state.payoffStrategy.toUpperCase()]);
  rows.push(['Name', 'Balance', 'Min Payment', 'Interest Rate', 'Due Date', 'Owner', 'Ratio (min÷balance)']);
  const sorted = sortByStrategy(debts, state.payoffStrategy);
  let priority = 1;
  for (const d of sorted) {
    const ratio = d.balance > 0 ? ((d.minimumPayment / d.balance) * 100).toFixed(2) + '%' : '—';
    rows.push([
      `#${priority++}  ${d.name}`,
      d.balance,
      d.minimumPayment,
      d.interestRate ? `${d.interestRate}%` : '—',
      d.dueDay ? `${d.dueDay}th` : (d.dueWeekday ?? '—'),
      d.owner,
      ratio,
    ]);
  }
  const paidOff = debts.filter(d => d.isPaidOff);
  if (paidOff.length > 0) {
    rows.push([]);
    rows.push(['PAID OFF DEBTS']);
    rows.push(['Name', 'Owner']);
    for (const d of paidOff) rows.push([d.name, d.owner]);
  }
  const totalBalance = debts.filter(d => !d.isPaidOff).reduce((s, d) => s + d.balance, 0);
  const totalMins = getTotalDebtMinimums(debts);
  rows.push([]);
  rows.push(['', 'Total Debt Balance →', totalBalance, 'Total Monthly Minimums →', totalMins]);
  rows.push([]);

  // ── Monthly Summary ──
  rows.push(['MONTHLY SUMMARY']);
  const leftover = Math.max(0, monthlyIncome - monthlyExpenses - totalMins);
  rows.push(['Total Income (monthly)', monthlyIncome]);
  rows.push(['Total Expenses (monthly)', monthlyExpenses]);
  rows.push(['Total Debt Minimums (monthly)', totalMins]);
  rows.push(['Monthly Leftover', leftover]);

  // ── Savings Goals ──
  if (state.savingsGoals.length > 0) {
    rows.push([]);
    rows.push(['SAVINGS GOALS']);
    rows.push(['Name', 'Target', 'Current', 'Remaining']);
    for (const g of state.savingsGoals) {
      rows.push([g.name, g.targetAmount, g.currentAmount, g.targetAmount - g.currentAmount]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 36 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 18 }];
  return ws;
}

// ─── Sheet per month: Pay Period Breakdown ──────────────────────────────────

function buildMonthSheet(state: BudgetState, year: number, month: number): XLSX.WorkSheet {
  const { incomeStreams, expenses, debts, weekEntries } = state;

  const periods = getSemiMonthlyRanges(year, month);

  const rows: (string | number)[][] = [];
  rows.push([`${MONTH_NAMES[month]} ${year} — Pay Period Breakdown`]);
  rows.push([]);

  let monthTotalIncome = 0;
  let monthTotalExpenses = 0;

  for (let idx = 0; idx < periods.length; idx++) {
    const period = periods[idx];
    const entry = weekEntries.find(w => w.weekId === period.weekId);

    const activeExp = expenses.filter(e => isExpenseActive(e, period.start));
    const rentExpenses = activeExp.filter(e => e.name.toLowerCase() === 'rent');
    const nonRentExpenses = activeExp.filter(e => e.name.toLowerCase() !== 'rent');

    const due = getExpensesDueInWeek(nonRentExpenses, debts, period.start, period.end);
    const rentPerPeriod = rentExpenses.reduce((s, e) => s + e.amount, 0) / 2;

    const dueCost = due.reduce((s, { item, type }) =>
      s + (type === 'expense' ? (item as Expense).amount : (item as Debt).minimumPayment), 0);
    const periodExpenses = dueCost + rentPerPeriod;

    const exactIncome = incomeStreams
      .filter(s => s.nextPayDate)
      .reduce((sum, s) => sum + getIncomeInWeek(s, period.start, period.end), 0);
    const fallback = incomeStreams
      .filter(s => !s.nextPayDate && s.frequency !== 'one-time' && isIncomeActive(s, period.start))
      .reduce((sum, s) => sum + incomeToSemiMonthly(s.amount, s.frequency), 0);
    const periodIncome = exactIncome + fallback + (entry?.extraIncome ?? 0);
    const leftover = periodIncome - periodExpenses;

    monthTotalIncome += periodIncome;
    monthTotalExpenses += periodExpenses;

    // Header row
    rows.push(['Week', 'Expenses', 'Totals', 'Income']);
    rows.push([`${fmtDate(period.start)} – ${fmtDate(period.end)}`, '', '', periodIncome]);

    // Rent rows (split)
    for (const e of rentExpenses) {
      const split = e.amount / periods.length;
      rows.push(['', e.name + ' (÷' + periods.length + ')', split, '']);
    }

    // Other expenses
    for (const { item, type } of due) {
      const amount = type === 'expense'
        ? (item as Expense).amount
        : (item as Debt).minimumPayment;
      const label = type === 'debt' ? `${item.name} [debt min]` : item.name;
      rows.push(['', label, amount, '']);
    }

    rows.push(['Total', '', periodExpenses]);
    rows.push(['Left Over', '', leftover]);
    rows.push([]);
  }

  rows.push(['Monthly Left Over', '', monthTotalIncome - monthTotalExpenses]);
  rows.push(['Monthly Total Income', '', monthTotalIncome]);
  rows.push(['Monthly Total Expenses', '', monthTotalExpenses]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

// ─── Sheet: Debt Payoff Strategy ────────────────────────────────────────────

function buildDebtPayoffSheet(state: BudgetState): XLSX.WorkSheet {
  const { debts, incomeStreams, expenses, payoffStrategy } = state;

  const monthlyIncome = getTotalIncome(incomeStreams, 'monthly');
  const monthlyExpenses = getTotalExpenses(expenses, 'monthly');
  const monthlyDebtMins = getTotalDebtMinimums(debts);
  const monthlyLeftover = Math.max(0, monthlyIncome - monthlyExpenses - monthlyDebtMins);

  const rows: (string | number)[][] = [];

  // Debt list sorted by strategy
  rows.push(['DEBT PAYOFF STRATEGY: ' + payoffStrategy.toUpperCase()]);
  rows.push([]);
  rows.push(['Loan Name', 'Balance', 'Monthly Payment', 'Ratio Benefit %', 'Interest Rate', 'Owner', 'Due Date']);

  const sorted = sortByStrategy(debts, payoffStrategy);
  for (const d of sorted) {
    const ratio = d.balance > 0 ? (debtRatio(d) * 100).toFixed(2) + '%' : '—';
    rows.push([
      d.name,
      d.balance,
      d.minimumPayment,
      ratio,
      d.interestRate ? `${d.interestRate}%` : '—',
      d.owner,
      d.dueDay ? `${d.dueDay}th` : (d.dueWeekday ?? '—'),
    ]);
  }
  rows.push([]);
  rows.push(['Monthly Leftover available for extra payments:', monthlyLeftover]);
  rows.push([]);

  // Payoff timeline
  rows.push(['Debt Payoff Strategy — Projected Timeline']);
  rows.push([]);
  rows.push(['Month #', 'Projected Date', 'Debt Paid Off', 'Amount Applied', 'Cascade Added']);

  const result = calculatePayoffTimeline(debts, payoffStrategy, monthlyLeftover, 0, incomeStreams, expenses);
  for (const event of result.events) {
    rows.push([
      event.month,
      event.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      event.debtName,
      event.amountApplied,
      event.cascadeAdded,
    ]);
  }
  rows.push([]);
  if (result.payoffDate) {
    rows.push(['Full Payoff Date:', result.payoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })]);
  }
  rows.push(['Total Interest Paid:', result.totalInterestPaid]);
  rows.push(['Months to Debt Freedom:', result.monthsToFree]);

  // Monthly savings breakdown
  rows.push([]);
  rows.push(['Monthly Savings Breakdown']);
  rows.push(['Month', 'Debt Paid', 'Amount Paid']);
  for (const event of result.events) {
    rows.push([
      event.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      event.debtName,
      event.amountApplied,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
  return ws;
}

// ─── Main export function ────────────────────────────────────────────────────

export function exportToGoogleSheets(state: BudgetState): void {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  // Sheet 1: Overall Budget
  XLSX.utils.book_append_sheet(wb, buildOverallBudget(state), 'Overall Budget');

  // One pay period sheet per month — current month + next 11
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const sheetName = `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
    XLSX.utils.book_append_sheet(wb, buildMonthSheet(state, d.getFullYear(), d.getMonth()), sheetName);
  }

  // Debt payoff sheet
  XLSX.utils.book_append_sheet(wb, buildDebtPayoffSheet(state), 'Debt Payoff');

  // Download
  const filename = `Budget_Export_${now.toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
