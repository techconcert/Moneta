import { Currency, ExchangeRates } from '../types';

export const DEFAULT_RATES: Record<string, number> = {
  'USD_BRL': 5.75,
  'BRL_USD': 0.1739,
  'USD_EUR': 0.92,
  'EUR_USD': 1.087,
  'USD_GBP': 0.78,
  'GBP_USD': 1.282,
  'BRL_EUR': 0.16,
  'EUR_BRL': 6.25,
  'USD_USD': 1.0,
  'BRL_BRL': 1.0,
  'EUR_EUR': 1.0,
  'GBP_GBP': 1.0,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  BRL: 'R$',
  EUR: '€',
  GBP: '£',
};

export const CURRENCY_NAMES: Record<Currency, string> = {
  USD: 'US Dollar ($)',
  BRL: 'Brazilian Real (R$)',
  EUR: 'Euro (€)',
  GBP: 'British Pound (£)',
};

/**
 * Format an amount with currency symbol and appropriate locale formatting
 */
export function formatCurrency(
  amount: number,
  currency: Currency = 'USD',
  compact: boolean = false
): string {
  const localeMap: Record<Currency, string> = {
    USD: 'en-US',
    BRL: 'pt-BR',
    EUR: 'de-DE',
    GBP: 'en-GB',
  };

  const symbol = CURRENCY_SYMBOLS[currency] || '$';

  if (compact && Math.abs(amount) >= 1000) {
    const formatted = new Intl.NumberFormat(localeMap[currency], {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Math.abs(amount));
    const prefix = amount < 0 ? '-' : '';
    return `${prefix}${symbol}${formatted}`;
  }

  const formatted = new Intl.NumberFormat(localeMap[currency], {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return formatted;
}

/**
 * Convert an amount from one currency to another using the provided or default exchange rates
 */
export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Record<string, number> = DEFAULT_RATES
): number {
  if (from === to) return amount;

  const directPair = `${from}_${to}`;
  if (rates[directPair] !== undefined) {
    return amount * rates[directPair];
  }

  const inversePair = `${to}_${from}`;
  if (rates[inversePair] !== undefined && rates[inversePair] > 0) {
    return amount / rates[inversePair];
  }

  // Convert via USD if intermediate
  if (from !== 'USD' && to !== 'USD') {
    const fromToUsdKey = `${from}_USD`;
    const usdToTargetKey = `USD_${to}`;
    const rateFromUsd = rates[fromToUsdKey] || (rates[`USD_${from}`] ? 1 / rates[`USD_${from}`] : 1);
    const rateToTarget = rates[usdToTargetKey] || (rates[`${to}_USD`] ? 1 / rates[`${to}_USD`] : 1);
    const amountInUsd = amount * rateFromUsd;
    return amountInUsd * rateToTarget;
  }

  return amount;
}
