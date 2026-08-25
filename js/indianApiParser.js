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
  // Note: TotalCommonSharesOutstanding units are inconsistent across stocks
  // in indianapi (some stocks report in millions, others in crores).
  // Do not use shares × price to derive market cap — use reusable.marketCap
  // directly (confirmed correct in Cr for all tested stocks).
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

  // ── Price context — use stockDetailsReusableData as primary source
  // since it's confirmed to have price, yhigh, ylow, marketCap, peTTM
  // all in clean numeric form (confirmed from real Tata Steel response)
  const reusable = data.stockDetailsReusableData ?? {};
  const peTTMfromField = parseFloat(reusable.pPerEBasicExcludingExtraordinaryItemsTTM) || null;
  const sectorPE = parseFloat(reusable.sectorPriceToEarningsValueRatio) || null;

  // Prefer deriving P/E ourselves from price ÷ TTM EPS, since the
  // pre-computed field sometimes uses full-year annual EPS rather than
  // a genuine rolling 4-quarter TTM (confirmed discrepancy on eClerx:
  // field gives 18.4 while market consensus is ~25.6 at the same price).
  // ePSBasicExcludingExtraordinaryItemsItrailing12Month is the genuine
  // rolling TTM EPS, confirmed present in real data at 8.85 for Tata Steel.
  const epsTTM = getMetric(data.keyMetrics, "ePSBasicExcludingExtraordinaryItemsItrailing12Month")
    || getMetric(data.keyMetrics, "ePSIncludingExtraOrdinaryItemsTrailing12Month");
  const priceForPE = parseFloat(reusable.price) || null;
  const peTTMderived = (epsTTM && priceForPE && epsTTM > 0)
    ? parseFloat((priceForPE / epsTTM).toFixed(2))
    : null;

  // Use derived (rolling TTM) if available; fall back to field value
  const peTTM = peTTMderived ?? peTTMfromField;

  // 52-week: prefer reusable.yhigh/ylow over data.yearHigh/yearLow
  const week52High = parseFloat(reusable.yhigh) || parseFloat(data.yearHigh) || null;
  const week52Low  = parseFloat(reusable.ylow)  || parseFloat(data.yearLow)  || null;

  // REIT/InvIT specific fields — prefer reusable fields, fall back to computed values
  let distributionYield = parseFloat(reusable.currentDividendYieldCommonStockPrimaryIssueLTM) || null;
  let gearing           = parseFloat(reusable.totalDebtPerTotalEquityMostRecentQuarter) || null;
  let interestCoverage  = parseFloat(getMetric(data.keyMetrics, "netInterestCoverageMostRecentFiscalYear")) || null;
  let cashFlowPerShare  = parseFloat(getMetric(data.keyMetrics, "cashFlowPerShareTrailing12Month")) || null;
  let distPerShare5yr   = parseFloat(getMetric(data.keyMetrics, "dividendperShare5YearAverage")) || null;
  let operatingMargin   = parseFloat(getMetric(data.keyMetrics, "operatingMarginTrailing12Month")) || null;

  // For InvIT/REIT where keyMetrics is empty, compute from financials + dividend records
  const reitCurrentPrice = parseFloat(reusable.price) || null;

  // Compute annual distribution from last 12 months of dividend records
  if (!distributionYield || !distPerShare5yr) {
    const now = new Date();
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const divRecords = (data.stockCorporateActionData?.dividend || []);
    const byDate = {};
    divRecords.forEach(d => {
      if (!d.recordDate) return;
      const dt = new Date(d.recordDate);
      if (dt >= oneYearAgo && dt <= now) {
        byDate[d.recordDate] = (byDate[d.recordDate] || 0) + (parseFloat(d.value) || 0);
      }
    });
    const annualDist = Object.values(byDate).reduce((s, v) => s + v, 0);
    if (annualDist > 0) {
      distPerShare5yr = distPerShare5yr || annualDist;
      if (!distributionYield && reitCurrentPrice) {
        distributionYield = parseFloat(((annualDist / reitCurrentPrice) * 100).toFixed(2));
      }
    }
  }

  // Compute gearing from balance sheet financials when not available from reusable
  if (!gearing && data.financials?.length > 0) {
    const sfm = data.financials[0]?.stockFinancialMap?.BAL || [];
    const balMap = {};
    sfm.forEach(item => { balMap[item.displayName.trim()] = parseFloat(item.value) || 0; });
    const totalDebt   = balMap["Total Debt"] || 0;
    const totalEquity = balMap["Total Equity"] || 0;
    if (totalDebt > 0 && totalEquity > 0) {
      gearing = parseFloat((totalDebt / totalEquity).toFixed(2));
    }
  }

  // Compute interest coverage from income statement if not available
  if (!interestCoverage && data.financials?.length > 0) {
    const sfm = data.financials[0]?.stockFinancialMap?.INC || [];
    const incMap = {};
    sfm.forEach(item => { incMap[item.displayName.trim()] = parseFloat(item.value) || 0; });
    const ebit          = incMap["Operating Income"] || 0;
    const interestExp   = Math.abs(incMap["Interest Inc( Exp) Net- Non- Op Total"] || incMap["Interest Expense"] || 0);
    if (ebit > 0 && interestExp > 0) {
      interestCoverage = parseFloat((ebit / interestExp).toFixed(2));
    }
  }

  // Compute operating margin from income statement if not available
  if (!operatingMargin && data.financials?.length > 0) {
    const sfm = data.financials[0]?.stockFinancialMap?.INC || [];
    const incMap = {};
    sfm.forEach(item => { incMap[item.displayName.trim()] = parseFloat(item.value) || 0; });
    const revenue = incMap["Total Revenue"] || incMap["Revenue"] || 0;
    const ebit    = incMap["Operating Income"] || 0;
    if (revenue > 0 && ebit) {
      operatingMargin = parseFloat(((ebit / revenue) * 100).toFixed(2));
    }
  }

  const priceContext = {
    source: "indianapi",
    lastUpdated: new Date().toISOString().slice(0, 10),
    week52High,
    week52Low,
    peTTM,
    sectorPE,
    distributionYield,
    gearing,
    interestCoverage,
    cashFlowPerShare,
    distPerShare5yr,
    operatingMargin,
  };

  // Current price: prefer reusable.price (live intraday), fall back to currentPrice object
  const currentPrice =
    parseFloat(reusable.price) ||
    parseFloat(data.currentPrice?.NSE) ||
    parseFloat(data.currentPrice?.BSE) ||
    null;

  // Market cap: prefer reusable.marketCap, fall back to shares × price
  const marketCapRaw = parseFloat(reusable.marketCap) || getMetric(data.keyMetrics, "marketCap");
  let marketCap = marketCapRaw || null;
  if (!marketCap && currentPrice && data.financials?.length > 0) {
    const balItems = data.financials[0]?.stockFinancialMap?.BAL || [];
    const balMap = {}; balItems.forEach(i => { balMap[i.displayName.trim()] = parseFloat(i.value) || 0; });
    const sharesOutstanding = balMap["Total Common Shares Outstanding"] || 0;
    if (sharesOutstanding > 0) {
      // Shares in Cr × price → Cr market cap
      marketCap = parseFloat((sharesOutstanding * currentPrice / 100).toFixed(2)) || null;
    }
  }

  // Cash flow per share: compute from operating cash flow / shares if not in keyMetrics
  if (!cashFlowPerShare && data.financials?.length > 0) {
    const casItems = data.financials[0]?.stockFinancialMap?.CAS || [];
    const balItems = data.financials[0]?.stockFinancialMap?.BAL || [];
    const casMap = {}; casItems.forEach(i => { casMap[i.displayName.trim()] = parseFloat(i.value) || 0; });
    const balMap = {}; balItems.forEach(i => { balMap[i.displayName.trim()] = parseFloat(i.value) || 0; });
    const opCF   = casMap["Cashfrom Operating Activities"] || 0;
    const shares  = balMap["Total Common Shares Outstanding"] || balMap["Diluted Weighted Average Shares"] || 0;
    if (opCF > 0 && shares > 0) {
      cashFlowPerShare = parseFloat((opCF / shares).toFixed(2));
    }
    // Distribution coverage = operating CF / total dividends paid
    const divPaid = Math.abs(casMap["Total Cash Dividends Paid"] || 0);
    if (opCF > 0 && divPaid > 0 && !distPerShare5yr) {
      // Also derive distPerShare5yr from actual dividends paid / shares
      distPerShare5yr = distPerShare5yr || parseFloat((divPaid / shares).toFixed(2));
    }
  }

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

  // ── Recent news — last 4, most recent first, relative Livemint URLs completed
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recentNews = (data.recentNews ?? [])
    .filter((n) => {
      const dateStr = n.date ?? n.lastPublishedDate ?? null;
      if (!dateStr) return false;
      return new Date(dateStr) >= threeMonthsAgo;
    })
    .slice(0, 4)
    .map((n) => ({
      headline: n.headline ?? null,
      date: n.date ?? n.lastPublishedDate ?? null,
      url: n.url ? (n.url.startsWith("http") ? n.url : `https://www.livemint.com${n.url}`) : null,
      summary: n.summary ? n.summary.replace(/<[^>]+>/g, "").trim() : null,
      timeToRead: n.timeToRead ?? null,
    }));

  // ── Analyst consensus
  const analystRaw = data.analystView ?? [];
  const recoBar = data.recosBar ?? {};
  const analystConsensus = recoBar.isDataPresent ? {
    total: recoBar.noOfRecommendations ?? 0,
    meanValue: recoBar.meanValue ?? null,
    ratings: (recoBar.stockAnalyst ?? [])
      .filter((r) => parseFloat(r.numberOfAnalysts) > 0)
      .map((r) => ({ name: r.ratingName, count: parseFloat(r.numberOfAnalysts), color: r.colorCode })),
    consensusLabel: analystRaw.find((r) => parseFloat(r.numberOfAnalystsLatest) > 0)?.ratingName ?? null,
  } : null;

  return {
    stockFundamentals,
    companyName: data.companyName || null,
    sector: data.industry || null,
    shareholding: shareholdingHistory,
    priceContext,
    corporateActions,
    recentNews,
    analystConsensus,
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