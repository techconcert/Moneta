import { BankAccount, Transaction, Category, Budget, ExchangeRates, SyncLog, AIInsight, UserPreferences, Currency, CategorizationRule, BackupSnapshot, DeduplicationDetail, DedupException } from '../types';
import { DEFAULT_RATES } from './currency';
import { getSuggestedCategoryIcon } from '../components/CategoryIcon';

const DB_NAME = 'MonetaDB';
const LEGACY_DB_NAME = 'MintLocalDB';
const DB_VERSION = 4;

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10B981', type: 'expense', isDefault: true },
  { id: 'cat_restaurants', name: 'Restaurants & Dining', icon: 'Utensils', color: '#F59E0B', type: 'expense', isDefault: true },
  { id: 'cat_bills', name: 'Bills & Utilities', icon: 'Zap', color: '#6366F1', type: 'expense', isDefault: true },
  { id: 'cat_transport', name: 'Transportation', icon: 'Car', color: '#3B82F6', type: 'expense', isDefault: true },
  { id: 'cat_shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#EC4899', type: 'expense', isDefault: true },
  { id: 'cat_subscriptions', name: 'Subscriptions & Media', icon: 'Tv', color: '#8B5CF6', type: 'expense', isDefault: true },
  { id: 'cat_health', name: 'Health & Fitness', icon: 'HeartPulse', color: '#EF4444', type: 'expense', isDefault: true },
  { id: 'cat_housing', name: 'Housing & Rent', icon: 'Home', color: '#14B8A6', type: 'expense', isDefault: true },
  { id: 'cat_income', name: 'Income & Salary', icon: 'TrendingUp', color: '#22C55E', type: 'income', isDefault: true },
  { id: 'cat_investments', name: 'Investments & Crypto', icon: 'Coins', color: '#0EA5E9', type: 'income', isDefault: true },
  { id: 'cat_transfer', name: 'Internal Transfer', icon: 'ArrowLeftRight', color: '#64748B', type: 'transfer', isDefault: true },
  { id: 'cat_uncategorized', name: 'Uncategorized', icon: 'HelpCircle', color: '#94A3B8', type: 'expense', isDefault: true },
];

export class LocalDatabase {
  private db: IDBDatabase | null = null;

