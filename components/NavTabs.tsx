'use client';

import { LayoutDashboard, TrendingUp, Receipt, CreditCard, CalendarDays, PiggyBank } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'income', label: 'Income', icon: TrendingUp },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'debts', label: 'Debts', icon: CreditCard },
  { id: 'weekly', label: 'Bi-weekly', icon: CalendarDays },
  { id: 'savings', label: 'Savings', icon: PiggyBank },
];

interface NavTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function NavTabs({ activeTab, onTabChange }: NavTabsProps) {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex items-center gap-2 px-4 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-green-500 text-green-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
