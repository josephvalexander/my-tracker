/**
 * calculations.js
 *
 * Every derived metric in the Buffett checklist, computed from the raw
 * annual/quarterly arrays in a Stock object's `fundamentals` block.
 * Nothing here is stored — it's recomputed at render time so the app
 * never has stale derived numbers sitting alongside fresh raw data.
 *
 * All functions are pure: (stock) => number | null. They return null
 * when there isn't enough data, and callers are responsible for
 * rendering "N/A" rather than a misleading zero.
 */

const RUPEES_PER_CRORE = 1e7;

function lastN(arr, n) {
  if (!arr || arr.length === 0) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

function avg(arr) {
  const valid = arr.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Index of the last non-null, non-undefined, finite value in an array, or -1. */
function lastValidIndex(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined && Number.isFinite(arr[i])) return i;
  }
  return -1;
}

/** Equity = share capital + reserves, per year. Returns [] if data is missing. */
function equityHistory(annual) {
  if (!annual?.equityShareCapital?.length || !annual?.reserves?.length) return [];
  return annual.equityShareCapital.map((cap, i) => cap + (annual.reserves[i] ?? 0));
}

/** EPS per year, in rupees (net profit is in Cr, shares is a raw count). Returns [] if data is missing. */
function epsHistory(annual) {
  if (!annual?.netProfit?.length || !annual?.sharesOutstandingHistory?.length) return [];
  return annual.netProfit.map((np, i) => {
    const shares = annual.sharesOutstandingHistory[i];
    if (!shares || np === null || np === undefined) return null;
    return (np * RUPEES_PER_CRORE) / shares;
  });
}

/** Operating cash flow per share, in rupees. Returns [] if data is missing. */
function ocfPerShareHistory(annual) {
  if (!annual?.operatingCashFlow?.length || !annual?.sharesOutstandingHistory?.length) return [];
  return annual.operatingCashFlow.map((ocf, i) => {
    const shares = annual.sharesOutstandingHistory[i];
    if (!shares || ocf === null || ocf === undefined) return null;
    return (ocf * RUPEES_PER_CRORE) / shares;
  });
}

/** ROE % per year. Returns [] if data is missing. */
function roeHistory(annual) {
  const equity = equityHistory(annual);
  if (equity.length === 0 || !annual?.netProfit?.length) return [];
  return annual.netProfit.map((np, i) => (equity[i] ? (np / equity[i]) * 100 : null));
}

/** ROE %, averaged over the trailing N years (default 5). */
function roe5yAvg(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const roe = lastN(roeHistory(annual), years);
  return avg(roe);
}

/**
 * ROCE % = (PBT + Interest) / Capital Employed.
 * Screener's raw export doesn't separate PBT/Interest in the Balance
 * Sheet block the way it does in P&L — if those fields aren't present
 * for a given stock's export, this returns null and the UI shows N/A
 * rather than guessing.
 */
function roceHistory(annual) {
  if (!annual?.profitBeforeTax || !annual?.interest || !annual?.totalAssets?.length) return null;
  const capitalEmployed = annual.totalAssets.map(
    (total, i) => total - (annual.otherLiabilities?.[i] ?? 0)
  );
  return annual.profitBeforeTax.map(
    (pbt, i) => (capitalEmployed[i] ? ((pbt + (annual.interest[i] ?? 0)) / capitalEmployed[i]) * 100 : null)
  );
}

function roce5yAvg(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const roce = roceHistory(annual);
  if (!roce) return null;
  return avg(lastN(roce, years));
}

/** D/E = total borrowings / equity, most recent year. */
function debtToEquity(stock) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.borrowings?.length) return null;
  const equity = equityHistory(annual);
  if (equity.length === 0) return null;
  const lastIdx = annual.borrowings.length - 1;
  if (!equity[lastIdx]) return equity[lastIdx] === 0 ? 0 : null;
  return annual.borrowings[lastIdx] / equity[lastIdx];
}

/** EPS CAGR over N years (default 5), as a percentage. */
function epsCagr(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const eps = epsHistory(annual);
  const endIdx = lastValidIndex(eps);
  const startIdx = endIdx - years;
  if (endIdx === -1 || startIdx < 0 || eps[startIdx] === null) return null;
  const epsStart = eps[startIdx];
  const epsEnd = eps[endIdx];
  if (epsStart <= 0) return null; // CAGR is meaningless off a negative/zero base
  return ((epsEnd / epsStart) ** (1 / years) - 1) * 100;
}

