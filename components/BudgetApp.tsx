'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { BudgetState, Debt, Expense, IncomeStream, SavingsGoal, WeekEntry } from '@/lib/types';
import NavTabs from './NavTabs';
import Dashboard from './Dashboard';
import IncomeSetup from './IncomeSetup';
import ExpenseList from './ExpenseList';
import DebtTracker from './DebtTracker';
import WeeklyView from './WeeklyView';
import SavingsGoals from './SavingsGoals';

const DEFAULT_STATE: BudgetState = {
  incomeStreams: [
    { id: uuid(), name: 'Main Job', amount: 1346, frequency: 'bi-weekly' },
    { id: uuid(), name: 'Side Income', amount: 300, frequency: 'bi-weekly' },
  ],
  expenses: [
    { id: uuid(), name: 'Rent', amount: 1643, category: 'Housing', type: 'fixed', frequency: 'monthly', dueDay: 1 },
    { id: uuid(), name: 'Car Insurance', amount: 260, category: 'Transportation', type: 'fixed', frequency: 'monthly', dueDay: 18 },
    { id: uuid(), name: 'Groceries', amount: 400, category: 'Food & Groceries', type: 'variable', frequency: 'monthly' },
    { id: uuid(), name: 'Gym', amount: 40, category: 'Healthcare', type: 'fixed', frequency: 'monthly' },
    { id: uuid(), name: 'Cell Phone', amount: 130, category: 'Utilities', type: 'fixed', frequency: 'monthly', dueDay: 7 },
    { id: uuid(), name: 'Internet', amount: 70, category: 'Utilities', type: 'fixed', frequency: 'monthly' },
    { id: uuid(), name: 'Electric', amount: 180, category: 'Utilities', type: 'variable', frequency: 'monthly' },
    { id: uuid(), name: 'Entertainment', amount: 120, category: 'Entertainment', type: 'variable', frequency: 'monthly' },
    { id: uuid(), name: 'AMC', amount: 43, category: 'Entertainment', type: 'fixed', frequency: 'monthly', dueDay: 13 },
  ],
  debts: [
    { id: uuid(), name: 'Capital One QS', balance: 3000, minimumPayment: 145, interestRate: 29.99, dueDay: 22, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Capital One QS2', balance: 2000, minimumPayment: 72, interestRate: 27.99, dueDay: 22, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Best Egg', balance: 2400, minimumPayment: 200, interestRate: 18.99, dueDay: 17, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Care Credit', balance: 2700, minimumPayment: 90, interestRate: 26.99, dueDay: 10, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Upstart', balance: 1200, minimumPayment: 111, interestRate: 24.99, dueDay: 21, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Car Payment', balance: 5000, minimumPayment: 372, dueDay: 1, owner: 'me', isPaidOff: false },
  ],
  savingsGoals: [
    { id: uuid(), name: 'Emergency Fund', targetAmount: 10000, currentAmount: 500, color: '#10b981' },
    { id: uuid(), name: 'Vacation', targetAmount: 3000, currentAmount: 0, color: '#6366f1' },
  ],
  payoffStrategy: 'ratio',
  viewMode: 'bi-weekly',
  weekEntries: [],
  activeTab: 'dashboard',
};

const LS_STATE_KEY = 'budget-state';
const LS_VERSION_KEY = 'budget-version';

function lsWrite(state: BudgetState) {
  try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(state)); } catch {}
}
function lsRead(): BudgetState | null {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function lsVersion(): number {
  return parseInt(localStorage.getItem(LS_VERSION_KEY) ?? '-1', 10);
}
function lsWriteVersion(v: number) {
  try { localStorage.setItem(LS_VERSION_KEY, String(v)); } catch {}
}

async function dbGet(): Promise<{ state: BudgetState; version: number } | null> {
  try {
    const res = await fetch('/api/budget', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body?.state) return null;
    return { state: body.state, version: body.version ?? 0 };
  } catch {
    return null;
  }
}

async function dbPut(state: BudgetState): Promise<number | null> {
  try {
    const res = await fetch('/api/budget', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      keepalive: true,
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.version ?? null;
  } catch {
    return null;
  }
}

export default function BudgetApp() {
  const [state, setState] = useState<BudgetState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const lastAppliedVersionRef = useRef(-1);

  // Load on mount: show localStorage immediately, then check DB for changes from other devices.
  useEffect(() => {
    async function load() {
      // Show localStorage instantly — no spinner wait, and survives refresh regardless of DB timing.
      const local = lsRead();
      if (local) {
        setState(local);
        lastAppliedVersionRef.current = lsVersion();
      }
      setHydrated(true);

      // Fetch DB in background. Only apply if DB version is higher, meaning another device saved.
      const result = await dbGet();
      if (!result) return;
      if (result.version > lastAppliedVersionRef.current) {
        // Another device saved something newer — apply it and update localStorage.
        lastAppliedVersionRef.current = result.version;
        lsWrite(result.state);
        lsWriteVersion(result.version);
        setState(result.state);
      } else if (!local) {
        // No localStorage at all (first load) — use DB and populate localStorage.
        lastAppliedVersionRef.current = result.version;
        lsWrite(result.state);
        lsWriteVersion(result.version);
        setState(result.state);
      }
    }
    load();

    // Poll every 10s. Only apply if remoteVersion > lastAppliedVersion.
    const poll = setInterval(async () => {
      const result = await dbGet();
      if (result && result.version > lastAppliedVersionRef.current) {
        lastAppliedVersionRef.current = result.version;
        lsWrite(result.state);
        lsWriteVersion(result.version);
        setState(result.state);
      }
    }, 10_000);

    // Re-fetch when tab becomes visible
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      dbGet().then(result => {
        if (result && result.version > lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = result.version;
          lsWrite(result.state);
          lsWriteVersion(result.version);
          setState(result.state);
        }
      });
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // update() writes to localStorage synchronously (survives refresh instantly),
  // then fires dbPut. Polls call setState directly and never go through update().
  const update = (partial: Partial<BudgetState>) => {
    const next = { ...state, ...partial };
    setState(next);
    lsWrite(next); // synchronous — guaranteed before any refresh
    setSyncStatus('saving');
    dbPut(next).then(version => {
      if (version !== null) {
        lastAppliedVersionRef.current = version;
        lsWriteVersion(version); // record confirmed version so polls don't re-apply our own save
        setSyncStatus('saved');
      } else {
        setSyncStatus('error');
      }
    });
  };

  // --- Income ---
  const addIncome = (stream: Omit<IncomeStream, 'id'>) =>
    update({ incomeStreams: [...state.incomeStreams, { ...stream, id: uuid() }] });
  const updateIncome = (updated: IncomeStream) =>
    update({ incomeStreams: state.incomeStreams.map(s => s.id === updated.id ? updated : s) });
  const deleteIncome = (id: string) =>
    update({ incomeStreams: state.incomeStreams.filter(s => s.id !== id) });

  // --- Expenses ---
  const addExpense = (expense: Omit<Expense, 'id'>) =>
    update({ expenses: [...state.expenses, { ...expense, id: uuid() }] });
  const updateExpense = (updated: Expense) =>
    update({ expenses: state.expenses.map(e => e.id === updated.id ? updated : e) });
  const deleteExpense = (id: string) =>
    update({ expenses: state.expenses.filter(e => e.id !== id) });

  // --- Debts ---
  const addDebt = (debt: Omit<Debt, 'id'>) =>
    update({ debts: [...state.debts, { ...debt, id: uuid() }] });
  const updateDebt = (updated: Debt) =>
    update({ debts: state.debts.map(d => d.id === updated.id ? updated : d) });
  const deleteDebt = (id: string) =>
    update({ debts: state.debts.filter(d => d.id !== id) });
  const toggleDebtPaidOff = (id: string) =>
    update({ debts: state.debts.map(d => d.id === id ? { ...d, isPaidOff: !d.isPaidOff } : d) });

  // --- Savings ---
  const addGoal = (goal: Omit<SavingsGoal, 'id'>) =>
    update({ savingsGoals: [...state.savingsGoals, { ...goal, id: uuid() }] });
  const updateGoal = (updated: SavingsGoal) =>
    update({ savingsGoals: state.savingsGoals.map(g => g.id === updated.id ? updated : g) });
  const deleteGoal = (id: string) =>
    update({ savingsGoals: state.savingsGoals.filter(g => g.id !== id) });

  // --- Week Entries ---
  const upsertWeekEntry = (entry: WeekEntry) => {
    const existing = state.weekEntries.find(w => w.weekId === entry.weekId);
    if (existing) {
      update({ weekEntries: state.weekEntries.map(w => w.weekId === entry.weekId ? entry : w) });
    } else {
      update({ weekEntries: [...state.weekEntries, entry] });
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const sharedProps = { state };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-green-400">Cashmap</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${
                syncStatus === 'saved' ? 'bg-green-500' :
                syncStatus === 'saving' ? 'bg-yellow-400 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className={`text-xs ${syncStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                {syncStatus === 'saved' ? 'Saved' : syncStatus === 'saving' ? 'Saving...' : 'Sync error'}
              </span>
            </div>
            <span className="text-xs text-gray-500">View:</span>
            <button
              onClick={() => update({ viewMode: 'bi-weekly' })}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                state.viewMode === 'bi-weekly'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              Bi-weekly
            </button>
            <button
              onClick={() => update({ viewMode: 'monthly' })}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                state.viewMode === 'monthly'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>
      </header>

      <NavTabs activeTab={state.activeTab} onTabChange={tab => update({ activeTab: tab })} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {state.activeTab === 'dashboard' && (
          <Dashboard {...sharedProps} />
        )}
        {state.activeTab === 'income' && (
          <IncomeSetup
            {...sharedProps}
            onAdd={addIncome}
            onUpdate={updateIncome}
            onDelete={deleteIncome}
          />
        )}
        {state.activeTab === 'expenses' && (
          <ExpenseList
            {...sharedProps}
            onAdd={addExpense}
            onUpdate={updateExpense}
            onDelete={deleteExpense}
          />
        )}
        {state.activeTab === 'debts' && (
          <DebtTracker
            {...sharedProps}
            onAdd={addDebt}
            onUpdate={updateDebt}
            onDelete={deleteDebt}
            onTogglePaidOff={toggleDebtPaidOff}
            onStrategyChange={s => update({ payoffStrategy: s })}
          />
        )}
        {state.activeTab === 'weekly' && (
          <WeeklyView
            {...sharedProps}
            onUpsertEntry={upsertWeekEntry}
          />
        )}
        {state.activeTab === 'savings' && (
          <SavingsGoals
            {...sharedProps}
            onAdd={addGoal}
            onUpdate={updateGoal}
            onDelete={deleteGoal}
          />
        )}
      </main>
    </div>
  );
}
