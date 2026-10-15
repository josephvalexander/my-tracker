/**
 * worker/src/index.js
 *
 * Cloudflare Worker: proxies external API calls server-side,
 * solving CORS for browser-based PWA requests.
 *
 * Endpoints:
 *   GET /yf-quote?symbol=CAPLIPOINT.NS   -> live price, 52w range (Yahoo Finance)
 *   GET /bse-quote?symbol=CAPLIPOINT     -> live price, today's range (BSE)
 *   GET /nse-corporate-actions?symbols=TCS,INFY  -> NSE corporate actions (EQ series)
 *   GET /quote?symbol=CAPLIPOINT         -> NSE (CONFIRMED BLOCKED — kept for reference)
 *   GET /shareholding?symbol=CAPLIPOINT  -> NSE (CONFIRMED BLOCKED — kept for reference)
 *
 * Architecture note: indianapi.in calls are made directly from the
 * browser (no CORS issues since indianapi.in sends proper CORS headers)
 * so they don't need this Worker. Only Yahoo Finance and BSE need proxying.
 */

const ALLOWED_ORIGIN = "https://josephvalexander.github.io";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const BSE_BROWSER_HEADERS = {
  ...BROWSER_HEADERS,
  "Accept-Language": "en-US,en;q=0.9,hi-IN;q=0.8,hi;q=0.7",
  "Origin": "https://www.bseindia.com",
  "Referer": "https://www.bseindia.com/",
};

const NSE_BROWSER_HEADERS = {
  ...BROWSER_HEADERS,
  "Referer": "https://www.nseindia.com/",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

/**
 * Yahoo Finance quote — confirmed working approach:
 * calls the v8/finance/chart endpoint for price data and the
 * v10/finance/quoteSummary endpoint for sector/industry in parallel.
 * NSE suffix: CAPLIPOINT.NS, BSE suffix: 524742.BO
 */
async function handleYfQuote(symbol) {
  // Yahoo Finance symbols cannot contain spaces — strip them before adding .NS
  // e.g. "CLEAN SCIENCE" → "CLEANSCIENCE.NS"
  const cleanSymbol = symbol.replace(/\s+/g, "");
  const nseSymbol = cleanSymbol.includes(".") ? cleanSymbol : `${cleanSymbol}.NS`;
  const YF_HEADERS = { ...BROWSER_HEADERS, "Referer": "https://finance.yahoo.com/" };

  // Run both calls in parallel — quoteSummary gives sector/industry
  const [chartResponse, profileResponse] = await Promise.all([
    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(nseSymbol)}?interval=1d&range=1d&includePrePost=false`,
      { headers: YF_HEADERS }
    ),
    fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(nseSymbol)}?modules=assetProfile`,
      { headers: YF_HEADERS }
    ),
  ]);

  const chartText = await chartResponse.text();
  console.log(`[yf-chart] status ${chartResponse.status}, body length ${chartText.length}, first 200: ${chartText.slice(0, 200)}`);

  if (!chartResponse.ok) {
    throw new Error(`Yahoo Finance chart responded with ${chartResponse.status}. Body: ${chartText.slice(0, 200)}`);
  }

  let chartData;
  try {
    chartData = JSON.parse(chartText);
  } catch {
    throw new Error("Yahoo Finance chart did not return JSON. First 200 chars: " + chartText.slice(0, 200));
  }

  const result = chartData?.chart?.result?.[0];
  if (!result) {
    throw new Error("No data in Yahoo Finance chart response. Possibly invalid symbol: " + nseSymbol);
  }

  // Parse sector/industry from quoteSummary — non-fatal if it fails
  let sector = null;
  let industry = null;
  try {
    const profileText = await profileResponse.text();
    console.log(`[yf-profile] status ${profileResponse.status}, body length ${profileText.length}`);
    if (profileResponse.ok) {
      const profileData = JSON.parse(profileText);
      const qsResult = profileData?.quoteSummary?.result?.[0];
      const profile  = qsResult?.assetProfile;
      sector   = profile?.sector   ?? null;
      industry = profile?.industry ?? null;
      console.log(`[yf-profile] sector: ${sector}, industry: ${industry}`);
    }
  } catch (err) {
    console.log(`[yf-profile] failed (non-fatal): ${err.message}`);
  }

  const meta = result.meta;
  return {
    symbol: nseSymbol,
    companyName: meta?.longName ?? meta?.shortName ?? null,
    currentPrice: meta?.regularMarketPrice ?? null,
    previousClose: meta?.previousClose ?? meta?.chartPreviousClose ?? null,
    dayChangePct: meta?.regularMarketChangePercent != null
      ? parseFloat(meta.regularMarketChangePercent.toFixed(2))
      : null,
    week52High: meta?.fiftyTwoWeekHigh ?? null,
    week52Low: meta?.fiftyTwoWeekLow ?? null,
    marketCap: meta?.marketCap ? meta.marketCap / 1e7 : null,
    // Intraday range from chart meta
    todayHigh: meta?.regularMarketDayHigh ?? null,
    todayLow:  meta?.regularMarketDayLow  ?? null,
    currency: meta?.currency ?? "INR",
    exchange: meta?.exchangeName ?? null,
    sector,
    industry,
    fetchedAt: new Date().toISOString(),
    source: "yahoo_finance",
  };
}