/**
 * Earnings consistency score: years out of the last 6 with positive
 * EPS growth vs the prior year. Returns null (render as N/A) if fewer
 * than 6 years of history exist, per the spec.
 */
function earningsConsistencyScore(stock) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const eps = epsHistory(annual);
  if (eps.length < 7) return null; // need 6 YoY comparisons = 7 data points
  const last7 = lastN(eps, 7);
  let positiveYears = 0;
  for (let i = 1; i < last7.length; i++) {
    if (last7[i] > last7[i - 1]) positiveYears++;
  }
  return positiveYears; // out of 6
}

/** Cash EPS gap = OCF per share minus reported EPS, most recent valid year. */
function cashEpsGap(stock) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const eps = epsHistory(annual);
  const ocfPerShare = ocfPerShareHistory(annual);
  const idx = lastValidIndex(eps);
  if (idx === -1 || ocfPerShare[idx] === null) return null;
  return ocfPerShare[idx] - eps[idx];
}

/**
 * Share count trend over the trailing 5 years: 'declining' | 'flat' | 'rising'.
 * 'declining' beyond a small rounding tolerance suggests buybacks are
 * propping up EPS rather than organic profit growth.
 */
function shareCountTrend(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.sharesOutstandingHistory?.length) return null;
  const endIdx = lastValidIndex(annual.sharesOutstandingHistory);
  if (endIdx === -1) return null;
  const startIdx = endIdx - years;
  if (startIdx < 0 || annual.sharesOutstandingHistory[startIdx] === null) return null;
  const startShares = annual.sharesOutstandingHistory[startIdx];
  const endShares = annual.sharesOutstandingHistory[endIdx];
  const pctChange = ((endShares - startShares) / startShares) * 100;
  if (pctChange < -1) return "declining";
  if (pctChange > 1) return "rising";
  return "flat";
}

/**
 * Buffett retained earnings ratio:
 * (sum of retained earnings over N years) / (increase in market cap over N years).
 * Retained earnings per year ≈ net profit - dividend amount.
 * Market cap requires a price series; we use `priceAtYearEnd` × shares
 * outstanding for that year as a proxy, since most Screener exports
 * carry a per-year closing price already.
 */
/**
 * Buffett retained earnings ratio — for every ₹1 retained over the
 * measurement period, how much did book equity grow?
 *
 * Original formula used market cap change (requires priceAtYearEnd),
 * which indianapi doesn't provide. This version uses total equity
 * (book value) as the base instead — labelled "book value basis" in
 * the UI to be clear it's not the full market-cap version.
 *
 * Returns null if we don't have enough data.
 */
function retainedEarningsRatio(stock, years = 6) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.netProfit?.length || !annual?.equityShareCapital?.length) return null;

  const n = Math.min(years, annual.netProfit.length - 1);
  if (n < 2) return null;

  const len = annual.netProfit.length;
  const startIdx = len - 1 - n;
  const endIdx = len - 1;

  // Total retained = sum of (net profit - dividends paid) over the period
  let totalRetained = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const np = annual.netProfit[i] ?? 0;
    const div = annual.dividendPaid?.[i] ?? annual.dividendAmount?.[i] ?? 0;
    totalRetained += np - Math.abs(div); // dividendPaid may be negative in cash flow
  }
  if (totalRetained <= 0) return null; // undefined if company consumed capital

  // Book equity change as proxy for value creation
  const startEquity = annual.equityShareCapital[startIdx];
  const endEquity = annual.equityShareCapital[endIdx];
  if (!startEquity || !endEquity) return null;

  const equityIncrease = endEquity - startEquity;
  if (equityIncrease <= 0) return null;

  return totalRetained / equityIncrease;
}

/**
 * Free cash flow yield % = FCF / market cap.
 * FCF approximated as operating cash flow minus capex, where capex is
 * itself approximated as -1 * investing cash flow. This is a known
 * weak approximation: investing cash flow also includes things like
 * purchases/maturities of investments and deposits, which cash-rich
 * companies use heavily and which have nothing to do with capex. For
 * such companies this can swing FCF yield negative even when the
 * underlying business throws off plenty of cash. Screener's raw export
 * has no dedicated capex line to use instead. Always show the
 * `isApproximate: true` flag in the UI so this isn't read as a precise
 * number — treat it as a rough screen, not a hard rule input.
 */
