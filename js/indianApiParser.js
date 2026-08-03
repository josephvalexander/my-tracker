/**
 * indianApiParser.js
 *
 * Converts a raw indianapi.in /stock response into the same
 * fundamentals schema that screenerParser.js produced from a
 * Screener.in .xlsx upload — so all existing calculations.js
 * functions work unchanged.
 *
 * Field mapping confirmed against real Tata Steel API response
 * (not guessed): every key below was verified to exist and return
 * a non-null value in the actual API response.
 *
 * The indianapi.in free tier (stock.indianapi.in) returns:
 *   - 8 years of annual financials (INC, BAL, CAS)
 *   - 11 quarters of financials
 *   - Current price (BSE + NSE)
 *   - 52-week high/low
 *   - Shareholding pattern (quarterly history)
 *   - Corporate actions (dividends, splits, bonus)
 *   - Key metrics (ROE, margins, valuation ratios)
 * All from a single /stock?name={name} call.
 */

/**
 * Extract a value from any section (INC/BAL/CAS) of a financial period
 * by its exact key name, as confirmed in the real API response.
 */
function getField(period, key) {
  for (const section of ["INC", "BAL", "CAS"]) {
    for (const item of period.stockFinancialMap?.[section] ?? []) {
      if (item.key === key) {
        const v = parseFloat(item.value);
        return Number.isFinite(v) ? v : null;
      }
    }
  }
  return null;
}

/**
 * Extract a key metric value by its key from any category.
 */
function getMetric(keyMetrics, key) {
  for (const cat of Object.values(keyMetrics ?? {})) {
    if (!Array.isArray(cat)) continue;
    for (const item of cat) {
      if (item.key === key) {
        const v = parseFloat(item.value);
        return Number.isFinite(v) ? v : null;
      }
    }
  }
  return null;
}

/**
 * Parse the full indianapi.in /stock response into the app's schema.
 *
 * Returns { stockFundamentals, companyName, shareholding, priceContext,
 *           corporateActions, warnings }
 *
 * stockFundamentals matches the shape calculations.js and screenerParser.js
 * produce, so no changes to calculations.js, holdingsCalculations.js,
 * or any screen are needed.
 */
function parseIndianApiResponse(data) {
  const warnings = [];

  // ── Annual periods, oldest-first (calculations.js expects oldest first)
  const annualPeriods = (data.financials ?? [])
    .filter((p) => p.Type === "Annual")
    .sort((a, b) => parseInt(a.FiscalYear) - parseInt(b.FiscalYear));

  if (annualPeriods.length === 0) {
    warnings.push("No annual financial periods found in API response");
  }

  // ── Build arrays oldest → newest for each field
  function buildArray(key) {
    return annualPeriods.map((p) => getField(p, key));
  }

  const netProfit       = buildArray("NetIncome");
  const revenue         = buildArray("TotalRevenue");
  const operatingCF     = buildArray("CashfromOperatingActivities");
  const investingCF     = buildArray("CashfromInvestingActivities");
  const profitBeforeTax = buildArray("NetIncomeBeforeTaxes");
  const depreciation    = buildArray("Depreciation/Amortization");
  const interestRaw     = buildArray("InterestInc(Exp)Net-Non-OpTotal");
  // Interest from indianapi is negative (expense shown as negative income)
  // Calculations expect a positive interest expense figure
  const interest        = interestRaw.map((v) => (v !== null ? Math.abs(v) : null));
  const totalAssets     = buildArray("TotalAssets");
  const totalEquity     = buildArray("TotalEquity");
  const retainedEarnings = buildArray("RetainedEarnings(AccumulatedDeficit)");
  const sharesRaw       = buildArray("TotalCommonSharesOutstanding");
  // indianapi returns shares in millions (e.g. 1247.18 for ~1.25 billion shares)
  // calculations.js expects raw share count
  const sharesOutstandingHistory = sharesRaw.map((v) =>
    v !== null ? Math.round(v * 1_000_000) : null
  );
  const dps             = buildArray("DPS-CommonStockPrimaryIssue");
  const dividendPaid    = buildArray("TotalCashDividendsPaid");
  const capex           = buildArray("CapitalExpenditures");
  const cash            = buildArray("Cash");

  // Borrowings = LongTermDebt + NotesPayable/ShortTermDebt
  const ltDebt = buildArray("LongTermDebt");
  const stDebt = buildArray("NotesPayable/ShortTermDebt");
  const borrowings = annualPeriods.map((_, i) => {
    const lt = ltDebt[i] ?? 0;
    const st = stDebt[i] ?? 0;
    return lt + st > 0 ? lt + st : null;
  });

  // Equity share capital + reserves (used by equityHistory in calculations.js)
  // indianapi doesn't separate these — use TotalEquity as equity share capital
  // and set reserves to 0, since equityHistory sums them anyway
  const equityShareCapital = totalEquity;
  const reserves = annualPeriods.map(() => 0);

  // Years array
  const years = annualPeriods.map((p) => p.FiscalYear);

  // Other income is implicit (not a standalone field in indianapi)
  const otherIncome = annualPeriods.map(() => null);

  // priceAtYearEnd — not in the API response; DCF uses OCF not price
  const priceAtYearEnd = annualPeriods.map(() => null);

  // Quarterly results — for "quarterly" field used in some screens
  const quarterlyPeriods = (data.financials ?? [])
    .filter((p) => p.Type !== "Annual")
    .sort((a, b) => new Date(a.EndDate) - new Date(b.EndDate));

  const quarterly = {
    periods: quarterlyPeriods.map((p) => p.EndDate),
    revenue: quarterlyPeriods.map((p) => getField(p, "TotalRevenue")),
    netProfit: quarterlyPeriods.map((p) => getField(p, "NetIncome")),
  };

  // ── sharesOutstanding — most recent non-null value
  const lastShares = [...sharesOutstandingHistory].reverse().find((v) => v !== null);

  // ── Shareholding pattern
  const rawShareholding = data.shareholding ?? [];
  const shareholdingHistory = buildShareholdingHistory(rawShareholding);

  // ── Corporate actions
  const corporateActions = parseCorporateActions(data.stockCorporateActionData);

  // ── Price context
  const priceContext = {
    source: "indianapi",
    lastUpdated: new Date().toISOString().slice(0, 10),
    week52High: parseFloat(data.yearHigh) || null,
    week52Low: parseFloat(data.yearLow) || null,
  };

  // Current price — prefer NSE
  const currentPrice =
    parseFloat(data.currentPrice?.NSE) ||
    parseFloat(data.currentPrice?.BSE) ||
    null;

  // Market cap from keyMetrics
  const marketCapRaw = getMetric(data.keyMetrics, "marketCap");
  // indianapi market cap appears to be in crores already based on Tata Steel: 236935 Cr
  const marketCap = marketCapRaw || null;

  const stockFundamentals = {
    source: "indianapi",
    lastUpdated: new Date().toISOString().slice(0, 10),
    currentPrice,
    marketCap,
    sharesOutstanding: lastShares,
    annual: {
      years,
      netProfit,
      revenue,
      operatingCashFlow: operatingCF,
      investingCashFlow: investingCF,
      profitBeforeTax,
      depreciation,
      interest,
      borrowings,
      totalAssets,
      equityShareCapital,
      reserves,
      retainedEarnings,
      sharesOutstandingHistory,
      dividendAmount: dps,
      dividendPaid,
      otherIncome,
      priceAtYearEnd,
      cash,
    },
    quarterly,
  };

  return {
    stockFundamentals,
    companyName: data.companyName || null,
    shareholding: shareholdingHistory,
    priceContext,
    corporateActions,
    warnings,
  };
}

