/**
 * nseClient.js
 *
 * Fetches shareholding pattern, bulk/block deals, and corporate actions
 * from NSE's public endpoints. Relies on the user having opened
 * nseindia.com in a browser tab first (see the "Refresh from NSE" flow
 * in the UI) so the browser holds a valid session cookie for that origin
 * — fetch() with credentials:'include' will then ride those cookies
 * automatically, since cookies are scoped per-origin, not per-tab.
 *
 * IMPORTANT — known fragility, read before debugging:
 * 1. These are NSE's internal endpoints, not a published/versioned API.
 *    NSE can change response shape or block patterns without notice.
 * 2. NSE's anti-bot layer cares about headers (User-Agent, Referer,
 *    Accept) as much as cookies. A request can fail with valid cookies
 *    if headers look non-browser-like.
 * 3. CORS: if NSE's server doesn't send back an Access-Control-Allow-Origin
 *    header permitting this app's origin, the browser blocks the response
 *    before any of our code sees it — this looks identical to a network
 *    failure in our error handling, there is no way to distinguish them
 *    from JS alone. If every fetch fails immediately, this is the
 *    likely cause, and there is no client-side fix — it requires either
 *    a CORS proxy or the user falling back to manual CSV upload.
 * 4. Every function here therefore has a manual-fallback counterpart in
 *    the UI (CSV upload). Never let a fetch failure be a dead end.
 */

const NSE_BASE = "https://www.nseindia.com";

// Endpoints are based on patterns NSE's own front-end JS calls, observed
// via their public corporate-filings pages, not from a stable doc — if
// these stop working after an NSE site change, check the network tab
// on nseindia.com's shareholding/bulk-deals pages for the current path.
const ENDPOINTS = {
  shareholding: (symbol) => `${NSE_BASE}/api/corporate-shareholding-pattern?index=equities&symbol=${symbol}`,
  largeDeals: () => `${NSE_BASE}/api/snapshot-capital-market-largedeal`,
  corporateActions: (symbol) => `${NSE_BASE}/api/corporates-corporateActions?index=equities&symbol=${symbol}`,
  quote: (symbol) => `${NSE_BASE}/api/quote-equity?symbol=${symbol}`,
};

async function nseFetch(url) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new NseFetchError(`NSE returned ${response.status} for ${url}`, response.status);
  }
  return response.json();
}

class NseFetchError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "NseFetchError";
    this.status = status;
  }
}

/**
 * Fetches shareholding pattern history for a symbol.
 * Returns the shape expected by Stock.shareholding.history (see schema),
 * or throws NseFetchError — caller should catch and fall back to
 * showing the manual CSV upload UI.
 */
async function fetchShareholding(symbol) {
  const data = await nseFetch(ENDPOINTS.shareholding(symbol));
  // NSE's raw response nests records under a "data" array with its own
  // field names — mapped here to our schema's field names. This mapping
  // is the first thing to re-check if NSE changes their response shape.
  const records = data?.data ?? [];
  return records.map((r) => ({
    quarter: r.date ?? r.asOnDate ?? null,
    promoter: parseFloat(r.promoterGroup ?? r.promoter ?? 0),
    fii: parseFloat(r.fii ?? 0),
    dii: parseFloat(r.dii ?? 0),
    public: parseFloat(r.public ?? 0),
    pledged: parseFloat(r.pledgedPercentage ?? r.encumbered ?? 0),
  }));
}

/**
 * Fetches company name, industry/sector, market cap, and 52-week
 * high/low from NSE's quote endpoint. This is the one genuinely
 * automatable source for "sector" — there is no free API for business
 * descriptions, competitive moat, or market position, those stay
 * manual fields by necessity (see js/screens/stockDetail.js qualitative
 * section comments).
 */
async function fetchQuoteInfo(symbol) {
  const data = await nseFetch(ENDPOINTS.quote(symbol));
  const info = data?.info ?? {};
  const priceInfo = data?.priceInfo ?? {};
  const industryInfo = data?.industryInfo ?? data?.metadata ?? {};
  return {
    name: info.companyName ?? null,
    sector: industryInfo.industry ?? industryInfo.macro ?? null,
    currentPrice: priceInfo.lastPrice ?? null,
    marketCap: priceInfo.totalMarketCap ?? null,
    week52High: priceInfo.weekHighLow?.max ?? null,
    week52Low: priceInfo.weekHighLow?.min ?? null,
  };
}