/**
 * Market cap in ₹ Cr, derived as currentPrice × sharesOutstanding —
 * not fetched from anywhere, since no BSE source confirmed working in
 * this app actually returns it (it's only visible on BSE's
 * Angular-rendered page, which a server-side fetch can't read — same
 * dead end as 52-week range and bulk deals). This is the better fix
 * than chasing another scrape attempt: the inputs are already
 * reliable (price from the live BSE quote, or the Screener upload;
 * shares outstanding from the Screener upload), so there's no reason
 * to depend on a fragile scrape for a number this easy to compute.
 */
/**
 * Latest quarterly revenue growth YoY (%) — most important metric
 * for quarterly review. Compares most recent quarter with same
 * quarter last year. Returns null if insufficient quarterly data.
 */
function quarterlyRevenueGrowthYoY(stock) {
  const q = stock?.fundamentals?.quarterly;
  if (!q?.revenue?.length || q.revenue.length < 5) return null;
  const latest = q.revenue[q.revenue.length - 1];
  const sameQtrLastYear = q.revenue[q.revenue.length - 5];
  if (!latest || !sameQtrLastYear || sameQtrLastYear === 0) return null;
  return ((latest - sameQtrLastYear) / Math.abs(sameQtrLastYear)) * 100;
}

/**
 * Latest quarterly PAT margin (%) — net profit as % of revenue
 * for the most recent quarter. Helps spot margin compression early.
 */
function quarterlyPATMargin(stock) {
  const q = stock?.fundamentals?.quarterly;
  if (!q?.revenue?.length || !q?.netProfit?.length) return null;
  const rev = q.revenue[q.revenue.length - 1];
  const pat = q.netProfit[q.netProfit.length - 1];
  if (!rev || rev === 0 || pat == null) return null;
  return (pat / rev) * 100;
}

function calculateMarketCap(stock) {
  const price = stock?.fundamentals?.currentPrice;
  const shares = stock?.fundamentals?.sharesOutstanding;
  if (!price || !shares) return null;
  return (price * shares) / 1e7; // shares is a raw count, result in ₹ Cr
}

function fcfYield(stock) {
  const annual = stock?.fundamentals?.annual;
  const marketCap = stock?.fundamentals?.marketCap;
  if (!annual || !marketCap) return null;
  const idx = lastValidIndex(annual.operatingCashFlow || []);
  if (idx === -1) return null;
  const ocf = annual.operatingCashFlow[idx];
  const investingCf = annual.investingCashFlow?.[idx] ?? null;
  if (investingCf === null) return null;
  const fcfApprox = ocf + investingCf;
  return { value: (fcfApprox / marketCap) * 100, isApproximate: true };
}

/**
 * Average Operating Cash Flow in ₹ Cr over the trailing N years
 * (default 3). Used as the DCF's starting cash flow figure instead of
 * the OCF-minus-investing-CF "FCF approximation" used elsewhere in
 * this file (see fcfYield's comment) — that approximation can swing
 * negative or near-zero for a perfectly healthy, growing business in
 * any year with heavy capex or investment purchases, which would make
 * a DCF built on it wildly wrong (verified: produced a ~₹29 intrinsic
 * value against an actual ₹2,400+ market price on a real test case —
 * a category error, not a minor rounding difference). OCF alone
 * overstates true free cash flow by ignoring capex entirely, but it's
 * stable and won't randomly invalidate the whole estimate. Always
 * label this clearly in the UI as OCF-based, not a rigorous FCF DCF.
 */
function averageOperatingCashFlow(stock, years = 3) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.operatingCashFlow?.length) return null;
  const recent = lastN(annual.operatingCashFlow, years).filter((v) => v !== null && v !== undefined);
  if (recent.length === 0) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/**
 * Average FCF in ₹ Cr over the trailing N years (default 3), using the
 * same OCF + investing-CF approximation as fcfYield. Averaging rather
 * than using a single year matters here: FCF is volatile year to year
 * (one big capex year or investment purchase can swing it negative
 * even for a healthy, growing business), and a DCF's entire output is
 * extremely sensitive to its starting point — anchoring on one
 * possibly-anomalous year would make the whole estimate unreliable in
 * exactly the cases (capex-heavy expansion phases) where you'd most
 * want a sanity check. Returns null if there isn't enough data.
 *
 * NOTE: calculateDefaultIV no longer uses this as its primary input —
 * see averageOperatingCashFlow above for why. Kept here since it's
 * still a more honest "FCF" figure than OCF alone where it's positive,
 * and may be useful for a future bear-case variant.
 */
