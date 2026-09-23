import { AccountType, BankAccount, Currency, IntegrationProvider } from '../types';

export interface ClassificationResult {
  detectedType: AccountType;
  isUnrecognized: boolean;
  rawPlaidType: string;
  rawPlaidSubtype: string;
  warning?: string;
  excludeFromCashFlow: boolean;
  suggestedSubtype: string;
}

// Common, standard types & subtypes that are fully recognized without flagging
const RECOGNIZED_INVESTMENT_SUBTYPES = new Set([
  'brokerage',
  '401k',
  '401a',
  '403b',
  '457b',
  'ira',
  'roth',
  'roth 401k',
  'sep ira',
  'sep',
  'simple ira',
  'simple',
  'rollover',
  'rollover 401k',
  'thrift savings plan',
  'pension',
  'profit sharing plan',
  'stock plan',
  'stock_plan',
  'equity',
  'rsu',
  'espp',
  'mutual fund',
  'etf',
  'index fund',
  'non-taxable brokerage account',
  'retirement',
]);

const RECOGNIZED_DEPOSITORY_SUBTYPES = new Set([
  'checking',
  'savings',
  'cd',
  'money market',
  'cash management',
  'cma',
  'prepaid',
  'paypal',
]);

const RECOGNIZED_CREDIT_SUBTYPES = new Set([
  'credit card',
  'credit',
]);

const RECOGNIZED_LOAN_SUBTYPES = new Set([
  'loan',
  'mortgage',
  'student',
  'auto',
  'home equity',
  'line of credit',
  'business',
  'commercial',
]);

/**
 * Classifies a Plaid account payload.
 * If the account is an uncommon, unexpected, or non-standard vehicle
 * (outside of 401k, IRA, regular brokerage, equity, post-money, checking, savings, credit, loan),
 * it flags it with `isUnrecognized = true` so the user can easily handle and customize it.
 */
