export type Currency = 'USD' | 'BRL' | 'EUR' | 'GBP';

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'loan';

export type IntegrationProvider = 'plaid' | 'pluggy' | 'manual' | 'file_import';

export interface BankAccount {
  id: string;
  name: string;
  institutionName: string;
  accountType: AccountType;
  currency: Currency;
  balance: number;
  mask: string;
  provider: IntegrationProvider;
  providerItemId?: string;
  lastSyncedAt: string;
  color?: string;
  logoUrl?: string;
  isSandbox?: boolean;
  isHidden?: boolean;
  excludeFromCashFlow?: boolean; // When true, balance still counts in Net Worth, but transactions & balance are excluded from living cashflow/budgets
  subtype?: string; // e.g., '401k', 'brokerage', 'ira', 'stock_plan'
  unrecognizedType?: boolean; // Flagged when Plaid returns a non-standard or unexpected account type/subtype
  rawPlaidType?: string; // Original account type string returned by Plaid API (e.g., 'other', 'investment', etc.)
  rawPlaidSubtype?: string; // Original subtype string returned by Plaid API (e.g., 'hsa', '529', 'deferred compensation', etc.)
  classificationWarning?: string; // User-facing advisory message explaining why the account was flagged
}

export interface StockHolding {
  id: string;
  accountId?: string;
  accountName?: string;
  symbol: string; // e.g. 'AAPL', 'MSFT', 'VOO', 'FXAIX'
  name: string; // e.g. 'Apple Inc.', 'Vanguard S&P 500 ETF'
  shares: number; // total quantity of shares owned
  costBasis: number; // average purchase price per share in USD
  currentPrice: number; // current market price per share in USD
  currency: Currency;
  institution: string; // e.g. 'Computershare', 'Morgan Stanley at Work', 'Fidelity', 'Manual'
  assetType?: 'stock' | 'etf' | 'mutual_fund' | 'rsu' | 'crypto';
  vestedShares?: number; // for company equity / Morgan Stanley at Work plans
  unvestedShares?: number; // for unvested RSUs
  grantDate?: string;
  notes?: string;
  lastUpdated: string;
}

export type CategoryType = 'expense' | 'income' | 'transfer';

export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon identifier or SVG
  color: string;
  type: CategoryType;
  isAiGenerated?: boolean;
  isDefault?: boolean;
}

export interface CategorizationRule {
  id: string;
  pattern: string; // normalized description keyword
  category: string;
  userOverridden: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  accountName: string;
  date: string; // YYYY-MM-DD
  description: string;
  originalDescription?: string;
  amount: number; // positive = income, negative = expense
  currency: Currency;
  category: string;
  categoryIcon?: string;
  tags: string[];
  pending: boolean;
  isRecurring?: boolean;
  isDuplicate?: boolean;
  notes?: string;
  provider: IntegrationProvider;
  externalId?: string;
  isSandbox?: boolean;
  isManualCategory?: boolean;
  exemptFromDedup?: boolean;
  isDedupException?: boolean;
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: number;
  currency: Currency;
}

export interface ExchangeRates {
  rates: Record<string, number>; // e.g. "USD_BRL": 5.75
  lastUpdated: string;
}

export interface DedupException {
  id: string;
  transactionId?: string;
  accountId: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
  notes?: string;
}

export interface DeduplicationDetail {
  id: string;
  originalDescription: string;
  duplicateDescription: string;
  amount: number;
  currency: Currency;
  date: string;
  accountId: string;
  accountName?: string;
  category?: string;
  reason: string;
  timestamp: string;
  restored?: boolean;
  restoredAt?: string;
  restoredTransactionId?: string;
}

export interface SyncLog {
  id: string;
  provider: IntegrationProvider;
  status: 'success' | 'failed' | 'in_progress';
  timestamp: string;
  newTransactionsCount: number;
  updatedAccountsCount: number;
  message: string;
  deduplicatedCount?: number;
  deduplicationDetails?: DeduplicationDetail[];
}

export interface AIInsight {
  id: string;
  type: 'spending_spike' | 'subscription_found' | 'budget_warning' | 'saving_opportunity' | 'general';
  title: string;
  description: string;
  impactAmount?: number;
  currency?: Currency;
  createdAt: string;
  suggestedAction?: string;
  icon: string;
}

export interface UserPreferences {
  baseCurrency: Currency;
  theme: 'light' | 'dark';
  autoCategorizeWithAI: boolean;
  lastSyncTimestamp?: string;
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  createdAtFormatted: string;
  trigger: 'automatic' | 'manual';
  version: number;
  counts: {
    accounts: number;
    transactions: number;
    categories: number;
    budgets: number;
    categorizationRules: number;
    syncLogs: number;
    insights: number;
  };
  data: {
    accounts: BankAccount[];
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    categorizationRules: CategorizationRule[];
    exchangeRates: ExchangeRates;
    syncLogs: SyncLog[];
    insights: AIInsight[];
    preferences: UserPreferences;
  };
}

