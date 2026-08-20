/**
 * holdingsCalculations.js
 *
 * Derived numbers for the Holdings tab. Holdings now use a tax-lot
 * model: each holding has a `lots` array of individual purchases.
 * Quantity, avgBuyPrice, invested, and dividends are all derived
 * from lots at render time — nothing is stored redundantly.
 *
 * Dividend calculation is per-lot: a dividend is credited to a lot
 * only if the lot's purchase date is on or before the dividend's
 * record date. This gives accurate dividend attribution rather than
 * a simplified "current shares × all dividends" approach.
 */

/** Parse a split ratio from indianapi's oldFaceValue/newFaceValue fields.
 *  Returns a multiplier: e.g. 10:1 split → oldFV=10, newFV=1 → multiplier=10
 *  (shares get multiplied by 10, price gets divided by 10). */
function splitMultiplier(action) {
  const oldFV = parseFloat(action.oldFaceValue);
  const newFV = parseFloat(action.newFaceValue);
  if (!oldFV || !newFV || newFV === 0) return null;
  return oldFV / newFV;
}

/** Parse a bonus ratio from remarks string like "1:1 Bonus Issue" or "3:2".
 *  Returns the number of bonus shares per existing share (e.g. 1 for 1:1).
 *  A 1:1 bonus means 1 extra share per existing share → multiply qty by 2,
 *  divide price by 2. A 3:2 bonus means 3 extra per 2 existing → multiply by 1.5. */
function bonusMultiplier(action) {
  // Try ratio field first
  const ratioStr = action.ratio || action.remarks || "";
  // Match patterns like "1:1", "3:2", "1 : 2"
  const m = ratioStr.match(/(\d+)\s*:\s*(\d+)/);
  if (m) {
    const bonusShares = parseInt(m[1]);
    const existingShares = parseInt(m[2]);
    if (existingShares === 0) return null;
    // Total shares after = existing + bonus per existing
    return (existingShares + bonusShares) / existingShares;
  }
  return null;
}

/** Derive total quantity from lots. */
function totalQuantity(holding) {
  if (!holding?.lots?.length) return holding?.quantity ?? 0;
  return holding.lots.reduce((s, l) => s + (l.quantity || 0), 0);
}

/** Derive weighted average buy price from lots. */
function avgBuyPrice(holding) {
  if (!holding?.lots?.length) return holding?.avgBuyPrice ?? 0;
  const qty = totalQuantity(holding);
  if (qty === 0) return 0;
  const totalCost = holding.lots.reduce((s, l) => s + (l.quantity || 0) * (l.buyPrice || 0), 0);
  return totalCost / qty;
}

/** Total invested (cost basis) from lots. */
function investedValue(holding) {
  if (!holding?.lots?.length) {
    return (holding?.quantity ?? 0) * (holding?.avgBuyPrice ?? 0);
  }
  return holding.lots.reduce((s, l) => s + (l.quantity || 0) * (l.buyPrice || 0), 0);
}

/** Current market value. */
function currentValue(holding, currentPrice) {
  if (!currentPrice) return null;
  return totalQuantity(holding) * currentPrice;
}

/** P&L % from weighted average cost. */
function profitPct(holding, currentPrice) {
  const avg = avgBuyPrice(holding);
  if (!currentPrice || !avg) return null;
  return ((currentPrice - avg) / avg) * 100;
}

/**
 * Total dividends received for a holding, based on tax lots.
 * Each dividend is credited to a lot only if the lot's purchaseDate
 * is on or before the dividend's recordDate (the ex-dividend date).
 * Lots with no date get credit for all dividends (conservative assumption).
 *
 * dividends = stock.corporateActions.dividends (array from indianapi)
 * Each dividend: { amount (₹/share), recordDate (YYYY-MM-DD) }
 */
function totalDividendsReceived(holding, dividends) {
  if (!dividends?.length) return 0;
  const today = new Date();
  today.setHours(23, 59, 59, 0); // end of today

  if (!holding?.lots?.length) {
    return dividends.reduce((s, d) => {
      if (!d.amount) return s;
      const dateStr = d.recordDate || d.announced || null;
      const recordDate = dateStr ? new Date(dateStr) : null;
      if (recordDate && recordDate > today) return s; // future — not yet paid
      return s + d.amount * (holding?.quantity || 0);
    }, 0);
  }

  let total = 0;
  for (const dividend of dividends) {
    if (!dividend.amount) continue;
    const dateStr    = dividend.recordDate || dividend.announced || null;
    const recordDate = dateStr ? new Date(dateStr) : null;
    if (recordDate && recordDate > today) continue; // future — not yet paid

    const datedLots = holding.lots.filter(l => l.purchaseDate);
    for (const lot of datedLots) {
      if (!recordDate || new Date(lot.purchaseDate) <= recordDate) {
        total += (lot.quantity || 0) * dividend.amount;
      }
    }
    const undatedQty = holding.lots
      .filter(l => !l.purchaseDate)
      .reduce((s, l) => s + (l.quantity || 0), 0);
    total += undatedQty * dividend.amount;
  }
  return total;
}

