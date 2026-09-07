import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize Gemini AI Client lazy/server-side
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Initialize Plaid Client
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const getPlaidClient = () => {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) return null;
  
  const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(configuration);
};

// ==========================================
// API ENDPOINTS
// ==========================================

// --- Plaid Routes ---

app.post("/api/plaid/create_link_token", async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    if (!plaidClient) {
      return res.status(503).json({ error: "Plaid credentials not configured." });
    }

    const { Products, CountryCode } = await import("plaid");
    const request = {
      user: {
        client_user_id: "user-id", // In a real app, use the actual user ID
      },
      client_name: "Moneta Personal Finance",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us, CountryCode.Ca],
      language: "en",
    };

    const response = await plaidClient.linkTokenCreate(request);
    res.json(response.data);
  } catch (err: any) {
    console.error("Plaid create_link_token error:", err.response?.data || err);
    res.status(500).json({ error: err.message || "Failed to create link token" });
  }
});

app.post("/api/plaid/exchange_public_token", async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    if (!plaidClient) {
      return res.status(503).json({ error: "Plaid credentials not configured." });
    }

    const { public_token } = req.body;
    if (!public_token) {
      return res.status(400).json({ error: "Missing public_token" });
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    
    // In a real app, save the access_token and item_id securely in the database
    res.json({
      access_token: response.data.access_token,
      item_id: response.data.item_id,
    });
  } catch (err: any) {
    console.error("Plaid exchange_public_token error:", err.response?.data || err);
    res.status(500).json({ error: err.message || "Failed to exchange public token" });
  }
});

