import React, { useState } from 'react';
import { AIInsight, Transaction, Currency, ExchangeRates } from '../types';
import { formatCurrency, convertCurrency } from '../lib/currency';
import {
  Sparkles, TrendingUp, AlertTriangle, CheckCircle2,
  Tv, RefreshCw, ArrowUpRight, ShieldCheck, Coins
} from 'lucide-react';

interface InsightsTabProps {
  insights: AIInsight[];
  transactions: Transaction[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onRefreshInsights: () => Promise<void>;
  isGeneratingInsights: boolean;
}

export const InsightsTab: React.FC<InsightsTabProps> = ({
  insights,
  transactions,
  baseCurrency,
  exchangeRates,
  onRefreshInsights,
  isGeneratingInsights,
}) => {
  // Find recurring transactions (subscriptions)
  const subscriptions = transactions.filter(
    (tx) => tx.isRecurring || tx.tags.includes('recurring') || tx.category.toLowerCase().includes('subscription')
  );

  let totalSubscriptionCost = 0;
  subscriptions.forEach((sub) => {
    totalSubscriptionCost += convertCurrency(Math.abs(sub.amount), sub.currency, baseCurrency, exchangeRates.rates);
  });

  return (
    <div className="space-y-6">
      
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 border border-purple-800/50 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight mt-1">Personalized Financial Advisor</h2>
            <p className="text-xs text-purple-200 mt-1 max-w-xl">
              AI analyzes your full data across USD and BRL to detect recurring charges, spending anomalies, and actionable savings opportunities.
            </p>
          </div>

          <button
            onClick={onRefreshInsights}
            disabled={isGeneratingInsights}
            className="px-5 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            <Sparkles className={`w-4 h-4 ${isGeneratingInsights ? 'animate-spin' : ''}`} />
            <span>{isGeneratingInsights ? 'Analyzing Data...' : 'Run Moneta AI Audit'}</span>
          </button>
        </div>
      </div>

      {/* Subscriptions Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Active Subscriptions & Recurring Charges</h3>
              <p className="text-xs text-slate-500">{subscriptions.length} recurring services detected in your accounts</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block font-medium">Monthly Cost ({baseCurrency})</span>
            <span className="text-lg font-extrabold text-slate-900">
              {formatCurrency(totalSubscriptionCost, baseCurrency)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 text-xs block">{sub.description}</span>
                <span className="text-[10px] text-slate-400">{sub.accountName}</span>
              </div>
              <span className="font-bold text-slate-900 text-xs">
                {formatCurrency(Math.abs(sub.amount), sub.currency)}/mo
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900">AI Generated Insights & Recommendations</h3>

        {insights.map((ins) => {
          let badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
          let icon = <Sparkles className="w-5 h-5 text-purple-600" />;

          if (ins.type === 'spending_spike') {
            badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
            icon = <TrendingUp className="w-5 h-5 text-rose-600" />;
          } else if (ins.type === 'subscription_found') {
            badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
            icon = <Tv className="w-5 h-5 text-blue-600" />;
          } else if (ins.type === 'saving_opportunity') {
            badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
          }

          return (
            <div
              key={ins.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start space-x-4">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex-shrink-0">
                  {icon}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-bold text-slate-900">{ins.title}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                      {ins.type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{ins.description}</p>
                  {ins.suggestedAction && (
                    <p className="text-xs text-emerald-700 font-semibold mt-2 flex items-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Suggested Action: {ins.suggestedAction}
                    </p>
                  )}
                </div>
              </div>

              {ins.impactAmount && ins.currency && (
                <div className="text-right flex-shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium block">Financial Impact</span>
                  <span className="text-base font-extrabold text-slate-900">
                    {formatCurrency(ins.impactAmount, ins.currency)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
