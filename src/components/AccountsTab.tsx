import React, { useState } from 'react';
import { BankAccount, SyncLog, Currency, ExchangeRates, AccountType } from '../types';
import { formatCurrency, convertCurrency } from '../lib/currency';
import { parseFinancialFile, ParsedImportResult } from '../lib/parsers';
import { PluggyConnectModal } from './PluggyConnectModal';
import { PlaidConnectButton } from './PlaidConnectButton';
import { BankLogo } from './BankLogo';
import { safeJsonFetch } from '../lib/api';
import {
  Building2, Plus, Upload, CheckCircle2,
  Trash2, Landmark, CreditCard, PiggyBank,
  TrendingUp, Wallet, X, PlusCircle, ShieldCheck,
  Pencil, Check, Eye, EyeOff, ChevronLeft, ChevronRight,
  GitMerge, ChevronDown, ChevronUp, AlertCircle, Info, ArrowRight,
  RefreshCw, AlertTriangle
} from 'lucide-react';
import { UnrecognizedAccountModal } from './UnrecognizedAccountModal';

interface AccountsTabProps {
  accounts: BankAccount[];
  syncLogs: SyncLog[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onConnectPlaid: (institutionNameOrToken: string, institutionName?: string) => Promise<void>;
  onConnectPluggy: (connectorName: string, itemId?: string) => Promise<void>;
  onFetchPluggyItem?: (itemId: string) => Promise<boolean>;
  onImportParsedFile: (parsed: ParsedImportResult, targetAccountId: string) => Promise<void>;
  onSaveAccount: (account: BankAccount) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onRestoreDeduplicationException?: (logId: string, detailId: string) => Promise<void>;
  onUndoRestoreDeduplicationException?: (logId: string, detailId: string) => Promise<void>;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  onSyncAll?: () => void;
  onSyncInstitution?: (institutionName: string) => Promise<void>;
  isSyncing?: boolean;
}

export interface InstitutionGroup {
  institutionName: string;
  provider: BankAccount['provider'];
  color?: string;
  accounts: BankAccount[];
  totalInBaseCurrency: number;
}

export function getCanonicalInstitutionName(rawName: string): string {
  if (!rawName) return 'Other Institution';
  const name = rawName.trim().toLowerCase();
  if (name.includes('chase') || name.includes('jpmorgan')) return 'Chase';
  if (name.includes('morgan stanley') || name.includes('shareworks')) return 'Morgan Stanley at Work';
  if (name.includes('computershare')) return 'Computershare';
  if (name.includes('wise') || name.includes('transferwise')) return 'Wise';
  if (name.includes('fidelity')) return 'Fidelity';
  if (name.includes('nubank') || name.includes('nu bank')) return 'Nubank';
  if (name.includes('itaú') || name.includes('itau')) return 'Itaú';
  if (name.includes('vanguard')) return 'Vanguard';
  if (name.includes('bofa') || name.includes('bank of america')) return 'Bank of America';
  if (name.includes('wells fargo')) return 'Wells Fargo';
  if (name.includes('bradesco')) return 'Bradesco';
  if (name.includes('btg')) return 'BTG Pactual';
  return rawName.trim().charAt(0).toUpperCase() + rawName.trim().slice(1);
}

export function groupAccountsByInstitution(
  accounts: BankAccount[],
  baseCurrency: Currency,
  rates: ExchangeRates['rates']
): InstitutionGroup[] {
  const groupsMap: Record<string, InstitutionGroup> = {};

  accounts.forEach((acc) => {
    const canonicalName = getCanonicalInstitutionName(acc.institutionName);
    const key = canonicalName.toLowerCase();

    if (!groupsMap[key]) {
      groupsMap[key] = {
        institutionName: canonicalName,
        provider: acc.provider,
        color: acc.color,
        accounts: [],
        totalInBaseCurrency: 0,
      };
    }
    groupsMap[key].accounts.push(acc);
    const balance = acc.accountType === 'credit_card' ? acc.balance * -1 : acc.balance;
    const converted = convertCurrency(balance, acc.currency, baseCurrency, rates);
    groupsMap[key].totalInBaseCurrency += converted;
  });

  return Object.values(groupsMap);
}

function formatSyncTime(isoString?: string): string {
  if (!isoString) return 'Never';
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

export const AccountsTab: React.FC<AccountsTabProps> = ({
  accounts,
  syncLogs,
  baseCurrency,
  exchangeRates,
  onConnectPlaid,
  onConnectPluggy,
  onFetchPluggyItem,
  onImportParsedFile,
  onSaveAccount,
  onDeleteAccount,
  onRestoreDeduplicationException,
  onUndoRestoreDeduplicationException,
  isImportModalOpen,
  setIsImportModalOpen,
  onSyncAll,
  onSyncInstitution,
  isSyncing,
}) => {
  const [isPluggyModalOpen, setIsPluggyModalOpen] = useState(false);
  const [restoringDetailId, setRestoringDetailId] = useState<string | null>(null);

  // Add Custom Account Modal state
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addAccountFormData, setAddAccountFormData] = useState({
    institutionName: 'Chase',
    name: 'New Checking Account',
    accountType: 'checking' as AccountType,
    currency: 'USD' as Currency,
    balance: '1000.00',
    mask: '...1234',
    provider: 'manual' as BankAccount['provider'],
    excludeFromCashFlow: false,
  });

  // Unrecognized account review modal state
  const [unrecognizedAccountModalTarget, setUnrecognizedAccountModalTarget] = useState<BankAccount | null>(null);
  const unrecognizedAccounts = accounts.filter((a) => a.unrecognizedType);

  // Edit Account Modal state
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editAccountFormData, setEditAccountFormData] = useState({
    name: '',
    accountType: 'checking' as AccountType,
    currency: 'USD' as Currency,
    balance: '0.00',
    mask: '...1234',
    institutionName: '',
    excludeFromCashFlow: false,
  });

