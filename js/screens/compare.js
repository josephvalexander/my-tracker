/**
 * screens/compare.js
 *
 * Side-by-side comparison of two watchlisted stocks across
 * all key Buffett metrics, valuation, and qualitative fields.
 */

const COMPARE_METRICS = [
  { label: "ROE (5y avg)", fn: (s) => { const v = roe5yAvg(s); return v !== null ? formatPct(v) : "—"; }, good: (a,b) => a > b },
  { label: "ROCE (5y avg)", fn: (s) => { const v = roce5yAvg(s); return v !== null ? formatPct(v) : "—"; }, good: (a,b) => a > b },
  { label: "EPS CAGR (5y)", fn: (s) => { const v = epsCagr(s); return v !== null ? formatPct(v) : "—"; }, good: (a,b) => a > b },
  { label: "D/E", fn: (s) => { const v = debtToEquity(s); return v !== null ? v.toFixed(2) : "—"; }, good: (a,b) => a < b },
  { label: "P/E (TTM)", fn: (s) => s.priceContext?.peTTM?.toFixed(1) ?? "—", good: (a,b) => a < b },
  { label: "Sector P/E", fn: (s) => s.priceContext?.sectorPE?.toFixed(1) ?? "—", good: () => null },
  { label: "Market cap", fn: (s) => s.fundamentals?.marketCap ? "₹" + Math.round(s.fundamentals.marketCap).toLocaleString("en-IN") + " Cr" : "—", good: () => null },
  { label: "Cap category", fn: (s) => capCategory(s), good: () => null },
  { label: "Sector", fn: (s) => normalizeSector(s.sector), good: () => null },
  { label: "Earnings consistency", fn: (s) => { const v = earningsConsistencyScore(s); return v !== null ? `${v}/6` : "—"; }, good: (a,b) => a > b },
  { label: "Promoter holding", fn: (s) => { const h = s.shareholding?.history?.slice(-1)?.[0]; return h?.promoter ? h.promoter.toFixed(1)+"%" : "—"; }, good: (a,b) => a > b },
  { label: "Verdict", fn: (s) => { const v = deriveVerdict(s); return v.verdict; }, good: () => null },
];


// Helper: sum last 12 months of distributions (same logic as stockDetail reitQualityCard)
function _annualDist(stock) {
  return (stock.corporateActions?.dividends || [])
    .filter(d => {
      if (!d.recordDate) return false;
      const ago = (Date.now() - new Date(d.recordDate)) / 86400000;
      return ago >= 0 && ago <= 366;
    })
    .reduce((sum, d) => sum + (d.amount || 0), 0);
}

// Helper: distribution coverage from CFO per share / annual dist per unit
function _distCoverage(stock) {
  const cfs = stock.priceContext?.cashFlowPerShare;
  const dist = _annualDist(stock);
  return (cfs && dist) ? cfs / dist : null;
}

const REIT_COMPARE_METRICS = [
  {
    label: "Type",
    fn: (s) => s.reitType || "REIT",
    good: () => null,
  },
  {
    label: "Asset class",
    fn: (s) => s.reitAssetClass || "—",
    good: () => null,
  },
  {
    label: "Distribution yield (LTM)",
    fn: (s) => {
      const v = s.priceContext?.distributionYield;
      return v != null ? v.toFixed(2) + "%" : "—";
    },
    numFn: (s) => s.priceContext?.distributionYield ?? null,
    good: (a, b) => a > b,
  },
  {
    label: "Annual dist / unit (LTM)",
    fn: (s) => {
      const v = _annualDist(s);
      return v ? "₹" + v.toFixed(2) : "—";
    },
    numFn: (s) => _annualDist(s) || null,
    good: (a, b) => a > b,
  },
  {
    label: "Distribution coverage",
    fn: (s) => {
      const v = _distCoverage(s);
      return v != null ? v.toFixed(2) + "x" : "—";
    },
    numFn: (s) => _distCoverage(s),
    good: (a, b) => a > b,
  },
  {
    label: "Gearing (D/E)",
    fn: (s) => {
      const v = s.priceContext?.gearing;
      return v != null ? v.toFixed(2) + "x" : "—";
    },
    numFn: (s) => s.priceContext?.gearing ?? null,
    good: (a, b) => a < b,
  },
  {
    label: "Interest coverage",
    fn: (s) => {
      const v = s.priceContext?.interestCoverage;
      return v != null ? v.toFixed(2) + "x" : "—";
    },
    numFn: (s) => s.priceContext?.interestCoverage ?? null,
    good: (a, b) => a > b,
  },
  {
    label: "Operating margin",
    fn: (s) => {
      const v = s.priceContext?.operatingMargin;
      return v != null ? v.toFixed(1) + "%" : "—";
    },
    numFn: (s) => s.priceContext?.operatingMargin ?? null,
    good: (a, b) => a > b,
  },
  {
    label: "Market cap",
    fn: (s) => s.fundamentals?.marketCap
      ? "₹" + Math.round(s.fundamentals.marketCap).toLocaleString("en-IN") + " Cr"
      : "—",
    good: () => null,
  },
  {
    label: "Income quality",
    fn: (s) => {
      const v = reitQualityVerdict(s);
      return v.isGood ? "Good" : v.verdict;
    },
    good: () => null,
  },
];

