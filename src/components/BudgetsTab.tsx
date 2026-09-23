import React, { useState, useEffect, useMemo } from 'react';
import { Budget, Category, Transaction, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../lib/currency';
import { isTransferTransaction } from '../lib/transactions';
import { CategoryIcon } from './CategoryIcon';
import { AddCategoryModal } from './AddCategoryModal';
import {
  Plus, Edit3, Trash2, X, FolderPlus, ArrowRight, Calendar, ArrowDownRight, ArrowUpRight, ArrowLeftRight
} from 'lucide-react';

interface BudgetsTabProps {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onSaveBudget: (budget: Budget) => Promise<void>;
  onDeleteBudget: (budgetId: string) => Promise<void>;
  onSaveCategory: (category: Category, oldName?: string) => Promise<void>;
  onDeleteCategory: (categoryId: string) => Promise<void>;
  onSelectCategoryForTransactions?: (categoryName: string, month: string) => void;
}

export const BudgetsTab: React.FC<BudgetsTabProps> = ({
  budgets,
  categories,
  transactions,
  baseCurrency,
  exchangeRates,
  onSaveBudget,
  onDeleteBudget,
  onSaveCategory,
  onDeleteCategory,
  onSelectCategoryForTransactions,
}) => {
  const [isAddBudgetOpen, setIsAddBudgetOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Month filtering state (defaults to current month YYYY-MM)
  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Extract unique available months from transactions
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [categories]);

  const { expenseCategories, incomeCategories, neutralCategories } = useMemo(() => {
    const expense: Category[] = [];
    const income: Category[] = [];
    const neutral: Category[] = [];

    sortedCategories.forEach((c) => {
      if (c.type === 'expense') {
        expense.push(c);
      } else if (c.type === 'income') {
        income.push(c);
      } else {
        neutral.push(c);
      }
    });

    return {
      expenseCategories: expense,
      incomeCategories: income,
      neutralCategories: neutral,
    };
  }, [sortedCategories]);

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

  const formatMonthLabel = (mKey: string) => {
    if (mKey === 'all') return 'All Time';
    const [year, month] = mKey.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Budget form state
  const [budgetCat, setBudgetCat] = useState(categories[0]?.name || 'Groceries');
  const [budgetLimit, setBudgetLimit] = useState('');

  useEffect(() => {
    if (categories.length > 0 && !budgetCat) {
      setBudgetCat(categories[0].name);
    }
  }, [categories, budgetCat]);

  const handleOpenAddBudget = () => {
    setEditingBudget(null);
    setBudgetCat(sortedCategories[0]?.name || 'Groceries');
    setBudgetLimit('500');
    setIsAddBudgetOpen(true);
  };

  const handleOpenEditBudget = (b: Budget) => {
    setEditingBudget(b);
    setBudgetCat(b.category);
    setBudgetLimit(b.monthlyLimit.toString());
    setIsAddBudgetOpen(true);
  };

  const handleSaveBudgetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(budgetLimit);
    if (isNaN(limit) || limit <= 0) return;

    const budgetToSave: Budget = {
      id: editingBudget ? editingBudget.id : `b_${budgetCat.toLowerCase().replace(/\s+/g, '_')}`,
      category: budgetCat,
      monthlyLimit: limit,
      currency: baseCurrency,
    };

    await onSaveBudget(budgetToSave);
    setIsAddBudgetOpen(false);
    setEditingBudget(null);
    setBudgetLimit('');
  };

  // Compute spent amount per budget category in Base Currency for selected month
  const categorySpentMap: Record<string, number> = {};
  transactions
    .filter((tx) => tx.amount < 0 && !isTransferTransaction(tx, categories) && !tx.isDuplicate && (selectedMonth === 'all' || (tx.date && tx.date.startsWith(selectedMonth))))
    .forEach((tx) => {
      const valInBase = convertCurrency(Math.abs(tx.amount), tx.currency, baseCurrency, exchangeRates.rates);
      const catKey = tx.category.trim().toLowerCase();
      categorySpentMap[catKey] = (categorySpentMap[catKey] || 0) + valInBase;
    });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Monthly Budgets & Category Manager</h2>
          <p className="text-xs text-slate-500">Track spending limits, click any category to view transactions, and configure custom categories</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setEditingCategory(null);
              setIsAddCatOpen(true);
            }}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
          >
            <FolderPlus className="w-4 h-4 text-emerald-400" />
            <span>New Category</span>
          </button>

          <button
            onClick={handleOpenAddBudget}
            className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>Set Budget Goal</span>
          </button>
        </div>
      </div>

      {/* Budget Progress Bars */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Category Monthly Limits ({baseCurrency})</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click a category card to inspect transactions</p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-500 font-semibold">Budget Month:</span>
            <select
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

        {budgets.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No budget goals set yet. Click "Set Budget Goal" above to create one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {budgets.map((b) => {
              const limitInBase = convertCurrency(b.monthlyLimit, b.currency, baseCurrency, exchangeRates.rates);
              const spent = categorySpentMap[b.category.trim().toLowerCase()] || 0;
              const realPercentage = Math.round((spent / limitInBase) * 100);
              const barPercentage = Math.min(realPercentage, 100);

              let statusColor = 'bg-emerald-500';
              let statusBadge = 'text-emerald-600 bg-emerald-50 border-emerald-200';

              if (realPercentage >= 90) {
                statusColor = 'bg-rose-500';
                statusBadge = 'text-rose-600 bg-rose-50 border-rose-200';
              } else if (realPercentage >= 75) {
                statusColor = 'bg-amber-500';
                statusBadge = 'text-amber-600 bg-amber-50 border-amber-200';
              }

              const matchedCat = categories.find((c) => c.name.toLowerCase() === b.category.toLowerCase());

              return (
                <div
                  key={b.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 relative hover:border-emerald-300 transition-all shadow-2xs group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <button
                      onClick={() => onSelectCategoryForTransactions && onSelectCategoryForTransactions(b.category, selectedMonth)}
                      className="flex items-center space-x-2.5 font-bold text-slate-900 text-sm hover:text-emerald-600 transition-colors cursor-pointer text-left"
                      title="View all transactions for this category"
                    >
                      <div
                        className="p-1.5 rounded-lg text-white shadow-xs shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: matchedCat?.color || '#10B981' }}
                      >
                        <CategoryIcon name={b.category} iconName={matchedCat?.icon} className="w-4 h-4 text-white" />
                      </div>
                      <span className="underline decoration-slate-200 underline-offset-4 group-hover:decoration-emerald-500">{b.category}</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-emerald-600 transition-opacity" />
                    </button>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${statusBadge}`}>
                        {realPercentage}% Spent
                      </span>
                      {matchedCat && (
                        <button
                          onClick={() => {
                            setEditingCategory(matchedCat);
                            setIsAddCatOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="Edit Category Details (Name, Icon, Color)"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEditBudget(b)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
                        title="Edit Budget Amount"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteBudget(b.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Remove Budget Goal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full ${statusColor} transition-all duration-500 rounded-full`}
                      style={{ width: `${barPercentage}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-slate-500 pt-1 font-medium">
                    <span>Spent: <strong className="text-slate-900">{formatCurrency(spent, baseCurrency)}</strong></span>
                    <span>Limit: <strong className="text-slate-900">{formatCurrency(limitInBase, baseCurrency)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Categories Grid - Grouped by Expenses, Income, Neutral/Transfer */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Configured Categories & Icons ({categories.length})</h3>
            <p className="text-xs text-slate-500 mt-0.5">Grouped into Expenses (-), Income (+), and Neutral / Transfers</p>
          </div>
          <button
            onClick={() => {
              setEditingCategory(null);
              setIsAddCatOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Category</span>
          </button>
        </div>

        {/* Expenses Group */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600">
              <ArrowDownRight className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800">
              Expenses (-) <span className="text-slate-400 font-normal">({expenseCategories.length})</span>
            </h4>
          </div>

          {expenseCategories.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2 pl-2">No expense categories configured.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {expenseCategories.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectCategoryForTransactions && onSelectCategoryForTransactions(c.name)}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-emerald-300 hover:bg-slate-50/80 transition-all shadow-2xs group cursor-pointer"
                  title={`View ${c.name} transactions`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0"
                      style={{ backgroundColor: c.color || '#10B981' }}
                    >
                      <CategoryIcon name={c.name} iconName={c.icon} className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-900 block line-clamp-2 break-words leading-snug group-hover:text-emerald-600 transition-colors">{c.name}</span>
                      <span className="text-[10px] text-slate-400 capitalize block mt-0.5">{c.type}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategory(c);
                        setIsAddCatOpen(true);
                      }}
                      className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                      title="Edit category details (name, icon, color)"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(c.id);
                      }}
                      className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                      title="Remove category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Income Group */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Income (+) <span className="text-slate-400 font-normal">({incomeCategories.length})</span>
            </h4>
          </div>

          {incomeCategories.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2 pl-2">No income categories configured.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {incomeCategories.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectCategoryForTransactions && onSelectCategoryForTransactions(c.name)}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-emerald-300 hover:bg-slate-50/80 transition-all shadow-2xs group cursor-pointer"
                  title={`View ${c.name} transactions`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0"
                      style={{ backgroundColor: c.color || '#10B981' }}
                    >
                      <CategoryIcon name={c.name} iconName={c.icon} className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-900 block line-clamp-2 break-words leading-snug group-hover:text-emerald-600 transition-colors">{c.name}</span>
                      <span className="text-[10px] text-slate-400 capitalize block mt-0.5">{c.type}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategory(c);
                        setIsAddCatOpen(true);
                      }}
                      className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                      title="Edit category details (name, icon, color)"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(c.id);
                      }}
                      className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                      title="Remove category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Neutral / Transfer Group */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Neutral / Transfers <span className="text-slate-400 font-normal">({neutralCategories.length})</span>
            </h4>
          </div>

          {neutralCategories.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2 pl-2">No neutral or transfer categories configured.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {neutralCategories.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelectCategoryForTransactions && onSelectCategoryForTransactions(c.name)}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between bg-white hover:border-emerald-300 hover:bg-slate-50/80 transition-all shadow-2xs group cursor-pointer"
                  title={`View ${c.name} transactions`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0"
                      style={{ backgroundColor: c.color || '#10B981' }}
                    >
                      <CategoryIcon name={c.name} iconName={c.icon} className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-900 block line-clamp-2 break-words leading-snug group-hover:text-emerald-600 transition-colors">{c.name}</span>
                      <span className="text-[10px] text-slate-400 capitalize block mt-0.5">{c.type}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategory(c);
                        setIsAddCatOpen(true);
                      }}
                      className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                      title="Edit category details (name, icon, color)"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCategory(c.id);
                      }}
                      className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                      title="Remove category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Set / Edit Budget Modal */}
      {isAddBudgetOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingBudget ? 'Edit Monthly Budget Goal' : 'Set Monthly Budget Goal'}
              </h3>
              <button onClick={() => setIsAddBudgetOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBudgetSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">Select Category</label>
                  <button
                    type="button"
                    onClick={() => {
                      const selected = categories.find((c) => c.name === budgetCat);
                      if (selected) {
                        setEditingCategory(selected);
                        setIsAddCatOpen(true);
                      }
                    }}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Category Details</span>
                  </button>
                </div>
                <select
                  disabled={!!editingBudget}
                  value={budgetCat}
                  onChange={(e) => setBudgetCat(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 font-bold"
                >
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Monthly Limit ({baseCurrency})</label>
                <input
                  type="number"
                  step="10"
                  required
                  placeholder="e.g. 500"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddBudgetOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md"
                >
                  {editingBudget ? 'Update Limit' : 'Save Budget Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      <AddCategoryModal
        isOpen={isAddCatOpen}
        onClose={() => {
          setIsAddCatOpen(false);
          setEditingCategory(null);
        }}
        editingCategory={editingCategory}
        onSaveCategory={async (cat, oldName) => {
          await onSaveCategory(cat, oldName);
          setIsAddCatOpen(false);
          setEditingCategory(null);
        }}
      />
    </div>
  );
};
