'use client';

import { useState, useRef, useEffect } from 'react';
import { BudgetState, Expense, Debt, WeekEntry } from '@/lib/types';
import { getBiWeeklyRanges, getExpensesDueInWeek, getIncomeInWeek } from '@/lib/weekUtils';
import { incomeToBiWeekly, fmt, sortByStrategy, isExpenseActive, isIncomeActive } from '@/lib/calculations';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';

interface WeeklyViewProps {
  state: BudgetState;
  onUpsertEntry: (entry: WeekEntry) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function WeeklyView({ state, onUpsertEntry }: WeeklyViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { expenses, debts, incomeStreams, weekEntries } = state;

  const currentPeriodRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    currentPeriodRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Anchor bi-weekly periods to the first bi-weekly stream with a known pay date
  const anchorStream = incomeStreams.find(s => s.frequency === 'bi-weekly' && s.nextPayDate);
  const anchor = anchorStream ? new Date(anchorStream.nextPayDate + 'T00:00:00') : undefined;

  const periods = getBiWeeklyRanges(year, month, anchor);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // hasFallback: true if any stream without a pay date exists (used for "(est.)" label)
  const hasFallback = incomeStreams.some(s => !s.nextPayDate && s.frequency !== 'one-time');

  let monthTotalIncome = 0;
  let monthTotalExpenses = 0;

  // Pre-compute rolling simulated debt balances so each period sees the balance
  // after prior periods' suggested extra payments have been applied.
  const simBalsPerPeriod: Map<string, number>[] = [];
  {
    const rolling = new Map(
      debts.filter(d => !d.isPaidOff).map(d => [d.id, d.balance])
    );
    for (const period of periods) {
      simBalsPerPeriod.push(new Map(rolling));
      const pEntry = weekEntries.find(w => w.weekId === period.weekId);
      const paidIds = pEntry?.paidExpenseIds ?? [];
      const activeExp = expenses.filter(e => isExpenseActive(e, period.start));
      const periodRentExp = activeExp.filter(e => e.name.toLowerCase() === 'rent');
      const periodNonRentExp = activeExp.filter(e => e.name.toLowerCase() !== 'rent');
      const due = getExpensesDueInWeek(periodNonRentExp, debts, period.start, period.end);
      const rentPer = periodRentExp.reduce((s, e) => s + e.amount, 0) / periods.length;
      const dueCost = due.reduce((s, { item, type }) =>
        s + (type === 'expense' ? (item as Expense).amount : (item as Debt).minimumPayment), 0);
      const exactInc = incomeStreams
        .filter(s => s.nextPayDate)
        .reduce((sum, s) => sum + getIncomeInWeek(s, period.start, period.end), 0);
      const periodFallback = incomeStreams
        .filter(s => !s.nextPayDate && s.frequency !== 'one-time' && isIncomeActive(s, period.start))
        .reduce((sum, s) => sum + incomeToBiWeekly(s.amount, s.frequency), 0);
      const pLeftover = (exactInc + periodFallback + (pEntry?.extraIncome ?? 0)) - (dueCost + rentPer);
      if (pLeftover > 0) {
        const sorted = sortByStrategy(debts, state.payoffStrategy).filter(d => !paidIds.includes(d.id));
        let rem = pLeftover;
        for (const debt of sorted) {
          if (rem <= 0) break;
          const cur = rolling.get(debt.id) ?? 0;
          if (cur <= 0) continue;
          const pay = Math.min(rem, cur);
          rolling.set(debt.id, cur - pay);
          rem -= pay;
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="bg-gray-900 rounded-2xl p-5 shadow-lg flex items-center justify-between border border-gray-800">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-100">{MONTH_NAMES[month]} {year}</h2>
          {anchor && (
            <p className="text-xs text-gray-500 mt-0.5">Periods anchored to pay schedule</p>
          )}
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Pay period cards */}
      {periods.map((period, idx) => {
        const entry = weekEntries.find(w => w.weekId === period.weekId) ?? {
          weekId: period.weekId,
          startDate: period.start.toISOString(),
          endDate: period.end.toISOString(),
          paidExpenseIds: [],
          extraIncome: 0,
          notes: '',
        };

        // Filter expenses active for this period's start date
        const activeExpenses = expenses.filter(e => isExpenseActive(e, period.start));
        const rentExpenses = activeExpenses.filter(e => e.name.toLowerCase() === 'rent');
        const nonRentExpenses = activeExpenses.filter(e => e.name.toLowerCase() !== 'rent');

        // Non-rent expenses + all debts show up in whichever period their due date falls
        const due = getExpensesDueInWeek(nonRentExpenses, debts, period.start, period.end);

        // Rent is split evenly: full rent / number of periods this month
        const rentPerPeriod = rentExpenses.reduce((s, e) => s + e.amount, 0) / periods.length;

        const dueCost = due.reduce((s, { item, type }) => {
          const amount = type === 'expense'
            ? (item as Expense).amount
            : (item as Debt).minimumPayment;
          return s + amount;
        }, 0);
        const periodExpenses = dueCost + rentPerPeriod;

        // Exact income from streams that have a pay date (getIncomeInWeek gates on startDate internally)
        const exactIncome = incomeStreams
          .filter(s => s.nextPayDate)
          .reduce((sum, s) => sum + getIncomeInWeek(s, period.start, period.end), 0);
        const fallback = incomeStreams
          .filter(s => !s.nextPayDate && s.frequency !== 'one-time' && isIncomeActive(s, period.start))
          .reduce((sum, s) => sum + incomeToBiWeekly(s.amount, s.frequency), 0);
        const periodIncome = exactIncome + fallback + entry.extraIncome;
        const leftover = periodIncome - periodExpenses;

        monthTotalIncome += periodIncome;
        monthTotalExpenses += periodExpenses;

        const togglePaid = (itemId: string) => {
          const already = entry.paidExpenseIds.includes(itemId);
          onUpsertEntry({
            ...entry,
            paidExpenseIds: already
              ? entry.paidExpenseIds.filter(id => id !== itemId)
              : [...entry.paidExpenseIds, itemId],
          });
        };

        const isCurrentPeriod = now >= period.start && now <= period.end;
        const hasItems = rentExpenses.length > 0 || due.length > 0; // uses per-period rentExpenses

        return (
          <div
            key={period.weekId}
            ref={isCurrentPeriod ? currentPeriodRef : undefined}
            className={`bg-gray-900 rounded-2xl shadow-lg border overflow-hidden ${
              isCurrentPeriod ? 'border-green-700' : 'border-gray-800'
            }`}
          >
            {/* Period header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Pay Period {idx + 1}</p>
                <h3 className="font-medium text-gray-100">
                  {formatDate(period.start)} – {formatDate(period.end)}
                  {isCurrentPeriod && <span className="ml-2 text-xs text-green-400 font-medium">Current</span>}
                </h3>
              </div>
              <div className={`text-sm font-bold ${leftover >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {leftover >= 0 ? '+' : ''}{fmt(leftover)}
              </div>
            </div>

            {/* Items */}
            <div className="px-5 py-3 space-y-1.5">
              {/* Income row */}
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-400">
                  Income{hasFallback ? ' (est.)' : ''}
                </span>
                <span className="text-green-400 font-medium">{fmt(periodIncome)}</span>
              </div>

              {!hasItems ? (
                <p className="text-xs text-gray-600 py-2">No payments due this period</p>
              ) : (
                <>
                  {/* Rent — always shown, split evenly across periods */}
                  {rentExpenses.map(e => {
                    const split = e.amount / periods.length;
                    const paid = entry.paidExpenseIds.includes(e.id);
                    return (
                      <div key={e.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={paid}
                            onChange={() => togglePaid(e.id)}
                            className="w-4 h-4 rounded accent-green-500 cursor-pointer"
                          />
                          <span className={paid ? 'line-through text-gray-600' : 'text-gray-300'}>{e.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">÷{periods.length}</span>
                        </div>
                        <span className={paid ? 'text-gray-600 line-through' : 'text-gray-200'}>{fmt(split)}</span>
                      </div>
                    );
                  })}

                  {/* All other expenses + debts — full amount in their due period */}
                  {due.map(({ item, type }) => {
                    const amount = type === 'expense'
                      ? (item as Expense).amount
                      : (item as Debt).minimumPayment;
                    const paid = entry.paidExpenseIds.includes(item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={paid}
                            onChange={() => togglePaid(item.id)}
                            className="w-4 h-4 rounded accent-green-500 cursor-pointer"
                          />
                          <span className={paid ? 'line-through text-gray-600' : 'text-gray-300'}>{item.name}</span>
                          {type === 'debt' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">Debt</span>
                          )}
                        </div>
                        <span className={paid ? 'text-gray-600 line-through' : 'text-gray-200'}>{fmt(amount)}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 text-xs text-gray-500">
              <span>Total expenses: {fmt(periodExpenses)}</span>
              <span className={leftover >= 0 ? 'text-green-400' : 'text-red-400'}>
                Leftover: {leftover >= 0 ? '+' : ''}{fmt(leftover)}
              </span>
            </div>

            {/* Surplus debt suggestion */}
            {leftover > 0 && (() => {
              const simBals = simBalsPerPeriod[idx];
              // Exclude debts already checked off this period, or fully paid off in simulation
              const sorted = sortByStrategy(debts, state.payoffStrategy)
                .filter(d => !entry.paidExpenseIds.includes(d.id))
                .filter(d => (simBals.get(d.id) ?? 0) > 0);
              if (sorted.length === 0) return null;

              // Show up to 3 debts in priority order
              const topThree = sorted.slice(0, 3);

              // Distribute surplus via cascade using simulated (rolling) balances
              let remaining = leftover;
              const rows = topThree.map(debt => {
                const simBal = simBals.get(debt.id) ?? debt.balance;
                const surplusAmount = remaining > 0 ? Math.min(remaining, simBal) : 0;
                const paysOff = surplusAmount > 0 && simBal <= remaining;
                if (surplusAmount > 0) remaining -= surplusAmount;
                return { debt, simBal, surplusAmount, paysOff };
              });

              return (
                <div className="px-5 pb-4">
                  <div className="px-4 py-3 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
                    <p className="text-emerald-400 font-semibold text-xs mb-2 flex items-center gap-1.5">
                      <Lightbulb size={12} />
                      Extra Payment Suggestion — {state.payoffStrategy} strategy
                    </p>
                    <div className="space-y-1">
                      {rows.map(({ debt, simBal, surplusAmount, paysOff }) =>
                        surplusAmount > 0 ? (
                          <div key={debt.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-300">
                              {paysOff
                                ? <span className="text-emerald-400">Pay off </span>
                                : <span>Extra to </span>
                              }
                              <span className="font-medium text-gray-100">{debt.name}</span>
                              {paysOff && <span className="text-xs text-gray-500 ml-1">({fmt(simBal)} remaining)</span>}
                            </span>
                            <span className="text-emerald-400 font-semibold">{fmt(surplusAmount)}</span>
                          </div>
                        ) : (
                          <div key={debt.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Next up: <span className="text-gray-400">{debt.name}</span></span>
                            <span className="text-gray-600 text-xs">{fmt(simBal)} left</span>
                          </div>
                        )
                      )}
                    </div>
                    {remaining > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        Remaining {fmt(remaining)} goes to savings — all debts covered!
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Monthly rollup */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-green-900/40">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Monthly Rollup — {MONTH_NAMES[month]}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Income</p>
            <p className="text-lg font-bold text-green-400">{fmt(monthTotalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-red-400">{fmt(monthTotalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Monthly Leftover</p>
            <p className={`text-xl font-bold ${(monthTotalIncome - monthTotalExpenses) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(monthTotalIncome - monthTotalExpenses)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
