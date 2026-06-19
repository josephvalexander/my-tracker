/**
 * holdingsCalculations.js
 *
 * Derived numbers for the "My Holdings" tab. Quantity and avgBuyPrice
 * are the only two fields the user types in (per Holding object in the
 * schema) — current price comes from the linked Stock record, and
 * everything else here is computed at render time.
 */

/** Current market value of a single holding. */
function currentValue(holding, currentPrice) {
  if (!holding || !currentPrice) return null;
  return holding.quantity * currentPrice;
}

/** Amount invested (cost basis) for a single holding. */
function investedValue(holding) {
  if (!holding) return null;
  return holding.quantity * holding.avgBuyPrice;
}

/** Profit/loss % for a single holding. */
function profitPct(holding, currentPrice) {
  if (!holding || !currentPrice || !holding.avgBuyPrice) return null;
  return ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;
}

/** Absolute profit/loss in rupees for a single holding. */
function profitAbsolute(holding, currentPrice) {
  const invested = investedValue(holding);
  const current = currentValue(holding, currentPrice);
  if (invested === null || current === null) return null;
  return current - invested;
}

/**
 * Builds the full holdings summary: per-holding figures plus portfolio
 * totals and each holding's allocation % of the total current value.
 * `holdings` is an array of Holding objects; `priceMap` is
 * { ticker: currentPrice } pulled from the linked Stock records.
 */
function buildHoldingsSummary(holdings, priceMap) {
  const rows = holdings.map((h) => {
    const cmp = priceMap[h.ticker] ?? null;
    return {
      ticker: h.ticker,
      quantity: h.quantity,
      avgBuyPrice: h.avgBuyPrice,
      currentPrice: cmp,
      invested: investedValue(h),
      currentValue: currentValue(h, cmp),
      profitPct: profitPct(h, cmp),
      profitAbsolute: profitAbsolute(h, cmp),
    };
  });

  const totalInvested = rows.reduce((sum, r) => sum + (r.invested ?? 0), 0);
  const totalCurrentValue = rows.reduce((sum, r) => sum + (r.currentValue ?? 0), 0);
  const overallProfitPct =
    totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : null;

  const rowsWithAllocation = rows.map((r) => ({
    ...r,
    allocationPct:
      totalCurrentValue > 0 && r.currentValue !== null
        ? (r.currentValue / totalCurrentValue) * 100
        : null,
  }));

  return {
    rows: rowsWithAllocation,
    totalInvested,
    totalCurrentValue,
    overallProfitPct,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { currentValue, investedValue, profitPct, profitAbsolute, buildHoldingsSummary };
}
