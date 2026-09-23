import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, BankAccount, Category, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../lib/currency';
import { isTransferTransaction, computeCashflowBreakdown } from '../lib/transactions';
import { CategoryIcon } from './CategoryIcon';
import { AddCategoryModal } from './AddCategoryModal';
import { BankLogo } from './BankLogo';
import {
  Search, Plus, Sparkles, Trash2, Edit3,
  Upload, X, Calendar, ChevronLeft, ChevronRight,
  Filter, RotateCcw, ArrowLeftRight, RefreshCw, Copy
} from 'lucide-react';

interface TransactionsTabProps {
  transactions: Transaction[];
  accounts: BankAccount[];
  categories: Category[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onSaveTransaction: (tx: Transaction) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onSaveCategory?: (category: Category) => Promise<void>;
  onBulkCategorizeWithAI: () => Promise<void>;
  isCategorizingWithAI: boolean;
  onOpenImportModal: () => void;
  activeCategoryFilter?: string;
  onClearCategoryFilter?: () => void;
  activeMonthFilter?: string;
  onClearMonthFilter?: () => void;
  activeTypeFilter?: 'all' | 'income' | 'expense' | 'transfer' | 'duplicate';
  onClearTypeFilter?: () => void;
  initialSearchTerm?: string;
  onClearSearchTerm?: () => void;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = ({
  transactions,
  accounts,
  categories,
  baseCurrency,
  exchangeRates,
  onSaveTransaction,
  onDeleteTransaction,
  onSaveCategory,
  onBulkCategorizeWithAI,
  isCategorizingWithAI,
  onOpenImportModal,
  activeCategoryFilter = 'all',
  onClearCategoryFilter,
  activeMonthFilter = 'all',
  onClearMonthFilter,
  activeTypeFilter = 'all',
  onClearTypeFilter,
  initialSearchTerm,
  onClearSearchTerm,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [categoryFilter, setCategoryFilter] = useState(activeCategoryFilter);
  const [accountFilter, setAccountFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer' | 'duplicate'>(activeTypeFilter);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sync category filter if changed from external navigation (e.g. Budget click)
  useEffect(() => {
    if (activeCategoryFilter) {
      setCategoryFilter(activeCategoryFilter);
    }
  }, [activeCategoryFilter]);

  // Sync type filter if passed from external navigation (e.g. Overview inflow/outflow click)
  useEffect(() => {
    if (activeTypeFilter) {
      setTypeFilter(activeTypeFilter);
    }
  }, [activeTypeFilter]);

  // Sync initial search term if navigated with search query (e.g. from Insights subscription click)
  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // Sync month filter to date ranges
  useEffect(() => {
    if (activeMonthFilter && activeMonthFilter !== 'all') {
      setStartDate(`${activeMonthFilter}-01`);
      const [year, month] = activeMonthFilter.split('-');
      const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
      setEndDate(`${activeMonthFilter}-${lastDay}`);
    } else if (activeMonthFilter === 'all') {
      setStartDate('');
      setEndDate('');
    }
  }, [activeMonthFilter]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [pendingTxForNewCategory, setPendingTxForNewCategory] = useState<Transaction | null>(null);

  // Categories sorted alphabetically by name
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [categories]);

  // Accounts sorted alphabetically by institution then account name
  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const labelA = `${a.institutionName || ''} - ${a.name || ''}`;
      const labelB = `${b.institutionName || ''} - ${b.name || ''}`;
      return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
    });
  }, [accounts]);

  // Format category option label with (+), (-), or nothing for neutral
  const getCategoryOptionLabel = (c: Category) => {
    if (c.type === 'expense') return `${c.name} (-)`;
    if (c.type === 'income') return `${c.name} (+)`;
    return c.name;
  };

  // Filter categories based on transaction amount:
  // negative amount (< 0) -> outflow (expense) or neutral (transfer)
  // positive amount (> 0) -> inflow (income) or neutral (transfer)
  const getFilteredCategories = (categoriesList: Category[], amount: number, currentCategoryName?: string) => {
    let filtered = categoriesList;
    if (amount < 0) {
      filtered = categoriesList.filter((c) => c.type === 'expense' || c.type === 'transfer');
    } else if (amount > 0) {
      filtered = categoriesList.filter((c) => c.type === 'income' || c.type === 'transfer');
    }

    if (currentCategoryName && !filtered.some((c) => c.name === currentCategoryName)) {
      const existing = categoriesList.find((c) => c.name === currentCategoryName);
      if (existing) {
        filtered = [...filtered, existing].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
      }
    }

    return filtered;
  };

