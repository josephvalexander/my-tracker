/**
 * seedSampleData.js
 *
 * NOT loaded by index.html. Paste this into the browser devtools
 * console after opening the app once (so IndexedDB is initialized) to
 * seed one real stock (Caplin Point, from the actual Screener export
 * you provided) so you can see every screen working against real
 * numbers instead of an empty watchlist.
 *
 * To use: open the app in a browser, open devtools console, paste this
 * entire file's contents, press enter, then reload the page.
 */

(async function seed() {
  const stock = {
    ticker: "CAPLIPOINT",
    name: "Caplin Point Laboratories Ltd",
    sector: "Pharma",
    status: "active",
    addedDate: "2026-03-12",
    archivedDate: null,
    archiveReason: null,
    qualitative: {
      business: "Sells generic medicines directly to hospitals and pharmacies across Latin America and Africa, instead of through local distributors.",
      moatDescription: "Regulatory barrier — drug approvals in these markets take competitors 3-5 years to replicate.",
      moatTags: ["regulatory_barrier", "switching_costs"],
      marketPosition: "Leader in B2B branded generics across LATAM — few listed Indian peers operate at this scale there.",
      marketPositionTag: "leader",
    },
    targetEntryPrice: 1890,
    fundamentals: {
      source: "screener_export",
      lastUpdated: "2026-06-12",
      currentPrice: 2407.85,
      marketCap: 18302.46,
      sharesOutstanding: 76011696,
      annual: {
        years: ["FY17", "FY18", "FY19", "FY20", "FY21", "FY22", "FY23", "FY24", "FY25", "FY26"],
        sales: [401.65, 539.84, 648.69, 863.2, 1061.29, 1269.41, 1466.73, 1694.1, 1937.47, 2187.19],
        netProfit: [95.61, 144.79, 176.57, 215.01, 242.27, 299.84, 376.26, 457.09, 536.31, 641.24],
        dividendAmount: [11.34, 15.12, 16.64, 18.91, 22.7, 30.32, 34.16, 37.98, 45.6, 30.4],
        equityShareCapital: [15.12, 15.12, 15.13, 15.13, 15.13, 15.16, 15.18, 15.19, 15.2, 15.2],
        reserves: [209.65, 348.71, 581.86, 858.2, 954.13, 1252.2, 1648.73, 2083.95, 2618.72, 3571.22],
        borrowings: [0.73, 0.53, 36.46, 113.19, 234.96, 218.7, 222.05, 218.54, 221.62, 4.61],
        totalAssets: [358.38, 500.45, 742.52, 1125.75, 1363.61, 1736.32, 2191.4, 2698.12, 3207.85, 4045.48],
        receivables: [33.02, 125.88, 159.81, 228.96, 279.36, 317.05, 394.06, 542.72, 632.49, 825.81],
        inventory: [22.29, 28.46, 37.45, 238.23, 179.01, 227.31, 288.22, 363.04, 336.1, 428.86],
        cashAndBank: [93.07, 79.28, 152.99, 223.43, 438.33, 462.99, 493.48, 552.74, 591.41, 621.04],
        sharesOutstandingHistory: [75576750, 75603500, 75630250, 75642750, 75642750, 75788876, 75902746, 75941746, 76011696, null],
        operatingCashFlow: [67.61, 66.49, 83.42, 44.68, 268.61, 336.73, 271.37, 318.39, 432.37, 523.23],
        investingCashFlow: [-36.11, -69.03, -99.73, -54.33, -29.68, -376.86, -216.4, -319.18, -333.3, -582.29],
        financingCashFlow: [-6.74, -11.6, 89.79, 79.77, -23.98, -40.68, -28.17, -38.07, -38.32, -46.46],
        priceAtYearEnd: [388.35, 569.55, 401.7, 282.4, 403.45, 678.2, 595.95, 1315.35, 1999.8, 1504.8],
      },
      quarterly: {
        quarters: ["Q1FY25", "Q2FY25", "Q3FY25", "Q4FY25", "Q1FY26", "Q2FY26", "Q3FY26", "Q4FY26"],
        sales: [435.5, 453.22, 458.96, 483.1, 492.96, 502.45, 510.22, 600.16],
        netProfit: [117.2, 121.59, 123.97, 130.8, 138.96, 142.57, 152.8, 170.11],
        operatingProfit: [142.28, 145.23, 151.81, 164.66, 162.28, 168.06, 177.76, 204.24],
      },
    },
    shareholding: {
      source: "manual",
      lastUpdated: "2026-04-05",
      history: [
        { quarter: "Q1FY25", promoter: 53.1, fii: 13.2, dii: 8.1, public: 25.6, pledged: 0 },
        { quarter: "Q4FY26", promoter: 52.4, fii: 14.1, dii: 8.7, public: 24.8, pledged: 0 },
      ],
    },
    bulkDeals: { source: null, lastUpdated: null, deals: [] },
    corporateActions: {
      source: "manual",
      lastUpdated: "2026-04-05",
      actions: [
        { date: "2023-08-14", type: "bonus", ratio: "1:1" },
        { date: "2021-03-03", type: "split", ratio: "1:2" },
      ],
    },
    priceContext: {
      source: "manual",
      lastUpdated: "2026-06-18",
      week52High: 2050,
      week52Low: 1510,
      allTimeHigh: 2407.85,
      allTimeLow: 180,
      peHistory5y: { min: 18, max: 32, current: 28 },
    },
    intrinsicValue: { low: 2100, high: 2300, method: "dcf", lastCalculated: "2026-06-12" },
    notes: [
      { date: "2026-06-12", cmpAtTime: 1795, tag: "watching", text: "Q4 results came in line. Margin held at 22%. Sticking with target." },
      { date: "2026-03-03", cmpAtTime: 1920, tag: "research", text: "Initial deep dive. Regulatory moat is real." },
    ],
    thesis: {
      text: "Yes. Regulatory-moat distributor model in LATAM generics, zero debt, promoter-run with skin in the game.",
      lastUpdated: "2026-06-12",
    },
  };

  await StockStore.set(stock.ticker, stock);
  await HoldingStore.set("CAPLIPOINT", { ticker: "CAPLIPOINT", quantity: 120, avgBuyPrice: 1520 });

  console.log("Seeded Caplin Point. Reload the page to see it in the watchlist.");
})();
