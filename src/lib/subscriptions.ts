import { Transaction, Category, Currency } from '../types';
import { convertCurrency, formatCurrency } from './currency';
import { isTransferTransaction } from './transactions';

export type SubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'cancelled';

export interface SubscriptionChargeDetail {
  id: string;
  date: string;
  amount: number; // raw transaction amount (negative for expense)
  currency: Currency;
  description: string;
  isExcludedAsOneTime: boolean;
}

export interface SubscriptionCustomSetting {
  frequency?: SubscriptionFrequency;
  customAmount?: number; // override regular single billing amount
  excludedTransactionIds?: string[]; // transactions flagged as one-time / IAP
  isOneTimeOnly?: boolean; // user marked entire service as non-subscription
}

export interface SubscriptionTier {
  amount: number;
  frequency: SubscriptionFrequency;
  occurrencesIn3Months: number;
  totalOccurrences: number;
  lastDate: string;
  isHitThisMonth: boolean;
  daysSinceLastCharge: number;
  monthlyContribution: number;
}

export interface RecurringService {
  id: string;
  name: string;
  cleanName: string;
  rawDescription: string;
  accountName: string;
  accountId: string;
  category: string;
  currency: Currency;
  regularAmount: number; // consolidated monthly or single billing amount (positive number)
  monthlyCost: number; // normalized monthly cost in service currency
  monthlyCostInBase: number; // normalized monthly cost in base currency
  frequency: SubscriptionFrequency;
  frequencyLabel: string;
  isManuallyOverridden?: boolean;
  manualFrequency?: SubscriptionFrequency;
  manualAmount?: number;
  chargeCount: number;
  activeChargeCount: number;
  firstDate: string;
  lastDate: string;
  isActive: boolean;
  isCancelled?: boolean;
  daysSinceLastCharge: number;
  transactionIds: string[];
  charges: SubscriptionChargeDetail[];
  hasOneTimePurchasesExcluded: boolean;
  oneTimeExcludedCount: number;
  tiers?: SubscriptionTier[];
  isConsolidatedVendor?: boolean;
  pendingThisMonthCount?: number;
  rolling3MonthTotal?: number;
  rolling3MonthMonthlyAverage?: number;
}

export interface RecurringAnalysisResult {
  services: RecurringService[];
  activeServices: RecurringService[];
  cancelledServices: RecurringService[];
  inactiveServices: RecurringService[];
  totalMonthlyCost: number; // in base currency for active services
  totalAnnualCost: number; // in base currency
  currencyBreakdown: Record<string, number>; // monthly amount in original currencies
  activeCount: number;
  cancelledCount: number;
  inactiveCount: number;
}

/**
 * Normalizes description to extract a clean merchant/service name.
 */
