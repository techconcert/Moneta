import React, { useState, useMemo, useEffect } from 'react';
import { BankAccount, Transaction, Category, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../lib/currency';
import { isTransferTransaction, computeCashflowBreakdown } from '../lib/transactions';
import { BankLogo } from './BankLogo';
import { groupAccountsByInstitution } from './AccountsTab';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Landmark, CreditCard, PiggyBank,
  ArrowUpRight, ArrowDownRight, RefreshCw, Sparkles, Building2,
  ChevronRight, Search, ShieldCheck, Wallet, Calendar, ArrowRight, ArrowLeftRight
} from 'lucide-react';

interface OverviewTabProps {
  accounts: BankAccount[];
  transactions: Transaction[];
  categories: Category[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onSelectTab: (tab: string) => void;
  onOpenSync: () => void;
  onSelectInflow?: (month: string) => void;
  onSelectOutflow?: (month: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Groceries': '#10B981',
  'Restaurants & Dining': '#F59E0B',
  'Bills & Utilities': '#6366F1',
  'Transportation': '#3B82F6',
  'Shopping': '#EC4899',
  'Subscriptions & Media': '#8B5CF6',
  'Health & Fitness': '#EF4444',
  'Housing & Rent': '#14B8A6',
  'Income & Salary': '#22C55E',
  'Investments & Crypto': '#0EA5E9',
  'Uncategorized': '#94A3B8',
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  accounts,
  transactions,
  categories,
  baseCurrency,
  exchangeRates,
  onSelectTab,
  onOpenSync,
  onSelectInflow,
  onSelectOutflow,
}) => {
  const [txSearch, setTxSearch] = useState('');

  // Default to current month (YYYY-MM)
  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Extract all available months from transactions
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    monthsSet.add(currentMonth);
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        monthsSet.add(tx.date.substring(0, 7));
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [transactions, currentMonth]);

  // Auto-switch to most recent month if current selected month has no transactions
  useEffect(() => {
    if (transactions.length > 0) {
      const hasCurrentMonthTxs = transactions.some((tx) => tx.date && tx.date.startsWith(selectedMonth));
      if (!hasCurrentMonthTxs && selectedMonth !== 'all') {
        const monthsWithTxs = availableMonths.filter((m) => m !== 'all' && transactions.some((tx) => tx.date && tx.date.startsWith(m)));
        if (monthsWithTxs.length > 0) {
          setSelectedMonth(monthsWithTxs[0]);
        }
      }
    }
  }, [transactions, selectedMonth, availableMonths]);