function averageFcfAbsolute(stock, years = 3) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.operatingCashFlow?.length || !annual?.investingCashFlow?.length) return null;
  const fcfSeries = annual.operatingCashFlow.map((ocf, i) => {
    const icf = annual.investingCashFlow[i];
    if (ocf === null || ocf === undefined || icf === null || icf === undefined) return null;
    return ocf + icf;
  });
  const recent = lastN(fcfSeries, years).filter((v) => v !== null);
  if (recent.length === 0) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Most recent year's absolute FCF in ₹ Cr (same OCF + investing-CF approximation as fcfYield, just not divided by market cap). Returns null if data is missing. */
function latestFcfAbsolute(stock) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const idx = lastValidIndex(annual.operatingCashFlow || []);
  if (idx === -1) return null;
  const ocf = annual.operatingCashFlow[idx];
  const investingCf = annual.investingCashFlow?.[idx] ?? null;
  if (investingCf === null) return null;
  return ocf + investingCf;
}

/** OCF CAGR over N years (default 5), as a percentage — used as the DCF's default growth-rate input, for the same stability reasons averageOperatingCashFlow is preferred over the FCF approximation as the DCF's base. */
function ocfCagr(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.operatingCashFlow?.length) return null;
  const endIdx = lastValidIndex(annual.operatingCashFlow);
  const startIdx = endIdx - years;
  if (endIdx === -1 || startIdx < 0 || annual.operatingCashFlow[startIdx] === null) return null;
  const ocfStart = annual.operatingCashFlow[startIdx];
  const ocfEnd = annual.operatingCashFlow[endIdx];
  if (ocfStart <= 0 || ocfEnd <= 0) return null;
  return ((ocfEnd / ocfStart) ** (1 / years) - 1) * 100;
}

/** FCF CAGR over N years (default 5), as a percentage — same pattern as epsCagr but on the FCF approximation instead of EPS. */
function fcfCagr(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.operatingCashFlow?.length || !annual?.investingCashFlow?.length) return null;
  const fcfSeries = annual.operatingCashFlow.map((ocf, i) => {
    const icf = annual.investingCashFlow[i];
    if (ocf === null || ocf === undefined || icf === null || icf === undefined) return null;
    return ocf + icf;
  });
  const endIdx = lastValidIndex(fcfSeries);
  const startIdx = endIdx - years;
  if (endIdx === -1 || startIdx < 0 || fcfSeries[startIdx] === null) return null;
  const fcfStart = fcfSeries[startIdx];
  const fcfEnd = fcfSeries[endIdx];
  if (fcfStart <= 0 || fcfEnd <= 0) return null; // CAGR is meaningless off a negative/zero base
  return ((fcfEnd / fcfStart) ** (1 / years) - 1) * 100;
}

/**
 * Base-case DCF default intrinsic value — auto-pulled inputs, sensible
 * default assumptions, all overridable by the caller (the edit screen
 * passes its own input values once the user adjusts anything). This
 * is intentionally a single base case, not bear/base/bull, per the
 * decision to keep per-stock setup light across 10-12 holdings.
 *
 * Mechanical part (the math) is exact. The assumption-bearing part
 * (growth rates, discount rate, terminal growth) is real judgment —
 * defaults are deliberately conservative, never auto-suggesting above
 * a 25% near-term growth cap, since blindly extrapolating a high
 * historical CAGR is the most common way a DCF misleads its user.
 *
 * Returns null if there isn't enough data to even form a starting FCF
 * — the UI should fall back to a fully manual IV entry in that case.
 */
