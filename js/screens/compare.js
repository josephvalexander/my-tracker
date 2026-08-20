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

      const rows = COMPARE_METRICS.map(m => {
        const valA = m.fn(a);
        const valB = m.fn(b);
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        const winner = m.good && !isNaN(numA) && !isNaN(numB)
          ? (m.good(numA, numB) ? "a" : "b") : null;
        const hlA = winner === "a" ? "color:var(--color-green); font-weight:600;" : "";
        const hlB = winner === "b" ? "color:var(--color-green); font-weight:600;" : "";
        return `
          <tr style="border-bottom:0.5px solid var(--color-border);">
            <td style="padding:7px 0; font-size:12px; color:var(--color-text-secondary);">${m.label}</td>
            <td style="padding:7px 4px; font-size:13px; text-align:right; ${hlA}">${valA}</td>
            <td style="padding:7px 4px; font-size:13px; text-align:right; ${hlB}">${valB}</td>
          </tr>`;
      }).join("");

      document.getElementById("compare-result").innerHTML = `
        <div class="card" style="padding:0; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--color-border);">
                <th style="padding:8px 0; font-size:11px; text-align:left; color:var(--color-text-tertiary); font-weight:500;">Metric</th>
                <th style="padding:8px 4px; font-size:12px; text-align:right; color:var(--color-text);">${a.name || a.ticker}</th>
                <th style="padding:8px 4px; font-size:12px; text-align:right; color:var(--color-text);">${b.name || b.ticker}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="muted" style="font-size:10px; margin-top:6px;">Green = better value on that metric</div>`;
    }

    document.getElementById("run-compare-btn").addEventListener("click", runCompare);
    runCompare(); // run on load with defaults
  },
};

registerScreen("compare", compareScreen);
