/**
 * screens/portfolio.js  (Analytics tab)
 *
 * Holdings-based analytics: Buffett checklist triage (holdings only),
 * sector and cap concentration (value-weighted by holdings),
 * and valuation snapshot of held stocks.
 */

function sectorBreakdown(stocksWithValues) {
  // Value-weighted: each stock's sector weighted by current holding value
  const totals = {};
  let grand = 0;
  stocksWithValues.forEach(({ stock, value }) => {
    const s = normalizeSector(stock.sector);
    totals[s] = (totals[s] || 0) + value;
    grand += value;
  });
  if (grand === 0) return [];
  return Object.entries(totals)
    .map(([sector, v]) => ({ sector, pct: (v / grand) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

function capBreakdown(stocksWithValues) {
  const totals = {};
  let grand = 0;
  stocksWithValues.forEach(({ stock, value }) => {
    const c = capCategory(stock);
    totals[c] = (totals[c] || 0) + value;
    grand += value;
  });
  if (grand === 0) return [];
  const ORDER = ["Large cap","Mid cap","Small cap","SME","Microcap","Unknown"];
  return ORDER.filter(c => totals[c])
    .map(c => ({ cat: c, pct: (totals[c] / grand) * 100 }));
}

const SECTOR_PALETTE = ["#534AB7","#378ADD","#1D9E75","#D85A30","#BA7517","#D4537E","#5DCAA5","#8B7EC8","#6BA3D6"];
const CAP_PALETTE = { "Large cap":"#534AB7","Mid cap":"#378ADD","Small cap":"#1D9E75","SME":"#D85A30","Microcap":"#BA7517","Unknown":"#B4B2A9" };

const portfolioScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Analytics</div>
        <div class="section-label">Buffett checklist — held stocks</div>
        <div id="portfolio-summary" class="metric-grid-3"></div>
        <div id="needs-attention" class="card" style="margin-bottom:14px;"></div>
        <div class="section-label">Sector concentration <span class="muted" style="font-size:11px;">value-weighted</span></div>
        <div id="sector-chart" class="card"></div>
        <div class="section-label">Market cap mix <span class="muted" style="font-size:11px;">value-weighted</span></div>
        <div id="cap-chart" class="card"></div>
        <div class="section-label">Valuation snapshot</div>
        <div id="valuation-snapshot" class="card"></div>
      </div>`;
  },

  async afterRender() {
    // Base data: holdings + their stock records
    const holdings    = await HoldingStore.getAll();
    const allStocks   = await StockStore.getAll();
    const stockMap    = {};
    allStocks.forEach(s => { stockMap[s.ticker] = s; });

    // Build list of held stocks with their current values
    const heldStocksWithValues = holdings
      .map(h => {
        const stock = stockMap[h.ticker];
        if (!stock) return null;
        const qty   = totalQuantity(h);
        const price = stock.fundamentals?.currentPrice ?? 0;
        const value = qty * price;
        return { stock, holding: h, qty, value };
      })
      .filter(Boolean);

    const heldStocks = heldStocksWithValues.map(h => h.stock);

    // ── Buffett checklist summary ─────────────────────────────────
    let passCount = 0;
    const triageItems = [];
    heldStocks.forEach(s => {
      const verdict = deriveVerdict(s);
      if (verdict.verdict === "Yes") passCount++;
      if (verdict.verdict === "No") {
        const parts = [];
        if (verdict.hardFlags.length > 0) parts.push(`${verdict.hardFlags.length} hard flag${verdict.hardFlags.length === 1 ? "" : "s"}`);
        if (verdict.softFlags.length > 0) parts.push(`${verdict.softFlags.length} soft flag${verdict.softFlags.length === 1 ? "" : "s"}`);
        triageItems.push({ ticker: s.ticker, name: s.name || s.ticker, text: parts.join(" · ") + " · verdict: No" });
      }
    });

    document.getElementById("portfolio-summary").innerHTML = `
      <div class="metric-card-box"><div class="metric-card-label">Pass Buffett</div><div class="metric-card-value text-good">${passCount} <span class="muted">of ${heldStocks.length}</span></div></div>
      <div class="metric-card-box"><div class="metric-card-label">Flagged</div><div class="metric-card-value text-warning">${triageItems.length} <span class="muted">of ${heldStocks.length}</span></div></div>
      <div class="metric-card-box"><div class="metric-card-label">Held</div><div class="metric-card-value">${heldStocks.length}</div></div>
    `;

    const needsEl = document.getElementById("needs-attention");
    if (triageItems.length === 0) {
      needsEl.innerHTML = `<span class="muted">All held stocks pass the Buffett checklist.</span>`;
    } else {
      needsEl.innerHTML = triageItems.map(item => `
        <div class="triage-row" onclick="window.location.hash='#stock/${encodeURIComponent(item.ticker)}'">
          <span style="color:var(--color-red); font-size:10px; flex-shrink:0;">●</span>
          <div>
            <div class="stock-name">${item.name}</div>
            <div class="muted" style="font-size:11px;">${item.text}</div>
          </div>
        </div>`).join("");
    }

    // ── Sector concentration (value-weighted) ─────────────────────
    const breakdown = sectorBreakdown(heldStocksWithValues);
    const sectorEl  = document.getElementById("sector-chart");
    if (breakdown.length === 0) {
      sectorEl.innerHTML = `<span class="muted">No holdings with price data yet.</span>`;
    } else {
      sectorEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div style="width:150px; height:150px; flex-shrink:0;"><canvas id="sector-pie"></canvas></div>
          <div style="flex:1; min-width:140px;">
            ${breakdown.map((b, i) => `
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:5px; font-size:12px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${SECTOR_PALETTE[i%SECTOR_PALETTE.length]};flex-shrink:0;display:inline-block;"></span>
                <span style="flex:1;">${b.sector}</span>
                <span class="muted">${b.pct.toFixed(0)}%</span>
              </div>`).join("")}
          </div>
        </div>`;
      new Chart(document.getElementById("sector-pie"), {
        type: "pie",
        data: { labels: breakdown.map(b=>b.sector), datasets: [{ data: breakdown.map(b=>b.pct), backgroundColor: breakdown.map((_,i)=>SECTOR_PALETTE[i%SECTOR_PALETTE.length]), borderWidth: 2, borderColor: "var(--color-surface)" }] },
        options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>` ${ctx.label}: ${ctx.parsed.toFixed(0)}%`}} } },
      });
    }

    // ── Cap mix (value-weighted) ──────────────────────────────────
    const caps  = capBreakdown(heldStocksWithValues);
    const capEl = document.getElementById("cap-chart");
    if (caps.length === 0) {
      capEl.innerHTML = `<span class="muted">No holdings with price data yet.</span>`;
    } else {
      capEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div style="width:130px; height:130px; flex-shrink:0;"><canvas id="cap-pie"></canvas></div>
          <div style="flex:1; min-width:120px;">
            ${caps.map(c => `
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; font-size:13px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${CAP_PALETTE[c.cat]};flex-shrink:0;display:inline-block;"></span>
                <span style="flex:1;">${c.cat}</span>
                <span class="muted">${c.pct.toFixed(0)}%</span>
              </div>`).join("")}
          </div>
        </div>`;
      new Chart(document.getElementById("cap-pie"), {
        type: "pie",
        data: { labels: caps.map(c=>c.cat), datasets: [{ data: caps.map(c=>c.pct), backgroundColor: caps.map(c=>CAP_PALETTE[c.cat]), borderWidth: 2, borderColor: "var(--color-surface)" }] },
        options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>` ${ctx.label}: ${ctx.parsed.toFixed(0)}%`}} } },
      });
    }

    // ── Valuation snapshot ────────────────────────────────────────
    const valuations = heldStocks
      .map(s => ({ ticker: s.ticker, name: s.name || s.ticker, pe: s.priceContext?.peTTM ?? null, sectorPE: s.priceContext?.sectorPE ?? null }))
      .filter(v => v.pe !== null)
      .sort((a, b) => a.pe - b.pe);

    document.getElementById("valuation-snapshot").innerHTML = valuations.length === 0
      ? `<span class="muted">No P/E data yet — will appear after indianapi fetch for each held stock.</span>`
      : `<table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <td class="muted" style="font-size:11px; padding-bottom:6px;">Stock</td>
            <td class="muted" style="font-size:11px; text-align:right;">P/E (TTM)</td>
            <td class="muted" style="font-size:11px; text-align:right;">Sector P/E</td>
            <td class="muted" style="font-size:11px; text-align:right;">vs Sector</td>
          </tr></thead>
          <tbody>
            ${valuations.map(v => {
              const peCls = v.pe < 15 ? "text-good" : v.pe < 30 ? "" : "text-warning";
              const diff  = v.pe != null && v.sectorPE != null ? ((v.pe - v.sectorPE) / v.sectorPE * 100) : null;
              const diffStr = diff !== null
                ? `<span style="color:${diff>20?"var(--color-red)":diff<-10?"var(--color-green)":"var(--color-text-secondary)"}">${diff>=0?"+":""}${diff.toFixed(0)}%</span>`
                : `<span class="muted">—</span>`;
              return `<tr style="border-bottom:0.5px solid var(--color-border);">
                <td style="padding:5px 0; font-size:13px;">${v.name}</td>
                <td class="${peCls}" style="text-align:right; font-size:13px;">${v.pe.toFixed(1)}x</td>
                <td class="muted" style="text-align:right; font-size:13px;">${v.sectorPE ? v.sectorPE.toFixed(1)+"x" : "—"}</td>
                <td style="text-align:right; font-size:13px;">${diffStr}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`;
  },
};

registerScreen("portfolio", portfolioScreen);
