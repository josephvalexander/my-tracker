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
 * Earnings consistency score: years out of the last 10 with positive
 * EPS growth vs the prior year. Returns null (render as N/A) if fewer
 * than 10 years of history exist, per the spec.
 */
function earningsConsistencyScore(stock) {
  const annual = stock?.fundamentals?.annual;
  if (!annual) return null;
  const eps = epsHistory(annual);
  if (eps.length < 11) return null; // need 10 YoY comparisons = 11 data points
  const last11 = lastN(eps, 11);
  let positiveYears = 0;
  for (let i = 1; i < last11.length; i++) {
    if (last11[i] > last11[i - 1]) positiveYears++;
  }
  return positiveYears; // out of 10
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
function retainedEarningsRatio(stock, years = 10) {
  const annual = stock?.fundamentals?.annual;
  if (!annual?.priceAtYearEnd?.length || !annual?.netProfit?.length || !annual?.sharesOutstandingHistory?.length) return null;
  const n = Math.min(years, annual.netProfit.length - 1);
  if (n < 2) return null;

  const startIdx = annual.netProfit.length - 1 - n;
  const endIdx = annual.netProfit.length - 1;

  let totalRetained = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const dividend = annual.dividendAmount?.[i] ?? 0;
    totalRetained += annual.netProfit[i] - dividend;
  }

  const startMarketCap =
    annual.priceAtYearEnd[startIdx] * annual.sharesOutstandingHistory[startIdx];
  const endMarketCap =
    annual.priceAtYearEnd[endIdx] * annual.sharesOutstandingHistory[endIdx];
  if (!Number.isFinite(startMarketCap) || !Number.isFinite(endMarketCap)) return null;
  const marketCapIncrease = (endMarketCap - startMarketCap) / RUPEES_PER_CRORE;

  if (marketCapIncrease <= 0) return null; // ratio undefined/meaningless if market cap fell
  return totalRetained / marketCapIncrease;
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
  earningsConsistency: { green: 8, yellow: 6, direction: "higherIsBetter" },
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
  const pledging = stock?.shareholding?.history?.slice(-1)?.[0]?.pledged ?? null;
  const promoterHistory = stock?.shareholding?.history?.map((h) => h.promoter) ?? [];
  const promoterDeclining =
    promoterHistory.length >= 2 &&
    promoterHistory[promoterHistory.length - 1] < promoterHistory[0] - 1; // >1pt drop

  const hardFlags = [];
  const checks = [];

  if (roe !== null) {
    const pass = roe >= 15;
    checks.push({ label: `ROE ${roe.toFixed(0)}% ${pass ? "≥" : "<"} 15%`, pass });
    if (!pass) hardFlags.push("roeBelow15");
  }
  if (de !== null) {
    const pass = de <= 0.2;
    checks.push({ label: `D/E ${de.toFixed(2)} ${pass ? "≤" : ">"} 0.2`, pass });
    if (!pass) hardFlags.push("deAbove02");
  }
  if (pledging !== null) {
    const pass = pledging === 0;
    checks.push({ label: pass ? "No pledging" : `${pledging}% pledged`, pass });
    if (!pass) hardFlags.push("pledgingAboveZero");
  } else {
    checks.push({ label: "Pledging — not checked, no NSE data yet", pass: null });
  }
  if (promoterHistory.length >= 2) {
    checks.push({ label: promoterDeclining ? "Promoter holding declining" : "Promoter holding stable/rising", pass: !promoterDeclining });
    if (promoterDeclining) hardFlags.push("promoterHoldingDeclining");
  } else {
    checks.push({ label: "Promoter trend — not checked, needs 2+ quarters of NSE data", pass: null });
  }

  const softFlags = [];
  if (cagr !== null && cagr < 12) softFlags.push("epsCagrBelow12");
  if (consistency !== null && consistency < 8) softFlags.push("consistencyBelow8");
  if (rer !== null && rer < 1.0) softFlags.push("rerBelow1");

  let verdict = "Yes";
  if (hardFlags.length > 0) verdict = "No";
  else if (softFlags.length >= 2) verdict = "No";

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

const calculationsExports = {
  roe5yAvg,
  roce5yAvg,
  debtToEquity,
  epsCagr,
  earningsConsistencyScore,
  cashEpsGap,
  shareCountTrend,
  retainedEarningsRatio,
  fcfYield,
  dividendPayoutTrend,
  colorForMetric,
  deriveVerdict,
  entryZoneStatus,
  DEFAULT_RULES,
  epsHistory,
  roeHistory,
  equityHistory,
  lastValidIndex,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = calculationsExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, calculationsExports);
}
