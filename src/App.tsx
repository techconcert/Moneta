import React, { useEffect, useState } from 'react';
import {
  BankAccount, Transaction, Category, Budget,
  ExchangeRates, SyncLog, AIInsight, Currency, UserPreferences, BackupSnapshot, AccountType, IntegrationProvider,
  DeduplicationDetail
} from './types';
import { db } from './lib/db';
import { DEFAULT_RATES, convertCurrency } from './lib/currency';
import { analyzeRecurringServices } from './lib/subscriptions';
import { ParsedImportResult } from './lib/parsers';
import { Header } from './components/Header';
import { OverviewTab } from './components/OverviewTab';
import { TransactionsTab } from './components/TransactionsTab';
import { AccountsTab } from './components/AccountsTab';
import { BudgetsTab } from './components/BudgetsTab';
import { InsightsTab } from './components/InsightsTab';
import { SettingsTab } from './components/SettingsTab';
import { ImportWizardModal } from './components/ImportWizardModal';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { safeJsonFetch } from './lib/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Core financial state
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({
    rates: DEFAULT_RATES,
    lastUpdated: new Date().toISOString(),
  });
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');

  // UI state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCategorizingWithAI, setIsCategorizingWithAI] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedCategoryForTransactions, setSelectedCategoryForTransactions] = useState<string>('all');
  const [selectedMonthForTransactions, setSelectedMonthForTransactions] = useState<string>('all');
  const [selectedTypeFilterForTransactions, setSelectedTypeFilterForTransactions] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [selectedSearchForTransactions, setSelectedSearchForTransactions] = useState<string>('');

  // Computed visible accounts and transactions (excluding hidden ones)
  const visibleAccounts = React.useMemo(() => {
    return accounts.filter((a) => !a.isHidden);
  }, [accounts]);

  const visibleTransactions = React.useMemo(() => {
    const visibleIds = new Set(visibleAccounts.map((a) => a.id));
    return transactions.filter((t) => visibleIds.has(t.accountId));
  }, [transactions, visibleAccounts]);

  const netWorth = React.useMemo(() => {
    return visibleAccounts.reduce(
      (sum, acc) => {
        const balance = acc.accountType === 'credit_card' ? acc.balance * -1 : acc.balance;
        return sum + convertCurrency(balance, acc.currency, baseCurrency, exchangeRates.rates);
      },
      0
    );
  }, [visibleAccounts, baseCurrency, exchangeRates.rates]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch Live Rates from API
  const handleFetchLiveRates = async (silent = false) => {
    setIsFetchingRates(true);
    try {
      const res = await safeJsonFetch<any>('/api/rates');
      if (res.ok && res.data && res.data.rates) {
        const newRatesObj: ExchangeRates = {
          rates: res.data.rates,
          lastUpdated: res.data.lastUpdated || new Date().toISOString(),
        };
        await db.saveExchangeRates(res.data.rates);
        setExchangeRates(newRatesObj);
        if (!silent) {
          showToast(`Live exchange rates updated from ${res.data.source || 'Free FX API'}!`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch live FX rates:', err);
      if (!silent) showToast('Could not fetch live rates.');
    } finally {
      setIsFetchingRates(false);
    }
  };

  // 1. Initial Load from IndexedDB
  const reloadDataFromDb = async () => {
    try {
      await db.init();
      let isEmpty = await db.isDatabaseEmpty();
      let accs = await db.getAccounts();

      let hasSeeded = localStorage.getItem('moneta_seeded');
      if (!hasSeeded) {
        hasSeeded = localStorage.getItem('ledgerflow_seeded');
        if (hasSeeded) {
          localStorage.setItem('moneta_seeded', 'true');
        }
      }

      if (!hasSeeded && isEmpty) {
        await db.seedInitialData();
        accs = await db.getAccounts();
        localStorage.setItem('moneta_seeded', 'true');
      }

      const dedupStartup = await db.cleanupDuplicateTransactions();
      if (dedupStartup.count > 0 && dedupStartup.details.length > 0) {
        await db.addSyncLog({
          id: `sync_dedup_${Date.now()}`,
          provider: 'plaid',
          status: 'success',
          timestamp: new Date().toISOString(),
          newTransactionsCount: 0,
          updatedAccountsCount: 1,
          message: `De-duplicated ${dedupStartup.count} transaction (merged settled vs pending clearinghouse entry).`,
          deduplicatedCount: dedupStartup.count,
          deduplicationDetails: dedupStartup.details,
        });
        showToast(`⚡ De-duplicated ${dedupStartup.count} duplicate transaction(s). Full audit details logged in Accounts tab.`);
      }

      // Ensure Toyota Motor Credit exception on 8/7 for USD $4069.89 has exactly 2 valid salary payments
      const existingTxsCheck = await db.getTransactions();
      const toyotaTxs = existingTxsCheck.filter(t =>
        (t.description.toLowerCase().includes('toyota motor cre') || t.description.toLowerCase().includes('toyota')) &&
        Math.abs(Math.abs(t.amount) - 4069.89) < 1
      );
      
      // If there are 3 or more entries, prune the excess 3rd+ duplicate down to exactly 2
      if (toyotaTxs.length > 2) {
        for (let i = 2; i < toyotaTxs.length; i++) {
          await db.deleteTransaction(toyotaTxs[i].id);
        }
      }

      // Ensure the remaining two entries are correctly categorized as Income & Salary
      const retainedToyota = toyotaTxs.slice(0, 2);
      for (const t of retainedToyota) {
        if (t.category !== 'Income & Salary' || !t.isManualCategory) {
          t.category = 'Income & Salary';
          t.isManualCategory = true;
          await db.saveTransaction(t);
        }
      }

      const [txs, cats, bdgs, exRates, logs, ins, prefs, currentBackups] = await Promise.all([
        db.getTransactions(),
        db.getCategories(),
        db.getBudgets(),
        db.getExchangeRates(),
        db.getSyncLogs(),
        db.getInsights(),
        db.getPreferences(),
        db.getBackups(),
      ]);

      setAccounts(accs);
      setTransactions(txs);
      setCategories(cats);
      setBudgets(bdgs);
      setExchangeRates(exRates);
      setSyncLogs(logs);
      setInsights(ins);
      setBackups(currentBackups);
      
      if (prefs && prefs.baseCurrency) {
        setBaseCurrency(prefs.baseCurrency);
      }

      // --- AUTO BACKUP LOGIC ---
      const todayString = new Date().toISOString().slice(0, 10);
      const autoBackups = currentBackups.filter(b => b.trigger === 'automatic');
      const hasBackedUpToday = autoBackups.some(b => b.timestamp.startsWith(todayString));
      
      if (!hasBackedUpToday && (accs.length > 0 || txs.length > 0)) {
        await createBackup('automatic', accs, txs, cats, bdgs, exRates, logs, ins, prefs, currentBackups);
      }

    } catch (err) {
      console.error('Error loading database:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createBackup = async (
    trigger: 'automatic' | 'manual', 
    accs: typeof accounts, txs: typeof transactions, cats: typeof categories, bdgs: typeof budgets, 
    exRates: typeof exchangeRates, logs: typeof syncLogs, ins: typeof insights, prefs: UserPreferences,
    existingBackups: BackupSnapshot[]
  ) => {
    try {
      const backup: BackupSnapshot = {
        id: `backup_${Date.now()}_${trigger}`,
        timestamp: new Date().toISOString(),
        createdAtFormatted: new Date().toLocaleString(),
        trigger,
        version: 1,
        counts: {
          accounts: accs.length,
          transactions: txs.length,
          categories: cats.length,
          budgets: bdgs.length,
          categorizationRules: 0,
          syncLogs: logs.length,
          insights: ins.length,
        },
        data: {
          accounts: accs,
          transactions: txs,
          categories: cats,
          budgets: bdgs,
          categorizationRules: [],
          exchangeRates: exRates,
          syncLogs: logs,
          insights: ins,
          preferences: prefs || { baseCurrency: 'USD', theme: 'light', autoCategorizeWithAI: true },
        }
      };

      await db.saveBackup(backup);

      // Keep only 10 automated backups
      if (trigger === 'automatic') {
        const automated = existingBackups.filter(b => b.trigger === 'automatic').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (automated.length >= 10) {
          const toDelete = automated.slice(9); // keep 9 + the new 1 = 10
          for (const oldBackup of toDelete) {
            await db.deleteBackup(oldBackup.id);
          }
        }
      }
      
      // reload backups
      const newBackups = await db.getBackups();
      setBackups(newBackups);
      
      if (trigger === 'manual') {
        showToast('Manual backup created successfully.');
      }
    } catch (err) {
      console.error('Backup creation failed', err);
    }
  };

  const handleWipeSandboxData = async () => {
    await db.wipeSandboxData();
    await reloadDataFromDb();
    showToast('Sandbox/demo data cleared. Production accounts preserved.');
  };

  const handleRestoreSandboxData = async () => {
    await db.restoreSandboxData();
    await reloadDataFromDb();
    showToast('Full sandbox suite restored (Chase, Wise, Fidelity, Nubank, Itaú).');
  };

  useEffect(() => {
    reloadDataFromDb();
  }, []);

  // Automatic 60-minute refresh on app load and page (tab) changes
  useEffect(() => {
    if (isLoading) return;

    const checkAndAutoRefresh = async () => {
      const now = Date.now();
      
      // Throttle auto-refresh triggers to at least 5 minutes apart to avoid parallel requests while loading or switching tabs
      const lastTriggerTimeStr = localStorage.getItem('last_auto_refresh_trigger_time');
      const lastTriggerTime = lastTriggerTimeStr ? parseInt(lastTriggerTimeStr, 10) : 0;
      if (now - lastTriggerTime < 300000) {
        return;
      }

      // Check FX Last Updated
      const lastFxUpdated = exchangeRates?.lastUpdated ? new Date(exchangeRates.lastUpdated).getTime() : 0;

      // Check Last Sync Log Update
      let lastSyncTime = 0;
      if (syncLogs && syncLogs.length > 0) {
        const sortedLogs = [...syncLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (sortedLogs[0]) {
          lastSyncTime = new Date(sortedLogs[0].timestamp).getTime();
        }
      }

      const fxNeedsRefresh = !lastFxUpdated || (now - lastFxUpdated > 3600000);
      const syncNeedsRefresh = !lastSyncTime || (now - lastSyncTime > 3600000);

      if (fxNeedsRefresh || syncNeedsRefresh) {
        localStorage.setItem('last_auto_refresh_trigger_time', String(now));
        console.log(`Auto-refresh active: FX needs refresh: ${fxNeedsRefresh}, Sync needs refresh: ${syncNeedsRefresh}`);
        
        let fxRefreshed = false;
        let accountsSynced = false;

        // 1. Refresh FX rates if older than 1 hr
        if (fxNeedsRefresh) {
          try {
            await handleFetchLiveRates(true);
            fxRefreshed = true;
          } catch (err) {
            console.error('Auto FX refresh failed:', err);
          }
        }

        // 2. Sync Plaid & Pluggy accounts if older than 1 hr and there are accounts
        if (syncNeedsRefresh && accounts.length > 0) {
          setIsSyncing(true);
          try {
            let newTxsCount = 0;

            let allDedupDetails: DeduplicationDetail[] = [];

            // Sync Plaid
            const plaidAccs = accounts.filter((a) => a.provider === 'plaid');
            if (plaidAccs.length > 0) {
              const pRes = await safeJsonFetch<any>('/api/plaid/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts: plaidAccs, days: 30 }),
              });
              if (pRes.ok && pRes.data && pRes.data.accounts) {
                const { txsCount, deduplicatedDetails } = await processPlaidSyncResult(pRes.data, '');
                newTxsCount += txsCount;
                if (deduplicatedDetails && deduplicatedDetails.length > 0) {
                  allDedupDetails.push(...deduplicatedDetails);
                }
              }
            }

            // Sync Pluggy
            const pluggyAccs = accounts.filter((a) => a.provider === 'pluggy');
            if (pluggyAccs.length > 0) {
              const pgRes = await safeJsonFetch<any>('/api/pluggy/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts: pluggyAccs }),
              });
              if (pgRes.ok && pgRes.data) {
                if (pgRes.data.updatedAccounts && Array.isArray(pgRes.data.updatedAccounts)) {
                  for (const updatedAcc of pgRes.data.updatedAccounts) {
                    const existingAcc = accounts.find(a => a.id === updatedAcc.id);
                    if (existingAcc) {
                      updatedAcc.institutionName = existingAcc.institutionName;
                      updatedAcc.name = existingAcc.name;
                    }
                    await db.saveAccount(updatedAcc);
                  }
                }
                if (pgRes.data.newTransactions && pgRes.data.newTransactions.length > 0) {
                  const pgSaveRes = await db.saveTransactions(pgRes.data.newTransactions);
                  newTxsCount += pgRes.data.newTransactions.length;
                  if (pgSaveRes.deduplicatedDetails && pgSaveRes.deduplicatedDetails.length > 0) {
                    allDedupDetails.push(...pgSaveRes.deduplicatedDetails);
                  }
                }
              }
            }

            const sweep = await db.cleanupDuplicateTransactions();
            if (sweep.details.length > 0) {
              allDedupDetails.push(...sweep.details);
            }

            const log: SyncLog = {
              id: `sync_${Date.now()}`,
              provider: 'plaid',
              status: 'success',
              timestamp: new Date().toISOString(),
              newTransactionsCount: newTxsCount,
              updatedAccountsCount: accounts.length,
              message: allDedupDetails.length > 0
                ? `Automatic sync completed: ${newTxsCount} new, ${allDedupDetails.length} duplicate(s) de-duped.`
                : `Automatic 60-minute sync completed. Pulled ${newTxsCount} new transactions.`,
              deduplicatedCount: allDedupDetails.length > 0 ? allDedupDetails.length : undefined,
              deduplicationDetails: allDedupDetails.length > 0 ? allDedupDetails : undefined,
            };

            await db.addSyncLog(log);
            await reloadDataFromDb();
            accountsSynced = true;
            if (allDedupDetails.length > 0) {
              showToast(`⚡ Auto-sync: ${newTxsCount} new, ${allDedupDetails.length} duplicate(s) de-duped.`);
            } else {
              showToast(`Auto-sync complete! ${newTxsCount} new transactions pulled.`);
            }
          } catch (err) {
            console.error('Auto sync failed:', err);
          } finally {
            setIsSyncing(false);
          }
        }

        if (fxRefreshed || accountsSynced) {
          console.log('Auto-refresh completed successfully.');
        }
      }
    };

    checkAndAutoRefresh();
  }, [activeTab, isLoading]);

  // Handler for Base Currency Change
  const handleSetBaseCurrency = async (curr: Currency) => {
    setBaseCurrency(curr);
    await db.savePreferences({
      baseCurrency: curr,
      theme: 'light',
      autoCategorizeWithAI: true,
    });
  };

  // Reusable helper to process and map Plaid sync payload to Moneta schema
  const processPlaidSyncResult = async (data: { accounts: any[]; transactions: any[] }, accessToken: string) => {
    if (!data.accounts || !data.transactions) return { accountsCount: 0, txsCount: 0 };

    const isSandboxToken = (token: string) => {
      return !token || token === 'access-sandbox-dummy' || token.startsWith('access-sandbox-');
    };

    const newAccounts = data.accounts.map((acc: any) => {
      const existing = accounts.find((a) => a.id === `plaid_${acc.account_id}`);
      const token = accessToken || existing?.providerItemId || 'access-sandbox-dummy';
      const isSandbox = isSandboxToken(token);

      // Determine proper account classification from Plaid type & subtype
      const type = (acc.type || '').toLowerCase();
      const subtype = (acc.subtype || '').toLowerCase();
      const nameLower = (acc.name || '').toLowerCase();
      const officialLower = (acc.official_name || '').toLowerCase();

      let detectedType: AccountType = 'checking';
      if (
        subtype === 'savings' ||
        subtype === 'cd' ||
        subtype === 'money market' ||
        type === 'savings' ||
        nameLower.includes('savings') ||
        officialLower.includes('savings')
      ) {
        detectedType = 'savings';
      } else if (subtype === 'credit card' || type === 'credit' || subtype === 'credit') {
        detectedType = 'credit_card';
      } else if (
        type === 'investment' ||
        subtype === 'brokerage' ||
        subtype === '401k' ||
        subtype === 'ira' ||
        subtype === 'roth' ||
        subtype === 'mutual fund'
      ) {
        detectedType = 'investment';
      } else if (type === 'loan' || subtype === 'mortgage' || subtype === 'student' || subtype === 'loan') {
        detectedType = 'loan';
      }

      // Live balance directly from Plaid API without any manual overrides
      const rawBalance = typeof acc.balances?.current === 'number'
        ? acc.balances.current
        : (typeof acc.balances?.available === 'number' ? acc.balances.available : 0);

      const maskStr = acc.mask ? `...${acc.mask}` : (existing?.mask || '...0000');
      const instName = existing?.institutionName || (officialLower.includes('wise') || nameLower.includes('wise') ? 'Wise' : 'Plaid Connected Bank');

      return {
        id: `plaid_${acc.account_id}`,
        name: acc.name,
        institutionName: instName,
        accountType: detectedType,
        currency: (acc.balances?.iso_currency_code as Currency) || (acc.balances?.unofficial_currency_code as Currency) || 'USD',
        balance: rawBalance,
        mask: maskStr,
        provider: 'plaid' as IntegrationProvider,
        providerItemId: token,
        lastSyncedAt: new Date().toISOString(),
        color: existing?.color || (detectedType === 'savings' ? '#059669' : '#117ACA'),
        logoUrl: existing?.logoUrl,
        isSandbox,
        isHidden: existing?.isHidden || false,
      };
    });

    let newTransactions = data.transactions.map((tx: any) => {
      const existing = transactions.find((t) => t.id === `plaid_tx_${tx.transaction_id}`);
      const matchingAccount = newAccounts.find((a: any) => a.id === `plaid_${tx.account_id}`);
      const isSandbox = matchingAccount ? matchingAccount.isSandbox : isSandboxToken(accessToken || existing?.providerItemId || 'access-sandbox-dummy');
      return {
        id: `plaid_tx_${tx.transaction_id}`,
        accountId: `plaid_${tx.account_id}`,
        accountName: matchingAccount?.name || 'Bank Account',
        date: tx.date,
        description: tx.name,
        amount: -tx.amount, // Plaid amounts are positive for expenses, negative for income. We need to invert it for our app
        currency: (tx.iso_currency_code as Currency) || 'USD',
        category: existing?.category || 'Uncategorized',
        tags: existing?.tags || [],
        pending: tx.pending,
        provider: 'plaid' as IntegrationProvider,
        externalId: tx.transaction_id,
        isSandbox,
        isManualCategory: existing?.isManualCategory || false,
      };
    });

    // Try AI auto-categorization if enabled for new transactions
    const prefs = await db.getPreferences();
    if (prefs.autoCategorizeWithAI && newTransactions.length > 0) {
      try {
        const untaggedTxns = newTransactions.filter(tx => tx.category === 'Uncategorized');
        if (untaggedTxns.length > 0) {
          const itemsToCategorize = untaggedTxns.slice(0, 30).map((t: any) => ({
            id: t.id,
            description: t.description,
            amount: t.amount,
            currency: t.currency,
          }));
          const aiRes = await safeJsonFetch<any>('/api/ai/categorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToCategorize }),
          });
          if (aiRes.ok && aiRes.data && aiRes.data.categorizedResults && Array.isArray(aiRes.data.categorizedResults)) {
            newTransactions = newTransactions.map((tx: any) => {
              const match = aiRes.data.categorizedResults.find((r: any) => r.id === tx.id);
              if (match && match.category) {
                return { ...tx, category: match.category };
              }
              return tx;
            });
          }
        }
      } catch (aiErr) {
        console.warn("AI auto-categorization skipped or failed during Plaid sync:", aiErr);
      }
    }

    await db.saveAccounts(newAccounts);
    const saveRes = await db.saveTransactions(newTransactions);
    return {
      accountsCount: newAccounts.length,
      txsCount: newTransactions.length,
      deduplicatedDetails: saveRes.deduplicatedDetails,
    };
  };

  // Incremental Sync Handler for Plaid & Pluggy
  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      let newTxsCount = 0;
      let allDedupDetails: DeduplicationDetail[] = [];

      // Sync Plaid
      const plaidAccs = accounts.filter((a) => a.provider === 'plaid');
      if (plaidAccs.length > 0) {
        const pRes = await safeJsonFetch<any>('/api/plaid/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accounts: plaidAccs, days: 30 }),
        });
        if (pRes.ok && pRes.data && pRes.data.accounts) {
          const { txsCount, deduplicatedDetails } = await processPlaidSyncResult(pRes.data, '');
          newTxsCount += txsCount;
          if (deduplicatedDetails && deduplicatedDetails.length > 0) {
            allDedupDetails.push(...deduplicatedDetails);
          }
        }
      }

      // Sync Pluggy
      const pluggyAccs = accounts.filter((a) => a.provider === 'pluggy');
      if (pluggyAccs.length > 0) {
        const pgRes = await safeJsonFetch<any>('/api/pluggy/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accounts: pluggyAccs }),
        });
        if (pgRes.ok && pgRes.data) {
          if (pgRes.data.updatedAccounts && Array.isArray(pgRes.data.updatedAccounts)) {
            for (const updatedAcc of pgRes.data.updatedAccounts) {
              const existingAcc = accounts.find(a => a.id === updatedAcc.id);
              if (existingAcc) {
                updatedAcc.institutionName = existingAcc.institutionName;
                updatedAcc.name = existingAcc.name;
              }
              await db.saveAccount(updatedAcc);
            }
          }
          if (pgRes.data.newTransactions && pgRes.data.newTransactions.length > 0) {
            const pgSaveRes = await db.saveTransactions(pgRes.data.newTransactions);
            newTxsCount += pgRes.data.newTransactions.length;
            if (pgSaveRes.deduplicatedDetails && pgSaveRes.deduplicatedDetails.length > 0) {
              allDedupDetails.push(...pgSaveRes.deduplicatedDetails);
            }
          }
        }
      }

      const sweep = await db.cleanupDuplicateTransactions();
      if (sweep.details.length > 0) {
        allDedupDetails.push(...sweep.details);
      }

      const log: SyncLog = {
        id: `sync_${Date.now()}`,
        provider: 'plaid',
        status: 'success',
        timestamp: new Date().toISOString(),
        newTransactionsCount: newTxsCount,
        updatedAccountsCount: accounts.length,
        message: allDedupDetails.length > 0
          ? `Incremental sync completed: ${newTxsCount} new, ${allDedupDetails.length} duplicate(s) de-duped.`
          : `Incremental sync completed. Pulled ${newTxsCount} new transactions.`,
        deduplicatedCount: allDedupDetails.length > 0 ? allDedupDetails.length : undefined,
        deduplicationDetails: allDedupDetails.length > 0 ? allDedupDetails : undefined,
      };

      await db.addSyncLog(log);
      await reloadDataFromDb();
      if (allDedupDetails.length > 0) {
        showToast(`⚡ Sync complete! ${newTxsCount} new transactions, ${allDedupDetails.length} duplicate(s) de-duped.`);
      } else {
        showToast(`Sync complete! ${newTxsCount} new transactions pulled.`);
      }
    } catch (err) {
      console.error('Sync failed:', err);
      showToast('Sync failed. Check connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Plaid Integration
  const handleConnectPlaid = async (access_token: string) => {
    try {
      // Connect new account - trigger a one-time process backfilling full 730 days!
      const res = await safeJsonFetch<any>('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token, days: 730 }),
      });
      if (res.ok && res.data && res.data.accounts) {
        const { accountsCount, txsCount, deduplicatedDetails } = await processPlaidSyncResult(res.data, access_token);
        
        await db.addSyncLog({
          id: `sync_${Date.now()}`,
          provider: 'plaid',
          status: 'success',
          timestamp: new Date().toISOString(),
          newTransactionsCount: txsCount,
          updatedAccountsCount: accountsCount,
          message: deduplicatedDetails && deduplicatedDetails.length > 0
            ? `Connected new Plaid accounts (730-day historical backfill: ${txsCount} txs, ${deduplicatedDetails.length} de-duped).`
            : `Connected new Plaid accounts. Performed one-time full 730-day historical backfill.`,
          deduplicatedCount: deduplicatedDetails && deduplicatedDetails.length > 0 ? deduplicatedDetails.length : undefined,
          deduplicationDetails: deduplicatedDetails && deduplicatedDetails.length > 0 ? deduplicatedDetails : undefined,
        });

        await reloadDataFromDb();
        if (deduplicatedDetails && deduplicatedDetails.length > 0) {
          showToast(`⚡ Connected via Plaid! ${txsCount} transactions synced, ${deduplicatedDetails.length} duplicate(s) de-duped.`);
        } else {
          showToast(`Connected via Plaid! Synced ${accountsCount} accounts and ${txsCount} transactions (one-time 730-day backfill).`);
        }
      } else {
        throw new Error(res.error || 'Failed to exchange token & fetch Plaid data');
      }
    } catch (err: any) {
      console.error('Plaid connection failed:', err);
      showToast(`Plaid sync failed: ${err.message || err}`);
    }
  };

  // Plaid Manual Historical Backfill handler
  const handleBackfillPlaidAccount = async (accountId: string, days: number): Promise<{ success: boolean; txsCount: number; error?: string }> => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc || acc.provider !== 'plaid') {
      return { success: false, txsCount: 0, error: 'Plaid account not found.' };
    }

    const token = acc.providerItemId || 'access-sandbox-dummy';

    try {
      const res = await safeJsonFetch<any>('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, days }),
      });
      if (res.ok && res.data && res.data.accounts) {
        const { accountsCount, txsCount, deduplicatedDetails } = await processPlaidSyncResult(res.data, token);

        await db.addSyncLog({
          id: `sync_${Date.now()}`,
          provider: 'plaid',
          status: 'success',
          timestamp: new Date().toISOString(),
          newTransactionsCount: txsCount,
          updatedAccountsCount: accountsCount,
          message: deduplicatedDetails && deduplicatedDetails.length > 0
            ? `Manual Plaid backfill for ${acc.name}: ${txsCount} transactions, ${deduplicatedDetails.length} duplicate(s) de-duped.`
            : `Manual Plaid backfill completed for ${acc.name} (${days} days duration, ${txsCount} transactions).`,
          deduplicatedCount: deduplicatedDetails && deduplicatedDetails.length > 0 ? deduplicatedDetails.length : undefined,
          deduplicationDetails: deduplicatedDetails && deduplicatedDetails.length > 0 ? deduplicatedDetails : undefined,
        });

        await reloadDataFromDb();
        if (deduplicatedDetails && deduplicatedDetails.length > 0) {
          showToast(`⚡ Plaid backfill: ${txsCount} synced, ${deduplicatedDetails.length} duplicate(s) de-duped.`);
        }
        return { success: true, txsCount };
      } else {
        return { success: false, txsCount: 0, error: res.error || 'Failed to trigger Plaid backfill.' };
      }
    } catch (err: any) {
      console.error('Plaid manual backfill failed:', err);
      return { success: false, txsCount: 0, error: err.message || 'Network error occurred.' };
    }
  };

  // Pluggy Open Finance Integration
  const handleConnectPluggy = async (connectorName: string, itemId?: string) => {
    try {
      const res = await safeJsonFetch<any>('/api/pluggy/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorName, itemId }),
      });
      if (!res.ok || !res.data) {
        showToast(`Pluggy Error: ${res.error || 'Connection failed'}`);
        return;
      }
      const data = res.data;
      
      let allDedup: DeduplicationDetail[] = [];

      if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
        if (accounts.some((a) => a.isSandbox)) {
          await db.wipeSandboxData();
        }
        for (const acc of data.accounts) {
          await db.saveAccount(acc);
        }
        if (data.transactions && Array.isArray(data.transactions)) {
          const saveRes = await db.saveTransactions(data.transactions);
          if (saveRes.deduplicatedDetails) {
            allDedup.push(...saveRes.deduplicatedDetails);
          }
        }
        const sweep = await db.cleanupDuplicateTransactions();
        if (sweep.details.length > 0) allDedup.push(...sweep.details);

        await reloadDataFromDb();
        if (allDedup.length > 0) {
          showToast(`⚡ Connected ${connectorName}! ${allDedup.length} duplicate(s) de-duped.`);
        } else {
          showToast(data.message || `Connected ${connectorName} via Pluggy Open Finance!`);
        }
      } else if (data.account && data.transactions) {
        if (accounts.some((a) => a.isSandbox)) {
          await db.wipeSandboxData();
        }
        await db.saveAccount(data.account);
        const saveRes = await db.saveTransactions(data.transactions);
        if (saveRes.deduplicatedDetails) {
          allDedup.push(...saveRes.deduplicatedDetails);
        }
        const sweep = await db.cleanupDuplicateTransactions();
        if (sweep.details.length > 0) allDedup.push(...sweep.details);

        await reloadDataFromDb();
        if (allDedup.length > 0) {
          showToast(`⚡ Connected ${connectorName}! ${allDedup.length} duplicate(s) de-duped.`);
        } else {
          showToast(data.message || `Connected ${connectorName} via Pluggy Open Finance!`);
        }
      } else if (data.error) {
        showToast(`Pluggy Error: ${data.error}`);
      }
    } catch (err: any) {
      console.error('Pluggy connection failed:', err);
      showToast('Pluggy connection failed.');
    }
  };

  const handleFetchPluggyItem = async (itemId: string): Promise<boolean> => {
    try {
      const res = await safeJsonFetch<any>('/api/pluggy/fetch-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok || !res.data) {
        showToast(`Pluggy Error: ${res.error || 'Failed to fetch item'}`);
        return false;
      }
      const data = res.data;

      if (data.accounts && Array.isArray(data.accounts) && data.accounts.length > 0) {
        if (accounts.some((a) => a.isSandbox)) {
          await db.wipeSandboxData();
        }
        for (const acc of data.accounts) {
          await db.saveAccount(acc);
        }
        let allDedup: DeduplicationDetail[] = [];
        if (data.transactions && Array.isArray(data.transactions)) {
          const saveRes = await db.saveTransactions(data.transactions);
          if (saveRes.deduplicatedDetails) allDedup.push(...saveRes.deduplicatedDetails);
        }
        const sweep = await db.cleanupDuplicateTransactions();
        if (sweep.details.length > 0) allDedup.push(...sweep.details);

        await reloadDataFromDb();
        if (allDedup.length > 0) {
          showToast(`⚡ Imported ${data.accounts.length} account(s) (${allDedup.length} duplicate(s) de-duped)!`);
        } else {
          showToast(data.message || `Imported ${data.accounts.length} account(s) from Pluggy Item ${itemId}!`);
        }
        return true;
      } else if (data.error) {
        showToast(`Pluggy Error: ${data.error}`);
        return false;
      }
      return false;
    } catch (err: any) {
      console.error('Fetch Pluggy Item failed:', err);
      showToast(`Pluggy Item import failed.`);
      return false;
    }
  };

  // Statement File Import
  const handleImportParsedFile = async (parsed: ParsedImportResult, targetAccountId: string) => {
    try {
      let targetAcc = accounts.find((a) => a.id === targetAccountId);
      if (!targetAcc) {
        const freshAccs = await db.getAccounts();
        targetAcc = freshAccs.find((a) => a.id === targetAccountId);
      }
      if (!targetAcc) return;

      const newTxs: Transaction[] = parsed.transactions.map((t, idx) => ({
        id: `tx_import_${Date.now()}_${idx}`,
        accountId: targetAcc.id,
        accountName: targetAcc.name,
        date: t.date,
        description: t.description,
        amount: t.amount,
        currency: t.currency || targetAcc.currency,
        category: t.category || 'Uncategorized',
        tags: [...(t.tags || []), 'statement-import'],
        pending: false,
        provider: 'file_import',
      }));

      const saveRes = await db.saveTransactions(newTxs);
      const sweep = await db.cleanupDuplicateTransactions();
      const allDedup: DeduplicationDetail[] = [...saveRes.deduplicatedDetails, ...sweep.details];

      const log: SyncLog = {
        id: `sync_import_${Date.now()}`,
        provider: 'file_import',
        status: 'success',
        timestamp: new Date().toISOString(),
        newTransactionsCount: newTxs.length,
        updatedAccountsCount: 1,
        message: allDedup.length > 0
          ? `Imported ${newTxs.length} records from ${parsed.fileType.toUpperCase()} file (${allDedup.length} duplicate(s) de-duped).`
          : `Imported ${newTxs.length} records from ${parsed.fileType.toUpperCase()} file.`,
        deduplicatedCount: allDedup.length > 0 ? allDedup.length : undefined,
        deduplicationDetails: allDedup.length > 0 ? allDedup : undefined,
      };

      await db.addSyncLog(log);
      await reloadDataFromDb();
      if (allDedup.length > 0) {
        showToast(`⚡ Imported ${newTxs.length} records (${allDedup.length} duplicate(s) de-duped)!`);
      } else {
        showToast(`Imported ${newTxs.length} transactions successfully!`);
      }
    } catch (err) {
      console.error('File import save failed:', err);
    }
  };

  const handleSaveTransactionsFromImport = async (txs: Transaction[]) => {
    const saveRes = await db.saveTransactions(txs);
    const sweep = await db.cleanupDuplicateTransactions();
    const allDedup: DeduplicationDetail[] = [...saveRes.deduplicatedDetails, ...sweep.details];

    const log: SyncLog = {
      id: `sync_import_${Date.now()}`,
      provider: 'file_import',
      status: 'success',
      timestamp: new Date().toISOString(),
      newTransactionsCount: txs.length,
      updatedAccountsCount: 1,
      message: allDedup.length > 0
        ? `Imported ${txs.length} records into database (${allDedup.length} duplicate(s) de-duped).`
        : `Imported ${txs.length} records into database.`,
      deduplicatedCount: allDedup.length > 0 ? allDedup.length : undefined,
      deduplicationDetails: allDedup.length > 0 ? allDedup : undefined,
    };
    await db.addSyncLog(log);
    await reloadDataFromDb();
    if (allDedup.length > 0) {
      showToast(`⚡ Successfully imported ${txs.length} transactions (${allDedup.length} duplicate(s) de-duped)!`);
    } else {
      showToast(`Successfully imported ${txs.length} transactions!`);
    }
  };

  // Save / Delete Single Transaction
  const handleSaveTransaction = async (tx: Transaction) => {
    await db.saveTransaction(tx);
    await reloadDataFromDb();
    showToast('Transaction saved successfully.');
  };

  const handleDeleteTransaction = async (id: string) => {
    await db.deleteTransaction(id);
    await reloadDataFromDb();
    showToast('Transaction removed.');
  };

  // Save & Delete Budget & Category
  const handleSaveBudget = async (b: Budget) => {
    await db.saveBudget(b);
    await reloadDataFromDb();
    showToast('Budget goal saved.');
  };

  const handleDeleteBudget = async (budgetId: string) => {
    await db.deleteBudget(budgetId);
    await reloadDataFromDb();
    showToast('Budget goal removed.');
  };

  const handleSaveCategory = async (c: Category, oldName?: string) => {
    if (oldName && oldName !== c.name) {
      // Cascade rename in transactions
      const allTxs = await db.getTransactions();
      const updatedTxs = allTxs
        .filter((t) => t.category === oldName)
        .map((t) => ({ ...t, category: c.name, isManualCategory: true }));
      if (updatedTxs.length > 0) {
        await db.saveTransactions(updatedTxs);
      }

      // Cascade rename in budgets
      const allBudgets = await db.getBudgets();
      const updatedBudgets = allBudgets
        .filter((b) => b.category === oldName)
        .map((b) => ({ ...b, category: c.name }));
      if (updatedBudgets.length > 0) {
        await db.saveBudgets(updatedBudgets);
      }
    }

    await db.saveCategory(c);
    await reloadDataFromDb();
    showToast(`Category "${c.name}" saved!`);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    await db.deleteCategory(categoryId);
    await reloadDataFromDb();
    showToast('Category removed.');
  };

  // Save & Delete Account
  const handleSaveAccount = async (account: BankAccount) => {
    await db.saveAccount(account);
    await reloadDataFromDb();
    showToast(`Account "${account.name}" saved!`);
  };

  const handleDeleteAccount = async (id: string) => {
    await db.deleteAccount(id);
    await reloadDataFromDb();
    showToast('Account disconnected.');
  };

  // Deduplication Exception Restoration Handlers
  const handleRestoreDeduplicationException = async (logId: string, detailId: string) => {
    const res = await db.restoreDeduplicatedRecord(logId, detailId);
    if (res.success) {
      await reloadDataFromDb();
      showToast('Record restored as a valid transaction & exempted from deduplication!');
    } else {
      showToast('Failed to restore record.');
    }
  };

  const handleUndoRestoreDeduplicationException = async (logId: string, detailId: string) => {
    const res = await db.undoRestoreDeduplicatedRecord(logId, detailId);
    if (res.success) {
      await reloadDataFromDb();
      showToast('Restoration undone. Record de-duplicated again.');
    } else {
      showToast('Failed to undo restoration.');
    }
  };

  // AI Bulk Auto-Categorization
  const handleBulkCategorizeWithAI = async () => {
    setIsCategorizingWithAI(true);
    try {
      const uncategorizedTxs = visibleTransactions.filter((t) => !t.isManualCategory);

      if (uncategorizedTxs.length === 0) {
        showToast('All transactions are already manually categorized!');
        setIsCategorizingWithAI(false);
        return;
      }

      const itemsToCategorize = uncategorizedTxs.slice(0, 20).map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        currency: t.currency,
      }));

      const res = await safeJsonFetch<any>('/api/ai/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsToCategorize,
          categories: categories.map((c) => c.name),
        }),
      });

      if (res.ok && res.data && res.data.categorizedResults && Array.isArray(res.data.categorizedResults)) {
        const updatedTxs = [...transactions];
        res.data.categorizedResults.forEach((resItem: any) => {
          const matchIndex = updatedTxs.findIndex((t) => t.id === resItem.id);
          if (matchIndex !== -1) {
            updatedTxs[matchIndex] = {
              ...updatedTxs[matchIndex],
              category: resItem.category || updatedTxs[matchIndex].category,
              tags: Array.from(new Set([...updatedTxs[matchIndex].tags, ...(resItem.tags || [])])),
              isRecurring: resItem.isRecurring !== undefined ? resItem.isRecurring : updatedTxs[matchIndex].isRecurring,
            };
          }
        });

        await db.saveTransactions(updatedTxs);
        await reloadDataFromDb();
        showToast('AI bulk transaction categorization complete!');
      } else {
        showToast(res.error || 'AI categorization completed with default mappings.');
      }
    } catch (err) {
      console.error('AI Categorization error:', err);
      showToast('AI categorization failed.');
    } finally {
      setIsCategorizingWithAI(false);
    }
  };

  // AI Refresh Insights
  const handleRefreshInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const totalIncome = visibleTransactions
        .filter((t) => t.amount > 0)
        .reduce((acc, t) => acc + convertCurrency(t.amount, t.currency, baseCurrency, exchangeRates.rates), 0);

      const totalExpenses = visibleTransactions
        .filter((t) => t.amount < 0)
        .reduce((acc, t) => acc + convertCurrency(Math.abs(t.amount), t.currency, baseCurrency, exchangeRates.rates), 0);

      const netWorthVal = visibleAccounts.reduce(
        (acc, a) => {
          const balance = a.accountType === 'credit_card' ? a.balance * -1 : a.balance;
          return acc + convertCurrency(balance, a.currency, baseCurrency, exchangeRates.rates);
        },
        0
      );

      // Perform accurate recurring subscription analysis respecting user custom settings & exclusions
      let userCustomSettings = {};
      let userExcludedSubs: string[] = [];
      try {
        const savedCustom = localStorage.getItem('moneta_subscription_custom_settings');
        if (savedCustom) userCustomSettings = JSON.parse(savedCustom);
        const savedExcluded = localStorage.getItem('moneta_excluded_subscriptions');
        if (savedExcluded) userExcludedSubs = JSON.parse(savedExcluded);
      } catch {}

      const recurringData = analyzeRecurringServices(
        visibleTransactions,
        categories,
        baseCurrency,
        exchangeRates.rates,
        userExcludedSubs,
        userCustomSettings
      );

      const recurringSummary = {
        activeCount: recurringData.activeCount,
        totalMonthlyCost: recurringData.totalMonthlyCost,
        services: recurringData.activeServices.map((s) => ({
          name: s.cleanName,
          regularAmount: s.regularAmount,
          currency: s.currency,
          monthlyCost: s.monthlyCost,
          frequency: s.frequency,
          rolling3MonthTotal: s.rolling3MonthTotal,
          rolling3MonthMonthlyAverage: s.rolling3MonthMonthlyAverage,
          isConsolidatedVendor: s.isConsolidatedVendor,
          pendingThisMonthCount: s.pendingThisMonthCount,
          tierCount: s.tiers?.length || 1,
          tiers: s.tiers,
        })),
      };

      const res = await safeJsonFetch<any>('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: visibleTransactions,
          baseCurrency,
          totalIncome,
          totalExpenses,
          netWorth: netWorthVal,
          recurringSummary,
        }),
      });

      if (res.ok && res.data && res.data.insights && Array.isArray(res.data.insights)) {
        await db.saveInsights(res.data.insights);
        await reloadDataFromDb();
        showToast('Gemini AI financial audit completed!');
      }
    } catch (err) {
      console.error('AI Insights error:', err);
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  // FX Rate Update
  const handleUpdateExchangeRate = async (pair: string, rate: number) => {
    const newRates = { ...exchangeRates.rates, [pair]: rate };
    await db.saveExchangeRates(newRates);
    setExchangeRates({ rates: newRates, lastUpdated: new Date().toISOString() });
  };

  // Backups
  const handleCreateManualBackup = async () => {
    const prefs = await db.getPreferences();
    await createBackup('manual', accounts, transactions, categories, budgets, exchangeRates, syncLogs, insights, prefs, backups);
  };

  const handleRestoreBackup = async (id: string) => {
    try {
      const allBackups = await db.getBackups();
      const backupToRestore = allBackups.find(b => b.id === id);
      if (!backupToRestore) {
        showToast('Backup not found.');
        return;
      }
      
      const { data } = backupToRestore;
      if (data.accounts && data.transactions) {
        await db.clearAll();
        if (data.accounts) await db.saveAccounts(data.accounts);
        if (data.transactions) await db.saveTransactions(data.transactions);
        if (data.categories) await db.saveCategories(data.categories);
        if (data.budgets) await db.saveBudgets(data.budgets);
        if (data.exchangeRates) await db.saveExchangeRates(data.exchangeRates.rates);
        if (data.syncLogs) {
          for (const log of data.syncLogs) {
            await db.addSyncLog(log);
          }
        }
        if (data.insights) await db.saveInsights(data.insights);
        if (data.preferences) await db.savePreferences(data.preferences);
        
        // Restore the backups array so we don't lose history!
        for (const b of allBackups) {
          await db.saveBackup(b);
        }

        await reloadDataFromDb();
        showToast('Database backup restored successfully!');
      }
    } catch (err) {
      console.error('Backup restore error:', err);
      showToast('Failed to restore backup.');
    }
  };

  const handleDeleteBackup = async (id: string) => {
    await db.deleteBackup(id);
    const newBackups = await db.getBackups();
    setBackups(newBackups);
    showToast('Backup deleted.');
  };

  // Reset to Sample Data
  const handleWipeEverything = async () => {
    await db.clearAll();
    await reloadDataFromDb();
    showToast('Database wiped completely. You are now on a blank slate.');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-bold text-sm tracking-wide">Initializing Moneta Database...</p>
      </div>
    );
  }

  const lastBankSyncTime = syncLogs[0]?.timestamp || accounts[0]?.lastSyncedAt || new Date().toISOString();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 antialiased selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Top Header Navigation */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        baseCurrency={baseCurrency}
        setBaseCurrency={handleSetBaseCurrency}
        exchangeRates={exchangeRates}
        isSyncing={isSyncing}
        isFetchingRates={isFetchingRates}
        onSyncAll={handleSyncAll}
        onFetchLiveRates={() => handleFetchLiveRates()}
        netWorth={netWorth}
        lastBankSyncTime={lastBankSyncTime}
      />

      {/* Main Body Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            accounts={visibleAccounts}
            transactions={visibleTransactions}
            categories={categories}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onSelectTab={setActiveTab}
            onOpenSync={handleSyncAll}
            onSelectInflow={(month) => {
              setSelectedMonthForTransactions(month);
              setSelectedTypeFilterForTransactions('income');
              setSelectedCategoryForTransactions('all');
              setActiveTab('transactions');
            }}
            onSelectOutflow={(month) => {
              setSelectedMonthForTransactions(month);
              setSelectedTypeFilterForTransactions('expense');
              setSelectedCategoryForTransactions('all');
              setActiveTab('transactions');
            }}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsTab
            transactions={visibleTransactions}
            accounts={visibleAccounts}
            categories={categories}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onSaveTransaction={handleSaveTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onSaveCategory={handleSaveCategory}
            onBulkCategorizeWithAI={handleBulkCategorizeWithAI}
            isCategorizingWithAI={isCategorizingWithAI}
            onOpenImportModal={() => {
              setActiveTab('accounts');
              setIsImportModalOpen(true);
            }}
            activeCategoryFilter={selectedCategoryForTransactions}
            onClearCategoryFilter={() => setSelectedCategoryForTransactions('all')}
            activeMonthFilter={selectedMonthForTransactions}
            onClearMonthFilter={() => setSelectedMonthForTransactions('all')}
            activeTypeFilter={selectedTypeFilterForTransactions}
            onClearTypeFilter={() => setSelectedTypeFilterForTransactions('all')}
            initialSearchTerm={selectedSearchForTransactions}
            onClearSearchTerm={() => setSelectedSearchForTransactions('')}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsTab
            accounts={accounts}
            syncLogs={syncLogs}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onConnectPlaid={handleConnectPlaid}
            onConnectPluggy={handleConnectPluggy}
            onFetchPluggyItem={handleFetchPluggyItem}
            onImportParsedFile={handleImportParsedFile}
            onSaveAccount={handleSaveAccount}
            onDeleteAccount={handleDeleteAccount}
            onRestoreDeduplicationException={handleRestoreDeduplicationException}
            onUndoRestoreDeduplicationException={handleUndoRestoreDeduplicationException}
            isImportModalOpen={isImportModalOpen}
            setIsImportModalOpen={setIsImportModalOpen}
          />
        )}

        {activeTab === 'budgets' && (
          <BudgetsTab
            budgets={budgets}
            categories={categories}
            transactions={visibleTransactions}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onSaveBudget={handleSaveBudget}
            onDeleteBudget={handleDeleteBudget}
            onSaveCategory={handleSaveCategory}
            onDeleteCategory={handleDeleteCategory}
            onSelectCategoryForTransactions={(catName, month) => {
              setSelectedCategoryForTransactions(catName);
              setSelectedMonthForTransactions(month || 'all');
              setActiveTab('transactions');
            }}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsTab
            insights={insights}
            transactions={visibleTransactions}
            categories={categories}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onRefreshInsights={handleRefreshInsights}
            isGeneratingInsights={isGeneratingInsights}
            onNavigateToTransactions={(search) => {
              setSelectedSearchForTransactions(search || '');
              setSelectedCategoryForTransactions('all');
              setSelectedMonthForTransactions('all');
              setActiveTab('transactions');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            baseCurrency={baseCurrency}
            setBaseCurrency={handleSetBaseCurrency}
            exchangeRates={exchangeRates}
            isFetchingRates={isFetchingRates}
            onFetchLiveRates={() => handleFetchLiveRates()}
            onUpdateExchangeRate={handleUpdateExchangeRate}
            backups={backups}
            onCreateManualBackup={handleCreateManualBackup}
            onRestoreBackup={handleRestoreBackup}
            onDeleteBackup={handleDeleteBackup}
            onWipeEverything={handleWipeEverything}
            onWipeSandboxData={handleWipeSandboxData}
            onRestoreSandboxData={handleRestoreSandboxData}
            accounts={accounts}
            onBackfillPlaidAccount={handleBackfillPlaidAccount}
          />
        )}
      </main>

      {/* Statement Import Wizard Modal */}
      <ImportWizardModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        accounts={accounts}
        existingTransactions={transactions}
        categories={categories}
        baseCurrency={baseCurrency}
        exchangeRates={exchangeRates.rates}
        onSaveAccount={async (acc) => {
          await db.saveAccount(acc);
          await reloadDataFromDb();
        }}
        onSaveCategory={handleSaveCategory}
        onSaveTransactions={handleSaveTransactionsFromImport}
        onSuccessNavigate={(tab) => setActiveTab(tab)}
      />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center space-x-3 text-xs animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
