'use client';

import { useState } from 'react';
import { Expense, ExpenseCategory, ExpenseFrequency, ExpenseType, CATEGORY_COLORS } from '@/lib/types';
import { X, Check } from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = [
  'Housing', 'Transportation', 'Food & Groceries', 'Healthcare',
  'Entertainment', 'Utilities', 'Subscriptions', 'Clothing',
  'Personal Care', 'Education', 'Savings', 'Other',
];
const FREQUENCIES: ExpenseFrequency[] = ['weekly', 'bi-weekly', 'monthly', 'annual'];
const FREQ_LABELS: Record<ExpenseFrequency, string> = {
  weekly: 'Weekly', 'bi-weekly': 'Bi-weekly', monthly: 'Monthly', annual: 'Annual',
};
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type FormData = Omit<Expense, 'id'>;

const EMPTY: FormData = {
  name: '', amount: 0, category: 'Other', type: 'fixed', frequency: 'monthly', startDate: undefined, endDate: undefined,
};

interface ExpenseFormProps {
  initial?: Expense;
  onSave: (data: FormData) => void;
  onCancel: () => void;
}

export default function ExpenseForm({ initial, onSave, onCancel }: ExpenseFormProps) {
  const [form, setForm] = useState<FormData>(
    initial
      ? { name: initial.name, amount: initial.amount, category: initial.category, type: initial.type, frequency: initial.frequency, dueDay: initial.dueDay, dueWeekday: initial.dueWeekday, startDate: initial.startDate, endDate: initial.endDate }
      : EMPTY
  );
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.amount <= 0) e.amount = 'Amount must be greater than 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onKeyDown={e => e.key === 'Escape' && onCancel()}>
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-100">{initial ? 'Edit Expense' : 'Add Expense'}</h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <Field label="Name" error={errors.name}>
            <input autoFocus className="input w-full" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rent" />
          </Field>
          <Field label="Amount" error={errors.amount}>
            <input type="number" min="0" step="0.01" className="input w-full" value={form.amount || ''}
              onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
          </Field>
          <Field label="Category">
            <select className="input w-full" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className="input w-full" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as ExpenseType }))}>
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </Field>
            <Field label="Frequency">
              <select className="input w-full" value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value as ExpenseFrequency, dueDay: undefined, dueWeekday: undefined }))}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </Field>
          </div>
          {/* Due date */}
          {(form.frequency === 'monthly' || form.frequency === 'annual') && (
            <Field label="Due day of month (optional)">
              <input type="number" min="1" max="31" className="input w-full" value={form.dueDay ?? ''}
                onChange={e => setForm(f => ({ ...f, dueDay: e.target.value ? parseInt(e.target.value) : undefined, dueWeekday: undefined }))}
                placeholder="e.g. 15" />
            </Field>
          )}
          {form.frequency === 'weekly' && (
            <Field label="Due weekday (optional)">
              <select className="input w-full" value={form.dueWeekday ?? ''}
                onChange={e => setForm(f => ({ ...f, dueWeekday: e.target.value || undefined, dueDay: undefined }))}>
                <option value="">Any day</option>
                {WEEKDAYS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </Field>
          )}
          {/* Color swatch preview */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: CATEGORY_COLORS[form.category] }}
            />
            {form.category}
          </div>
          <Field label="Start date (optional — expense starts being calculated on this date)">
            <input
              type="date"
              className="input w-full"
              value={form.startDate ?? ''}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value || undefined }))}
            />
          </Field>
          <Field label="End date (optional — expense stops after this date)">
            <input
              type="date"
              className="input w-full"
              value={form.endDate ?? ''}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value || undefined }))}
            />
          </Field>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors">
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
