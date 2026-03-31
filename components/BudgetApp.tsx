'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { BudgetState, Debt, Expense, IncomeStream, SavingsGoal, WeekEntry } from '@/lib/types';
import { loadSavedAt, loadState, saveState } from '@/lib/storage';
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

export default function BudgetApp() {
  const [state, setState] = useState<BudgetState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const hasPendingLocalChangesRef = useRef(false);
  const isRemoteUpdateRef = useRef(false);

  // Load state: fetch DB and localStorage, use whichever is newer.
  // localStorage is stamped with a client timestamp on every save, so it always
  // reflects unsaved-to-DB changes (e.g. refresh before PUT completed).
  // If DB is more than 60s newer than localStorage, DB wins (change from another device).
  useEffect(() => {
    async function load() {
      const localState = loadState();
      const localSavedAt = loadSavedAt();

      let dbState: BudgetState | null = null;
      let dbUpdatedAt = 0;
      try {
        const res = await fetch('/api/budget', { cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          if (body) {
            dbState = body.state ?? null;
            dbUpdatedAt = body.updatedAt ? new Date(body.updatedAt).getTime() : 0;
          }
        }
      } catch { /* DB unavailable */ }

      // Prefer localStorage unless DB is clearly newer (>5s), meaning another device saved.
      // 5s is enough time for our own DB write to complete; anything older means
      // a different device made the change.
      const dbIsNewer = dbState !== null && (dbUpdatedAt - localSavedAt) > 5_000;

      if (dbIsNewer) {
        isRemoteUpdateRef.current = true;
        setState(dbState!);
        saveState(dbState!, dbUpdatedAt);
      } else if (localState) {
        // Mark as remote so save effect doesn't overwrite DB or reset localSavedAt
        isRemoteUpdateRef.current = true;
        setState(localState);
        // Sync local → DB only if DB is missing or genuinely stale
        if (!dbState || localSavedAt > dbUpdatedAt) {
          fetch('/api/budget', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localState),
            keepalive: true,
          }).catch(() => {});
        }
      } else if (dbState) {
        isRemoteUpdateRef.current = true;
        setState(dbState);
        saveState(dbState, dbUpdatedAt || Date.now());
      }
      setHydrated(true);
    }
    load();

    // Poll every 15s and re-fetch on tab focus to pick up changes from other devices.
    // Only apply if DB is >5s newer than localStorage (avoids overwriting unsaved local changes).
    function syncFromDb() {
      if (hasPendingLocalChangesRef.current) return;
      fetch('/api/budget', { cache: 'no-store' })
        .then(res => res.ok ? res.json() : null)
        .then(body => {
          if (body) {
            const remote: BudgetState = body.state ?? body;
            const remoteAt: number = body.updatedAt ? new Date(body.updatedAt).getTime() : 0;
            if ((remoteAt - loadSavedAt()) > 5_000) {
              isRemoteUpdateRef.current = true;
              setState(remote);
              saveState(remote, remoteAt);
            }
          }
        })
        .catch(() => {});
    }

    const pollInterval = setInterval(syncFromDb, 15_000);

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') syncFromDb();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Persist on every change — localStorage immediately, DB immediately with keepalive.
  // keepalive ensures the request completes even if the user refreshes mid-flight.
  // Skip DB write if this state change came from a remote fetch (not a local edit).
  // IMPORTANT: do NOT call saveState for remote updates — callers already stamped
  // localStorage with the correct remote timestamp. Overwriting it with Date.now()
  // would make localSavedAt look fresh and break the cross-device timestamp check.
  useEffect(() => {
    if (!hydrated) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      setSyncStatus('saved');
      return;
    }
    saveState(state);
    hasPendingLocalChangesRef.current = true;
    setSyncStatus('saving');
    fetch('/api/budget', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      keepalive: true,
    })
      .then(async res => {
        hasPendingLocalChangesRef.current = false;
        if (res.ok) {
          setSyncStatus('saved');
        } else {
          const body = await res.json().catch(() => ({}));
          console.error('Sync error:', body.error);
          setSyncStatus('error');
        }
      })
      .catch(() => {
        hasPendingLocalChangesRef.current = false;
        setSyncStatus('error');
      });
  }, [state, hydrated]);

  const update = (partial: Partial<BudgetState>) =>
    setState(prev => ({ ...prev, ...partial }));

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
