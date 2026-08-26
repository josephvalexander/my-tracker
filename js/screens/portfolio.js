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
        <div class="toggle-row" style="margin-bottom:12px;">
          <button class="af-chip ${window.uiState.analyticsFilters.has('mainboard') ? 'af-chip-active' : ''}" data-filter="mainboard">Mainboard</button>
          <button class="af-chip ${window.uiState.analyticsFilters.has('sme') ? 'af-chip-active' : ''}" data-filter="sme">SME</button>
          <button class="af-chip ${window.uiState.analyticsFilters.has('reit') ? 'af-chip-active' : ''}" data-filter="reit">REIT / InvIT</button>
        </div>
        <div class="section-label">Buffett checklist — held stocks</div>
        <div id="portfolio-summary" class="metric-grid-3"></div>
        <div id="needs-attention" class="card" style="margin-bottom:14px;"></div>
        <div class="section-label">Portfolio growth</div>
        <div id="portfolio-growth" class="card"></div>
        <div class="section-label">Sector concentration <span class="muted" style="font-size:11px;">value-weighted</span></div>
        <div id="sector-chart" class="card"></div>
        <div class="section-label">Market cap mix <span class="muted" style="font-size:11px;">value-weighted</span></div>
        <div id="cap-chart" class="card"></div>
        <div class="section-label collapsible-header" id="valuation-header" style="cursor:pointer; display:flex; justify-content:space-between;">
          Valuation snapshot <span class="muted" style="font-size:11px;" id="valuation-chevron">▶ expand</span>
        </div>
        <div id="valuation-wrap" style="display:none;">
          <div id="valuation-snapshot" class="card"></div>
        </div>
        <div class="section-label collapsible-header" id="tax-header" style="cursor:pointer; display:flex; justify-content:space-between;">
          Tax summary <span class="muted" style="font-size:11px;" id="tax-chevron">▶ expand</span>
        </div>
        <div id="tax-wrap" style="display:none;">
          <div class="card">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
              <label class="muted" style="font-size:12px;">Financial year:</label>
              <select id="analytics-fy-select" style="font-size:12px; padding:4px 8px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);"></select>
            </div>
            <div id="tax-summary-content"></div>
          </div>
        </div>
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
      </div>`;
  },

  async afterRender() {
    const holdings  = await HoldingStore.getAll();
    const allStocks = await StockStore.getAll();
    const stockMap  = {};
    allStocks.forEach(s => { stockMap[s.ticker] = s; });

    const allHeldWithValues = holdings
      .map(h => {
        const stock = stockMap[h.ticker];
        if (!stock) return null;
        const qty   = totalQuantity(h);
        const price = stock.fundamentals?.currentPrice ?? 0;
        return { stock, holding: h, qty, value: qty * price };
      })
      .filter(Boolean);

    const activeFilters = window.uiState.analyticsFilters; // persisted across navigation

    function applyFilter(items) {
      return items.filter(h => {
        const board = h.stock?.board || "mainboard";
        if (board === "reit")      return activeFilters.has("reit");
        if (board === "sme" || board === "microcap") return activeFilters.has("sme");
        return activeFilters.has("mainboard");
      });
    }

    // ── Chip toggle wiring ────────────────────────────────────────────
    document.querySelectorAll(".af-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const f = chip.dataset.filter;
        if (activeFilters.has(f)) { if (activeFilters.size > 1) activeFilters.delete(f); }
        else activeFilters.add(f);
        chip.classList.toggle("af-chip-active", activeFilters.has(f));
        buildAnalytics();
      });
    });

    // Chart instances stored for destruction on re-render
    let chartInstances = [];
    function destroyCharts() {
      chartInstances.forEach(c => { try { c.destroy(); } catch {} });
      chartInstances = [];
    }

    async function buildAnalytics() {
      destroyCharts();
      const heldStocksWithValues = applyFilter(allHeldWithValues);
      const heldStocks = heldStocksWithValues.map(h => h.stock);
      const holdingsFiltered = heldStocksWithValues.map(h => h.holding);

    // ── Portfolio growth section ──────────────────────────────────
    const growthEl = document.getElementById("portfolio-growth");
    const totalCurrentValue = heldStocksWithValues.reduce((s, h) => s + h.value, 0);

    // XIRR across filtered holdings (replaces simple P&L)
    const xirrVal = portfolioXIRR(holdingsFiltered, (() => {
      const m = {}; heldStocksWithValues.forEach(({stock}) => { m[stock.ticker] = stock.fundamentals?.currentPrice ?? 0; }); return m;
    })());

    // Revenue QoQ/YoY aggregate
    let totalRevQ = 0, totalRevPrevQ = 0, totalRevYoY = 0, revenueCount = 0;
    for (const { stock } of heldStocksWithValues) {
      const q = stock.fundamentals?.quarterly;
      if (!q?.revenue?.length || q.revenue.length < 2) continue;
      const latest = q.revenue[q.revenue.length - 1];
      const prevQ  = q.revenue[q.revenue.length - 2];
      const sameQLastYear = q.revenue.length >= 5 ? q.revenue[q.revenue.length - 5] : null;
      if (latest != null && prevQ != null) { totalRevQ += latest; totalRevPrevQ += prevQ; revenueCount++; }
      if (latest != null && sameQLastYear != null) totalRevYoY += sameQLastYear;
    }
    const qoq = revenueCount > 0 && totalRevPrevQ > 0 ? ((totalRevQ - totalRevPrevQ) / totalRevPrevQ * 100) : null;
    const yoy  = revenueCount > 0 && totalRevYoY  > 0 ? ((totalRevQ - totalRevYoY)  / totalRevYoY  * 100) : null;

    // Load all snapshots for the current filter
    const snapKey = activeFilters.size === 1 && activeFilters.has("mainboard") ? "mainboard"
      : activeFilters.size === 1 && activeFilters.has("sme")  ? "sme"
      : activeFilters.size === 1 && activeFilters.has("reit") ? "reit"
      : "all";
    const allSnapshots = (await MetaStore.getSnapshots()) || {};
    const allSnaps     = (allSnapshots[snapKey] || []).sort((a,b) => a.date.localeCompare(b.date));

    growthEl.innerHTML = `
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:${allSnaps.length > 1 ? "14px" : "0"};">
        <div style="flex:1; min-width:100px;">
          <div class="muted" style="font-size:11px;">XIRR
            <span class="tooltip-wrap" style="position:relative; display:inline-block; margin-left:3px; cursor:help;">
              <span style="font-size:9px; border:0.5px solid var(--color-border); border-radius:50%; padding:0 3px; color:var(--color-text-tertiary);">?</span>
              <span class="tooltip-box" style="display:none; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); width:200px; background:var(--color-text); color:var(--color-surface); font-size:10px; padding:7px 9px; border-radius:6px; z-index:99; line-height:1.4;">
                Annualised return accounting for when each lot was purchased. 20% XIRR means each rupee invested compounds at 20% per year, adjusted for timing. More meaningful than simple P&amp;L. Lots under 2 months excluded.
              </span>
            </span>
          </div>
          <div style="font-size:16px; font-weight:600; color:var(${(xirrVal??0)>=0?"--color-green":"--color-red"});">${xirrVal!==null?(xirrVal>=0?"+":"")+xirrVal.toFixed(1)+"%":"—"}</div>
          <div class="muted" style="font-size:10px;">annualised, time-adjusted</div>
        </div>
        <div style="flex:1; min-width:100px;">
          <div class="muted" style="font-size:11px;">Revenue QoQ
            <span class="tooltip-wrap" style="position:relative; display:inline-block; margin-left:3px; cursor:help;">
              <span style="font-size:9px; border:0.5px solid var(--color-border); border-radius:50%; padding:0 3px; color:var(--color-text-tertiary);">?</span>
              <span class="tooltip-box" style="display:none; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); width:210px; background:var(--color-text); color:var(--color-surface); font-size:10px; padding:7px 9px; border-radius:6px; z-index:99; line-height:1.4;">
                Sum of latest quarter revenue across all held stocks vs the previous quarter. Weighted by company revenue size. Shows short-term momentum but can be noisy due to seasonality.
              </span>
            </span>
          </div>
          <div style="font-size:16px; font-weight:600; color:var(${(qoq??0)>=0?"--color-green":"--color-red"});">${qoq!==null?(qoq>=0?"+":"")+qoq.toFixed(1)+"%":"—"}</div>
          <div class="muted" style="font-size:10px;">aggregate held stocks</div>
        </div>
        <div style="flex:1; min-width:100px;">
          <div class="muted" style="font-size:11px;">Revenue YoY
            <span class="tooltip-wrap" style="position:relative; display:inline-block; margin-left:3px; cursor:help;">
              <span style="font-size:9px; border:0.5px solid var(--color-border); border-radius:50%; padding:0 3px; color:var(--color-text-tertiary);">?</span>
              <span class="tooltip-box" style="display:none; position:absolute; bottom:120%; left:50%; transform:translateX(-50%); width:210px; background:var(--color-text); color:var(--color-surface); font-size:10px; padding:7px 9px; border-radius:6px; z-index:99; line-height:1.4;">
                Latest quarter revenue vs the same quarter one year ago. Removes seasonal effects. The most meaningful growth signal for quarterly review.
              </span>
            </span>
          </div>
          <div style="font-size:16px; font-weight:600; color:var(${(yoy??0)>=0?"--color-green":"--color-red"});">${yoy!==null?(yoy>=0?"+":"")+yoy.toFixed(1)+"%":"—"}</div>
          <div class="muted" style="font-size:10px;">aggregate held stocks</div>
        </div>
      </div>
      ${allSnaps.length > 1 ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span class="muted" style="font-size:11px;">Portfolio value</span>
          <div id="snap-period-toggle" style="display:flex; gap:4px;"></div>
        </div>
        <div style="position:relative; height:110px;"><canvas id="portfolio-value-chart"></canvas></div>`
        : `<div class="muted" style="font-size:11px; padding-top:8px; border-top:0.5px solid var(--color-border);">Portfolio value chart will appear after a few days of price refreshes. Tap ↻ Prices daily to build history.</div>`
      }`;

    // Wire tooltips each time growth section re-renders
    document.querySelectorAll(".tooltip-wrap").forEach(wrap => {
      const box = wrap.querySelector(".tooltip-box");
      wrap.addEventListener("mouseenter", () => { box.style.display = "block"; });
      wrap.addEventListener("mouseleave", () => { box.style.display = "none"; });
      wrap.addEventListener("click", (e) => { e.stopPropagation(); box.style.display = box.style.display === "none" ? "block" : "none"; });
    });

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
    heldStocks.filter(s => s.board !== "reit").forEach(s => {
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

    // Wire tooltips after growth section renders
    document.querySelectorAll(".tooltip-wrap").forEach(wrap => {
      const box = wrap.querySelector(".tooltip-box");
      wrap.addEventListener("mouseenter", () => { box.style.display = "block"; });
      wrap.addEventListener("mouseleave", () => { box.style.display = "none"; });
      wrap.addEventListener("click", (e) => { e.stopPropagation(); box.style.display = box.style.display === "none" ? "block" : "none"; });
    });

    // Portfolio value chart with dynamic period toggle + benchmark
    if (allSnaps.length > 1) {
      const baseFont = { family: "-apple-system,'Segoe UI',Roboto,sans-serif", size: 10 };
      let pvChart = null;

      const firstDate = new Date(allSnaps[0].date);
      const lastDate  = new Date(allSnaps[allSnaps.length-1].date);
      const totalDays = Math.round((lastDate-firstDate)/86400000);

      const PERIODS = [
        { key:"1W",  label:"1W",  days:7   },
        { key:"1M",  label:"1M",  days:30  },
        { key:"3M",  label:"3M",  days:90  },
        { key:"6M",  label:"6M",  days:180 },
        { key:"1Y",  label:"1Y",  days:365 },
        { key:"All", label:"All", days:9999},
      ].filter(p => p.days===9999 || totalDays>=p.days*0.7);
      if (!PERIODS.length) PERIODS.push({key:"All",label:"All",days:9999});

      // Restore saved period if it exists in the available PERIODS list, else auto-select
      const savedPeriod = window.uiState.analyticsPeriod;
      let activePeriod = (savedPeriod && PERIODS.find(p => p.key === savedPeriod))
        ? savedPeriod
        : (PERIODS.find(p => p.days <= 30) || PERIODS[0]).key;
      let benchmark = window.uiState.analyticsBenchmark ?? "none"; // "none" | "sensex" | "nifty"

      const toggleDiv = document.getElementById("snap-period-toggle");
      if (toggleDiv) {
        toggleDiv.innerHTML = PERIODS.map(p =>
          `<button class="snap-period-btn btn btn-small" data-period="${p.key}" style="font-size:10px;padding:1px 7px;${p.key===activePeriod?"background:var(--color-text);color:var(--color-surface);":" "}">${p.label}</button>`
        ).join("") +
        `<span style="margin-left:8px;font-size:10px;color:var(--color-text-tertiary);">vs</span>
         <button class="bm-btn btn btn-small" data-bm="none"   style="font-size:10px;padding:1px 7px;${benchmark==='none'   ?'background:var(--color-text);color:var(--color-surface);':''}" >None</button>
         <button class="bm-btn btn btn-small" data-bm="sensex" style="font-size:10px;padding:1px 7px;${benchmark==='sensex'?'background:var(--color-text);color:var(--color-surface);':''}" >SENSEX</button>
         <button class="bm-btn btn btn-small" data-bm="nifty"  style="font-size:10px;padding:1px 7px;${benchmark==='nifty'  ?'background:var(--color-text);color:var(--color-surface);':''}" >NIFTY</button>`;
      }

      const idxSnaps = (allSnapshots.index || []);

      function getFilteredSnaps(periodKey) {
        if ((PERIODS.find(p=>p.key===periodKey)?.days??9999)===9999) return allSnaps;
        const days = PERIODS.find(p=>p.key===periodKey)?.days??9999;
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
        return allSnaps.filter(s=>s.date>=cutoff.toISOString().slice(0,10));
      }

      function aggregateSnaps(snaps, periodKey) {
        const days = PERIODS.find(p=>p.key===periodKey)?.days??9999;
        if (days<=90||snaps.length<=60) return snaps;
        const byKey={};
        const useMonth=days>180;
        for (const s of snaps) { const k=useMonth?s.date.slice(0,7):getWeekKey(s.date); byKey[k]=s; }
        return Object.entries(byKey).sort(([a],[b])=>a.localeCompare(b)).map(([,s])=>s);
      }

      function getWeekKey(dateStr) {
        const d=new Date(dateStr); const day=d.getDay();
        const mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1));
        return mon.toISOString().slice(0,10);
      }

      function formatLabel(dateStr, periodKey) {
        const days=PERIODS.find(p=>p.key===periodKey)?.days??9999;
        return days<=90?dateStr.slice(5):days<=180?"W"+dateStr.slice(5,10):dateStr.slice(0,7);
      }

      // Rebase index to match portfolio start value for visual comparison
      function rebaseIndex(snaps, idxSnaps, field) {
        if (!snaps.length||!idxSnaps.length) return [];
        const firstPortDate = snaps[0].date;
        const firstIdx = idxSnaps.find(s=>s.date>=firstPortDate&&s[field]);
        if (!firstIdx) return [];
        const firstPortVal = snaps[0].value;
        const scale = firstPortVal / firstIdx[field];
        return snaps.map(s=>{
          const idxSnap = idxSnaps.filter(i=>i.date<=s.date&&i[field]).slice(-1)[0];
          return idxSnap ? { date:s.date, value:Math.round(idxSnap[field]*scale) } : null;
        }).filter(Boolean);
      }

      function drawChart(periodKey) {
        if (pvChart) { try{pvChart.destroy();}catch{} }
        const snaps   = aggregateSnaps(getFilteredSnaps(periodKey), periodKey);
        const labels  = snaps.map(s=>formatLabel(s.date, periodKey));
        const datasets = [{
          label:"Portfolio", data:snaps.map(s=>s.value),
          borderColor:"#1D9E75", backgroundColor:"rgba(29,158,117,0.08)",
          fill:true, tension:0.3, pointRadius:snaps.length<=40?2:0, borderWidth:2,
        }];

        if (benchmark!=="none") {
          const field  = benchmark==="sensex"?"sensex":"nifty";
          const rebased = rebaseIndex(snaps, idxSnaps, field);
          if (rebased.length) {
            datasets.push({
              label: benchmark==="sensex"?"SENSEX":"NIFTY",
              data: rebased.map(s=>s.value),
              borderColor:"#BA7517", backgroundColor:"transparent",
              fill:false, tension:0.3, pointRadius:0, borderWidth:1.5, borderDash:[4,3],
            });
          }
        }

        pvChart = new Chart(document.getElementById("portfolio-value-chart"), {
          type:"line",
          data:{ labels, datasets },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
              legend:{ display:datasets.length>1, position:"bottom", labels:{font:baseFont,boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:"circle"} },
              tooltip:{ backgroundColor:"#2c2c2a", titleFont:baseFont, bodyFont:baseFont,
                callbacks:{ label:(ctx)=>` ${ctx.dataset.label}: ₹${Math.round(ctx.parsed.y).toLocaleString("en-IN")}` }},
            },
            scales:{
              x:{ grid:{display:false}, ticks:{font:baseFont,color:"#888780",maxTicksLimit:6} },
              y:{ grid:{color:"rgba(0,0,0,0.06)"}, ticks:{font:baseFont,color:"#888780",callback:v=>formatCurrencyShort(v)} },
            },
          },
        });
        chartInstances.push(pvChart);
      }

      drawChart(activePeriod);

      document.querySelectorAll(".snap-period-btn").forEach(btn => {
        btn.addEventListener("click", ()=>{
          activePeriod=btn.dataset.period;
          window.uiState.analyticsPeriod = activePeriod;
          document.querySelectorAll(".snap-period-btn").forEach(b=>{b.style.background="";b.style.color="";});
          btn.style.background="var(--color-text)"; btn.style.color="var(--color-surface)";
          chartInstances=chartInstances.filter(c=>c!==pvChart); drawChart(activePeriod);
        });
      });

      document.querySelectorAll(".bm-btn").forEach(btn => {
        btn.addEventListener("click", ()=>{
          benchmark=btn.dataset.bm;
          window.uiState.analyticsBenchmark = benchmark;
          document.querySelectorAll(".bm-btn").forEach(b=>{b.style.background="";b.style.color="";});
          btn.style.background="var(--color-text)"; btn.style.color="var(--color-surface)";
          chartInstances=chartInstances.filter(c=>c!==pvChart); drawChart(activePeriod);
        });
      });
    }


    // ── Tax summary ──────────────────────────────────────────────────
    const taxAllStocks = await StockStore.getAll();
    const taxHoldings  = holdings; // already loaded above
    const taxSMap = {}; taxAllStocks.forEach(s => { taxSMap[s.ticker] = s; });
    const today = new Date(); today.setHours(23,59,59,0);

    // Collect all realized transactions
    function getRealizedTx() {
      const txs = [];
      function addSells(ticker, name, sells) {
        for (const sale of sells||[]) {
          for (const lc of sale.lotsConsumed||[]) {
            const d = lc.sellDate||sale.date;
            txs.push({ ticker, name, buyDate:lc.buyDate||null, buyPrice:lc.buyPrice,
              sellDate:d, sellPrice:lc.sellPrice||sale.sellPrice,
              quantity:lc.quantity, pnl:lc.pnl, type:lc.type||"Unknown" });
          }
        }
      }
      taxAllStocks.forEach(s => addSells(s.ticker, s.name||s.ticker, s.sellHistory));
      taxHoldings.forEach(h => addSells(h.ticker, taxSMap[h.ticker]?.name||h.ticker, h.sells));
      return txs;
    }

    // Compute dividends for a given FY filter
    function getDividendForFY(fyFilter) {
      let total = 0;
      for (const h of taxHoldings) {
        const s = taxSMap[h.ticker]; if (!s) continue;
        const lots = h.lots?.length ? h.lots : [{purchaseDate:null, quantity:h.quantity??0}];
        for (const div of s.corporateActions?.dividends||[]) {
          if (!div.amount) continue;
          const dateStr = div.recordDate||div.announced||null; if (!dateStr) continue;
          const recordDate = new Date(dateStr); if (recordDate > today) continue;
          if (!inFYFilter(dateStr, fyFilter)) continue;
          const eligibleQty = lots.reduce((sum, lot) => {
            if (!lot.purchaseDate) return sum + (lot.quantity||0);
            return new Date(lot.purchaseDate) <= recordDate ? sum + (lot.quantity||0) : sum;
          }, 0);
          total += eligibleQty * div.amount;
        }
      }
      return total;
    }

    function inFYFilter(dateStr, fyFilter) {
      if (fyFilter === "all") return true;
      const d = new Date(dateStr);
      const fy = d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
      return fy === parseInt(fyFilter);
    }

    const allTxs = getRealizedTx();

    // Build FY options from transaction dates + dividend dates
    const fySet = new Set();
    // Add FYs from realized transactions
    allTxs.forEach(t => {
      if (t.sellDate) { const d=new Date(t.sellDate); fySet.add(d.getMonth()>=3?d.getFullYear()+1:d.getFullYear()); }
    });
    // Add FYs from dividends only if there's actually an eligible holding with a non-zero receipt
    for (const h of taxHoldings) {
      const s = taxSMap[h.ticker]; if (!s) continue;
      const lots = h.lots?.length ? h.lots : [{purchaseDate:null, quantity:h.quantity??0}];
      for (const div of s.corporateActions?.dividends||[]) {
        if (!div.amount) continue;
        const dateStr = div.recordDate||div.announced||null; if (!dateStr) continue;
        const recordDate = new Date(dateStr); if (recordDate > today) continue;
        // Only include this FY if at least one lot was eligible
        const hasEligible = lots.some(lot =>
          !lot.purchaseDate || new Date(lot.purchaseDate) <= recordDate
        );
        if (!hasEligible) continue;
        const d = new Date(dateStr);
        fySet.add(d.getMonth()>=3 ? d.getFullYear()+1 : d.getFullYear());
      }
    }
    const fyOptions = [...fySet].sort((a,b)=>b-a);

    const fySelect = document.getElementById("analytics-fy-select");
    fySelect.innerHTML = `<option value="all">All years</option>` +
      fyOptions.map(fy=>`<option value="${fy}">FY${fy} (Apr ${fy-1}–Mar ${fy})</option>`).join("");

    function renderTaxSummary(fyFilter) {
      const filtered = allTxs.filter(t => inFYFilter(t.sellDate||"", fyFilter));
      const stcg = filtered.filter(t=>t.type==="STCG").reduce((s,t)=>s+t.pnl,0);
      const ltcg = filtered.filter(t=>t.type==="LTCG").reduce((s,t)=>s+t.pnl,0);
      const divs = getDividendForFY(fyFilter);
      const fmtPnl = v => `${v>=0?"":""}₹${Math.abs(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

      const summaryHtml = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
          <div style="flex:1; min-width:120px; padding:10px 12px; background:var(--color-bg); border-radius:var(--radius-md);">
            <div class="muted" style="font-size:11px;">Short Term P&L (STCG)</div>
            <div style="font-size:15px; font-weight:600; color:var(${stcg>=0?"--color-green":"--color-red"});">${fmtPnl(stcg)}</div>
          </div>
          <div style="flex:1; min-width:120px; padding:10px 12px; background:var(--color-bg); border-radius:var(--radius-md);">
            <div class="muted" style="font-size:11px;">Long Term P&L (LTCG)</div>
            <div style="font-size:15px; font-weight:600; color:var(${ltcg>=0?"--color-green":"--color-red"});">${fmtPnl(ltcg)}</div>
          </div>
          <div style="flex:1; min-width:120px; padding:10px 12px; background:var(--color-bg); border-radius:var(--radius-md);">
            <div class="muted" style="font-size:11px;">Dividends received</div>
            <div style="font-size:15px; font-weight:600;">₹${Math.round(divs).toLocaleString("en-IN")}</div>
          </div>
        </div>`;

      // Detail table — realized transactions
      const detailHtml = filtered.length === 0
        ? `<div class="muted" style="font-size:12px;">No realized transactions${fyFilter==="all"?"":" for this FY"}.</div>`
        : `<table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead><tr style="border-bottom:1px solid var(--color-border);">
              <td class="muted" style="padding:5px 0; font-size:10px;">Stock</td>
              <td class="muted" style="padding:5px 4px; font-size:10px;">Buy date</td>
              <td class="muted" style="padding:5px 4px; font-size:10px;">Sell date</td>
              <td class="muted" style="text-align:right; font-size:10px;">Qty</td>
              <td class="muted" style="text-align:right; font-size:10px;">P&L</td>
              <td class="muted" style="text-align:right; font-size:10px;">Type</td>
            </tr></thead>
            <tbody>${filtered.map(t=>`
              <tr style="border-bottom:0.5px solid var(--color-border);">
                <td style="padding:5px 0;">${t.name}</td>
                <td style="padding:5px 4px; color:var(--color-text-tertiary);">${t.buyDate||"—"}</td>
                <td style="padding:5px 4px; color:var(--color-text-tertiary);">${t.sellDate||"—"}</td>
                <td style="text-align:right;">${t.quantity.toLocaleString()}</td>
                <td style="text-align:right; color:var(${t.pnl>=0?"--color-green":"--color-red"});">${fmtPnl(t.pnl)}</td>
                <td style="text-align:right;"><span style="font-size:10px; padding:1px 5px; border-radius:8px; background:var(${t.type==="LTCG"?"--color-green":"--color-red"})22; color:var(${t.type==="LTCG"?"--color-green":"--color-red"});">${t.type}</span></td>
              </tr>`).join("")}
            </tbody>
          </table>`;

      document.getElementById("tax-summary-content").innerHTML = summaryHtml + detailHtml;
    }

    fySelect.addEventListener("change", () => renderTaxSummary(fySelect.value));
    // Render when tax section is expanded (lazy)
    document.getElementById("tax-header").addEventListener("click", () => {
      const panel = document.getElementById("tax-wrap");
      if (panel.style.display === "block") renderTaxSummary(fySelect.value);
    });

    // ── Collapsible toggle wiring ─────────────────────────────────────
    [["sizing-header","sizing-chevron","position-sizing-wrap"],
     ["earnings-header","earnings-chevron","earnings-season-wrap"],
     ["valuation-header","valuation-chevron","valuation-wrap"],
     ["tax-header","tax-chevron","tax-wrap"]].forEach(([hId, cId, pId]) => {
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
      chartInstances.push(new Chart(document.getElementById("sector-pie"), {
        type: "pie",
        data: { labels: breakdown.map(b=>b.sector), datasets: [{ data: breakdown.map(b=>b.pct), backgroundColor: breakdown.map((_,i)=>SECTOR_PALETTE[i%SECTOR_PALETTE.length]), borderWidth: 2, borderColor: "var(--color-surface)" }] },
        options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>` ${ctx.label}: ${ctx.parsed.toFixed(0)}%`}} } },
      }));
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
      chartInstances.push(new Chart(document.getElementById("cap-pie"), {
        type: "pie",
        data: { labels: caps.map(c=>c.cat), datasets: [{ data: caps.map(c=>c.pct), backgroundColor: caps.map(c=>CAP_PALETTE[c.cat]), borderWidth: 2, borderColor: "var(--color-surface)" }] },
        options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>` ${ctx.label}: ${ctx.parsed.toFixed(0)}%`}} } },
      }));
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

    } // end buildAnalytics

    // Tooltip dismiss — registered once outside buildAnalytics
    document.addEventListener("click", () => {
      document.querySelectorAll(".tooltip-box").forEach(b => { b.style.display = "none"; });
    }, { capture: true });

    buildAnalytics();
  },
};

registerScreen("portfolio", portfolioScreen);