export function extractCleanMerchantName(desc: string): { key: string; displayName: string } {
  if (!desc) return { key: 'unknown', displayName: 'Recurring Service' };

  const raw = desc.trim();
  const lower = raw.toLowerCase();

  // 1. Popular digital subscriptions & services mapping
  const knownMerchants: Array<{ patterns: string[]; name: string }> = [
    { patterns: ['netflix'], name: 'Netflix' },
    { patterns: ['spotify'], name: 'Spotify' },
    { patterns: ['github', 'copilot'], name: 'GitHub' },
    { patterns: ['smart fit', 'smartfit'], name: 'Smart Fit' },
    { patterns: ['prime video', 'amazon prime', 'amzn prime'], name: 'Amazon Prime' },
    { patterns: ['apple.com/bill', 'itunes', 'apple music', 'icloud'], name: 'Apple Services' },
    { patterns: ['google storage', 'google one', 'google *', 'youtube premium'], name: 'Google / YouTube' },
    { patterns: ['disney+', 'disney plus', 'disney'], name: 'Disney+' },
    { patterns: ['hbo', 'max.com', 'hbomax'], name: 'Max (HBO)' },
    { patterns: ['openai', 'chatgpt'], name: 'OpenAI / ChatGPT' },
    { patterns: ['midjourney'], name: 'Midjourney' },
    { patterns: ['claude', 'anthropic'], name: 'Anthropic Claude' },
    { patterns: ['notion'], name: 'Notion' },
    { patterns: ['figma'], name: 'Figma' },
    { patterns: ['canva'], name: 'Canva' },
    { patterns: ['adobe'], name: 'Adobe Creative Cloud' },
    { patterns: ['dropbox'], name: 'Dropbox' },
    { patterns: ['nytimes', 'new york times'], name: 'New York Times' },
    { patterns: ['wsj', 'wall street journal'], name: 'Wall Street Journal' },
    { patterns: ['claro'], name: 'Claro' },
    { patterns: ['vivo'], name: 'Vivo' },
    { patterns: ['tim celular', 'tim brasil'], name: 'TIM' },
    { patterns: ['starlink'], name: 'Starlink' },
    { patterns: ['gympass', 'wellhub'], name: 'Wellhub (Gympass)' },
    { patterns: ['totalpass'], name: 'TotalPass' },
    { patterns: ['bluefit'], name: 'Bluefit' },
  ];

  for (const item of knownMerchants) {
    if (item.patterns.some((p) => lower.includes(p))) {
      return { key: item.name.toLowerCase().replace(/[^a-z0-9]/g, '_'), displayName: item.name };
    }
  }

  // 2. Generic cleaning for bank descriptions
  let cleaned = raw
    .replace(/^ach\s+electronic\s+debit\b/gi, '')
    .replace(/^ach\s+debit\b/gi, '')
    .replace(/^pos\s+purchase\b/gi, '')
    .replace(/^compra\s+com\s+cartão\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}\s*/gi, '')
    .replace(/^pix\s*-\s*enviado\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}\s*/gi, '')
    .replace(/\b\d{2}\/\d{2}\s+\d{2}:\d{2}\b/gi, '')
    .replace(/\b(dm|ebn|br)\s*\*\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing card numbers or suffixes like '11:29 DM *'
  cleaned = cleaned.replace(/[*#]/g, '').trim();

  const key = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const displayName = cleaned.length > 0 ? cleaned : 'Recurring Service';

  return { key, displayName };
}

/**
 * Checks if a transaction qualifies as a candidate for recurring charges / subscriptions.
 */
export function isRecurringCandidate(tx: Transaction, categories: Category[]): boolean {
  if (!tx || tx.isDuplicate) return false;

  // RULE 1: STRICT OUTFLOW EXPENSE ONLY
  // Income, salary, freelance, deposits, and positive amounts are NEVER subscriptions or recurring costs.
  if (tx.amount >= 0) return false;

  // RULE 2: STRICT EXCLUSION OF INTERNAL TRANSFERS
  // Balance-neutral movements, credit card payoff sweeps, and transfers must not be counted.
  if (isTransferTransaction(tx, categories)) return false;

  // RULE 3: EXCLUDE INCOME / SALARY CATEGORIES OR TAGS
  const catLower = (tx.category || '').toLowerCase();
  if (
    catLower.includes('income') ||
    catLower.includes('salary') ||
    catLower.includes('salário') ||
    catLower.includes('transfer') ||
    catLower.includes('investment')
  ) {
    return false;
  }

  if (tx.tags && tx.tags.some((t) => ['salary', 'salario', 'payroll', 'income', 'renda', 'transfer'].includes(t.toLowerCase()))) {
    return false;
  }

  // RULE 4: POSITIVE INCLUSION CHECKS
  // Check 4a: Explicit flag
  if (tx.isRecurring === true) return true;

  // Check 4b: Category matches subscription / media / streaming
  if (catLower.includes('subscription') || catLower.includes('streaming') || catLower.includes('assinatura') || catLower.includes('mensalidade')) {
    return true;
  }

  // Check 4c: Tag matches
  if (
    tx.tags &&
    tx.tags.some((t) =>
      ['recurring', 'subscription', 'recorrente', 'mensalidade', 'streaming', 'assinatura', 'saas', 'academia'].includes(
        t.toLowerCase().trim()
      )
    )
  ) {
    return true;
  }

  // Check 4d: Known subscription keywords in description
  const descLower = (tx.description || '').toLowerCase();
  const subscriptionKeywords = [
    'netflix',
    'spotify',
    'github',
    'copilot',
    'smart fit',
    'smartfit',
    'amazon prime',
    'prime video',
    'disney+',
    'hbo max',
    'max.com',
    'apple.com/bill',
    'youtube premium',
    'google storage',
    'google one',
    'openai',
    'chatgpt',
    'midjourney',
    'claude',
    'notion',
    'figma',
    'adobe',
    'dropbox',
    'patreon',
    'substack',
    'mensalidade',
    'gympass',
    'wellhub',
    'totalpass',
    'bluefit',
  ];

  if (subscriptionKeywords.some((kw) => descLower.includes(kw))) {
    return true;
  }

  return false;
}

export function getFrequencyLabel(freq: SubscriptionFrequency): string {
  switch (freq) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Bi-weekly';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'yearly':
      return 'Annual';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Monthly';
  }
}

/**
 * Calculates normalized monthly cost from regular single billing amount and cadence.
 */
export function calculateMonthlyCost(amount: number, frequency: SubscriptionFrequency): number {
  switch (frequency) {
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
}

/**
 * Analyzes transactions to detect unique recurring services and compute accurate monthly costs,
 * supporting manual frequency overrides and individual one-time charge exclusions.
 */
export function analyzeRecurringServices(
  transactions: Transaction[],
  categories: Category[],
  baseCurrency: Currency,
  rates: Record<string, number>,
  excludedServiceIds: string[] = [],
  customSettings: Record<string, SubscriptionCustomSetting> = {}
): RecurringAnalysisResult {
  // 1. Filter to valid expense candidates
  const candidates = transactions.filter((tx) => isRecurringCandidate(tx, categories));

  // 2. Also check for recurring merchant patterns
  const allExpenses = transactions.filter(
    (tx) => tx.amount < 0 && !isTransferTransaction(tx, categories) && !tx.isDuplicate
  );

  const merchantGroups: Record<string, Transaction[]> = {};

  for (const tx of allExpenses) {
    const { key } = extractCleanMerchantName(tx.description);
    const groupKey = `${key}_${tx.currency.toLowerCase()}`;

    if (!merchantGroups[groupKey]) {
      merchantGroups[groupKey] = [];
    }
    merchantGroups[groupKey].push(tx);
  }

  // Determine latest date in the entire transaction ledger to evaluate active status accurately
  let latestLedgerTime = Date.now();
  if (transactions.length > 0) {
    const validTimes = transactions
      .map((t) => new Date(t.date).getTime())
      .filter((time) => !isNaN(time));
    if (validTimes.length > 0) {
      latestLedgerTime = Math.max(...validTimes);
    }
  }

  const services: RecurringService[] = [];
  const seenServiceIds = new Set<string>();

  for (const [groupKey, txList] of Object.entries(merchantGroups)) {
    const hasCandidateTx = txList.some((t) => candidates.some((c) => c.id === t.id));

    let isRecurringByCadence = false;
    if (!hasCandidateTx && txList.length >= 2) {
      const sorted = [...txList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const amounts = sorted.map((t) => Math.abs(t.amount));
      const minAmt = Math.min(...amounts);
      const maxAmt = Math.max(...amounts);

      if (maxAmt > 0 && (maxAmt - minAmt) / maxAmt <= 0.08) {
        for (let i = 0; i < sorted.length - 1; i++) {
          const diffDays = Math.round(
            (new Date(sorted[i + 1].date).getTime() - new Date(sorted[i].date).getTime()) / (1000 * 3600 * 24)
          );
          if (diffDays >= 20 && diffDays <= 40) {
            isRecurringByCadence = true;
            break;
          }
        }
      }
    }

    if (!hasCandidateTx && !isRecurringByCadence) {
      continue;
    }

    // Sort by date descending (most recent first)
    const sortedDesc = [...txList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestTx = sortedDesc[0];
    const earliestTx = sortedDesc[sortedDesc.length - 1];

    const { displayName } = extractCleanMerchantName(latestTx.description);
    const serviceId = `service_${groupKey}`;
    if (seenServiceIds.has(serviceId)) {
      continue;
    }
    seenServiceIds.add(serviceId);

    const userSetting = customSettings[serviceId];

    // If user explicitly marked this entire service as non-subscription (one-time only)
    const isMarkedOneTimeOnly = userSetting?.isOneTimeOnly === true;

    // Check individual transactions against excluded one-time purchases
    const excludedTxIds = new Set(userSetting?.excludedTransactionIds || []);
    const chargeDetails: SubscriptionChargeDetail[] = sortedDesc.map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      isExcludedAsOneTime: excludedTxIds.has(t.id),
    }));

    const activeCharges = chargeDetails.filter((c) => !c.isExcludedAsOneTime);
    const hasOneTimePurchasesExcluded = chargeDetails.some((c) => c.isExcludedAsOneTime);
    const oneTimeExcludedCount = chargeDetails.filter((c) => c.isExcludedAsOneTime).length;

    // --- 3-Month Rolling Historical Consolidation Logic ---
    const rollingWindowDays = 90;
    const rollingStartTime = latestLedgerTime - rollingWindowDays * 24 * 3600 * 1000;
    const latestDateObj = new Date(latestLedgerTime);
    const currentYear = latestDateObj.getFullYear();
    const currentMonth = latestDateObj.getMonth();

    const rollingCharges = activeCharges.filter((c) => new Date(c.date).getTime() >= rollingStartTime);
    const rolling3MonthTotal = rollingCharges.reduce((acc, c) => acc + Math.abs(c.amount), 0);
    const rolling3MonthMonthlyAverage = rollingCharges.length > 0 ? Number((rolling3MonthTotal / 3).toFixed(2)) : 0;

    // 1. Determine Frequency (User override > Description keywords > Charge intervals)
    let frequency: SubscriptionFrequency = 'monthly';
    let isManuallyOverridden = false;

    if (userSetting?.frequency) {
      frequency = userSetting.frequency;
      isManuallyOverridden = true;
    } else {
      // Auto-detect frequency from description or intervals
      const descLower = latestTx.description.toLowerCase();
      if (
        descLower.includes('annual') ||
        descLower.includes('anual') ||
        descLower.includes('yearly') ||
        descLower.includes('/year') ||
        descLower.includes('/yr')
      ) {
        frequency = 'yearly';
      } else if (descLower.includes('weekly') || descLower.includes('semanal')) {
        frequency = 'weekly';
      } else if (descLower.includes('quarterly') || descLower.includes('trimestral')) {
        frequency = 'quarterly';
      } else if (descLower.includes('biweekly') || descLower.includes('quinzenal')) {
        frequency = 'biweekly';
      } else if (activeCharges.length >= 2) {
        // Filter out tiny card verifications (e.g. <= $2.00) so they don't distort interval calculation
        const significantCharges = activeCharges.filter((c) => Math.abs(c.amount) > 2.0);
        const chargesForCadence = significantCharges.length >= 2 ? significantCharges : activeCharges;
        const sortedAsc = [...chargesForCadence].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const intervals: number[] = [];
        for (let i = 0; i < sortedAsc.length - 1; i++) {
          const diff = Math.round(
            (new Date(sortedAsc[i + 1].date).getTime() - new Date(sortedAsc[i].date).getTime()) / (1000 * 3600 * 24)
          );
          if (diff >= 3) intervals.push(diff);
        }
        if (intervals.length > 0) {
          intervals.sort((a, b) => a - b);
          const median = intervals[Math.floor(intervals.length / 2)];
          if (median >= 5 && median <= 10) frequency = 'weekly';
          else if (median >= 11 && median <= 18) frequency = 'biweekly';
          else if (median >= 65 && median <= 115) frequency = 'quarterly';
          else if (median >= 250 && median <= 420) frequency = 'yearly';
        }
      }
    }

    let detectedTiers: SubscriptionTier[] = [];
    let isConsolidatedVendor = false;
    let pendingThisMonthCount = 0;
    let regularAmount = Math.abs(latestTx.amount);

    if (userSetting?.customAmount && userSetting.customAmount > 0) {
      regularAmount = userSetting.customAmount;
      isManuallyOverridden = true;
    }

    // If Annual or Quarterly:
    // Charges occur once a year or once every 3 months.
    // If a charge happened in the last 90 days, you won't see another charge anytime soon.
    // It is NEVER "Pending this month", and historical charges of different amounts are prior renewals/changes, not concurrent subscriptions.
    if (frequency === 'yearly' || frequency === 'quarterly') {
      isConsolidatedVendor = false;
      detectedTiers = [];
      pendingThisMonthCount = 0;
      if (!userSetting?.customAmount) {
        // Use the most recent non-auth charge
        const primaryCharge = activeCharges.find((c) => Math.abs(c.amount) > 2.0) || activeCharges[0] || latestTx;
        regularAmount = Math.abs(primaryCharge.amount);
      }
    } else {
      // Monthly, Weekly, Bi-weekly:
      // Multi-subscription vendor detection is ONLY applicable to recognized multi-app/ecosystem vendors
      // where a single merchant bills multiple distinct subscription items concurrently (Apple, Google, Amazon, Microsoft).
      const isRecognizedMultiVendor =
        displayName.toLowerCase().includes('apple') ||
        displayName.toLowerCase().includes('google') ||
        displayName.toLowerCase().includes('amazon') ||
        displayName.toLowerCase().includes('microsoft');

      if (isRecognizedMultiVendor) {
        // Cluster charges into recurring sub-streams (tiers)
        const amountGroups: Record<string, SubscriptionChargeDetail[]> = {};
        for (const c of activeCharges) {
          if (Math.abs(c.amount) <= 2.0) continue; // Ignore card verification charges
          const amtKey = Math.abs(c.amount).toFixed(2);
          if (!amountGroups[amtKey]) amountGroups[amtKey] = [];
          amountGroups[amtKey].push(c);
        }

        for (const [amtStr, cList] of Object.entries(amountGroups)) {
          const parsedAmt = parseFloat(amtStr);
          if (parsedAmt <= 0) continue;

          const sortedByDate = [...cList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const mostRecentCharge = sortedByDate[0];
          const mostRecentTime = new Date(mostRecentCharge.date).getTime();
          const daysSince = Math.max(0, Math.round((latestLedgerTime - mostRecentTime) / (1000 * 3600 * 24)));

          const cDate = new Date(mostRecentCharge.date);
          const isHitThisMonth = cDate.getFullYear() === currentYear && cDate.getMonth() === currentMonth;

          const occurrencesIn3Months = cList.filter((c) => new Date(c.date).getTime() >= rollingStartTime).length;
          const totalOccurrences = cList.length;

          // Determine cadence of this tier
          let tierFrequency: SubscriptionFrequency = frequency;
          if (sortedByDate.length >= 2) {
            const sortedAsc = [...sortedByDate].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const intervals: number[] = [];
            for (let i = 0; i < sortedAsc.length - 1; i++) {
              const diff = Math.round(
                (new Date(sortedAsc[i + 1].date).getTime() - new Date(sortedAsc[i].date).getTime()) / (1000 * 3600 * 24)
              );
              if (diff >= 3) intervals.push(diff);
            }
            if (intervals.length > 0) {
              intervals.sort((a, b) => a - b);
              const median = intervals[Math.floor(intervals.length / 2)];
              if (median >= 5 && median <= 10) tierFrequency = 'weekly';
              else if (median >= 11 && median <= 18) tierFrequency = 'biweekly';
              else if (median >= 65 && median <= 115) tierFrequency = 'quarterly';
              else if (median >= 250 && median <= 420) tierFrequency = 'yearly';
            }
          }

          // Active tier check for monthly multi-vendors
          let isTierActive = false;
          if (occurrencesIn3Months >= 2) {
            isTierActive = true;
          } else if (occurrencesIn3Months === 1) {
            if (daysSince <= 65) {
              isTierActive = true;
            }
          }

          if (isTierActive) {
            detectedTiers.push({
              amount: parsedAmt,
              frequency: tierFrequency,
              occurrencesIn3Months,
              totalOccurrences,
              lastDate: mostRecentCharge.date,
              isHitThisMonth,
              daysSinceLastCharge: daysSince,
              monthlyContribution: calculateMonthlyCost(parsedAmt, tierFrequency),
            });
          }
        }

        detectedTiers.sort((a, b) => b.amount - a.amount);

        if (detectedTiers.length > 1) {
          isConsolidatedVendor = true;
          pendingThisMonthCount = detectedTiers.filter(
            (t) => !t.isHitThisMonth && t.frequency !== 'yearly' && t.frequency !== 'quarterly'
          ).length;
          if (!userSetting?.customAmount) {
            regularAmount = Number(detectedTiers.reduce((acc, t) => acc + t.monthlyContribution, 0).toFixed(2));
          }
        } else if (detectedTiers.length === 1) {
          if (!userSetting?.customAmount) {
            regularAmount = detectedTiers[0].amount;
          }
          pendingThisMonthCount =
            !detectedTiers[0].isHitThisMonth &&
            detectedTiers[0].frequency !== 'yearly' &&
            detectedTiers[0].frequency !== 'quarterly'
              ? 1
              : 0;
        }
      }

      // Single vendor (non-multi) or fallback when no tiers detected
      if (!isConsolidatedVendor && !userSetting?.customAmount) {
        const primaryCharge = activeCharges.find((c) => Math.abs(c.amount) > 2.0) || activeCharges[0] || latestTx;
        regularAmount = Math.abs(primaryCharge.amount);
        const cDate = new Date(primaryCharge.date);
        const isHitThisMonth = cDate.getFullYear() === currentYear && cDate.getMonth() === currentMonth;
        pendingThisMonthCount = !isHitThisMonth ? 1 : 0;
      }
    }

    const frequencyLabel = getFrequencyLabel(frequency);
    const monthlyCost = calculateMonthlyCost(regularAmount, frequency);
    const monthlyCostInBase = convertCurrency(monthlyCost, latestTx.currency, baseCurrency, rates);

    const latestTxTime = new Date(latestTx.date).getTime();
    const daysSinceLastCharge = Math.max(0, Math.round((latestLedgerTime - latestTxTime) / (1000 * 3600 * 24)));

    // Active determination:
    const isCancelled = frequency === 'cancelled' || userSetting?.frequency === 'cancelled';
    let isActive = true;
    if (isCancelled || activeCharges.length === 0 || isMarkedOneTimeOnly || excludedServiceIds.includes(serviceId)) {
      isActive = false;
    } else if (frequency === 'monthly' && daysSinceLastCharge > 65) {
      isActive = false;
    } else if (frequency === 'yearly' && daysSinceLastCharge > 400) {
      isActive = false;
    } else if (frequency === 'weekly' && daysSinceLastCharge > 25) {
      isActive = false;
    }

    services.push({
      id: serviceId,
      name: displayName,
      cleanName: displayName,
      rawDescription: latestTx.description,
      accountName: latestTx.accountName,
      accountId: latestTx.accountId,
      category: latestTx.category,
      currency: latestTx.currency,
      regularAmount,
      monthlyCost,
      monthlyCostInBase,
      frequency,
      frequencyLabel,
      isManuallyOverridden,
      manualFrequency: userSetting?.frequency,
      manualAmount: userSetting?.customAmount,
      chargeCount: sortedDesc.length,
      activeChargeCount: activeCharges.length,
      firstDate: earliestTx.date,
      lastDate: latestTx.date,
      isActive,
      isCancelled,
      daysSinceLastCharge,
      transactionIds: sortedDesc.map((t) => t.id),
      charges: chargeDetails,
      hasOneTimePurchasesExcluded,
      oneTimeExcludedCount,
      tiers: detectedTiers,
      isConsolidatedVendor,
      pendingThisMonthCount,
      rolling3MonthTotal,
      rolling3MonthMonthlyAverage,
    });
  }

  // Sort services: Active first, then Cancelled, then Inactive, then by monthly cost descending
  services.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.isCancelled !== b.isCancelled) return a.isCancelled ? -1 : 1;
    return b.monthlyCostInBase - a.monthlyCostInBase;
  });

  const activeServices = services.filter((s) => s.isActive && !s.isCancelled);
  const cancelledServices = services.filter((s) => s.isCancelled);
  const inactiveServices = services.filter((s) => !s.isActive && !s.isCancelled);

  const totalMonthlyCost = activeServices.reduce((acc, s) => acc + s.monthlyCostInBase, 0);
  const totalAnnualCost = totalMonthlyCost * 12;

  const currencyBreakdown: Record<string, number> = {};
  for (const s of activeServices) {
    currencyBreakdown[s.currency] = (currencyBreakdown[s.currency] || 0) + s.monthlyCost;
  }

  return {
    services,
    activeServices,
    cancelledServices,
    inactiveServices,
    totalMonthlyCost,
    totalAnnualCost,
    currencyBreakdown,
    activeCount: activeServices.length,
    cancelledCount: cancelledServices.length,
    inactiveCount: inactiveServices.length,
  };
}
