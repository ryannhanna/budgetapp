'use client';

import { useMemo, useState } from 'react';
import { BudgetState, DEFAULT_PAY_PERIOD_CONFIG, PayoffStrategy } from '@/lib/types';
import { calculatePayoffTimeline, getTotalIncome, getTotalExpenses, getTotalDebtMinimums, sortByStrategy, fmt } from '@/lib/calculations';
import { getRolledDownBalances } from '@/lib/weekUtils';
import { TrendingDown, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

interface PayoffTimelineProps {
  state: BudgetState;
  onStrategyChange: (s: PayoffStrategy) => void;
  onUpdateDebtOrder: (order: string[] | undefined) => void;
}

const STRATEGIES: { id: PayoffStrategy; label: string; desc: string }[] = [
  { id: 'ratio', label: 'Ratio', desc: 'Payment ÷ balance (highest first)' },
  { id: 'avalanche', label: 'Avalanche', desc: 'Highest APR first' },
  { id: 'snowball', label: 'Snowball', desc: 'Lowest balance first' },
];

export default function PayoffTimeline({ state, onStrategyChange, onUpdateDebtOrder }: PayoffTimelineProps) {
  const { debts, payoffStrategy, incomeStreams, expenses, weekEntries } = state;
  const config = state.payPeriodConfig ?? DEFAULT_PAY_PERIOD_CONFIG;
  const debtOrder = state.debtOrder;
  const [extraPayment, setExtraPayment] = useState(0);

  const monthlyIncome = getTotalIncome(incomeStreams, 'monthly');
  const monthlyExpenses = getTotalExpenses(expenses, 'monthly');
  const monthlyDebtMins = getTotalDebtMinimums(debts);
  const monthlyLeftover = Math.max(0, monthlyIncome - monthlyExpenses - monthlyDebtMins);

  // Seed the simulation with balances rolled down by the current month's already-
  // started pay periods, so the timeline agrees with the pay-period view on which
  // month each debt gets paid off.
  const startingBalances = useMemo(
    () => getRolledDownBalances(debts, incomeStreams, expenses, weekEntries, payoffStrategy, config, debtOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debts, incomeStreams, expenses, weekEntries, payoffStrategy, config.type, config.anchorDate, config.period1Start, config.period2Start, debtOrder],
  );

  const result = calculatePayoffTimeline(debts, payoffStrategy, monthlyLeftover, extraPayment, incomeStreams, expenses, startingBalances, debtOrder);

  // Ordered list of active debts for the priority reorder UI
  const orderedActiveDebts = sortByStrategy(debts, payoffStrategy, debtOrder);

  const moveDebt = (idx: number, dir: -1 | 1) => {
    const ids = orderedActiveDebts.map(d => d.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    onUpdateDebtOrder(ids);
  };

  return (
    <div className="space-y-6">
      {/* Strategy selector */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-gray-800">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <TrendingDown size={16} /> Payoff Strategy
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {STRATEGIES.map(s => (
            <button
              key={s.id}
              onClick={() => onStrategyChange(s.id)}
              className={`p-3 rounded-xl border text-left transition-colors ${
                payoffStrategy === s.id
                  ? 'border-green-600 bg-green-900/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <p className={`text-sm font-medium ${payoffStrategy === s.id ? 'text-green-400' : 'text-gray-300'}`}>{s.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
            </button>
          ))}
        </div>

        {/* Extra payment input */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400 whitespace-nowrap">Extra above surplus:</label>
            <input
              type="number"
              min="0"
              step="10"
              value={extraPayment || ''}
              onChange={e => setExtraPayment(parseFloat(e.target.value) || 0)}
              className="input w-32 text-sm"
              placeholder="$0"
            />
            {extraPayment > 0 && (
              <button
                onClick={() => setExtraPayment(0)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Reset to $0
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Monthly surplus applied automatically: {fmt(monthlyLeftover)}
            {extraPayment > 0 && <span className="text-green-500"> + {fmt(extraPayment)} extra = {fmt(monthlyLeftover + extraPayment)} total</span>}
          </p>
        </div>
      </div>

      {/* Debt priority order */}
      {orderedActiveDebts.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <TrendingDown size={16} /> Payment Priority Order
            </h3>
            {debtOrder ? (
              <button
                onClick={() => onUpdateDebtOrder(undefined)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <RotateCcw size={11} /> Reset to {payoffStrategy} order
              </button>
            ) : (
              <span className="text-xs text-gray-600 italic">Using {payoffStrategy} strategy — use arrows to set a custom order</span>
            )}
          </div>
          <div className="space-y-1">
            {orderedActiveDebts.map((debt, idx) => (
              <div
                key={debt.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors group"
              >
                <span className="text-xs text-gray-600 w-5 text-right tabular-nums">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-200">{debt.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{fmt(debt.balance)}</span>
                  {debt.interestRate ? (
                    <span className="text-xs text-gray-600 ml-1">{debt.interestRate}% APR</span>
                  ) : null}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveDebt(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveDebt(idx, 1)}
                    disabled={idx === orderedActiveDebts.length - 1}
                    className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {debtOrder && (
            <p className="text-xs text-emerald-600 mt-3">
              ✓ Custom order active — this order is used in the payoff timeline and extra-payment suggestions
            </p>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Monthly leftover" value={fmt(monthlyLeftover)} color="text-green-400" />
        <StatCard label="Total interest (est.)" value={fmt(result.totalInterestPaid)} color="text-red-400" />
        <StatCard label="Debt-free date" value={result.payoffDate ? result.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'} color="text-blue-400" />
        <StatCard label="Months to free" value={result.monthsToFree > 0 ? `${result.monthsToFree} mo` : '—'} color="text-purple-400" />
      </div>

      {/* Timeline table */}
      {result.events.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-6 text-center text-gray-500 border border-gray-800">
          {debts.filter(d => !d.isPaidOff).length === 0
            ? 'All debts are paid off!'
            : 'No payoff events — check that monthly leftover is positive'}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-400">
                <th className="px-4 py-3 text-left">Month</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Debt Paid Off</th>
                <th className="px-4 py-3 text-right">Cascade Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {result.events.map((ev, i) => (
                <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-400">{ev.month}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {ev.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 font-medium text-green-400">{ev.debtName}</td>
                  <td className="px-4 py-3 text-right text-purple-400">+{fmt(ev.cascadeAdded)}/mo freed</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 shadow-lg border border-gray-800">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
