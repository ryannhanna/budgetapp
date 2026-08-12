'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { BudgetState, Debt, Expense, IncomeStream, SavingsGoal, WeekEntry } from '@/lib/types';
import { RefreshCw } from 'lucide-react';
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
    { id: uuid(), name: 'Care Credit', balance: 2700, minimumPayment: 90, interestRate: 26.99, dueDay: 10, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Upstart', balance: 1200, minimumPayment: 111, interestRate: 24.99, dueDay: 21, owner: 'me', isPaidOff: false },
    { id: uuid(), name: 'Car Payment', balance: 5000, minimumPayment: 372, dueDay: 1, owner: 'me', isPaidOff: false },
  ],
  savingsGoals: [
    { id: uuid(), name: 'Emergency Fund', targetAmount: 10000, currentAmount: 500, color: '#10b981' },
    { id: uuid(), name: 'Vacation', targetAmount: 3000, currentAmount: 0, color: '#6366f1' },
  ],
  payoffStrategy: 'ratio',
  viewMode: 'semi-monthly',
  weekEntries: [],
};

const LS_STATE_KEY = 'budget-state';
const LS_VERSION_KEY = 'budget-version';

function lsWrite(state: BudgetState) {
  try { localStorage.setItem(LS_STATE_KEY, JSON.stringify(state)); } catch {}
}
function lsRead(): BudgetState | null {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migrate old 'bi-weekly' viewMode to 'semi-monthly'
    if (parsed?.viewMode === 'bi-weekly') parsed.viewMode = 'semi-monthly';
    return parsed;
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
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.version ?? null;
  } catch {
    return null;
  }
}

const LS_TAB_KEY = 'budget-active-tab';

