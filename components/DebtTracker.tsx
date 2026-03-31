'use client';

import { useState } from 'react';
import { BudgetState, Debt, PayoffStrategy } from '@/lib/types';
import { getTotalDebtMinimums, fmt } from '@/lib/calculations';
import { Plus, Pencil, Trash2, CheckCircle2, Circle } from 'lucide-react';
import DebtForm from './DebtForm';
import PayoffTimeline from './PayoffTimeline';

interface DebtTrackerProps {
  state: BudgetState;
  onAdd: (d: Omit<Debt, 'id'>) => void;
  onUpdate: (d: Debt) => void;
  onDelete: (id: string) => void;
  onTogglePaidOff: (id: string) => void;
  onStrategyChange: (s: PayoffStrategy) => void;
}

export default function DebtTracker({ state, onAdd, onUpdate, onDelete, onTogglePaidOff, onStrategyChange }: DebtTrackerProps) {
  const { debts } = state;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [showPaidOff, setShowPaidOff] = useState(false);

  const activeDebts = debts.filter(d => !d.isPaidOff);
  const paidOffDebts = debts.filter(d => d.isPaidOff);
  const totalBalance = activeDebts.reduce((s, d) => s + d.balance, 0);
  const totalMinimums = getTotalDebtMinimums(debts);

  const openEdit = (d: Debt) => { setEditing(d); setShowForm(true); };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-2xl p-5 shadow-lg border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Total debt</p>
          <p className="text-xl font-bold text-red-400">{fmt(totalBalance)}</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-5 shadow-lg border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Monthly minimums</p>
          <p className="text-xl font-bold text-amber-400">{fmt(totalMinimums)}</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-5 shadow-lg border border-gray-800 sm:col-auto col-span-2">
          <p className="text-xs text-gray-400 mb-1">Active debts</p>
          <p className="text-xl font-bold text-gray-100">{activeDebts.length}</p>
        </div>
      </div>

      {/* Debt list */}
      <div className="bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">Active Debts</h2>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Add Debt
          </button>
        </div>
        {activeDebts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No active debts</p>
            <p className="text-sm">Add your debts to start the payoff calculator</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {activeDebts.map(d => <DebtRow key={d.id} debt={d} onEdit={openEdit} onDelete={onDelete} onToggle={onTogglePaidOff} />)}
          </div>
        )}
      </div>

      {/* Paid-off debts */}
      {paidOffDebts.length > 0 && (
        <div className="bg-gray-900 rounded-2xl shadow-lg border border-gray-800 overflow-hidden">
          <button
            onClick={() => setShowPaidOff(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
          >
            <h2 className="font-semibold text-gray-400">Paid Off ({paidOffDebts.length})</h2>
            <span className="text-xs text-gray-500">{showPaidOff ? 'Hide' : 'Show'}</span>
          </button>
          {showPaidOff && (
            <div className="border-t border-gray-800 divide-y divide-gray-800/50">
              {paidOffDebts.map(d => <DebtRow key={d.id} debt={d} onEdit={openEdit} onDelete={onDelete} onToggle={onTogglePaidOff} />)}
            </div>
          )}
        </div>
      )}

      {/* Payoff Timeline */}
      <div>
        <h2 className="text-base font-semibold text-gray-100 mb-4">Payoff Timeline</h2>
        <PayoffTimeline state={state} onStrategyChange={onStrategyChange} />
      </div>

      {showForm && (
        <DebtForm
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

function DebtRow({ debt, onEdit, onDelete, onToggle }: {
  debt: Debt;
  onEdit: (d: Debt) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors ${debt.isPaidOff ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <button onClick={() => onToggle(debt.id)} className="text-green-500 hover:text-green-400 transition-colors flex-shrink-0">
          {debt.isPaidOff ? <CheckCircle2 size={18} /> : <Circle size={18} className="text-gray-600" />}
        </button>
        <div>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${debt.isPaidOff ? 'line-through text-gray-500' : 'text-gray-200'}`}>{debt.name}</p>
            {debt.owner !== 'me' && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                debt.owner === 'partner' ? 'bg-purple-900/40 text-purple-400' : 'bg-blue-900/40 text-blue-400'
              }`}>
                {debt.owner}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Min: {fmt(debt.minimumPayment)}
            {debt.interestRate ? ` · ${debt.interestRate}% APR` : ''}
            {debt.dueDay ? ` · Due ${debt.dueDay}th` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className={`text-sm font-bold ${debt.isPaidOff ? 'text-green-400' : 'text-red-400'}`}>
            {debt.isPaidOff ? 'Paid off' : fmt(debt.balance)}
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(debt)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onDelete(debt.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