  // Form state for add/edit
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'expense' | 'income',
    date: new Date().toISOString().split('T')[0],
    accountId: accounts[0]?.id || '',
    category: categories[0]?.name || 'Uncategorized',
    currency: (accounts[0]?.currency || 'USD') as Currency,
    tags: '',
    notes: '',
    isRecurring: false,
    isDuplicate: false,
  });

  const resetPage = () => setCurrentPage(1);

  const handleOpenAddModal = () => {
    setFormData({
      description: '',
      amount: '',
      type: 'expense',
      date: new Date().toISOString().split('T')[0],
      accountId: accounts[0]?.id || '',
      category: categories[0]?.name || 'Groceries',
      currency: accounts[0]?.currency || 'USD',
      tags: 'manual',
      notes: '',
      isRecurring: false,
      isDuplicate: false,
    });
    setEditingTx(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (tx: Transaction) => {
    setEditingTx(tx);
    setFormData({
      description: tx.description,
      amount: Math.abs(tx.amount).toString(),
      type: tx.amount >= 0 ? 'income' : 'expense',
      date: tx.date,
      accountId: tx.accountId,
      category: tx.category,
      currency: tx.currency,
      tags: tx.tags.join(', '),
      notes: tx.notes || '',
      isRecurring: !!tx.isRecurring,
      isDuplicate: !!tx.isDuplicate,
    });
    setIsAddModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(formData.amount);
    if (isNaN(parsedAmount) || !formData.description) return;

    const selectedAcc = accounts.find((a) => a.id === formData.accountId) || accounts[0];
    const finalAmount = formData.type === 'expense' ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);

    const txToSave: Transaction = {
      id: editingTx ? editingTx.id : `tx_manual_${Date.now()}`,
      accountId: selectedAcc.id,
      accountName: selectedAcc.name,
      date: formData.date,
      description: formData.description,
      amount: finalAmount,
      currency: formData.currency,
      category: formData.category,
      tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
      pending: false,
      isRecurring: formData.isRecurring,
      isDuplicate: formData.isDuplicate,
      notes: formData.notes,
      provider: editingTx ? editingTx.provider : 'manual',
      isManualCategory: true,
    };

    await onSaveTransaction(txToSave);
    setIsAddModalOpen(false);
  };

  // Filter logic
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || tx.category.toLowerCase().trim() === categoryFilter.toLowerCase().trim();
    const matchesAccount = accountFilter === 'all' || tx.accountId === accountFilter;
    const matchesCurrency = currencyFilter === 'all' || tx.currency === currencyFilter;

    const isTransfer = isTransferTransaction(tx, categories);

    let matchesType = true;
    if (typeFilter === 'income') {
      matchesType = tx.amount > 0 && !isTransfer && !tx.isDuplicate;
    } else if (typeFilter === 'expense') {
      matchesType = tx.amount < 0 && !isTransfer && !tx.isDuplicate;
    } else if (typeFilter === 'transfer') {
      matchesType = isTransfer && !tx.isDuplicate;
    } else if (typeFilter === 'duplicate') {
      matchesType = !!tx.isDuplicate;
    }

    const matchesStartDate = !startDate || tx.date >= startDate;
    const matchesEndDate = !endDate || tx.date <= endDate;

    return matchesSearch && matchesCategory && matchesAccount && matchesCurrency && matchesType && matchesStartDate && matchesEndDate;
  });

  // Pagination Math
  const totalItems = filteredTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize);

  return (
    <div className="space-y-6">
      
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900">Transactions</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Manage, filter, import, and categorize your financial records</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Import Bank Statement Button (Moved here near top of transactions) */}
          <button
            onClick={onOpenImportModal}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex-shrink-0"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Import Statement (CSV/OFX)</span>
          </button>

          {/* AI Bulk Categorize Button */}
          <button
            onClick={onBulkCategorizeWithAI}
            disabled={isCategorizingWithAI}
            className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isCategorizingWithAI ? 'animate-spin' : ''}`} />
            <span>{isCategorizingWithAI ? 'AI Categorizing...' : 'AI Auto-Categorize'}</span>
          </button>

          {/* Add Manual Transaction Button */}
          <button
            onClick={handleOpenAddModal}
            className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search description, tag, category..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); resetPage(); }}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Date Range Inputs */}
        <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-700 font-medium">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-semibold text-[11px] hidden sm:inline">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); resetPage(); }}
            className="bg-transparent border-0 text-slate-800 font-bold text-xs focus:ring-0 p-0 cursor-pointer"
            title="Start Date"
          />
          <span className="text-slate-400 font-bold px-0.5">–</span>
          <span className="text-slate-400 font-semibold text-[11px] hidden sm:inline">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); resetPage(); }}
            className="bg-transparent border-0 text-slate-800 font-bold text-xs focus:ring-0 p-0 cursor-pointer"
            title="End Date"
          />
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                resetPage();
                if (onClearMonthFilter) onClearMonthFilter();
              }}
              className="ml-1 text-slate-400 hover:text-slate-700 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
              title="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            resetPage();
            if (e.target.value === 'all' && onClearCategoryFilter) onClearCategoryFilter();
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Categories</option>
          {sortedCategories.map((c) => (
            <option key={c.id} value={c.name}>
              {getCategoryOptionLabel(c)}
            </option>
          ))}
        </select>

        {/* Account Filter */}
        <select
          value={accountFilter}
          onChange={(e) => { setAccountFilter(e.target.value); resetPage(); }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Accounts</option>
          {sortedAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.institutionName} - {a.name} ({a.currency})
            </option>
          ))}
        </select>

        {/* Currency Filter */}
        <select
          value={currencyFilter}
          onChange={(e) => { setCurrencyFilter(e.target.value); resetPage(); }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Currencies</option>
          <option value="USD">USD ($)</option>
          <option value="BRL">BRL (R$)</option>
          <option value="EUR">EUR (€)</option>
        </select>

        {/* Type / Income vs Expense vs Transfer Filter */}
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as 'all' | 'income' | 'expense' | 'transfer' | 'duplicate');
            resetPage();
            if (e.target.value === 'all' && onClearTypeFilter) onClearTypeFilter();
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Types</option>
          <option value="income">Inbound Income (+ Inflow)</option>
          <option value="expense">Outflow Expenses (- Spending)</option>
          <option value="transfer">Internal Account Transfers (⇄ Neutral)</option>
          <option value="duplicate">Flagged as Duplicate</option>
        </select>

        {(categoryFilter !== 'all' || accountFilter !== 'all' || currencyFilter !== 'all' || typeFilter !== 'all' || searchTerm || startDate || endDate) && (
          <button
            onClick={() => {
              setSearchTerm('');
              setCategoryFilter('all');
              setAccountFilter('all');
              setCurrencyFilter('all');
              setTypeFilter('all');
              setStartDate('');
              setEndDate('');
              resetPage();
              if (onClearCategoryFilter) onClearCategoryFilter();
              if (onClearMonthFilter) onClearMonthFilter();
              if (onClearTypeFilter) onClearTypeFilter();
            }}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 font-bold transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Filtered Summary Cards */}
      {(() => {
        const stats = computeCashflowBreakdown(filteredTransactions, categories, baseCurrency, exchangeRates.rates);

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <span className="text-slate-400 font-medium block">Matching Records</span>
              <span className="text-sm font-extrabold text-slate-800 mt-0.5 block">
                {filteredTransactions.length} {filteredTransactions.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <span className="text-slate-400 font-medium block flex items-center justify-between">
                <span>Inbound Income</span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">Inflow</span>
              </span>
              <span className="text-sm font-extrabold text-emerald-600 mt-0.5 block">
                +{formatCurrency(stats.totalInboundIncome, baseCurrency)}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <span className="text-slate-400 font-medium block flex items-center justify-between">
                <span>Outflow Expenses</span>
                <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.2 rounded">Spending</span>
              </span>
              <span className="text-sm font-extrabold text-rose-600 mt-0.5 block">
                -{formatCurrency(stats.totalOutflowExpenses, baseCurrency)}
              </span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
              <span className="text-slate-400 font-medium block flex items-center justify-between">
                <span>{typeFilter === 'transfer' ? 'Internal Transfers' : 'Net Savings'}</span>
                {stats.totalTransfers > 0 && typeFilter !== 'transfer' && (
                  <span className="text-[10px] text-slate-500 font-medium" title="Internal transfers excluded from net">
                    ⇄ {formatCurrency(stats.totalTransfers, baseCurrency)}
                  </span>
                )}
              </span>
              <span className={`text-sm font-extrabold mt-0.5 block ${typeFilter === 'transfer' ? 'text-slate-800' : stats.netSavings >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                {typeFilter === 'transfer'
                  ? formatCurrency(stats.totalTransfers, baseCurrency)
                  : `${stats.netSavings >= 0 ? '+' : ''}${formatCurrency(stats.netSavings, baseCurrency)}`}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Description</th>
                <th className="py-3.5 px-4 w-48 min-w-[192px]">Category</th>
                <th className="py-3.5 px-4">Account</th>
                <th className="py-3.5 px-4 text-right">Native Amount</th>
                <th className="py-3.5 px-4 text-right">In {baseCurrency}</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No transactions match your search filters or selected category.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => {
                  const isTransfer = isTransferTransaction(tx, categories);
                  const isIncome = tx.amount > 0 && !isTransfer;
                  const converted = convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates.rates);
                  const expectedType = tx.amount > 0 ? 'income' : tx.amount < 0 ? 'expense' : undefined;
                  const matchedCat =
                    categories.find(
                      (c) => c.name.toLowerCase() === tx.category.toLowerCase() && (expectedType ? c.type === expectedType : true)
                    ) ||
                    categories.find(
                      (c) => c.name.toLowerCase() === tx.category.toLowerCase() && c.type === 'transfer'
                    ) ||
                    categories.find(
                      (c) => c.name.toLowerCase() === tx.category.toLowerCase()
                    );
                  const catColor = matchedCat?.color || '#94A3B8';
                  const rowBgTint = catColor.startsWith('#') && catColor.length === 7 ? `${catColor}14` : 'transparent';

                  const matchedAccount =
                    accounts.find((a) => a.id === tx.accountId) ||
                    accounts.find((a) => a.name.toLowerCase() === (tx.accountName || '').toLowerCase());
                  const institutionName = matchedAccount?.institutionName || tx.accountName || 'Bank';

                  return (
                    <tr
                      key={tx.id}
                      style={{ backgroundColor: rowBgTint }}
                      className="hover:brightness-95 transition-all"
                    >
                      <td
                        style={{ borderLeft: `4px solid ${catColor}` }}
                        className="py-3.5 px-4 font-medium text-slate-500 whitespace-nowrap"
                      >
                        {tx.date}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{tx.description}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {isTransfer && (
                            <span className="inline-flex items-center text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200" title="Internal Account Transfer: Excluded from Income and Expense totals to prevent double-counting">
                              <ArrowLeftRight className="w-2.5 h-2.5 mr-1 text-slate-500" /> Transfer
                            </span>
                          )}
                          {tx.isRecurring && (
                            <span className="inline-flex items-center text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200" title="Recurring charge / subscription">
                              <RefreshCw className="w-2.5 h-2.5 mr-1 text-purple-500" /> Recurring
                            </span>
                          )}
                          {tx.isDuplicate && (
                            <span className="inline-flex items-center text-[10px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200" title="Marked as duplicate transaction">
                              <Copy className="w-2.5 h-2.5 mr-1 text-amber-600" /> Duplicate
                            </span>
                          )}
                          {tx.tags && tx.tags.length > 0 && tx.tags.map((tag, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <select
                          value={tx.category}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (val === '__add_new__') {
                              setPendingTxForNewCategory(tx);
                              setIsAddCatOpen(true);
                            } else {
                              await onSaveTransaction({ ...tx, category: val, isManualCategory: true });
                            }
                          }}
                          style={{
                            borderColor: `${catColor}60`,
                            backgroundColor: `${catColor}25`,
                          }}
                          className="w-48 truncate block px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-900 border hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs"
                        >
                          {getFilteredCategories(sortedCategories, tx.amount, tx.category).map((c) => (
                            <option key={c.id} value={c.name}>
                              {getCategoryOptionLabel(c)}
                            </option>
                          ))}
                          <option value="__add_new__" className="font-bold text-emerald-600 bg-emerald-50">
                            + Add New Category...
                          </option>
                        </select>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center space-x-2.5">
                          <BankLogo
                            institutionName={institutionName}
                            size="sm"
                            color={matchedAccount?.color}
                            accountType={matchedAccount?.accountType}
                          />
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900">{tx.accountName}</span>
                            {matchedAccount?.institutionName &&
                              matchedAccount.institutionName.toLowerCase() !== (tx.accountName || '').toLowerCase() && (
                                <span className="text-[10px] text-slate-400 font-medium leading-tight">
                                  {matchedAccount.institutionName}
                                </span>
                              )}
                          </div>
                        </div>
                      </td>
                      <td className={`py-3.5 px-4 text-right font-bold whitespace-nowrap ${
                        tx.isDuplicate ? 'text-slate-400 line-through' : isIncome ? 'text-emerald-600' : isTransfer ? 'text-slate-700' : 'text-slate-900'
                      }`}>
                        {isIncome ? '+' : isTransfer && tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td className={`py-3.5 px-4 text-right font-semibold whitespace-nowrap ${tx.isDuplicate ? 'text-slate-300 line-through' : 'text-slate-500'}`}>
                        {formatCurrency(converted, baseCurrency)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleOpenEditModal(tx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteTransaction(tx.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="text-slate-900">{totalItems === 0 ? 0 : startIndex + 1}</strong> to{' '}
              <strong className="text-slate-900">{Math.min(startIndex + pageSize, totalItems)}</strong> of{' '}
              <strong className="text-slate-900">{totalItems}</strong> entries
            </span>
            
            <div className="flex items-center space-x-1.5 ml-2">
              <span className="text-slate-500 font-medium">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage <= 1}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="px-2 font-bold text-slate-800">
              Page {validCurrentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage >= totalPages}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Transaction Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingTx ? 'Edit Transaction' : 'Add Manual Transaction'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whole Foods Market"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => {
                      const newType = e.target.value as 'expense' | 'income';
                      const numAmt = parseFloat(formData.amount);
                      const effAmt = newType === 'expense' ? -Math.abs(isNaN(numAmt) ? 1 : numAmt) : Math.abs(isNaN(numAmt) ? 1 : numAmt);
                      const newFiltered = getFilteredCategories(sortedCategories, effAmt);
                      const stillValid = newFiltered.some((c) => c.name === formData.category);
                      setFormData({
                        ...formData,
                        type: newType,
                        category: stillValid ? formData.category : (newFiltered[0]?.name || 'Uncategorized'),
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="expense">Expense (-)</option>
                    <option value="income">Income (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account</label>
                  <select
                    value={formData.accountId}
                    onChange={(e) => {
                      const acc = accounts.find((a) => a.id === e.target.value);
                      setFormData({
                        ...formData,
                        accountId: e.target.value,
                        currency: acc ? acc.currency : formData.currency,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.institutionName} - {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        setIsAddCatOpen(true);
                      } else {
                        setFormData({ ...formData, category: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  >
                    {getFilteredCategories(
                      sortedCategories,
                      formData.type === 'expense'
                        ? -Math.abs(parseFloat(formData.amount) || 1)
                        : Math.abs(parseFloat(formData.amount) || 1),
                      formData.category
                    ).map((c) => (
                      <option key={c.id} value={c.name}>
                        {getCategoryOptionLabel(c)}
                      </option>
                    ))}
                    <option value="__add_new__" className="font-bold text-emerald-600 bg-emerald-50">
                      + Add New Category...
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="BRL">BRL (R$)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. food, organic, vacation"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center space-x-3 p-3 bg-purple-50/60 rounded-xl border border-purple-100 hover:bg-purple-50/80 transition-colors">
                  <input
                    type="checkbox"
                    id="isRecurring"
                    checked={formData.isRecurring}
                    onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="isRecurring" className="text-xs font-semibold text-purple-900 cursor-pointer select-none">
                    Flag as subscription
                  </label>
                </div>

                <div className="flex items-center space-x-3 p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 hover:bg-amber-50/80 transition-colors">
                  <input
                    type="checkbox"
                    id="isDuplicate"
                    checked={formData.isDuplicate}
                    onChange={(e) => setFormData({ ...formData, isDuplicate: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="isDuplicate" className="text-xs font-semibold text-amber-900 cursor-pointer select-none">
                    Mark as duplicate
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/10"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Add New Category Sub-Modal */}
      <AddCategoryModal
        isOpen={isAddCatOpen}
        onClose={() => {
          setIsAddCatOpen(false);
          setPendingTxForNewCategory(null);
        }}
        onSaveCategory={async (newCat) => {
          if (onSaveCategory) {
            await onSaveCategory(newCat);
          }
          setFormData((prev) => ({ ...prev, category: newCat.name }));
          if (pendingTxForNewCategory) {
            await onSaveTransaction({
              ...pendingTxForNewCategory,
              category: newCat.name,
              isManualCategory: true,
            });
            setPendingTxForNewCategory(null);
          }
          setIsAddCatOpen(false);
        }}
      />
    </div>
  );
};
