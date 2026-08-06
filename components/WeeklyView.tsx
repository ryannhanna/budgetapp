'use client';

import { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { BudgetState, Expense, Debt, WeekEntry } from '@/lib/types';
import { getSemiMonthlyRanges, getExpensesDueInWeek, getIncomeInWeek } from '@/lib/weekUtils';
import { incomeToSemiMonthly, fmt, sortByStrategy, isExpenseActive, isIncomeActive } from '@/lib/calculations';
import { ChevronLeft, ChevronRight, Lightbulb, CheckCircle2, Pencil, X, Plus, Check } from 'lucide-react';

interface WeeklyViewProps {
  state: BudgetState;
  onUpsertEntry: (entry: WeekEntry) => void;
  onToggleDebtPaidOff: (id: string) => void;
  onPayOffDebtViaSuggestion: (debtId: string, entry: WeekEntry) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function fireConfetti() {
  const end = Date.now() + 2000;
  const colors = ['#22c55e', '#10b981', '#facc15', '#a78bfa', '#38bdf8'];
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// ── Override helpers ──────────────────────────────────────────────────────────

function effectiveAmount(
  entry: WeekEntry,
  itemId: string,
  defaultAmount: number,
): number {
  const ov = entry.itemOverrides?.[itemId];
  return ov?.amount !== undefined ? ov.amount : defaultAmount;
}

function saveOverride(
  entry: WeekEntry,
  itemId: string,
  change: { amount?: number; excluded?: boolean },
  onUpsertEntry: (e: WeekEntry) => void,
) {
  const cur = entry.itemOverrides ?? {};
  const merged = { ...(cur[itemId] ?? {}), ...change };
  // Strip entry if it's a no-op (not excluded, no amount override)
  const clean = merged.excluded
    ? merged
    : merged.amount !== undefined
    ? { amount: merged.amount }
    : undefined;
  let next: typeof cur;
  if (clean) {
    next = { ...cur, [itemId]: clean };
  } else {
    const copy = { ...cur };
    delete copy[itemId];
    next = copy;
  }
  onUpsertEntry({ ...entry, itemOverrides: next });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklyView({ state, onUpsertEntry, onPayOffDebtViaSuggestion }: WeeklyViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  const { expenses, debts, incomeStreams, weekEntries } = state;

  const currentPeriodRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    currentPeriodRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const periods = getSemiMonthlyRanges(year, month);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  let monthTotalIncome = 0;
  let monthTotalExpenses = 0;

  // Pre-compute rolling simulated debt balances applying per-period overrides.
  const simBalsPerPeriod: Map<string, number>[] = [];
  {
    const rolling = new Map(
      debts.filter(d => !d.isPaidOff).map(d => [d.id, d.balance])
    );
    for (const period of periods) {
      simBalsPerPeriod.push(new Map(rolling));
      const pEntry = weekEntries.find(w => w.weekId === period.weekId);
      const paidIds = pEntry?.paidExpenseIds ?? [];
      const ov = pEntry?.itemOverrides ?? {};
      const customItems = pEntry?.customItems ?? [];

      const excludedSet = new Set(
        Object.entries(ov).filter(([, v]) => v.excluded).map(([k]) => k)
      );

      const activeExp = expenses.filter(e => isExpenseActive(e, period.start));
      const periodRentExp = activeExp.filter(e => e.name.toLowerCase() === 'rent' && !excludedSet.has(e.id));
      const periodNonRentExp = activeExp.filter(e => e.name.toLowerCase() !== 'rent' && !excludedSet.has(e.id));

      const due = getExpensesDueInWeek(periodNonRentExp, debts, period.start, period.end);
      const filteredDue = due.filter(({ item }) => !excludedSet.has(item.id));

      const rentPer = periodRentExp.reduce((s, e) => s + (ov[e.id]?.amount ?? e.amount), 0) / 2;
      const dueCost = filteredDue.reduce((s, { item, type }) => {
        const base = type === 'expense' ? (item as Expense).amount : (item as Debt).minimumPayment;
        return s + (ov[item.id]?.amount ?? base);
      }, 0);
      const customCost = customItems.reduce((s, i) => s + i.amount, 0);

      const exactInc = incomeStreams
        .filter(s => s.nextPayDate)
        .reduce((sum, s) => sum + getIncomeInWeek(s, period.start, period.end), 0);
      const periodFallback = incomeStreams
        .filter(s => !s.nextPayDate && s.frequency !== 'one-time' && isIncomeActive(s, period.start))
        .reduce((sum, s) => sum + incomeToSemiMonthly(s.amount, s.frequency), 0);

      const pLeftover = (exactInc + periodFallback + (pEntry?.extraIncome ?? 0)) - (dueCost + rentPer + customCost);
      const periodPaidOff = pEntry?.paidOffDebtIds ?? [];

      if (pLeftover > 0 && periodPaidOff.length === 0) {
        const sorted = sortByStrategy(debts, state.payoffStrategy).filter(d => !paidIds.includes(d.id));
        let rem = pLeftover;
        for (const debt of sorted) {
          if (rem <= 0) break;
          const cur = rolling.get(debt.id) ?? 0;
          if (cur <= 0) continue;
          rolling.set(debt.id, 0);
          rem -= cur;
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="bg-gray-900 rounded-2xl p-5 shadow-lg flex items-center justify-between border border-gray-800">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-100">{MONTH_NAMES[month]} {year}</h2>
          <p className="text-xs text-gray-500 mt-0.5">1st–15th &amp; 16th–end of month</p>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Pay period cards */}
      {periods.map((period, idx) => {
        const entry: WeekEntry = weekEntries.find(w => w.weekId === period.weekId) ?? {
          weekId: period.weekId,
          startDate: period.start.toISOString(),
          endDate: period.end.toISOString(),
          paidExpenseIds: [],
          paidOffDebtIds: [],
          extraIncome: 0,
          notes: '',
          itemOverrides: {},
          customItems: [],
        };

        const ov = entry.itemOverrides ?? {};
        const customItems = entry.customItems ?? [];
        const excludedSet = new Set(
          Object.entries(ov).filter(([, v]) => v.excluded).map(([k]) => k)
        );

        // Filter expenses active for this period's start date, respecting exclusions
        const activeExpenses = expenses.filter(e => isExpenseActive(e, period.start));
        const rentExpenses = activeExpenses.filter(e => e.name.toLowerCase() === 'rent');
        const nonRentExpenses = activeExpenses.filter(e => e.name.toLowerCase() !== 'rent');

        // Non-rent expenses + debts due in this period
        const due = getExpensesDueInWeek(nonRentExpenses, debts, period.start, period.end);

        // Apply per-period exclusions and amount overrides
        const effectiveRent = rentExpenses.filter(e => !excludedSet.has(e.id));
        const effectiveDue  = due.filter(({ item }) => !excludedSet.has(item.id));

        const rentPerPeriod = effectiveRent.reduce((s, e) =>
          s + effectiveAmount(entry, e.id, e.amount), 0) / 2;
        const dueCost = effectiveDue.reduce((s, { item, type }) => {
          const base = type === 'expense' ? (item as Expense).amount : (item as Debt).minimumPayment;
          return s + effectiveAmount(entry, item.id, base);
        }, 0);
        const customCost = customItems.reduce((s, i) => s + i.amount, 0);
        const periodExpenses = rentPerPeriod + dueCost + customCost;

        const exactIncome = incomeStreams
          .filter(s => s.nextPayDate)
          .reduce((sum, s) => sum + getIncomeInWeek(s, period.start, period.end), 0);
        const fallback = incomeStreams
          .filter(s => !s.nextPayDate && s.frequency !== 'one-time' && isIncomeActive(s, period.start))
          .reduce((sum, s) => sum + incomeToSemiMonthly(s.amount, s.frequency), 0);
        const periodIncome = exactIncome + fallback + entry.extraIncome;
        const leftover = periodIncome - periodExpenses;

        monthTotalIncome += periodIncome;
        monthTotalExpenses += periodExpenses;

        const togglePaid = (itemId: string) => {
          const already = entry.paidExpenseIds.includes(itemId);
          onUpsertEntry({
            ...entry,
            paidExpenseIds: already
              ? entry.paidExpenseIds.filter(id => id !== itemId)
              : [...entry.paidExpenseIds, itemId],
          });
        };

        const isCurrentPeriod = now >= period.start && now <= period.end;
        const isEditing = editingWeekId === period.weekId;
        const hasItems = rentExpenses.length > 0 || due.length > 0 || customItems.length > 0;

        return (
          <div
            key={period.weekId}
            ref={isCurrentPeriod ? currentPeriodRef : undefined}
            className={`bg-gray-900 rounded-2xl shadow-lg border overflow-hidden ${
              isCurrentPeriod ? 'border-green-700' : 'border-gray-800'
            }`}
          >
            {/* Period header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Pay Period {idx + 1}</p>
                <h3 className="font-medium text-gray-100">
                  {formatDate(period.start)} – {formatDate(period.end)}
                  {isCurrentPeriod && <span className="ml-2 text-xs text-green-400 font-medium">Current</span>}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setEditingWeekId(isEditing ? null : period.weekId);
                    setNewItemName('');
                    setNewItemAmount('');
                  }}
                  title="Adjust this period"
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    isEditing
                      ? 'bg-blue-900/40 border-blue-700 text-blue-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {isEditing ? <Check size={12} /> : <Pencil size={12} />}
                  {isEditing ? 'Done' : 'Adjust'}
                </button>
                <div className={`text-sm font-bold ${leftover >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {leftover >= 0 ? '+' : ''}{fmt(leftover)}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="px-5 py-3 space-y-1.5">
              {/* Income row */}
              <div className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-400">Income</span>
                <span className="text-green-400 font-medium">{fmt(periodIncome)}</span>
              </div>

              {!hasItems ? (
                <p className="text-xs text-gray-600 py-2">No payments due this period</p>
              ) : (
                <>
                  {/* Rent — split evenly, respecting exclusions & overrides */}
                  {rentExpenses.map(e => {
                    const excluded = excludedSet.has(e.id);
                    const split = effectiveAmount(entry, e.id, e.amount) / 2;
                    const paid = entry.paidExpenseIds.includes(e.id);
                    return (
                      <div key={e.id} className={`flex items-center justify-between text-sm py-1 ${excluded ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={paid && !excluded}
                            disabled={excluded}
                            onChange={() => togglePaid(e.id)}
                            className="w-4 h-4 rounded accent-green-500 cursor-pointer"
                          />
                          <span className={paid && !excluded ? 'line-through text-gray-600' : 'text-gray-300'}>{e.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">÷2</span>
                          {excluded && <span className="text-xs text-yellow-600">skipped</span>}
                        </div>
                        <span className={paid && !excluded ? 'text-gray-600 line-through' : 'text-gray-200'}>{fmt(split)}</span>
                      </div>
                    );
                  })}

                  {/* Non-rent expenses + debt minimums */}
                  {due.map(({ item, type }) => {
                    const base = type === 'expense'
                      ? (item as Expense).amount
                      : (item as Debt).minimumPayment;
                    const excluded = excludedSet.has(item.id);
                    const amount = effectiveAmount(entry, item.id, base);
                    const paid = entry.paidExpenseIds.includes(item.id);
                    return (
                      <div key={item.id} className={`flex items-center justify-between text-sm py-1 ${excluded ? 'opacity-40' : ''}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={paid && !excluded}
                            disabled={excluded}
                            onChange={() => togglePaid(item.id)}
                            className="w-4 h-4 rounded accent-green-500 cursor-pointer"
                          />
                          <span className={paid && !excluded ? 'line-through text-gray-600' : 'text-gray-300'}>{item.name}</span>
                          {type === 'debt' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">Debt</span>
                          )}
                          {excluded && <span className="text-xs text-yellow-600">skipped</span>}
                        </div>
                        <span className={paid && !excluded ? 'text-gray-600 line-through' : 'text-gray-200'}>{fmt(amount)}</span>
                      </div>
                    );
                  })}

                  {/* Custom one-time items */}
                  {customItems.map(ci => {
                    const paid = entry.paidExpenseIds.includes(ci.id);
                    return (
                      <div key={ci.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={paid}
                            onChange={() => togglePaid(ci.id)}
                            className="w-4 h-4 rounded accent-green-500 cursor-pointer"
                          />
                          <span className={paid ? 'line-through text-gray-600' : 'text-gray-300'}>{ci.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">one-time</span>
                        </div>
                        <span className={paid ? 'text-gray-600 line-through' : 'text-gray-200'}>{fmt(ci.amount)}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 text-xs text-gray-500">
              <span>Total expenses: {fmt(periodExpenses)}</span>
              <span className={leftover >= 0 ? 'text-green-400' : 'text-red-400'}>
                Leftover: {leftover >= 0 ? '+' : ''}{fmt(leftover)}
              </span>
            </div>

            {/* ── One-time adjustment panel ─────────────────────────────── */}
            {isEditing && (
              <div className="border-t border-gray-800 px-5 py-4 space-y-4 bg-gray-950/40">
                <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                  <Pencil size={11} /> One-time adjustments — only affects this period
                </p>

                {/* Regular items with toggles + amount overrides */}
                <div className="space-y-2">
                  {rentExpenses.length === 0 && due.length === 0 && (
                    <p className="text-xs text-gray-600">No regular items fall in this period.</p>
                  )}
                  {rentExpenses.map(e => {
                    const excluded = excludedSet.has(e.id);
                    const curAmt = ov[e.id]?.amount ?? e.amount;
                    return (
                      <div key={e.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => saveOverride(entry, e.id, { excluded: !excluded }, onUpsertEntry)}
                          className="w-4 h-4 rounded accent-green-500 cursor-pointer flex-shrink-0"
                          title={excluded ? 'Re-include this item' : 'Skip this item this period'}
                        />
                        <span className={`flex-1 text-sm min-w-0 truncate ${excluded ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                          {e.name} <span className="text-gray-600 text-xs">(÷2)</span>
                        </span>
                        <input
                          type="number"
                          value={curAmt}
                          min={0}
                          disabled={excluded}
                          onChange={ev => saveOverride(entry, e.id, { amount: parseFloat(ev.target.value) || 0 }, onUpsertEntry)}
                          className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-sm text-gray-200 focus:ring-1 focus:ring-blue-600 outline-none disabled:opacity-30"
                        />
                      </div>
                    );
                  })}

                  {due.map(({ item, type }) => {
                    const base = type === 'expense' ? (item as Expense).amount : (item as Debt).minimumPayment;
                    const excluded = excludedSet.has(item.id);
                    const curAmt = ov[item.id]?.amount ?? base;
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={() => saveOverride(entry, item.id, { excluded: !excluded }, onUpsertEntry)}
                          className="w-4 h-4 rounded accent-green-500 cursor-pointer flex-shrink-0"
                          title={excluded ? 'Re-include this item' : 'Skip this item this period'}
                        />
                        <span className={`flex-1 text-sm min-w-0 truncate ${excluded ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                          {item.name}
                          {type === 'debt' && <span className="text-amber-600 text-xs ml-1">(min)</span>}
                        </span>
                        <input
                          type="number"
                          value={curAmt}
                          min={0}
                          disabled={excluded}
                          onChange={ev => saveOverride(entry, item.id, { amount: parseFloat(ev.target.value) || 0 }, onUpsertEntry)}
                          className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-sm text-gray-200 focus:ring-1 focus:ring-blue-600 outline-none disabled:opacity-30"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Custom items already added */}
                {customItems.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-500">Added for this period</p>
                    {customItems.map(ci => (
                      <div key={ci.id} className="flex items-center gap-2">
                        <button
                          onClick={() => onUpsertEntry({ ...entry, customItems: customItems.filter(i => i.id !== ci.id) })}
                          className="text-red-500 hover:text-red-400 flex-shrink-0 transition-colors"
                          title="Remove"
                        >
                          <X size={14} />
                        </button>
                        <span className="flex-1 text-sm text-gray-300 min-w-0 truncate">{ci.name}</span>
                        <input
                          type="number"
                          value={ci.amount}
                          min={0}
                          onChange={ev => onUpsertEntry({
                            ...entry,
                            customItems: customItems.map(i => i.id === ci.id ? { ...i, amount: parseFloat(ev.target.value) || 0 } : i),
                          })}
                          className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-right text-sm text-gray-200 focus:ring-1 focus:ring-blue-600 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Add one-time item */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  <Plus size={14} className="text-gray-500 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Item name"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const amt = parseFloat(newItemAmount);
                        if (!newItemName.trim() || isNaN(amt) || amt <= 0) return;
                        const ci = { id: `custom-${Date.now()}`, name: newItemName.trim(), amount: amt };
                        onUpsertEntry({ ...entry, customItems: [...customItems, ci] });
                        setNewItemName(''); setNewItemAmount('');
                      }
                    }}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:ring-1 focus:ring-blue-600 outline-none min-w-0"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={newItemAmount}
                    min={0}
                    onChange={e => setNewItemAmount(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const amt = parseFloat(newItemAmount);
                        if (!newItemName.trim() || isNaN(amt) || amt <= 0) return;
                        const ci = { id: `custom-${Date.now()}`, name: newItemName.trim(), amount: amt };
                        onUpsertEntry({ ...entry, customItems: [...customItems, ci] });
                        setNewItemName(''); setNewItemAmount('');
                      }
                    }}
                    className="w-24 bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                  <button
                    onClick={() => {
                      const amt = parseFloat(newItemAmount);
                      if (!newItemName.trim() || isNaN(amt) || amt <= 0) return;
                      const ci = { id: `custom-${Date.now()}`, name: newItemName.trim(), amount: amt };
                      onUpsertEntry({ ...entry, customItems: [...customItems, ci] });
                      setNewItemName(''); setNewItemAmount('');
                    }}
                    className="flex-shrink-0 bg-blue-700 hover:bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Surplus debt suggestion */}
            {leftover > 0 && (() => {
              // Only treat a debt as "paid off this period" if it's still isPaidOff —
              // if the user un-marked it in the Debt tab, drop it from the banner.
              const periodPaidOffIds = (entry.paidOffDebtIds ?? [])
                .filter(did => debts.find(d => d.id === did)?.isPaidOff === true);

              const simBals = simBalsPerPeriod[idx];
              // Exclude debts already paid off this period or fully consumed in simulation
              const sorted = sortByStrategy(debts, state.payoffStrategy)
                .filter(d => !entry.paidExpenseIds.includes(d.id))
                .filter(d => !periodPaidOffIds.includes(d.id))
                .filter(d => (simBals.get(d.id) ?? 0) > 0);

              // Only show debts that will actually receive surplus (no "Next up" filler)
              let remaining = leftover;
              const rows = sorted
                .map(debt => {
                  const simBal = simBals.get(debt.id) ?? debt.balance;
                  const surplusAmount = remaining > 0 ? Math.min(remaining, simBal) : 0;
                  const paysOff = surplusAmount > 0 && simBal <= remaining;
                  if (surplusAmount > 0) remaining -= surplusAmount;
                  return { debt, simBal, surplusAmount, paysOff };
                })
                .filter(r => r.surplusAmount > 0);

              if (periodPaidOffIds.length === 0 && rows.length === 0) return null;

              return (
                <div className="px-5 pb-4">
                  <div className="px-4 py-3 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
                    <p className="text-emerald-400 font-semibold text-xs mb-2 flex items-center gap-1.5">
                      <Lightbulb size={12} />
                      Extra Payment Suggestion — {state.payoffStrategy} strategy
                    </p>
                    <div className="space-y-2">
                      {/* Confirmation rows for debts already paid off this period */}
                      {periodPaidOffIds.map(did => {
                        const d = debts.find(db => db.id === did);
                        return d ? (
                          <div key={did} className="flex items-center gap-1.5 text-sm text-emerald-400">
                            <CheckCircle2 size={13} />
                            <span className="font-medium">{d.name}</span>
                            <span className="text-xs text-emerald-600">paid off 🎉</span>
                          </div>
                        ) : null;
                      })}
                      {/* Remaining suggestions */}
                      {rows.map(({ debt, simBal, surplusAmount, paysOff }) => (
                        <div key={debt.id} className="flex items-center justify-between text-sm gap-3">
                          <span className="text-gray-300 min-w-0">
                            {paysOff
                              ? <span className="text-emerald-400">Pay off </span>
                              : <span>Extra to </span>
                            }
                            <span className="font-medium text-gray-100">{debt.name}</span>
                            {paysOff && <span className="text-xs text-gray-500 ml-1">({fmt(simBal)} remaining)</span>}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-emerald-400 font-semibold">{fmt(surplusAmount)}</span>
                            {paysOff && (
                              <button
                                onClick={() => { fireConfetti(); onPayOffDebtViaSuggestion(debt.id, entry); }}
                                className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-2 py-1 font-medium transition-colors"
                              >
                                <CheckCircle2 size={12} /> Paid
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {remaining > 0 && sorted.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        Remaining {fmt(remaining)} goes to savings — all debts covered!
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Monthly rollup */}
      <div className="bg-gray-900 rounded-2xl p-6 shadow-lg border border-green-900/40">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Monthly Rollup — {MONTH_NAMES[month]}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Income</p>
            <p className="text-lg font-bold text-green-400">{fmt(monthTotalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-red-400">{fmt(monthTotalExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Monthly Leftover</p>
            <p className={`text-xl font-bold ${(monthTotalIncome - monthTotalExpenses) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmt(monthTotalIncome - monthTotalExpenses)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