  // Format YYYY-MM to human readable (e.g. 'July 2026')
  const formatMonthLabel = (mKey: string) => {
    if (mKey === 'all') return 'All Time';
    const [year, month] = mKey.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Compute Total Assets, Liabilities, Net Worth in Base Currency
  let totalAssets = 0;
  let totalLiabilities = 0;

  accounts.forEach((acc) => {
    const balance = acc.accountType === 'credit_card' ? acc.balance * -1 : acc.balance;
    const valInBase = convertCurrency(balance, acc.currency, baseCurrency, exchangeRates.rates);
    if (valInBase >= 0) {
      totalAssets += valInBase;
    } else {
      totalLiabilities += Math.abs(valInBase);
    }
  });

  const netWorth = totalAssets - totalLiabilities;

  // Filter transactions for selected month
  const monthTransactions = useMemo(() => {
    if (selectedMonth === 'all') return transactions;
    return transactions.filter((tx) => tx.date && tx.date.startsWith(selectedMonth));
  }, [transactions, selectedMonth]);

  // Compute Cash Flow for selected month strictly distinguishing Inbound Income from Internal Transfers
  const cashflow = useMemo(() => {
    return computeCashflowBreakdown(
      monthTransactions,
      categories,
      baseCurrency,
      exchangeRates.rates
    );
  }, [monthTransactions, categories, baseCurrency, exchangeRates.rates]);

  // Category breakdown for Pie Chart (for selected month - spending only, excluding transfers)
  const categoryTotals: Record<string, number> = {};
  monthTransactions
    .filter((tx) => tx.amount < 0 && !isTransferTransaction(tx, categories))
    .forEach((tx) => {
      const val = convertCurrency(Math.abs(tx.amount), tx.currency, baseCurrency, exchangeRates.rates);
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + val;
    });

  const pieData = Object.entries(categoryTotals)
    .map(([name, value]) => {
      const matchedCat = categories.find(
        (c) => c.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      return {
        name,
        value: Math.round(value * 100) / 100,
        color: matchedCat?.color || CATEGORY_COLORS[name] || '#64748B',
      };
    })
    .sort((a, b) => b.value - a.value);

  // Cash flow chart data - ACTUAL historical monthly totals using transaction data
  const chartData = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().substring(0, 7);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      months.push({ key, label });
    }

    return months.map(({ key, label }) => {
      const txsInMonth = transactions.filter((tx) => tx.date && tx.date.startsWith(key));
      const stats = computeCashflowBreakdown(txsInMonth, categories, baseCurrency, exchangeRates.rates);

      return {
        name: label,
        Income: Math.round(stats.totalInboundIncome * 100) / 100,
        Expenses: Math.round(stats.totalOutflowExpenses * 100) / 100,
      };
    });
  }, [transactions, categories, baseCurrency, exchangeRates]);

  // Filtered recent transactions
  const recentTransactions = monthTransactions
    .filter(
      (tx) =>
        tx.description.toLowerCase().includes(txSearch.toLowerCase()) ||
        tx.category.toLowerCase().includes(txSearch.toLowerCase())
    )
    .slice(0, 8);

  return (
    <div className="space-y-6">
      
      {/* Month Period Selector Banner */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span className="font-bold text-slate-900">Reporting Period:</span>
          <span className="text-slate-500 font-medium">Data calculated live from database records</span>
        </div>

        <div className="flex items-center space-x-2">
          <label htmlFor="overview-month-select" className="text-slate-500 font-semibold">
            Select Month:
          </label>
          <select
            id="overview-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Time</option>
            {availableMonths.map((mKey) => (
              <option key={mKey} value={mKey}>
                {formatMonthLabel(mKey)} {mKey === currentMonth ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Net Worth & Cashflow Hero Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Net Worth Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Net Worth</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {baseCurrency}
              </span>
            </div>
            <div className="mt-3 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {formatCurrency(netWorth, baseCurrency)}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-slate-400 block font-medium">Total Assets</span>
              <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                +{formatCurrency(totalAssets, baseCurrency)}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block font-medium">Liabilities</span>
              <span className="text-sm font-bold text-rose-400 mt-0.5 block">
                -{formatCurrency(totalLiabilities, baseCurrency)}
              </span>
            </div>
          </div>
        </div>

        {/* Monthly Inbound Cash Inflow Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (onSelectInflow) {
              onSelectInflow(selectedMonth);
            } else {
              onSelectTab('transactions');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (onSelectInflow) onSelectInflow(selectedMonth);
              else onSelectTab('transactions');
            }
          }}
          className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
          title="Click to view inbound income transactions for this month"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-emerald-700 transition-colors">
                Monthly Cash Inflow
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 group-hover:bg-emerald-100 transition-all">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 group-hover:text-emerald-600 transition-colors">
              +{formatCurrency(cashflow.totalInboundIncome, baseCurrency)}
            </div>
            <div className="mt-1 flex items-center space-x-1.5 text-xs text-slate-500">
              <span className="font-semibold text-emerald-600">{cashflow.incomeCount} deposit{cashflow.incomeCount === 1 ? '' : 's'}</span>
              <span>• Earned & Inbound income</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="text-emerald-600 font-semibold flex items-center group-hover:underline">
              <span>View list</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </span>
            {cashflow.totalTransfers > 0 ? (
              <span className="text-[11px] text-slate-400 font-medium" title="Internal account transfers are excluded to avoid double-counting">
                Excludes {formatCurrency(cashflow.totalTransfers, baseCurrency)} transfers
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">Zero transfer double-counting</span>
            )}
          </div>
        </div>

        {/* Monthly Expenses Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (onSelectOutflow) {
              onSelectOutflow(selectedMonth);
            } else {
              onSelectTab('transactions');
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (onSelectOutflow) onSelectOutflow(selectedMonth);
              else onSelectTab('transactions');
            }
          }}
          className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-rose-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
          title="Click to view outflow expenses for this month"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-rose-700 transition-colors">
                Monthly Outflow
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 group-hover:bg-rose-100 transition-all">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 group-hover:text-rose-600 transition-colors">
              -{formatCurrency(cashflow.totalOutflowExpenses, baseCurrency)}
            </div>
            <div className="mt-1 flex items-center space-x-1.5 text-xs text-slate-500">
              <span className="font-semibold text-rose-600">{cashflow.expenseCount} expense{cashflow.expenseCount === 1 ? '' : 's'}</span>
              <span>• Spending & bills</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Net Savings:</span>
            <span className={`font-bold ${cashflow.netSavings >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {cashflow.netSavings >= 0 ? '+' : ''}{formatCurrency(cashflow.netSavings, baseCurrency)}
            </span>
          </div>
        </div>
      </div>

      {/* Account Cards Grid (Grouped by Institution Tile) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Connected Accounts & Balances</h3>
            <p className="text-xs text-slate-500">Grouped checking, savings, credit cards, and investments per bank institution</p>
          </div>
          <button
            onClick={() => onSelectTab('accounts')}
            className="flex items-center text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            <span>Manage Integrations</span>
            <ChevronRight className="w-4 h-4 ml-0.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groupAccountsByInstitution(accounts, baseCurrency, exchangeRates.rates).map((group) => {
            const isPlaid = group.provider === 'plaid';
            const isPluggy = group.provider === 'pluggy';

            return (
              <div
                key={group.institutionName}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all shadow-xs flex flex-col justify-between"
              >
                <div>
                  {/* Institution Header with Bank Favicon */}
                  <div className="flex items-start justify-between pb-3 border-b border-slate-200/80">
                    <div className="flex items-center space-x-3">
                      <BankLogo institutionName={group.institutionName} size="md" color={group.color} />
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900">{group.institutionName}</h4>
                        <p className="text-[11px] text-slate-500">
                          {group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isPlaid
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : isPluggy
                        ? 'bg-purple-50 text-purple-600 border-purple-200'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    }`}>
                      {group.provider.toUpperCase()}
                    </span>
                  </div>

                  {/* Accounts list inside tile */}
                  <div className="mt-3 space-y-2.5">
                    {group.accounts.map((acc) => {
                      const displayBalance = acc.accountType === 'credit_card' ? acc.balance * -1 : acc.balance;
                      const isNegative = displayBalance < 0;
                      return (
                        <div key={acc.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-white transition-colors">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                              {acc.accountType === 'credit_card' && <CreditCard className="w-3.5 h-3.5 text-purple-600" />}
                              {acc.accountType === 'savings' && <PiggyBank className="w-3.5 h-3.5 text-emerald-600" />}
                              {acc.accountType === 'investment' && <TrendingUp className="w-3.5 h-3.5 text-sky-600" />}
                              {acc.accountType === 'checking' && <Landmark className="w-3.5 h-3.5 text-blue-600" />}
                              {acc.accountType === 'loan' && <Wallet className="w-3.5 h-3.5 text-amber-600" />}
                            </div>
                            <div className="truncate">
                              <span className="font-bold text-slate-800 block truncate leading-tight">{acc.name}</span>
                              <span className="text-[10px] text-slate-400 block">{acc.mask}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`font-black text-xs block ${isNegative ? 'text-rose-600' : 'text-slate-900'}`}>
                              {formatCurrency(displayBalance, acc.currency)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Institution Total ({baseCurrency})</span>
                  <span className="font-extrabold text-slate-900">
                    {formatCurrency(group.totalInBaseCurrency, baseCurrency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visualizations: Pie Chart & Cash Flow Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Spending breakdown Pie Chart */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900">Spending by Category</h3>
              <span className="text-xs font-semibold text-slate-500">Converted to {baseCurrency}</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Breakdown of recent expenses across all accounts</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: any, name: any) => [formatCurrency(Number(value) || 0, baseCurrency), name]}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    fontSize: '11px',
                    padding: '6px 10px',
                  }}
                  itemStyle={{ fontSize: '11px', padding: '2px 0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Category Legend Grid */}
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
            {pieData.slice(0, 6).map((item) => (
              <div key={item.name} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50">
                <div className="flex items-center space-x-2 truncate mr-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="font-semibold text-slate-700 truncate">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 flex-shrink-0">{formatCurrency(item.value, baseCurrency, true)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cash Flow Bar Chart */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900">Cash Flow History</h3>
              <span className="text-xs font-semibold text-slate-500">Monthly Comparison</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Income vs Expense trends over time</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <RechartsTooltip
                  formatter={(val: any) => [formatCurrency(Number(val) || 0, baseCurrency), '']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="Income" fill="#10B981" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Selected Period Net Savings:</span>
            <span className={`font-bold ${cashflow.netSavings >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {cashflow.netSavings >= 0 ? '+' : ''}{formatCurrency(cashflow.netSavings, baseCurrency)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Transactions Feed */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Recent Transactions</h3>
            <p className="text-xs text-slate-500">Latest financial activities across USD and BRL accounts</p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search description..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-48"
              />
            </div>
            <button
              onClick={() => onSelectTab('transactions')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center"
            >
              <span>View All</span>
              <ChevronRight className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Description</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Account</th>
                <th className="pb-3 font-semibold text-right">Native Amount</th>
                <th className="pb-3 font-semibold text-right">In {baseCurrency}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentTransactions.map((tx) => {
                const isTransfer = isTransferTransaction(tx, categories);
                const isIncome = tx.amount > 0 && !isTransfer;
                const converted = convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates.rates);
                const matchedAccount =
                  accounts.find((a) => a.id === tx.accountId) ||
                  accounts.find((a) => a.name.toLowerCase() === (tx.accountName || '').toLowerCase());
                const institutionName = matchedAccount?.institutionName || tx.accountName || 'Bank';

                return (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 text-slate-500 font-medium whitespace-nowrap">{tx.date}</td>
                    <td className="py-3 font-bold text-slate-900">
                      <div>{tx.description}</div>
                      {isTransfer && (
                        <span className="inline-flex items-center text-[10px] text-slate-500 font-semibold mt-0.5" title="Internal transfer: Excluded from income/expense to prevent double counting">
                          <ArrowLeftRight className="w-2.5 h-2.5 mr-1 text-slate-400" /> Transfer
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                        isTransfer ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        {tx.category}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <BankLogo
                          institutionName={institutionName}
                          size="sm"
                          color={matchedAccount?.color}
                          accountType={matchedAccount?.accountType}
                        />
                        <span className="font-semibold text-slate-800">{tx.accountName}</span>
                      </div>
                    </td>
                    <td className={`py-3 text-right font-bold whitespace-nowrap ${
                      isIncome ? 'text-emerald-600' : isTransfer ? 'text-slate-700' : 'text-slate-900'
                    }`}>
                      {isIncome ? '+' : isTransfer && tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-500 whitespace-nowrap">
                      {formatCurrency(converted, baseCurrency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
