# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal budgeting web app modeled after the user's existing Google Sheets workflow. The goal is a polished, interactive replacement — not a generic budget app. The spec is in [readme.md](readme.md).

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (dark mode via `class` strategy, defaulting dark)
- **Charts**: Recharts
- **Icons**: lucide-react
- **IDs**: uuid
- **Persistence**: localStorage only — no backend or database

## Commands

Once initialized, standard Next.js commands apply:

```bash
npm install          # install dependencies
npm run dev          # start dev server
npm run build        # production build
npm run lint         # lint
```

## Architecture

All state lives in `components/BudgetApp.tsx` (root client component). It syncs to a single localStorage key `budget-app-state` on every state change. Sub-components receive state + handlers as props.

```
app/page.tsx
└── components/BudgetApp.tsx        ← all BudgetState, localStorage sync, view mode
    ├── NavTabs.tsx                  ← 6-tab nav
    ├── Dashboard.tsx                ← summary cards, status banner, upcoming payments, charts
    ├── IncomeSetup.tsx
    ├── ExpenseList.tsx + ExpenseForm.tsx
    ├── DebtTracker.tsx + DebtForm.tsx + PayoffTimeline.tsx
    ├── WeeklyView.tsx
    └── SavingsGoals.tsx + SavingsGoalForm.tsx
```

**Shared logic in `lib/`:**
- `types.ts` — all TypeScript interfaces/types
- `calculations.ts` — `toBiWeekly()`, `incomeToBiWeekly()`, `sortByStrategy()`, debt payoff algorithm
- `storage.ts` — localStorage read/write helpers
- `weekUtils.ts` — week range generation, due-date-to-week matching

## Key Patterns

**No hydration errors**: All localStorage reads must happen inside `useEffect`, never during SSR.

**View mode**: A global `viewMode: 'bi-weekly' | 'monthly'` toggle affects every dollar amount in the app. Use `toBiWeekly()` / `toMonthly()` helpers from `lib/calculations.ts` when displaying amounts.

**Frequency normalization**: Expenses and income have different frequency types. Normalize everything through the helpers before comparing or displaying.

**Debt payoff algorithm** (mirrors user's LoanCC spreadsheet tab):
1. Sort active debts by strategy (avalanche = highest APR, snowball = lowest balance, ratio = minimumPayment/balance highest first)
2. Each month: apply (minimum + extra payment) to debt #1; minimums only to the rest
3. On payoff: cascade freed minimum to next debt as extra payment
4. Continue until all debts reach $0

**Weekly View** (mirrors user's monthly spreadsheet tabs): Auto-generate week ranges for a selected month. Assign expenses to weeks by `dueDay` (day of month) or `dueWeekday`. Show income received per week based on paycheck schedule.

## Data Model Summary

`BudgetState` (the single localStorage object):
- `incomeStreams: IncomeStream[]` — multiple sources, each with its own frequency
- `expenses: Expense[]` — recurring expenses (not debts), 13 categories
- `debts: Debt[]` — each with `owner: 'me' | 'partner' | 'joint'`; partner debts get a visual badge
- `savingsGoals: SavingsGoal[]`
- `weekEntries: WeekEntry[]` — tracks which expenses were marked paid each week
- `payoffStrategy: 'avalanche' | 'snowball' | 'ratio'`
- `viewMode: 'bi-weekly' | 'monthly'`

## Styling Conventions

- Page background: `bg-gray-950`; cards: `bg-gray-900 rounded-2xl p-6 shadow-lg`
- Primary text: `text-gray-100`; muted: `text-gray-400`; borders: `border-gray-800`
- Accent/positive: `green-500` / `emerald-500`; danger: `red-500`; warning: `yellow-400`
- Inputs: `bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:ring-2 focus:ring-green-500`
- Primary button: `bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 font-medium`
- Paid-off debts: strikethrough text + muted opacity, collapsed by default
- Currency: always `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`

## Seed Data

On first load, pre-populate with realistic data from the user's actual situation (2 income streams, 9 expenses, 6 debts including a car payment). See `DEFAULT_STATE` in the readme for exact values. Default strategy is `'ratio'`, default view is `'bi-weekly'`.
