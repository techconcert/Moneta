import React from 'react';
import { Currency, ExchangeRates } from '../types';
import {
  Wallet,
  RefreshCw,
  Globe,
  LayoutDashboard,
  Receipt,
  Building2,
  TrendingUp,
  PieChart,
  Sparkles,
  Settings,
  Clock
} from 'lucide-react';
// @ts-ignore
import monetaLogo from '../assets/images/moneta_icon.png';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  baseCurrency: Currency;
  setBaseCurrency: (c: Currency) => void;
  exchangeRates: ExchangeRates;
  isSyncing: boolean;
  isFetchingRates?: boolean;
  onSyncAll: () => void;
  onFetchLiveRates?: () => void;
  netWorth: number;
  lastBankSyncTime?: string;
}

function formatShortTime(isoString?: string): string {
  if (!isoString) return 'Just now';
  const date = new Date(isoString);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  baseCurrency,
  setBaseCurrency,
  exchangeRates,
  isSyncing,
  isFetchingRates,
  onSyncAll,
  onFetchLiveRates,
  lastBankSyncTime,
}) => {
  const usdToBrl = exchangeRates.rates['USD_BRL'] || 5.75;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
    { id: 'accounts', label: 'Accounts', icon: Building2 },
    { id: 'investments', label: 'Investments', icon: TrendingUp },
    { id: 'budgets', label: 'Budgets', icon: PieChart },
    { id: 'insights', label: 'Advisor', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-3.5 gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-slate-950 shadow-md shadow-slate-950/20">
              <img
                src={monetaLogo}
                alt="Moneta Logo"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span
                style={{
                  fontFamily: "'Fredoka', sans-serif",
                  fontWeight: 600,
                  color: '#ECEFF1',
                  WebkitTextStroke: '6px #000000',
                  paintOrder: 'stroke fill',
                  letterSpacing: '-0.06em',
                }}
                className="text-2xl sm:text-3xl select-none font-bold block leading-none tracking-tighter"
              >
                MONETA
              </span>
            </div>
          </div>

          {/* Minimalist Sync Timestamps & Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Forex Exchange Rate Badge & Last Sync Time */}
            <div className="flex items-center space-x-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
              <button
                onClick={onFetchLiveRates}
                disabled={isFetchingRates}
                className="flex items-center space-x-1.5 hover:text-emerald-400 transition-colors cursor-pointer group"
                title="Click to refresh live FX rates"
              >
                <Globe className={`w-3.5 h-3.5 text-emerald-400 ${isFetchingRates ? 'animate-spin' : ''}`} />
                <span className="font-semibold">USD/BRL <strong className="text-white">R$ {usdToBrl.toFixed(2)}</strong></span>
                <RefreshCw className={`w-3 h-3 text-slate-400 group-hover:text-emerald-400 ${isFetchingRates ? 'animate-spin' : ''}`} />
              </button>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] text-slate-400 font-medium flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-500 inline mr-0.5" />
                <span>FX {formatShortTime(exchangeRates.lastUpdated)}</span>
              </span>
            </div>

            {/* Bank Sync Status Badge */}
            <div className="flex items-center space-x-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
              <button
                onClick={onSyncAll}
                disabled={isSyncing}
                className="flex items-center space-x-1.5 hover:text-emerald-400 transition-colors cursor-pointer group"
                title="Trigger incremental bank sync"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="font-semibold text-slate-200">{isSyncing ? 'Syncing...' : 'Bank Sync'}</span>
              </button>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] text-slate-400 font-medium">
                {formatShortTime(lastBankSyncTime)}
              </span>
            </div>

            {/* Base Currency Switcher */}
            <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
              <button
                onClick={() => setBaseCurrency('USD')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  baseCurrency === 'USD'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                USD ($)
              </button>
              <button
                onClick={() => setBaseCurrency('BRL')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  baseCurrency === 'BRL'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                BRL (R$)
              </button>
            </div>

          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar border-t border-slate-800/80 pt-2 pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'bg-slate-800 text-emerald-400 border-emerald-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
