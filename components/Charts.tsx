'use client';

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { BudgetState, CATEGORY_COLORS } from '@/lib/types';
import { toBiWeekly, toMonthly, getTotalIncome, getTotalExpenses, getTotalDebtMinimums } from '@/lib/calculations';
import { getWeekRanges } from '@/lib/weekUtils';

const currencyFmt = (v: unknown) =>
  typeof v === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v) : String(v);
const tooltipStyle = { background: '#111827', border: '1px solid #374151', borderRadius: '8px' };

interface ChartsProps {
  state: BudgetState;
}

export default function Charts({ state }: ChartsProps) {
  const { expenses, debts, incomeStreams, viewMode, weekEntries } = state;
  const normalize = viewMode === 'bi-weekly' ? toBiWeekly : toMonthly;

  // --- Pie: spending by category ---
  const categoryTotals: Record<string, number> = {};
  for (const e of expenses) {
    const amount = normalize(e.amount, e.frequency);
    categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + amount;
  }
  const pieData = Object.entries(categoryTotals)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // --- Bar: Income vs Expenses vs Leftover ---
  const totalIncome = getTotalIncome(incomeStreams, viewMode);
  const totalExpenses = getTotalExpenses(expenses, viewMode);
  const debtMonthly = getTotalDebtMinimums(debts);
  const debtPeriod = viewMode === 'bi-weekly' ? (debtMonthly * 12) / 26 : debtMonthly;
  const totalOut = totalExpenses + debtPeriod;
  const leftover = totalIncome - totalOut;
  const barData = [
    { name: 'Income', value: Math.round(totalIncome), fill: '#22c55e' },
    { name: 'Expenses', value: Math.round(totalOut), fill: '#ef4444' },
    { name: 'Leftover', value: Math.max(0, Math.round(leftover)), fill: '#6366f1' },
  ];

  // --- Line: monthly leftover trend (last 6 months) ---
  const now = new Date();
  const lineData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
    const ranges = getWeekRanges(d.getFullYear(), d.getMonth());
    // Sum extra income from week entries for this month
    let extraIncome = 0;
    for (const range of ranges) {
      const entry = weekEntries.find(w => w.weekId === range.weekId);
      if (entry) extraIncome += entry.extraIncome;
    }
    const monthlyIncome = getTotalIncome(incomeStreams, 'monthly') + extraIncome;
    const monthlyExpenses = getTotalExpenses(expenses, 'monthly') + debtMonthly;
    lineData.push({ month: monthLabel, leftover: Math.round(monthlyIncome - monthlyExpenses) });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pie chart */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Spending by Category</h3>
        {pieData.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No expenses yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={CATEGORY_COLORS[entry.name as keyof typeof CATEGORY_COLORS] ?? '#6b7280'}
                  />
                ))}
              </Pie>
              <Tooltip formatter={currencyFmt} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bar chart */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg">
        <h3 className="text-sm font-medium text-gray-400 mb-4">
          Income vs Expenses ({viewMode === 'bi-weekly' ? 'Bi-weekly' : 'Monthly'})
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={currencyFmt} contentStyle={tooltipStyle} />
            <Bar dataKey="value">
              {barData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Line chart */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg lg:col-span-2">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Monthly Leftover Trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => `$${v}`} />
            <Tooltip formatter={currencyFmt} contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="leftover" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
