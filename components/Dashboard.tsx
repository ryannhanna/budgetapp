'use client';

import { useState } from 'react';
import { BudgetState, Expense, Debt } from '@/lib/types';
import {
  getTotalIncome, getTotalExpenses, getTotalDebtMinimums, fmt
} from '@/lib/calculations';
import { toSemiMonthly, toMonthly } from '@/lib/calculations';
import { getUpcomingPayments } from '@/lib/weekUtils';
import { exportToGoogleSheets } from '@/lib/exportToSheets';
import Charts from './Charts';
import {
  TrendingUp, TrendingDown, Wallet, CreditCard, Calendar,
  Download, ChevronDown, ChevronUp, X,
} from 'lucide-react';

interface DashboardProps {
  state: BudgetState;
}

type ExpandedCard = 'expenses' | 'debt' | null;

export default function Dashboard({ state }: DashboardProps) {
  const { incomeStreams, expenses, debts, viewMode } = state;
  const [expanded, setExpanded] = useState<ExpandedCard>(null);

  const normalize = viewMode === 'semi-monthly' ? toSemiMonthly : toMonthly;

  const totalIncome = getTotalIncome(incomeStreams, viewMode);
  const totalExpenses = getTotalExpenses(expenses, viewMode);
  const debtMonthly = getTotalDebtMinimums(debts);
  const debtPeriod = viewMode === 'semi-monthly' ? debtMonthly / 2 : debtMonthly;
  const totalOut = totalExpenses + debtPeriod;
  const net = totalIncome - totalOut;
  const totalDebtBalance = debts.filter(d => !d.isPaidOff).reduce((s, d) => s + d.balance, 0);

  const pct = totalIncome > 0 ? (totalOut / totalIncome) * 100 : 0;
  const statusBanner =
    pct < 80
      ? { bg: 'bg-green-900/30 border-green-700', text: 'text-green-400', msg: "You're ahead — keep stacking" }
      : pct < 100
      ? { bg: 'bg-yellow-900/30 border-yellow-700', text: 'text-yellow-400', msg: 'Tight — watch variable spending this week' }
      : { bg: 'bg-red-900/30 border-red-700', text: 'text-red-400', msg: 'Over budget — expenses exceed income' };

  const upcoming = getUpcomingPayments(expenses, debts);

  // Expenses sorted largest → smallest (normalized to current period)
  const sortedExpenses = [...expenses].sort(
    (a, b) => normalize(b.amount, b.frequency) - normalize(a.amount, a.frequency)
  );

  // Active debts sorted by balance descending
  const activeDebts = debts.filter(d => !d.isPaidOff).sort((a, b) => b.balance - a.balance);
  const paidDebts = debts.filter(d => d.isPaidOff);

  const periodLabel = viewMode === 'semi-monthly' ? 'period' : 'mo';
  const toggle = (card: ExpandedCard) =>
    setExpanded(prev => (prev === card ? null : card));

  return (
    <div className="space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={() => exportToGoogleSheets(state)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Download size={15} />
          Export to Google Sheets
        </button>
      </div>

      {/* Status banner */}
      <div className={`rounded-2xl border p-4 ${statusBanner.bg}`}>
        <p className={`font-medium ${statusBanner.text}`}>{statusBanner.msg}</p>
        <p className="text-xs text-gray-400 mt-1">
          {pct.toFixed(0)}% of income allocated to expenses
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label={`Income (${viewMode === 'semi-monthly' ? 'semi-monthly' : 'monthly'})`}
          value={fmt(totalIncome)}
          icon={<TrendingUp size={18} className="text-green-400" />}
          color="text-green-400"
        />

        {/* Clickable: Expenses */}
        <button
          onClick={() => toggle('expenses')}
          className={`bg-gray-900 rounded-2xl p-5 shadow-lg text-left transition-colors border ${
            expanded === 'expenses' ? 'border-red-500/50' : 'border-transparent hover:border-gray-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={18} className="text-red-400" />
            <span className="text-xs text-gray-400 flex-1">
              Expenses ({viewMode === 'semi-monthly' ? 'semi-monthly' : 'monthly'})
            </span>
            {expanded === 'expenses'
              ? <ChevronUp size={14} className="text-gray-500 flex-shrink-0" />
              : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />}
          </div>
          <p className="text-xl font-bold text-red-400">{fmt(totalOut)}</p>
          <p className="text-xs text-gray-500 mt-0.5">incl. debt minimums</p>
        </button>

        <SummaryCard
          label="Net leftover"
          value={fmt(net)}
          icon={<Wallet size={18} className={net >= 0 ? 'text-green-400' : 'text-red-400'} />}
          color={net >= 0 ? 'text-green-400' : 'text-red-400'}
        />

        {/* Clickable: Total debt balance */}
        <button
          onClick={() => toggle('debt')}
          className={`bg-gray-900 rounded-2xl p-5 shadow-lg text-left transition-colors border ${
            expanded === 'debt' ? 'border-amber-500/50' : 'border-transparent hover:border-gray-700'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={18} className="text-amber-400" />
            <span className="text-xs text-gray-400 flex-1">Total debt balance</span>
            {expanded === 'debt'
              ? <ChevronUp size={14} className="text-gray-500 flex-shrink-0" />
              : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />}
          </div>
          <p className="text-xl font-bold text-amber-400">{fmt(totalDebtBalance)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeDebts.length} active debt{activeDebts.length !== 1 ? 's' : ''}
          </p>
        </button>
      </div>

      {/* Expanded: Expenses breakdown */}
      {expanded === 'expenses' && (
        <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-red-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <TrendingDown size={15} className="text-red-400" />
              Expense Breakdown
              <span className="text-xs font-normal text-gray-500">
                ({viewMode === 'semi-monthly' ? 'semi-monthly' : 'monthly'})
              </span>
            </h2>
            <button
              onClick={() => setExpanded(null)}
              className="p-1 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Expenses */}
          {sortedExpenses.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recurring Expenses</p>
              <ul className="space-y-2">
                {sortedExpenses.map(e => {
                  const periodAmt = normalize(e.amount, e.frequency);
                  return (
                    <li key={e.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-gray-200">{e.name}</span>
                        <span className="ml-2 text-xs text-gray-500 capitalize">{e.category} · {e.frequency}</span>
                      </div>
                      <span className="font-medium text-gray-100 tabular-nums">
                        {fmt(periodAmt)}
                        <span className="text-gray-500 font-normal text-xs ml-1">/{periodLabel}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Debt minimums */}
          {activeDebts.length > 0 && (
            <div className="border-t border-gray-800 pt-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Debt Minimum Payments</p>
              <ul className="space-y-2">
                {activeDebts.map(d => {
                  const periodMin = viewMode === 'semi-monthly' ? d.minimumPayment / 2 : d.minimumPayment;
                  return (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-gray-200">{d.name}</span>
                        {d.owner !== 'me' && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400">
                            {d.owner}
                          </span>
                        )}
                        {d.interestRate && (
                          <span className="ml-2 text-xs text-gray-500">{d.interestRate}% APR</span>
                        )}
                      </div>
                      <span className="font-medium text-amber-300 tabular-nums">
                        {fmt(periodMin)}
                        <span className="text-gray-500 font-normal text-xs ml-1">/{periodLabel}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Totals row */}
          <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {sortedExpenses.length} expense{sortedExpenses.length !== 1 ? 's' : ''}
              {activeDebts.length > 0 && ` + ${activeDebts.length} debt minimum${activeDebts.length !== 1 ? 's' : ''}`}
            </div>
            <div className="text-right">
              <span className="font-bold text-red-400 tabular-nums">{fmt(totalOut)}</span>
              <span className="text-gray-500 text-xs ml-1">/{periodLabel}</span>
            </div>
          </div>
        </div>
      )}

      {/* Expanded: Debt balance breakdown */}
      {expanded === 'debt' && (
        <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-amber-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <CreditCard size={15} className="text-amber-400" />
              Debt Breakdown
            </h2>
            <button
              onClick={() => setExpanded(null)}
              className="p-1 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {activeDebts.length === 0 ? (
            <p className="text-gray-500 text-sm">No active debts 🎉</p>
          ) : (
            <ul className="space-y-3">
              {activeDebts.map(d => {
                const pct = totalDebtBalance > 0 ? (d.balance / totalDebtBalance) * 100 : 0;
                return (
                  <li key={d.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-200 font-medium">{d.name}</span>
                        {d.owner !== 'me' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400">
                            {d.owner}
                          </span>
                        )}
                        {d.interestRate && (
                          <span className="text-xs text-gray-500">{d.interestRate}% APR</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-amber-300 tabular-nums">{fmt(d.balance)}</span>
                        <span className="text-gray-500 text-xs ml-2">min {fmt(d.minimumPayment)}/mo</span>
                      </div>
                    </div>
                    {/* Progress bar showing share of total debt */}
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-right text-xs text-gray-600 mt-0.5">{pct.toFixed(1)}% of total</p>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Paid-off debts (collapsed summary) */}
          {paidDebts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span className="text-green-500">✓</span>
                {paidDebts.length} paid-off debt{paidDebts.length !== 1 ? 's' : ''}:&nbsp;
                <span className="text-gray-600">{paidDebts.map(d => d.name).join(', ')}</span>
              </p>
            </div>
          )}

          {/* Total */}
          <div className="border-t border-gray-700 mt-4 pt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{activeDebts.length} active debt{activeDebts.length !== 1 ? 's' : ''}</span>
            <span className="font-bold text-amber-400 tabular-nums">{fmt(totalDebtBalance)}</span>
          </div>
        </div>
      )}

      {/* Upcoming payments */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg">
        <h2 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <Calendar size={16} /> Upcoming payments (next 7 days)
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-gray-500 text-sm">No payments due in the next 7 days</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map(({ item, type, dueDate }) => {
              const amount = type === 'expense'
                ? (item as Expense).amount
                : (item as Debt).minimumPayment;
              return (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      type === 'debt' ? 'bg-amber-900/40 text-amber-400' : 'bg-blue-900/40 text-blue-400'
                    }`}>
                      {type === 'debt' ? 'Debt' : 'Expense'}
                    </span>
                    <span className="text-gray-200">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400 text-xs">
                      {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="font-medium text-white">{fmt(amount)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Charts */}
      <Charts state={state} />
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-gray-900 rounded-2xl p-5 shadow-lg border border-transparent">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
