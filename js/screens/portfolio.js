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
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="screen-title" style="margin:0;">Analytics</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-small" onclick="window.location.hash='#compare'">⇄ Compare</button>
            <button class="btn btn-small" onclick="window.location.hash='#calendar'">📅 Calendar</button>
          </div>
        </div>
        <div class="section-label">Buffett checklist — held stocks</div>
        <div id="portfolio-summary" class="metric-grid-3"></div>
        <div id="needs-attention" class="card" style="margin-bottom:14px;"></div>
        <div class="section-label">Portfolio growth</div>
        <div id="portfolio-growth" class="card"></div>
        <div class="section-label collapsible-header" id="sizing-header" style="cursor:pointer; display:flex; justify-content:space-between;">
          Position sizing <span class="muted" style="font-size:11px;" id="sizing-chevron">▶ expand</span>
        </div>
        <div id="position-sizing-wrap" style="display:none;">
          <div id="position-sizing" class="card"></div>
        </div>
        <div class="section-label collapsible-header" id="earnings-header" style="cursor:pointer; display:flex; justify-content:space-between;">
          Earnings season <span class="muted" style="font-size:11px;" id="earnings-chevron">▶ expand</span>
        </div>
        <div id="earnings-season-wrap" style="display:none;">
          <div id="earnings-season" class="card"></div>
        </div>
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

    // ── Portfolio growth YoY / QoQ ────────────────────────────────
    const growthEl = document.getElementById("portfolio-growth");
    const totalCurrentValue = heldStocksWithValues.reduce((s, h) => s + h.value, 0);
    const totalInvested     = holdings.reduce((s, h) => s + investedValue(h), 0);
    const overallReturn     = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested * 100) : null;

    // QoQ/YoY: derived from quarterly revenue of held stocks (weighted by portfolio value)
    // Sum latest quarter revenue vs previous quarter and vs same quarter last year
    let totalRevQ  = 0, totalRevPrevQ = 0, totalRevYoY = 0, revenueCount = 0;
    for (const { stock } of heldStocksWithValues) {
      const q = stock.fundamentals?.quarterly;
      if (!q?.revenue?.length || q.revenue.length < 2) continue;
      const latest = q.revenue[q.revenue.length - 1];
      const prevQ  = q.revenue[q.revenue.length - 2];
      const sameQLastYear = q.revenue.length >= 5 ? q.revenue[q.revenue.length - 5] : null;
      if (latest != null && prevQ != null) {
        totalRevQ += latest; totalRevPrevQ += prevQ; revenueCount++;
      }
      if (latest != null && sameQLastYear != null) totalRevYoY += sameQLastYear;
    }
    const qoq = revenueCount > 0 && totalRevPrevQ > 0 ? ((totalRevQ - totalRevPrevQ) / totalRevPrevQ * 100) : null;
    const yoy = revenueCount > 0 && totalRevYoY > 0  ? ((totalRevQ - totalRevYoY)  / totalRevYoY  * 100) : null;

    growthEl.innerHTML = `
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:100px;">
          <div class="muted" style="font-size:11px;">Portfolio P&amp;L
            <span class="tooltip-wrap" style="position:relative; display:inline-block; margin-left:3px; cursor:help;">
              <span style="font-size:9px; border:0.5px solid var(--color-border); border-radius:50%; padding:0 3px; color:var(--color-text-tertiary);">?</span>
              <span class="tooltip-box" style="display:none; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); width:200px; background:var(--color-text); color:var(--color-surface); font-size:10px; padding:7px 9px; border-radius:6px; z-index:99; line-height:1.4;">
                (Current value − Amount invested) ÷ Amount invested. Simple return on your total cost basis — not time-adjusted. Treats all purchases the same regardless of when you bought. Use XIRR in Holdings for a time-adjusted view.
              </span>
            </span>
          </div>
          <div style="font-size:16px; font-weight:600; color:var(${overallReturn>=0?"--color-green":"--color-red"});">${overallReturn!==null?(overallReturn>=0?"+":"")+overallReturn.toFixed(1)+"%":"—"}</div>
          <div class="muted" style="font-size:10px;">vs cost basis</div>
        </div>
        <div style="flex:1; min-width:100px;">
          <div class="muted" style="font-size:11px;">Revenue QoQ
            <span class="tooltip-wrap" style="position:relative; display:inline-block; margin-left:3px; cursor:help;">
              <span style="font-size:9px; border:0.5px solid var(--color-border); border-radius:50%; padding:0 3px; color:var(--color-text-tertiary);">?</span>
              <span class="tooltip-box" style="display:none; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); width:210px; background:var(--color-text); color:var(--color-surface); font-size:10px; padding:7px 9px; border-radius:6px; z-index:99; line-height:1.4;">
                Sum of latest quarter revenue across all held stocks vs the previous quarter. Treats your holdings as one combined business. Weighted by company revenue size, not your position size. Shows short-term momentum but can be noisy due to seasonality.
              </span>
            </span>
          </div>
          <div style="font-size:16px; font-weight:600; color:var(${qoq>=0?"--color-green":"--color-red"});">${qoq!==null?(qoq>=0?"+":"")+qoq.toFixed(1)+"%":"—"}</div>
          <div class="muted" style="font-size:10px;">aggregate held stocks</div>
        </div>
        <div style="flex:1; min-width:100px;">
          <div class="muted" style="font-size:11px;">Revenue YoY
            <span class="tooltip-wrap" style="position:relative; display:inline-block; margin-left:3px; cursor:help;">
              <span style="font-size:9px; border:0.5px solid var(--color-border); border-radius:50%; padding:0 3px; color:var(--color-text-tertiary);">?</span>
              <span class="tooltip-box" style="display:none; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); width:210px; background:var(--color-text); color:var(--color-surface); font-size:10px; padding:7px 9px; border-radius:6px; z-index:99; line-height:1.4;">
                Latest quarter revenue vs the same quarter one year ago, across all held stocks. Removes seasonal effects — a retailer's Diwali quarter will always look good QoQ, but YoY comparison is fair. The most meaningful growth signal for your quarterly review.
              </span>
            </span>
          </div>
          <div style="font-size:16px; font-weight:600; color:var(${yoy>=0?"--color-green":"--color-red"});">${yoy!==null?(yoy>=0?"+":"")+yoy.toFixed(1)+"%":"—"}</div>
          <div class="muted" style="font-size:10px;">aggregate held stocks</div>
        </div>
      </div>`;

    // ── Position sizing ───────────────────────────────────────────────
    const sizingEl = document.getElementById("position-sizing");
    const sizingRows = heldStocksWithValues
      .map(({ stock, value }) => {
        const pct    = totalCurrentValue > 0 ? (value / totalCurrentValue * 100) : 0;
        const target = stock.targetAllocation ?? null;
        const diff   = target !== null ? pct - target : null;
        return { name: stock.name || stock.ticker, ticker: stock.ticker, pct, target, diff };
      })
      .sort((a, b) => b.pct - a.pct);

    if (sizingRows.length === 0) {
      sizingEl.innerHTML = `<span class="muted">No holdings yet.</span>`;
    } else {
      const hasTargets = sizingRows.some(r => r.target !== null);
      sizingEl.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead><tr style="border-bottom:0.5px solid var(--color-border);">
            <td class="muted" style="padding:5px 0; font-size:10px;">Stock</td>
            <td class="muted" style="text-align:right; font-size:10px;">Actual</td>
            ${hasTargets ? `<td class="muted" style="text-align:right; font-size:10px;">Target</td><td class="muted" style="text-align:right; font-size:10px;">Diff</td>` : ""}
          </tr></thead>
          <tbody>${sizingRows.map(r => `
            <tr style="border-bottom:0.5px solid var(--color-border); cursor:pointer;" onclick="window.location.hash='#stock/${encodeURIComponent(r.ticker)}'">
              <td style="padding:5px 0;">${r.name}</td>
              <td style="text-align:right;">${r.pct.toFixed(1)}%</td>
              ${hasTargets ? `
                <td style="text-align:right; color:var(--color-text-tertiary);">${r.target !== null ? r.target+"%" : "—"}</td>
                <td style="text-align:right; color:var(${r.diff===null?"--color-text-tertiary":Math.abs(r.diff)>5?"--color-red":"--color-green"});">${r.diff!==null?(r.diff>=0?"+":"")+r.diff.toFixed(1)+"%":"—"}</td>` : ""}
            </tr>`).join("")}
          </tbody>
        </table>
        ${!hasTargets ? `<div class="muted" style="font-size:11px; margin-top:8px;">Set target allocations in each stock's edit screen to see over/underweight analysis.</div>` : ""}`;
    }

    // ── Earnings season ───────────────────────────────────────────────
    const earningsEl = document.getElementById("earnings-season");
    const earningsRows = heldStocksWithValues
      .map(({ stock }) => ({
        name: stock.name || stock.ticker,
        ticker: stock.ticker,
        lastUpdated: stock.fundamentals?.lastUpdated ?? null,
      }))
      .sort((a, b) => {
        if (!a.lastUpdated) return 1;
        if (!b.lastUpdated) return -1;
        return new Date(b.lastUpdated) - new Date(a.lastUpdated);
      });

    earningsEl.innerHTML = earningsRows.length === 0
      ? `<span class="muted">No holdings.</span>`
      : `<table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tbody>${earningsRows.map(r => {
            const days = r.lastUpdated ? Math.floor((Date.now() - new Date(r.lastUpdated)) / 86400000) : null;
            const stale = days === null || days > 45;
            return `<tr style="border-bottom:0.5px solid var(--color-border); cursor:pointer;" onclick="window.location.hash='#stock/${encodeURIComponent(r.ticker)}'">
              <td style="padding:5px 0;">${r.name}</td>
              <td style="text-align:right; color:var(${stale?"--color-red":"--color-text-tertiary"});">${r.lastUpdated ? r.lastUpdated : "Never fetched"}</td>
              <td style="text-align:right; color:var(${stale?"--color-red":"--color-text-tertiary"}); font-size:11px;">${days!==null?days+"d ago":""}</td>
            </tr>`;
          }).join("")}
          </tbody>
        </table>`;


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
      needsEl.innerHTML = `<span class="muted" style="font-size:12px;">All held stocks pass the Buffett checklist.</span>`;
    } else {
      needsEl.innerHTML = triageItems.map(item => `
        <div class="triage-row" onclick="window.location.hash='#stock/${encodeURIComponent(item.ticker)}'">
          <span style="color:var(--color-red); font-size:9px; flex-shrink:0; margin-top:2px;">●</span>
          <div style="flex:1; min-width:0;">
            <span class="stock-name" style="font-size:13px;">${item.name}</span>
            <span class="muted" style="font-size:11px;"> · ${item.text}</span>
          </div>
          <span class="muted" style="font-size:11px; flex-shrink:0;">→</span>
        </div>`).join("");
    }

    // ── Tooltip wiring for growth metrics ─────────────────────────────
    document.querySelectorAll(".tooltip-wrap").forEach(wrap => {
      const box = wrap.querySelector(".tooltip-box");
      wrap.addEventListener("mouseenter", () => { box.style.display = "block"; });
      wrap.addEventListener("mouseleave", () => { box.style.display = "none"; });
      wrap.addEventListener("click", (e) => {
        e.stopPropagation();
        box.style.display = box.style.display === "none" ? "block" : "none";
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".tooltip-box").forEach(b => { b.style.display = "none"; });
    }, { once: false, capture: true });

    // ── Collapsible toggle wiring ─────────────────────────────────────
    [["sizing-header","sizing-chevron","position-sizing-wrap"],
     ["earnings-header","earnings-chevron","earnings-season-wrap"]].forEach(([hId, cId, pId]) => {
      document.getElementById(hId).addEventListener("click", () => {
        const panel = document.getElementById(pId);
        const chev  = document.getElementById(cId);
        const open  = panel.style.display !== "none";
        panel.style.display = open ? "none" : "block";
        chev.textContent    = open ? "▶ expand" : "▼ collapse";
      });
    });

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