/**
 * Convert the shareholding array into the app's shareholding history
 * schema: { history: [{ quarter, promoter, fii, dii, public, pledged }] }
 */
function buildShareholdingHistory(rawShareholding) {
  if (!rawShareholding?.length) return { history: [] };

  // Find the max number of periods across all categories
  const maxPeriods = Math.max(
    ...rawShareholding.map((cat) => cat.categories?.length ?? 0)
  );

  const history = [];
  for (let i = 0; i < maxPeriods; i++) {
    const entry = { quarter: null, promoter: null, fii: null, dii: null, public: null, pledged: null };

    for (const cat of rawShareholding) {
      const period = cat.categories?.[i];
      if (!period) continue;
      if (i === 0) entry.quarter = period.holdingDate;

      const pct = parseFloat(period.percentage) || null;
      const name = (cat.categoryName || cat.displayName || "").toLowerCase();

      if (name.includes("promoter")) {
        entry.promoter = pct;
        entry.quarter = period.holdingDate;
      } else if (name.includes("fii") || name.includes("foreign")) {
        entry.fii = pct;
      } else if (name === "mf" || name.includes("mutual")) {
        entry.dii = pct; // MF as proxy for DII
      } else if (name.includes("other") || name.includes("public")) {
        entry.public = pct;
      }
    }

    // Pledging is not in the shareholding array from this endpoint —
    // it would need a separate /historical_stats?stats=shareholding_pattern call
    entry.pledged = null;

    history.push(entry);
  }

  return {
    source: "indianapi",
    lastUpdated: new Date().toISOString().slice(0, 10),
    history: history.sort((a, b) => new Date(a.quarter) - new Date(b.quarter)),
  };
}

/**
 * Parse corporate actions into a clean structure.
 */
function parseCorporateActions(raw) {
  if (!raw) return { dividends: [], splits: [], bonus: [] };

  return {
    dividends: (raw.dividend ?? []).map((d) => ({
      type: d.interimOrFinal || "Dividend",
      amount: d.value,
      percentage: d.percentage,
      recordDate: d.recordDate,
      xdDate: d.xdDate,
      announced: d.dateOfAnnouncement,
      remarks: d.remarks,
    })),
    splits: (raw.splits ?? []).map((s) => ({
      ratio: s.ratio || s.remarks,
      recordDate: s.recordDate,
      announced: s.dateOfAnnouncement,
    })),
    bonus: (raw.bonus ?? []).map((b) => ({
      ratio: b.ratio || b.remarks,
      recordDate: b.recordDate,
      announced: b.dateOfAnnouncement,
    })),
  };
}

const indianApiParserExports = { parseIndianApiResponse };

if (typeof module !== "undefined" && module.exports) {
  module.exports = indianApiParserExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, indianApiParserExports);
}
