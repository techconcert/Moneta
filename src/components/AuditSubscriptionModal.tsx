import React, { useState, useEffect } from 'react';
import { RecurringService, SubscriptionFrequency, SubscriptionCustomSetting } from '../lib/subscriptions';
import { Currency } from '../types';
import { formatCurrency } from '../lib/currency';
import {
  X, Check, AlertCircle, RotateCcw,
  Calendar, CheckCircle2, Sliders, ExternalLink, HelpCircle, Sparkles
} from 'lucide-react';

interface AuditSubscriptionModalProps {
  isOpen: boolean;
  service: RecurringService | null;
  baseCurrency: Currency;
  onClose: () => void;
  customSetting?: SubscriptionCustomSetting;
  onSaveCustomSetting: (serviceId: string, setting: SubscriptionCustomSetting | null) => void;
  onNavigateToTransactions?: (search?: string) => void;
}

const FREQUENCY_OPTIONS: Array<{
  value: SubscriptionFrequency;
  label: string;
  multiplierText: string;
}> = [
  { value: 'weekly', label: 'Weekly', multiplierText: '×4.33/mo' },
  { value: 'biweekly', label: 'Bi-weekly', multiplierText: '×2.17/mo' },
  { value: 'monthly', label: 'Monthly', multiplierText: '1×/mo' },
  { value: 'quarterly', label: 'Quarterly', multiplierText: '÷3/mo' },
  { value: 'yearly', label: 'Annual', multiplierText: '÷12/mo' },
  { value: 'cancelled', label: 'Cancelled', multiplierText: '0/mo (ended)' },
];

