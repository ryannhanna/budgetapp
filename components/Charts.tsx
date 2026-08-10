'use client';

import { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { BudgetState, CATEGORY_COLORS, ExpenseCategory } from '@/lib/types';
import { toSemiMonthly, toMonthly, getTotalIncome, getTotalExpenses, getTotalDebtMinimums } from '@/lib/calculations';
import { getWeekRanges } from '@/lib/weekUtils';
import { X } from 'lucide-react';

const currencyFmt = (v: unknown) =>
  typeof v === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v) : String(v);
const tooltipStyle = { background: '#111827', border: '1px solid #374151', borderRadius: '8px' };

interface ChartsProps {
  state: BudgetState;
}

export default function Charts({ state }: ChartsProps) {
  const { expenses, debts, incomeStreams, viewMode, weekEntries } = state;
  const normalize = viewMode === 'semi-monthly' ? toSemiMonthly : toMonthly;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  // Items in the selected category, sorted largest → smallest (period-normalized)
  const categoryExpenses = selectedCategory
    ? expenses
        .filter(e => e.category === selectedCategory)
        .sort((a, b) => normalize(b.amount, b.frequency) - normalize(a.amount, a.frequency))
    : [];

  // --- Bar: Income vs Expenses vs Leftover ---
  const totalIncome = getTotalIncome(incomeStreams, viewMode);
  const totalExpenses = getTotalExpenses(expenses, viewMode);
  const debtMonthly = getTotalDebtMinimums(debts);
  const debtPeriod = viewMode === 'semi-monthly' ? debtMonthly / 2 : debtMonthly;
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
    let extraIncome = 0;
    for (const range of ranges) {
      const entry = weekEntries.find(w => w.weekId === range.weekId);
      if (entry) extraIncome += entry.extraIncome;
    }
    const monthlyIncome = getTotalIncome(incomeStreams, 'monthly') + extraIncome;
    const monthlyExpenses = getTotalExpenses(expenses, 'monthly') + debtMonthly;
    lineData.push({ month: monthLabel, leftover: Math.round(monthlyIncome - monthlyExpenses) });
  }

  const periodLabel = viewMode === 'semi-monthly' ? 'period' : 'mo';
  const catColor = selectedCategory
    ? (CATEGORY_COLORS[selectedCategory as ExpenseCategory] ?? '#6b7280')
    : '#6b7280';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pie chart */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Spending by Category</h3>
        {pieData.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No expenses yet</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                  onClick={(data: { name?: string }) => {
                    const name = data?.name ?? null;
                    setSelectedCategory(prev => (prev === name ? null : name));
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={CATEGORY_COLORS[entry.name as ExpenseCategory] ?? '#6b7280'}
                      stroke={selectedCategory === entry.name ? '#ffffff' : 'transparent'}
                      strokeWidth={selectedCategory === entry.name ? 2 : 0}
                      opacity={selectedCategory && selectedCategory !== entry.name ? 0.35 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={currencyFmt} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>

            {/* Category drill-down */}
            {selectedCategory && categoryExpenses.length > 0 && (
              <div className="mt-4 border-t border-gray-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: catColor }}
                    />
                    {selectedCategory}
                  </h4>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="p-1 rounded-md hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label="Clear selection"
                  >
                    <X size={14} />
                  </button>
                </div>

                <ul className="space-y-2">
                  {categoryExpenses.map(e => {
                    const periodAmt = normalize(e.amount, e.frequency);
                    return (
                      <li key={e.id} className="flex items-center justify-between text-sm">
                        <div className="flex flex-col">
                          <span className="text-gray-200">{e.name}</span>
                          <span className="text-xs text-gray-500 capitalize">{e.frequency}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium text-gray-100">
                            {currencyFmt(Math.round(periodAmt))}
                          </span>
                          <span className="text-gray-500 text-xs ml-1">/{periodLabel}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs">
                  <span className="text-gray-400">
                    {categoryExpenses.length} item{categoryExpenses.length !== 1 ? 's' : ''}
                  </span>
                  <span className="font-semibold text-gray-100">
                    {currencyFmt(Math.round(categoryTotals[selectedCategory] ?? 0))}
                    <span className="font-normal text-gray-500 ml-1">/{periodLabel}</span>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bar chart */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg">
        <h3 className="text-sm font-medium text-gray-400 mb-4">
          Income vs Expenses ({viewMode === 'semi-monthly' ? 'Semi-monthly' : 'Monthly'})
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
