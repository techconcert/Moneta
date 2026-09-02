import { Transaction, Category, Currency } from '../types';
import { convertCurrency } from './currency';

/**
 * Checks if a category is an internal transfer / balance-neutral category.
 */
export function isTransferCategory(categoryName: string, categories: Category[]): boolean {
  if (!categoryName) return false;
  const nameLower = categoryName.toLowerCase().trim();

  // 1. Check category definition type
  const matched = categories.find((c) => c.name.toLowerCase().trim() === nameLower);
  if (matched && matched.type === 'transfer') return true;

  // 2. Common transfer category name keywords
  const transferKeywords = [
    'transfer',
    'transferência',
    'transferencia',
    'internal transfer',
    'account transfer',
    'sweep',
    'sweeps',
    'balance transfer',
    'credit card payment',
    'pagamento de fatura',
    'resgate automático',
    'resgate poupanca',
    'resgate poupança',
    'aplicação automática',
    'aplicacao automatica',
  ];

  return transferKeywords.some((kw) => nameLower.includes(kw));
}

/**
 * Robustly determines if a transaction is an internal transfer between accounts.
 * Internal transfers are balance-neutral movements that must NOT be counted as
 * inbound income or outflow expenses to prevent double counting.
 */
export function isTransferTransaction(tx: Transaction, categories: Category[]): boolean {
  if (!tx) return false;

  // 1. Check if category is a transfer category
  if (isTransferCategory(tx.category, categories)) return true;

  // 2. Check tags for transfer markers
  if (tx.tags && tx.tags.length > 0) {
    const hasTransferTag = tx.tags.some((t) => {
      const tagLower = t.toLowerCase().trim();
      return (
        tagLower === 'transfer' ||
        tagLower === 'transferência' ||
        tagLower === 'transferencia' ||
        tagLower === 'internal-transfer' ||
        tagLower === 'sweep' ||
        tagLower === 'cc-payment' ||
        tagLower === 'payment'
      );
    });
    if (hasTransferTag) return true;
  }

  // 3. Description checks: Safeguard against common transfer / sweep descriptions
  const descLower = (tx.description || '').toLowerCase().trim();

  // Explicitly guard against genuine salary / payroll / income terms
  const incomeKeywords = [
    'salary',
    'payroll',
    'salário',
    'salario',
    'pro-labore',
    'direct dep',
    'direct deposit',
    'dividend',
    'dividendo',
    'freelance',
    'consulting fee',
    'cashback',
    'tax refund',
    'restituição',
  ];
  if (incomeKeywords.some((kw) => descLower.includes(kw))) {
    return false;
  }

  // Check for distinct transfer descriptions
  const transferDescKeywords = [
    'transfer between accounts',
    'internal transfer',
    'online transfer to',
    'online transfer from',
    'credit card payment - thank you',
    'payment to chase card',
    'payment to amex',
    'resgate automatico',
    'resgate automático',
    'bb rende facil',
    'bb rende fácil',
    'aplicacao automatica',
    'aplicação automática',
  ];

  return transferDescKeywords.some((kw) => descLower.includes(kw));
}

/**
 * Computes exact cashflow statistics (Inflow, Outflow, Net, Transfers)
 * strictly distinguishing earned inbound income from internal account transfers.
 */
export function computeCashflowBreakdown(
  transactions: Transaction[],
  categories: Category[],
  baseCurrency: Currency,
  rates: Record<string, number>
) {
  let totalInboundIncome = 0;
  let totalOutflowExpenses = 0;
  let totalTransfers = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let transferCount = 0;

  transactions.forEach((tx) => {
    const valInBase = convertCurrency(Math.abs(tx.amount), tx.currency, baseCurrency, rates);

    if (isTransferTransaction(tx, categories)) {
      totalTransfers += valInBase;
      transferCount += 1;
    } else if (tx.amount > 0) {
      totalInboundIncome += valInBase;
      incomeCount += 1;
    } else if (tx.amount < 0) {
      totalOutflowExpenses += valInBase;
      expenseCount += 1;
    }
  });

  const netSavings = totalInboundIncome - totalOutflowExpenses;

  return {
    totalInboundIncome,
    totalOutflowExpenses,
    totalTransfers,
    netSavings,
    incomeCount,
    expenseCount,
    transferCount,
  };
}