export const AuditSubscriptionModal: React.FC<AuditSubscriptionModalProps> = ({
  isOpen,
  service,
  baseCurrency,
  onClose,
  customSetting,
  onSaveCustomSetting,
  onNavigateToTransactions,
}) => {
  if (!isOpen || !service) return null;

  // Local editing state
  const [selectedFrequency, setSelectedFrequency] = useState<SubscriptionFrequency>(
    customSetting?.frequency || service.frequency
  );
  const [customAmountStr, setCustomAmountStr] = useState<string>(
    customSetting?.customAmount !== undefined
      ? customSetting.customAmount.toString()
      : service.regularAmount.toString()
  );
  const [excludedTxIds, setExcludedTxIds] = useState<string[]>(
    customSetting?.excludedTransactionIds || []
  );
  const [isOneTimeOnly, setIsOneTimeOnly] = useState<boolean>(
    customSetting?.isOneTimeOnly || false
  );

  useEffect(() => {
    if (service) {
      setSelectedFrequency(customSetting?.frequency || service.frequency);
      setCustomAmountStr(
        customSetting?.customAmount !== undefined
          ? customSetting.customAmount.toString()
          : service.regularAmount.toString()
      );
      setExcludedTxIds(customSetting?.excludedTransactionIds || []);
      setIsOneTimeOnly(customSetting?.isOneTimeOnly || false);
    }
  }, [service, customSetting]);

  const parsedAmount = parseFloat(customAmountStr) || service.regularAmount;

  // Real-time preview calculation
  const getPreviewMonthlyCost = (amount: number, freq: SubscriptionFrequency): number => {
    switch (freq) {
      case 'weekly':
        return amount * (52 / 12);
      case 'biweekly':
        return amount * (26 / 12);
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'yearly':
        return amount / 12;
      case 'cancelled':
        return 0;
      default:
        return amount;
    }
  };

  const previewMonthly = getPreviewMonthlyCost(parsedAmount, selectedFrequency);

  // Distinct charge amounts for quick-selection
  const distinctAmounts: number[] = Array.from<number>(
    new Set(service.charges.map((c) => Math.abs(c.amount)))
  ).sort((a, b) => b - a);

  const handleToggleCharge = (txId: string) => {
    setExcludedTxIds((prev) =>
      prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId]
    );
  };

  const handleExcludeNonMatchingAmounts = (targetAmount: number) => {
    const idsToExclude: string[] = [];
    service.charges.forEach((c) => {
      const diff = Math.abs(Math.abs(c.amount) - targetAmount);
      if (diff > 0.05) {
        idsToExclude.push(c.id);
      }
    });
    setExcludedTxIds(idsToExclude);
  };

  const handleSave = () => {
    const hasAnyCustomSetting =
      selectedFrequency !== service.frequency ||
      (parseFloat(customAmountStr) > 0 && parseFloat(customAmountStr) !== service.regularAmount) ||
      excludedTxIds.length > 0 ||
      isOneTimeOnly;

    if (!hasAnyCustomSetting) {
      onSaveCustomSetting(service.id, null);
    } else {
      const newSetting: SubscriptionCustomSetting = {
        frequency: selectedFrequency,
        customAmount: parseFloat(customAmountStr) > 0 ? parseFloat(customAmountStr) : undefined,
        excludedTransactionIds: excludedTxIds,
        isOneTimeOnly,
      };
      onSaveCustomSetting(service.id, newSetting);
    }
    onClose();
  };

  const handleResetToAuto = () => {
    onSaveCustomSetting(service.id, null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-purple-900 to-indigo-950 text-white flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-500/30 text-purple-200 uppercase tracking-wider border border-purple-400/20">
                Subscription & Recurring Audit
              </span>
              <span className="text-xs text-purple-300 font-mono">
                {service.currency}
              </span>
            </div>
            <h3 className="text-xl font-extrabold">{service.cleanName}</h3>
            <p className="text-xs text-purple-200 opacity-90 truncate max-w-md">
              Account: {service.accountName} · {service.charges.length} total charge{service.charges.length !== 1 ? 's' : ''} detected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-purple-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* Cadence Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span>Billing Frequency / Cadence</span>
              </label>
              {selectedFrequency !== service.frequency && (
                <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Custom Cadence Override
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
              {FREQUENCY_OPTIONS.map((opt) => {
                const isSelected = selectedFrequency === opt.value;
                const isCancelledOpt = opt.value === 'cancelled';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setSelectedFrequency(opt.value);
                      if ((opt.value === 'yearly' || opt.value === 'quarterly') && service.charges.length > 0) {
                        const primaryCharge = service.charges.find((c) => Math.abs(c.amount) > 2.0) || service.charges[0];
                        const primaryAmtStr = Math.abs(primaryCharge.amount).toFixed(2);
                        if (!customSetting?.customAmount || parseFloat(customAmountStr) === service.regularAmount) {
                          setCustomAmountStr(primaryAmtStr);
                        }
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      isSelected
                        ? isCancelledOpt
                          ? 'bg-rose-600 text-white border-rose-600 font-bold shadow-sm ring-2 ring-rose-400/20'
                          : 'bg-purple-600 text-white border-purple-600 font-bold shadow-sm ring-2 ring-purple-400/20'
                        : isCancelledOpt
                          ? 'bg-rose-50/60 text-rose-800 border-rose-200 hover:bg-rose-100 font-medium'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    <div className="text-xs">{opt.label}</div>
                    <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/90' : isCancelledOpt ? 'text-rose-600' : 'text-slate-400'}`}>
                      {opt.multiplierText}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              Select cadence or mark as Cancelled if terminated. Cancelled services are tracked in the Cancelled tab and zeroed out from your monthly run rate.
            </p>
          </div>

          {/* Amount and Real-time Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-purple-50/60 border border-purple-100">
            <div>
              <label className="text-xs font-bold text-purple-950 block mb-1.5">
                Regular Billing Amount ({service.currency})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">
                  {service.currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customAmountStr}
                  onChange={(e) => setCustomAmountStr(e.target.value)}
                  className="w-full pl-12 pr-3 py-2 text-sm font-extrabold rounded-lg border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                />
              </div>

              {distinctAmounts.length > 1 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-[10px] text-slate-500 self-center">Detected:</span>
                  {distinctAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCustomAmountStr(amt.toFixed(2))}
                      className="text-[10px] px-2 py-0.5 rounded bg-white hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold transition-colors"
                    >
                      {formatCurrency(amt, service.currency)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center bg-white p-3 rounded-lg border border-purple-200/70 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
                {selectedFrequency === 'cancelled' ? 'Previous Cost' : 'Normalized Monthly Cost'}
              </span>
              {selectedFrequency === 'cancelled' ? (
                <>
                  <div className="text-xl font-extrabold text-slate-700 mt-0.5">
                    Was {formatCurrency(parsedAmount > 0 ? parsedAmount : service.regularAmount, service.currency)}
                  </div>
                  <span className="text-[11px] text-rose-600 font-semibold mt-1">
                    Terminated — not summed in monthly or annual calculations
                  </span>
                </>
              ) : (
                <>
                  <div className="text-xl font-extrabold text-purple-950 mt-0.5">
                    {formatCurrency(previewMonthly, service.currency)}
                    <span className="text-xs font-normal text-slate-500">/month</span>
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1">
                    Cadence: {selectedFrequency.toUpperCase()} ({formatCurrency(parsedAmount, service.currency)} per cycle)
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Annual / Quarterly Notice */}
          {(selectedFrequency === 'yearly' || selectedFrequency === 'quarterly') && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1 text-xs text-emerald-950">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{selectedFrequency === 'yearly' ? 'Annual Subscription Cycle' : 'Quarterly Subscription Cycle'}</span>
                </span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300/60">
                  {selectedFrequency === 'yearly' ? 'Billed 1× / Year' : 'Billed 1× / 3 Months'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-snug">
                {selectedFrequency === 'yearly'
                  ? 'Annual subscriptions renew once every 12 months. Recent charges cover you for the full year and will not bill again this month.'
                  : 'Quarterly subscriptions renew once every 3 months. Recent charges cover you for the entire quarter and will not bill again this month.'}
              </p>
            </div>
          )}

          {/* 3-Month Rolling Streams Breakdown (Multi-subscription vendors like Apple, Google, Amazon) */}
          {selectedFrequency !== 'yearly' && selectedFrequency !== 'quarterly' && selectedFrequency !== 'cancelled' && service.tiers && service.tiers.length > 1 && (
            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1.5 text-xs text-purple-950">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>3-Month Rolling Subscriptions Detected ({service.tiers.length})</span>
                </span>
                <span className="text-[10px] text-purple-700 font-semibold">
                  Rolling Total: {formatCurrency(service.regularAmount, service.currency)}/mo
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Identified from recurring billing history across the last 3 months. Active subscriptions are consolidated even if some haven't billed yet this month.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {service.tiers.map((tier, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-1.5 bg-white px-2 py-1 rounded-lg border border-purple-200 text-[11px]"
                  >
                    <span className="font-extrabold text-slate-800">
                      {formatCurrency(tier.amount, service.currency)}
                    </span>
                    <span className="text-slate-400">/{tier.frequency === 'yearly' ? 'yr' : tier.frequency === 'quarterly' ? 'qtr' : 'mo'}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                        tier.isHitThisMonth
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tier.frequency === 'yearly'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : tier.frequency === 'quarterly'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {tier.isHitThisMonth
                        ? 'Billed this month'
                        : tier.frequency === 'yearly'
                        ? 'Covered (Annual)'
                        : tier.frequency === 'quarterly'
                        ? 'Covered (Quarterly)'
                        : 'Pending this month'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charges Audit */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <Sliders className="w-4 h-4 text-purple-600" />
                  <span>Charges & Transactions ({service.charges.length})</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Uncheck one-off or non-recurring charges so they don't skew your recurring subscription rate.
                </p>
              </div>

              {distinctAmounts.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleExcludeNonMatchingAmounts(parsedAmount)}
                  className="text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  Exclude non-{formatCurrency(parsedAmount, service.currency)} charges
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto bg-white">
              {service.charges.map((charge) => {
                const isExcluded = excludedTxIds.includes(charge.id);
                return (
                  <div
                    key={charge.id}
                    onClick={() => handleToggleCharge(charge.id)}
                    className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                      isExcluded
                        ? 'bg-amber-50/40 opacity-75 hover:bg-amber-50/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => {}} // handled by parent onClick
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 pointer-events-none"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-900 truncate">
                            {charge.description}
                          </span>
                          {isExcluded ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                              Excluded
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                              Recurring Charge
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {charge.date}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-bold ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {formatCurrency(Math.abs(charge.amount), charge.currency)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {excludedTxIds.length > 0 && (
              <div className="flex items-center justify-between text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <span className="flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{excludedTxIds.length} charge{excludedTxIds.length !== 1 ? 's' : ''} excluded from recurring totals.</span>
                </span>
                <button
                  type="button"
                  onClick={() => setExcludedTxIds([])}
                  className="font-bold underline hover:text-amber-900"
                >
                  Include All
                </button>
              </div>
            )}
          </div>

          {/* Vendor-wide One-Time Toggle */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-800 block">
                Not a recurring subscription
              </span>
              <span className="text-[11px] text-slate-500">
                Mark all transactions from {service.cleanName} as one-off purchases only.
              </span>
            </div>
            <input
              type="checkbox"
              id="isOneTimeOnly"
              checked={isOneTimeOnly}
              onChange={(e) => setIsOneTimeOnly(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetToAuto}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center space-x-1.5 px-3 py-2 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Auto-Detected</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md shadow-purple-600/20 transition-all flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Recalculate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
