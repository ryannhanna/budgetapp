import { BudgetState } from './types';

const KEY = 'budget-app-state';

export function loadState(): BudgetState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BudgetState;
  } catch {
    return null;
  }
}

export function saveState(state: BudgetState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage quota exceeded — fail silently
  }
}
