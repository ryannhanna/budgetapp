'use client';

import { useState } from 'react';
import { BudgetState, Expense, ExpenseCategory, CATEGORY_COLORS } from '@/lib/types';
import { toBiWeekly, toMonthly, getTotalExpenses, fmt } from '@/lib/calculations';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import ExpenseForm from './ExpenseForm';

interface ExpenseListProps {
  state: BudgetState;
  onAdd: (e: Omit<Expense, 'id'>) => void;
  onUpdate: (e: Expense) => void;
  onDelete: (id: string) => void;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', 'bi-weekly': 'Bi-weekly', monthly: 'Monthly', annual: 'Annual',
};

export default function ExpenseList({ state, onAdd, onUpdate, onDelete }: ExpenseListProps) {
  const { expenses, viewMode } = state;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const normalize = viewMode === 'bi-weekly' ? toBiWeekly : toMonthly;
  const total = getTotalExpenses(expenses, viewMode);

  // Group by category
  const grouped = expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  const toggleCat = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) { next.delete(cat); } else { next.add(cat); }
      return next;
    });
  };

  const openEdit = (e: Expense) => { setEditing(e); setShowForm(true); };

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1">Total expenses ({viewMode === 'bi-weekly' ? 'bi-weekly' : 'monthly'})</p>
          <p className="text-2xl font-bold text-red-400">{fmt(total)}</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No expenses yet</p>
          <p className="text-sm">Add your recurring expenses to track your budget</p>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="mt-4 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
          >
            Add Expense
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.entries(grouped) as [ExpenseCategory, Expense[]][]).map(([cat, items]) => {
            const catTotal = items.reduce((s, e) => s + normalize(e.amount, e.frequency), 0);
            const collapsed = collapsedCats.has(cat);
            const color = CATEGORY_COLORS[cat];
            return (
              <div key={cat} className="bg-gray-900 rounded-2xl shadow-lg overflow-hidden border border-gray-800">
                <button
                  onClick={() => toggleCat(cat)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="font-medium text-gray-100">{cat}</span>
                    <span className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-200">{fmt(catTotal)}</span>
                    {collapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
                  </div>
                </button>
                {!collapsed && (
                  <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                    {items.map(e => (
                      <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors">
                        <div>
                          <p className="text-sm text-gray-200">{e.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {FREQ_LABELS[e.frequency]} · {e.type}
                            {e.dueDay ? ` · Due ${e.dueDay}${ordinal(e.dueDay)}` : ''}
                            {e.dueWeekday ? ` · Due ${e.dueWeekday}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-200">{fmt(e.amount)}</p>
                            <p className="text-xs text-gray-500">{fmt(normalize(e.amount, e.frequency))} / period</p>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => onDelete(e.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ExpenseForm
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