  private async migrateDatabase(oldName: string, newName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const reqOld = indexedDB.open(oldName);
      reqOld.onerror = () => reject(reqOld.error);
      reqOld.onsuccess = () => {
        const dbOld = reqOld.result;
        const storeNames = Array.from(dbOld.objectStoreNames);
        
        const reqNew = indexedDB.open(newName, DB_VERSION);
        reqNew.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('transactions')) {
            const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
            txStore.createIndex('accountId', 'accountId', { unique: false });
            txStore.createIndex('date', 'date', { unique: false });
            txStore.createIndex('category', 'category', { unique: false });
            txStore.createIndex('currency', 'currency', { unique: false });
          }
          if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('exchangeRates')) db.createObjectStore('exchangeRates', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('syncLogs')) db.createObjectStore('syncLogs', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('insights')) db.createObjectStore('insights', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('categorizationRules')) db.createObjectStore('categorizationRules', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('dedupExceptions')) db.createObjectStore('dedupExceptions', { keyPath: 'id' });
        };
        
        reqNew.onsuccess = async () => {
          const dbNew = reqNew.result;
          
          for (const storeName of storeNames) {
            try {
              const oldData = await new Promise<any[]>((res, rej) => {
                if (!dbOld.objectStoreNames.contains(storeName)) {
                  res([]);
                  return;
                }
                const tx = dbOld.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => res(req.result || []);
                req.onerror = () => rej(req.error);
              });
              
              if (oldData.length > 0 && dbNew.objectStoreNames.contains(storeName)) {
                await new Promise<void>((res, rej) => {
                  const tx = dbNew.transaction(storeName, 'readwrite');
                  const store = tx.objectStore(storeName);
                  let count = 0;
                  oldData.forEach(item => {
                    const req = store.put(item);
                    req.onsuccess = () => {
                      count++;
                      if (count === oldData.length) res();
                    };
                    req.onerror = () => rej(req.error);
                  });
                });
              }
            } catch (e) {
              console.warn(`Failed to migrate store ${storeName}`, e);
            }
          }
          
          dbOld.close();
          dbNew.close();
          resolve();
        };
        reqNew.onerror = () => reject(reqNew.error);
      };
    });
  }

  async init(): Promise<void> {
    if (this.db) return;

    // Check and migrate legacy DB if needed
    try {
      const dbs = await indexedDB.databases();
      const hasLegacy = dbs.some(d => d.name === LEGACY_DB_NAME);
      const hasNew = dbs.some(d => d.name === DB_NAME);
      
      if (hasLegacy && !hasNew) {
        console.log('Migrating from legacy database...');
        await this.migrateDatabase(LEGACY_DB_NAME, DB_NAME);
      }
    } catch (e) {
      console.warn('Could not check databases for migration', e);
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = async () => {
        this.db = request.result;
        try {
          await this.cleanupDuplicateCategories();
          await this.cleanupDuplicateTransactions();
        } catch (err) {
          console.warn("Cleanup failed during init:", err);
        }
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('accounts')) {
          db.createObjectStore('accounts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('accountId', 'accountId', { unique: false });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('category', 'category', { unique: false });
          txStore.createIndex('currency', 'currency', { unique: false });
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('exchangeRates')) {
          db.createObjectStore('exchangeRates', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('syncLogs')) {
          db.createObjectStore('syncLogs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('insights')) {
          db.createObjectStore('insights', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('categorizationRules')) {
          db.createObjectStore('categorizationRules', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('backups')) {
          db.createObjectStore('backups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('dedupExceptions')) {
          db.createObjectStore('dedupExceptions', { keyPath: 'id' });
        }
      };
    });
  }

  // Generic helper methods
  private async getAll<T>(storeName: string): Promise<T[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  private async put<T>(storeName: string, item: T): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async putMany<T>(storeName: string, items: T[]): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let completed = 0;
      if (items.length === 0) {
        resolve();
        return;
      }
      items.forEach(item => {
        const req = store.put(item);
        req.onsuccess = () => {
          completed++;
          if (completed === items.length) resolve();
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  private async delete(storeName: string, id: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async clearStore(storeName: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- ACCOUNTS ---
  async getAccounts(): Promise<BankAccount[]> {
    return this.getAll<BankAccount>('accounts');
  }

  async saveAccount(account: BankAccount): Promise<void> {
    return this.put('accounts', account);
  }

  async saveAccounts(accounts: BankAccount[]): Promise<void> {
    return this.putMany('accounts', accounts);
  }

  async deleteAccount(id: string): Promise<void> {
    await this.delete('accounts', id);
    // Also remove associated transactions
    const txs = await this.getTransactions();
    const toDelete = txs.filter(t => t.accountId === id);
    for (const t of toDelete) {
      await this.delete('transactions', t.id);
    }
  }

  // --- CATEGORIZATION RULES & MEMORY ENGINE ---
  async getCategorizationRules(): Promise<CategorizationRule[]> {
    return this.getAll<CategorizationRule>('categorizationRules');
  }

  async saveCategorizationRule(rule: CategorizationRule): Promise<void> {
    return this.put('categorizationRules', rule);
  }

  async deleteCategorizationRule(id: string): Promise<void> {
    return this.delete('categorizationRules', id);
  }

  // Normalizes merchant/description to extract core search pattern
  normalizeMerchantPattern(desc: string): string {
    if (!desc) return '';
    let cleaned = desc.toLowerCase()
      .replace(/pix\s*-\s*enviado\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}/gi, '')
      .replace(/pix\s*-\s*recebido\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}/gi, '')
      .replace(/compra\s*com\s*cartão\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}/gi, '')
      .replace(/\d{2}\/\d{2}\s*\d{2}:\d{2}/g, '')
      .replace(/ebn\s*\*/gi, '')
      .replace(/dm\s*\*/gi, '')
      .replace(/br\s*\*/gi, '')
      .trim();
    return cleaned || desc.toLowerCase().trim();
  }

  // Normalizes transaction description for deduplication (removing timestamps, ACH prefixes, trace numbers)
  normalizeTxCore(desc: string): string {
    if (!desc) return '';
    let cleaned = desc.toLowerCase()
      // Remove common bank/ACH prefixes
      .replace(/^ach\s+electronic\s+debit\b/gi, '')
      .replace(/^ach\s+debit\b/gi, '')
      .replace(/^ach\s+credit\b/gi, '')
      .replace(/^pos\s+debit\b/gi, '')
      .replace(/^pos\s+purchase\b/gi, '')
      .replace(/^checkcard\s+purchase\b/gi, '')
      .replace(/^debit\s+card\b/gi, '')
      .replace(/^electronic\s+debit\b/gi, '')
      .replace(/^electronic\s+withdrawal\b/gi, '')
      .replace(/pix\s*-\s*enviado\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}/gi, '')
      .replace(/pix\s*-\s*recebido\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}/gi, '')
      .replace(/compra\s*com\s*cartão\s*-\s*\d{2}\/\d{2}\s*\d{2}:\d{2}/gi, '')
      // Remove embedded timestamp/date tags like 'Aug07 06:43a 0000' or '08/07 06:43'
      .replace(/[a-z]{3}\s*\d{1,2}\s+\d{1,2}:\d{2}[ap]?m?\s+\d{3,4}/gi, '')
      .replace(/[a-z]{3}\s*\d{1,2}\s+\d{1,2}:\d{2}[ap]?m?/gi, '')
      .replace(/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}[ap]?m?/gi, '')
      .replace(/\b\d{2}:\d{2}[ap]?m?\b/gi, '')
      .replace(/\b0000\b/g, '')
      .replace(/ebn\s*\*/gi, '')
      .replace(/dm\s*\*/gi, '')
      .replace(/br\s*\*/gi, '')
      // Remove extraneous separators and symbols
      .replace(/[-:;,*#_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || desc.toLowerCase().trim();
  }

  // Exception rule for Toyota Motor Credit: allows exactly ONE duplicate (2 valid payments total), but dedupes 3+
  isToyotaDualPayment(desc: string, amount?: number, date?: string): boolean {
    if (!desc) return false;
    const lower = desc.toLowerCase();
    const isToyota = lower.includes('toyota motor credit') || lower.includes('toyota motor cre') || lower.includes('toyota');
    if (typeof amount === 'number') {
      const isAmt = Math.abs(Math.abs(amount) - 4069.89) < 1;
      return isToyota && isAmt;
    }
    return isToyota;
  }

  // --- DEDUPLICATION EXCEPTIONS & RESTORATION ---
  async getDedupExceptions(): Promise<DedupException[]> {
    try {
      return await this.getAll<DedupException>('dedupExceptions');
    } catch {
      return [];
    }
  }

  async saveDedupException(exc: DedupException): Promise<void> {
    try {
      return await this.put('dedupExceptions', exc);
    } catch (e) {
      console.warn('saveDedupException error:', e);
    }
  }

  async deleteDedupException(id: string): Promise<void> {
    try {
      return await this.delete('dedupExceptions', id);
    } catch (e) {
      console.warn('deleteDedupException error:', e);
    }
  }

  isTxDedupExempt(
    tx: { accountId: string; date: string; description: string; amount: number; id?: string; exemptFromDedup?: boolean; isDedupException?: boolean },
    exceptions: DedupException[]
  ): boolean {
    if (tx.exemptFromDedup || tx.isDedupException) return true;
    if (!exceptions || exceptions.length === 0) return false;
    return exceptions.some(
      (e) =>
        (tx.id && e.transactionId && e.transactionId === tx.id) ||
        (e.accountId === tx.accountId &&
          Math.abs(e.amount - tx.amount) < 0.005 &&
          e.date === tx.date &&
          (e.description === tx.description || e.description.toLowerCase().trim() === tx.description.toLowerCase().trim()))
    );
  }

  async restoreDeduplicatedRecord(logId: string, detailId: string): Promise<{ success: boolean; restoredTx?: Transaction }> {
    try {
      const logs = await this.getSyncLogs();
      const log = logs.find((l) => l.id === logId);
      if (!log || !log.deduplicationDetails) return { success: false };

      const detailIndex = log.deduplicationDetails.findIndex((d) => d.id === detailId);
      if (detailIndex === -1) return { success: false };

      const detail = log.deduplicationDetails[detailIndex];
      const restoredId = detail.restoredTransactionId || `tx_exc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const accounts = await this.getAccounts();
      const acc = accounts.find((a) => a.id === detail.accountId);

      const restoredTx: Transaction = {
        id: restoredId,
        accountId: detail.accountId,
        accountName: detail.accountName || acc?.name || 'Account',
        date: detail.date,
        description: detail.duplicateDescription,
        originalDescription: detail.duplicateDescription,
        amount: detail.amount,
        currency: detail.currency || acc?.currency || 'USD',
        category: detail.category || 'Uncategorized',
        tags: ['Exception', 'Restored'],
        pending: false,
        provider: acc?.provider || 'manual',
        exemptFromDedup: true,
        isDedupException: true,
      };

      // Save directly into transactions store so it is immediately active in the ledger
      await this.put('transactions', restoredTx);

      // Save an exception rule so future synchronizations/scans never merge or purge this record again
      const exc: DedupException = {
        id: `exc_${detail.accountId}_${detail.date}_${Math.abs(detail.amount)}_${Math.random().toString(36).substr(2, 6)}`,
        transactionId: restoredId,
        accountId: detail.accountId,
        description: detail.duplicateDescription,
        amount: detail.amount,
        date: detail.date,
        createdAt: new Date().toISOString(),
        notes: `User explicitly allowed de-duplication match as a separate valid transaction.`,
      };
      await this.saveDedupException(exc);

      // Update sync log audit trail item
      detail.restored = true;
      detail.restoredAt = new Date().toISOString();
      detail.restoredTransactionId = restoredId;
      log.deduplicationDetails[detailIndex] = detail;
      await this.put('syncLogs', log);

      return { success: true, restoredTx };
    } catch (err) {
      console.error('restoreDeduplicatedRecord error:', err);
      return { success: false };
    }
  }

  async undoRestoreDeduplicatedRecord(logId: string, detailId: string): Promise<{ success: boolean }> {
    try {
      const logs = await this.getSyncLogs();
      const log = logs.find((l) => l.id === logId);
      if (!log || !log.deduplicationDetails) return { success: false };

      const detailIndex = log.deduplicationDetails.findIndex((d) => d.id === detailId);
      if (detailIndex === -1) return { success: false };

      const detail = log.deduplicationDetails[detailIndex];
      if (detail.restoredTransactionId) {
        await this.delete('transactions', detail.restoredTransactionId);

        const exceptions = await this.getDedupExceptions();
        const matchedExc = exceptions.find(
          (e) =>
            e.transactionId === detail.restoredTransactionId ||
            (e.accountId === detail.accountId && e.date === detail.date && Math.abs(e.amount - detail.amount) < 0.005)
        );
        if (matchedExc) {
          await this.deleteDedupException(matchedExc.id);
        }
      }

      detail.restored = false;
      delete detail.restoredAt;
      delete detail.restoredTransactionId;
      log.deduplicationDetails[detailIndex] = detail;
      await this.put('syncLogs', log);

      return { success: true };
    } catch (err) {
      console.error('undoRestoreDeduplicatedRecord error:', err);
      return { success: false };
    }
  }

  // --- TRANSACTIONS ---
  async getTransactions(): Promise<Transaction[]> {
    const txs = await this.getAll<Transaction>('transactions');
    return txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async cleanupDuplicateTransactions(): Promise<{ count: number; details: DeduplicationDetail[] }> {
    try {
      const txs = await this.getAll<Transaction>('transactions');
      if (txs.length === 0) return { count: 0, details: [] };

      const exceptions = await this.getDedupExceptions();
      const isExempt = (t: Transaction) => this.isTxDedupExempt(t, exceptions);

      const toDeleteIds = new Set<string>();
      const updatedTxs: Transaction[] = [];
      const details: DeduplicationDetail[] = [];

      // 1. Check Toyota Motor Credit dual payment: allow exactly 2 valid payments; deduplicate 3rd and higher
      const toyotaMatches = txs.filter((t) => this.isToyotaDualPayment(t.description, t.amount, t.date));
      if (toyotaMatches.length > 2) {
        // Keep first 2, deduplicate excess (3rd, 4th, etc.)
        for (let k = 2; k < toyotaMatches.length; k++) {
          const excess = toyotaMatches[k];
          if (isExempt(excess)) continue;
          toDeleteIds.add(excess.id);
          details.push({
            id: `dedup_${Date.now()}_toyota_${k}`,
            originalDescription: toyotaMatches[0].description,
            duplicateDescription: excess.description,
            amount: excess.amount,
            currency: excess.currency,
            date: excess.date,
            accountId: excess.accountId,
            accountName: excess.accountName,
            category: 'Income & Salary',
            reason: `Excess duplicate removed: Toyota dual payment exception permits exactly 2 valid payments. 3rd duplicate pruned.`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      for (let i = 0; i < txs.length; i++) {
        const a = txs[i];
        if (toDeleteIds.has(a.id) || isExempt(a)) continue;

        const isAToyota = this.isToyotaDualPayment(a.description, a.amount, a.date);

        const aCore = this.normalizeTxCore(a.description);
        const aTime = new Date(a.date).getTime();

        for (let j = i + 1; j < txs.length; j++) {
          const b = txs[j];
          if (toDeleteIds.has(b.id) || isExempt(b)) continue;

          const isBToyota = this.isToyotaDualPayment(b.description, b.amount, b.date);

          // If both are Toyota dual payments, allow up to 2 across the dataset (handled above)
          if (isAToyota && isBToyota) {
            continue;
          }

          // Must be same account and same amount (both negative or both positive)
          if (a.accountId !== b.accountId) continue;
          if (Math.abs(a.amount - b.amount) > 0.005) continue;
          if (a.currency !== b.currency) continue;

          // Must be within 3.5 days of each other (settlement window)
          const bTime = new Date(b.date).getTime();
          const dayDiff = Math.abs(aTime - bTime) / (1000 * 60 * 60 * 24);
          if (dayDiff > 3.5) continue;

          const bCore = this.normalizeTxCore(b.description);

          const isCoreMatch =
            aCore === bCore ||
            (aCore.length > 4 && bCore.length > 4 && (aCore.includes(bCore) || bCore.includes(aCore)));

          if (isCoreMatch) {
            // Determine survivor:
            // 1. Prefer non-pending
            // 2. Prefer one without timestamp code in raw description
            // 3. Prefer one with user manual category or notes
            let survivor: Transaction;
            let obsolete: Transaction;

            const aHasTimestamp = /[a-z]{3}\s*\d{1,2}\s+\d{1,2}:\d{2}/i.test(a.description);
            const bHasTimestamp = /[a-z]{3}\s*\d{1,2}\s+\d{1,2}:\d{2}/i.test(b.description);

            if (a.pending && !b.pending) {
              survivor = b;
              obsolete = a;
            } else if (!a.pending && b.pending) {
              survivor = a;
              obsolete = b;
            } else if (aHasTimestamp && !bHasTimestamp) {
              survivor = b;
              obsolete = a;
            } else if (!aHasTimestamp && bHasTimestamp) {
              survivor = a;
              obsolete = b;
            } else if (a.isManualCategory && !b.isManualCategory) {
              survivor = a;
              obsolete = b;
            } else if (!a.isManualCategory && b.isManualCategory) {
              survivor = b;
              obsolete = a;
            } else {
              survivor = a;
              obsolete = b;
            }

            // Merge metadata (notes, tags, manual category) to survivor
            if (obsolete.notes && !survivor.notes) {
              survivor.notes = obsolete.notes;
            }
            if (obsolete.tags && obsolete.tags.length > 0) {
              survivor.tags = Array.from(new Set([...(survivor.tags || []), ...obsolete.tags]));
            }
            if (obsolete.isManualCategory && !survivor.isManualCategory) {
              survivor.category = obsolete.category;
              survivor.isManualCategory = true;
            }

            const detail: DeduplicationDetail = {
              id: `dedup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              originalDescription: survivor.description,
              duplicateDescription: obsolete.description,
              amount: survivor.amount,
              currency: survivor.currency,
              date: survivor.date,
              accountId: survivor.accountId,
              accountName: survivor.accountName,
              category: survivor.category,
              reason: `Settled bank record matched and merged pending clearinghouse entry containing timestamp codes.`,
              timestamp: new Date().toISOString(),
            };
            details.push(detail);

            toDeleteIds.add(obsolete.id);
            updatedTxs.push(survivor);
          }
        }
      }

      if (toDeleteIds.size > 0) {
        for (const delId of toDeleteIds) {
          await this.delete('transactions', delId);
        }
        if (updatedTxs.length > 0) {
          await this.putMany('transactions', updatedTxs);
        }
      }

      return { count: toDeleteIds.size, details };
    } catch (e) {
      console.warn("cleanupDuplicateTransactions error:", e);
      return { count: 0, details: [] };
    }
  }

  async saveTransaction(tx: Transaction): Promise<void> {
    // If category was manually chosen or marked, save memory rule
    if (tx.isManualCategory && tx.description && tx.category) {
      const pattern = this.normalizeMerchantPattern(tx.description);
      if (pattern) {
        await this.saveCategorizationRule({
          id: `rule_${pattern.replace(/[^a-z0-9]/g, '_')}`,
          pattern,
          category: tx.category,
          userOverridden: true,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 1. Never auto-create new categories: if category cannot be mapped to an existing category, leave in 'Uncategorized'
    const existingCats = await this.getCategories();
    const rawCategory = (tx.category || '').trim();
    if (rawCategory) {
      const match = existingCats.find((c) => c.name.toLowerCase().trim() === rawCategory.toLowerCase());
      if (match) {
        tx.category = match.name;
      } else {
        tx.category = 'Uncategorized';
      }
    } else {
      tx.category = 'Uncategorized';
    }

    return this.put('transactions', tx);
  }

  async saveTransactions(txs: Transaction[]): Promise<{ savedCount: number; deduplicatedDetails: DeduplicationDetail[] }> {
    if (txs.length === 0) return { savedCount: 0, deduplicatedDetails: [] };

    const existingTxs = await this.getTransactions();
    const rules = await this.getCategorizationRules();
    const exceptions = await this.getDedupExceptions();
    const existingCats = await this.getCategories();
    const deduplicatedDetails: DeduplicationDetail[] = [];

    // Map existing transactions for fast lookup and re-sync protection
    const existingMap = new Map<string, Transaction>();
    existingTxs.forEach((t) => {
      existingMap.set(t.id, t);
      if (t.externalId) existingMap.set(t.externalId, t);
      const signature = `${t.accountId}_${t.date}_${t.description}_${t.amount}`;
      existingMap.set(signature, t);
    });

    // Map categorization rules
    const ruleMap = new Map<string, string>();
    rules.forEach((r) => ruleMap.set(r.pattern, r.category));

    const finalTxs: Transaction[] = [];

    // Track count of Toyota dual payment records
    let currentToyotaCount = existingTxs.filter((t) => this.isToyotaDualPayment(t.description, t.amount, t.date)).length;

    for (const tx of txs) {
      const isIncomingExempt = this.isTxDedupExempt(tx, exceptions);
      const isToyota = this.isToyotaDualPayment(tx.description, tx.amount, tx.date);
      const signature = `${tx.accountId}_${tx.date}_${tx.description}_${tx.amount}`;
      
      let existing: Transaction | undefined;

      if (isIncomingExempt) {
        // Only match exact ID or external ID for explicitly exempt transactions, never merge into a different transaction
        existing = existingMap.get(tx.id) || (tx.externalId ? existingMap.get(tx.externalId) : undefined);
      } else if (isToyota) {
        // If we already have 2 or more Toyota records, any new one MUST be deduplicated
        if (currentToyotaCount >= 2) {
          existing = existingMap.get(tx.id) || (tx.externalId ? existingMap.get(tx.externalId) : undefined) || existingMap.get(signature) || existingTxs.find((t) => this.isToyotaDualPayment(t.description, t.amount, t.date));
        } else {
          // If we have fewer than 2, check if exact ID match exists. If not, this is the valid 2nd payment!
          existing = existingMap.get(tx.id) || (tx.externalId ? existingMap.get(tx.externalId) : undefined);
          if (!existing) {
            currentToyotaCount++;
          }
        }
      } else {
        existing = existingMap.get(tx.id) || (tx.externalId ? existingMap.get(tx.externalId) : undefined) || existingMap.get(signature);

        // Fuzzy duplicate check for pending/posted matches or intraday timestamp differences
        if (!existing) {
          const txCore = this.normalizeTxCore(tx.description);
          const txTime = new Date(tx.date).getTime();
          for (const prev of existingTxs) {
            if (this.isTxDedupExempt(prev, exceptions)) continue;
            if (this.isToyotaDualPayment(prev.description, prev.amount, prev.date)) continue;
            if (prev.accountId === tx.accountId && Math.abs(prev.amount - tx.amount) < 0.005) {
              const prevTime = new Date(prev.date).getTime();
              if (Math.abs(txTime - prevTime) <= 3.5 * 24 * 60 * 60 * 1000) {
                const prevCore = this.normalizeTxCore(prev.description);
                if (txCore === prevCore || (txCore.length > 4 && prevCore.length > 4 && (txCore.includes(prevCore) || prevCore.includes(txCore)))) {
                  existing = prev;
                  break;
                }
              }
            }
          }
        }
      }

      let finalTx: Transaction = { ...tx };

      if (existing) {
        // Keep existing database ID to prevent duplicates
        finalTx.id = existing.id;

        // Preserve notes & tags if present
        if (existing.notes) finalTx.notes = existing.notes;
        if (existing.tags && existing.tags.length > 0) finalTx.tags = existing.tags;

        if (existing.description !== tx.description) {
          deduplicatedDetails.push({
            id: `dedup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            originalDescription: finalTx.description,
            duplicateDescription: existing.description,
            amount: finalTx.amount,
            currency: finalTx.currency,
            date: finalTx.date,
            accountId: finalTx.accountId,
            accountName: finalTx.accountName,
            category: finalTx.category,
            reason: `Settled bank record matched and updated existing clearinghouse/pending entry.`,
            timestamp: new Date().toISOString(),
          });
        }

        // 1. RE-SYNC SAFEGUARD: If transaction already exists and was re-categorized by user, KEEP user category!
        if (existing.isManualCategory) {
          if (tx.isManualCategory) {
            finalTx.category = tx.category;
            finalTx.isManualCategory = true;
          } else {
            finalTx.category = existing.category;
            finalTx.isManualCategory = true;
          }
        } else {
          if (tx.isManualCategory) {
            finalTx.category = tx.category;
            finalTx.isManualCategory = true;
          } else {
            // Check memory rules for unflagged existing transactions
            const pattern = this.normalizeMerchantPattern(tx.description);
            let matchedCategory: string | undefined = undefined;
            if (pattern) {
              matchedCategory = ruleMap.get(pattern);
              if (!matchedCategory) {
                for (const [p, cat] of ruleMap.entries()) {
                  if (p.length > 3 && (pattern.includes(p) || p.includes(pattern))) {
                    matchedCategory = cat;
                    break;
                  }
                }
              }
            }

            if (matchedCategory) {
              finalTx.category = matchedCategory;
              finalTx.isManualCategory = true;
            } else {
              // No matching rule, handle category updates for incoming synced/AI categorized transactions.
              const existingCatLower = (existing.category || '').toLowerCase().trim();
              const incomingCatLower = (tx.category || '').toLowerCase().trim();
              const isExistingUncategorized = !existing.category || existingCatLower === 'uncategorized' || existingCatLower === 'cat_uncategorized';
              const isIncomingUncategorized = !tx.category || incomingCatLower === 'uncategorized' || incomingCatLower === 'cat_uncategorized';

              if (!isIncomingUncategorized) {
                finalTx.category = tx.category;
              } else if (!isExistingUncategorized) {
                finalTx.category = existing.category;
              } else {
                finalTx.category = 'Uncategorized';
              }
              finalTx.isManualCategory = false;
            }
          }
        }
      } else {
        // 2. MEMORY / HISTORY RULE ENGINE for new transactions: Check if user previously recategorized something similar
        const pattern = this.normalizeMerchantPattern(tx.description);
        if (pattern) {
          let matchedCategory: string | undefined = ruleMap.get(pattern);
          if (!matchedCategory) {
            for (const [p, cat] of ruleMap.entries()) {
              if (p.length > 3 && (pattern.includes(p) || p.includes(pattern))) {
                matchedCategory = cat;
                break;
              }
            }
          }
          if (matchedCategory) {
            finalTx.category = matchedCategory;
            finalTx.isManualCategory = true;
          }
        }
      }

      // 3. DO NOT CREATE NEW CATEGORIES
      // If the category cannot be mapped to an existing category in the database, leave in 'Uncategorized'
      const currentCatRaw = (finalTx.category || '').trim();
      if (currentCatRaw) {
        const matched = existingCats.find((c) => c.name.toLowerCase().trim() === currentCatRaw.toLowerCase());
        if (matched) {
          finalTx.category = matched.name;
        } else {
          finalTx.category = 'Uncategorized';
        }
      } else {
        finalTx.category = 'Uncategorized';
      }

      finalTxs.push(finalTx);
    }

    await this.putMany('transactions', finalTxs);

    // Run sweep for any cross-duplicates
    const sweep = await this.cleanupDuplicateTransactions();
    if (sweep.details.length > 0) {
      deduplicatedDetails.push(...sweep.details);
    }

    return { savedCount: finalTxs.length, deduplicatedDetails };
  }

  async deleteTransaction(id: string): Promise<void> {
    return this.delete('transactions', id);
  }

  // --- CATEGORIES ---
  async getCategories(): Promise<Category[]> {
    let cats = await this.getAll<Category>('categories');
    if (cats.length === 0) {
      await this.saveCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    }

    // Check if any duplicate category names exist or cleanup is needed
    const seen = new Set<string>();
    let hasDuplicates = false;
    for (const c of cats) {
      const key = (c.name || '').toLowerCase().trim();
      if (seen.has(key) || key === 'cat_uncategorized' || key === 'cat_plaid_uncategorized' || !key) {
        hasDuplicates = true;
        break;
      }
      seen.add(key);
    }

    if (hasDuplicates) {
      await this.cleanupDuplicateCategories();
      cats = await this.getAll<Category>('categories');
    }

    return cats;
  }

  async saveCategory(cat: Category): Promise<void> {
    return this.put('categories', cat);
  }

  async saveCategories(cats: Category[]): Promise<void> {
    return this.putMany('categories', cats);
  }

  async deleteCategory(id: string): Promise<void> {
    return this.delete('categories', id);
  }

  async cleanupDuplicateCategories(): Promise<void> {
    try {
      const cats = await this.getAll<Category>('categories');
      const txs = await this.getAll<Transaction>('transactions');
      const budgets = await this.getAll<Budget>('budgets');
      let txsChanged = false;
      let budgetsChanged = false;

      // Group categories by normalized lower name
      const catsByName = new Map<string, Category[]>();
      for (const c of cats) {
        // Delete invalid placeholder categories
        if (c.name === 'cat_uncategorized' || c.name === 'cat_plaid_uncategorized' || !c.name || !c.name.trim()) {
          await this.deleteCategory(c.id);
          continue;
        }

        const lower = c.name.toLowerCase().trim();
        if (!catsByName.has(lower)) {
          catsByName.set(lower, []);
        }
        catsByName.get(lower)!.push(c);
      }

      // Merge duplicates for each group
      for (const [lowerName, group] of catsByName.entries()) {
        if (group.length > 1) {
          // Select survivor: prefer isDefault, or established ID, or first item
          let survivor = group.find((c) => c.isDefault) ||
            group.find((c) => c.id === `cat_${lowerName}`) ||
            group[0];

          // If this is Taxes, ensure it is properly set up as an expense category
          if (lowerName === 'taxes' || lowerName === 'tax') {
            survivor = {
              ...survivor,
              name: 'Taxes',
              type: 'expense',
              icon: survivor.icon || 'Receipt',
              color: survivor.color || '#EF4444',
            };
            await this.saveCategory(survivor);
          }

          const survivorName = survivor.name;
          const duplicateIds = group.filter((c) => c.id !== survivor.id).map((c) => c.id);
          const duplicateNames = new Set(group.map((c) => c.name.toLowerCase().trim()));

          // Delete all duplicates
          for (const dupId of duplicateIds) {
            await this.deleteCategory(dupId);
          }

          // Remap all transactions belonging to duplicate categories to survivor
          for (const tx of txs) {
            const txCatLower = (tx.category || '').toLowerCase().trim();
            if (duplicateNames.has(txCatLower) && tx.category !== survivorName) {
              tx.category = survivorName;
              txsChanged = true;
            }
          }

          // Remap and merge budgets
          const matchingBudgets = budgets.filter((b) => duplicateNames.has((b.category || '').toLowerCase().trim()));
          if (matchingBudgets.length > 1) {
            const survivorBudget = matchingBudgets[0];
            survivorBudget.category = survivorName;
            for (let i = 1; i < matchingBudgets.length; i++) {
              await this.deleteBudget(matchingBudgets[i].id);
            }
            await this.saveBudget(survivorBudget);
            budgetsChanged = true;
          } else if (matchingBudgets.length === 1 && matchingBudgets[0].category !== survivorName) {
            matchingBudgets[0].category = survivorName;
            await this.saveBudget(matchingBudgets[0]);
            budgetsChanged = true;
          }
        }
      }

      // Check transactions for corrupt or missing categories
      const activeCats = await this.getAll<Category>('categories');
      const activeCatNames = new Set(activeCats.map((c) => c.name.toLowerCase().trim()));

      for (const tx of txs) {
        if (!tx.category || tx.category === 'cat_uncategorized' || tx.category === 'cat_plaid_uncategorized') {
          tx.category = 'Uncategorized';
          txsChanged = true;
        } else {
          const lower = tx.category.toLowerCase().trim();
          const match = activeCats.find((c) => c.name.toLowerCase().trim() === lower);
          if (match && tx.category !== match.name) {
            tx.category = match.name;
            txsChanged = true;
          } else if (!match && !activeCatNames.has(lower)) {
            // Unmapped category in transaction -> leave in Uncategorized
            tx.category = 'Uncategorized';
            txsChanged = true;
          }
        }
      }

      if (txsChanged) {
        await this.putMany('transactions', txs);
      }
    } catch (err) {
      console.warn("Failed to cleanup categories:", err);
    }
  }

  // --- BUDGETS ---
  async getBudgets(): Promise<Budget[]> {
    return this.getAll<Budget>('budgets');
  }

  async saveBudget(budget: Budget): Promise<void> {
    return this.put('budgets', budget);
  }

  async saveBudgets(budgets: Budget[]): Promise<void> {
    return this.putMany('budgets', budgets);
  }

  async deleteBudget(id: string): Promise<void> {
    return this.delete('budgets', id);
  }

  // --- EXCHANGE RATES ---
  async getExchangeRates(): Promise<ExchangeRates> {
    await this.init();
    const res = await this.getAll<{ key: string; rates: Record<string, number>; lastUpdated: string }>('exchangeRates');
    if (res.length > 0 && res[0].rates) {
      return { rates: res[0].rates, lastUpdated: res[0].lastUpdated };
    }
    return { rates: DEFAULT_RATES, lastUpdated: new Date().toISOString() };
  }

  async saveExchangeRates(rates: Record<string, number>): Promise<void> {
    const data = { key: 'main', rates, lastUpdated: new Date().toISOString() };
    return this.put('exchangeRates', data);
  }

  // --- SYNC LOGS ---
  async getSyncLogs(): Promise<SyncLog[]> {
    const logs = await this.getAll<SyncLog>('syncLogs');
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async addSyncLog(log: SyncLog): Promise<void> {
    return this.put('syncLogs', log);
  }

  // --- INSIGHTS ---
  async getInsights(): Promise<AIInsight[]> {
    return this.getAll<AIInsight>('insights');
  }

  async saveInsights(insights: AIInsight[]): Promise<void> {
    return this.putMany('insights', insights);
  }

  // --- PREFERENCES ---
  async getPreferences(): Promise<UserPreferences> {
    const prefs = await this.getAll<UserPreferences & { id: string }>('preferences');
    if (prefs.length > 0) return prefs[0];
    return {
      baseCurrency: 'USD',
      theme: 'light',
      autoCategorizeWithAI: true,
    };
  }

  async savePreferences(prefs: UserPreferences): Promise<void> {
    return this.put('preferences', { id: 'main', ...prefs });
  }

  // --- BACKUPS ---
  async getBackups(): Promise<BackupSnapshot[]> {
    return this.getAll<BackupSnapshot>('backups');
  }

  async saveBackup(backup: BackupSnapshot): Promise<void> {
    return this.put('backups', backup);
  }

  async deleteBackup(id: string): Promise<void> {
    return this.delete('backups', id);
  }

  // Reset database completely
  async clearAll(): Promise<void> {
    await this.clearStore('accounts');
    await this.clearStore('transactions');
    await this.clearStore('budgets');
    await this.clearStore('exchangeRates');
    await this.clearStore('syncLogs');
    await this.clearStore('insights');
    await this.clearStore('preferences');
    await this.clearStore('categorizationRules');
    await this.clearStore('dedupExceptions');
    
    // DO NOT ERASE CATEGORIES: Reseed default categories so categories persist during a database wipe!
    await this.clearStore('categories');
    await this.saveCategories(DEFAULT_CATEGORIES);
  }

  // Wipe sandbox/demo data only
  async wipeSandboxData(): Promise<void> {
    const accounts = await this.getAccounts();
    const transactions = await this.getTransactions();

    const sandboxAccountIds = new Set(accounts.filter((a) => a.isSandbox).map((a) => a.id));

    for (const acc of accounts) {
      if (acc.isSandbox) {
        await this.delete('accounts', acc.id);
      }
    }

    for (const tx of transactions) {
      if (tx.isSandbox || sandboxAccountIds.has(tx.accountId)) {
        await this.delete('transactions', tx.id);
      }
    }
  }

  // Restore fresh sandbox/demo data
  async restoreSandboxData(): Promise<void> {
    await this.wipeSandboxData();
    await this.seedInitialData(true);
  }

  // Check if initial seed is required
  async isDatabaseEmpty(): Promise<boolean> {
    const accounts = await this.getAccounts();
    return accounts.length === 0;
  }

  // Seed sample data with realistic USD and BRL accounts
  async seedInitialData(onlyAccountsAndTxs: boolean = false): Promise<void> {
    const now = new Date();

    const accounts: BankAccount[] = [
      {
        id: 'acc_chase_usd',
        name: 'Chase Sapphire Checking',
        institutionName: 'Chase',
        accountType: 'checking',
        currency: 'USD',
        balance: 4850.00,
        mask: '...4812',
        provider: 'plaid',
        providerItemId: 'access-sandbox-dummy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        color: '#117ACA',
        isSandbox: true,
      },
      {
        id: 'acc_chase_savings',
        name: 'Chase High-Yield Savings',
        institutionName: 'Chase',
        accountType: 'savings',
        currency: 'USD',
        balance: 12500.00,
        mask: '...9910',
        provider: 'plaid',
        providerItemId: 'access-sandbox-dummy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        color: '#117ACA',
        isSandbox: true,
      },
      {
        id: 'acc_chase_credit',
        name: 'Chase Freedom Unlimited',
        institutionName: 'Chase',
        accountType: 'credit_card',
        currency: 'USD',
        balance: 1240.30,
        mask: '...3011',
        provider: 'plaid',
        providerItemId: 'access-sandbox-dummy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        color: '#117ACA',
        isSandbox: true,
      },
      {
        id: 'acc_wise_usd',
        name: 'Wise USD Balance',
        institutionName: 'Wise',
        accountType: 'checking',
        currency: 'USD',
        balance: 3200.00,
        mask: '...1109',
        provider: 'file_import',
        lastSyncedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        color: '#2E008B',
        isSandbox: true,
      },
      {
        id: 'acc_wise_brl',
        name: 'Wise BRL Balance',
        institutionName: 'Wise',
        accountType: 'checking',
        currency: 'BRL',
        balance: 8500.00,
        mask: '...8820',
        provider: 'file_import',
        lastSyncedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        color: '#2E008B',
        isSandbox: true,
      },
      {
        id: 'acc_fidelity_brokerage',
        name: 'Fidelity Individual Brokerage',
        institutionName: 'Fidelity',
        accountType: 'investment',
        currency: 'USD',
        balance: 28450.00,
        mask: '...8834',
        provider: 'plaid',
        providerItemId: 'access-sandbox-dummy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        color: '#006633',
        isSandbox: true,
      },
      {
        id: 'acc_fidelity_401k',
        name: 'Fidelity 401(k) Retirement',
        institutionName: 'Fidelity',
        accountType: 'investment',
        currency: 'USD',
        balance: 64200.00,
        mask: '...9011',
        provider: 'plaid',
        providerItemId: 'access-sandbox-dummy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        color: '#006633',
        isSandbox: true,
      },
      {
        id: 'acc_nubank_brl',
        name: 'Nubank Conta Principal',
        institutionName: 'Nubank',
        accountType: 'checking',
        currency: 'BRL',
        balance: 18450.00,
        mask: '...9031',
        provider: 'pluggy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        color: '#8A05BE',
        isSandbox: true,
      },
      {
        id: 'acc_nubank_card',
        name: 'Nubank Cartão Roxinho',
        institutionName: 'Nubank',
        accountType: 'credit_card',
        currency: 'BRL',
        balance: 2180.00,
        mask: '...1102',
        provider: 'pluggy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        color: '#8A05BE',
        isSandbox: true,
      },
      {
        id: 'acc_itau_conta',
        name: 'Itaú Conta Corrente',
        institutionName: 'Itaú',
        accountType: 'checking',
        currency: 'BRL',
        balance: 5320.00,
        mask: '...2041',
        provider: 'pluggy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
        color: '#EC7000',
        isSandbox: true,
      },
      {
        id: 'acc_itau_card_brl',
        name: 'Itaú Personalité Mastercard',
        institutionName: 'Itaú',
        accountType: 'credit_card',
        currency: 'BRL',
        balance: 3420.80,
        mask: '...7720',
        provider: 'pluggy',
        lastSyncedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
        color: '#EC7000',
        isSandbox: true,
      },
      {
        id: 'acc_bb_660',
        name: 'Banco do Brasil Conta Corrente',
        institutionName: 'Banco do Brasil',
        accountType: 'checking',
        currency: 'BRL',
        balance: 1450.00,
        mask: '...66-0',
        provider: 'pluggy',
        lastSyncedAt: new Date().toISOString(),
        color: '#0038A8',
        isSandbox: false,
      },
    ];

    const categories: Category[] = [
      { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10B981', type: 'expense' },
      { id: 'cat_restaurants', name: 'Restaurants & Dining', icon: 'Utensils', color: '#F59E0B', type: 'expense' },
      { id: 'cat_bills', name: 'Bills & Utilities', icon: 'Zap', color: '#6366F1', type: 'expense' },
      { id: 'cat_transport', name: 'Transportation', icon: 'Car', color: '#3B82F6', type: 'expense' },
      { id: 'cat_shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#EC4899', type: 'expense' },
      { id: 'cat_subscriptions', name: 'Subscriptions & Media', icon: 'Tv', color: '#8B5CF6', type: 'expense' },
      { id: 'cat_health', name: 'Health & Fitness', icon: 'HeartPulse', color: '#EF4444', type: 'expense' },
      { id: 'cat_housing', name: 'Housing & Rent', icon: 'Home', color: '#14B8A6', type: 'expense' },
      { id: 'cat_income', name: 'Income & Salary', icon: 'TrendingUp', color: '#22C55E', type: 'income' },
      { id: 'cat_investments', name: 'Investments & Crypto', icon: 'Coins', color: '#0EA5E9', type: 'income' },
    ];

    const budgets: Budget[] = [
      { id: 'b_groceries', category: 'Groceries', monthlyLimit: 800, currency: 'USD' },
      { id: 'b_dining', category: 'Restaurants & Dining', monthlyLimit: 500, currency: 'USD' },
      { id: 'b_shopping', category: 'Shopping', monthlyLimit: 350, currency: 'USD' },
      { id: 'b_subscriptions', category: 'Subscriptions & Media', monthlyLimit: 120, currency: 'USD' },
      { id: 'b_transport', category: 'Transportation', monthlyLimit: 250, currency: 'USD' },
    ];

    // Helper to generate past dates
    const daysAgo = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    };

    const transactions: Transaction[] = [
      // Income
      {
        id: 'tx_1',
        accountId: 'acc_chase_usd',
        accountName: 'Chase Sapphire Checking',
        date: daysAgo(2),
        description: 'Global Tech Corp Payroll Direct Deposit',
        amount: 4850.00,
        currency: 'USD',
        category: 'Income & Salary',
        tags: ['salary', 'recurring'],
        pending: false,
        isRecurring: true,
        provider: 'plaid',
        isSandbox: true,
      },
      {
        id: 'tx_2',
        accountId: 'acc_nubank_brl',
        accountName: 'Nubank Conta Principal',
        date: daysAgo(5),
        description: 'Pix Recebido - Consultoria Freelance',
        amount: 3500.00,
        currency: 'BRL',
        category: 'Income & Salary',
        tags: ['freelance', 'pix'],
        pending: false,
        provider: 'pluggy',
        isSandbox: true,
      },
      // Fidelity transactions
      {
        id: 'tx_fidelity_1',
        accountId: 'acc_fidelity_brokerage',
        accountName: 'Fidelity Individual Brokerage',
        date: daysAgo(3),
        description: 'Apple Inc (AAPL) Quarterly Dividend',
        amount: 145.50,
        currency: 'USD',
        category: 'Investments & Crypto',
        tags: ['dividend', 'stocks'],
        pending: false,
        provider: 'plaid',
        isSandbox: true,
      },
      {
        id: 'tx_fidelity_2',
        accountId: 'acc_fidelity_401k',
        accountName: 'Fidelity 401(k) Retirement',
        date: daysAgo(10),
        description: 'Employer Match Contribution - 401(k)',
        amount: 500.00,
        currency: 'USD',
        category: 'Investments & Crypto',
        tags: ['401k', 'match'],
        pending: false,
        provider: 'plaid',
        isSandbox: true,
      },
      // Expenses USD
      {
        id: 'tx_3',
        accountId: 'acc_chase_usd',
        accountName: 'Chase Sapphire Checking',
        date: daysAgo(1),
        description: 'Whole Foods Market',
        amount: -142.30,
        currency: 'USD',
        category: 'Groceries',
        tags: ['organic', 'food'],
        pending: false,
        provider: 'plaid',
        isSandbox: true,
      },
      {
        id: 'tx_4',
        accountId: 'acc_chase_usd',
        accountName: 'Chase Sapphire Checking',
        date: daysAgo(3),
        description: 'Uber Trips',
        amount: -28.40,
        currency: 'USD',
        category: 'Transportation',
        tags: ['ride'],
        pending: false,
        provider: 'plaid',
        isSandbox: true,
      },
      {
        id: 'tx_5',
        accountId: 'acc_chase_usd',
        accountName: 'Chase Sapphire Checking',
        date: daysAgo(4),
        description: 'Starbucks Coffee',
        amount: -7.85,
        currency: 'USD',
        category: 'Restaurants & Dining',
        tags: ['coffee'],
        pending: false,
        provider: 'plaid',
        isSandbox: true,
      },
      {
        id: 'tx_6',
        accountId: 'acc_chase_usd',
        accountName: 'Chase Sapphire Checking',
        date: daysAgo(7),
        description: 'Netflix.com Subscription',
        amount: -19.99,
        currency: 'USD',
        category: 'Subscriptions & Media',
        tags: ['streaming', 'recurring'],
        pending: false,
        isRecurring: true,
        provider: 'plaid',
        isSandbox: true,
      },
      {
        id: 'tx_7',
        accountId: 'acc_wise_usd',
        accountName: 'Wise USD Balance',
        date: daysAgo(8),
        description: 'GitHub Copilot Monthly Pro',
        amount: -10.00,
        currency: 'USD',
        category: 'Subscriptions & Media',
        tags: ['dev', 'recurring'],
        pending: false,
        provider: 'file_import',
        isSandbox: true,
      },
      // Expenses BRL
      {
        id: 'tx_8',
        accountId: 'acc_itau_card_brl',
        accountName: 'Itaú Personalité Mastercard',
        date: daysAgo(1),
        description: 'Supermercado Pão de Açúcar SP',
        amount: -482.50,
        currency: 'BRL',
        category: 'Groceries',
        tags: ['compras'],
        pending: false,
        provider: 'pluggy',
        isSandbox: true,
      },
      {
        id: 'tx_9',
        accountId: 'acc_itau_card_brl',
        accountName: 'Itaú Personalité Mastercard',
        date: daysAgo(2),
        description: 'Restaurante Fogo de Chão',
        amount: -310.00,
        currency: 'BRL',
        category: 'Restaurants & Dining',
        tags: ['jantar', 'churrasco'],
        pending: false,
        provider: 'pluggy',
        isSandbox: true,
      },
      {
        id: 'tx_10',
        accountId: 'acc_itau_card_brl',
        accountName: 'Itaú Personalité Mastercard',
        date: daysAgo(4),
        description: 'Posto Ipiranga Gasolina Aditivada',
        amount: -220.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['combustivel'],
        pending: false,
        provider: 'pluggy',
        isSandbox: true,
      },
      {
        id: 'tx_11',
        accountId: 'acc_nubank_brl',
        accountName: 'Nubank Conta Principal',
        date: daysAgo(6),
        description: 'iFood Entrega de Comida',
        amount: -89.90,
        currency: 'BRL',
        category: 'Restaurants & Dining',
        tags: ['delivery'],
        pending: false,
        provider: 'pluggy',
        isSandbox: true,
      },
      {
        id: 'tx_12',
        accountId: 'acc_nubank_brl',
        accountName: 'Nubank Conta Principal',
        date: daysAgo(9),
        description: 'Smart Fit Mensalidade Academia',
        amount: -119.90,
        currency: 'BRL',
        category: 'Health & Fitness',
        tags: ['academia', 'recurring'],
        pending: false,
        isRecurring: true,
        provider: 'pluggy',
        isSandbox: true,
      },
      // Banco do Brasil Conta Corrente ...66-0 July 2026 Real Transactions
      {
        id: 'tx_bb_1',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-01',
        description: 'Pix - Enviado - 01/07 13:31 DELI & C. I. A. DELICATES',
        amount: -120.99,
        currency: 'BRL',
        category: 'Restaurants & Dining',
        tags: ['pix', 'alimentacao'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_2',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-01',
        description: 'Resgate Poupança - Poupança (var.51)',
        amount: 120.99,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['resgate', 'poupanca'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_3',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-02',
        description: 'Pix - Enviado - 02/07 11:25 STUDIO S',
        amount: -95.00,
        currency: 'BRL',
        category: 'Health & Fitness',
        tags: ['pix', 'servicos'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_4',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-02',
        description: 'Resgate Poupança - Poupança (var.51)',
        amount: 95.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['resgate', 'poupanca'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_5',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Saque dinheiro ATM cartao - 06/07 15:16 SOP-BARRA AGENIDA',
        amount: -1000.00,
        currency: 'BRL',
        category: 'Bills & Utilities',
        tags: ['saque', 'atm'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_6',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Saque dinheiro ATM cartao - 06/07 15:19 SOP-BARRA AGENIDA',
        amount: -1000.00,
        currency: 'BRL',
        category: 'Bills & Utilities',
        tags: ['saque', 'atm'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_7',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Pix Agendado - 05/07 Felipe Guimaraes Salles',
        amount: -2.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix', 'agendado'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_8',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Pix - Enviado - 04/07 09:36 Felipe Guimarães Salles',
        amount: -100.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_9',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Pix - Enviado - 04/07 10:43 Felipe Guimarães Salles',
        amount: -5000.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix', 'transferencia'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_10',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Pix - Enviado - 06/07 15:43 Grupo Ferrara',
        amount: -150.00,
        currency: 'BRL',
        category: 'Bills & Utilities',
        tags: ['pix', 'servicos'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_11',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-06',
        description: 'Resgate Poupança - Poupança (var.51)',
        amount: 7252.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['resgate', 'poupanca'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_12',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-07',
        description: 'Pix - Recebido - Transferência Bancária',
        amount: 2000.00,
        currency: 'BRL',
        category: 'Income & Salary',
        tags: ['pix', 'deposito'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_13',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-07',
        description: 'BB Rende Fácil - Rende Facil',
        amount: -2000.00,
        currency: 'BRL',
        category: 'Investments & Crypto',
        tags: ['rende-facil', 'investimento'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_14',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-13',
        description: 'Pix - Enviado - 11/07 14:41 RAIA DROGASIL SA',
        amount: -70.98,
        currency: 'BRL',
        category: 'Health & Fitness',
        tags: ['farmacia', 'pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_15',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-13',
        description: 'Pix - Enviado - 13/07 11:04 Grupo Ferrara',
        amount: -210.00,
        currency: 'BRL',
        category: 'Bills & Utilities',
        tags: ['pix', 'servicos'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_16',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-13',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 280.98,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil', 'resgate'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_17',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-15',
        description: 'Estorno de Débito',
        amount: 1.00,
        currency: 'BRL',
        category: 'Income & Salary',
        tags: ['estorno'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_18',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-15',
        description: 'Compra com Cartão - 15/07 11:29 DM          *Spotify',
        amount: -1.00,
        currency: 'BRL',
        category: 'Subscriptions & Media',
        tags: ['cartao', 'spotify'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_19',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-15',
        description: 'Compra com Cartão - 15/07 11:30 EBN         *SPOTIFY',
        amount: -379.00,
        currency: 'BRL',
        category: 'Subscriptions & Media',
        tags: ['cartao', 'spotify'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_20',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-15',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 379.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_21',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-16',
        description: 'Pix - Enviado - Transporte / Táxi',
        amount: -70.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_22',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-16',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 70.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_23',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-20',
        description: 'Compra com Cartão - 20/07 16:37 SORVETERIA DA RIBEIR',
        amount: -30.00,
        currency: 'BRL',
        category: 'Restaurants & Dining',
        tags: ['cartao', 'restaurante'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_24',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-20',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 30.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_25',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-22',
        description: 'Pix - Enviado - Transporte Urbano',
        amount: -14.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_26',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-22',
        description: 'Pix - Enviado - Estacionamento',
        amount: -7.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_27',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-22',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 21.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_28',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-23',
        description: 'Aplicação Poupança - Mesma Titularidade',
        amount: -400.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['poupanca', 'aplicacao'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_29',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-23',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 400.00,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_30',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-27',
        description: 'Compra com Cartão - 25/07 14:26 VMT*WD VENDIN',
        amount: -3.00,
        currency: 'BRL',
        category: 'Shopping',
        tags: ['cartao', 'compras'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_31',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-27',
        description: 'Pix - Enviado - 26/07 21:35 MAGALUPAY',
        amount: -284.99,
        currency: 'BRL',
        category: 'Shopping',
        tags: ['pix', 'magalu'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_32',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-27',
        description: 'Pix - Enviado - 27/07 17:12 Lucas Tanan dos Santos Na',
        amount: -500.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_33',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-27',
        description: 'BB Rende Fácil - Rende Facil',
        amount: 787.99,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_34',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-28',
        description: 'Pix - Enviado - 28/07 17:39 Uelliton Reis Mendes da S',
        amount: -800.00,
        currency: 'BRL',
        category: 'Transportation',
        tags: ['pix'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_35',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-28',
        description: 'BB Rende Fácil',
        amount: 31.15,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['rende-facil'],
        pending: false,
        provider: 'pluggy',
      },
      {
        id: 'tx_bb_36',
        accountId: 'acc_bb_660',
        accountName: 'Banco do Brasil Conta Corrente',
        date: '2026-07-28',
        description: 'Resgate Poupança',
        amount: 768.85,
        currency: 'BRL',
        category: 'Internal Transfer',
        tags: ['resgate', 'poupanca'],
        pending: false,
        provider: 'pluggy',
      },
    ];

    const syncLogs: SyncLog[] = [
      {
        id: 'sync_1',
        provider: 'plaid',
        status: 'success',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        newTransactionsCount: 3,
        updatedAccountsCount: 2,
        message: 'Incremental sync completed for Chase & Fidelity',
      },
      {
        id: 'sync_2',
        provider: 'pluggy',
        status: 'success',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        newTransactionsCount: 4,
        updatedAccountsCount: 2,
        message: 'Pluggy Open Finance synced Nubank & Itaú accounts',
      },
    ];

    const insights: AIInsight[] = [
      {
        id: 'ins_1',
        type: 'subscription_found',
        title: '5 Active Subscriptions Detected',
        description: 'You are spending approx. $49.99/mo on recurring services (Netflix, Spotify, GitHub, SmartFit).',
        impactAmount: 49.99,
        currency: 'USD',
        createdAt: daysAgo(1),
        suggestedAction: 'Review subscriptions to prune unused streaming or dev tools.',
        icon: 'Sparkles',
      },
      {
        id: 'ins_2',
        type: 'spending_spike',
        title: 'Dining Out in BRL +24% higher',
        description: 'Your restaurant spending in Brazil (Fogo de Chão, iFood) reached R$ 399.90 this week.',
        impactAmount: 399.90,
        currency: 'BRL',
        createdAt: daysAgo(2),
        suggestedAction: 'Set a weekly target for food delivery apps.',
        icon: 'TrendingUp',
      },
    ];

    await this.saveAccounts(accounts);
    await this.saveTransactions(transactions);

    if (!onlyAccountsAndTxs) {
      await this.saveCategories(categories);
      await this.saveBudgets(budgets);
      await this.saveExchangeRates(DEFAULT_RATES);
      await this.putMany('syncLogs', syncLogs);
      await this.saveInsights(insights);
      await this.savePreferences({
        baseCurrency: 'USD',
        theme: 'light',
        autoCategorizeWithAI: true,
      });
    }
  }
}

export const db = new LocalDatabase();
