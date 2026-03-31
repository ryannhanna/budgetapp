'use client';

import { useState } from 'react';
import { SavingsGoal } from '@/lib/types';
import { X, Check } from 'lucide-react';

type FormData = Omit<SavingsGoal, 'id'>;

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

const EMPTY: FormData = { name: '', targetAmount: 0, currentAmount: 0, color: '#10b981' };

interface SavingsGoalFormProps {
  initial?: SavingsGoal;
  onSave: (data: FormData) => void;
  onCancel: () => void;
}

export default function SavingsGoalForm({ initial, onSave, onCancel }: SavingsGoalFormProps) {
  const [form, setForm] = useState<FormData>(
    initial ? { name: initial.name, targetAmount: initial.targetAmount, currentAmount: initial.currentAmount, color: initial.color } : EMPTY
  );
  const [errors, setErrors] = useState<{ name?: string; targetAmount?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.targetAmount <= 0) e.targetAmount = 'Target must be greater than 0';
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
      <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-800">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-100">{initial ? 'Edit Goal' : 'Add Goal'}</h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <Field label="Name" error={errors.name}>
            <input autoFocus className="input w-full" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Emergency Fund" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target Amount" error={errors.targetAmount}>
              <input type="number" min="0" step="0.01" className="input w-full" value={form.targetAmount || ''}
                onChange={e => setForm(f => ({ ...f, targetAmount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
            </Field>
            <Field label="Current Amount">
              <input type="number" min="0" step="0.01" className="input w-full" value={form.currentAmount || ''}
                onChange={e => setForm(f => ({ ...f, currentAmount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
            </Field>
          </div>
          <Field label="Color">
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
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
