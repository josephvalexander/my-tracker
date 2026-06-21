/**
 * screenerParser.js
 *
 * Parses a screener.in "Export to Excel" file in the browser using
 * SheetJS (loaded via CDN in index.html). Reads the "Data Sheet" tab
 * specifically — that's the raw data tab; the other tabs ("Profit & Loss",
 * "Quarters", "Balance Sheet", "Cash Flow") are formula shells that
 * reference Data Sheet and aren't reliable to parse directly.
 *
 * Row labels below were verified against a real export
 * (Caplin Point Laboratories, June 2026). If Screener changes their
 * export template, this is the first place to check — the parser looks
 * for exact label matches in column A and reads across from there, so
 * a renamed label will make that field silently come back empty. The
 * `parseScreenerFile` return value includes `warnings` for exactly this
 * reason — always show those to the user in the upload preview screen.
 */

const ROW_LABELS = {
  companyName: "COMPANY NAME",
  numberOfShares: "Number of shares",
  faceValue: "Face Value",
  currentPrice: "Current Price",
  marketCap: "Market Capitalization",
  plReportDate: "Report Date", // first occurrence, under PROFIT & LOSS
  sales: "Sales",
  rawMaterialCost: "Raw Material Cost",
  employeeCost: "Employee Cost",
  otherIncome: "Other Income",
  depreciation: "Depreciation",
  interest: "Interest",
  profitBeforeTax: "Profit before tax",
  tax: "Tax",
  netProfit: "Net profit",
  dividendAmount: "Dividend Amount",
  equityShareCapital: "Equity Share Capital",
  reserves: "Reserves",
  borrowings: "Borrowings",
  otherLiabilities: "Other Liabilities",
  total: "Total", // appears twice (assets total, liabilities total) — handled positionally
  receivables: "Receivables",
  inventory: "Inventory",
  cashAndBank: "Cash & Bank",
  noOfEquityShares: "No. of Equity Shares",
  cashFromOperating: "Cash from Operating Activity",
  cashFromInvesting: "Cash from Investing Activity",
  cashFromFinancing: "Cash from Financing Activity",
  netCashFlow: "Net Cash Flow",
  price: "PRICE:",
};

/**
 * Reads a worksheet (SheetJS sheet object) into a map of
 * { rowLabel: [values across the row] }, keyed by exact column-A text.
 * Numeric-looking cells are coerced to numbers; non-numeric strings
 * (e.g. the company name row) are kept as-is so they aren't mangled
 * into NaN; blanks become null.
 */
function indexSheetByRowLabel(sheet, XLSX) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const index = {};
  rows.forEach((row) => {
    const label = row[0];
    if (typeof label === "string" && label.trim().length > 0) {
      const values = row.slice(1).map((v) => {
        if (v === null || v === "") return null;
        const num = Number(v);
        return Number.isNaN(num) ? v : num; // keep text values intact, coerce numerics
      });
      // If a label repeats (e.g. "Report Date", "Total"), keep all
      // occurrences in an array so the caller can pick by position.
      if (!index[label]) index[label] = [];
      index[label].push(values);
    }
  });
  return index;
}

/** Drops leading nulls so all arrays align to the same starting year. */
function trimLeadingNulls(arrays) {
  let firstValidIdx = 0;
  outer: for (let i = 0; i < (arrays[0]?.length ?? 0); i++) {
    for (const arr of arrays) {
      if (arr[i] !== null && arr[i] !== undefined) {
        firstValidIdx = i;
        break outer;
      }
    }
  }
  return arrays.map((arr) => arr.slice(firstValidIdx));
}

/**
 * Converts Excel serial date numbers (e.g. 42825) to a "FY" label.
 * Screener's report dates are fiscal year-end dates; we label by the
 * calendar year the date falls in, prefixed "FY" to match Indian
 * fiscal-year convention used throughout this app.
 */
function excelSerialToFYLabel(serial) {
  if (!serial) return null;
  const epoch = new Date(1899, 11, 30);
  const date = new Date(epoch.getTime() + serial * 86400000);
  return `FY${String(date.getFullYear()).slice(-2)}`;
}

/**
 * Main entry point. Pass the raw ArrayBuffer of an uploaded .xlsx file.
 * Returns { stockFundamentals, warnings } where stockFundamentals matches
 * the `fundamentals` block of the Stock schema (see docs/DATA_SCHEMA.md),
 * and warnings is a list of human-readable strings to show in the
 * upload preview screen — never silently swallow these.
 */
