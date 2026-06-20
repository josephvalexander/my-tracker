/**
 * screens/stockSector.js
 *
 * Compares a stock's key ratios against a manually-set sector median
 * benchmark (see Settings → Sector benchmarks). There's no free,
 * reliable source for "sector median ROE" as a live-fetchable number —
 * this stays a once-a-year manual figure you set yourself, same as
 * discussed in planning.
 */

function dotPosition(value, benchmark, lowerIsBetter = false) {
  // Position the dot on a 0-100 track where 50 = benchmark, scaled
  // loosely so a stock 2x the benchmark sits near the right edge.
  if (value === null || value === undefined || !benchmark) return null;
  const ratio = value / benchmark;
  let pct = 50 + (ratio - 1) * 50;
  if (lowerIsBetter) pct = 100 - pct;
  return Math.max(4, Math.min(96, pct));
}

const stockSectorScreen = {
  async render(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }

    const benchmarks = (await MetaStore.getSectorBenchmarks()) || {};
    const sectorBench = stock.sector ? benchmarks[stock.sector] : null;

    if (!sectorBench) {
      return `
        <div class="screen-padding">
          <div class="detail-header">
            <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
            <div class="detail-title"><div class="detail-name">vs sector</div></div>
          </div>
          <div class="empty-state">
            No sector benchmark set for "${stock.sector || "this stock's sector"}" yet.<br/>
            <button class="btn btn-small" style="margin-top:10px;" onclick="window.location.hash='#settings/sectorBenchmarks'">Set sector benchmarks</button>
          </div>
        </div>`;
    }

    const roe = roe5yAvg(stock);
    const de = debtToEquity(stock);
    const cagr = epsCagr(stock);
    const fcfY = fcfYield(stock);

    const rows = [
      { label: "ROE", value: roe, bench: sectorBench.roe, fmt: (v) => formatPct(v), lowerIsBetter: false },
      { label: "D/E", value: de, bench: sectorBench.de, fmt: (v) => formatRatio(v), lowerIsBetter: true },
      { label: "EPS CAGR (5y)", value: cagr, bench: sectorBench.epsCagr, fmt: (v) => formatPct(v), lowerIsBetter: false },
      { label: "FCF yield (approx.)", value: fcfY?.value ?? null, bench: sectorBench.fcfYield, fmt: (v) => formatPct(v, 1), lowerIsBetter: false },
    ];

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
          <div class="detail-title">
            <div class="detail-name">vs sector</div>
            <div class="detail-meta">${stock.name || ticker} · ${stock.sector} sector median</div>
          </div>
        </div>

        ${rows
          .map((r) => {
            const pos = dotPosition(r.value, r.bench, r.lowerIsBetter);
            const good = r.lowerIsBetter ? r.value <= r.bench : r.value >= r.bench;
            const color = r.value === null ? "tertiary" : good ? "green" : "yellow";
            return `
            <div class="sector-row-card">
              <div class="sector-row-top">
                <span>${r.label}</span>
                <span class="muted">sector median ${r.fmt(r.bench)}</span>
              </div>
              <div class="sector-track">
                ${pos !== null ? `<div class="sector-tick"></div><div class="sector-dot" style="left:${pos}%; background:var(--color-${color})"></div>` : ""}
              </div>
              <div class="sector-row-bottom"><span class="text-${color}">${r.fmt(r.value)}</span></div>
            </div>`;
          })
          .join("")}

        <div class="hint-box">Sector medians set once under Settings → Sector benchmarks. Update yearly.</div>
      </div>`;
  },
};

registerScreen("stockSector", stockSectorScreen);
