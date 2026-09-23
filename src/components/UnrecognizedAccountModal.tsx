import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  X,
  TrendingUp,
  Landmark,
  PiggyBank,
  CreditCard,
  Wallet,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { BankAccount, AccountType, Currency } from '../types';
import { CLASSIFICATION_OPTIONS, COMMON_SPECIALTY_CHIPS } from '../lib/plaidClassifier';
import { formatCurrency } from '../lib/currency';
import { BankLogo } from './BankLogo';

interface UnrecognizedAccountModalProps {
  account: BankAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedAccount: BankAccount) => Promise<void>;
  baseCurrency?: Currency;
}

export const UnrecognizedAccountModal: React.FC<UnrecognizedAccountModalProps> = ({
  account,
  isOpen,
  onClose,
  onSave,
  baseCurrency = 'USD',
}) => {
  if (!isOpen || !account) return null;

  const [selectedType, setSelectedType] = useState<AccountType>(account.accountType || 'investment');
  const [subtypeLabel, setSubtypeLabel] = useState<string>(account.subtype || '');
  const [excludeFromCashFlow, setExcludeFromCashFlow] = useState<boolean>(
    account.excludeFromCashFlow ?? (account.accountType === 'investment')
  );
  const [customName, setCustomName] = useState<string>(account.name);
  const [institutionName, setInstitutionName] = useState<string>(account.institutionName || 'Fidelity');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setSelectedType(account.accountType || 'investment');
      setSubtypeLabel(account.subtype || '');
      setExcludeFromCashFlow(account.excludeFromCashFlow ?? (account.accountType === 'investment'));
      setCustomName(account.name);
      setInstitutionName(account.institutionName || 'Fidelity');
    }
  }, [account]);

  const handleSelectOption = (optType: AccountType, defaultExclude: boolean) => {
    setSelectedType(optType);
    setExcludeFromCashFlow(defaultExclude);
  };

  const handleSelectChip = (chip: string) => {
    setSubtypeLabel(chip);
    // If selecting HSA, 529, Trust, Annuity, or Deferred Comp, default to investment & net worth only
    if (
      chip.includes('HSA') ||
      chip.includes('529') ||
      chip.includes('Deferred') ||
      chip.includes('Trust') ||
      chip.includes('Annuity') ||
      chip.includes('Custodial') ||
      chip.includes('Stock')
    ) {
      setSelectedType('investment');
      setExcludeFromCashFlow(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setIsSaving(true);
    try {
      const updatedInst = institutionName.trim() || account.institutionName || 'Fidelity';
      const updated: BankAccount = {
        ...account,
        name: customName.trim() || account.name,
        institutionName: updatedInst,
        color: updatedInst.toLowerCase().includes('fidelity') ? '#1b7340' : account.color,
        accountType: selectedType,
        subtype: subtypeLabel.trim() || undefined,
        excludeFromCashFlow,
        unrecognizedType: false, // Flag cleared!
        classificationWarning: undefined,
      };
      await onSave(updated);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'TrendingUp':
        return <TrendingUp className="w-5 h-5 text-sky-600" />;
      case 'Landmark':
        return <Landmark className="w-5 h-5 text-blue-600" />;
      case 'PiggyBank':
        return <PiggyBank className="w-5 h-5 text-emerald-600" />;
      case 'CreditCard':
        return <CreditCard className="w-5 h-5 text-purple-600" />;
      case 'Wallet':
        return <Wallet className="w-5 h-5 text-slate-600" />;
      default:
        return <Landmark className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 my-8">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-black text-slate-900">Review & Classify Account</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Plaid reported this account with an uncommon classification. Choose how Moneta tracks it.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Summary Banner */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BankLogo
              institutionName={account.institutionName}
              size="md"
            />
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                {account.institutionName}
              </span>
              <span className="font-bold text-slate-900 text-sm block">
                {account.name}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Account {account.mask}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-slate-400 uppercase block">Reported Balance</span>
            <span className="text-base font-black text-slate-900">
              {formatCurrency(account.balance, account.currency)}
            </span>
          </div>
        </div>

        {/* Plaid Diagnostics Callout */}
        <div className="mt-3 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900">
          <div className="flex items-center justify-between font-bold text-[11px]">
            <span className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Plaid Diagnostic Report</span>
            </span>
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200 text-amber-800">
              Type: {account.rawPlaidType || 'other'} • Subtype: {account.rawPlaidSubtype || 'unspecified'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-amber-800 leading-relaxed">
            {account.classificationWarning ||
              `Plaid returned a non-standard classification. We defaulted this account to Investment (Net Worth Only) to avoid skewing your monthly spending budgets.`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Classification Options */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2">
              Select How Moneta Treats This Account:
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {CLASSIFICATION_OPTIONS.map((opt) => {
                const isSelected = selectedType === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleSelectOption(opt.type, opt.defaultExcludeFromCashFlow)}
                    className={`w-full p-3 rounded-2xl border text-left transition-all flex items-start space-x-3 cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="mt-0.5 p-1.5 rounded-xl bg-white border border-slate-200 shrink-0">
                      {getIcon(opt.iconName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{opt.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {opt.description}
                      </p>
                    </div>
                    <div className="mt-1 shrink-0">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Specialty Chips & Custom Subtype */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <span>Specialty Type or Plan Name</span>
              </label>
              <span className="text-[10px] text-slate-400">Optional custom label</span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_SPECIALTY_CHIPS.map((chip) => {
                const isSelected = subtypeLabel === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSelectChip(chip)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="e.g. HSA, 529 College Savings, Deferred Comp, Family Trust"
              value={subtypeLabel}
              onChange={(e) => setSubtypeLabel(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          {/* Cashflow Exclude Setting */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeFromCashFlow}
                onChange={(e) => setExcludeFromCashFlow(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <div>
                <span className="font-bold text-slate-900 text-xs block">
                  Exclude from Cash Flow & Budget Tracking (Net Worth Only)
                </span>
                <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                  Balance will count fully toward your Total Net Worth and Investments tab, but transactions won't inflate or distort monthly expense budgets or living cashflow.
                </span>
              </div>
            </label>
          </div>

          {/* Editable Institution & Display Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Institution
              </label>
              <input
                type="text"
                required
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. Fidelity, Chase, Morgan Stanley"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Account Display Name
              </label>
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-md shadow-emerald-500/10 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Confirm Classification & Clear Flag'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnrecognizedAccountModal;