function parseScreenerFile(arrayBuffer, XLSX) {
  const warnings = [];
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  if (!workbook.SheetNames.includes("Data Sheet")) {
    return {
      stockFundamentals: null,
      warnings: ["Could not find a 'Data Sheet' tab — this may not be a Screener export, or Screener has changed its template."],
    };
  }

  const sheet = workbook.Sheets["Data Sheet"];
  const idx = indexSheetByRowLabel(sheet, XLSX);

  const getFirst = (label) => idx[label]?.[0] ?? null;

  const companyNameRow = getFirst(ROW_LABELS.companyName);
  const companyName = companyNameRow?.[0] ?? null;
  if (!companyName) warnings.push("Company name not found — check this is a Screener Data Sheet export.");

  const currentPrice = getFirst(ROW_LABELS.currentPrice)?.[0] ?? null;
  const marketCap = getFirst(ROW_LABELS.marketCap)?.[0] ?? null;
  // The dedicated "Number of shares" snapshot row is consistently
  // blank across real Screener exports (confirmed against multiple
  // real files) — it's a parser/template quirk, not a per-stock
  // anomaly. The actual share count lives in the "No. of Equity
  // Shares" historical row instead (sharesOutstandingHistory below),
  // so this snapshot field is derived from that array's last valid
  // entry rather than read directly. The raw row is still attempted
  // first in case some export does populate it.
  const sharesOutstandingSnapshotRaw = getFirst(ROW_LABELS.numberOfShares)?.[0] ?? null;

  // Annual P&L block — first occurrence of "Report Date" under PROFIT & LOSS
  const plReportDates = idx[ROW_LABELS.plReportDate]?.[0] ?? [];
  const years = plReportDates.map(excelSerialToFYLabel);

  const sales = getFirst(ROW_LABELS.sales) ?? [];
  const netProfit = getFirst(ROW_LABELS.netProfit) ?? [];
  const dividendAmount = getFirst(ROW_LABELS.dividendAmount) ?? [];
  const equityShareCapital = getFirst(ROW_LABELS.equityShareCapital) ?? [];
  const reserves = getFirst(ROW_LABELS.reserves) ?? [];
  const borrowings = getFirst(ROW_LABELS.borrowings) ?? [];
  const operatingCashFlow = getFirst(ROW_LABELS.cashFromOperating) ?? [];
  const investingCashFlow = getFirst(ROW_LABELS.cashFromInvesting) ?? [];
  const financingCashFlow = getFirst(ROW_LABELS.cashFromFinancing) ?? [];
  const receivables = getFirst(ROW_LABELS.receivables) ?? [];
  const inventory = getFirst(ROW_LABELS.inventory) ?? [];
  const cashAndBank = getFirst(ROW_LABELS.cashAndBank) ?? [];
  const sharesOutstandingHistory = getFirst(ROW_LABELS.noOfEquityShares) ?? [];
  const priceAtYearEnd = getFirst(ROW_LABELS.price) ?? [];

  // Use the snapshot row if it happened to be populated, otherwise
  // fall back to the most recent non-null value in the historical
  // array — see the comment above sharesOutstandingSnapshotRaw.
  const lastValidShareCount = [...sharesOutstandingHistory].reverse().find((v) => v !== null && v !== undefined);
  const sharesOutstandingRaw = sharesOutstandingSnapshotRaw ?? lastValidShareCount ?? null;
  if (sharesOutstandingSnapshotRaw === null && lastValidShareCount) {
    warnings.push("Shares outstanding taken from historical data (most recent year) since the snapshot field was blank in this export.");
  }

  // "Total" appears multiple times (assets total, liabilities total) —
  // the Balance Sheet section lists Total after liabilities first, then
  // again after assets, in that exact order in Screener's template.
  const totalOccurrences = idx[ROW_LABELS.total] ?? [];
  const totalAssets = totalOccurrences[1] ?? totalOccurrences[0] ?? [];
  if (totalOccurrences.length < 2) {
    warnings.push("Could not confidently distinguish liabilities total from assets total — totalAssets may be inaccurate.");
  }

  const expectedFields = { sales, netProfit, equityShareCapital, reserves, borrowings };
  for (const [name, arr] of Object.entries(expectedFields)) {
    if (!arr || arr.length === 0) {
      warnings.push(`Missing or empty field: ${name}. This metric will show as N/A.`);
    }
  }

  if (!operatingCashFlow.length) {
    warnings.push("Cash flow data not found — Cash EPS gap and FCF yield will be unavailable.");
  }

  // promoter holding / pledging are confirmed absent from this export —
  // always surface that clearly rather than silently leaving them blank.
  warnings.push("Promoter holding and pledging are not in the Screener export — fetch these from NSE or enter manually.");

  const stockFundamentals = {
    source: "screener_export",
    lastUpdated: new Date().toISOString().slice(0, 10),
    currentPrice,
    marketCap,
    sharesOutstanding: sharesOutstandingRaw,
    annual: {
      years,
      sales,
      netProfit,
      dividendAmount,
      equityShareCapital,
      reserves,
      borrowings,
      totalAssets,
      receivables,
      inventory,
      cashAndBank,
      sharesOutstandingHistory,
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      priceAtYearEnd,
    },
  };

  return { stockFundamentals, companyName, warnings };
}

const screenerParserExports = { parseScreenerFile, excelSerialToFYLabel, ROW_LABELS };

if (typeof module !== "undefined" && module.exports) {
  module.exports = screenerParserExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, screenerParserExports);
}
