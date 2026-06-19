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
  set: (ticker, stock) => set("stocks", ticker, stock),
  remove: (ticker) => remove("stocks", ticker),
  getAll: async () => (await getAll("stocks")).map((r) => r.value),
  getActive: async () => (await StockStore.getAll()).filter((s) => s.status === "active"),
  getArchived: async () => (await StockStore.getAll()).filter((s) => s.status === "archived"),
};

const HoldingStore = {
  get: (ticker) => get("holdings", ticker),
  set: (ticker, holding) => set("holdings", ticker, holding),
  remove: (ticker) => remove("holdings", ticker),
  getAll: async () => (await getAll("holdings")).map((r) => r.value),
};

const MetaStore = {
  getSettings: () => get("meta", "settings"),
  setSettings: (settings) => set("meta", "settings", settings),
  getSectorBenchmarks: () => get("meta", "sectorBenchmarks"),
  setSectorBenchmarks: (benchmarks) => set("meta", "sectorBenchmarks", benchmarks),
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

/** Export everything as one JSON blob — used for Drive push and for manual backup. */
async function exportAll() {
  const stocks = await StockStore.getAll();
  const holdings = await HoldingStore.getAll();
  const settings = await MetaStore.getSettings();
  const sectorBenchmarks = await MetaStore.getSectorBenchmarks();
  return { stocks, holdings, settings, sectorBenchmarks, exportedAt: new Date().toISOString() };
}

/**
 * Import a JSON blob (from Drive pull or manual restore).
 * Overwrites local data for any ticker present in the import — this is
 * the "pull" half of manual sync. Caller is responsible for showing a
 * diff/confirmation UI before calling this, since it overwrites.
 */
async function importAll(data) {
  for (const stock of data.stocks || []) {
    await StockStore.set(stock.ticker, stock);
  }
  for (const holding of data.holdings || []) {
    await HoldingStore.set(holding.ticker, holding);
  }
  if (data.settings) await MetaStore.setSettings(data.settings);
  if (data.sectorBenchmarks) await MetaStore.setSectorBenchmarks(data.sectorBenchmarks);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { StockStore, HoldingStore, MetaStore, archiveStock, deleteStockPermanently, exportAll, importAll };
}
