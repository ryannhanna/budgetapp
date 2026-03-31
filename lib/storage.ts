import { BudgetState } from './types';

const KEY = 'budget-app-state';
const TS_KEY = 'budget-app-savedAt';

export function loadState(): BudgetState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BudgetState;
  } catch {
    return null;
  }
}

export function loadSavedAt(): number {
  return parseInt(localStorage.getItem(TS_KEY) ?? '0', 10);
}

export function saveState(state: BudgetState, ts = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(TS_KEY, String(ts));
  } catch {
    // storage quota exceeded — fail silently
  }
}
