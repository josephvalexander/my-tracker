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

function peakPercentile(stock) {
  const band = stock?.priceContext?.peHistory5y;
  if (!band || band.max === band.min) return null;
  return ((band.current - band.min) / (band.max - band.min)) * 100;
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
    let entryZoneCount = 0;
    const triageItems = [];

    stocks.forEach((s) => {
      const verdict = deriveVerdict(s);
      if (verdict.verdict === "Yes") passCount++;

      const zone = entryZoneStatus(s);
      if (zone?.inZone) {
        entryZoneCount++;
        triageItems.push({ ticker: s.ticker, type: "good", text: `In entry zone, ${Math.abs(zone.pctFromTarget).toFixed(0)}% below target` });
      }
      if (verdict.verdict === "No") {
        triageItems.push({ ticker: s.ticker, type: "bad", text: `${verdict.hardFlags.length} hard flags · verdict: No` });
      }
    });

    document.getElementById("portfolio-summary").innerHTML = `
      <div class="metric-card-box"><div class="metric-card-label">Pass Buffett test</div><div class="metric-card-value text-good">${passCount} <span class="muted">of ${stocks.length}</span></div></div>
      <div class="metric-card-box"><div class="metric-card-label">In entry zone</div><div class="metric-card-value text-good">${entryZoneCount} <span class="muted">of ${stocks.length}</span></div></div>
      <div class="metric-card-box"><div class="metric-card-label">Flagged</div><div class="metric-card-value text-warning">${triageItems.filter((t) => t.type === "bad").length} <span class="muted">of ${stocks.length}</span></div></div>
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
      .map((s) => ({ ticker: s.ticker, percentile: peakPercentile(s) }))
      .filter((v) => v.percentile !== null)
      .sort((a, b) => a.percentile - b.percentile);

    document.getElementById("valuation-snapshot").innerHTML =
      valuations.length === 0
        ? `<span class="muted">No 5-year P/E band data yet for any stock.</span>`
        : valuations
            .map((v) => {
              const color = v.percentile < 40 ? "green" : v.percentile < 65 ? "yellow" : "red";
              return `
          <div class="valuation-row">
            <div class="valuation-row-top"><span>${v.ticker}</span><span class="text-${color}">${v.percentile.toFixed(0)}th percentile</span></div>
            <div class="valuation-track"><div class="valuation-dot" style="left:${v.percentile}%; background:var(--color-${color})"></div></div>
          </div>`;
            })
            .join("");
  },
};

registerScreen("portfolio", portfolioScreen);
