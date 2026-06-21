/**
 * nseClient.js
 *
 * Fetches live price, market cap, and 52-week range via a Cloudflare
 * Worker (worker/src/index.js) that proxies requests server-side,
 * solving the CORS block that prevents calling these exchanges
 * directly from a browser tab.
 *
 * STATUS, confirmed via a real deployed test: NSE blocks this Worker
 * outright with a 403 — not a CORS issue, but IP-range blocking at an
 * edge/CDN layer in front of NSE's actual servers (confirmed via the
 * exact "Access Denied" HTML body NSE returns, matching independently
 * reported blocking of other cloud-hosted services). This is not
 * fixable by header/cookie tweaks. fetchQuoteInfo therefore tries BSE
 * first (a different exchange, different domain, different blocking
 * policy — genuinely untested, not just NSE-renamed) and only falls
 * back to the NSE path if BSE fails, in case NSE's policy or a header
 * tweak someday changes. Shareholding pattern (promoter %, pledging)
 * has no BSE equivalent built yet and stays NSE-only — meaning it's
 * also currently blocked; manual entry is the working path for that
 * field today.
 *
 * Setup required before this works: deploy the Worker (see
 * worker/README.md) and paste its URL into WORKER_BASE_URL below.
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
      `Could not reach the proxy Worker (${err.message}). Check WORKER_BASE_URL in js/nseClient.js is set to your deployed Worker's actual URL.`
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new NseFetchError(data.error || `Worker returned ${response.status}`, response.status);
  }

  return data;
}

/**
 * Live price and (attempted) 52-week range from BSE, proxied through
 * the Worker. Price is confirmed working against real data. 52-week
 * range is a newer addition, extracted from the rendered stock page's
 * HTML — genuinely less certain than the price fields, since it's
 * unverified whether those numbers are present in the page's initial
 * HTML or only injected client-side (see worker/src/index.js for the
 * full caveat). If week52High/Low come back null here, that's likely
 * this risk, not a bug to chase in this file.
 */
async function fetchBseQuoteInfo(symbol) {
  const data = await callWorker("/bse-quote", symbol);
  return {
    name: data.companyName ?? null,
    currentPrice: data.currentPrice ?? null,
    previousClose: data.previousClose ?? null,
    todayLow: data.todayLow ?? null,
    todayHigh: data.todayHigh ?? null,
    marketCap: null, // not available from this endpoint
    week52High: data.week52High ?? null,
    week52Low: data.week52Low ?? null,
    fetchedAt: data.fetchedAt ?? null,
    source: "bse",
  };
}

/** Live price, market cap, and 52-week range from NSE — currently confirmed blocked, kept as a fallback in case that changes. */
async function fetchNseQuoteInfo(symbol) {
  const data = await callWorker("/quote", symbol);
  return {
    name: data.companyName ?? null,
    currentPrice: data.currentPrice ?? null,
    marketCap: data.marketCap ?? null,
    week52High: data.week52High ?? null,
    week52Low: data.week52Low ?? null,
    fetchedAt: data.fetchedAt ?? null,
    source: "nse",
  };
}

/** Tries BSE first (not currently IP-blocked, as far as tested), falls back to NSE (confirmed blocked, kept for if that ever changes). */
async function fetchQuoteInfo(symbol) {
  try {
    return await fetchBseQuoteInfo(symbol);
  } catch (bseErr) {
    try {
      return await fetchNseQuoteInfo(symbol);
    } catch (nseErr) {
      throw new NseFetchError(`BSE failed (${bseErr.message}); NSE also failed (${nseErr.message})`);
    }
  }
}

/** Shareholding pattern history (promoter holding, pledging) — NSE only, currently blocked. No BSE equivalent built yet. */
async function fetchShareholding(symbol) {
  const data = await callWorker("/shareholding", symbol);
  return data.history ?? [];
}

/**
 * Fetches both quote and shareholding for one symbol, with per-source
 * error isolation — a failure on one doesn't block the other, and the
 * caller can see exactly which source failed and why.
 */
async function refreshStockFromNse(symbol) {
  const result = { symbol, quoteInfo: null, shareholding: null, errors: {} };

  try {
    result.quoteInfo = await fetchQuoteInfo(symbol);
  } catch (err) {
    result.errors.quoteInfo = err.message;
  }

  try {
    result.shareholding = await fetchShareholding(symbol);
  } catch (err) {
    result.errors.shareholding = err.message;
  }

  result.success = Object.keys(result.errors).length === 0;
  result.partial = Object.keys(result.errors).length > 0 && Object.keys(result.errors).length < 2;

  return result;
}

/**
 * Refreshes multiple symbols. No artificial delay between requests is
 * needed here — unlike the old direct-from-browser design, NSE never
 * sees the user's IP making repeated requests; it sees the Worker's,
 * one call at a time, same as any normal server traffic.
 */
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
  fetchQuoteInfo,
  fetchBseQuoteInfo,
  fetchNseQuoteInfo,
  fetchShareholding,
  refreshStockFromNse,
  batchRefresh,
  NseFetchError,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = nseClientExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, nseClientExports);
}