  const handleOpenEditAccount = (acc: BankAccount) => {
    setEditingAccount(acc);
    setEditAccountFormData({
      name: acc.name,
      accountType: acc.accountType,
      currency: acc.currency,
      balance: String(acc.balance),
      mask: acc.mask || '...0000',
      institutionName: acc.institutionName,
      excludeFromCashFlow: acc.excludeFromCashFlow ?? (acc.accountType === 'investment'),
    });
  };

  const handleSaveEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    const parsedBal = parseFloat(editAccountFormData.balance);
    const updated: BankAccount = {
      ...editingAccount,
      name: editAccountFormData.name.trim() || editingAccount.name,
      accountType: editAccountFormData.accountType,
      currency: editAccountFormData.currency,
      balance: isNaN(parsedBal) ? editingAccount.balance : parsedBal,
      mask: editAccountFormData.mask,
      institutionName: editAccountFormData.institutionName.trim() || editingAccount.institutionName,
      excludeFromCashFlow: editAccountFormData.excludeFromCashFlow,
      unrecognizedType: false,
      classificationWarning: undefined,
    };
    await onSaveAccount(updated);
    setEditingAccount(null);
  };

  // File Import state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedImportResult | null>(null);
  const [targetAccountId, setTargetAccountId] = useState(accounts[0]?.id || 'NEW_BANK');
  const [isParsing, setIsParsing] = useState(false);

  // New Bank creation fields during import
  const [newInstName, setNewInstName] = useState('');
  const [newAccName, setNewAccName] = useState('Checking Account');
  const [newAccType, setNewAccType] = useState<AccountType>('checking');
  const [newAccCurrency, setNewAccCurrency] = useState<Currency>('USD');
  const [newAccMask, setNewAccMask] = useState('4812');

  // Institution edit state
  const [editingInstitution, setEditingInstitution] = useState<string | null>(null);
  const [editInstitutionName, setEditInstitutionName] = useState('');
  const [unlinkingInstitution, setUnlinkingInstitution] = useState<string | null>(null);

  // Sync history pagination state
  const [syncPage, setSyncPage] = useState(1);
  const [syncPageSize, setSyncPageSize] = useState(5);

  const handleSaveInstitutionName = async (group: any) => {
    if (editInstitutionName.trim() && editInstitutionName !== group.institutionName) {
      for (const acc of group.accounts) {
        await onSaveAccount({ ...acc, institutionName: editInstitutionName.trim() });
      }
    }
    setEditingInstitution(null);
  };

  const institutionGroups = groupAccountsByInstitution(accounts, baseCurrency, exchangeRates.rates);

  // Sync history pagination math & deduplication view state
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  };

  const totalSyncLogs = syncLogs.length;
  const totalSyncPages = Math.max(1, Math.ceil(totalSyncLogs / syncPageSize));
  const validSyncPage = Math.min(syncPage, totalSyncPages);
  const syncStartIndex = (validSyncPage - 1) * syncPageSize;
  const paginatedSyncLogs = syncLogs.slice(syncStartIndex, syncStartIndex + syncPageSize);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setIsParsing(true);
    try {
      const text = await file.text();
      const targetAcc = accounts.find((a) => a.id === targetAccountId);
      const res = parseFinancialFile(text, file.name, targetAcc?.currency || newAccCurrency || 'USD');
      setParsedData(res);

      if (res.detectedCurrency) {
        setNewAccCurrency(res.detectedCurrency);
      }

      if (!newInstName.trim()) {
        const fname = file.name.toLowerCase();
        if (fname.includes('chase')) setNewInstName('Chase');
        else if (fname.includes('wise')) setNewInstName('Wise');
        else if (fname.includes('fidelity')) setNewInstName('Fidelity');
        else if (fname.includes('nubank')) setNewInstName('Nubank');
        else if (fname.includes('itau')) setNewInstName('Itaú');
        else if (fname.includes('bofa') || fname.includes('america')) setNewInstName('Bank of America');
        else if (fname.includes('c6')) setNewInstName('C6 Bank');
        else {
          const baseName = file.name.split('.')[0].replace(/[-_]/g, ' ');
          setNewInstName(baseName.charAt(0).toUpperCase() + baseName.slice(1));
        }
      }
    } catch (err) {
      console.error('File parsing error:', err);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedData) return;

    let finalTargetAccountId = targetAccountId;

    if (targetAccountId === 'NEW_BANK' || !targetAccountId) {
      const instClean = newInstName.trim() || 'New Financial Institution';
      const nameClean = newAccName.trim() || 'Checking Account';
      const maskClean = `...${newAccMask.replace(/\D/g, '').slice(-4) || '0000'}`;

      const newAccount: BankAccount = {
        id: `acc_imported_${Date.now()}`,
        name: nameClean,
        institutionName: instClean,
        accountType: newAccType,
        currency: newAccCurrency,
        balance: 0,
        mask: maskClean,
        provider: 'file_import',
        lastSyncedAt: new Date().toISOString(),
        color: '#059669',
      };

      await onSaveAccount(newAccount);
      finalTargetAccountId = newAccount.id;
    }

    if (!finalTargetAccountId) return;

    await onImportParsedFile(parsedData, finalTargetAccountId);
    setIsImportModalOpen(false);
    setSelectedFile(null);
    setParsedData(null);
  };

  const handleOpenAddSubAccount = (institutionName: string, defaultCurrency: Currency = 'USD', provider: BankAccount['provider'] = 'manual') => {
    setAddAccountFormData({
      institutionName,
      name: `${institutionName} Savings`,
      accountType: 'savings',
      currency: defaultCurrency,
      balance: '500.00',
      mask: `...${Math.floor(1000 + Math.random() * 9000)}`,
      provider,
    });
    setIsAddAccountModalOpen(true);
  };

  const handleAddAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBalance = parseFloat(addAccountFormData.balance);
    if (isNaN(parsedBalance) || !addAccountFormData.name.trim()) return;

    const newAcc: BankAccount = {
      id: `acc_custom_${Date.now()}`,
      name: addAccountFormData.name.trim(),
      institutionName: addAccountFormData.institutionName.trim() || 'Bank',
      accountType: addAccountFormData.accountType,
      currency: addAccountFormData.currency,
      balance: parsedBalance,
      mask: addAccountFormData.mask.startsWith('...') ? addAccountFormData.mask : `...${addAccountFormData.mask}`,
      provider: addAccountFormData.provider,
      lastSyncedAt: new Date().toISOString(),
      color: '#3B82F6',
      excludeFromCashFlow: addAccountFormData.excludeFromCashFlow || addAccountFormData.accountType === 'investment',
    };

    await onSaveAccount(newAcc);
    setIsAddAccountModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Integrations Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>

            <h2 className="text-2xl font-extrabold tracking-tight mt-2">Connected Financial Institutions</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Sync checking, savings, credit cards, and investments across US & LATAM banks in grouped institution tiles.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <PlaidConnectButton onSuccess={async (public_token, metadata) => {
              const connectedInstitution = metadata?.institution?.name;
              try {
                const res = await safeJsonFetch<any>('/api/plaid/exchange_public_token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ public_token, institution: metadata?.institution }),
                });
                if (res.ok && res.data && res.data.access_token) {
                  await onConnectPlaid(res.data.access_token, connectedInstitution);
                } else {
                  console.error('Failed to exchange public token', res.error);
                }
              } catch (err) {
                console.error('Error in Plaid connection flow:', err);
              }
            }} />

            <button
              onClick={() => setIsPluggyModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2"
            >
              <Landmark className="w-4 h-4" />
              <span>Via Pluggy 🇧🇷</span>
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2 border border-slate-700"
            >
              <Upload className="w-4 h-4" />
              <span>Import Statement</span>
            </button>

            {onSyncAll && (
              <button
                onClick={onSyncAll}
                disabled={isSyncing}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center space-x-2"
                title="Sync all connected bank accounts"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync All Banks'}</span>
              </button>
            )}


          </div>
        </div>
      </div>

      {/* Flagged Unrecognized Accounts Banner */}
      {unrecognizedAccounts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-black text-amber-950 text-sm">
                  {unrecognizedAccounts.length} Account{unrecognizedAccounts.length > 1 ? 's' : ''} Flagged for Classification Review
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-200 text-amber-900">
                  Plaid Notice
                </span>
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5 max-w-2xl leading-relaxed">
                Plaid returned non-standard classifications (e.g. specialized retirement, post-money accounts, HSA, 529, or trusts). They have been temporarily protected as Net Worth Only investments. Review and confirm your desired tracking settings.
              </p>
            </div>
          </div>
          <button
            onClick={() => setUnrecognizedAccountModalTarget(unrecognizedAccounts[0])}
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center space-x-2 shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <span>Review & Classify</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connected Institution Tiles Grid */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Linked Institutions ({institutionGroups.length})</h3>
            <p className="text-xs text-slate-500">Grouped checking, savings, credit card, and investment accounts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {institutionGroups.map((group) => {
            const isPlaid = group.provider === 'plaid';
            const isPluggy = group.provider === 'pluggy';

            return (
              <div
                key={group.institutionName}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between"
              >
                {/* Institution Header Tile */}
                <div className="p-5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-3.5">
                    <BankLogo institutionName={group.institutionName} size="lg" color={group.color} />
                    <div>
                      <div className="flex items-center space-x-2">
                        {editingInstitution === group.institutionName ? (
                          <div className="flex items-center space-x-1">
                            <input
                              autoFocus
                              type="text"
                              value={editInstitutionName}
                              onChange={(e) => setEditInstitutionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveInstitutionName(group);
                                if (e.key === 'Escape') setEditingInstitution(null);
                              }}
                              className="px-2 py-0.5 text-base font-extrabold text-slate-900 bg-white border border-slate-300 rounded focus:outline-none focus:border-purple-500 w-48"
                            />
                            <button
                              onClick={() => handleSaveInstitutionName(group)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingInstitution(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center group/edit">
                            <h4 className="text-base font-extrabold text-slate-900">{group.institutionName}</h4>
                            <button
                              onClick={() => {
                                setEditingInstitution(group.institutionName);
                                setEditInstitutionName(group.institutionName);
                              }}
                              className="ml-1.5 p-1 text-slate-300 hover:text-purple-600 opacity-0 group-hover/edit:opacity-100 transition-opacity rounded-md hover:bg-purple-50"
                              title="Edit institution name"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
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
                      <p className="text-xs text-slate-500 mt-0.5">
                        {group.accounts.length} {group.accounts.length === 1 ? 'account' : 'accounts'} linked
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-right">
                    {onSyncInstitution && (
                      <button
                        onClick={() => onSyncInstitution(group.institutionName)}
                        disabled={isSyncing}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200 hover:border-emerald-300 flex items-center space-x-1"
                        title={`Sync ${group.institutionName}`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
                        <span className="text-[11px] font-bold text-slate-700 hover:text-emerald-700 hidden sm:inline">Sync</span>
                      </button>
                    )}
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase block">Institution Total ({baseCurrency})</span>
                      <span className="text-lg font-black text-slate-900">
                        {formatCurrency(group.totalInBaseCurrency, baseCurrency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-Accounts List inside the Institution Tile */}
                <div className="p-4 space-y-3 bg-white divide-y divide-slate-100">
                  {group.accounts.map((acc) => {
                    const displayBalance = acc.accountType === 'credit_card' ? acc.balance * -1 : acc.balance;
                    const converted = convertCurrency(displayBalance, acc.currency, baseCurrency, exchangeRates.rates);
                    const isNegative = displayBalance < 0;

                    return (
                      <div key={acc.id} className="pt-3 first:pt-0 flex items-center justify-between text-xs hover:bg-slate-50/80 p-2.5 rounded-xl transition-colors">
                        <div className="flex items-center space-x-3">
                          {/* Account Type Icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            acc.accountType === 'credit_card'
                              ? 'bg-purple-50 text-purple-600 border border-purple-100'
                              : acc.accountType === 'savings'
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : acc.accountType === 'investment'
                              ? 'bg-sky-50 text-sky-600 border border-sky-100'
                              : 'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                            {acc.accountType === 'credit_card' && <CreditCard className="w-4 h-4" />}
                            {acc.accountType === 'savings' && <PiggyBank className="w-4 h-4" />}
                            {acc.accountType === 'investment' && <TrendingUp className="w-4 h-4" />}
                            {acc.accountType === 'checking' && <Landmark className="w-4 h-4" />}
                            {acc.accountType === 'loan' && <Wallet className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="flex items-center space-x-2">
                              <span className={`font-bold transition-all ${acc.isHidden ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{acc.name}</span>
                              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                                {acc.accountType.replace('_', ' ')}
                              </span>
                              {acc.unrecognizedType && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setUnrecognizedAccountModalTarget(acc);
                                  }}
                                  className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                                  title={acc.classificationWarning || 'Click to review and configure how this account is classified'}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                                  <span>Review Type</span>
                                </button>
                              )}
                              {acc.excludeFromCashFlow && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200" title="Counts toward Total Net Worth, but excluded from daily cash flow & budget tracking">
                                  Net Worth Only
                                </span>
                              )}
                              {acc.isSandbox && (
                                <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                  Sandbox
                                </span>
                              )}
                              {acc.isHidden && (
                                <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-150">
                                  Hidden
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Account {acc.mask} • Synced {formatSyncTime(acc.lastSyncedAt)}
                            </span>
                          </div>
                        </div>

                        {/* Balance and Actions */}
                        <div className="flex items-center space-x-3 text-right">
                          <div className={acc.isHidden ? 'opacity-60' : ''}>
                            <span className={`font-black text-sm block ${isNegative ? 'text-rose-600' : 'text-slate-900'}`}>
                              {formatCurrency(displayBalance, acc.currency)}
                            </span>
                            {acc.currency !== baseCurrency && (
                              <span className="text-[10px] text-slate-400 font-semibold block">
                                ≈ {formatCurrency(converted, baseCurrency)}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleOpenEditAccount(acc)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit account details, balance and classification"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={async () => {
                              await onSaveAccount({ ...acc, isHidden: !acc.isHidden });
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              acc.isHidden
                                ? 'text-rose-500 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                            title={acc.isHidden ? "Show in Overview & Transactions" : "Hide from Overview & Transactions"}
                          >
                            {acc.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => onDeleteAccount(acc.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Disconnect this account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Action Bar for Institution */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => handleOpenAddSubAccount(group.institutionName, group.accounts[0]?.currency || 'USD', group.provider)}
                    className="flex items-center space-x-1.5 text-emerald-600 hover:text-emerald-700 font-bold hover:underline"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add {group.institutionName} Account</span>
                  </button>

                  {unlinkingInstitution === group.institutionName ? (
                    <div className="flex items-center space-x-2 animate-in fade-in zoom-in duration-200">
                      <span className="text-rose-600 font-extrabold text-[11px] select-none">
                        Are you sure?
                      </span>
                      <button
                        onClick={async () => {
                          setUnlinkingInstitution(null);
                          for (const acc of group.accounts) {
                            await onDeleteAccount(acc.id);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10px] uppercase tracking-wide transition-colors"
                      >
                        Yes, Unlink
                      </button>
                      <button
                        onClick={() => setUnlinkingInstitution(null)}
                        className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-[10px] uppercase tracking-wide transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setUnlinkingInstitution(group.institutionName)}
                      className="flex items-center space-x-1.5 text-rose-600 hover:text-rose-700 font-bold hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Unlink Bank</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sync History Logs */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">Incremental Sync Activity</h3>
        <p className="text-xs text-slate-500 mb-4">Log of automated background pulls and statement imports</p>

        <div className="space-y-3">
          {totalSyncLogs === 0 ? (
            <p className="text-xs text-slate-400 py-4">No sync logs recorded yet.</p>
          ) : (
            paginatedSyncLogs.map((log) => {
              const hasDedup = Boolean(
                (log.deduplicatedCount && log.deduplicatedCount > 0) ||
                (log.deduplicationDetails && log.deduplicationDetails.length > 0)
              );
              const dedupCount = log.deduplicatedCount || (log.deduplicationDetails ? log.deduplicationDetails.length : 0);
              const isExpanded = Boolean(expandedLogIds[log.id]);

              return (
                <div
                  key={log.id}
                  className={`rounded-xl border transition-all ${
                    hasDedup ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between p-3.5 text-xs">
                    <div className="flex items-center space-x-3 min-w-0 pr-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold flex-shrink-0 ${
                          hasDedup
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {hasDedup ? <GitMerge className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{log.message}</span>
                        <span className="text-[11px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {log.newTransactionsCount > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold text-[10px]">
                          +{log.newTransactionsCount} new
                        </span>
                      )}

                      {hasDedup && (
                        <button
                          onClick={() => toggleLogExpanded(log.id)}
                          className="px-2.5 py-1 rounded-full bg-amber-100/80 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px] flex items-center space-x-1 transition-colors cursor-pointer"
                          title="Click to view detailed de-duplication audit trail"
                        >
                          <GitMerge className="w-3 h-3" />
                          <span>{dedupCount} de-duped</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3 ml-0.5" />
                          ) : (
                            <ChevronDown className="w-3 h-3 ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Deduplication Audit Details */}
                  {hasDedup && isExpanded && log.deduplicationDetails && log.deduplicationDetails.length > 0 && (
                    <div className="px-4 pb-4 pt-1 border-t border-amber-200/60 bg-white/70 rounded-b-xl space-y-3">
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-1.5 text-[11px] font-bold text-amber-900">
                          <ShieldCheck className="w-4 h-4 text-amber-600" />
                          <span>De-duplication Audit Trail ({log.deduplicationDetails.length} record{log.deduplicationDetails.length > 1 ? 's' : ''} merged)</span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">
                          Matched Intraday/Pending vs Settled
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {log.deduplicationDetails.map((detail, idx) => (
                          <div
                            key={detail.id || `dedup_item_${idx}`}
                            className={`p-3 rounded-lg border shadow-2xs space-y-2 text-xs transition-colors ${
                              detail.restored
                                ? 'bg-emerald-50/40 border-emerald-300'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                              <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                                <span className={`w-2 h-2 rounded-full inline-block ${detail.restored ? 'bg-emerald-600 ring-2 ring-emerald-200' : 'bg-emerald-500'}`}></span>
                                <span>Reconciliation Match #{idx + 1}</span>
                                {detail.restored && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600" />
                                    Active Exception (Restored)
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center space-x-2">
                                <span className="text-[11px] text-slate-500 font-medium">{detail.date}</span>
                                <span className={`font-mono font-bold text-[11px] ${detail.amount < 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
                                  {formatCurrency(detail.amount, detail.currency || baseCurrency)}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                              {/* Kept Active Record */}
                              <div className="bg-emerald-50/50 p-2 rounded-md border border-emerald-100">
                                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide flex items-center space-x-1 mb-1">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Kept (Primary Statement Record)</span>
                                </div>
                                <p className="font-mono text-slate-900 font-semibold break-all leading-tight">
                                  {detail.originalDescription}
                                </p>
                                {detail.category && (
                                  <span className="inline-block mt-1 text-[10px] bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 font-medium">
                                    Category: {detail.category}
                                  </span>
                                )}
                              </div>

                              {/* Purged / Restored Duplicate */}
                              <div className={`p-2 rounded-md border ${
                                detail.restored
                                  ? 'bg-emerald-100/60 border-emerald-300 text-emerald-950'
                                  : 'bg-slate-50 border-slate-200/70'
                              }`}>
                                <div className="text-[10px] font-bold uppercase tracking-wide flex items-center justify-between mb-1">
                                  <span className={`flex items-center space-x-1 ${detail.restored ? 'text-emerald-800' : 'text-slate-500'}`}>
                                    {detail.restored ? (
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Trash2 className="w-3 h-3 text-rose-500" />
                                    )}
                                    <span>{detail.restored ? 'Restored Exception (Preserved in Ledger)' : 'Merged / Purged Record'}</span>
                                  </span>
                                </div>
                                <p className={`font-mono break-all leading-tight font-medium ${
                                  detail.restored ? 'text-emerald-900' : 'text-slate-600 line-through'
                                }`}>
                                  {detail.duplicateDescription}
                                </p>
                                <span className={`inline-block mt-1 text-[10px] font-medium ${detail.restored ? 'text-emerald-700' : 'text-slate-400 italic'}`}>
                                  {detail.restored ? '✓ Excluded from automatic de-duplication rules' : 'Cleared to prevent double-counting'}
                                </span>
                              </div>
                            </div>

                            {/* Matching Reason & Action Bar */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
                              <div className="bg-amber-50/60 px-2.5 py-1.5 rounded-md border border-amber-100 text-[11px] text-amber-900 flex items-start space-x-1.5 flex-1">
                                <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <span className="leading-tight">
                                  <strong className="font-semibold">Match Info: </strong>
                                  {detail.reason || 'Identical amount and account within settlement window, stripped clearinghouse timestamp tags.'}
                                </span>
                              </div>

                              {/* Allow Exception / Undo Buttons */}
                              {detail.restored ? (
                                onUndoRestoreDeduplicationException && (
                                  <button
                                    type="button"
                                    disabled={restoringDetailId === detail.id}
                                    onClick={async () => {
                                      setRestoringDetailId(detail.id);
                                      try {
                                        await onUndoRestoreDeduplicationException(log.id, detail.id);
                                      } finally {
                                        setRestoringDetailId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors flex items-center justify-center space-x-1 self-end sm:self-center disabled:opacity-50"
                                    title="Undo exception and de-duplicate this record again"
                                  >
                                    <X className="w-3 h-3 text-slate-500" />
                                    <span>Undo Exception</span>
                                  </button>
                                )
                              ) : (
                                onRestoreDeduplicationException && (
                                  <button
                                    type="button"
                                    disabled={restoringDetailId === detail.id}
                                    onClick={async () => {
                                      setRestoringDetailId(detail.id);
                                      try {
                                        await onRestoreDeduplicationException(log.id, detail.id);
                                      } finally {
                                        setRestoringDetailId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/90 border border-emerald-300 rounded-md transition-colors flex items-center justify-center space-x-1.5 shadow-2xs self-end sm:self-center disabled:opacity-50"
                                    title="Allow this de-duped transaction to survive as a valid separate record"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>{restoringDetailId === detail.id ? 'Restoring...' : 'Allow Exception (Keep Record)'}</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Audit Note & Recovery guidance */}
                      <div className="p-2.5 rounded-md bg-slate-100/70 text-[11px] text-slate-600 flex items-start space-x-2 border border-slate-200/60">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                        <span className="leading-tight">
                          <strong>Exception Management:</strong> If a specific de-duplication was valid (e.g. two intentional identical payments or transfers), click <strong>"Allow Exception (Keep Record)"</strong> above. This immediately restores the transaction to your ledger and exempts it from future deduplication scans.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {totalSyncLogs > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing <strong className="text-slate-900">{syncStartIndex + 1}</strong> to{' '}
                <strong className="text-slate-900">{Math.min(syncStartIndex + syncPageSize, totalSyncLogs)}</strong> of{' '}
                <strong className="text-slate-900">{totalSyncLogs}</strong> entries
              </span>

              <div className="flex items-center space-x-1.5 ml-2">
                <span className="text-slate-500 font-medium">Per page:</span>
                <select
                  value={syncPageSize}
                  onChange={(e) => {
                    setSyncPageSize(Number(e.target.value));
                    setSyncPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer text-xs"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSyncPage((p) => Math.max(1, p - 1))}
                disabled={validSyncPage <= 1}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="px-2 font-bold text-slate-800">
                Page {validSyncPage} of {totalSyncPages}
              </span>

              <button
                onClick={() => setSyncPage((p) => Math.min(totalSyncPages, p + 1))}
                disabled={validSyncPage >= totalSyncPages}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Custom Sub-Account Modal */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <BankLogo institutionName={addAccountFormData.institutionName} size="md" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Account</h3>
                  <p className="text-xs text-slate-500">Link to {addAccountFormData.institutionName}</p>
                </div>
              </div>
              <button onClick={() => setIsAddAccountModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAccountSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Financial Institution</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chase, Nubank, Itaú"
                  value={addAccountFormData.institutionName}
                  onChange={(e) => setAddAccountFormData({ ...addAccountFormData, institutionName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sapphire Reserve Credit Card"
                  value={addAccountFormData.name}
                  onChange={(e) => setAddAccountFormData({ ...addAccountFormData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Type</label>
                  <select
                    value={addAccountFormData.accountType}
                    onChange={(e) => setAddAccountFormData({ ...addAccountFormData, accountType: e.target.value as AccountType })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="checking">Checking Account</option>
                    <option value="savings">Savings Account</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="investment">Investment</option>
                    <option value="loan">Loan / Mortgage</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Currency</label>
                  <select
                    value={addAccountFormData.currency}
                    onChange={(e) => setAddAccountFormData({ ...addAccountFormData, currency: e.target.value as Currency })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="BRL">BRL (R$)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Initial / Current Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 32189.33"
                    value={addAccountFormData.balance}
                    onChange={(e) => setAddAccountFormData({ ...addAccountFormData, balance: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Starting bank balance (e.g. R$ 32.189,33)</span>
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
                      value={addAccountFormData.mask.replace(/^\.\.\./, '')}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setAddAccountFormData({ ...addAccountFormData, mask: `...${digitsOnly}` });
                      }}
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold tracking-wider text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Exclude from Cash Flow Checkbox */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addAccountFormData.excludeFromCashFlow || addAccountFormData.accountType === 'investment'}
                    onChange={(e) => setAddAccountFormData({ ...addAccountFormData, excludeFromCashFlow: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs block">
                      Exclude from Cash Flow & Budget Tracking
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                      Recommended for Fidelity 401(k), IRA, Morgan Stanley stock plans, and Brokerage accounts. Balances still count fully towards Total Net Worth.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/10"
                >
                  Save Sub-Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Account & Balance</h3>
                  <p className="text-xs text-slate-400">Adjust ledger balance, classification, or account name</p>
                </div>
              </div>
              <button
                onClick={() => setEditingAccount(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAccount} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Financial Institution</label>
                <input
                  type="text"
                  required
                  value={editAccountFormData.institutionName}
                  onChange={(e) => setEditAccountFormData({ ...editAccountFormData, institutionName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Display Name</label>
                <input
                  type="text"
                  required
                  value={editAccountFormData.name}
                  onChange={(e) => setEditAccountFormData({ ...editAccountFormData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Type</label>
                  <select
                    value={editAccountFormData.accountType}
                    onChange={(e) => setEditAccountFormData({ ...editAccountFormData, accountType: e.target.value as AccountType })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="checking">Checking Account</option>
                    <option value="savings">Savings Account</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="investment">Investment / Brokerage</option>
                    <option value="loan">Loan / Mortgage</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Currency</label>
                  <select
                    value={editAccountFormData.currency}
                    onChange={(e) => setEditAccountFormData({ ...editAccountFormData, currency: e.target.value as Currency })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="BRL">BRL (R$)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Current Ledger Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editAccountFormData.balance}
                    onChange={(e) => setEditAccountFormData({ ...editAccountFormData, balance: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Settled bank balance</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account Mask</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 font-mono font-bold text-slate-400 select-none pointer-events-none">
                      ...
                    </span>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={editAccountFormData.mask.replace(/^\.\.\./, '')}
                      onChange={(e) => {
                        setEditAccountFormData({ ...editAccountFormData, mask: `...${e.target.value}` });
                      }}
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold tracking-wider text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Exclude from Cash Flow Checkbox */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAccountFormData.excludeFromCashFlow}
                    onChange={(e) => setEditAccountFormData({ ...editAccountFormData, excludeFromCashFlow: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <div>
                    <span className="font-bold text-slate-800 text-xs block">
                      Exclude from Cash Flow & Budget Tracking
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                      Check this for Fidelity 401(k), IRAs, Morgan Stanley stock plans, or Brokerages. Still contributes fully to Total Net Worth.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/10"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pluggy Connect Modal */}
      <PluggyConnectModal
        isOpen={isPluggyModalOpen}
        onClose={() => setIsPluggyModalOpen(false)}
        onFetchPluggyItem={async (itemId: string) => {
          if (onFetchPluggyItem) {
            return await onFetchPluggyItem(itemId);
          } else {
            await onConnectPluggy('Pluggy Open Finance', itemId);
            return true;
          }
        }}
      />

      {/* Unrecognized Account Review Modal */}
      <UnrecognizedAccountModal
        isOpen={!!unrecognizedAccountModalTarget}
        account={unrecognizedAccountModalTarget}
        onClose={() => setUnrecognizedAccountModalTarget(null)}
        onSave={onSaveAccount}
        baseCurrency={baseCurrency}
      />
    </div>
  );
};
