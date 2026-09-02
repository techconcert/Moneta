import React, { useState, useMemo, useEffect } from 'react';
import { BankAccount, Category, Currency, Transaction, AccountType } from '../types';
import { parseFinancialFile, ParsedImportResult, isAutomaticSweepTransfer } from '../lib/parsers';
import { formatCurrency, convertCurrency } from '../lib/currency';
import { CategoryIcon } from './CategoryIcon';
import { safeJsonFetch } from '../lib/api';
import {
  Upload, X, Check, AlertTriangle, Sparkles, ArrowRight, ShieldCheck,
  Building2, CheckCircle2, RotateCcw, Filter, FileText, ChevronRight, Layers, Plus, Tag
} from 'lucide-react';

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  existingTransactions: Transaction[];
  categories: Category[];
  baseCurrency: Currency;
  exchangeRates: Record<string, number>;
  onSaveAccount: (account: BankAccount) => Promise<void>;
  onSaveCategory?: (category: Category) => Promise<void>;
  onSaveTransactions: (txs: Transaction[]) => Promise<void>;
  onSuccessNavigate?: (tab: 'transactions' | 'budgets' | 'accounts') => void;
}

export interface ImportItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: Currency;
  category: string;
  selected: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
  categorySource: 'rule' | 'prior_data' | 'ai' | 'user';
  externalId?: string;
  isSweepTransfer?: boolean;
}

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  isOpen,
  onClose,
  accounts,
  existingTransactions,
  categories,
  baseCurrency,
  exchangeRates,
  onSaveAccount,
  onSaveCategory,
  onSaveTransactions,
  onSuccessNavigate,
}) => {
  if (!isOpen) return null;

  // Step state: 1 = Target & File, 2 = Review & De-dupe, 3 = Impact Summary, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Local categories state (allows adding new category during wizard session)
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);

  const sortedLocalCategories = useMemo(() => {
    return [...localCategories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [localCategories]);

  const getCategoryOptionLabel = (c: Category) => {
    if (c.type === 'expense') return `${c.name} (-)`;
    if (c.type === 'income') return `${c.name} (+)`;
    return c.name;
  };

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

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  // Destination state
  const [importTargetMode, setImportTargetMode] = useState<'existing' | 'new'>('new');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');

  // New Institution & Account state
  const [newInstName, setNewInstName] = useState<string>('');
  const [newAccName, setNewAccName] = useState<string>('Checking Account');
  const [newAccType, setNewAccType] = useState<AccountType>('checking');
  const [newAccCurrency, setNewAccCurrency] = useState<Currency>('USD');
  const [newAccInitialBalance, setNewAccInitialBalance] = useState<string>('0.00');
  const [newAccMask, setNewAccMask] = useState<string>('4812');

  // File state
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<'csv' | 'ofx' | 'ofc' | 'olx'>('csv');
  const [importItems, setImportItems] = useState<ImportItem[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isAiCategorizing, setIsAiCategorizing] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'new' | 'duplicates'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Automatic Sweep Transfers Filter toggle
  const [filterSweepTransfers, setFilterSweepTransfers] = useState<boolean>(true);

  // New Category Modal State inside Wizard
  const [isNewCatModalOpen, setIsNewCatModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense');
  const [newCatIcon, setNewCatIcon] = useState<string>('Tag');
  const [newCatColor, setNewCatColor] = useState<string>('bg-emerald-500');
  const [targetItemForNewCat, setTargetItemForNewCat] = useState<string | null>(null);
  const [bulkApplyMatching, setBulkApplyMatching] = useState<boolean>(true);

  // Institution suggestions
  const SUGGESTED_INSTITUTIONS = [
    'Banco do Brasil', 'Chase Bank', 'Bank of America', 'Wise', 'Revolut', 'Nubank',
    'Itaú', 'Fidelity', 'Santander', 'C6 Bank', 'Vanguard'
  ];

  // Handler for file parsing with encoding detection (windows-1252 vs utf-8)
  const handleProcessFile = async (file: File) => {
    setIsParsing(true);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buffer);

      // Check if UTF-8 resulted in replacement characters or if header explicitly specifies ISO-8859-1 / Windows-1252 / 1252
      if (
        text.includes('\uFFFD') ||
        text.includes('CHARSET:1252') ||
        text.includes('CHARSET:ISO-8859-1') ||
        text.includes('CHARSET:8859-1') ||
        text.includes('ENCODING:USASCII')
      ) {
        try {
          const latinText = new TextDecoder('windows-1252').decode(buffer);
          if (!latinText.includes('\uFFFD') || latinText.split('\uFFFD').length < text.split('\uFFFD').length) {
            text = latinText;
          }
        } catch (e) {
          console.warn('Windows-1252 decode fallback failed:', e);
        }
      }

      const defaultCurr = importTargetMode === 'existing'
        ? (accounts.find(a => a.id === selectedAccountId)?.currency || 'USD')
        : newAccCurrency;

      const parsedRes: ParsedImportResult = parseFinancialFile(text, file.name, defaultCurr);
      setFileType(parsedRes.fileType);

      if (importTargetMode === 'new' && parsedRes.detectedCurrency) {
        setNewAccCurrency(parsedRes.detectedCurrency);
      }

      // Auto-fill Institution name if blank
      if (importTargetMode === 'new' && !newInstName.trim()) {
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('banco do brasil') || lowerName.includes('bb') || text.includes('Banco do Brasil')) {
          setNewInstName('Banco do Brasil');
        } else if (lowerName.includes('chase')) setNewInstName('Chase Bank');
        else if (lowerName.includes('wise')) setNewInstName('Wise');
        else if (lowerName.includes('fidelity')) setNewInstName('Fidelity');
        else if (lowerName.includes('nubank')) setNewInstName('Nubank');
        else if (lowerName.includes('itau')) setNewInstName('Itaú');
        else if (lowerName.includes('bofa') || lowerName.includes('america')) setNewInstName('Bank of America');
        else if (lowerName.includes('revolut')) setNewInstName('Revolut');
        else if (lowerName.includes('santander')) setNewInstName('Santander');
        else {
          const rawClean = file.name.split('.')[0].replace(/[-_]/g, ' ');
          setNewInstName(rawClean.charAt(0).toUpperCase() + rawClean.slice(1));
        }
      }

      // Build deduplication map from prior transactions
      const existingKeySet = new Set<string>();
      const existingTargetTxs = existingTransactions.filter(tx =>
        importTargetMode === 'existing' ? tx.accountId === selectedAccountId : true
      );

      existingTargetTxs.forEach(tx => {
        const dateKey = tx.date;
        const amountKey = tx.amount.toFixed(2);
        const descKey = tx.description.toLowerCase().trim();
        existingKeySet.add(`${dateKey}_${amountKey}_${descKey}`);
        if (tx.externalId) {
          existingKeySet.add(`ext_${tx.externalId}`);
        }
      });

      // Build Prior Data Learning map: Vendor -> Category
      const vendorCategoryMap: Record<string, string> = {};
      existingTransactions.forEach(tx => {
        if (tx.category && tx.category !== 'Uncategorized') {
          const words = tx.description.toLowerCase().trim().split(/\s+/).slice(0, 3).join(' ');
          if (words.length > 2) {
            vendorCategoryMap[words] = tx.category;
          }
        }
      });

      // Process and de-dupe parsed items
      const seenInBatchSet = new Set<string>();

      const items: ImportItem[] = parsedRes.transactions.map((tx, idx) => {
        const dateKey = tx.date;
        const amountKey = tx.amount.toFixed(2);
        const descKey = tx.description.toLowerCase().trim();
        const primaryKey = `${dateKey}_${amountKey}_${descKey}`;
        const extKey = tx.externalId ? `ext_${tx.externalId}` : null;

        let isDuplicate = false;
        let duplicateReason = '';

        const isSweep = isAutomaticSweepTransfer(tx.description);
        const isToyotaException = tx.description.toLowerCase().includes('toyota') && Math.abs(Math.abs(tx.amount) - 4069.89) < 1;

        if (isToyotaException) {
          // Count how many Toyota 4069.89 transactions already exist in DB or were seen in this batch
          const seenCount = Array.from(seenInBatchSet).filter((k) => k.includes('toyota')).length;
          const dbCount = existingTransactions.filter((t) => t.description.toLowerCase().includes('toyota') && Math.abs(Math.abs(t.amount) - 4069.89) < 1).length;
          if (seenCount + dbCount >= 2) {
            isDuplicate = true;
            duplicateReason = `Excess duplicate (Toyota dual payment allowance is capped at 2 valid payments)`;
          }
        } else if (existingKeySet.has(primaryKey) || (extKey && existingKeySet.has(extKey))) {
          isDuplicate = true;
          duplicateReason = `Already exists in database (${tx.date}, ${formatCurrency(tx.amount, tx.currency)})`;
        } else if (seenInBatchSet.has(primaryKey)) {
          isDuplicate = true;
          duplicateReason = `Duplicate line in imported file`;
        } else if (isSweep) {
          duplicateReason = `Automatic Bank Sweep Redemption (e.g., BB Rende Fácil / Resgate Poupança)`;
        }

        seenInBatchSet.add(primaryKey);

        // Check prior data learning
        let category = isToyotaException ? 'Income & Salary' : tx.category;
        let categorySource: ImportItem['categorySource'] = isToyotaException ? 'rule' : 'rule';

        const words = descKey.split(/\s+/).slice(0, 3).join(' ');
        if (!isToyotaException && vendorCategoryMap[words]) {
          category = vendorCategoryMap[words];
          categorySource = 'prior_data';
        }

        return {
          id: `imp_${Date.now()}_${idx}`,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          currency: tx.currency,
          category,
          selected: !isDuplicate && !isSweep, // Deselect sweep transfers by default
          isDuplicate,
          duplicateReason,
          categorySource,
          externalId: tx.externalId,
          isSweepTransfer: isSweep,
        };
      });

      setImportItems(items);
      setStep(2);
    } catch (err) {
      console.error('Failed to parse statement:', err);
      alert('Error reading statement file. Please ensure it is a valid CSV, OFX, OFC, or QFX export.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  // AI Categorization Trigger for Step 2
  const handleRunAiCategorization = async () => {
    setIsAiCategorizing(true);
    try {
      const itemsToCategorize = importItems
        .filter(item => item.selected)
        .map(item => ({
          id: item.id,
          description: item.description,
          amount: item.amount,
          currency: item.currency,
        }));

      if (itemsToCategorize.length === 0) {
        setIsAiCategorizing(false);
        return;
      }

      const res = await safeJsonFetch<any>('/api/ai/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToCategorize.slice(0, 30) }),
      });

      if (res.ok && res.data && res.data.categorizedResults && Array.isArray(res.data.categorizedResults)) {
        setImportItems(prev =>
          prev.map(item => {
            const match = res.data.categorizedResults.find((r: any) => r.id === item.id);
            if (match && match.category) {
              return {
                ...item,
                category: match.category,
                categorySource: 'ai',
              };
            }
            return item;
          })
        );
      }
    } catch (err) {
      console.error('AI categorization error:', err);
    } finally {
      setIsAiCategorizing(false);
    }
  };

  // Item list filtering
  const filteredItems = useMemo(() => {
    return importItems.filter(item => {
      if (filterMode === 'new' && item.isDuplicate) return false;
      if (filterMode === 'duplicates' && !item.isDuplicate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.date.includes(q)
        );
      }
      return true;
    });
  }, [importItems, filterMode, searchQuery]);

  // Bulk actions
  const handleSelectAllNew = () => {
    setImportItems(prev => prev.map(item => ({ ...item, selected: !item.isDuplicate && !item.isSweepTransfer })));
  };

  const handleSelectAll = () => {
    setImportItems(prev => prev.map(item => ({ ...item, selected: true })));
  };

  const handleDeselectAll = () => {
    setImportItems(prev => prev.map(item => ({ ...item, selected: false })));
  };

  // Toggle filtering of automatic sweep transfers
  const handleToggleSweepFilter = () => {
    const nextState = !filterSweepTransfers;
    setFilterSweepTransfers(nextState);
    setImportItems(prev =>
      prev.map(item => {
        if (item.isSweepTransfer) {
          return { ...item, selected: !nextState };
        }
        return item;
      })
    );
  };

  // Handle adding a new category from inside wizard
  const handleCreateNewCategory = async () => {
    if (!newCatName.trim()) return;

    const createdCat: Category = {
      id: `cat_${Date.now()}`,
      name: newCatName.trim(),
      type: newCatType,
      icon: newCatIcon,
      color: newCatColor,
    };

    if (onSaveCategory) {
      await onSaveCategory(createdCat);
    }

    setLocalCategories(prev => [...prev, createdCat]);

    // Apply to targeted item or bulk matching
    setImportItems(prev =>
      prev.map(item => {
        if (targetItemForNewCat && item.id === targetItemForNewCat) {
          return { ...item, category: createdCat.name, categorySource: 'user' };
        }

        if (bulkApplyMatching) {
          if (targetItemForNewCat) {
            const targetItem = prev.find(i => i.id === targetItemForNewCat);
            if (targetItem) {
              const firstWord = targetItem.description.toLowerCase().trim().split(/\s+/)[0];
              if (firstWord && firstWord.length > 2 && item.description.toLowerCase().includes(firstWord)) {
                return { ...item, category: createdCat.name, categorySource: 'user' };
              }
            }
          }
          if (item.category === 'Uncategorized') {
            return { ...item, category: createdCat.name, categorySource: 'user' };
          }
        }
        return item;
      })
    );

    setIsNewCatModalOpen(false);
    setNewCatName('');
    setTargetItemForNewCat(null);
  };

  const handleToggleItem = (id: string) => {
    setImportItems(prev =>
      prev.map(item => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleCategoryChange = (id: string, newCat: string) => {
    setImportItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, category: newCat, categorySource: 'user' } : item
      )
    );
  };

  // Selected items summary stats
  const selectedItems = useMemo(() => importItems.filter(i => i.selected), [importItems]);
  const newItemsCount = useMemo(() => importItems.filter(i => !i.isDuplicate).length, [importItems]);
  const duplicateItemsCount = useMemo(() => importItems.filter(i => i.isDuplicate).length, [importItems]);
  const sweepItemsCount = useMemo(() => importItems.filter(i => i.isSweepTransfer).length, [importItems]);

  const targetAccountInfo = useMemo(() => {
    if (importTargetMode === 'existing') {
      const acc = accounts.find(a => a.id === selectedAccountId);
      return {
        instName: acc?.institutionName || 'Financial Institution',
        accName: acc?.name || 'Account',
        currency: acc?.currency || 'USD',
        mask: acc?.mask || '...0000',
        id: acc?.id,
      };
    } else {
      return {
        instName: newInstName.trim() || 'New Financial Institution',
        accName: newAccName.trim() || 'Checking Account',
        currency: newAccCurrency,
        mask: `...${newAccMask.replace(/\D/g, '').slice(-4) || '0000'}`,
        id: undefined,
      };
    }
  }, [importTargetMode, selectedAccountId, accounts, newInstName, newAccName, newAccCurrency, newAccMask]);

  // Net stats for step 3 summary
  const summaryStats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    const catSpentMap: Record<string, number> = {};

    selectedItems.forEach(item => {
      if (item.amount > 0) {
        inflow += item.amount;
      } else {
        const absVal = Math.abs(item.amount);
        outflow += absVal;
        catSpentMap[item.category] = (catSpentMap[item.category] || 0) + absVal;
      }
    });

    const net = inflow - outflow;
    return { inflow, outflow, net, catSpentMap };
  }, [selectedItems]);

  // Final Commit action
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  const handleConfirmImport = async () => {
    if (selectedItems.length === 0) return;
    setIsCommitting(true);

    try {
      let accountId = selectedAccountId;
      let accountName = targetAccountInfo.accName;

      // 1. Create account if new institution selected
      if (importTargetMode === 'new') {
        const initBalNum = parseFloat(newAccInitialBalance) || 0;
        const newAcc: BankAccount = {
          id: `acc_imp_${Date.now()}`,
          name: targetAccountInfo.accName,
          institutionName: targetAccountInfo.instName,
          accountType: newAccType,
          currency: newAccCurrency,
          balance: initBalNum + summaryStats.net, // Initial opening balance + net imported transactions
          mask: targetAccountInfo.mask,
          provider: 'file_import',
          lastSyncedAt: new Date().toISOString(),
          color: '#059669',
        };

        await onSaveAccount(newAcc);
        accountId = newAcc.id;
        accountName = newAcc.name;
      } else {
        // Update existing account balance
        const existingAcc = accounts.find(a => a.id === accountId);
        if (existingAcc) {
          const updatedAcc: BankAccount = {
            ...existingAcc,
            balance: existingAcc.balance + summaryStats.net,
            lastSyncedAt: new Date().toISOString(),
          };
          await onSaveAccount(updatedAcc);
        }
      }

      // 2. Convert import items to Transactions
      const txsToSave: Transaction[] = selectedItems.map((item, idx) => ({
        id: `tx_imp_${Date.now()}_${idx}`,
        accountId,
        accountName,
        date: item.date,
        description: item.description,
        originalDescription: item.description,
        amount: item.amount,
        currency: item.currency,
        category: item.category || 'Uncategorized',
        isManualCategory: item.categorySource === 'user',
        tags: ['imported', fileType],
        pending: false,
        provider: 'file_import',
        externalId: item.externalId,
      }));

      // 3. Save transactions
      await onSaveTransactions(txsToSave);

      setStep(4);
    } catch (err) {
      console.error('Error committing import:', err);
      alert('An error occurred while saving imported data to IndexedDB.');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header & Progress */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Statement Import Wizard</h2>
                <p className="text-xs text-slate-400">Import CSV, OFX, OFC, or QFX bank statement exports</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stepper Header Bar */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <div className={`h-1.5 rounded-full transition-all ${step >= 1 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 2 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 3 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 4 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
          </div>

          <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-2">
            <span className={step >= 1 ? 'text-emerald-400 font-bold' : ''}>1. Target & Upload</span>
            <span className={step >= 2 ? 'text-emerald-400 font-bold' : ''}>2. Review & De-dupe</span>
            <span className={step >= 3 ? 'text-emerald-400 font-bold' : ''}>3. Impact & Confirm</span>
            <span className={step >= 4 ? 'text-emerald-400 font-bold' : ''}>4. Complete</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">

          {/* ======================================================== */}
          {/* STEP 1: Target Destination & File Upload                 */}
          {/* ======================================================== */}
          {step === 1 && (
            <div className="space-y-6">
              
              {/* Institution Destination Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Step 1: Choose Import Target Institution
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportTargetMode('new')}
                    className={`p-4 rounded-2xl border text-left transition-all flex items-start space-x-3 ${
                      importTargetMode === 'new'
                        ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 ${
                      importTargetMode === 'new' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">Create New Institution</span>
                      <span className="text-xs text-slate-500">Define a new bank, currency, and account name</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportTargetMode('existing')}
                    disabled={accounts.length === 0}
                    className={`p-4 rounded-2xl border text-left transition-all flex items-start space-x-3 ${
                      importTargetMode === 'existing'
                        ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    } ${accounts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 ${
                      importTargetMode === 'existing' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">Existing Bank Account</span>
                      <span className="text-xs text-slate-500">
                        {accounts.length > 0 ? `Import into one of your ${accounts.length} active accounts` : 'No existing accounts setup yet'}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Form for NEW Institution */}
              {importTargetMode === 'new' && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-slate-900 text-xs">New Bank / Institution Configuration</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Institution / Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chase Bank, Wise, Revolut, Itaú, Santander"
                      value={newInstName}
                      onChange={(e) => setNewInstName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[11px] text-slate-400 font-medium self-center mr-1">Quick Suggestions:</span>
                      {SUGGESTED_INSTITUTIONS.slice(0, 6).map(inst => (
                        <button
                          key={inst}
                          type="button"
                          onClick={() => setNewInstName(inst)}
                          className="px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-[11px] font-semibold transition-colors"
                        >
                          {inst}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Display Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Main Checking, Savings"
                        value={newAccName}
                        onChange={(e) => setNewAccName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Type</label>
                      <select
                        value={newAccType}
                        onChange={(e) => setNewAccType(e.target.value as AccountType)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="checking">Checking Account</option>
                        <option value="savings">Savings Account</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="investment">Investment</option>
                        <option value="loan">Loan / Mortgage</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Currency</label>
                      <select
                        value={newAccCurrency}
                        onChange={(e) => setNewAccCurrency(e.target.value as Currency)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="USD">USD ($ - US Dollar)</option>
                        <option value="BRL">BRL (R$ - Brazilian Real)</option>
                        <option value="EUR">EUR (€ - Euro)</option>
                        <option value="GBP">GBP (£ - British Pound)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Initial / Opening Balance</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 32189.33"
                        value={newAccInitialBalance}
                        onChange={(e) => setNewAccInitialBalance(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-[10px] text-slate-400 block mt-0.5">e.g. 32189.33 for Banco do Brasil</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Account Mask (Last 4 Digits)</label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 font-mono font-bold text-slate-400 select-none pointer-events-none">
                          ...
                        </span>
                        <input
                          type="text"
                          maxLength={4}
                          required
                          placeholder="4812"
                          value={newAccMask}
                          onChange={(e) => setNewAccMask(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Form for EXISTING Account */}
              {importTargetMode === 'existing' && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Target Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.institutionName} - {a.name} ({a.currency}) - {a.mask}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Drag & Drop Area */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Step 2: Upload Bank Statement Export File
                </label>

                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
                    dragActive
                      ? 'border-emerald-500 bg-emerald-50/60 scale-[1.01]'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                    <Upload className="w-7 h-7" />
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-base">
                    Drag & Drop your statement file here
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Supports <strong>CSV</strong>, <strong>OFX</strong>, <strong>OFC</strong>, and <strong>QFX</strong> formats exported from Chase, Wise, Itaú, Nubank, Bank of America, etc.
                  </p>

                  <label className="mt-4 inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-md transition-all">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Browse File</span>
                    <input
                      type="file"
                      accept=".csv,.ofx,.ofc,.qfx,.olx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: Review, De-duplication & Smart Categorization    */}
          {/* ======================================================== */}
          {step === 2 && (
            <div className="space-y-4">
              
              {/* Automatic Sweep Transfers Warning Banner (for Banco do Brasil etc.) */}
              {sweepItemsCount > 0 && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-950">
                  <div className="flex items-start space-x-2.5">
                    <RotateCcw className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-blue-900">
                        Detected {sweepItemsCount} Automatic Bank Sweep / Overdraft Redemptions
                      </span>
                      <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                        (e.g., Banco do Brasil "BB Rende Fácil" / "Resgate Poupança"). These internal offsetting transfers have been automatically deselected so your expenses and budget metrics stay 100% clean.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleSweepFilter}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] whitespace-nowrap shadow-sm self-end sm:self-center"
                  >
                    {filterSweepTransfers ? 'Include Sweeps' : 'Filter Out Sweeps'}
                  </button>
                </div>
              )}

              {/* Target & Parsed Summary Header */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400 font-semibold">Target Account:</span>
                    <span className="text-xs font-bold text-emerald-400">
                      {targetAccountInfo.instName} ({targetAccountInfo.accName})
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 uppercase">
                      {targetAccountInfo.currency}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Parsed <strong>{importItems.length} transactions</strong> from file <code className="text-emerald-300">{fileName}</code>
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRunAiCategorization}
                    disabled={isAiCategorizing}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-purple-200 ${isAiCategorizing ? 'animate-spin' : ''}`} />
                    <span>{isAiCategorizing ? 'AI Analyzing...' : 'Auto-Categorize with AI'}</span>
                  </button>
                </div>
              </div>

              {/* Deduplication Metrics Ribbon */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-emerald-700 font-semibold block">New Records</span>
                    <span className="text-lg font-extrabold text-emerald-900">{newItemsCount}</span>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-amber-700 font-semibold block">Duplicates Flagged</span>
                    <span className="text-lg font-extrabold text-amber-900">{duplicateItemsCount}</span>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 font-semibold block">Selected for Import</span>
                    <span className="text-lg font-extrabold text-slate-900">{selectedItems.length}</span>
                  </div>
                  <Layers className="w-5 h-5 text-slate-400" />
                </div>
              </div>

              {/* Filter Controls & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                      filterMode === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({importItems.length})
                  </button>
                  <button
                    onClick={() => setFilterMode('new')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                      filterMode === 'new' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    New Only ({newItemsCount})
                  </button>
                  <button
                    onClick={() => setFilterMode('duplicates')}
                    className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                      filterMode === 'duplicates' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Duplicates ({duplicateItemsCount})
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTargetItemForNewCat(null);
                      setIsNewCatModalOpen(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors whitespace-nowrap flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Category</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllNew}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition-colors whitespace-nowrap"
                  >
                    Select New Only
                  </button>
                </div>
              </div>

              {/* Preview & Categorization Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={selectedItems.length === importItems.length && importItems.length > 0}
                          onChange={(e) => (e.target.checked ? handleSelectAll() : handleDeselectAll())}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Category (Editable)</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No transactions match the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            item.isDuplicate ? 'bg-amber-50/30' : item.isSweepTransfer ? 'bg-blue-50/30' : ''
                          } ${!item.selected ? 'opacity-50' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => handleToggleItem(item.id)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            {item.isDuplicate ? (
                              <span
                                title={item.duplicateReason}
                                className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1 w-fit cursor-help"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Duplicate</span>
                              </span>
                            ) : item.isSweepTransfer ? (
                              <span
                                title="Automatic Sweep Transfer (BB Rende Fácil / Resgate Poupança)"
                                className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300 flex items-center space-x-1 w-fit cursor-help"
                              >
                                <RotateCcw className="w-3 h-3 text-blue-600" />
                                <span>Sweep</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1 w-fit">
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>New</span>
                              </span>
                            )}
                          </td>

                          <td className="p-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                            {item.date}
                          </td>

                          <td className="p-3 font-semibold text-slate-900 max-w-xs truncate" title={item.description}>
                            {item.description}
                          </td>

                          <td className="p-3">
                            <div className="flex items-center space-x-1.5">
                              <select
                                value={item.category}
                                onChange={(e) => {
                                  if (e.target.value === 'ADD_NEW_CATEGORY') {
                                    setTargetItemForNewCat(item.id);
                                    setIsNewCatModalOpen(true);
                                  } else {
                                    handleCategoryChange(item.id, e.target.value);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                              >
                                {getFilteredCategories(sortedLocalCategories, item.amount, item.category).map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {getCategoryOptionLabel(c)}
                                  </option>
                                ))}
                                <option value="Uncategorized">Uncategorized</option>
                                <option value="ADD_NEW_CATEGORY" className="font-bold text-emerald-600 bg-emerald-50">
                                  + Create New Category...
                                </option>
                              </select>

                              {item.categorySource === 'ai' && (
                                <span title="AI Auto-Categorized" className="p-1 rounded bg-purple-100 text-purple-700">
                                  <Sparkles className="w-3 h-3" />
                                </span>
                              )}
                              {item.categorySource === 'prior_data' && (
                                <span title="Learned from past transactions" className="p-1 rounded bg-blue-100 text-blue-700">
                                  <RotateCcw className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          </td>

                          <td
                            className={`p-3 text-right font-extrabold whitespace-nowrap font-mono ${
                              item.amount > 0 ? 'text-emerald-600' : 'text-slate-900'
                            }`}
                          >
                            {item.amount > 0 ? '+' : ''}
                            {formatCurrency(item.amount, item.currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: Impact Summary & Final Confirmation               */}
          {/* ======================================================== */}
          {step === 3 && (
            <div className="space-y-5">
              
              <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md">
                <h3 className="text-sm font-extrabold text-emerald-400 uppercase tracking-wider mb-3">
                  Import Impact Preview
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div>
                      <span className="text-slate-400 block">Target Bank Institution:</span>
                      <span className="text-base font-bold text-white">{targetAccountInfo.instName}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 block">Account Display Name:</span>
                      <span className="text-sm font-bold text-slate-200">
                        {targetAccountInfo.accName} ({targetAccountInfo.mask})
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block">Account Currency:</span>
                      <span className="font-bold text-emerald-400 text-sm">{targetAccountInfo.currency}</span>
                    </div>
                  </div>

                  <div className="bg-slate-800/80 rounded-xl p-4 space-y-2 border border-slate-700">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-700">
                      <span className="text-slate-300">Transactions to Commit:</span>
                      <span className="font-extrabold text-white text-sm">{selectedItems.length} records</span>
                    </div>

                    <div className="flex justify-between items-center text-emerald-400 font-medium">
                      <span>Total Inflow (Income):</span>
                      <span className="font-bold">+{formatCurrency(summaryStats.inflow, targetAccountInfo.currency)}</span>
                    </div>

                    <div className="flex justify-between items-center text-rose-400 font-medium">
                      <span>Total Outflow (Expenses):</span>
                      <span className="font-bold">-{formatCurrency(summaryStats.outflow, targetAccountInfo.currency)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-700 font-bold text-sm text-white">
                      <span>Net Account Balance Impact:</span>
                      <span className={summaryStats.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {summaryStats.net >= 0 ? '+' : ''}
                        {formatCurrency(summaryStats.net, targetAccountInfo.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category Breakdown Impact */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Affected Categories & Budgets
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {Object.entries(summaryStats.catSpentMap).map(([catName, spentVal]) => (
                    <div
                      key={catName}
                      className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <CategoryIcon iconName={cIcon(catName, categories)} className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-slate-800">{catName}</span>
                      </div>
                      <span className="font-extrabold text-slate-900">
                        -{formatCurrency(Number(spentVal), targetAccountInfo.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 4: Import Complete & Navigation                      */}
          {/* ======================================================== */}
          {step === 4 && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  Statement Import Successful!
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Imported <strong>{selectedItems.length} transactions</strong> into{' '}
                  <strong>{targetAccountInfo.instName}</strong> ({targetAccountInfo.currency}).
                  Account balance, budgets, and transactions updated seamlessly.
                </p>
              </div>

              <div className="pt-4 flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => {
                    onClose();
                    onSuccessNavigate?.('transactions');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
                >
                  <span>View in Transactions</span>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onSuccessNavigate?.('budgets');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                >
                  View Budgets Progress
                </button>

                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        {step < 4 && (
          <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : 1))}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
            )}

            <div>
              {step === 1 && (
                <button
                  type="button"
                  disabled={importTargetMode === 'new' && (!newInstName.trim() || !newAccName.trim())}
                  onClick={() => {
                    if (importTargetMode === 'new' && (!newInstName.trim() || !newAccName.trim())) {
                      alert('Please provide an institution name and account name.');
                      return;
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs cursor-not-allowed hidden"
                >
                  Upload File Above
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <span>Continue to Impact Preview ({selectedItems.length})</span>
                  <ChevronRight className="w-4 h-4 text-emerald-400" />
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  disabled={isCommitting || selectedItems.length === 0}
                  onClick={handleConfirmImport}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isCommitting ? 'Saving to Database...' : 'Confirm & Commit to Database'}</span>
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ======================================================== */}
      {/* IN-WIZARD NEW CATEGORY MODAL OVERLAY                     */}
      {/* ======================================================== */}
      {isNewCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Create New Category</h3>
                  <p className="text-xs text-slate-500">Add on the fly & apply in this import session</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewCatModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Category Name</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Subscriptions, Pet Care, Pool Service"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category Type</label>
                  <select
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as 'expense' | 'income')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Badge Color</label>
                  <select
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="bg-emerald-500">Emerald Green</option>
                    <option value="bg-blue-500">Blue</option>
                    <option value="bg-purple-500">Purple</option>
                    <option value="bg-amber-500">Amber / Orange</option>
                    <option value="bg-rose-500">Rose / Red</option>
                    <option value="bg-teal-500">Teal</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyMatching}
                    onChange={(e) => setBulkApplyMatching(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-bold text-slate-800 text-xs">
                    Apply automatically to similar uncategorized transactions in this import batch
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5">
                  Matches vendor names & description prefixes across current file items.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewCatModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newCatName.trim()}
                onClick={handleCreateNewCategory}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Save Category & Apply</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to look up category icon
function cIcon(catName: string, categories: Category[]): string {
  const match = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
  return match?.icon || 'FolderPlus';
}
