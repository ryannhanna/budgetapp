'use client';

import { useState } from 'react';
import { BudgetState, WeekEntry } from '@/lib/types';
import { getWeekRanges, getExpensesDueInWeek } from '@/lib/weekUtils';
import { incomeToBiWeekly, fmt } from '@/lib/calculations';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const weeks = getWeekRanges(year, month);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Estimate bi-weekly income per week (half of bi-weekly paycheck)
  const biweeklyIncome = incomeStreams.reduce((s, stream) => s + incomeToBiWeekly(stream.amount, stream.frequency), 0);
  const weeklyIncomeEst = biweeklyIncome / 2;

  let monthTotalIncome = 0;
  let monthTotalExpenses = 0;

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="bg-gray-900 rounded-2xl p-5 shadow-lg flex items-center justify-between border border-gray-800">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-100">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Week cards */}
      {weeks.map(week => {
        const entry = weekEntries.find(w => w.weekId === week.weekId) ?? {
          weekId: week.weekId,
          startDate: week.start.toISOString(),
          endDate: week.end.toISOString(),
          paidExpenseIds: [],
          extraIncome: 0,
          notes: '',
        };

        const due = getExpensesDueInWeek(expenses, debts, week.start, week.end);
        const weekExpenses = due.reduce((s, { item, type }) => {
          const amount = type === 'expense'
            ? (item as import('@/lib/types').Expense).amount
            : (item as import('@/lib/types').Debt).minimumPayment;
          return s + amount;
        }, 0);
        const weekIncome = weeklyIncomeEst + entry.extraIncome;
        const leftover = weekIncome - weekExpenses;

        monthTotalIncome += weekIncome;
        monthTotalExpenses += weekExpenses;

        const togglePaid = (itemId: string) => {
          const already = entry.paidExpenseIds.includes(itemId);
          onUpsertEntry({
            ...entry,
            paidExpenseIds: already
              ? entry.paidExpenseIds.filter(id => id !== itemId)
              : [...entry.paidExpenseIds, itemId],
          });
        };

        const isCurrentWeek = now >= week.start && now <= week.end;

        return (
          <div
            key={week.weekId}
            className={`bg-gray-900 rounded-2xl shadow-lg border overflow-hidden ${
              isCurrentWeek ? 'border-green-700' : 'border-gray-800'
            }`}
          >
            {/* Week header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <h3 className="font-medium text-gray-100">
                  {formatDate(week.start)} – {formatDate(week.end)}
                  {isCurrentWeek && <span className="ml-2 text-xs text-green-400 font-medium">Current week</span>}
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
                <span className="text-gray-400">Income (est.)</span>
                <span className="text-green-400 font-medium">{fmt(weekIncome)}</span>
              </div>

              {due.length === 0 ? (
                <p className="text-xs text-gray-600 py-2">No payments due this week</p>
              ) : (
                due.map(({ item, type }) => {
                  const amount = type === 'expense'
                    ? (item as import('@/lib/types').Expense).amount
                    : (item as import('@/lib/types').Debt).minimumPayment;
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
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 text-xs text-gray-500">
              <span>Total expenses: {fmt(weekExpenses)}</span>
              <span className={leftover >= 0 ? 'text-green-400' : 'text-red-400'}>
                Leftover: {leftover >= 0 ? '+' : ''}{fmt(leftover)}
              </span>
            </div>
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