const compareScreen = {
  async render() {
    const stocks = await StockStore.getActive();
    if (stocks.length < 2) return `<div class="screen-padding"><div class="empty-state">Add at least 2 stocks to use compare.</div></div>`;

    const opts = stocks.map(s => `<option value="${s.ticker}">${s.name || s.ticker}</option>`).join("");
    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="history.back()">&larr;</button>
          <div class="detail-title"><div class="detail-name">Compare stocks</div></div>
        </div>
        <div class="card" style="display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:120px;">
            <label class="muted" style="font-size:11px;">Stock A</label>
            <select id="compare-a" style="width:100%; margin-top:4px; font-size:13px; padding:5px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);">${opts}</select>
          </div>
          <div style="flex:1; min-width:120px;">
            <label class="muted" style="font-size:11px;">Stock B</label>
            <select id="compare-b" style="width:100%; margin-top:4px; font-size:13px; padding:5px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);">${opts}</select>
          </div>
          <div style="display:flex; align-items:flex-end;">
            <button id="run-compare-btn" class="btn btn-primary">Compare</button>
          </div>
        </div>
        <div id="compare-result"></div>
      </div>`;
  },

  async afterRender() {
    const stocks   = await StockStore.getActive();
    const stockMap = {};
    stocks.forEach(s => { stockMap[s.ticker] = s; });

    // Default second selector to second stock
    const selA = document.getElementById("compare-a");
    const selB = document.getElementById("compare-b");
    if (stocks.length >= 2) selB.value = stocks[1].ticker;

    function runCompare() {
      const a = stockMap[selA.value];
      const b = stockMap[selB.value];
      if (!a || !b || a.ticker === b.ticker) {
        document.getElementById("compare-result").innerHTML = `<div class="muted">Pick two different stocks.</div>`;
        return;
      }

      const aIsReit = a.board === "reit";
      const bIsReit = b.board === "reit";

      // Cross-category: equity vs REIT/InvIT — not meaningfully comparable
      if (aIsReit !== bIsReit) {
        document.getElementById("compare-result").innerHTML = `
          <div class="card" style="text-align:center; padding:24px 16px;">
            <div style="font-size:15px; font-weight:600; margin-bottom:8px;">Not comparable</div>
            <div class="muted" style="font-size:13px; line-height:1.6;">
              ${a.name || a.ticker} is ${aIsReit ? "a REIT/InvIT" : "an equity stock"} and
              ${b.name || b.ticker} is ${bIsReit ? "a REIT/InvIT" : "an equity stock"}.<br>
              These are different instrument types with different return drivers.<br>
              Compare equity vs equity, or REIT/InvIT vs REIT/InvIT.
            </div>
          </div>`;
        return;
      }

      // Pick the right metric set
      const metrics = (aIsReit && bIsReit) ? REIT_COMPARE_METRICS : COMPARE_METRICS;

      const rows = metrics.map(m => {
        const valA = m.fn(a);
        const valB = m.fn(b);
        // Use numFn if provided (avoids parseFloat misreading "₹" or "x" suffixes)
        const numA = m.numFn ? m.numFn(a) : parseFloat(valA);
        const numB = m.numFn ? m.numFn(b) : parseFloat(valB);
        const winner = m.good && numA != null && numB != null && !isNaN(numA) && !isNaN(numB)
          ? (m.good(numA, numB) ? "a" : "b") : null;
        const hlA = winner === "a" ? "color:var(--color-green); font-weight:600;" : "";
        const hlB = winner === "b" ? "color:var(--color-green); font-weight:600;" : "";
        return `
          <tr style="border-bottom:0.5px solid var(--color-border);">
            <td style="padding:8px 12px; font-size:12px; color:var(--color-text-secondary);">${m.label}</td>
            <td style="padding:8px 8px; font-size:13px; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${hlA}">${valA}</td>
            <td style="padding:8px 12px; font-size:13px; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${hlB}">${valB}</td>
          </tr>`;
      }).join("");

      const footnote = (aIsReit && bIsReit)
        ? "Green = better income quality on that metric"
        : "Green = better value on that metric";

      document.getElementById("compare-result").innerHTML = `
        <div class="card" style="padding:0; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <colgroup>
              <col style="width:38%">
              <col style="width:31%">
              <col style="width:31%">
            </colgroup>
            <thead>
              <tr style="border-bottom:1px solid var(--color-border);">
                <th style="padding:8px 12px; font-size:11px; text-align:left; color:var(--color-text-tertiary); font-weight:500;">Metric</th>
                <th style="padding:8px 8px; font-size:12px; text-align:right; color:var(--color-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a.name || a.ticker}</th>
                <th style="padding:8px 12px; font-size:12px; text-align:right; color:var(--color-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${b.name || b.ticker}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="muted" style="font-size:10px; margin-top:6px; padding:0 4px;">${footnote}</div>`;
    }

    document.getElementById("run-compare-btn").addEventListener("click", runCompare);
    runCompare(); // run on load with defaults
  },
};

registerScreen("compare", compareScreen);