export function classifyPlaidAccount(
  rawAcc: {
    type?: string | null;
    subtype?: string | null;
    name?: string | null;
    official_name?: string | null;
  },
  existing?: BankAccount
): ClassificationResult {
  // If the user previously manually resolved this account, respect their choice
  if (existing && existing.unrecognizedType === false && existing.accountType) {
    return {
      detectedType: existing.accountType,
      isUnrecognized: false,
      rawPlaidType: rawAcc.type || existing.rawPlaidType || 'unknown',
      rawPlaidSubtype: rawAcc.subtype || existing.rawPlaidSubtype || 'none',
      excludeFromCashFlow: existing.excludeFromCashFlow ?? (existing.accountType === 'investment'),
      suggestedSubtype: existing.subtype || rawAcc.subtype || '',
    };
  }

  const rawType = (rawAcc.type || '').trim().toLowerCase();
  const rawSubtype = (rawAcc.subtype || '').trim().toLowerCase();
  const nameLower = (rawAcc.name || '').toLowerCase();
  const officialLower = (rawAcc.official_name || '').toLowerCase();
  const combinedText = `${nameLower} ${officialLower}`;

  // 1. Check for standard recognized depository accounts (Checking & Savings)
  if (
    rawType === 'depository' &&
    RECOGNIZED_DEPOSITORY_SUBTYPES.has(rawSubtype)
  ) {
    if (rawSubtype === 'savings' || rawSubtype === 'cd' || rawSubtype === 'money market') {
      return {
        detectedType: 'savings',
        isUnrecognized: false,
        rawPlaidType: rawType,
        rawPlaidSubtype: rawSubtype,
        excludeFromCashFlow: false,
        suggestedSubtype: rawSubtype,
      };
    }
    // Checking or Cash Management
    return {
      detectedType: 'checking',
      isUnrecognized: false,
      rawPlaidType: rawType,
      rawPlaidSubtype: rawSubtype,
      excludeFromCashFlow: false,
      suggestedSubtype: rawSubtype === 'cash management' ? 'Cash Management (CMA)' : 'Checking',
    };
  }

  // 2. Check for standard recognized credit cards
  if (
    (rawType === 'credit' && (RECOGNIZED_CREDIT_SUBTYPES.has(rawSubtype) || !rawSubtype)) ||
    rawSubtype === 'credit card'
  ) {
    return {
      detectedType: 'credit_card',
      isUnrecognized: false,
      rawPlaidType: rawType,
      rawPlaidSubtype: rawSubtype,
      excludeFromCashFlow: false,
      suggestedSubtype: 'Credit Card',
    };
  }

  // 3. Check for standard recognized loans & mortgages
  if (
    rawType === 'loan' ||
    RECOGNIZED_LOAN_SUBTYPES.has(rawSubtype)
  ) {
    return {
      detectedType: 'loan',
      isUnrecognized: false,
      rawPlaidType: rawType,
      rawPlaidSubtype: rawSubtype,
      excludeFromCashFlow: false,
      suggestedSubtype: rawSubtype || 'Loan',
    };
  }

  // 4. Check for standard recognized Retirement, Brokerage, Equity & Post-Money accounts
  // E.g., Fidelity 401(k), IRA, Roth IRA, Rollover IRA, Individual Brokerage, Post-Money accounts
  const isRecognizedInvestmentSubtype = RECOGNIZED_INVESTMENT_SUBTYPES.has(rawSubtype);
  const isRecognizedInvestmentText =
    combinedText.includes('401k') ||
    combinedText.includes('401(k)') ||
    combinedText.includes('403b') ||
    combinedText.includes('457b') ||
    combinedText.includes('roth') ||
    combinedText.includes('ira') ||
    combinedText.includes('rollover') ||
    combinedText.includes('brokerage') ||
    combinedText.includes('individual - tod') ||
    combinedText.includes('joint wros') ||
    combinedText.includes('stock plan') ||
    combinedText.includes('equity') ||
    combinedText.includes('espp') ||
    combinedText.includes('rsu') ||
    combinedText.includes('pension') ||
    combinedText.includes('post-money') ||
    combinedText.includes('post money') ||
    combinedText.includes('after-tax') ||
    combinedText.includes('conversion');

  if (
    (rawType === 'investment' && (isRecognizedInvestmentSubtype || isRecognizedInvestmentText)) ||
    (isRecognizedInvestmentSubtype && rawType !== 'other')
  ) {
    let friendlySubtype = rawSubtype || 'Brokerage';
    if (combinedText.includes('401k') || combinedText.includes('401(k)')) friendlySubtype = '401(k) Retirement';
    else if (combinedText.includes('roth')) friendlySubtype = 'Roth IRA';
    else if (combinedText.includes('rollover')) friendlySubtype = 'Rollover IRA';
    else if (combinedText.includes('ira')) friendlySubtype = 'Traditional IRA';
    else if (combinedText.includes('post-money') || combinedText.includes('after-tax')) friendlySubtype = 'Post-Money Equity / IRA';
    else if (combinedText.includes('stock plan') || combinedText.includes('espp')) friendlySubtype = 'Company Stock Plan / ESPP';

    return {
      detectedType: 'investment',
      isUnrecognized: false,
      rawPlaidType: rawType || 'investment',
      rawPlaidSubtype: rawSubtype || 'brokerage',
      excludeFromCashFlow: true, // Investment accounts are Net Worth Only by default
      suggestedSubtype: friendlySubtype,
    };
  }

  // 5. UNRECOGNIZED / SPECIALIZED TYPE DETECTED!
  // This covers:
  // - type === 'other'
  // - subtype === 'other'
  // - specialized vehicles like HSA, 529, Deferred Comp, Trust, Annuity, UGMA/UTMA, Life Insurance, Crypto
  // - unmapped / custom strings from Plaid
  let detectedFallbackType: AccountType = 'investment';
  let defaultExcludeFromCashFlow = true;
  let customSubtypeLabel = rawSubtype || rawType || 'Custom Account';

  if (rawSubtype === 'hsa' || combinedText.includes('hsa') || combinedText.includes('health savings')) {
    customSubtypeLabel = 'HSA (Health Savings)';
    detectedFallbackType = 'investment';
    defaultExcludeFromCashFlow = true;
  } else if (rawSubtype === '529' || combinedText.includes('529') || combinedText.includes('college')) {
    customSubtypeLabel = '529 College Savings Plan';
    detectedFallbackType = 'investment';
    defaultExcludeFromCashFlow = true;
  } else if (rawSubtype.includes('deferred') || combinedText.includes('deferred comp')) {
    customSubtypeLabel = 'Deferred Compensation Plan';
    detectedFallbackType = 'investment';
    defaultExcludeFromCashFlow = true;
  } else if (rawSubtype.includes('trust') || combinedText.includes('trust')) {
    customSubtypeLabel = 'Trust / Fiduciary Account';
    detectedFallbackType = 'investment';
    defaultExcludeFromCashFlow = true;
  } else if (rawSubtype.includes('annuity') || combinedText.includes('annuity')) {
    customSubtypeLabel = 'Annuity Policy';
    detectedFallbackType = 'investment';
    defaultExcludeFromCashFlow = true;
  } else if (rawSubtype === 'ugma' || rawSubtype === 'utma' || combinedText.includes('custodial')) {
    customSubtypeLabel = 'Custodial Account (UGMA/UTMA)';
    detectedFallbackType = 'investment';
    defaultExcludeFromCashFlow = true;
  } else if (combinedText.includes('checking') || combinedText.includes('cash')) {
    customSubtypeLabel = rawSubtype || 'Cash / Checking';
    detectedFallbackType = 'checking';
    defaultExcludeFromCashFlow = false;
  } else if (combinedText.includes('saving') || combinedText.includes('deposit')) {
    customSubtypeLabel = rawSubtype || 'Savings / Reserve';
    detectedFallbackType = 'savings';
    defaultExcludeFromCashFlow = false;
  }

  const warningMsg = `Plaid reported non-standard classification (Type: "${rawAcc.type || 'none'}", Subtype: "${rawAcc.subtype || 'none'}"). Temporarily classified as ${
    detectedFallbackType === 'investment' ? 'Investment (Net Worth Only)' : detectedFallbackType
  }. Please review and confirm your preferred tracking settings.`;

  return {
    detectedType: detectedFallbackType,
    isUnrecognized: true,
    rawPlaidType: rawAcc.type || 'other',
    rawPlaidSubtype: rawAcc.subtype || 'other',
    warning: warningMsg,
    excludeFromCashFlow: defaultExcludeFromCashFlow,
    suggestedSubtype: customSubtypeLabel,
  };
}

