import React, { useState, useMemo, useEffect } from 'react';
import { BankAccount, Currency, ExchangeRates, StockHolding } from '../types';
import { convertCurrency, formatCurrency } from '../lib/currency';
import {
  TrendingUp,
  Plus,
  RefreshCw,
  Building2,
  PieChart,
  DollarSign,
  ShieldCheck,
  Edit2,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ExternalLink,
  Briefcase,
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { safeJsonFetch } from '../lib/api';
import { PlaidConnectButton } from './PlaidConnectButton';

interface InvestmentsTabProps {
  accounts: BankAccount[];
  stockHoldings: StockHolding[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onSaveStockHolding: (holding: StockHolding) => Promise<void>;
  onDeleteStockHolding: (id: string) => Promise<void>;
  onClearAllStockHoldings?: () => Promise<void> | void;
  onSaveAccount: (account: BankAccount) => Promise<void>;
  onConnectPlaid?: (access_token: string, institutionName?: string) => Promise<void>;
  onOpenSyncModal?: () => void;
}

export const InvestmentsTab: React.FC<InvestmentsTabProps> = ({
  accounts,
  stockHoldings,
  baseCurrency,
  exchangeRates,
  onSaveStockHolding,
  onDeleteStockHolding,
  onClearAllStockHoldings,
  onSaveAccount,
  onConnectPlaid,
  onOpenSyncModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);

  // Plaid Link Token Exchange Handler
  const handlePlaidSuccess = async (public_token: string, metadata?: any) => {
    try {
      const connectedInstitution = metadata?.institution?.name || 'Fidelity';
      const res = await safeJsonFetch<any>('/api/plaid/exchange_public_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token, institution: metadata?.institution }),
      });
      if (res.ok && res.data && res.data.access_token) {
        if (onConnectPlaid) {
          await onConnectPlaid(res.data.access_token, connectedInstitution);
        }
      } else {
        console.error('Failed to exchange public token', res.error);
      }
    } catch (err) {
      console.error('Error in Plaid connection flow:', err);
    }
  };

  // Modal State for Manual Stock Entry & Editing
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockFormData, setStockFormData] = useState({
    symbol: '',
    name: '',
    shares: '',
    costBasis: '',
    currentPrice: '',
    currency: 'USD' as Currency,
    institution: 'Computershare',
    notes: '',
  });
  const [isLookingUpQuote, setIsLookingUpQuote] = useState(false);
  const [quoteLookupFeedback, setQuoteLookupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter investment accounts (Fidelity, Morgan Stanley, Brokerages, 401ks)
  const investmentAccounts = useMemo(() => {
    return accounts.filter(
      (acc) => acc.accountType === 'investment' || acc.excludeFromCashFlow
    );
  }, [accounts]);

  // Calculate totals
  const totalAccountInvestments = useMemo(() => {
    return investmentAccounts.reduce((sum, acc) => {
      const val = convertCurrency(acc.balance, acc.currency, baseCurrency, exchangeRates.rates);
      return sum + val;
    }, 0);
  }, [investmentAccounts, baseCurrency, exchangeRates]);

  const { totalStockValue, totalStockCost, totalStockGain, totalStockGainPercent } = useMemo(() => {
    let value = 0;
    let cost = 0;
    stockHoldings.forEach((s) => {
      const currentTotal = s.shares * s.currentPrice;
      const costTotal = s.shares * s.costBasis;
      const convertedCurrent = convertCurrency(currentTotal, s.currency, baseCurrency, exchangeRates.rates);
      const convertedCost = convertCurrency(costTotal, s.currency, baseCurrency, exchangeRates.rates);
      value += convertedCurrent;
      cost += convertedCost;
    });

    const gain = value - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    return {
      totalStockValue: value,
      totalStockCost: cost,
      totalStockGain: gain,
      totalStockGainPercent: gainPct,
    };
  }, [stockHoldings, baseCurrency, exchangeRates]);

  const grandTotalInvestments = totalAccountInvestments + totalStockValue;

  // Search filtered holdings
  const filteredHoldings = useMemo(() => {
    if (!searchTerm.trim()) return stockHoldings;
    const q = searchTerm.toLowerCase();
    return stockHoldings.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.institution && s.institution.toLowerCase().includes(q))
    );
  }, [stockHoldings, searchTerm]);

  // Lookup market quote for symbol
  const handleLookupQuote = async (symbolToLookup: string) => {
    const sym = symbolToLookup.trim().toUpperCase();
    if (!sym) return;
    setIsLookingUpQuote(true);
    setQuoteLookupFeedback(null);
    try {
      const res = await safeJsonFetch<any>(`/api/investments/quote?symbol=${encodeURIComponent(sym)}`);
      if (res.ok && res.data && res.data.price) {
        setStockFormData((prev) => ({
          ...prev,
          symbol: sym,
          name: prev.name.trim() ? prev.name : res.data.name || `${sym} Equity`,
          currentPrice: String(res.data.price),
        }));
        setQuoteLookupFeedback({
          type: 'success',
          message: `Live market price found: $${Number(res.data.price).toFixed(2)} (${res.data.name || sym})`,
        });
      } else {
        setQuoteLookupFeedback({
          type: 'error',
          message: res.error || `Could not find live quote for "${sym}". Please enter price manually.`,
        });
      }
    } catch (err: any) {
      console.warn('Quote lookup error:', err);
      setQuoteLookupFeedback({
        type: 'error',
        message: err.message || `Failed to fetch quote for "${sym}".`,
      });
    } finally {
      setIsLookingUpQuote(false);
    }
  };

  // Refresh all market quotes
  const handleRefreshAllQuotes = async () => {
    if (stockHoldings.length === 0) return;
    setIsRefreshingQuotes(true);
    setRefreshMessage(null);
    let updatedCount = 0;

    try {
      for (const holding of stockHoldings) {
        try {
          const res = await safeJsonFetch<any>(`/api/investments/quote?symbol=${encodeURIComponent(holding.symbol)}`);
          if (res.ok && res.data && res.data.price) {
            await onSaveStockHolding({
              ...holding,
              currentPrice: res.data.price,
              name: res.data.name || holding.name,
              lastUpdated: new Date().toISOString(),
            });
            updatedCount++;
          }
        } catch {
          // ignore single quote failure
        }
      }
      setRefreshMessage(`Updated ${updatedCount} market quote${updatedCount === 1 ? '' : 's'} successfully`);
      setTimeout(() => setRefreshMessage(null), 4000);
    } finally {
      setIsRefreshingQuotes(false);
    }
  };

  // Open modal for new stock
  const handleOpenNewStockModal = (prefillInstitution: string = 'Computershare') => {
    setEditingStockId(null);
    setQuoteLookupFeedback(null);
    setStockFormData({
      symbol: '',
      name: '',
      shares: '',
      costBasis: '',
      currentPrice: '',
      currency: 'USD',
      institution: prefillInstitution,
      notes: '',
    });
    setIsStockModalOpen(true);
  };

  // Open modal for editing existing stock
  const handleOpenEditStockModal = (holding: StockHolding) => {
    setEditingStockId(holding.id);
    setQuoteLookupFeedback(null);
    setStockFormData({
      symbol: holding.symbol,
      name: holding.name,
      shares: String(holding.shares),
      costBasis: String(holding.costBasis),
      currentPrice: String(holding.currentPrice),
      currency: holding.currency,
      institution: holding.institution || 'Computershare',
      notes: holding.notes || '',
    });
    setIsStockModalOpen(true);
  };

  // Save stock holding
  const handleStockFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sharesNum = parseFloat(stockFormData.shares);
    const costBasisNum = parseFloat(stockFormData.costBasis);
    const currentPriceNum = parseFloat(stockFormData.currentPrice);

    if (!stockFormData.symbol.trim() || isNaN(sharesNum) || sharesNum <= 0) {
      return;
    }

    const holding: StockHolding = {
      id: editingStockId || `stock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      symbol: stockFormData.symbol.trim().toUpperCase(),
      name: stockFormData.name.trim() || stockFormData.symbol.trim().toUpperCase(),
      shares: sharesNum,
      costBasis: isNaN(costBasisNum) ? currentPriceNum || 0 : costBasisNum,
      currentPrice: isNaN(currentPriceNum) ? costBasisNum || 0 : currentPriceNum,
      currency: stockFormData.currency,
      institution: stockFormData.institution.trim() || 'Morgan Stanley at Work',
      notes: stockFormData.notes.trim(),
      lastUpdated: new Date().toISOString(),
    };

    await onSaveStockHolding(holding);
    setIsStockModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Fidelity & Morgan Stanley Investment Hub */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Investment Portfolio & Equities
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-2">
              Retirement, Brokerage & Stock Plans
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Unified tracking for Fidelity retirement (401k, IRA), brokerage accounts, Morgan Stanley at Work equity plans, and custom stock holdings. Kept distinct from everyday cash flow to prevent skewing living expense metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleOpenNewStockModal('Morgan Stanley at Work')}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Enter Stock / Shares</span>
            </button>

            {onConnectPlaid && (
              <PlaidConnectButton
                onSuccess={handlePlaidSuccess}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs flex items-center space-x-2 transition-all cursor-pointer"
                title="Link investment accounts via Plaid Investments API"
                label="Link via Plaid"
                icon={<Building2 className="w-4 h-4 text-emerald-400" />}
              />
            )}
          </div>
        </div>

        {/* Hero Metrics Strip */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Investments Value
            </span>
            <span className="text-2xl font-black text-white mt-1 block">
              {formatCurrency(grandTotalInvestments, baseCurrency)}
            </span>
            <span className="text-[10px] text-emerald-400 font-medium mt-0.5 block flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1 inline" /> Unified in Net Worth
            </span>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Investment Accounts
            </span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">
              {formatCurrency(totalAccountInvestments, baseCurrency)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {investmentAccounts.length} investment account{investmentAccounts.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Stocks & Equity Value
            </span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">
              {formatCurrency(totalStockValue, baseCurrency)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {stockHoldings.length} position{stockHoldings.length === 1 ? '' : 's'} held
            </span>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Unrealized Stock Return
            </span>
            <div className="flex items-center space-x-1.5 mt-1">
              <span className={`text-xl font-bold ${totalStockGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalStockGain >= 0 ? '+' : ''}{formatCurrency(totalStockGain, baseCurrency)}
              </span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                totalStockGain >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {totalStockGainPercent >= 0 ? '+' : ''}{totalStockGainPercent.toFixed(1)}%
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Based on cost basis vs live price
            </span>
          </div>
        </div>
      </div>

      {/* Cash Flow Separation Notice Card */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-900">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-amber-900">Clean Separation Active:</span>
          <p className="text-amber-800/90 leading-relaxed">
            All balances shown below contribute 100% to your <strong>Total Net Worth</strong> on the Overview dashboard. However, their internal movements and growth are excluded from your monthly cash flow, living expenses, and category budget calculations so your day-to-day spending picture stays crystal clear.
          </p>
        </div>
      </div>

      {/* Stock Holdings Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Stock & Equity Holdings</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {stockHoldings.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Individual equity positions, company stock awards, and index funds with live quote support
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44 sm:w-56"
              />
            </div>

            {/* Refresh Quotes Button */}
            <button
              onClick={handleRefreshAllQuotes}
              disabled={isRefreshingQuotes || stockHoldings.length === 0}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh live market prices for all tracked equities"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshingQuotes ? 'animate-spin' : ''}`} />
              <span>{isRefreshingQuotes ? 'Fetching...' : 'Update Quotes'}</span>
            </button>

            {/* Erase All Holdings Button (available when holdings exist) */}
            {stockHoldings.length > 0 && (
              isConfirmingClearAll ? (
                <div className="flex items-center space-x-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1 animate-in fade-in duration-150">
                  <span className="text-[11px] text-rose-800 font-bold">Erase all {stockHoldings.length} holding(s)?</span>
                  <button
                    onClick={async () => {
                      setIsConfirmingClearAll(false);
                      if (onClearAllStockHoldings) {
                        await onClearAllStockHoldings();
                      }
                    }}
                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    Confirm Erase
                  </button>
                  <button
                    onClick={() => setIsConfirmingClearAll(false)}
                    className="px-1.5 py-0.5 text-slate-500 hover:text-slate-800 text-[10px] font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmingClearAll(true)}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Erase all stock holdings"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Erase All</span>
                </button>
              )
            )}

            {/* Add Stock Button */}
            <button
              onClick={() => handleOpenNewStockModal()}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-sm shadow-emerald-500/10 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stock</span>
            </button>
          </div>
        </div>

        {refreshMessage && (
          <div className="bg-emerald-50 px-5 py-2 border-b border-emerald-100 text-xs text-emerald-800 font-semibold flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{refreshMessage}</span>
          </div>
        )}

        {/* Table of Holdings */}
        {filteredHoldings.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">No stock holdings found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Add your Computershare shares, company equity, index funds, or custom equities.
            </p>
            <button
              onClick={() => handleOpenNewStockModal('Computershare')}
              className="mt-4 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Stock</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Asset / Symbol</th>
                  <th className="py-3 px-4">Custodian / Source</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Current Price</th>
                  <th className="py-3 px-4 text-right">Market Value</th>
                  <th className="py-3 px-4 text-right">Cost Basis</th>
                  <th className="py-3 px-4 text-right">Unrealized Gain/Loss</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHoldings.map((stock) => {
                  const marketVal = stock.shares * stock.currentPrice;
                  const totalCost = stock.shares * stock.costBasis;
                  const gain = marketVal - totalCost;
                  const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
                  const isPositive = gain >= 0;

                  return (
                    <tr key={stock.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-black flex items-center justify-center text-xs shrink-0 tracking-tight">
                            {stock.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 block">{stock.symbol}</span>
                            <span className="text-[11px] text-slate-500 block truncate max-w-[160px]">{stock.name}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] inline-block ${
                          stock.institution.toLowerCase().includes('computershare')
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : stock.institution.toLowerCase().includes('morgan stanley')
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : stock.institution.toLowerCase().includes('fidelity')
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {stock.institution}
                        </span>
                        {stock.notes && (
                          <span className="block text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">{stock.notes}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        {stock.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-800">
                        {formatCurrency(stock.currentPrice, stock.currency)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span className="font-extrabold text-slate-900 block">
                          {formatCurrency(marketVal, stock.currency)}
                        </span>
                        {stock.currency !== baseCurrency && (
                          <span className="text-[10px] text-slate-400 block font-medium">
                            ≈ {formatCurrency(convertCurrency(marketVal, stock.currency, baseCurrency, exchangeRates.rates), baseCurrency)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-500">
                        <span className="block font-medium">{formatCurrency(stock.costBasis, stock.currency)} / sh</span>
                        <span className="text-[10px] text-slate-400 block">Total: {formatCurrency(totalCost, stock.currency)}</span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <span className={`font-bold block ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPositive ? '+' : ''}{formatCurrency(gain, stock.currency)}
                        </span>
                        <span className={`text-[10px] font-semibold block ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPositive ? '+' : ''}{gainPct.toFixed(2)}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleOpenEditStockModal(stock)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit stock position"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteStockHolding(stock.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove position"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Connected Investment Accounts Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Connected Investment & Retirement Accounts</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {investmentAccounts.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Brokerage, 401(k), IRA, and equity plan accounts synced from institutions
            </p>
          </div>

          <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-xl">
            {formatCurrency(totalAccountInvestments, baseCurrency)} Total
          </span>
        </div>

        {investmentAccounts.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No investment accounts connected yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Connect your investment accounts via Plaid, or designate existing accounts as investment accounts on the Accounts tab.
            </p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {investmentAccounts.map((acc) => {
              const converted = convertCurrency(acc.balance, acc.currency, baseCurrency, exchangeRates.rates);

              return (
                <div
                  key={acc.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 truncate pr-2">{acc.name}</span>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {acc.unrecognizedType && (
                          <span
                            className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1"
                            title={acc.classificationWarning || 'Flagged for review in Accounts tab'}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                            <span>Needs Review</span>
                          </span>
                        )}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Net Worth Only
                        </span>
                      </div>
                    </div>

                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      {acc.institutionName} • Mask {acc.mask}
                    </span>

                    <div className="mt-3">
                      <span className="text-xl font-black text-slate-900 block">
                        {formatCurrency(acc.balance, acc.currency)}
                      </span>
                      {acc.currency !== baseCurrency && (
                        <span className="text-[10px] text-slate-400 font-medium block">
                          ≈ {formatCurrency(converted, baseCurrency)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{acc.subtype || acc.accountType}</span>
                    <span className="text-emerald-600 font-semibold flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Cash Flow Excluded
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Stock Entry / Edit Modal */}
      {isStockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingStockId ? 'Edit Stock Position' : 'Add Stock Position'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingStockId ? 'Update quantity, symbol or prices' : 'Enter stock details from Computershare or other custodians'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStockFormSubmit} className="mt-4 space-y-4 text-xs">
              {/* Symbol & Quote Lookup */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ticker Symbol (e.g. MSFT, AAPL, NVDA, VOO)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="MSFT"
                    value={stockFormData.symbol}
                    onChange={(e) => setStockFormData({ ...stockFormData, symbol: e.target.value.toUpperCase() })}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold tracking-wider uppercase text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupQuote(stockFormData.symbol)}
                    disabled={isLookingUpQuote || !stockFormData.symbol.trim()}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold shrink-0 disabled:opacity-50"
                    title="Fetch live market price"
                  >
                    {isLookingUpQuote ? 'Looking...' : 'Fetch Price'}
                  </button>
                </div>
              </div>

              {/* Quick Pick Popular Symbols */}
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                <span className="text-[10px] text-slate-400 font-semibold">Quick picks:</span>
                {['MSFT', 'NVDA', 'AAPL', 'VOO', 'SPY', 'FXAIX', 'GOOGL', 'AMZN'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStockFormData((prev) => ({ ...prev, symbol: s }));
                      handleLookupQuote(s);
                    }}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Quote Lookup Status Banner */}
              {quoteLookupFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 animate-in fade-in duration-150 ${
                    quoteLookupFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {quoteLookupFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span className="font-medium">{quoteLookupFeedback.message}</span>
                </div>
              )}

              {/* Asset Name */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Company / Fund Name</label>
                <input
                  type="text"
                  required
                  placeholder="Microsoft Corporation"
                  value={stockFormData.name}
                  onChange={(e) => setStockFormData({ ...stockFormData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Shares & Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Quantity (Shares)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 50 or 12.554"
                    value={stockFormData.shares}
                    onChange={(e) => setStockFormData({ ...stockFormData, shares: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Currency</label>
                  <select
                    value={stockFormData.currency}
                    onChange={(e) => setStockFormData({ ...stockFormData, currency: e.target.value as Currency })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="BRL">BRL (R$)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              {/* Current Price & Cost Basis */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Current Price / Share</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 435.50"
                    value={stockFormData.currentPrice}
                    onChange={(e) => setStockFormData({ ...stockFormData, currentPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cost Basis / Share</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 380.00"
                    value={stockFormData.costBasis}
                    onChange={(e) => setStockFormData({ ...stockFormData, costBasis: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Purchase/grant price</span>
                </div>
              </div>

              {/* Institution / Custodian */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Custodian / Platform</label>
                <select
                  value={stockFormData.institution}
                  onChange={(e) => setStockFormData({ ...stockFormData, institution: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Computershare">Computershare</option>
                  <option value="Morgan Stanley at Work">Morgan Stanley at Work</option>
                  <option value="Fidelity Investments">Fidelity Investments</option>
                  <option value="Charles Schwab">Charles Schwab</option>
                  <option value="Vanguard">Vanguard</option>
                  <option value="Robinhood">Robinhood</option>
                  <option value="E*TRADE">E*TRADE</option>
                  <option value="Interactive Brokers">Interactive Brokers</option>
                  <option value="Manual / Other">Manual / Other</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Plan Details (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Vested RSUs, ESPP 2026, or 401(k) match"
                  value={stockFormData.notes}
                  onChange={(e) => setStockFormData({ ...stockFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md shadow-emerald-500/10"
                >
                  Save Holding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
