'use client';

import { BudgetState } from '@/lib/types';
import {
  getTotalIncome, getTotalExpenses, getTotalDebtMinimums, fmt
} from '@/lib/calculations';
import { getUpcomingPayments } from '@/lib/weekUtils';
import { exportToGoogleSheets } from '@/lib/exportToSheets';
import Charts from './Charts';
import { TrendingUp, TrendingDown, Wallet, CreditCard, Calendar, Download } from 'lucide-react';

interface DashboardProps {
  state: BudgetState;
}

export default function Dashboard({ state }: DashboardProps) {
  const { incomeStreams, expenses, debts, viewMode } = state;

  const totalIncome = getTotalIncome(incomeStreams, viewMode);
  const totalExpenses = getTotalExpenses(expenses, viewMode);
  const debtMonthly = getTotalDebtMinimums(debts);
  const debtPeriod = viewMode === 'bi-weekly' ? (debtMonthly * 12) / 26 : debtMonthly;
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
          label={`Income (${viewMode === 'bi-weekly' ? 'bi-weekly' : 'monthly'})`}
          value={fmt(totalIncome)}
          icon={<TrendingUp size={18} className="text-green-400" />}
          color="text-green-400"
        />
        <SummaryCard
          label={`Expenses (${viewMode === 'bi-weekly' ? 'bi-weekly' : 'monthly'})`}
          value={fmt(totalOut)}
          icon={<TrendingDown size={18} className="text-red-400" />}
          color="text-red-400"
        />
        <SummaryCard
          label={`Net leftover`}
          value={fmt(net)}
          icon={<Wallet size={18} className={net >= 0 ? 'text-green-400' : 'text-red-400'} />}
          color={net >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <SummaryCard
          label="Total debt balance"
          value={fmt(totalDebtBalance)}
          icon={<CreditCard size={18} className="text-amber-400" />}
          color="text-amber-400"
        />
      </div>

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
                ? (item as import('@/lib/types').Expense).amount
                : (item as import('@/lib/types').Debt).minimumPayment;
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
    <div className="bg-gray-900 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
