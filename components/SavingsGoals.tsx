'use client';

import { useState } from 'react';
import { BudgetState, SavingsGoal } from '@/lib/types';
import { getTotalIncome, getTotalExpenses, getTotalDebtMinimums, calculatePayoffTimeline, fmt } from '@/lib/calculations';
import { Plus, Pencil, Trash2, PlusCircle, TrendingUp } from 'lucide-react';
import SavingsGoalForm from './SavingsGoalForm';

interface SavingsGoalsProps {
  state: BudgetState;
  onAdd: (g: Omit<SavingsGoal, 'id'>) => void;
  onUpdate: (g: SavingsGoal) => void;
  onDelete: (id: string) => void;
}

export default function SavingsGoals({ state, onAdd, onUpdate, onDelete }: SavingsGoalsProps) {
  const { savingsGoals, incomeStreams, expenses, debts, viewMode, payoffStrategy } = state;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);

  // Current surplus (only currently-active income/expenses)
  const monthlyIncome = getTotalIncome(incomeStreams, 'monthly');
  const monthlyExpenses = getTotalExpenses(expenses, 'monthly');
  const monthlyDebtMins = getTotalDebtMinimums(debts);
  const monthlyLeftover = Math.max(0, monthlyIncome - monthlyExpenses - monthlyDebtMins);

  // Post-debt-freedom surplus: income & expenses at payoff date, no debt minimums
  const payoffResult = calculatePayoffTimeline(debts, payoffStrategy, monthlyLeftover, 0, incomeStreams, expenses);
  const payoffDate = payoffResult.payoffDate;
  const postDebtMonthlyIncome = payoffDate
    ? getTotalIncome(incomeStreams, 'monthly', payoffDate)
    : getTotalIncome(incomeStreams, 'monthly');
  const postDebtMonthlyExpenses = payoffDate
    ? getTotalExpenses(expenses, 'monthly', payoffDate)
    : getTotalExpenses(expenses, 'monthly');
  // After payoff: all debt minimums freed up
  const postDebtMonthlyLeftover = Math.max(0, postDebtMonthlyIncome - postDebtMonthlyExpenses);

  const periodicLeftover = viewMode === 'semi-monthly' ? monthlyLeftover / 2 : monthlyLeftover;
  const postDebtPeriodicLeftover = viewMode === 'semi-monthly'
    ? postDebtMonthlyLeftover / 2
    : postDebtMonthlyLeftover;

  const addAmount = (goal: SavingsGoal, amount: number) => {
    onUpdate({ ...goal, currentAmount: Math.min(goal.targetAmount, goal.currentAmount + amount) });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-6 flex-wrap">
            <div>
              <p className="text-xs text-gray-400 mb-1">Available now per {viewMode === 'semi-monthly' ? 'paycheck' : 'month'}</p>
              <p className="text-2xl font-bold text-green-400">{fmt(periodicLeftover)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{fmt(monthlyLeftover)}/mo</p>
            </div>
            {postDebtMonthlyLeftover > monthlyLeftover && (
              <div className="border-l border-gray-700 pl-6">
                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                  <TrendingUp size={11} />
                  After debt freedom{payoffDate ? ` (${payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})` : ''}
                </p>
                <p className="text-2xl font-bold text-blue-400">{fmt(postDebtPeriodicLeftover)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{fmt(postDebtMonthlyLeftover)}/mo</p>
              </div>
            )}
          </div>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors flex-shrink-0"
          >
            <Plus size={16} /> Add Goal
          </button>
        </div>
      </div>

      {savingsGoals.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No savings goals yet</p>
          <p className="text-sm">Add a goal to start tracking your progress</p>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="mt-4 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
          >
            Add Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {savingsGoals.map(goal => {
            const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
            const remaining = goal.targetAmount - goal.currentAmount;
            const periodsLabel = viewMode === 'semi-monthly' ? 'paycheck' : 'month';
            const paychecksLeft = periodicLeftover > 0 ? Math.ceil(remaining / periodicLeftover) : null;
            const postDebtPaychecksLeft = postDebtPeriodicLeftover > periodicLeftover
              ? Math.ceil(remaining / postDebtPeriodicLeftover)
              : null;
            const done = goal.currentAmount >= goal.targetAmount;

            return (
              <div key={goal.id} className="bg-gray-900 rounded-2xl p-5 shadow-lg border border-gray-800">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: goal.color }} />
                    <h3 className="font-medium text-gray-100">{goal.name}</h3>
                    {done && <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 font-medium">Done!</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(goal); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => onDelete(goal.id)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: goal.color }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  <span>{fmt(goal.currentAmount)} saved</span>
                  <span>{pct.toFixed(0)}% of {fmt(goal.targetAmount)}</span>
                </div>

                {!done && (
                  <div className="space-y-1 mb-4">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{fmt(remaining)} remaining</span>
                      {paychecksLeft !== null && (
                        <span>~{paychecksLeft} {periodsLabel}{paychecksLeft !== 1 ? 's' : ''} away (now)</span>
                      )}
                    </div>
                    {postDebtPaychecksLeft !== null && (
                      <div className="flex items-center justify-between text-xs text-blue-500/70">
                        <span className="flex items-center gap-1"><TrendingUp size={10} /> After debt freedom</span>
                        <span>~{postDebtPaychecksLeft} {periodsLabel}{postDebtPaychecksLeft !== 1 ? 's' : ''} away</span>
                      </div>
                    )}
                  </div>
                )}

                {!done && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => addAmount(goal, periodicLeftover)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                    >
                      <PlusCircle size={13} /> {fmt(periodicLeftover)} now
                    </button>
                    {postDebtPeriodicLeftover > periodicLeftover && (
                      <button
                        onClick={() => addAmount(goal, postDebtPeriodicLeftover)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-800/30 transition-colors"
                      >
                        <PlusCircle size={13} /> {fmt(postDebtPeriodicLeftover)} post-debt
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <SavingsGoalForm
          initial={editing ?? undefined}
          onSave={data => {
            if (editing) onUpdate({ ...editing, ...data });
            else onAdd(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
