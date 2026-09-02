import React, { useState } from 'react';
import { Currency, ExchangeRates, BackupSnapshot, BankAccount } from '../types';
import { formatCurrency } from '../lib/currency';
import {
  Settings, Globe, ShieldCheck, Download, Upload, Trash2,
  RefreshCw, CheckCircle2, Lock, Database, AlertCircle, Clock, Check, X, Calendar, Sparkles
} from 'lucide-react';

interface SettingsTabProps {
  baseCurrency: Currency;
  setBaseCurrency: (c: Currency) => void;
  exchangeRates: ExchangeRates;
  isFetchingRates?: boolean;
  onFetchLiveRates?: () => void;
  onUpdateExchangeRate: (pair: string, rate: number) => Promise<void>;
  backups: BackupSnapshot[];
  onCreateManualBackup: () => Promise<void>;
  onRestoreBackup: (id: string) => Promise<void>;
  onDeleteBackup: (id: string) => Promise<void>;
  onWipeEverything: () => Promise<void>;
  onWipeSandboxData: () => Promise<void>;
  onRestoreSandboxData: () => Promise<void>;
  accounts: BankAccount[];
  onBackfillPlaidAccount: (accountId: string, days: number) => Promise<{ success: boolean; txsCount: number; error?: string }>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  baseCurrency,
  setBaseCurrency,
  exchangeRates,
  isFetchingRates,
  onFetchLiveRates,
  onUpdateExchangeRate,
  backups,
  onCreateManualBackup,
  onRestoreBackup,
  onDeleteBackup,
  onWipeEverything,
  onWipeSandboxData,
  onRestoreSandboxData,
  accounts,
  onBackfillPlaidAccount,
}) => {
  const [usdBrlRate, setUsdBrlRate] = useState(exchangeRates.rates['USD_BRL'] || 5.75);
  const [isSavedRate, setIsSavedRate] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Plaid Manual Backfill state
  const plaidAccounts = accounts.filter(acc => acc.provider === 'plaid');
  const [selectedPlaidAccount, setSelectedPlaidAccount] = useState<string>(
    plaidAccounts.length > 0 ? plaidAccounts[0].id : ''
  );
  const [backfillDays, setBackfillDays] = useState<number>(365);
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const [backfillResult, setBackfillResult] = useState<{ success: boolean; txsCount: number; error?: string } | null>(null);

  const handleTriggerBackfill = async () => {
    if (!selectedPlaidAccount) return;
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await onBackfillPlaidAccount(selectedPlaidAccount, backfillDays);
      setBackfillResult(res);
    } catch (err: any) {
      setBackfillResult({ success: false, txsCount: 0, error: err.message || 'Backfill failed.' });
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usdBrlRate > 0) {
      await onUpdateExchangeRate('USD_BRL', usdBrlRate);
      await onUpdateExchangeRate('BRL_USD', 1 / usdBrlRate);
      setIsSavedRate(true);
      setTimeout(() => setIsSavedRate(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Base Currency & Exchange Rates */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">Base Currency & FX Conversion</h3>
          <p className="text-xs text-slate-500">Configure global dashboard reporting currency and conversion rates</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Base Currency Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Reporting Base Currency</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setBaseCurrency('USD')}
                className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  baseCurrency === 'USD'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <span className="block text-sm">USD ($)</span>
                <span className="text-[10px] text-slate-400 font-normal">United States Dollar</span>
              </button>

              <button
                onClick={() => setBaseCurrency('BRL')}
                className={`p-3 rounded-xl border text-xs font-bold transition-all text-left ${
                  baseCurrency === 'BRL'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <span className="block text-sm">BRL (R$)</span>
                <span className="text-[10px] text-slate-400 font-normal">Real Brasileiro</span>
              </button>
            </div>
          </div>

          {/* USD / BRL Rate Editor & Live API */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">USD / BRL Exchange Rate</label>
              {onFetchLiveRates && (
                <button
                  type="button"
                  onClick={onFetchLiveRates}
                  disabled={isFetchingRates}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetchingRates ? 'animate-spin' : ''}`} />
                  <span>{isFetchingRates ? 'Fetching...' : 'Fetch Live FX API'}</span>
                </button>
              )}
            </div>

            <form onSubmit={handleRateSubmit} className="space-y-3 text-xs">
              <div className="flex space-x-2">
                <input
                  type="number"
                  step="0.0001"
                  value={usdBrlRate}
                  onChange={(e) => setUsdBrlRate(parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-800"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
                >
                  Save Override
                </button>
              </div>
              {isSavedRate && (
                <p className="text-[11px] text-emerald-600 font-semibold flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Exchange rate updated!
                </p>
              )}
            </form>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span>Free FX API Status:</span>
                <span className="text-emerald-600 font-bold">open.er-api.com</span>
              </div>
              <p>Last Updated: {exchangeRates.lastUpdated ? new Date(exchangeRates.lastUpdated).toLocaleString() : 'Just now'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sandbox & Production Data Isolation */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold text-slate-900">Sandbox / Demo Data Segregation</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Environment Control
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Isolate dummy sandbox data from live production accounts. Wipe mock data before going into production or re-seed it anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Wipe Sandbox Data Only */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col justify-between">
            <div>
              <Trash2 className="w-6 h-6 text-amber-700 mb-2" />
              <h4 className="font-bold text-slate-900">Wipe Sandbox Data Only</h4>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Removes all sample accounts (Chase, Wise, Fidelity, Nubank, Itaú) without affecting your custom or live accounts.
              </p>
            </div>
            <button
              onClick={onWipeSandboxData}
              className="mt-4 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-xs"
            >
              Clear Sandbox Data
            </button>
          </div>

          {/* Restore Full Sandbox Suite */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex flex-col justify-between">
            <div>
              <Database className="w-6 h-6 text-emerald-600 mb-2" />
              <h4 className="font-bold text-slate-900">Reload / Add Back Sandbox Suite</h4>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Re-instantiates complete sample set (Chase 3 accounts, Wise 2 balances, Fidelity 2 accounts, Nubank, Itaú).
              </p>
            </div>
            <button
              onClick={onRestoreSandboxData}
              className="mt-4 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs"
            >
              Restore Sandbox Suite
            </button>
          </div>

          {/* Complete Database Reset */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 flex flex-col justify-between">
            <div>
              <AlertCircle className="w-6 h-6 text-rose-600 mb-2" />
              <h4 className="font-bold text-slate-900">Complete Blank Slate Wipe</h4>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Wipes all stored records (sandbox & production) to prepare for clean production rollout.
              </p>
            </div>
            <button
              onClick={onWipeEverything}
              className="mt-4 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-xs"
            >
              Wipe Everything
            </button>
          </div>
        </div>
      </div>

      {/* Plaid Manual Historical Backfill */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>Plaid Manual Historical Backfill</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Standard Plaid sync retrieves the last 30 to 90 days. Retrieve older transactions up to Plaid's maximum limit of 730 days.
          </p>
        </div>

        {plaidAccounts.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-xl text-center border border-slate-100">
            <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No Plaid Accounts Connected</p>
            <p className="text-xs text-slate-500 mt-1">
              Connect a Plaid account first in the Accounts screen to trigger a historical backfill.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Select Plaid Account
                </label>
                <select
                  value={selectedPlaidAccount}
                  onChange={(e) => {
                    setSelectedPlaidAccount(e.target.value);
                    setBackfillResult(null);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 bg-white shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {plaidAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.institutionName || 'Plaid Bank'} — {acc.name} ({acc.mask ? `...${acc.mask}` : 'no mask'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Backfill Range
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[90, 180, 365].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        setBackfillDays(days);
                        setBackfillResult(null);
                      }}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                        backfillDays === days
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                      }`}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                This triggers a secure API request to pull up to <span className="font-bold text-slate-700">{backfillDays} days</span> of transaction history.
              </div>
              <button
                type="button"
                disabled={isBackfilling}
                onClick={handleTriggerBackfill}
                className={`px-4 py-2 rounded-xl text-white font-bold text-xs transition-all shadow-xs flex items-center space-x-1.5 ${
                  isBackfilling
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {isBackfilling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Backfilling Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Request Historical Backfill</span>
                  </>
                )}
              </button>
            </div>

            {backfillResult && (
              <div
                className={`p-4 rounded-xl border text-xs transition-all ${
                  backfillResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-start space-x-2">
                  {backfillResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold">
                      {backfillResult.success ? 'Backfill Successful!' : 'Backfill Failed'}
                    </span>
                    <p className="mt-1">
                      {backfillResult.success
                        ? `Retrieved and integrated ${backfillResult.txsCount} transactions into your database over the requested ${backfillDays}-day period.`
                        : backfillResult.error || 'An unknown error occurred.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Database Backup & Restore */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Local Database Backups</h3>
            <p className="text-xs text-slate-500">Automated daily backups and manual snapshots stored securely in your browser</p>
          </div>
          <button
            onClick={onCreateManualBackup}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors flex items-center space-x-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Create Manual Backup</span>
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100">
            <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-900">No Backups Yet</p>
            <p className="text-xs text-slate-500 mt-1">Automatic backups will appear here every day</p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(backup => (
              <div key={backup.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-lg ${backup.trigger === 'automatic' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {backup.trigger === 'automatic' ? <Clock className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      {backup.trigger === 'automatic' ? 'Auto Backup' : 'Manual Backup'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {backup.createdAtFormatted} • {backup.counts.transactions} txns • {backup.counts.accounts} accounts
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {confirmRestoreId === backup.id ? (
                    <div className="flex items-center space-x-1">
                      <button onClick={() => { onRestoreBackup(backup.id); setConfirmRestoreId(null); }} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors">Sure?</button>
                      <button onClick={() => setConfirmRestoreId(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRestoreId(backup.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-colors"
                    >
                      Restore
                    </button>
                  )}
                  
                  {confirmDeleteId === backup.id ? (
                    <div className="flex items-center space-x-1">
                      <button onClick={() => { onDeleteBackup(backup.id); setConfirmDeleteId(null); }} className="p-1.5 rounded-lg text-white bg-rose-600 hover:bg-rose-500 transition-colors" title="Confirm delete"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setConfirmDeleteId(null)} className="p-1.5 rounded-lg text-slate-700 bg-slate-200 hover:bg-slate-300 transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(backup.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Delete backup"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