app.post("/api/plaid/sync", async (req, res) => {
  try {
    const plaidClient = getPlaidClient();
    const { access_token, accounts, days } = req.body;
    const pullDays = typeof days === "number" ? days : 30;

    const now = new Date();
    const startDate = new Date(now.getTime() - pullDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1. Single Token Sync Request
    if (access_token) {
      const isMockToken = access_token === "access-sandbox-dummy";

      if (isMockToken) {
        // Return standard mock data
        const mockAccounts = [
          { account_id: "chase_usd", name: "Chase Sapphire Checking", type: "depository", balances: { current: 4850.00, iso_currency_code: "USD" }, mask: "4812" },
          { account_id: "chase_savings", name: "Chase High-Yield Savings", type: "depository", balances: { current: 12500.00, iso_currency_code: "USD" }, mask: "9910" },
          { account_id: "chase_credit", name: "Chase Freedom Unlimited", type: "credit", balances: { current: 1240.30, iso_currency_code: "USD" }, mask: "3011" },
          { account_id: "fidelity_brokerage", name: "Fidelity Individual Brokerage", type: "investment", balances: { current: 28450.00, iso_currency_code: "USD" }, mask: "8834" },
          { account_id: "fidelity_401k", name: "Fidelity 401(k) Retirement", type: "investment", balances: { current: 64200.00, iso_currency_code: "USD" }, mask: "9011" }
        ];

        const mockTransactions: any[] = [];
        const descriptions = [
          { name: "Starbucks Coffee", amount: 6.45, category: "Groceries" },
          { name: "Netflix Subscription", amount: 15.49, category: "Subscriptions & Media" },
          { name: "Target Retail Store", amount: 48.90, category: "Shopping" },
          { name: "Whole Foods Market", amount: 82.30, category: "Groceries" },
          { name: "Uber Ride", amount: 18.50, category: "Transportation" },
          { name: "Chevron Gas", amount: 45.00, category: "Transportation" },
          { name: "Gym Membership", amount: 50.00, category: "Health & Fitness" },
          { name: "Landlord Rent Payment", amount: 1800.00, category: "Housing & Rent" },
          { name: "Payroll Direct Deposit", amount: -2450.00, category: "Income & Salary" },
          { name: "Amazon Online Purchase", amount: 35.99, category: "Shopping" },
          { name: "Spotify Premium", amount: 9.99, category: "Subscriptions & Media" },
          { name: "Electric Bill Utility", amount: 112.40, category: "Bills & Utilities" }
        ];

        const txCount = Math.max(8, Math.min(250, Math.floor(pullDays / 2.5)));
        for (let i = 0; i < txCount; i++) {
          const dateOffset = Math.floor(Math.random() * pullDays);
          const txDate = new Date(now.getTime() - dateOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const descObj = descriptions[i % descriptions.length];
          const pickedAcc = mockAccounts[i % mockAccounts.length];
          const accId = pickedAcc.account_id;

          const randomCents = Number((Math.random() * 4.99).toFixed(2));
          const finalAmt = descObj.amount > 0 ? descObj.amount + randomCents : descObj.amount - randomCents;

          mockTransactions.push({
            transaction_id: `mock_plaid_tx_${pullDays}_${i}_${dateOffset}`,
            account_id: accId,
            name: descObj.name,
            amount: finalAmt,
            iso_currency_code: pickedAcc.balances.iso_currency_code || "USD",
            date: txDate,
            pending: false
          });
        }

        mockTransactions.sort((a, b) => b.date.localeCompare(a.date));

        return res.json({
          accounts: mockAccounts,
          transactions: mockTransactions,
          isMock: true
        });
      }

      // This is a REAL access token sync request
      if (!plaidClient) {
        return res.status(503).json({ error: "Plaid credentials not configured. Please configure PLAID_CLIENT_ID and PLAID_SECRET in your settings." });
      }

      // First fetch accounts
      const accountsResponse = await plaidClient.accountsGet({ access_token });
      const responseAccounts = accountsResponse.data.accounts;

      // Fetch transactions
      let responseTransactions: any[] = [];
      try {
        const transactionsResponse = await plaidClient.transactionsGet({
          access_token,
          start_date: startDate,
          end_date: endDate,
          options: {
            count: 500,
            offset: 0,
          }
        });
        responseTransactions = transactionsResponse.data.transactions;
      } catch (txErr: any) {
        const errData = txErr.response?.data;
        if (errData?.error_code === "PRODUCT_NOT_READY") {
          console.warn("Plaid transactions not ready yet (PRODUCT_NOT_READY). Returning empty transactions list.");
        } else {
          throw txErr;
        }
      }

      return res.json({
        accounts: responseAccounts,
        transactions: responseTransactions,
      });
    }

    // 2. Multi-Account Batch Sync Request (typically incremental sync)
    if (accounts && Array.isArray(accounts)) {
      const sandboxAccountsList = accounts.filter(a => a.providerItemId === "access-sandbox-dummy" || a.isSandbox);
      const realAccountsList = accounts.filter(a => a.providerItemId && a.providerItemId !== "access-sandbox-dummy" && !a.isSandbox);

      let mergedAccounts: any[] = [];
      let mergedTransactions: any[] = [];

      // Process sandbox accounts if any
      if (sandboxAccountsList.length > 0) {
        const mockAccounts = [
          { account_id: "chase_usd", name: "Chase Sapphire Checking", type: "depository", balances: { current: 4850.00, iso_currency_code: "USD" }, mask: "4812" },
          { account_id: "chase_savings", name: "Chase High-Yield Savings", type: "depository", balances: { current: 12500.00, iso_currency_code: "USD" }, mask: "9910" },
          { account_id: "chase_credit", name: "Chase Freedom Unlimited", type: "credit", balances: { current: 1240.30, iso_currency_code: "USD" }, mask: "3011" },
          { account_id: "fidelity_brokerage", name: "Fidelity Individual Brokerage", type: "investment", balances: { current: 28450.00, iso_currency_code: "USD" }, mask: "8834" },
          { account_id: "fidelity_401k", name: "Fidelity 401(k) Retirement", type: "investment", balances: { current: 64200.00, iso_currency_code: "USD" }, mask: "9011" }
        ];

        const targetAccounts = mockAccounts.filter(ma => sandboxAccountsList.some((a: any) => a.id === `plaid_${ma.account_id}` || a.id === ma.account_id));
        const finalAccounts = targetAccounts.length > 0 ? targetAccounts : mockAccounts;

        mergedAccounts = mergedAccounts.concat(finalAccounts);

        const mockTransactions: any[] = [];
        const descriptions = [
          { name: "Starbucks Coffee", amount: 6.45, category: "Groceries" },
          { name: "Netflix Subscription", amount: 15.49, category: "Subscriptions & Media" },
          { name: "Target Retail Store", amount: 48.90, category: "Shopping" },
          { name: "Whole Foods Market", amount: 82.30, category: "Groceries" },
          { name: "Uber Ride", amount: 18.50, category: "Transportation" },
          { name: "Chevron Gas", amount: 45.00, category: "Transportation" },
          { name: "Gym Membership", amount: 50.00, category: "Health & Fitness" },
          { name: "Landlord Rent Payment", amount: 1800.00, category: "Housing & Rent" },
          { name: "Payroll Direct Deposit", amount: -2450.00, category: "Income & Salary" },
          { name: "Amazon Online Purchase", amount: 35.99, category: "Shopping" },
          { name: "Spotify Premium", amount: 9.99, category: "Subscriptions & Media" },
          { name: "Electric Bill Utility", amount: 112.40, category: "Bills & Utilities" }
        ];

        const txCount = Math.max(8, Math.min(250, Math.floor(pullDays / 2.5)));
        for (let i = 0; i < txCount; i++) {
          const dateOffset = Math.floor(Math.random() * pullDays);
          const txDate = new Date(now.getTime() - dateOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const descObj = descriptions[i % descriptions.length];
          const pickedAcc = finalAccounts[i % finalAccounts.length];
          const accId = pickedAcc.account_id;

          const randomCents = Number((Math.random() * 4.99).toFixed(2));
          const finalAmt = descObj.amount > 0 ? descObj.amount + randomCents : descObj.amount - randomCents;

          mockTransactions.push({
            transaction_id: `mock_plaid_tx_${pullDays}_${i}_${dateOffset}`,
            account_id: accId,
            name: descObj.name,
            amount: finalAmt,
            iso_currency_code: pickedAcc.balances.iso_currency_code || "USD",
            date: txDate,
            pending: false
          });
        }
        mergedTransactions = mergedTransactions.concat(mockTransactions);
      }

      // Process real accounts if any
      if (realAccountsList.length > 0) {
        if (!plaidClient) {
          return res.status(503).json({ error: "Plaid credentials not configured. Please configure PLAID_CLIENT_ID and PLAID_SECRET under settings." });
        }

        const uniqueTokens = Array.from(new Set(realAccountsList.map((a: any) => a.providerItemId).filter(Boolean)));

        for (const token of uniqueTokens) {
          const accountsResponse = await plaidClient.accountsGet({ access_token: token as string });
          let responseTransactions: any[] = [];
          try {
            const transactionsResponse = await plaidClient.transactionsGet({
              access_token: token as string,
              start_date: startDate,
              end_date: endDate,
              options: {
                count: 500,
                offset: 0,
              }
            });
            responseTransactions = transactionsResponse.data.transactions;
          } catch (txErr: any) {
            const errData = txErr.response?.data;
            if (errData?.error_code === "PRODUCT_NOT_READY") {
              console.warn("Plaid transactions not ready yet (PRODUCT_NOT_READY) for token. Returning empty transactions list.");
            } else {
              throw txErr;
            }
          }
          mergedAccounts = mergedAccounts.concat(accountsResponse.data.accounts);
          mergedTransactions = mergedTransactions.concat(responseTransactions);
        }
      }

      return res.json({
        accounts: mergedAccounts,
        transactions: mergedTransactions,
      });
    }

    return res.status(400).json({ error: "Missing required parameters (access_token or accounts)." });
  } catch (err: any) {
    console.error("Plaid sync error:", err.response?.data || err);
    res.status(500).json({ error: err.message || "Failed to sync with Plaid" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Real-time Exchange Rates endpoint using free open exchange rate API
app.get("/api/rates", async (req, res) => {
  const fallbackRates = {
    USD_BRL: 5.75,
    BRL_USD: 0.1739,
    USD_EUR: 0.92,
    EUR_USD: 1.087,
    USD_GBP: 0.78,
    GBP_USD: 1.282,
    EUR_BRL: 6.25,
    BRL_EUR: 0.16,
    USD_USD: 1.0,
    BRL_BRL: 1.0,
    EUR_EUR: 1.0,
    GBP_GBP: 1.0,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Free Open Exchange Rate API (no API key required)
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && data.rates) {
        const r = data.rates;
        const brl = r.BRL || 5.75;
        const eur = r.EUR || 0.92;
        const gbp = r.GBP || 0.78;

        const liveRates = {
          USD_BRL: Number(brl.toFixed(4)),
          BRL_USD: Number((1 / brl).toFixed(6)),
          USD_EUR: Number(eur.toFixed(4)),
          EUR_USD: Number((1 / eur).toFixed(6)),
          USD_GBP: Number(gbp.toFixed(4)),
          GBP_USD: Number((1 / gbp).toFixed(6)),
          EUR_BRL: Number((brl / eur).toFixed(4)),
          BRL_EUR: Number((eur / brl).toFixed(6)),
          USD_USD: 1.0,
          BRL_BRL: 1.0,
          EUR_EUR: 1.0,
          GBP_GBP: 1.0,
        };

        return res.json({
          rates: liveRates,
          source: "open.er-api.com (Live FX API)",
          lastUpdated: data.time_last_update_utc || new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    console.warn("Failed to fetch live exchange rates from open.er-api.com:", err.message);
  }

  res.json({
    rates: fallbackRates,
    source: "Fallback Local Cache",
    lastUpdated: new Date().toISOString(),
  });
});


// ==========================================
// PLUGGY OPEN FINANCE INTEGRATION HELPERS
// ==========================================

let pluggyApiKeyCache: { apiKey: string; expiresAt: number } | null = null;

async function getPluggyApiKey(): Promise<string> {
  const now = Date.now();
  if (pluggyApiKeyCache && pluggyApiKeyCache.expiresAt > now + 60000) {
    return pluggyApiKeyCache.apiKey;
  }

  const clientId = process.env.PLUGGY_CLIENT_ID || "c79d9401-b867-402c-994d-85601f0d5c80";
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET || "hema4Q220OAd_ER__so-DvNtTNMuFBI6nFYQhgcFtYk";

  const res = await fetch("https://api.pluggy.ai/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pluggy Auth HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (!data.apiKey) {
    throw new Error("Pluggy auth did not return an apiKey");
  }

  pluggyApiKeyCache = {
    apiKey: data.apiKey,
    expiresAt: now + 3600 * 1000,
  };

  return data.apiKey;
}

function mapPluggyAccountToMoneta(acc: any, itemConnectorName?: string, fallbackItemId?: string): any {
  const isCredit = acc.type === "CREDIT" || acc.subtype === "CREDIT_CARD";
  const isInvest = acc.type === "INVESTMENT";
  let accType = "checking";
  if (isCredit) accType = "credit_card";
  else if (isInvest) accType = "investment";
  else if (acc.subtype === "SAVINGS_ACCOUNT") accType = "savings";

  const instName = itemConnectorName || acc.bankData?.transferNumber || "Pluggy Open Finance";
  
  let maskStr = "...4812";
  if (acc.number) {
    const rawNum = String(acc.number);
    if (rawNum.includes("-")) {
      maskStr = `...${rawNum}`;
    } else {
      maskStr = `...${rawNum.slice(-4)}`;
    }
  }

  // Extract true ledger / available balance from Pluggy fields
  let resolvedBalance = 0;
  if (typeof acc.balance === "number") {
    resolvedBalance = acc.balance;
  } else if (typeof acc.availableBalance === "number") {
    resolvedBalance = acc.availableBalance;
  } else if (typeof acc.closingBalance === "number") {
    resolvedBalance = acc.closingBalance;
  } else if (typeof acc.bankData?.closingBalance === "number") {
    resolvedBalance = acc.bankData.closingBalance;
  }

  return {
    id: `pluggy_acc_${acc.id}`,
    name: acc.name || `${instName} ${isCredit ? "Cartão" : "Conta"}`,
    institutionName: instName,
    accountType: accType,
    currency: acc.currencyCode || "BRL",
    balance: resolvedBalance,
    mask: maskStr,
    provider: "pluggy",
    providerItemId: acc.itemId || fallbackItemId || `item_pluggy_${Date.now()}`,
    lastSyncedAt: new Date().toISOString(),
    color: isCredit ? "#E11D48" : (instName.toLowerCase().includes("brasil") ? "#0038A8" : "#8A05BE"),
  };
}

function mapPluggyTransactionToMoneta(tx: any, accName: string, accCurrency: string): any {
  const amt = typeof tx.amount === "number" ? tx.amount : 0;
  const txDate = tx.date ? String(tx.date).split("T")[0] : new Date().toISOString().split("T")[0];

  let catStr = "General Expense";
  if (tx.category) {
    if (typeof tx.category === "string") {
      catStr = tx.category;
    } else if (typeof tx.category === "object" && tx.category.name) {
      catStr = tx.category.name;
    }
  } else if (amt > 0) {
    catStr = "Income & Salary";
  }

  return {
    id: `pluggy_tx_${tx.id}`,
    accountId: `pluggy_acc_${tx.accountId}`,
    accountName: accName,
    date: txDate,
    description: tx.description || tx.descriptionRaw || tx.name || tx.merchant?.name || "Transação Bancária",
    originalDescription: tx.descriptionRaw || tx.description || tx.merchant?.name,
    amount: amt,
    currency: tx.currencyCode || accCurrency || "BRL",
    category: catStr,
    tags: [],
    pending: tx.status === "PENDING",
    provider: "pluggy",
    externalId: String(tx.id),
  };
}

// Pluggy API Status & Test Route
app.get("/api/pluggy/status", async (req, res) => {
  try {
    const apiKey = await getPluggyApiKey();
    // Verify connection using connectors endpoint
    const connRes = await fetch("https://api.pluggy.ai/connectors?countries=BR", {
      headers: { "X-API-KEY": apiKey },
    });
    const isConnOk = connRes.ok;

    res.json({
      status: isConnOk ? "connected" : "error",
      clientId: process.env.PLUGGY_CLIENT_ID || "c79d9401-b867-402c-994d-85601f0d5c80",
      openFinanceProvider: "Pluggy Brazil / LATAM",
      authenticated: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Pluggy Status Error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Pluggy Connectors List
app.get("/api/pluggy/connectors", async (req, res) => {
  try {
    const apiKey = await getPluggyApiKey();
    const response = await fetch("https://api.pluggy.ai/connectors?countries=BR", {
      headers: { "X-API-KEY": apiKey },
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pluggy Connect Token
app.post("/api/pluggy/connect_token", async (req, res) => {
  try {
    const { itemId } = req.body;
    const apiKey = await getPluggyApiKey();
    const payload: any = {};
    if (itemId) payload.itemId = itemId;

    const response = await fetch("https://api.pluggy.ai/connect_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Pluggy Accounts directly
app.get("/api/pluggy/accounts", async (req, res) => {
  try {
    const itemId = req.query.itemId as string;
    const apiKey = await getPluggyApiKey();
    const url = itemId
      ? `https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(itemId)}`
      : "https://api.pluggy.ai/accounts";

    const response = await fetch(url, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Pluggy Transactions directly
app.get("/api/pluggy/transactions", async (req, res) => {
  try {
    const { accountId, itemId, next } = req.query;
    const apiKey = await getPluggyApiKey();
    let url = "https://api.pluggy.ai/v2/transactions?";
    const params: string[] = [];
    if (accountId) params.push(`accountId=${encodeURIComponent(accountId as string)}`);
    if (itemId) params.push(`itemId=${encodeURIComponent(itemId as string)}`);
    if (next) params.push(`next=${encodeURIComponent(next as string)}`);
    url += params.join("&");

    const response = await fetch(url, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to poll item completion and fetch complete accounts + transactions payload
async function fetchPluggyItemPayload(itemId: string, apiKey: string) {
  // 1. Poll Item status until execution finishes
  let itemData: any = null;
  let retries = 0;
  while (retries < 25) {
    const itemRes = await fetch(`https://api.pluggy.ai/items/${encodeURIComponent(itemId)}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (itemRes.ok) {
      itemData = await itemRes.json();
      const st = itemData.executionStatus ? itemData.executionStatus.toUpperCase() : "";
      const isInProgress = st === "CREATED" || st === "UPDATING" || st.endsWith("_IN_PROGRESS");
      if (!isInProgress) {
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    retries++;
  }

  const connectorName = itemData?.connector?.name || "Pluggy Bank";

  // 2. Fetch Accounts
  const accsRes = await fetch(`https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(itemId)}`, {
    headers: { "X-API-KEY": apiKey },
  });

  if (!accsRes.ok) {
    const errText = await accsRes.text();
    throw new Error(`Failed to fetch accounts for Pluggy Item ${itemId}: ${errText}`);
  }

  const accsData = await accsRes.json();
  const rawAccounts = accsData.results || [];

  const formattedAccounts: any[] = [];
  const rawTransactionsMap = new Map<string, any>();

  // 3. Map accounts and fetch transactions per account
  for (const rawAcc of rawAccounts) {
    const mappedAcc = mapPluggyAccountToMoneta(rawAcc, connectorName, itemId);
    formattedAccounts.push(mappedAcc);

    // Fetch transactions for account using v2 API with cursor pagination
    try {
      let nextCursor: string | null = null;
      do {
        const txUrl = `https://api.pluggy.ai/v2/transactions?accountId=${encodeURIComponent(rawAcc.id)}` +
          (nextCursor ? `&next=${encodeURIComponent(nextCursor)}` : "");
        const txRes = await fetch(txUrl, { headers: { "X-API-KEY": apiKey } });
        if (txRes.ok) {
          const txData = await txRes.json();
          (txData.results || []).forEach((tx: any) => {
            rawTransactionsMap.set(String(tx.id), { ...tx, accountName: mappedAcc.name, currency: mappedAcc.currency });
          });
          nextCursor = txData.next || null;
        } else {
          console.warn("Pluggy v2 transactions error:", txRes.status, await txRes.text());
          break;
        }
      } while (nextCursor);
    } catch (e) {
      console.warn(`Failed to fetch transactions for account ${rawAcc.id}:`, e);
    }
  }

  // Also query transactions by itemId directly as a secondary pass using v2 API
  try {
    let nextCursor: string | null = null;
    do {
      const itemTxUrl = `https://api.pluggy.ai/v2/transactions?itemId=${encodeURIComponent(itemId)}` +
        (nextCursor ? `&next=${encodeURIComponent(nextCursor)}` : "");
      const itemTxRes = await fetch(itemTxUrl, { headers: { "X-API-KEY": apiKey } });
      if (itemTxRes.ok) {
        const itemTxData = await itemTxRes.json();
        (itemTxData.results || []).forEach((tx: any) => {
          if (!rawTransactionsMap.has(String(tx.id))) {
            const matchedAcc = formattedAccounts.find((a) => a.id === `pluggy_acc_${tx.accountId}`) || formattedAccounts[0];
            rawTransactionsMap.set(String(tx.id), {
              ...tx,
              accountName: matchedAcc ? matchedAcc.name : "Pluggy Account",
              currency: matchedAcc ? matchedAcc.currency : "BRL",
            });
          }
        });
        nextCursor = itemTxData.next || null;
      } else {
        break;
      }
    } while (nextCursor);
  } catch (e) {
    console.warn(`Failed to fetch transactions for item ${itemId}:`, e);
  }

  const formattedTransactions: any[] = [];
  rawTransactionsMap.forEach((tx) => {
    formattedTransactions.push(mapPluggyTransactionToMoneta(tx, tx.accountName, tx.currency));
  });

  return {
    accounts: formattedAccounts,
    transactions: formattedTransactions,
    connectorName,
    executionStatus: itemData?.executionStatus || "COMPLETED",
  };
}

// Fetch complete item payload (Accounts + Transactions) from Pluggy API
app.post("/api/pluggy/fetch-item", async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }

    const apiKey = await getPluggyApiKey();
    const payload = await fetchPluggyItemPayload(itemId, apiKey);

    res.json({
      accounts: payload.accounts,
      transactions: payload.transactions,
      connectorName: payload.connectorName,
      message: `Successfully pulled ${payload.accounts.length} account(s) and ${payload.transactions.length} real transaction(s) from Pluggy.`,
    });
  } catch (err: any) {
    console.error("Pluggy Fetch Item Error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch Pluggy item." });
  }
});

// Pluggy Connect Endpoint (Brazil / LATAM Open Finance)
app.post("/api/pluggy/connect", async (req, res) => {
  try {
    const { itemId } = req.body;
    const apiKey = await getPluggyApiKey();

    if (itemId) {
      const payload = await fetchPluggyItemPayload(itemId, apiKey);
      return res.json({
        account: payload.accounts[0],
        accounts: payload.accounts,
        transactions: payload.transactions,
        message: `Linked ${payload.connectorName} via Pluggy Open Finance (${payload.transactions.length} real transactions imported).`,
      });
    }

    // If no itemId provided, check if user has existing connected Pluggy items
    const itemsRes = await fetch("https://api.pluggy.ai/items", {
      headers: { "X-API-KEY": apiKey },
    });

    if (itemsRes.ok) {
      const itemsData = await itemsRes.json();
      const itemsList = itemsData.results || [];

      if (itemsList.length > 0) {
        const firstItemId = itemsList[0].id;
        const payload = await fetchPluggyItemPayload(firstItemId, apiKey);
        return res.json({
          account: payload.accounts[0],
          accounts: payload.accounts,
          transactions: payload.transactions,
          message: `Loaded existing Pluggy connection for ${payload.connectorName} (${payload.transactions.length} real transactions imported).`,
        });
      }
    }

    return res.status(400).json({
      error: "No active Pluggy connections found. Please use the Pluggy Connect widget to link your bank account.",
    });
  } catch (err: any) {
    console.error("Pluggy Connect Error:", err);
    res.status(500).json({ error: err.message || "Failed to connect Pluggy" });
  }
});

// Pluggy Incremental Sync Endpoint
app.post("/api/pluggy/sync", async (req, res) => {
  try {
    const { accounts } = req.body;
    const targetAccounts = accounts || [];
    const newTransactions: any[] = [];
    const updatedAccounts: any[] = [];

    let apiKey: string | null = null;
    try {
      apiKey = await getPluggyApiKey();
    } catch (e) {
      console.warn("Could not authenticate Pluggy for sync:", e);
    }

    if (apiKey) {
      // Group target accounts by their unique real Item ID to trigger live bank updates
      const realItemIds = Array.from(new Set(
        targetAccounts
          .filter((acc: any) => acc.provider === "pluggy" && acc.providerItemId && !acc.providerItemId.startsWith("item_pluggy_"))
          .map((acc: any) => acc.providerItemId)
      ));

      for (const itemId of realItemIds) {
        try {
          console.log(`Triggering Pluggy item update for itemId: ${itemId}`);
          // 1. Trigger live execution update on Pluggy servers to fetch yesterday/tonight/today's newest data from the bank
          const updateRes = await fetch(`https://api.pluggy.ai/items/${encodeURIComponent(itemId as string)}`, {
            method: "PATCH",
            headers: {
              "X-API-KEY": apiKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({})
          });
          
          if (!updateRes.ok) {
            console.warn(`Pluggy PATCH item update returned status ${updateRes.status} for item ${itemId}`);
          }

          // 2. Poll the item status until completed and retrieve mapped accounts + transactions
          const payload = await fetchPluggyItemPayload(itemId as string, apiKey);
          updatedAccounts.push(...payload.accounts);
          newTransactions.push(...payload.transactions);
        } catch (e) {
          console.warn(`Pluggy live sync failed for item ${itemId}:`, e);
        }
      }
    }

    res.json({
      newTransactions,
      updatedAccounts,
      updatedAccountsCount: targetAccounts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to sync Pluggy" });
  }
});


// Heuristic Rule-Based Categorizer Fallback (Brazilian & US Financials)
function categorizeTransactionsHeuristic(items: any[], allowedCategories: string[]) {
  const findCategory = (preferred: string[], defaultCat = "Uncategorized") => {
    for (const p of preferred) {
      const match = allowedCategories.find(c => c.toLowerCase() === p.toLowerCase() || c.toLowerCase().includes(p.toLowerCase()));
      if (match) return match;
    }
    return defaultCat;
  };

  return items.map((item: any) => {
    const desc = (item.description || "").toLowerCase();
    const amount = Number(item.amount) || 0;
    let category = "Uncategorized";
    let tags: string[] = [];
    let isRecurring = false;

    // 1. Groceries & Supermarkets
    if (/carrefour|pao de acucar|pão de açúcar|supermercado|whole foods|trader joe|kroger|safeway|costco|walmart|market|hortifruti|assa[ií]|atacad[aã]o|extra\b|dia\b|sonda|mambo|st marche|natural da terra|mercado|grocery|supermarket/i.test(desc)) {
      category = findCategory(["Groceries", "Food & Dining", "Shopping", "Food"]);
      tags = ["Groceries", "Food"];
    }
    // 2. Restaurants & Food Delivery
    else if (/restaurante|ifood|rappi|uber\s*eats|doordash|grubhub|starbucks|mcdonald|burger king|padaria|panificadora|caf[eé]|coffee|bistro|pizza|sushi|bar\b|churrascaria|outback|habib|madalosso|coco bambu|subway\b|dining|restaurant/i.test(desc)) {
      category = findCategory(["Restaurants & Dining", "Food & Dining", "Food", "Groceries"]);
      tags = ["Dining", "Food"];
    }
    // 3. Transportation & Rideshare & Fuel
    else if (/uber\b|99app|99\s*pop|99\s*corrida|lyft|posto\b|gasolina|combustivel|combustível|shell|ipiranga|chevron|parking|estacionamento|pedagio|pedágio|sem parar|veloe|conectcar|metr[oô]|subway\b|transit|airline|latam|gol\b|azul\b|delta\b|united\b|american air|toyota|honda|auto\b|detran|gas\b|transport/i.test(desc)) {
      category = findCategory(["Transportation", "Travel", "Auto", "Vehicle"]);
      tags = ["Transportation"];
    }
    // 4. Subscriptions & Media
    else if (/netflix|spotify|apple\.com|google storage|youtube|amazon prime|disney|hbo|max\b|globo|adobe|chatgpt|openai|github|icloud|crunchyroll|deezer|prime video|nytimes|wsj|subscription/i.test(desc)) {
      category = findCategory(["Subscriptions & Media", "Entertainment", "Bills & Utilities", "Shopping"]);
      tags = ["Subscription", "Software"];
      isRecurring = true;
    }
    // 5. Utilities & Telecom
    else if (/claro|vivo|tim\b|oi\b|enel|sabesp|cpfl|light\b|comgas|comgás|copel|cemig|internet|eletricidade|energia|agua|água|att\b|at&t|verizon|t-mobile|electric|water|utility|iptu|ipva/i.test(desc)) {
      category = findCategory(["Bills & Utilities", "Housing & Rent", "Utilities"]);
      tags = ["Utility", "Bills"];
      isRecurring = true;
    }
    // 6. Housing & Rent
    else if (/aluguel|condominio|condomínio|rent\b|mortgage|imobiliaria|imobiliária|quinto\s*andar|loft\b|zap\b/i.test(desc)) {
      category = findCategory(["Housing & Rent", "Bills & Utilities", "Housing"]);
      tags = ["Housing"];
      isRecurring = true;
    }
    // 7. Health & Pharmacy & Fitness
    else if (/farmacia|farmácia|droga|drogasil|droga raia|pague menos|smart fit|gym\b|academia|bluefit|bodytech|hospital|clinica|clínica|medico|médico|unimed|sulamerica|bradesco sa[uú]de|cvs|walgreens|laboratorio|laboratório|fleury|delboni|health|fitness/i.test(desc)) {
      category = findCategory(["Health & Fitness", "Medical", "Shopping"]);
      tags = ["Health"];
    }
    // 8. E-commerce & Shopping
    else if (/amazon|mercado\s*livre|shopee|shein|aliexpress|magalu|magazine luiza|zara|nike|adidas|apple store|best buy|target|lojas americanas|casas bahia|leroy merlin|centauro|dafiti|shopping|store/i.test(desc)) {
      category = findCategory(["Shopping", "General Shopping", "Personal"]);
      tags = ["Shopping"];
    }
    // 9. Investments & Crypto
    else if (/binance|coinbase|nuinvest|xp investimentos|btg pactual|rico\b|inter dtvm|b3\b|crypto|vanguard|fidelity|schwab|clear corretora|[oó]rama|genial/i.test(desc)) {
      category = findCategory(["Investments & Crypto", "Investments", "Internal Transfer"]);
      tags = ["Investment"];
    }
    // 10. Transfers & Sweeps
    else if (/transfer[eê]ncia|transfer\b|ted enviada|pix enviado|sweep|entre contas|pagamento de fatura|fatura cartao|fatura cartão/i.test(desc)) {
      category = findCategory(["Internal Transfer", "Transfer"]);
      tags = ["Transfer"];
    }
    // 11. Income / Salary
    else if (amount > 0 && /sal[aá]rio|ted recebida|pix recebido|payroll|direct deposit|rendimento|dividendos|pro-labore|remunera[cç][aã]o|reembolso|deposito|depósito|income/i.test(desc)) {
      category = findCategory(["Income & Salary", "Income", "Salary"]);
      tags = ["Income"];
    } else if (amount > 0) {
      category = findCategory(["Income & Salary", "Income", "Other Income"]);
      tags = ["Income"];
    }

    return {
      id: item.id,
      category,
      tags,
      isRecurring,
    };
  });
}

// AI Bulk Transaction Auto-Categorization (Gemini with Fallback)
app.post("/api/ai/categorize", async (req, res) => {
  const { items, categories } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing items array" });
  }

  const allowedCategories: string[] = Array.isArray(categories) && categories.length > 0
    ? Array.from(new Set([...categories, "Uncategorized"]))
    : [
        "Groceries", "Restaurants & Dining", "Bills & Utilities", "Transportation",
        "Shopping", "Subscriptions & Media", "Health & Fitness", "Housing & Rent",
        "Income & Salary", "Investments & Crypto", "Internal Transfer", "Uncategorized"
      ];

  const ai = getGeminiClient();

  if (ai) {
    const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.7-flash"];
    
    for (const modelName of modelsToTry) {
      try {
        const prompt = `Categorize the following financial transactions.
CRITICAL: You MUST ONLY map transactions to one of the following exact existing categories in the database:
${allowedCategories.map((c) => `"${c}"`).join(", ")}

DO NOT create or invent any other category names. If a transaction cannot be clearly and confidently mapped to one of the listed categories, you MUST categorize it as "Uncategorized".
Also suggest 1-2 relevant tags.

Transactions:
${JSON.stringify(items, null, 2)}`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  category: { type: Type.STRING },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  isRecurring: { type: Type.BOOLEAN },
                },
                required: ["id", "category"],
              },
            },
          },
        });

        const categorizedResults = JSON.parse(response.text || "[]");
        if (Array.isArray(categorizedResults) && categorizedResults.length > 0) {
          return res.json({ categorizedResults, source: "gemini", model: modelName });
        }
      } catch (err: any) {
        console.warn(`Gemini AI Categorization with ${modelName} encountered:`, err.message || err);
        // Continue to fallback model or heuristic
      }
    }
  }

  // Graceful rule-based heuristic fallback if AI is unavailable (e.g. 503 high demand spike)
  console.log("Using rule-based heuristic auto-categorization fallback.");
  const categorizedResults = categorizeTransactionsHeuristic(items, allowedCategories);
  return res.json({ categorizedResults, source: "heuristic_fallback" });
});

// AI Real-Time Category Icon Generator Endpoint
app.post("/api/ai/generate-icon", async (req, res) => {
  const { categoryName, description } = req.body;
  if (!categoryName) {
    return res.status(400).json({ error: "categoryName is required" });
  }

  // Heuristic icon/color matcher
  const getHeuristicIcon = (name: string) => {
    const n = name.toLowerCase();
    if (/food|restaurant|dining|meal|lunch|dinner|lanche|comida|restaurante/i.test(n)) {
      return { icon: "Utensils", color: "#F59E0B", svgPath: "M18 2l4 4-4 4M2 18l4 4-4-4" };
    }
    if (/grocer|supermarket|mercado|feira|hortifruti/i.test(n)) {
      return { icon: "ShoppingBag", color: "#10B981", svgPath: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" };
    }
    if (/transport|uber|car|gas|fuel|combustivel|carro|auto|veiculo/i.test(n)) {
      return { icon: "Car", color: "#3B82F6", svgPath: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" };
    }
    if (/health|fitness|gym|medic|saude|saúde|farmacia|academia/i.test(n)) {
      return { icon: "Heart", color: "#EF4444", svgPath: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" };
    }
    if (/subscription|stream|media|software|app|netflix|spotify|assinatura/i.test(n)) {
      return { icon: "Tv", color: "#8B5CF6", svgPath: "m21 8-2 2-1.5-3.7A2 2 0 0 0 15.6 5H8.4a2 2 0 0 0-1.9 1.3L5 10l-2-2" };
    }
    if (/income|salary|salario|salário|invest|renda|receita/i.test(n)) {
      return { icon: "Landmark", color: "#22C55E", svgPath: "M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l10 7H2l10-7z" };
    }
    return { icon: "Tag", color: "#6366F1", svgPath: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" };
  };

  const ai = getGeminiClient();
  if (ai) {
    const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.7-flash"];
    for (const modelName of modelsToTry) {
      try {
        const prompt = `Choose the best Lucide React icon name and a matching Tailwind accent hex color for a financial category named "${categoryName}" (${description || "personal expense/income category"}). Also supply a simple SVG path "d" attribute string for custom icon rendering.

Choose Lucide icons like: ShoppingBag, Coffee, Dumbbell, Car, Utensils, Tv, Plane, Book, Gift, Shield, Cpu, Flame, Scissors, Zap, Heart, Camera, Briefcase, GraduationCap, Home, Landmark, PiggyBank, Smile.`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                icon: { type: Type.STRING, description: "Lucide icon component name" },
                color: { type: Type.STRING, description: "Hex color e.g. #10B981" },
                svgPath: { type: Type.STRING, description: "SVG path d string" },
                reasoning: { type: Type.STRING },
              },
              required: ["icon", "color"],
            },
          },
        });

        const result = JSON.parse(response.text || "{}");
        if (result && result.icon) {
          return res.json(result);
        }
      } catch (err: any) {
        console.warn(`AI Icon Generation with ${modelName} failed:`, err.message || err);
      }
    }
  }

  // Fallback
  return res.json(getHeuristicIcon(categoryName));
});

// AI Financial Advisor & Insights Endpoint
app.post("/api/ai/insights", async (req, res) => {
  const { transactions, baseCurrency, totalIncome, totalExpenses, netWorth, recurringSummary } = req.body;

  const activeSubCount = recurringSummary?.activeCount ?? 0;
  const activeSubCost = recurringSummary?.totalMonthlyCost
    ? Number(recurringSummary.totalMonthlyCost.toFixed(2))
    : 0;
  const activeSubNames = (recurringSummary?.services || []).map((s: any) => s.name).join(", ");
  const activeSubDetails = (recurringSummary?.services || []).map((s: any) => {
    let line = `- ${s.name}: ${s.monthlyCost} ${s.currency}/mo (Cadence: ${s.frequency || 'monthly'})`;
    if (s.tierCount && s.tierCount > 1) {
      line += ` [3-Month Rolling History: ${s.tierCount} recurring tiers consolidated, 3-mo monthly average: ${s.rolling3MonthMonthlyAverage ? s.rolling3MonthMonthlyAverage.toFixed(2) : s.monthlyCost} ${s.currency}${s.pendingThisMonthCount ? `, ${s.pendingThisMonthCount} pending charges expected later this month` : ''}]`;
    }
    return line;
  }).join("\n");

  const subDescription =
    activeSubCount > 0
      ? `You are spending approx. ${baseCurrency || "USD"} ${activeSubCost}/mo across ${activeSubCount} active recurring services (${activeSubNames || "streaming, SaaS, gym"}).`
      : "Review your active digital subscriptions (streaming, SaaS tools, delivery) to eliminate unused recurring charges.";

  const fallbackInsights = [
    {
      id: `ins_summary_${Date.now()}`,
      type: (totalIncome || 0) > (totalExpenses || 0) ? "saving_opportunity" : "budget_warning",
      title: (totalIncome || 0) > (totalExpenses || 0) ? "Positive Cash Flow Maintained" : "Expense Rate Notice",
      description: (totalIncome || 0) > (totalExpenses || 0)
        ? `Your total income exceeds expenses with a healthy net flow across ${baseCurrency || "USD"} and linked accounts.`
        : `Monthly expenses are currently higher than incoming revenue. Consider reviewing top spending categories.`,
      suggestedAction: "Check your recurring subscriptions and discretionary spending.",
      icon: "TrendingUp",
    },
    {
      id: `ins_sub_${Date.now()}`,
      type: "subscription_found",
      title: activeSubCount > 0 ? `${activeSubCount} Active Subscriptions Audited` : "Recurring Subscriptions Active",
      description: subDescription,
      impactAmount: activeSubCost > 0 ? activeSubCost : undefined,
      currency: baseCurrency || "USD",
      suggestedAction: "Review active subscriptions to prune unused services or negotiate plans.",
      icon: "Sparkles",
    },
    {
      id: `ins_fx_${Date.now()}`,
      type: "general",
      title: "Multi-Currency Balance Optimization",
      description: "Monitor exchange rate fluctuations between USD and BRL to optimize international transfers and credit card settlements.",
      suggestedAction: "Review live FX rates in the top header bar.",
      icon: "Landmark",
    },
  ];

  const ai = getGeminiClient();
  if (ai) {
    const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.7-flash"];
    const sampleLedger = (transactions || []).slice(0, 30).map((t: any) => ({
      date: t.date,
      desc: t.description,
      amount: t.amount,
      currency: t.currency,
      category: t.category,
    }));

    const prompt = `You are Moneta AI, a high-precision personal finance advisor. Analyze the user's financial transactions in USD and BRL (Base Currency: ${baseCurrency || "USD"}).
Financial Summary: Total Income = ${totalIncome}, Total Expenses = ${totalExpenses}, Net Worth = ${netWorth}.
Active Recurring Subscriptions (Calculated using 3-month rolling historical data & vendor consolidation):
${
      activeSubCount > 0
        ? `Total: ${activeSubCount} verified active services totaling ${activeSubCost} ${baseCurrency || "USD"}/mo.\nServices Breakdown:\n${activeSubDetails}`
        : "None detected or none active"
    }

Transactions Sample:
${JSON.stringify(sampleLedger, null, 2)}

Identify 3 key insights:
1. An anomaly or spending spike (e.g., dining, shopping, transportation).
2. Subscription/recurring bill analysis (CRITICAL: You must use the verified recurring subscription numbers and 3-month rolling historical data provided above: ${activeSubCount} active services totaling ${activeSubCost} ${baseCurrency || "USD"}/mo. Note that vendors like Apple/Google consolidate multiple recurring sub-streams from 3-month history even if some charges are still pending to hit later this month).
3. An actionable saving or budget optimization tip.`;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: {
                    type: Type.STRING,
                    description: "one of: spending_spike, subscription_found, budget_warning, saving_opportunity, general",
                  },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  impactAmount: { type: Type.NUMBER },
                  currency: { type: Type.STRING },
                  suggestedAction: { type: Type.STRING },
                  icon: { type: Type.STRING },
                },
                required: ["id", "type", "title", "description"],
              },
            },
          },
        });

        const insights = JSON.parse(response.text || "[]");
        if (Array.isArray(insights) && insights.length > 0) {
          return res.json({ insights, source: "gemini", model: modelName });
        }
      } catch (err: any) {
        console.warn(`AI Insights with ${modelName} failed:`, err.message || err);
      }
    }
  }

  // Graceful fallback
  return res.json({ insights: fallbackInsights, source: "heuristic_fallback" });
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Moneta Local Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