export default function BudgetApp() {
  const [state, setState] = useState<BudgetState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isSyncing, setIsSyncing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const lastAppliedVersionRef = useRef(-1);
  // Always-current state reference so event handlers never close over a stale snapshot.
  // Updated synchronously at the top of every render — safe to read in callbacks.
  const stateRef = useRef<BudgetState>(DEFAULT_STATE);
  stateRef.current = state;
  // activeTab lives outside BudgetState so DB polls never reset the current tab.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    return localStorage.getItem(LS_TAB_KEY) ?? 'dashboard';
  });

  // Central helper: apply a DB result if it's newer than what we've seen.
  const applyDbResult = useCallback((result: { state: BudgetState; version: number } | null, hasLocal: boolean) => {
    if (!result) return;
    if (result.version > lastAppliedVersionRef.current || (!hasLocal && result.version >= 0)) {
      lastAppliedVersionRef.current = result.version;
      lsWrite(result.state);
      lsWriteVersion(result.version);
      setState(result.state);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load on mount: show localStorage immediately, then open a real-time SSE stream
  // so every change from any other device is pushed here within ~1.5 s.
  useEffect(() => {
    async function load() {
      // Show localStorage instantly — no spinner wait.
      const local = lsRead();
      if (local) {
        setState(local);
        lastAppliedVersionRef.current = lsVersion();
      }
      setHydrated(true);

      // Initial DB fetch — catches anything saved while this device was offline.
      const result = await dbGet();
      applyDbResult(result, !!local);
    }
    load();

    // ── Real-time SSE connection ───────────────────────────────────────────────
    // The server polls Neon every 1.5 s and pushes a new event the moment it sees
    // a version bump — so all devices update almost instantly.
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connectSSE() {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      es?.close();

      const source = new EventSource('/api/budget/stream');
      es = source;

      source.onopen = () => setLiveStatus('live');

      source.onmessage = (e) => {
        try {
          const { version, state: incoming } = JSON.parse(e.data) as {
            version: number;
            state: BudgetState;
          };
          if (version > lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = version;
            lsWrite(incoming);
            lsWriteVersion(version);
            setState(incoming);
          }
        } catch {
          // Ignore malformed events (e.g. heartbeat comments)
        }
      };

      source.onerror = () => {
        setLiveStatus('offline');
        source.close();
        // Reconnect after 3 s — EventSource doesn't auto-reconnect when we close it
        reconnectTimer = setTimeout(connectSSE, 3000);
      };
    }

    connectSSE();

    // When this tab becomes visible again, reconnect SSE (it may have been throttled
    // while hidden) and do one immediate DB fetch to catch up on missed changes.
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      connectSSE();
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
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual "pull latest from DB" — exposed to the header Sync button.
  const forceSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await dbGet();
      if (result && result.version > lastAppliedVersionRef.current) {
        lastAppliedVersionRef.current = result.version;
        lsWrite(result.state);
        lsWriteVersion(result.version);
        setState(result.state);
      }
    } finally {
      setIsSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update() writes to localStorage synchronously (survives refresh instantly),
  // then fires dbPut. Polls call setState directly and never go through update().
  // Uses stateRef.current so it always reads the live state, even if the closure
  // was created in an earlier render (prevents stale-closure overwrites on DB sync).
  const update = useCallback((partial: Partial<BudgetState>) => {
    const next = { ...stateRef.current, ...partial };
    setState(next);
    lsWrite(next); // synchronous — guaranteed before any refresh
    setSyncStatus('saving');
    dbPut(next).then(async version => {
      if (version !== null) {
        lastAppliedVersionRef.current = version;
        lsWriteVersion(version); // record confirmed version so polls don't re-apply our own save
        setSyncStatus('saved');
      } else {
        // First attempt failed — wait 2s and retry once before giving up.
        await new Promise(r => setTimeout(r, 2000));
        const retry = await dbPut(stateRef.current);
        if (retry !== null) {
          lastAppliedVersionRef.current = retry;
          lsWriteVersion(retry);
          setSyncStatus('saved');
        } else {
          setSyncStatus('error');
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All handlers below read from stateRef.current (always live) rather than closing
  // over the state snapshot from the render in which they were created.
  // This prevents a class of stale-closure bugs where a DB poll refreshes state
  // just before a user interaction, and the interaction inadvertently overwrites
  // the polled state when it calls dbPut with the old snapshot.

  // --- Income ---
  const addIncome = (stream: Omit<IncomeStream, 'id'>) =>
    update({ incomeStreams: [...stateRef.current.incomeStreams, { ...stream, id: uuid() }] });
  const updateIncome = (updated: IncomeStream) =>
    update({ incomeStreams: stateRef.current.incomeStreams.map(s => s.id === updated.id ? updated : s) });
  const deleteIncome = (id: string) =>
    update({ incomeStreams: stateRef.current.incomeStreams.filter(s => s.id !== id) });

  // --- Expenses ---
  const addExpense = (expense: Omit<Expense, 'id'>) =>
    update({ expenses: [...stateRef.current.expenses, { ...expense, id: uuid() }] });
  const updateExpense = (updated: Expense) =>
    update({ expenses: stateRef.current.expenses.map(e => e.id === updated.id ? updated : e) });
  const deleteExpense = (id: string) =>
    update({ expenses: stateRef.current.expenses.filter(e => e.id !== id) });

  // --- Debts ---
  const addDebt = (debt: Omit<Debt, 'id'>) =>
    update({ debts: [...stateRef.current.debts, { ...debt, id: uuid() }] });
  const updateDebt = (updated: Debt) =>
    update({ debts: stateRef.current.debts.map(d => d.id === updated.id ? updated : d) });
  const deleteDebt = (id: string) =>
    update({ debts: stateRef.current.debts.filter(d => d.id !== id) });
  const toggleDebtPaidOff = (id: string) => {
    const cur = stateRef.current;
    const debt = cur.debts.find(d => d.id === id);
    const updatedDebts = cur.debts.map(d => d.id === id ? { ...d, isPaidOff: !d.isPaidOff } : d);
    // When un-marking a debt as paid, clear it from paidOffDebtIds in all
    // week entries so the pay period suggestion box shows it again.
    const updatedEntries = debt?.isPaidOff
      ? cur.weekEntries.map(w => ({
          ...w,
          paidOffDebtIds: (w.paidOffDebtIds ?? []).filter(did => did !== id),
        }))
      : cur.weekEntries;
    update({ debts: updatedDebts, weekEntries: updatedEntries });
  };

  // --- Savings ---
  const addGoal = (goal: Omit<SavingsGoal, 'id'>) =>
    update({ savingsGoals: [...stateRef.current.savingsGoals, { ...goal, id: uuid() }] });
  const updateGoal = (updated: SavingsGoal) =>
    update({ savingsGoals: stateRef.current.savingsGoals.map(g => g.id === updated.id ? updated : g) });
  const deleteGoal = (id: string) =>
    update({ savingsGoals: stateRef.current.savingsGoals.filter(g => g.id !== id) });

  // --- Week Entries ---
  // Uses stateRef so concurrent or rapid edits across two devices never overwrite
  // each other's weekEntries due to stale closures.
  const upsertWeekEntry = (entry: WeekEntry) => {
    const curEntries = stateRef.current.weekEntries;
    const existing = curEntries.find(w => w.weekId === entry.weekId);
    if (existing) {
      update({ weekEntries: curEntries.map(w => w.weekId === entry.weekId ? entry : w) });
    } else {
      update({ weekEntries: [...curEntries, entry] });
    }
  };

  // Atomically mark a debt as paid-off AND record it in the week entry so
  // the pay period shows a confirmation instead of cascading to the next debt.
  const payOffDebtViaSuggestion = (debtId: string, entry: WeekEntry, amount: number) => {
    const cur = stateRef.current;
    const updatedDebts = cur.debts.map(d =>
      d.id === debtId ? { ...d, isPaidOff: true } : d
    );
    const updatedEntry: WeekEntry = {
      ...entry,
      paidOffDebtIds: [...(entry.paidOffDebtIds ?? []), debtId],
      // Store the balance at payoff time so leftover stays accurate after re-renders
      paidOffAmounts: { ...(entry.paidOffAmounts ?? {}), [debtId]: amount },
    };
    const updatedEntries = cur.weekEntries.find(w => w.weekId === entry.weekId)
      ? cur.weekEntries.map(w => w.weekId === entry.weekId ? updatedEntry : w)
      : [...cur.weekEntries, updatedEntry];
    update({ debts: updatedDebts, weekEntries: updatedEntries });
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
            {/* Live connection status */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                liveStatus === 'live'
                  ? 'bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.6)]'
                  : liveStatus === 'connecting'
                  ? 'bg-yellow-400 animate-pulse'
                  : 'bg-gray-600'
              }`} />
              <span className={`text-xs ${
                liveStatus === 'live' ? 'text-green-400' :
                liveStatus === 'connecting' ? 'text-yellow-400' :
                'text-gray-500'
              }`}>
                {liveStatus === 'live' ? 'Live' : liveStatus === 'connecting' ? 'Connecting…' : 'Offline'}
              </span>
            </div>
            {/* Save status + manual sync */}
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                syncStatus === 'saved' ? 'bg-gray-600' :
                syncStatus === 'saving' ? 'bg-yellow-400 animate-pulse' :
                'bg-red-500'
              }`} />
              {syncStatus === 'error' && (
                <span className="text-xs text-red-400">Save failed</span>
              )}
              <button
                onClick={forceSync}
                disabled={isSyncing}
                title="Pull latest from server"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
              >
                <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
                Sync
              </button>
            </div>
            <span className="text-xs text-gray-500">View:</span>
            <button
              onClick={() => update({ viewMode: 'semi-monthly' })}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                state.viewMode === 'semi-monthly'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              Semi-monthly
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

      <NavTabs activeTab={activeTab} onTabChange={tab => { setActiveTab(tab); try { localStorage.setItem(LS_TAB_KEY, tab); } catch {} }} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <Dashboard {...sharedProps} />
        )}
        {activeTab === 'income' && (
          <IncomeSetup
            {...sharedProps}
            onAdd={addIncome}
            onUpdate={updateIncome}
            onDelete={deleteIncome}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpenseList
            {...sharedProps}
            onAdd={addExpense}
            onUpdate={updateExpense}
            onDelete={deleteExpense}
          />
        )}
        {activeTab === 'debts' && (
          <DebtTracker
            {...sharedProps}
            onAdd={addDebt}
            onUpdate={updateDebt}
            onDelete={deleteDebt}
            onTogglePaidOff={toggleDebtPaidOff}
            onStrategyChange={s => update({ payoffStrategy: s })}
          />
        )}
        {activeTab === 'weekly' && (
          <WeeklyView
            {...sharedProps}
            onUpsertEntry={upsertWeekEntry}
            onToggleDebtPaidOff={toggleDebtPaidOff}
            onPayOffDebtViaSuggestion={payOffDebtViaSuggestion}
          />
        )}
        {activeTab === 'savings' && (
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
