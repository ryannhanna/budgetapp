'use client';

import { useState } from 'react';
import { BudgetState, SavingsGoal } from '@/lib/types';
import { getTotalIncome, getTotalExpenses, getTotalDebtMinimums, fmt } from '@/lib/calculations';
import { Plus, Pencil, Trash2, PlusCircle } from 'lucide-react';
import SavingsGoalForm from './SavingsGoalForm';

interface SavingsGoalsProps {
  state: BudgetState;
  onAdd: (g: Omit<SavingsGoal, 'id'>) => void;
  onUpdate: (g: SavingsGoal) => void;
  onDelete: (id: string) => void;
}

export default function SavingsGoals({ state, onAdd, onUpdate, onDelete }: SavingsGoalsProps) {
  const { savingsGoals, incomeStreams, expenses, debts, viewMode } = state;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);

  const monthlyIncome = getTotalIncome(incomeStreams, 'monthly');
  const monthlyExpenses = getTotalExpenses(expenses, 'monthly');
  const monthlyDebtMins = getTotalDebtMinimums(debts);
  const monthlyLeftover = Math.max(0, monthlyIncome - monthlyExpenses - monthlyDebtMins);

  const periodicLeftover = viewMode === 'bi-weekly' ? (monthlyLeftover * 12) / 26 : monthlyLeftover;

  const addAmount = (goal: SavingsGoal, amount: number) => {
    onUpdate({ ...goal, currentAmount: Math.min(goal.targetAmount, goal.currentAmount + amount) });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg flex items-center justify-between border border-gray-800">
        <div>
          <p className="text-xs text-gray-400 mb-1">Available per paycheck for savings</p>
          <p className="text-2xl font-bold text-green-400">{fmt(periodicLeftover)}</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
        >
          <Plus size={16} /> Add Goal
        </button>
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
            const paychecksLeft = periodicLeftover > 0 ? Math.ceil(remaining / periodicLeftover) : null;
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
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <span>{fmt(remaining)} remaining</span>
                    {paychecksLeft !== null && (
                      <span>~{paychecksLeft} paycheck{paychecksLeft !== 1 ? 's' : ''} away</span>
                    )}
                  </div>
                )}

                {!done && (
                  <button
                    onClick={() => addAmount(goal, periodicLeftover)}
                    className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    <PlusCircle size={13} /> Add {fmt(periodicLeftover)} (1 paycheck)
                  </button>
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