function calculateDefaultIV(stock, overrides = {}) {
  const fcf0 = averageOperatingCashFlow(stock);
  const shares = stock?.fundamentals?.sharesOutstanding;
  if (fcf0 === null || fcf0 <= 0 || !shares) return null;

  const historicalCagr = ocfCagr(stock);
  const growthYears1to5 = overrides.growthYears1to5 ?? Math.min(historicalCagr ?? 10, 25);
  const growthYears6to10 = overrides.growthYears6to10 ?? growthYears1to5 / 2;
  const terminalGrowth = overrides.terminalGrowth ?? 4;
  const discountRate = overrides.discountRate ?? 12;

  if (discountRate <= terminalGrowth) return null; // Gordon growth formula breaks down otherwise

  let fcf = fcf0 * 1e7; // Cr -> rupees, to keep units consistent with per-share output at the end
  let presentValueSum = 0;
  const yearlyProjection = [];

  for (let year = 1; year <= 10; year++) {
    const growthRate = year <= 5 ? growthYears1to5 : growthYears6to10;
    fcf = fcf * (1 + growthRate / 100);
    const discounted = fcf / (1 + discountRate / 100) ** year;
    presentValueSum += discounted;
    yearlyProjection.push({ year, fcf, discounted });
  }

  const terminalValue = (fcf * (1 + terminalGrowth / 100)) / (discountRate / 100 - terminalGrowth / 100);
  const discountedTerminalValue = terminalValue / (1 + discountRate / 100) ** 10;

  const enterpriseValue = presentValueSum + discountedTerminalValue;
  const perShareValue = enterpriseValue / shares;

  return {
    low: perShareValue * 0.95,
    high: perShareValue * 1.05,
    base: perShareValue,
    method: "dcf_ocf_based",
    assumptions: { growthYears1to5, growthYears6to10, terminalGrowth, discountRate },
    yearlyProjection,
    terminalValue: discountedTerminalValue,
    historicalOcfCagr: historicalCagr,
  };
}

/** Dividend payout ratio % per year, and the 5-year trend direction. */
function dividendPayoutTrend(stock, years = 5) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.dividendAmount?.length || !annual?.netProfit?.length) return null;
  const payout = annual.netProfit.map((np, i) =>
    np > 0 ? ((annual.dividendAmount[i] ?? 0) / np) * 100 : null
  );
  const recent = lastN(payout, years).filter((v) => v !== null);
  if (recent.length < 2) return null;
  return {
    start: recent[0],
    end: recent[recent.length - 1],
    direction: recent[recent.length - 1] > recent[0] ? "up" : "down",
  };
}

/**
 * Color-coding for a metric against a rule.
 * Rules are { green: threshold, yellow: threshold, direction: 'higherIsBetter' | 'lowerIsBetter' }.
 * Returns 'green' | 'yellow' | 'red' | null (null = no rule, no highlight, per spec).
 */
function colorForMetric(value, rule) {
  if (value === null || value === undefined || !rule) return null;
  const { green, yellow, direction } = rule;
  if (direction === "lowerIsBetter") {
    if (value <= green) return "green";
    if (value <= yellow) return "yellow";
    return "red";
  }
  // higherIsBetter
  if (value >= green) return "green";
  if (value >= yellow) return "yellow";
  return "red";
}

// Default rule set, matching the checklist with the D/E correction (0.1 not 0.15-0.2).
const DEFAULT_RULES = {
  roe: { green: 15, yellow: 10, direction: "higherIsBetter" },
  roce: { green: 15, yellow: 10, direction: "higherIsBetter" },
  de: { green: 0.1, yellow: 0.2, direction: "lowerIsBetter" },
  epsCagr: { green: 12, yellow: 6, direction: "higherIsBetter" },
  earningsConsistency: { green: 5, yellow: 4, direction: "higherIsBetter" },
  promoterHolding: { green: 50, yellow: 40, direction: "higherIsBetter" },
  promoterPledging: { green: 0, yellow: 0.01, direction: "lowerIsBetter" }, // any pledging = red
  retainedEarningsRatio: { green: 1.0, yellow: 0.6, direction: "higherIsBetter" },
};

/**
 * Auto-derived 10-year ownership verdict.
 * Hard flags -> automatic "No". Otherwise 2+ soft flags -> "No". Else "Yes".
 * Returns { verdict: 'Yes'|'No', hardFlags: [...], softFlags: [...], checks: [...] }
 * so the UI can show the reasoning chips, not just the headline answer.
 */
