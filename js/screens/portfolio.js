/**
 * screens/portfolio.js
 *
 * Rollup dashboard: pass-rate, entry-zone count, review triage list,
 * sector concentration, and valuation percentile snapshot. Pure
 * aggregation over data already in StockStore — no new data sources.
 */

function sectorBreakdown(stocks) {
  const totals = {};
  stocks.forEach((s) => {
    const sector = s.sector || "Other";
    totals[sector] = (totals[sector] || 0) + 1;
  });
  const total = stocks.length;
  return Object.entries(totals)
    .map(([sector, count]) => ({ sector, pct: (count / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

const SECTOR_PALETTE = ["#85B7EB", "#5DCAA5", "#F0997B", "#B4B2A9", "#D4537E", "#FAC775"];

const portfolioScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Portfolio overview</div>
        <div id="portfolio-summary" class="metric-grid-3"></div>
        <div class="section-label">Needs your attention</div>
        <div id="triage-list" class="stock-list"></div>
        <div class="section-label">Sector concentration</div>
        <div id="sector-chart" class="card"></div>
        <div class="section-label">Valuation snapshot</div>
        <div id="valuation-snapshot" class="card"></div>
      </div>`;
  },

  async afterRender() {
    const stocks = await StockStore.getActive();

    let passCount = 0;
    const triageItems = [];

    stocks.forEach((s) => {
      const verdict = deriveVerdict(s);
      if (verdict.verdict === "Yes") passCount++;
      if (verdict.verdict === "No") {
        const parts = [];
        if (verdict.hardFlags.length > 0) parts.push(`${verdict.hardFlags.length} hard flag${verdict.hardFlags.length === 1 ? "" : "s"}`);
        if (verdict.softFlags.length > 0) parts.push(`${verdict.softFlags.length} soft flag${verdict.softFlags.length === 1 ? "" : "s"}`);
        triageItems.push({ ticker: s.ticker, type: "bad", text: parts.join(" · ") + " · verdict: No" });
      }
    });

    document.getElementById("portfolio-summary").innerHTML = `
      <div class="metric-card-box"><div class="metric-card-label">Pass Buffett test</div><div class="metric-card-value text-good">${passCount} <span class="muted">of ${stocks.length}</span></div></div>
      <div class="metric-card-box"><div class="metric-card-label">Flagged</div><div class="metric-card-value text-warning">${triageItems.filter((t) => t.type === "bad").length} <span class="muted">of ${stocks.length}</span></div></div>
      <div class="metric-card-box"><div class="metric-card-label">Watching</div><div class="metric-card-value">${stocks.length}</div></div>
    `;

    document.getElementById("triage-list").innerHTML =
      triageItems.length === 0
        ? `<div class="empty-state">Nothing needs attention right now.</div>`
        : triageItems
            .map(
              (item) => `
        <div class="triage-row" data-ticker="${item.ticker}">
          <span class="dot dot-${item.type === "good" ? "green" : "red"}"></span>
          <div>
            <div class="stock-name">${item.ticker}</div>
            <div class="stock-meta">${item.text}</div>
          </div>
        </div>`
            )
            .join("");

    document.querySelectorAll(".triage-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.hash = `#stock/${row.dataset.ticker}`;
      });
    });

    const breakdown = sectorBreakdown(stocks);
    document.getElementById("sector-chart").innerHTML = `
      <div class="sector-bar">
        ${breakdown.map((b, i) => `<div style="width:${b.pct}%; background:${SECTOR_PALETTE[i % SECTOR_PALETTE.length]}"></div>`).join("")}
      </div>
      <div class="sector-legend">
        ${breakdown.map((b, i) => `<span><span class="legend-dot" style="background:${SECTOR_PALETTE[i % SECTOR_PALETTE.length]}"></span>${b.sector} · ${b.pct.toFixed(0)}%</span>`).join("")}
      </div>`;

    const valuations = stocks
      .map((s) => ({
        ticker: s.ticker,
        name: s.name || s.ticker,
        pe: s.priceContext?.peTTM ?? null,
        sectorPE: s.priceContext?.sectorPE ?? null,
      }))
      .filter((v) => v.pe !== null)
      .sort((a, b) => a.pe - b.pe);

    document.getElementById("valuation-snapshot").innerHTML =
      valuations.length === 0
        ? `<span class="muted">No P/E data yet — will appear after indianapi fetch for each stock.</span>`
        : `<table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <td class="muted" style="font-size:11px; padding-bottom:6px;">Stock</td>
                <td class="muted" style="font-size:11px; text-align:right;">P/E (TTM)</td>
                <td class="muted" style="font-size:11px; text-align:right;">Sector P/E</td>
                <td class="muted" style="font-size:11px; text-align:right;">vs Sector</td>
              </tr>
            </thead>
            <tbody>
              ${valuations.map((v) => {
                const peCls = v.pe < 15 ? "text-good" : v.pe < 30 ? "" : "text-warning";
                const diff = (v.pe != null && v.sectorPE != null)
                  ? ((v.pe - v.sectorPE) / v.sectorPE * 100)
                  : null;
                const diffStr = diff !== null
                  ? `<span style="color:${diff > 20 ? "var(--color-red)" : diff < -10 ? "var(--color-green)" : "var(--color-text-secondary)"}">${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%</span>`
                  : `<span class="muted">—</span>`;
                return `<tr style="border-bottom:0.5px solid var(--color-border);">
                  <td style="padding:5px 0; font-size:13px;">${v.ticker}</td>
                  <td class="${peCls}" style="text-align:right; font-size:13px;">${v.pe.toFixed(1)}x</td>
                  <td class="muted" style="text-align:right; font-size:13px;">${v.sectorPE ? v.sectorPE.toFixed(1) + "x" : "—"}</td>
                  <td style="text-align:right; font-size:13px;">${diffStr}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>`;
  },
};

registerScreen("portfolio", portfolioScreen);