/**
 * XIRR — Extended Internal Rate of Return.
 * Uses Newton-Raphson iteration to find the annual rate r where NPV = 0.
 *
 * cashFlows: [{ amount, date }]  — negative = outflow (purchase), positive = inflow (current value)
 * Returns annualised rate as a decimal (e.g. 0.142 = 14.2%), or null if it fails.
 */
function xirr(cashFlows, guess = 0.1) {
  if (cashFlows.length < 2) return null;
  const dates = cashFlows.map(cf => cf.date);
  const t0    = dates[0];
  const years = dates.map(d => (d - t0) / (365.25 * 24 * 3600 * 1000));

  function npv(r) {
    return cashFlows.reduce((s, cf, i) => s + cf.amount / Math.pow(1 + r, years[i]), 0);
  }
  function dnpv(r) {
    return cashFlows.reduce((s, cf, i) => s - years[i] * cf.amount / Math.pow(1 + r, years[i] + 1), 0);
  }

  let r = guess;
  for (let i = 0; i < 100; i++) {
    const n = npv(r);
    const d = dnpv(r);
    if (Math.abs(d) < 1e-12) break;
    const r1 = r - n / d;
    if (Math.abs(r1 - r) < 1e-8) return r1;
    r = r1;
    if (!isFinite(r) || r < -0.9999) return null; // diverged
  }
  return null; // failed to converge
}

/**
 * Compute portfolio XIRR across all holdings.
 * Rules:
 * - Only dated lots are included
 * - Lots held for less than 2 months are excluded entirely
 * - If no eligible lots remain, returns null
 * - Result capped at ±999% for display
 */
function portfolioXIRR(holdings, priceMap) {
  const today     = new Date();
  const twoMonths = 60 * 24 * 3600 * 1000;
  const cashFlows = [];
  let totalCurrentValue = 0;

  for (const h of holdings) {
    const cmp = priceMap[h.ticker];
    if (!cmp) continue;

    const lots = h.lots?.length
      ? h.lots
      : (h.quantity && h.avgBuyPrice ? [{ purchaseDate: null, quantity: h.quantity, buyPrice: h.avgBuyPrice }] : []);

    for (const lot of lots) {
      if (!lot.purchaseDate) continue; // skip undated
      const lotDate = new Date(lot.purchaseDate);
      const held    = today - lotDate;
      if (held < twoMonths) continue; // skip < 2 months

      const cost         = lot.quantity * lot.buyPrice;
      const currentValue = lot.quantity * cmp;
      cashFlows.push({ amount: -cost, date: lotDate });
      totalCurrentValue += currentValue;
    }
  }

  if (cashFlows.length === 0 || totalCurrentValue === 0) return null;

  // Sort by date ascending, add terminal inflow at today
  cashFlows.sort((a, b) => a.date - b.date);
  cashFlows.push({ amount: totalCurrentValue, date: today });

  const rate = xirr(cashFlows);
  if (rate === null || !isFinite(rate)) return null;

  // Cap at ±999% for display
  return Math.max(-9.99, Math.min(9.99, rate)) * 100;
}

/** Build the full holdings summary for the Holdings tab. */
function buildHoldingsSummary(holdings, priceMap, dividendMap) {
  const rows = holdings.map((h) => {
    const cmp = priceMap[h.ticker] ?? null;
    const divs = dividendMap?.[h.ticker] ?? [];
    const qty = totalQuantity(h);
    const avg = avgBuyPrice(h);
    const invested = investedValue(h);
    const current = currentValue(h, cmp);
    const pPct = profitPct(h, cmp);
    const dividends = totalDividendsReceived(h, divs);
    return {
      ticker: h.ticker,
      quantity: qty,
      avgBuyPrice: avg,
      currentPrice: cmp,
      invested,
      currentValue: current,
      profitPct: pPct,
      profitAbsolute: current !== null ? current - invested : null,
      dividends,
      lots: h.lots || [],
    };
  });

  const totalInvested      = rows.reduce((s, r) => s + (r.invested      ?? 0), 0);
  const totalCurrentValue  = rows.reduce((s, r) => s + (r.currentValue  ?? 0), 0);
  const totalDividends     = rows.reduce((s, r) => s + (r.dividends     ?? 0), 0);
  const overallProfitPct   = totalInvested > 0
    ? ((totalCurrentValue - totalInvested) / totalInvested) * 100
    : null;
  const xirrPct = portfolioXIRR(holdings, priceMap);

  return {
    rows: rows.map((r) => ({
      ...r,
      allocationPct: totalCurrentValue > 0 && r.currentValue !== null
        ? (r.currentValue / totalCurrentValue) * 100
        : null,
    })),
    totalInvested,
    totalCurrentValue,
    totalDividends,
    overallProfitPct,
    xirrPct,
  };
}

const holdingsCalculationsExports = {
  totalQuantity, avgBuyPrice, investedValue, currentValue, profitPct,
  totalDividendsReceived, buildHoldingsSummary, splitMultiplier, bonusMultiplier,
  portfolioXIRR,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = holdingsCalculationsExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, holdingsCalculationsExports);
}
