'use client';

import { useState } from 'react';
import { IncomeStream, PayFrequency, BudgetState } from '@/lib/types';
import { incomeToBiWeekly, incomeToMonthly, getTotalIncome, fmt } from '@/lib/calculations';
import { getNextPayDate } from '@/lib/weekUtils';
import { Plus, Pencil, Trash2, X, Check, Calendar } from 'lucide-react';

interface IncomeSetupProps {
  state: BudgetState;
  onAdd: (s: Omit<IncomeStream, 'id'>) => void;
  onUpdate: (s: IncomeStream) => void;
  onDelete: (id: string) => void;
}

const FREQUENCIES: PayFrequency[] = ['weekly', 'bi-weekly', 'semi-monthly', 'monthly', 'one-time'];
const FREQ_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  'bi-weekly': 'Bi-weekly',
  'semi-monthly': 'Semi-monthly',
  monthly: 'Monthly',
  'one-time': 'One-time',
};

const EMPTY: Omit<IncomeStream, 'id'> = { name: '', amount: 0, frequency: 'bi-weekly', nextPayDate: undefined };

export default function IncomeSetup({ state, onAdd, onUpdate, onDelete }: IncomeSetupProps) {
  const { incomeStreams, viewMode } = state;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<IncomeStream | null>(null);
  const [form, setForm] = useState<Omit<IncomeStream, 'id'>>(EMPTY);
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});

  const totalIncome = getTotalIncome(incomeStreams, viewMode);

  const openAdd = () => {
    setForm(EMPTY);
    setEditing(null);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (s: IncomeStream) => {
    setForm({ name: s.name, amount: s.amount, frequency: s.frequency, nextPayDate: s.nextPayDate });
    setEditing(s);
    setErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.amount <= 0) e.amount = 'Amount must be greater than 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (editing) {
      onUpdate({ ...editing, ...form });
    } else {
      onAdd(form);
    }
    setShowForm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setShowForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1">Total income ({viewMode === 'bi-weekly' ? 'bi-weekly' : 'monthly'})</p>
          <p className="text-2xl font-bold text-green-400">{fmt(totalIncome)}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
        >
          <Plus size={16} /> Add Income
        </button>
      </div>

      {/* Income stream cards */}
      {incomeStreams.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No income streams yet</p>
          <p className="text-sm">Add your first income source to get started</p>
          <button
            onClick={openAdd}
            className="mt-4 bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium transition-colors"
          >
            Add Income Stream
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {incomeStreams.map(s => {
            const bw = incomeToBiWeekly(s.amount, s.frequency);
            const mo = incomeToMonthly(s.amount, s.frequency);
            return (
              <div key={s.id} className="bg-gray-900 rounded-2xl p-5 shadow-lg border border-gray-800">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-gray-100">{s.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDelete(s.id)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-xl font-bold text-green-400 mb-1">{fmt(s.amount)}</p>
                <p className="text-xs text-gray-400 mb-3">{FREQ_LABELS[s.frequency]}</p>
                {s.nextPayDate && s.frequency !== 'one-time' && (() => {
                  const next = getNextPayDate(s, new Date());
                  return next ? (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400 mb-3">
                      <Calendar size={11} />
                      Next pay: {next.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  ) : null;
                })()}
                {s.nextPayDate && s.frequency === 'one-time' && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-400 mb-3">
                    <Calendar size={11} />
                    {new Date(s.nextPayDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
                <div className="border-t border-gray-800 pt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>
                    <span className="block text-gray-500">Bi-weekly</span>
                    <span className="text-gray-300">{fmt(bw)}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500">Monthly</span>
                    <span className="text-gray-300">{fmt(mo)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onKeyDown={handleKeyDown}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-100">{editing ? 'Edit Income' : 'Add Income'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <Field label="Name" error={errors.name}>
                <input
                  autoFocus
                  className="input w-full"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Main Job"
                />
              </Field>
              <Field label="Amount (per period)" error={errors.amount}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input w-full"
                  value={form.amount || ''}
                  onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Frequency">
                <select
                  className="input w-full"
                  value={form.frequency}
                  onChange={e => setForm(f => ({ ...f, frequency: e.target.value as PayFrequency }))}
                >
                  {FREQUENCIES.map(f => (
                    <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={form.frequency === 'one-time' ? 'Payment date' : 'Next pay date'}
                hint={form.frequency !== 'one-time' ? 'Used to pin paychecks to the right week in Weekly View' : undefined}
              >
                <input
                  type="date"
                  className="input w-full"
                  value={form.nextPayDate ?? ''}
                  onChange={e => setForm(f => ({ ...f, nextPayDate: e.target.value || undefined }))}
                />
              </Field>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors">
                Cancel
              </button>
              <button onClick={handleSubmit} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors">
                <Check size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