/**
 * Fetches recent bulk/block deals across the whole market, then filters
 * to the requested symbol client-side (NSE's large-deal snapshot is
 * market-wide per call, not per-symbol).
 */
async function fetchBulkDeals(symbol) {
  const data = await nseFetch(ENDPOINTS.largeDeals());
  const records = data?.data ?? data?.BULK_DEALS_DATA ?? [];
  return records
    .filter((r) => (r.symbol ?? r.SYMBOL) === symbol)
    .map((r) => ({
      date: r.date ?? r.DATE ?? null,
      clientName: r.clientName ?? r.CLIENT_NAME ?? "Unknown",
      dealType: (r.buySell ?? r.BUY_SELL ?? "").toLowerCase() === "sell" ? "sell" : "buy",
      quantity: parseInt(r.qty ?? r.QUANTITY ?? 0, 10),
      pricePerShare: parseFloat(r.tradePrice ?? r.PRICE ?? 0),
      pctOfEquity: parseFloat(r.percentage ?? r.PCT ?? 0),
    }));
}

/** Fetches corporate actions (splits, bonuses, dividends, rights) for a symbol. */
async function fetchCorporateActions(symbol) {
  const data = await nseFetch(ENDPOINTS.corporateActions(symbol));
  const records = Array.isArray(data) ? data : data?.data ?? [];
  return records.map((r) => ({
    date: r.exDate ?? r.EX_DATE ?? null,
    type: classifyActionType(r.subject ?? r.SUBJECT ?? ""),
    ratio: extractRatio(r.subject ?? r.SUBJECT ?? ""),
    rawSubject: r.subject ?? r.SUBJECT ?? "",
  }));
}

/** Best-effort classification of the action type from NSE's free-text subject line. */
function classifyActionType(subject) {
  const s = subject.toLowerCase();
  if (s.includes("bonus")) return "bonus";
  if (s.includes("split") || s.includes("sub-division")) return "split";
  if (s.includes("rights")) return "rights";
  if (s.includes("dividend")) return "dividend";
  return "other";
}

/** Extracts a ratio like "1:1" or "1:2" from free text if present. */
function extractRatio(subject) {
  const match = subject.match(/(\d+)\s*:\s*(\d+)/);
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * Runs all three fetches for one symbol, returning a per-source result
 * so a partial failure (e.g. bulk deals blocked, shareholding fine) is
 * visible to the UI rather than swallowed into one boolean.
 */
async function refreshStockFromNse(symbol) {
  const result = { symbol, shareholding: null, bulkDeals: null, corporateActions: null, quoteInfo: null, errors: {} };

  try {
    result.shareholding = await fetchShareholding(symbol);
  } catch (err) {
    result.errors.shareholding = err.message;
  }

  try {
    result.bulkDeals = await fetchBulkDeals(symbol);
  } catch (err) {
    result.errors.bulkDeals = err.message;
  }

  try {
    result.corporateActions = await fetchCorporateActions(symbol);
  } catch (err) {
    result.errors.corporateActions = err.message;
  }

  try {
    result.quoteInfo = await fetchQuoteInfo(symbol);
  } catch (err) {
    result.errors.quoteInfo = err.message;
  }

  result.success = Object.keys(result.errors).length === 0;
  result.partial = Object.keys(result.errors).length > 0 && Object.keys(result.errors).length < 4;

  return result;
}

/**
 * Batch refresh with a delay between requests to avoid looking like
 * scripted traffic to NSE's rate limiter. Calls onProgress(symbol, result)
 * after each stock so the UI can render results incrementally rather
 * than waiting for the whole batch.
 */
async function batchRefresh(symbols, onProgress, delayMs = 1500) {
  const results = [];
  for (const symbol of symbols) {
    const result = await refreshStockFromNse(symbol);
    results.push(result);
    if (onProgress) onProgress(symbol, result);
    if (symbol !== symbols[symbols.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

const nseClientExports = {
  fetchShareholding,
  fetchBulkDeals,
  fetchCorporateActions,
  fetchQuoteInfo,
  refreshStockFromNse,
  batchRefresh,
  NseFetchError,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = nseClientExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, nseClientExports);
}
