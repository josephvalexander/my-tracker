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
  if (!holding?.lots?.length) {
    // Legacy single-lot holding — credit all dividends to full qty
    return dividends.reduce((s, d) => s + (d.amount || 0) * (holding?.quantity || 0), 0);
  }

  let total = 0;
  for (const dividend of dividends) {
    const recordDate = dividend.recordDate ? new Date(dividend.recordDate) : null;
    for (const lot of holding.lots) {
      const lotDate = lot.purchaseDate ? new Date(lot.purchaseDate) : null;
      // Credit if: no lot date (unknown — assume eligible) OR lot date ≤ record date
      const eligible = !lotDate || !recordDate || lotDate <= recordDate;
      if (eligible) {
        total += (lot.quantity || 0) * (dividend.amount || 0);
      }
    }
  }
  return total;
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
  };
}

const holdingsCalculationsExports = {
  totalQuantity, avgBuyPrice, investedValue, currentValue, profitPct,
  totalDividendsReceived, buildHoldingsSummary, splitMultiplier, bonusMultiplier,
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = holdingsCalculationsExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, holdingsCalculationsExports);
}
