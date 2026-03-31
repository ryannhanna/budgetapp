'use client';

import { useState } from 'react';
import { Debt, DebtOwner } from '@/lib/types';
import { X, Check } from 'lucide-react';

type FormData = Omit<Debt, 'id'>;

const EMPTY: FormData = {
  name: '', balance: 0, minimumPayment: 0, interestRate: undefined,
  dueDay: undefined, dueWeekday: undefined, owner: 'me', isPaidOff: false,
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DebtFormProps {
  initial?: Debt;
  onSave: (data: FormData) => void;
  onCancel: () => void;
}

export default function DebtForm({ initial, onSave, onCancel }: DebtFormProps) {
  const [form, setForm] = useState<FormData>(
    initial
      ? { name: initial.name, balance: initial.balance, minimumPayment: initial.minimumPayment, interestRate: initial.interestRate, dueDay: initial.dueDay, dueWeekday: initial.dueWeekday, owner: initial.owner, isPaidOff: initial.isPaidOff }
      : EMPTY
  );
  const [errors, setErrors] = useState<{ name?: string; balance?: string; minimumPayment?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (form.balance < 0) e.balance = 'Balance must be 0 or greater';
    if (form.minimumPayment <= 0) e.minimumPayment = 'Minimum payment must be greater than 0';
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
          <h2 className="font-semibold text-gray-100">{initial ? 'Edit Debt' : 'Add Debt'}</h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <Field label="Name" error={errors.name}>
            <input autoFocus className="input w-full" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Capital One" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current Balance" error={errors.balance}>
              <input type="number" min="0" step="0.01" className="input w-full" value={form.balance || ''}
                onChange={e => setForm(f => ({ ...f, balance: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
            </Field>
            <Field label="Min. Payment" error={errors.minimumPayment}>
              <input type="number" min="0" step="0.01" className="input w-full" value={form.minimumPayment || ''}
                onChange={e => setForm(f => ({ ...f, minimumPayment: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interest Rate % (optional)">
              <input type="number" min="0" step="0.01" className="input w-full" value={form.interestRate ?? ''}
                onChange={e => setForm(f => ({ ...f, interestRate: e.target.value ? parseFloat(e.target.value) : undefined }))} placeholder="e.g. 24.99" />
            </Field>
            <Field label="Due day of month (optional)">
              <input type="number" min="1" max="31" className="input w-full" value={form.dueDay ?? ''}
                onChange={e => setForm(f => ({ ...f, dueDay: e.target.value ? parseInt(e.target.value) : undefined, dueWeekday: undefined }))} placeholder="e.g. 15" />
            </Field>
          </div>
          <Field label="Or due weekday (optional)">
            <select className="input w-full" value={form.dueWeekday ?? ''}
              onChange={e => setForm(f => ({ ...f, dueWeekday: e.target.value || undefined, dueDay: undefined }))}>
              <option value="">None</option>
              {WEEKDAYS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
          <Field label="Owner">
            <select className="input w-full" value={form.owner}
              onChange={e => setForm(f => ({ ...f, owner: e.target.value as DebtOwner }))}>
              <option value="me">Me</option>
              <option value="partner">Partner</option>
              <option value="joint">Joint</option>
            </select>
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
