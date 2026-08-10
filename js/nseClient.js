/**
 * nseClient.js
 *
 * Fetches live price, 52-week range, and market cap via the Cloudflare
 * Worker (worker/src/index.js), which proxies requests server-side to
 * solve CORS.
 *
 * Source priority:
 *   1. Yahoo Finance (/yf-quote) — gives live price, 52-week range,
 *      market cap. Uses NSE suffix (CAPLIPOINT.NS). Free, no key needed.
 *   2. BSE (/bse-quote) — fallback. Gives live price + today's range.
 *      52-week range attempt may still fail (Angular page issue).
 *
 * indianapi.in calls are made directly from the browser — that API
 * sends proper CORS headers so no Worker proxy is needed for it.
 * See addStock.js / stockDetail.js for those calls.
 *
 * WORKER_BASE_URL: your deployed Cloudflare Worker URL.
 */

const WORKER_BASE_URL = "https://portfolio-tracker-nse-proxy.josephv-mec.workers.dev";

class NseFetchError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "NseFetchError";
    this.status = status;
  }
}

async function callWorker(path, symbol) {
  const url = `${WORKER_BASE_URL}${path}?symbol=${encodeURIComponent(symbol)}`;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new NseFetchError(
      `Could not reach the proxy Worker (${err.message}). Check WORKER_BASE_URL in js/nseClient.js.`
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new NseFetchError(data.error || `Worker returned ${response.status}`, response.status);
  }
  return data;
}

/** Live price, 52-week range, market cap from Yahoo Finance (via Worker). */
// Known NSE ticker → Yahoo Finance symbol overrides.
// Applied only for Yahoo Finance calls — indianapi still receives the NSE ticker.
// Add entries here when Yahoo uses a different symbol than the NSE ticker.
const DEFAULT_YAHOO_OVERRIDES = {
  "CLEAN SCIENCE": "CLEAN",   // Yahoo: CLEAN.NS ≠ NSE: CLEANSCIENCE
  "CLEANSCIENCE":  "CLEAN",   // also match stripped version
  "VINATIORGA":    "VINATIORGA", // explicit — overrides any stored yahooSymbol
  "VINATI":        "VINATIORGA", // if stock was added with ticker VINATI, fix it
};

async function fetchYfQuoteInfo(symbol, yahooSymbol) {
  // DEFAULT_YAHOO_OVERRIDES takes priority over any stored yahooSymbol —
  // this ensures known corrections (VINATIORGA, CLEAN) are always used
  // even if the user previously set a wrong manual override.
  const mapOverride = DEFAULT_YAHOO_OVERRIDES[symbol]
    || DEFAULT_YAHOO_OVERRIDES[symbol.replace(/\s+/g, "")];
  const resolved = mapOverride || yahooSymbol || symbol;
  const cleanSymbol = resolved.replace(/\s+/g, "");
  const yfSymbol = cleanSymbol.includes(".") ? cleanSymbol : `${cleanSymbol}.NS`;
  const data = await callWorker("/yf-quote", yfSymbol);
  return {
    name: data.companyName ?? null,
    currentPrice: data.currentPrice ?? null,
    previousClose: data.previousClose ?? null,
    dayChangePct: data.dayChangePct ?? null,
    marketCap: data.marketCap ?? null,
    week52High: data.week52High ?? null,
    week52Low: data.week52Low ?? null,
    todayLow: null,
    todayHigh: null,
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    fetchedAt: data.fetchedAt ?? null,
    source: "yahoo_finance",
  };
}

/** Live price + today's range from BSE (via Worker). Fallback. */
async function fetchBseQuoteInfo(symbol) {
  const data = await callWorker("/bse-quote", symbol);
  return {
    name: data.companyName ?? null,
    currentPrice: data.currentPrice ?? null,
    previousClose: data.previousClose ?? null,
    marketCap: null,
    week52High: data.week52High ?? null,
    week52Low: data.week52Low ?? null,
    todayLow: data.todayLow ?? null,
    todayHigh: data.todayHigh ?? null,
    fetchedAt: data.fetchedAt ?? null,
    source: "bse",
  };
}

/** Try Yahoo Finance first (with optional symbol override), fall back to BSE. */
async function fetchQuoteInfo(symbol, yahooSymbol) {
  try {
    return await fetchYfQuoteInfo(symbol, yahooSymbol);
  } catch (yfErr) {
    try {
      return await fetchBseQuoteInfo(symbol);
    } catch (bseErr) {
      throw new NseFetchError(
        `Yahoo Finance failed (${yfErr.message}); BSE also failed (${bseErr.message})`
      );
    }
  }
}

/** NSE shareholding — currently blocked by Akamai edge-block. */
async function fetchShareholding(symbol) {
  const data = await callWorker("/shareholding", symbol);
  return data.history ?? [];
}

/**
 * Fetch live price for one stock.
 * yahooSymbol overrides the default NSE-ticker-based Yahoo symbol
 * for stocks where NSE and Yahoo use different tickers
 * (e.g. NSE: CLEANSCIENCE → Yahoo: CLEAN.NS).
 */
async function refreshStockFromNse(symbol, yahooSymbol) {
  const result = { symbol, quoteInfo: null, shareholding: null, errors: {} };

  try {
    result.quoteInfo = await fetchQuoteInfo(symbol, yahooSymbol);
  } catch (err) {
    result.errors.quoteInfo = err.message;
  }

  result.success = Object.keys(result.errors).length === 0;
  result.partial = false;

  return result;
}

async function batchRefresh(symbols, onProgress) {
  const results = [];
  for (const symbol of symbols) {
    const result = await refreshStockFromNse(symbol);
    results.push(result);
    if (onProgress) onProgress(symbol, result);
  }
  return results;
}

const nseClientExports = {
  fetchQuoteInfo, fetchYfQuoteInfo, fetchBseQuoteInfo,
  fetchShareholding, refreshStockFromNse, batchRefresh, NseFetchError,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = nseClientExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, nseClientExports);
}