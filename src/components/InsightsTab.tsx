import React, { useState, useEffect } from 'react';
import { AIInsight, Transaction, Category, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../lib/currency';
import {
  analyzeRecurringServices,
  RecurringService,
  SubscriptionFrequency,
  SubscriptionCustomSetting
} from '../lib/subscriptions';
import { AuditSubscriptionModal } from './AuditSubscriptionModal';
import {
  Sparkles, TrendingUp, CheckCircle2,
  Tv, RefreshCw, ArrowUpRight, Check, X,
  ExternalLink, EyeOff, Eye, Info, Calendar, CreditCard,
  Sliders, AlertCircle
} from 'lucide-react';

interface InsightsTabProps {
  insights: AIInsight[];
  transactions: Transaction[];
  categories?: Category[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onRefreshInsights: () => Promise<void>;
  isGeneratingInsights: boolean;
  onNavigateToTransactions?: (search?: string) => void;
}

const STORAGE_KEY_EXCLUDED_SUBS = 'moneta_excluded_subscriptions';
const STORAGE_KEY_CUSTOM_SETTINGS = 'moneta_subscription_custom_settings';

export const InsightsTab: React.FC<InsightsTabProps> = ({
  insights,
  transactions,
  categories = [],
  baseCurrency,
  exchangeRates,
  onRefreshInsights,
  isGeneratingInsights,
  onNavigateToTransactions,
}) => {
  // User excluded subscription services persistence
  const [excludedServiceIds, setExcludedServiceIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXCLUDED_SUBS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // User custom settings (cadence overrides, custom amounts, excluded IAPs)
  const [customSettings, setCustomSettings] = useState<Record<string, SubscriptionCustomSetting>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_SETTINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [activeTab, setActiveTab] = useState<'active' | 'cancelled' | 'inactive'>('active');
  const [cadenceFilter, setCadenceFilter] = useState<'all' | 'weekly_monthly' | 'quarterly_annual'>('all');
  const [auditingService, setAuditingService] = useState<RecurringService | null>(null);

  const handleToggleExclude = (serviceId: string) => {
    setExcludedServiceIds((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId];
      try {
        localStorage.setItem(STORAGE_KEY_EXCLUDED_SUBS, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to save excluded subscriptions', err);
      }
      return next;
    });
  };

  const handleSaveCustomSetting = (serviceId: string, setting: SubscriptionCustomSetting | null) => {
    setCustomSettings((prev) => {
      const next = { ...prev };
      if (!setting) {
        delete next[serviceId];
      } else {
        next[serviceId] = setting;
      }
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM_SETTINGS, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to save custom subscription settings', err);
      }
      return next;
    });
  };

  const handleQuickSetFrequency = (serviceId: string, frequency: SubscriptionFrequency) => {
    setCustomSettings((prev) => {
      const existing = prev[serviceId] || {};
      const next = {
        ...prev,
        [serviceId]: {
          ...existing,
          frequency,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM_SETTINGS, JSON.stringify(next));
      } catch (err) {
        console.error('Failed to save custom subscription settings', err);
      }
      return next;
    });
  };

  // Perform mathematically sound, deduplicated recurring subscription analysis with custom settings applied
  const recurringAnalysis = analyzeRecurringServices(
    transactions,
    categories,
    baseCurrency,
    exchangeRates.rates,
    excludedServiceIds,
    customSettings
  );

  const {
    activeServices,
    cancelledServices,
    inactiveServices,
    totalMonthlyCost,
    totalAnnualCost,
    currencyBreakdown,
    activeCount,
    cancelledCount,
    inactiveCount,
  } = recurringAnalysis;

  // Format currency breakdown string if there are multiple currencies
  const breakdownCurrencies = Object.keys(currencyBreakdown).filter(
    (c) => currencyBreakdown[c] > 0
  );
  const hasMultipleCurrencies = breakdownCurrencies.length > 1;

  // Split weekly & monthly from quarterly & annual
  const weeklyAndMonthlyServices = activeServices.filter(
    (s) => s.frequency === 'weekly' || s.frequency === 'biweekly' || s.frequency === 'monthly'
  );
  const quarterlyAndAnnualServices = activeServices.filter(
    (s) => s.frequency === 'quarterly' || s.frequency === 'yearly'
  );

  const weeklyMonthlyTotal = weeklyAndMonthlyServices.reduce((acc, s) => acc + s.monthlyCostInBase, 0);
  const quarterlyAnnualMonthlyTotal = quarterlyAndAnnualServices.reduce((acc, s) => acc + s.monthlyCostInBase, 0);
  const quarterlyAnnualAnnualTotal = quarterlyAnnualMonthlyTotal * 12;

  // Keep auditingService synced with freshly recomputed data if open
  const currentAuditingService = auditingService
    ? recurringAnalysis.services.find((s) => s.id === auditingService.id) || auditingService
    : null;

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 border border-purple-800/50 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight mt-1">Personalized Financial Advisor</h2>
            <p className="text-xs text-purple-200 mt-1 max-w-xl">
              AI analyzes your full transaction history across USD and BRL to audit recurring charges, catch spending spikes, and surface actionable optimization tips.
            </p>
          </div>

          <button
            onClick={onRefreshInsights}
            disabled={isGeneratingInsights}
            className="px-5 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 flex items-center space-x-2 shrink-0"
          >
            <Sparkles className={`w-4 h-4 ${isGeneratingInsights ? 'animate-spin' : ''}`} />
            <span>{isGeneratingInsights ? 'Analyzing Finances...' : 'Generate Fresh AI Insights'}</span>
          </button>
        </div>
      </div>

      {/* Subscriptions & Recurring Charges Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Active Subscriptions & Recurring Charges</h3>
              </div>
            </div>
          </div>

          {/* Monthly Run Rate Metric */}
          <div className="flex items-center space-x-4 bg-purple-50/70 p-3 rounded-xl border border-purple-100 self-start md:self-auto">
            <div className="text-right">
              <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider block">
                Monthly
              </span>
              <div className="text-xl font-extrabold text-purple-950">
                {formatCurrency(totalMonthlyCost, baseCurrency)}
                <span className="text-xs font-normal text-purple-700">/mo</span>
              </div>
              {hasMultipleCurrencies && (
                <div className="flex flex-col space-y-0.5 mt-1 text-[10px] text-purple-800 font-semibold text-right">
                  {breakdownCurrencies.map((curr) => (
                    <div key={curr} className="leading-tight">
                      {curr} {formatCurrency(currencyBreakdown[curr], curr as Currency)}/mo
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-purple-200/80" />

            <div className="text-right">
              <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider block">
                Annual
              </span>
              <div className="text-sm font-bold text-purple-900">
                ≈ {formatCurrency(totalAnnualCost, baseCurrency)}/yr
              </div>
              <span className="text-[10px] text-purple-700 font-semibold block">
                {activeCount} active service{activeCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs: Active vs Cancelled vs Past & Excluded */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'active'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Active</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'active' ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {activeCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('cancelled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'cancelled'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Cancelled</span>
              {cancelledCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    activeTab === 'cancelled' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {cancelledCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('inactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                activeTab === 'inactive'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Past & Excluded</span>
              {inactiveCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    activeTab === 'inactive' ? 'bg-purple-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {inactiveCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'active' && (
            <div className="flex items-center space-x-1 bg-slate-100/90 p-0.5 rounded-lg self-start sm:self-auto">
              <button
                onClick={() => setCadenceFilter('all')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                  cadenceFilter === 'all'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({activeCount})
              </button>
              <button
                onClick={() => setCadenceFilter('weekly_monthly')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center space-x-1 ${
                  cadenceFilter === 'weekly_monthly'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Monthly & Weekly</span>
                <span className="text-[10px] px-1 py-0.2 bg-purple-100 text-purple-800 rounded-full font-bold">
                  {weeklyAndMonthlyServices.length}
                </span>
              </button>
              <button
                onClick={() => setCadenceFilter('quarterly_annual')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all flex items-center space-x-1 ${
                  cadenceFilter === 'quarterly_annual'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Quarterly & Annual</span>
                <span className="text-[10px] px-1 py-0.2 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                  {quarterlyAndAnnualServices.length}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Active Subscriptions View */}
        {activeTab === 'active' && (
          <div>
            {activeServices.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <RefreshCw className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No active recurring subscriptions detected</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  Flag recurring bills in the Transactions tab or categorize them under Subscriptions to track them here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Monthly & Weekly Section */}
                {(cadenceFilter === 'all' || cadenceFilter === 'weekly_monthly') && weeklyAndMonthlyServices.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-0.5">
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Monthly & Weekly
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800">
                          {weeklyAndMonthlyServices.length}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-800">
                        {formatCurrency(weeklyMonthlyTotal, baseCurrency)}
                        <span className="text-[10px] text-slate-400 font-normal">/mo</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {weeklyAndMonthlyServices.map((sub) => {
                        const isConverted = sub.currency !== baseCurrency;
                        return (
                          <div
                            key={sub.id}
                            className="p-3 rounded-xl border border-slate-200 bg-white hover:border-purple-300 hover:shadow-xs transition-all flex flex-col justify-between"
                          >
                            <div className="flex flex-col items-start text-left space-y-2 w-full">
                              <div className="flex items-start justify-between gap-1.5 w-full">
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="flex items-center gap-1">
                                    <h5 className="font-bold text-slate-900 text-xs truncate" title={sub.cleanName}>
                                      {sub.cleanName}
                                    </h5>
                                    {sub.isManuallyOverridden && (
                                      <span
                                        className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200/80 px-1 py-0.2 rounded shrink-0"
                                        title="Custom cadence or rate applied"
                                      >
                                        Manual
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 block truncate leading-tight mt-0.5 text-left" title={sub.accountName}>
                                    {sub.accountName}
                                  </span>
                                </div>

                                <select
                                  value={sub.frequency}
                                  onChange={(e) => handleQuickSetFrequency(sub.id, e.target.value as SubscriptionFrequency)}
                                  className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-100 hover:bg-slate-200/70 text-slate-700 border border-slate-200/80 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400 shrink-0"
                                  title="Change cadence"
                                >
                                  <option value="weekly">Weekly</option>
                                  <option value="biweekly">Bi-weekly</option>
                                  <option value="monthly">Monthly</option>
                                  <option value="quarterly">Quarterly</option>
                                  <option value="yearly">Annual</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </div>

                              {/* Middle Section: Top-Left Aligned (monthly amount, last charge, number subs) */}
                              <div className="flex flex-col items-start text-left w-full space-y-0.5">
                                <div className="flex items-baseline gap-1 text-left">
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {formatCurrency(sub.monthlyCost, sub.currency)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-normal">/mo</span>
                                  {isConverted && (
                                    <span className="text-[10px] font-bold text-purple-700 ml-1">
                                      ≈ {formatCurrency(sub.monthlyCostInBase, baseCurrency)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 text-left">
                                  Last charge: {sub.lastDate}
                                </div>

                                {/* 3-Month Rolling Consolidation badge if multiple streams detected */}
                                {sub.tiers && sub.tiers.length > 1 && sub.frequency !== 'yearly' && sub.frequency !== 'quarterly' && (
                                  <div className="flex flex-wrap items-center gap-1 pt-1">
                                    <span
                                      className="text-[9px] font-bold text-purple-800 bg-purple-50 border border-purple-200/80 px-1.5 py-0.5 rounded flex items-center gap-1"
                                      title="Consolidated from 3-month rolling history"
                                    >
                                      <span>{sub.tiers.length} subs</span>
                                      <span className="font-normal text-purple-600 font-mono">
                                        ({sub.tiers.map((t) => formatCurrency(t.amount, sub.currency)).join(' + ')})
                                      </span>
                                    </span>
                                    {sub.pendingThisMonthCount && sub.pendingThisMonthCount > 0 ? (
                                      <span
                                        className="text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded"
                                        title="Expected to hit later in this billing cycle based on 3-month rolling history"
                                      >
                                        {sub.pendingThisMonthCount} pending
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 mt-2 border-t border-slate-100 w-full">
                              <div>
                                <button
                                  onClick={() => setAuditingService(sub)}
                                  className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 flex items-center space-x-1 hover:underline"
                                >
                                  <Sliders className="w-2.5 h-2.5" />
                                  <span>Audit</span>
                                </button>
                                {sub.oneTimeExcludedCount > 0 && (
                                  <button
                                    onClick={() => setAuditingService(sub)}
                                    className="text-[10px] text-amber-700 hover:text-amber-900 hover:underline font-medium block mt-0.5 text-left"
                                    title="Click to view or edit excluded charges"
                                  >
                                    {sub.oneTimeExcludedCount} excluded
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center space-x-1">
                                {onNavigateToTransactions && (
                                  <button
                                    onClick={() => onNavigateToTransactions(sub.cleanName)}
                                    title="Find all transactions for this service in ledger"
                                    className="p-1 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors text-slate-400"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleToggleExclude(sub.id)}
                                  title="Exclude from recurring calculations"
                                  className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors text-slate-400"
                                >
                                  <EyeOff className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quarterly & Annual Section */}
                {(cadenceFilter === 'all' || cadenceFilter === 'quarterly_annual') && quarterlyAndAnnualServices.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between px-0.5">
                      <div className="flex items-center space-x-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Quarterly & Annual
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800">
                          {quarterlyAndAnnualServices.length}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-800">
                          {formatCurrency(quarterlyAnnualMonthlyTotal, baseCurrency)}
                          <span className="text-[10px] text-slate-400 font-normal">/mo</span>
                        </div>
                        <div className="text-[9px] text-slate-400 leading-tight">
                          ≈ {formatCurrency(quarterlyAnnualAnnualTotal, baseCurrency)}/yr renewals
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {quarterlyAndAnnualServices.map((sub) => {
                        const isConverted = sub.currency !== baseCurrency;
                        const cycleAmount = sub.regularAmount;
                        const cycleUnit = sub.frequency === 'yearly' ? 'yr' : 'qtr';
                        const convertedCycleAmount = convertCurrency(
                          cycleAmount,
                          sub.currency,
                          baseCurrency,
                          exchangeRates.rates
                        );

                        return (
                          <div
                            key={sub.id}
                            className="p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col justify-between"
                          >
                            <div className="flex flex-col items-start text-left space-y-2 w-full">
                              <div className="flex items-start justify-between gap-1.5 w-full">
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="flex items-center gap-1">
                                    <h5 className="font-bold text-slate-900 text-xs truncate" title={sub.cleanName}>
                                      {sub.cleanName}
                                    </h5>
                                    {sub.isManuallyOverridden && (
                                      <span
                                        className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-1 py-0.2 rounded shrink-0"
                                        title="Custom cadence or rate applied"
                                      >
                                        Manual
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 block truncate leading-tight mt-0.5 text-left" title={sub.accountName}>
                                    {sub.accountName}
                                  </span>
                                </div>

                                <select
                                  value={sub.frequency}
                                  onChange={(e) => handleQuickSetFrequency(sub.id, e.target.value as SubscriptionFrequency)}
                                  className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-100 hover:bg-slate-200/70 text-slate-700 border border-slate-200/80 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 shrink-0"
                                  title="Change cadence"
                                >
                                  <option value="weekly">Weekly</option>
                                  <option value="biweekly">Bi-weekly</option>
                                  <option value="monthly">Monthly</option>
                                  <option value="quarterly">Quarterly</option>
                                  <option value="yearly">Annual</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </div>

                              {/* Middle Section: Top-Left Aligned (Quarterly/Annual amount, last charge, number subs) */}
                              <div className="flex flex-col items-start text-left w-full space-y-0.5">
                                <div className="flex items-baseline gap-1 text-left">
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {formatCurrency(cycleAmount, sub.currency)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-normal">/{cycleUnit}</span>
                                  {isConverted && (
                                    <span className="text-[10px] font-bold text-indigo-700 ml-1">
                                      ≈ {formatCurrency(convertedCycleAmount, baseCurrency)}/{cycleUnit}
                                    </span>
                                  )}
                                </div>

                                <div className="text-[10px] text-slate-400 text-left">
                                  Last charge: {sub.lastDate}
                                </div>

                                {/* 3-Month Rolling Consolidation badge if multiple streams detected */}
                                {sub.tiers && sub.tiers.length > 1 && sub.frequency !== 'yearly' && sub.frequency !== 'quarterly' && (
                                  <div className="flex flex-wrap items-center gap-1 pt-1">
                                    <span
                                      className="text-[9px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 rounded flex items-center gap-1"
                                      title="Consolidated from 3-month rolling history"
                                    >
                                      <span>{sub.tiers.length} subs</span>
                                      <span className="font-normal text-indigo-600 font-mono">
                                        ({sub.tiers.map((t) => formatCurrency(t.amount, sub.currency)).join(' + ')})
                                      </span>
                                    </span>
                                    {sub.pendingThisMonthCount && sub.pendingThisMonthCount > 0 ? (
                                      <span
                                        className="text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded"
                                        title="Expected to hit later in this billing cycle based on 3-month rolling history"
                                      >
                                        {sub.pendingThisMonthCount} pending
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 mt-2 border-t border-slate-100 w-full">
                              <div>
                                <button
                                  onClick={() => setAuditingService(sub)}
                                  className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 flex items-center space-x-1 hover:underline"
                                >
                                  <Sliders className="w-2.5 h-2.5" />
                                  <span>Audit</span>
                                </button>
                                {sub.oneTimeExcludedCount > 0 && (
                                  <button
                                    onClick={() => setAuditingService(sub)}
                                    className="text-[10px] text-amber-700 hover:text-amber-900 hover:underline font-medium block mt-0.5 text-left"
                                    title="Click to view or edit excluded charges"
                                  >
                                    {sub.oneTimeExcludedCount} excluded
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center space-x-1">
                                {onNavigateToTransactions && (
                                  <button
                                    onClick={() => onNavigateToTransactions(sub.cleanName)}
                                    title="Find all transactions for this service in ledger"
                                    className="p-1 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors text-slate-400"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleToggleExclude(sub.id)}
                                  title="Exclude from recurring calculations"
                                  className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors text-slate-400"
                                >
                                  <EyeOff className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Cancelled Subscriptions View */}
        {activeTab === 'cancelled' && (
          <div>
            {cancelledServices.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No cancelled subscriptions</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  Services marked as "Cancelled" in the cadence dropdown or audit modal will be listed here. They remain tracked from your 90-day history but are zeroed out from your recurring run rate.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {cancelledServices.map((sub) => {
                  const isConverted = sub.currency !== baseCurrency;
                  const wasUnit = sub.frequency === 'yearly' ? 'yr' : sub.frequency === 'quarterly' ? 'qtr' : 'mo';
                  const wasConverted = convertCurrency(
                    sub.regularAmount,
                    sub.currency,
                    baseCurrency,
                    exchangeRates.rates
                  );

                  return (
                    <div
                      key={sub.id}
                      className="p-3 rounded-xl border border-rose-200 bg-rose-50/30 hover:bg-rose-50/50 transition-colors flex flex-col justify-between"
                    >
                      <div className="flex flex-col items-start text-left space-y-2 w-full">
                        <div className="flex items-start justify-between gap-1.5 w-full">
                          <div className="min-w-0 flex-1 text-left">
                            <h5 className="font-bold text-slate-900 text-xs truncate" title={sub.cleanName}>
                              {sub.cleanName}
                            </h5>
                            <span className="text-[10px] text-slate-400 block truncate leading-tight mt-0.5 text-left" title={sub.accountName}>
                              {sub.accountName}
                            </span>
                          </div>

                          <select
                            value={sub.frequency}
                            onChange={(e) => handleQuickSetFrequency(sub.id, e.target.value as SubscriptionFrequency)}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-white text-rose-800 border border-rose-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-400 shrink-0"
                            title="Change cadence"
                          >
                            <option value="cancelled">Cancelled</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Annual</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="quarterly">Quarterly</option>
                          </select>
                        </div>

                        {/* Middle Section: Top-Left Aligned */}
                        <div className="flex flex-col items-start text-left w-full space-y-0.5">
                          <div className="flex items-baseline gap-1 text-left">
                            <span className="font-extrabold text-slate-700 text-sm">
                              Was {formatCurrency(sub.regularAmount, sub.currency)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal">/{wasUnit}</span>
                            {isConverted && (
                              <span className="text-[10px] font-bold text-rose-700 ml-1">
                                ≈ {formatCurrency(wasConverted, baseCurrency)}/{wasUnit}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 text-left">
                            Last charge: {sub.lastDate} ({sub.daysSinceLastCharge}d ago)
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 mt-2 border-t border-rose-100 w-full">
                        <div>
                          <button
                            onClick={() => setAuditingService(sub)}
                            className="text-[10px] font-semibold text-rose-700 hover:text-rose-900 flex items-center space-x-1 hover:underline"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                            <span>Audit</span>
                          </button>
                          {sub.oneTimeExcludedCount > 0 && (
                            <button
                              onClick={() => setAuditingService(sub)}
                              className="text-[10px] text-amber-700 hover:text-amber-900 hover:underline font-medium block mt-0.5 text-left"
                              title="Click to view or edit excluded charges"
                            >
                              {sub.oneTimeExcludedCount} excluded
                            </button>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5">
                          {onNavigateToTransactions && (
                            <button
                              onClick={() => onNavigateToTransactions(sub.cleanName)}
                              title="Find all transactions for this service in ledger"
                              className="p-1 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors text-slate-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleQuickSetFrequency(sub.id, 'monthly')}
                            title="Reactivate subscription as monthly"
                            className="text-[10px] font-bold text-purple-700 hover:text-purple-900 px-1.5 py-0.5 rounded bg-white hover:bg-purple-50 border border-purple-200 transition-colors"
                          >
                            Reactivate
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Inactive / Excluded Subscriptions View */}
        {activeTab === 'inactive' && (
          <div>
            {inactiveServices.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No excluded or inactive subscriptions</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Services with no recent charges or those manually excluded will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {inactiveServices.map((sub) => {
                  const isUserExcluded = excludedServiceIds.includes(sub.id);
                  const isMarkedOneTime = customSettings[sub.id]?.isOneTimeOnly;
                  return (
                    <div
                      key={sub.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex flex-col items-start text-left space-y-2 w-full">
                        <div className="flex items-start justify-between gap-1.5 w-full">
                          <div className="min-w-0 flex-1 text-left">
                            <h5 className="font-bold text-slate-700 text-xs truncate" title={sub.cleanName}>
                              {sub.cleanName}
                            </h5>
                            <span className="text-[10px] text-slate-400 block truncate leading-tight mt-0.5 text-left" title={sub.accountName}>
                              {sub.accountName}
                            </span>
                          </div>

                          <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-slate-200 text-slate-600 shrink-0">
                            {isMarkedOneTime ? 'Non-Subscription' : isUserExcluded ? 'Manually Excluded' : 'Inactive'}
                          </span>
                        </div>

                        {/* Middle Section: Top-Left Aligned */}
                        <div className="flex flex-col items-start text-left w-full space-y-0.5">
                          <div className="flex items-baseline gap-1 text-left">
                            <span className="text-[10px] text-slate-400">Last amount:</span>
                            <span className="font-bold text-slate-700 text-xs">
                              {sub.frequency === 'yearly'
                                ? `${formatCurrency(sub.regularAmount, sub.currency)}/yr`
                                : sub.frequency === 'quarterly'
                                ? `${formatCurrency(sub.regularAmount, sub.currency)}/qtr`
                                : `${formatCurrency(sub.monthlyCost, sub.currency)}/mo`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 text-left">
                            Last charge: {sub.lastDate}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 mt-2 border-t border-slate-200 w-full">
                        <div>
                          <button
                            onClick={() => setAuditingService(sub)}
                            className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 flex items-center space-x-1"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                            <span>Audit</span>
                          </button>
                          {sub.oneTimeExcludedCount > 0 && (
                            <button
                              onClick={() => setAuditingService(sub)}
                              className="text-[10px] text-amber-700 hover:text-amber-900 hover:underline font-medium block mt-0.5 text-left"
                              title="Click to view or edit excluded charges"
                            >
                              {sub.oneTimeExcludedCount} excluded
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => handleToggleExclude(sub.id)}
                          className="text-[10px] font-bold text-purple-600 hover:text-purple-800 flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Generated Insights Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-bold text-slate-900">AI Financial Insights & Observations</h3>
          </div>
          <span className="text-xs text-slate-400">
            {insights.length} insight{insights.length !== 1 ? 's' : ''} available
          </span>
        </div>

        {insights.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Sparkles className="w-10 h-10 text-purple-400 mx-auto mb-3 animate-pulse" />
            <h4 className="font-bold text-slate-800 text-sm">No insights generated yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Click the "Generate Fresh AI Insights" button above to have AI evaluate your spending habits, recurring subscriptions, and savings potential.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight) => {
              const isOptimization = insight.type === 'optimization' || insight.type === 'saving';
              const isSpike = insight.type === 'spike' || insight.type === 'anomaly';

              return (
                <div
                  key={insight.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    isOptimization
                      ? 'bg-purple-50/40 border-purple-200 hover:border-purple-300'
                      : isSpike
                      ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isOptimization
                            ? 'bg-purple-100 text-purple-800'
                            : isSpike
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {insight.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {insight.date || 'Recent'}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm">{insight.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {insight.description}
                    </p>
                  </div>

                  {insight.impactAmount && (
                    <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Estimated Impact:</span>
                      <span
                        className={`font-bold ${
                          isOptimization ? 'text-purple-700' : 'text-slate-900'
                        }`}
                      >
                        {formatCurrency(insight.impactAmount, baseCurrency)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audit Subscription Modal */}
      <AuditSubscriptionModal
        isOpen={!!auditingService}
        service={currentAuditingService}
        baseCurrency={baseCurrency}
        onClose={() => setAuditingService(null)}
        customSetting={currentAuditingService ? customSettings[currentAuditingService.id] : undefined}
        onSaveCustomSetting={handleSaveCustomSetting}
        onNavigateToTransactions={onNavigateToTransactions}
      />
    </div>
  );
};
