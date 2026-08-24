/**
 * storage.js
 *
 * Local-first storage layer using IndexedDB. This is the single
 * interface every screen uses to read/write data — no screen talks to
 * IndexedDB directly. Drive sync (driveSync.js) reads/writes through
 * this same interface, so "local" and "synced" data never diverge in
 * shape, only in when they're persisted.
 *
 * Design choice: one object store called "stocks", one called
 * "holdings", one called "meta" (settings, sector benchmarks). Stocks
 * are keyed by ticker.
 */

const DB_NAME = "portfolio-tracker";
const DB_VERSION = 1;
const STORES = ["stocks", "holdings", "meta"];

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "key" });
        }
      });
    };
    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

/** Get a single record by key. Returns null if not found. */
async function get(storeName, key) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
}

/** Set a record. Wraps the value so we can use a consistent keyPath. */
async function set(storeName, key, value) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.put({ key, value });
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

async function remove(storeName, key) {
  const store = await tx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Get all records in a store as an array of { key, value }. */
async function getAll(storeName) {
  const store = await tx(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// --- Public API, scoped to the app's actual entities ---

const StockStore = {
  get: (ticker) => get("stocks", ticker),
  set: (ticker, stock) => set("stocks", ticker, { ...stock, updatedAt: new Date().toISOString() }),
  /** Writes without touching updatedAt — used only by importAll, which needs to preserve the incoming record's own timestamp for future comparisons. */
  setRaw: (ticker, stock) => set("stocks", ticker, stock),
  remove: (ticker) => remove("stocks", ticker),
  getAll: async () => (await getAll("stocks")).map((r) => r.value),
  getActive: async () => (await StockStore.getAll()).filter((s) => s.status === "active"),
  getArchived: async () => (await StockStore.getAll()).filter((s) => s.status === "archived"),
};

const HoldingStore = {
  get: (ticker) => get("holdings", ticker),
  set: (ticker, holding) => set("holdings", ticker, { ...holding, updatedAt: new Date().toISOString() }),
  setRaw: (ticker, holding) => set("holdings", ticker, holding),
  remove: (ticker) => remove("holdings", ticker),
  getAll: async () => (await getAll("holdings")).map((r) => r.value),
};

const MetaStore = {
  getSettings: () => get("meta", "settings"),
  setSettings: (settings) => set("meta", "settings", settings),
  getSnapshots: () => get("meta", "portfolioSnapshots").catch(() => null),
  setSnapshots: (snaps) => set("meta", "portfolioSnapshots", snaps),
  getGoals: () => get("meta", "goals").catch(() => null),
  setGoals: (goals) => set("meta", "goals", goals),
};

/** Archive a stock: flips status, keeps all data (notes, thesis, fundamentals). */
async function archiveStock(ticker, reason) {
  const stock = await StockStore.get(ticker);
  if (!stock) return null;
  stock.status = "archived";
  stock.archivedDate = new Date().toISOString().slice(0, 10);
  stock.archiveReason = reason || null;
  await StockStore.set(ticker, stock);
  return stock;
}

/** Permanently delete a stock and its holding record. Irreversible. */
async function deleteStockPermanently(ticker) {
  await StockStore.remove(ticker);
  await HoldingStore.remove(ticker);
}

/** Export everything as one JSON blob — used for Drive push and for manual backup.
 *  API keys are excluded from Drive sync (device-specific, security concern).
 */
async function exportAll() {
  const stocks   = await StockStore.getAll();
  const holdings = await HoldingStore.getAll();
  const settings = await MetaStore.getSettings();
  const snapshots = await MetaStore.getSnapshots();
  // Strip sensitive keys before pushing to Drive
  const safeSettings = { ...settings };
  delete safeSettings.indianApiKey;
  delete safeSettings.geminiApiKey;
  const goals = await MetaStore.getGoals();
  return { stocks, holdings, settings: safeSettings, snapshots, goals, exportedAt: new Date().toISOString() };
}

/**
 * Import a JSON blob (from Drive pull or manual restore).
 *
 * Per-stock, per-holding last-write-wins by comparing `updatedAt`
 * timestamps (added specifically to support auto-pull-on-open safely —
 * see app.js). If the incoming record has no `updatedAt` (older data
 * written before this field existed) it's treated as older than
 * anything local, so a stale Drive copy can't silently overwrite a
 * local record that's never been pushed yet.
 */
async function importAll(data) {
  for (const stock of data.stocks || []) {
    const local = await StockStore.get(stock.ticker);
    const incomingTime = stock.updatedAt ? new Date(stock.updatedAt).getTime() : 0;
    const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    if (!local || incomingTime >= localTime) await StockStore.setRaw(stock.ticker, stock);
  }
  for (const holding of data.holdings || []) {
    const local = await HoldingStore.get(holding.ticker);
    const incomingTime = holding.updatedAt ? new Date(holding.updatedAt).getTime() : 0;
    const localTime = local?.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    if (!local || incomingTime >= localTime) await HoldingStore.setRaw(holding.ticker, holding);
  }
  if (data.settings) {
    // Preserve local API keys — don't let Drive overwrite them
    const local = (await MetaStore.getSettings()) || {};
    await MetaStore.setSettings({
      ...data.settings,
      indianApiKey: local.indianApiKey ?? data.settings.indianApiKey,
      geminiApiKey: local.geminiApiKey ?? data.settings.geminiApiKey,
    });
  }
  // Merge snapshots — take the union, keeping more data
  if (data.snapshots) {
    const localSnaps = (await MetaStore.getSnapshots()) || {};
    const merged = {};
    for (const filter of ["all","mainboard","sme","index"]) {
      const local  = (localSnaps[filter] || []);
      const remote = (data.snapshots[filter] || []);
      const byDate = {};
      [...local, ...remote].forEach(s => { byDate[s.date] = s; });
      merged[filter] = Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)).slice(-400);
    }
    await MetaStore.setSnapshots(merged);
  }
  if (data.goals) {
    await MetaStore.setGoals(data.goals);
  }
}

/**
 * Save a portfolio value snapshot for today.
 * Stores separate snapshots for "all", "mainboard", and "sme" filters.
 * Keeps the last 400 days per filter (more than 1 year).
 * Deduplicates by date — only one snapshot per day per filter.
 */
async function savePortfolioSnapshot() {
  try {
    const holdings  = await HoldingStore.getAll();
    const allStocks = await StockStore.getAll();
    const stockMap  = {};
    allStocks.forEach(s => { stockMap[s.ticker] = s; });

    const today = new Date().toISOString().slice(0, 10);

    function computeValue(filterFn) {
      return holdings.reduce((sum, h) => {
        const s = stockMap[h.ticker];
        if (!s || (filterFn && !filterFn(s))) return sum;
        // Use lots if available (same logic as totalQuantity in holdingsCalculations.js)
        const qty = h.lots?.length
          ? h.lots.reduce((q, l) => q + (l.quantity || 0), 0)
          : (h.quantity || 0);
        const price = s.fundamentals?.currentPrice ?? 0;
        return sum + qty * price;
      }, 0);
    }

    const values = {
      all:       computeValue(null),
      mainboard: computeValue(s => !s.board || s.board === "mainboard"),
      sme:       computeValue(s => s.board === "sme" || s.board === "microcap"),
    };

    // Fetch index values for benchmark comparison
    const WORKER = "https://portfolio-tracker-nse-proxy.josephv-mec.workers.dev";
    let sensex = null, nifty = null;
    try {
      const [sr, nr] = await Promise.all([
        fetch(`${WORKER}/yf-index?symbol=%5EBSESN`).then(r => r.json()),
        fetch(`${WORKER}/yf-index?symbol=%5ENSEI`).then(r => r.json()),
      ]);
      sensex = sr?.current ?? null;
      nifty  = nr?.current ?? null;
    } catch { /* non-critical */ }

    const existing = (await MetaStore.getSnapshots()) || { all: [], mainboard: [], sme: [], index: [] };
    for (const filter of ["all", "mainboard", "sme"]) {
      const arr = (existing[filter] || []).filter(s => s.date !== today);
      if (values[filter] > 0) arr.push({ date: today, value: Math.round(values[filter]) });
      existing[filter] = arr.sort((a, b) => a.date.localeCompare(b.date)).slice(-400);
    }
    // Store index snapshots for benchmark chart
    const idxArr = (existing.index || []).filter(s => s.date !== today);
    if (sensex || nifty) idxArr.push({ date: today, sensex: sensex ? Math.round(sensex) : null, nifty: nifty ? Math.round(nifty) : null });
    existing.index = idxArr.sort((a,b) => a.date.localeCompare(b.date)).slice(-400);
    await MetaStore.setSnapshots(existing);
  } catch (err) {
    console.warn("Portfolio snapshot failed:", err);
  }
}

const storageExports = { StockStore, HoldingStore, MetaStore, archiveStock, deleteStockPermanently, exportAll, importAll, savePortfolioSnapshot };

if (typeof module !== "undefined" && module.exports) {
  module.exports = storageExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, storageExports);
}