/**
 * BSE quote — confirmed working (two-step: search → intraday chart).
 * Gives current price + today's intraday range.
 * Field names confirmed from real wrangler tail output.
 */
async function handleBseQuote(symbol) {
  const searchUrl = `https://api.bseindia.com/Msource/1D/getQouteSearch.aspx?Type=EQ&text=${encodeURIComponent(symbol)}&flag=site`;
  const searchResponse = await fetch(searchUrl, { headers: BSE_BROWSER_HEADERS });
  const searchText = await searchResponse.text();
  console.log(`[bse-search] ${searchUrl} -> status ${searchResponse.status}, body length ${searchText.length}, first 300 chars: ${searchText.slice(0, 300)}`);

  if (!searchResponse.ok) {
    throw new Error(`BSE search responded with ${searchResponse.status}. Body: ${searchText.slice(0, 200)}`);
  }

  // Confirmed regex from real response:
  // href='/stock-share-price/caplin-point-laboratories-ltd/caplipoint/524742/'
  const scripCodeMatch = searchText.match(/\/(\d{6})\/['"]/);
  if (!scripCodeMatch) {
    throw new Error("Could not find BSE scrip code. Raw response: " + searchText.slice(0, 300));
  }
  const scripCode = scripCodeMatch[1];

  const quoteUrl = `https://api.bseindia.com/BseIndiaAPI/api/StockReachGraph/w?scripcode=${scripCode}&flag=0&fromdate=&todate=&seriesid=`;
  const quoteResponse = await fetch(quoteUrl, { headers: BSE_BROWSER_HEADERS });
  const quoteText = await quoteResponse.text();
  console.log(`[bse-quote] ${quoteUrl} -> status ${quoteResponse.status}, body length ${quoteText.length}, first 300 chars: ${quoteText.slice(0, 300)}`);

  if (!quoteResponse.ok) {
    throw new Error(`BSE quote responded with ${quoteResponse.status}. Body: ${quoteText.slice(0, 200)}`);
  }

  let quoteData;
  try {
    quoteData = JSON.parse(quoteText);
  } catch {
    throw new Error("BSE quote did not return JSON. First 200 chars: " + quoteText.slice(0, 200));
  }

  // 52-week attempt via /shp/ page — confirmed may be Angular shell
  const shpUrl = `https://www.bseindia.com/stock-share-price/shp/scripcode/${scripCode}/flag/7/`;
  const shpResponse = await fetch(shpUrl, { headers: BSE_BROWSER_HEADERS });
  const shpHtml = await shpResponse.text();
  console.log(`[bse-shp] ${shpUrl} -> status ${shpResponse.status}, body length ${shpHtml.length}`);

  let week52High = null;
  let week52Low = null;
  if (shpResponse.ok && shpHtml.length > 1000) {
    const highMatch = shpHtml.match(/52\s*Wk\s*High[^0-9]{0,200}?([\d,]+\.\d+)/i);
    const lowMatch = shpHtml.match(/52\s*Wk\s*Low[^0-9]{0,200}?([\d,]+\.\d+)/i);
    if (highMatch) week52High = parseFloat(highMatch[1].replace(/,/g, ""));
    if (lowMatch) week52Low = parseFloat(lowMatch[1].replace(/,/g, ""));
  }

  // Field names confirmed from real wrangler tail output:
  // CurrVal=current price, PrevClose=previous close, LowVal/HighVal=today's range
  return {
    symbol,
    scripCode,
    companyName: null,
    currentPrice: parseFloat(quoteData?.CurrVal) || null,
    previousClose: parseFloat(quoteData?.PrevClose) || null,
    todayLow: parseFloat(quoteData?.LowVal) || null,
    todayHigh: parseFloat(quoteData?.HighVal) || null,
    week52High,
    week52Low,
    fetchedAt: new Date().toISOString(),
    source: "bse",
  };
}

// NSE endpoints — confirmed blocked by Akamai edge-block (IP-range ban on Cloudflare IPs)
// Kept for reference; not expected to work
async function getNseSessionCookie() {
  const r = await fetch("https://www.nseindia.com/", { headers: NSE_BROWSER_HEADERS });
  const cookie = r.headers.get("set-cookie");
  console.log(`[warmup] homepage status: ${r.status}, got cookie: ${!!cookie}`);
  return cookie || "";
}

async function fetchNseJson(url) {
  const cookie = await getNseSessionCookie();
  const response = await fetch(url, { headers: { ...NSE_BROWSER_HEADERS, Cookie: cookie } });
  const text = await response.text();
  console.log(`[fetch] ${url} -> status ${response.status}, body length ${text.length}, first 300 chars: ${text.slice(0, 300)}`);
  if (!response.ok) throw new Error(`NSE responded with ${response.status}. Body: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error("NSE did not return JSON: " + text.slice(0, 200)); }
}

async function handleQuote(symbol) {
  const data = await fetchNseJson(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`);
  const priceInfo = data?.priceInfo ?? {};
  const info = data?.info ?? {};
  return {
    symbol, companyName: info.companyName ?? null,
    currentPrice: priceInfo.lastPrice ?? null, marketCap: priceInfo.totalMarketCap ?? null,
    week52High: priceInfo.weekHighLow?.max ?? null, week52Low: priceInfo.weekHighLow?.min ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

async function handleShareholding(symbol) {
  const data = await fetchNseJson(`https://www.nseindia.com/api/corporate-shareholding-pattern?index=equities&symbol=${encodeURIComponent(symbol)}`);
  const records = data?.data ?? [];
  const history = records.map((r) => ({
    quarter: r.date ?? r.asOnDate ?? null,
    promoter: parseFloat(r.promoterGroup ?? r.promoter ?? 0),
    fii: parseFloat(r.fii ?? 0), dii: parseFloat(r.dii ?? 0),
    public: parseFloat(r.public ?? 0), pledged: parseFloat(r.pledgedPercentage ?? r.encumbered ?? 0),
  }));
  return { symbol, history, fetchedAt: new Date().toISOString() };
}

/**
 * NSE corporate actions — fetches all EQ series corporate actions
 * (dividends, splits, bonus, rights etc.) and optionally filters to
 * a set of symbols passed as ?symbols=TCS,INFY,...
 *
 * Note: NSE often blocks Cloudflare IPs via Akamai. This may work
 * intermittently; the calendar screen falls back to stored data on failure.
 */
async function handleNseCorporateActions(url) {
  const symbolsParam = url.searchParams.get("symbols") || "";
  const symbols = new Set(
    symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
  );

  // Step 1: pre-fetch NSE homepage to get a session cookie
  const sessionRes = await fetch("https://www.nseindia.com", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });
  const cookies = sessionRes.headers.get("set-cookie") || "";
  console.log(`[nse-ca] homepage status: ${sessionRes.status}, got cookie: ${!!cookies}`);

  // Step 2: fetch corporate actions API with session cookie
  const apiRes = await fetch(
    "https://www.nseindia.com/api/corporates-corporateActions?index=equities",
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-actions",
        "Cookie": cookies,
      },
    }
  );

  const apiText = await apiRes.text();
  console.log(`[nse-ca] api status: ${apiRes.status}, body length: ${apiText.length}, first 200: ${apiText.slice(0, 200)}`);

  if (!apiRes.ok) {
    return new Response(
      JSON.stringify({ error: `NSE returned ${apiRes.status}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  let all;
  try {
    all = JSON.parse(apiText);
  } catch {
    return new Response(
      JSON.stringify({ error: "NSE did not return JSON", preview: apiText.slice(0, 200) }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  // Filter to EQ series, and optionally to the requested symbols
  const filtered = Array.isArray(all)
    ? all.filter(r => r.series === "EQ" && (symbols.size === 0 || symbols.has((r.symbol || "").toUpperCase())))
    : [];

  return new Response(JSON.stringify(filtered), {
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

/**
 * Yahoo Finance index quote — same as /yf-quote but for index symbols
 * like ^BSESN (Sensex) and ^NSEI (Nifty 50) which don't take a .NS suffix.
 */
async function handleYfIndex(symbol) {
  const YF_HEADERS = { ...BROWSER_HEADERS, "Referer": "https://finance.yahoo.com/" };
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`;

  const response = await fetch(url, { headers: YF_HEADERS });
  const text = await response.text();
  console.log(`[yf-index] ${symbol} -> status ${response.status}, body length ${text.length}`);

  if (!response.ok) {
    throw new Error(`Yahoo Finance index responded with ${response.status}. Body: ${text.slice(0, 200)}`);
  }

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("Yahoo Finance index did not return JSON. First 200: " + text.slice(0, 200)); }

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No data in Yahoo Finance index response for: " + symbol);

  const meta = result.meta;
  const current  = meta?.regularMarketPrice ?? null;
  const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
  const change   = (current !== null && prevClose !== null) ? current - prevClose : null;

  // Use exchange-computed changePct directly — avoids discrepancy caused by
  // Yahoo's previousClose sometimes referencing a different session boundary
  // than what the exchange uses for its own official change%.
  const changePct = meta?.regularMarketChangePercent != null
    ? parseFloat(meta.regularMarketChangePercent.toFixed(2))
    : (change !== null && prevClose) ? parseFloat(((change / prevClose) * 100).toFixed(2)) : null;

  return {
    symbol,
    name: meta?.longName ?? meta?.shortName ?? symbol,
    current: current ? Math.round(current) : null,
    previousClose: prevClose ? Math.round(prevClose) : null,
    change: change ? Math.round(change) : null,
    changePct,
    fetchedAt: new Date().toISOString(),
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // /nse-corporate-actions uses ?symbols= (plural, optional) — handle before
    // the ?symbol= guard below so it isn't rejected as "missing symbol".
    if (url.pathname === "/nse-corporate-actions") {
      try {
        return await handleNseCorporateActions(url);
      } catch (err) {
        return jsonResponse({ error: err.message }, 502);
      }
    }

    const symbol = url.searchParams.get("symbol");

    if (!symbol) {
      return jsonResponse({ error: "Missing required ?symbol= parameter" }, 400);
    }

    try {
      if (url.pathname === "/yf-quote")     return jsonResponse(await handleYfQuote(symbol));
      if (url.pathname === "/yf-index")     return jsonResponse(await handleYfIndex(symbol));
      if (url.pathname === "/bse-quote")    return jsonResponse(await handleBseQuote(symbol));
      if (url.pathname === "/quote")        return jsonResponse(await handleQuote(symbol));
      if (url.pathname === "/shareholding") return jsonResponse(await handleShareholding(symbol));
      return jsonResponse({ error: `Unknown path: ${url.pathname}. Use /yf-quote, /bse-quote, /nse-corporate-actions, /quote, or /shareholding.` }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 502);
    }
  },
};