export interface ClassificationOption {
  type: AccountType;
  label: string;
  badge: string;
  description: string;
  defaultExcludeFromCashFlow: boolean;
  iconName: 'TrendingUp' | 'Landmark' | 'PiggyBank' | 'CreditCard' | 'Wallet';
}

export const CLASSIFICATION_OPTIONS: ClassificationOption[] = [
  {
    type: 'investment',
    label: 'Investment / Brokerage (Net Worth Only)',
    badge: 'Recommended for HSAs, Trusts, 529s, Annuities & Deferred Comp',
    description: 'Counts towards Total Net Worth and Investments dashboard. Transactions do not affect daily living cash flow or budget tracking.',
    defaultExcludeFromCashFlow: true,
    iconName: 'TrendingUp',
  },
  {
    type: 'checking',
    label: 'Cash & Checking (Daily Cashflow)',
    badge: 'Recommended for Cash Management Accounts (CMA)',
    description: 'Treated as active liquid cash. Transactions count towards daily cash flow and monthly expense budgets.',
    defaultExcludeFromCashFlow: false,
    iconName: 'Landmark',
  },
  {
    type: 'savings',
    label: 'Savings / Liquid Reserve',
    badge: 'Recommended for High-Yield & Cash Reserves',
    description: 'Liquid reserve balance. Counts towards liquid net cash with optional transfer tracking.',
    defaultExcludeFromCashFlow: false,
    iconName: 'PiggyBank',
  },
  {
    type: 'credit_card',
    label: 'Credit Card / Revolving Debt',
    badge: 'Liabilities',
    description: 'Revolving credit liability. Balance is subtracted from net worth.',
    defaultExcludeFromCashFlow: false,
    iconName: 'CreditCard',
  },
  {
    type: 'loan',
    label: 'Loan / Mortgage',
    badge: 'Fixed Liabilities',
    description: 'Fixed term loan or mortgage balance subtracted from net worth.',
    defaultExcludeFromCashFlow: false,
    iconName: 'Wallet',
  },
];

export const COMMON_SPECIALTY_CHIPS = [
  'HSA (Health Savings)',
  '529 College Plan',
  'Deferred Compensation',
  'Trust / Fiduciary',
  'Post-Money IRA',
  'Annuity',
  'Custodial (UGMA/UTMA)',
  'Defined Benefit',
  'Company Stock / ESPP',
  'Crypto Wallet',
];