function deriveVerdict(stock) {
  const roe = roe5yAvg(stock);
  const de = debtToEquity(stock);
  const cagr = epsCagr(stock);
  const consistency = earningsConsistencyScore(stock);
  const rer = retainedEarningsRatio(stock);
  // Pledging not available from indianapi — omitted from verdict checks.
  const promoterHistory = stock?.shareholding?.history?.map((h) => h.promoter) ?? [];
  const promoterDeclining =
    promoterHistory.length >= 2 &&
    promoterHistory[promoterHistory.length - 1] < promoterHistory[0] - 1;

  const hardFlags = [];
  const checks = [];

  if (roe !== null) {
    const pass = roe >= 14.5; // tolerance: 14.5%+ rounds to 15% in display and is close enough
    checks.push({ label: `ROE ${roe.toFixed(1)}% ${pass ? "≥" : "<"} 15%`, pass });
    if (!pass) hardFlags.push("roeBelow15");
  }
  if (de !== null) {
    const pass = de <= 0.2;
    checks.push({ label: `D/E ${de.toFixed(2)} ${pass ? "≤" : ">"} 0.2`, pass });
    if (!pass) hardFlags.push("deAbove02");
  }
  if (promoterHistory.length >= 2) {
    checks.push({ label: promoterDeclining ? "Promoter holding declining" : "Promoter holding stable/rising", pass: !promoterDeclining });
    if (promoterDeclining) hardFlags.push("promoterHoldingDeclining");
  } else {
    checks.push({ label: "Promoter trend — needs 2+ quarters of data", pass: null });
  }

  const softFlags = [];
  if (cagr !== null && cagr < 12) softFlags.push("epsCagrBelow12");
  if (consistency !== null && consistency < 5) softFlags.push("consistencyBelow5");
  if (rer !== null && rer < 1.0) softFlags.push("rerBelow1");

  let verdict = "Yes";
  if (hardFlags.length > 0) verdict = "No";
  else if (softFlags.length >= 3) verdict = "No"; // needs all 3 soft flags to fail

  return { verdict, hardFlags, softFlags, checks };
}

/**
 * Entry zone status. Uses the user's manually-set targetEntryPrice if
 * present (explicit override always wins). If not set but an intrinsic
 * value range exists, defaults the target to 15% below the LOW end of
 * that range — a deliberately conservative margin of safety, since the
 * low end of an IV estimate is already the more cautious number.
 * `isDefaulted: true` tells the UI to show this as a suggested target,
 * not a value the user actually chose, so it can offer an edit/override
 * affordance rather than presenting it as a firm decision.
 */
function entryZoneStatus(stock) {
  const cmp = stock?.fundamentals?.currentPrice;
  if (!cmp) return null;

  let target = stock?.targetEntryPrice;
  let isDefaulted = false;

  if (!target && stock?.intrinsicValue?.low) {
    target = stock.intrinsicValue.low * 0.85; // 15% margin of safety below the conservative IV bound
    isDefaulted = true;
  }

  if (!target) return null;

  const pctFromTarget = ((cmp - target) / target) * 100;
  return {
    target,
    cmp,
    pctFromTarget,
    inZone: cmp <= target,
    isDefaulted,
  };
}

const SECTOR_MAP = {
  "Biotechnology & Drugs": "Healthcare", "Healthcare Facilities": "Healthcare",
  "Medical Equipment & Supplies": "Healthcare", "Pharmaceuticals": "Healthcare",
  "Computer Services": "Technology", "Software & Programming": "Technology",
  "Electronic Instr. & Controls": "Technology", "Semiconductors": "Technology",
  "Apparel/Accessories": "Consumer", "Retail (Apparel)": "Consumer",
  "Beverages (Nonalcoholic)": "Consumer", "Beverages (Alcoholic)": "Consumer",
  "Food Processing": "Consumer", "Consumer Cyclical": "Consumer", "Consumer Defensive": "Consumer",
  "Investment Services": "Financials", "Banks": "Financials",
  "Insurance (Life)": "Financials", "Financial": "Financials",
  "Construction Services": "Industrials", "Industrial Goods": "Industrials",
  "Aerospace & Defense": "Industrials",
  "Chemical Manufacturing": "Materials", "Iron & Steel": "Materials", "Basic Materials": "Materials",
  "Motion Pictures": "Media", "Broadcasting & Cable TV": "Media", "Entertainment": "Media",
};

function normalizeSector(raw) {
  if (!raw) return "Sector not set";
  return SECTOR_MAP[raw] || raw;
}

const calculationsExports = {
  roe5yAvg,
  roce5yAvg,
  debtToEquity,
  epsCagr,
  earningsConsistencyScore,
  cashEpsGap,
  shareCountTrend,
  retainedEarningsRatio,
  calculateMarketCap,
  fcfYield,
  latestFcfAbsolute,
  averageFcfAbsolute,
  averageOperatingCashFlow,
  fcfCagr,
  ocfCagr,
  calculateDefaultIV,
  dividendPayoutTrend,
  quarterlyRevenueGrowthYoY,
  quarterlyPATMargin,
  colorForMetric,
  deriveVerdict,
  entryZoneStatus,
  DEFAULT_RULES,
  epsHistory,
  roeHistory,
  equityHistory,
  lastValidIndex,
  normalizeSector,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = calculationsExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, calculationsExports);
}
