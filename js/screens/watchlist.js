/**
 * screens/watchlist.js
 *
 * Home screen. Lists active stocks with the 3 scan-fast metrics
 * (ROE, D/E, EPS CAGR) color-coded, plus entry-zone status. Pulls real
 * data via StockStore and computes ratios via calculations.js — nothing
 * here is hardcoded sample data.
 */

const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M1.75 3.5h10.5M5.25 3.5V2.333a.583.583 0 0 1 .583-.583h2.334a.583.583 0 0 1 .583.583V3.5M11.083 3.5l-.583 7.583a.583.583 0 0 1-.583.584H4.083a.583.583 0 0 1-.583-.584L2.917 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const FAV_STAR_OUTLINE = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M7 1.167l1.575 3.191 3.508.511-2.541 2.476.6 3.492L7 9.116l-3.142 1.721.6-3.492L1.917 4.869l3.508-.511L7 1.167z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const FAV_STAR_SOLID = `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M7 1.167l1.575 3.191 3.508.511-2.541 2.476.6 3.492L7 9.116l-3.142 1.721.6-3.492L1.917 4.869l3.508-.511L7 1.167z"/>
</svg>`;

function metricChip(label, value, formatted, colorClass) {
  const cls = colorClass ? `chip chip-${colorClass}` : "chip chip-neutral";
  return `
    <div class="metric-col">
      <div class="metric-label">${label}</div>
      <div class="${cls}">${formatted}</div>
    </div>`;
}

function reitRow(stock) {
  const cmp = stock.fundamentals?.currentPrice ?? null;
  const pc  = stock.priceContext || {};
  const isFav = !!stock.isFavorite;

  let watchlistPrice = stock.watchlistPrice ?? null;
  if (!watchlistPrice && cmp) {
    watchlistPrice = cmp;
    StockStore.get(stock.ticker).then(fresh => {
      if (fresh && !fresh.watchlistPrice) { fresh.watchlistPrice = cmp; StockStore.set(stock.ticker, fresh); }
    });
  }
  const sinceAdded = (cmp && watchlistPrice) ? ((cmp - watchlistPrice) / watchlistPrice) * 100 : null;
  const sinceColor = sinceAdded === null ? "--color-text-tertiary" : sinceAdded >= 0 ? "--color-green" : "--color-red";
  const sinceText  = sinceAdded !== null ? `${sinceAdded >= 0 ? "+" : ""}${sinceAdded.toFixed(1)}%` : "—";
  const addedDateText = stock.addedDate
    ? new Date(stock.addedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
  const alertBadge = (stock.alertPrice && cmp && cmp < stock.alertPrice)
    ? `<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:var(--color-red);color:#fff;vertical-align:middle;margin-left:4px;">⚠ alert</span>` : "";

  const yieldVal = pc.distributionYield;
  const yieldColor = yieldVal >= 7 ? "--color-green" : yieldVal >= 5 ? "--color-text" : "--color-red";

  // Last quarterly distribution: sum all components for the most recent record date
  let lastDist = null;
  const divs = stock.corporateActions?.dividends || [];
  if (divs.length > 0) {
    const latestDate = divs.reduce((max, d) => d.recordDate > max ? d.recordDate : max, "");
    lastDist = divs.filter(d => d.recordDate === latestDate).reduce((s, d) => s + (d.amount || 0), 0);
  }

  return `
    <div class="stock-row${isFav ? " stock-row-fav" : ""}" data-ticker="${stock.ticker}" style="position:relative;">
      <button class="fav-btn${isFav ? " fav-btn-active" : ""}" data-fav-ticker="${stock.ticker}" aria-label="${isFav ? "Unfavourite" : "Favourite"}" title="${isFav ? "Unfavourite" : "Favourite"}" style="position:absolute;top:8px;right:8px;z-index:1;">${isFav ? FAV_STAR_SOLID : FAV_STAR_OUTLINE}</button>
      <div class="stock-row-grid">
        <div class="stock-identity">
          <div class="stock-name">${stock.name || stock.ticker}</div>
          <div class="stock-meta">${stock.reitType || "REIT"} · ${stock.reitAssetClass || ""}${alertBadge}</div>
        </div>
        ${metricChip("Yield", yieldVal, yieldVal ? yieldVal.toFixed(1)+"%" : "—", yieldColor)}
        ${metricChip("Dist", lastDist, lastDist ? "₹"+lastDist.toFixed(2)+"/qtr" : "—", "--color-text")}
        ${metricChip("Gear", pc.gearing, pc.gearing != null ? pc.gearing.toFixed(2)+"x" : "—", pc.gearing > 1.0 ? "--color-red" : "--color-green")}
        <div class="stock-price">
          <div class="price-main">${formatCurrency(cmp)}</div>
        </div>
        <div class="row-actions">
          <button class="row-menu-btn" data-menu-ticker="${stock.ticker}" aria-label="Delete">${TRASH_ICON}</button>
        </div>
      </div>
      <div class="since-added-row">
        <span class="muted">Since watchlisted</span>
        <span style="color:var(${sinceColor}); font-weight:500;">${sinceText}</span>
        ${addedDateText ? `<span class="muted">· added ${addedDateText}</span>` : ""}
      </div>
    </div>`;
}

function stockRow(stock) {
  const roe = roe5yAvg(stock);
  const de = debtToEquity(stock);
  const cagr = epsCagr(stock);
  const cmp = stock.fundamentals?.currentPrice ?? null;
  const isFav = !!stock.isFavorite;

  // Self-heal: if watchlistPrice missing but currentPrice exists, set it in background
  let watchlistPrice = stock.watchlistPrice ?? null;
  if (!watchlistPrice && cmp) {
    watchlistPrice = cmp;
    StockStore.get(stock.ticker).then(fresh => {
      if (fresh && !fresh.watchlistPrice) {
        fresh.watchlistPrice = cmp;
        StockStore.set(stock.ticker, fresh);
      }
    });
  }

  const sinceAdded = (cmp && watchlistPrice)
    ? ((cmp - watchlistPrice) / watchlistPrice) * 100
    : null;

  const roeColor  = colorForMetric(roe,  DEFAULT_RULES.roe);
  const deColor   = colorForMetric(de,   DEFAULT_RULES.de);
  const cagrColor = colorForMetric(cagr, DEFAULT_RULES.epsCagr);

  const sinceColor = sinceAdded === null ? "--color-text-tertiary"
    : sinceAdded >= 0 ? "--color-green" : "--color-red";
  const sinceText = sinceAdded !== null
    ? `${sinceAdded >= 0 ? "+" : ""}${sinceAdded.toFixed(1)}%`
    : "—";
  const addedDateText = stock.addedDate
    ? new Date(stock.addedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return `
    <div class="stock-row${isFav ? " stock-row-fav" : ""}" data-ticker="${stock.ticker}" style="position:relative;">
      <button class="fav-btn${isFav ? " fav-btn-active" : ""}" data-fav-ticker="${stock.ticker}" aria-label="${isFav ? "Unfavourite" : "Favourite"}" title="${isFav ? "Unfavourite" : "Favourite"}" style="position:absolute;top:8px;right:8px;z-index:1;">${isFav ? FAV_STAR_SOLID : FAV_STAR_OUTLINE}</button>
      <div class="stock-row-grid">
        <div class="stock-identity">
          <div class="stock-name">${stock.name || stock.ticker}</div>
          <div class="stock-meta">${capCategory(stock)} · ${normalizeSector(stock.sector)}</div>
        </div>
        ${metricChip("ROE", roe, formatPct(roe), roeColor)}
        ${metricChip("D/E", de, formatRatio(de), deColor)}
        ${metricChip("EPS", cagr, formatPct(cagr), cagrColor)}
        <div class="stock-price">
          <div class="price-main">${formatCurrency(cmp)}</div>
        </div>
        <div class="row-actions">
          <button class="row-menu-btn" data-menu-ticker="${stock.ticker}" aria-label="Delete">${TRASH_ICON}</button>
        </div>
      </div>
      <div class="since-added-row">
        <span class="muted">Since watchlisted</span>
        <span style="color:var(${sinceColor}); font-weight:500;">${sinceText}</span>
        ${addedDateText ? `<span class="muted">· added ${addedDateText}</span>` : ""}
      </div>
    </div>`;
}

const SORT_SELECT_HTML = `<select id="watchlist-sort" style="font-size:11px; padding:2px 6px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text); height:24px;">
  <option value="default">Order added</option>
  <option value="since-asc">Since watchlisted ↑</option>
  <option value="since-desc">Since watchlisted ↓</option>
  <option value="pe-asc">P/E low→high</option>
  <option value="eps-desc">EPS CAGR high→low</option>
  <option value="roe-desc">ROE high→low</option>
  <option value="stale">Stalest first</option>
</select>`;

const watchlistScreen = {
  async render() {
    // Restore persisted filter/sort/fav state from uiState Set (always a Set — see ui-state.js)
    const savedFilters = window.uiState.watchlistFilters; // Set
    const savedFavOnly = window.uiState?.watchlistFavOnly || false;

    const filterChips = ["mainboard","sme","reit"].map(f =>
      `<button class="wl-chip${savedFilters.has(f) ? " wl-chip-active" : ""}" data-filter="${f}">${
        f === "mainboard" ? "Mainboard" : f === "sme" ? "SME" : "REIT / InvIT"
      }</button>`
    ).join("");

    return `
      <div class="screen-padding">
        <div id="index-bar" class="index-bar">
          <span class="index-item muted" id="idx-sensex">SENSEX —</span>
          <span class="index-divider">·</span>
          <span class="index-item muted" id="idx-nifty">NIFTY —</span>
          <span class="index-refresh-time muted" id="idx-time"></span>
        </div>
        <div class="screen-header">
          <div class="screen-title">My watchlist <span id="watchlist-count" class="muted"></span></div>
          <div class="header-actions">
            <button id="goals-btn" class="btn btn-small" onclick="window.location.hash='#goals'" title="Financial goals">🎯 Goals</button>
            <button id="drive-push-btn" class="btn btn-small" style="display:none;" title="Save to Drive">↑ Drive</button>
            <button id="refresh-prices-btn" class="btn btn-small">↻ Prices</button>
            <button id="add-stock-btn" class="btn btn-small">+ Add</button>
          </div>
        </div>
        <div id="alert-banner" style="display:none; margin-bottom:8px; padding:8px 12px; background:var(--color-red-bg); border:0.5px solid var(--color-red); border-radius:var(--radius-md); font-size:12px; color:var(--color-red);"></div>
        <div id="refresh-progress" class="muted" style="font-size:11px; min-height:16px; margin-bottom:4px;"></div>
        <div id="drive-status-line" class="drive-status-line" style="display:flex; align-items:center; justify-content:space-between;"></div>
        <div style="display:flex; gap:6px; margin:8px 0 4px; flex-wrap:wrap; align-items:center;" id="wl-filter-chips">
          ${filterChips}
          <button class="wl-chip${savedFavOnly ? " wl-chip-active" : ""}" id="fav-filter-btn" data-filter="favOnly" title="Show favourites only" style="font-size:13px;">${savedFavOnly ? "★" : "☆"}</button>
        </div>
        <div id="watchlist-list" class="stock-list">
          <div class="loading">Loading...</div>
        </div>
      </div>`;
  },

  async afterRender() {
    // ── Market index bar ────────────────────────────────────────────────────
    const WORKER = "https://portfolio-tracker-nse-proxy.josephv-mec.workers.dev";

    function renderIndex(elId, label, data) {
      const el = document.getElementById(elId);
      if (!el) return;
      if (!data || data.current === null) {
        el.innerHTML = `<span class="muted">${label} —</span>`;
        return;
      }
      const up = data.changePct !== null && data.changePct >= 0;
      const color = up ? "var(--color-green)" : "var(--color-red)";
      const arrow = up ? "▲" : "▼";
      el.innerHTML = `
        <span style="font-weight:600;">${label}</span>
        <span style="margin-left:4px;">${data.current.toLocaleString("en-IN")}</span>
        <span style="color:${color}; margin-left:5px;">${arrow} ${data.changePct !== null ? Math.abs(data.changePct).toFixed(2) + "%" : ""}</span>`;
    }

    async function fetchIndices() {
      try {
        const [sensex, nifty] = await Promise.all([
          fetch(`${WORKER}/yf-index?symbol=%5EBSESN`).then(r => r.json()).catch(() => null),
          fetch(`${WORKER}/yf-index?symbol=%5ENSEI`).then(r => r.json()).catch(() => null),
        ]);
        renderIndex("idx-sensex", "SENSEX", sensex);
        renderIndex("idx-nifty", "NIFTY", nifty);
        const timeEl = document.getElementById("idx-time");
        if (timeEl) {
          const now = new Date();
          timeEl.textContent = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
        }
      } catch {
        // Silent — index bar is non-critical
      }
    }

    fetchIndices();
    // Auto-refresh every 5 minutes while the watchlist is open
    const indexRefreshTimer = setInterval(fetchIndices, 5 * 60 * 1000);
    // Clean up timer when navigating away (the router re-renders on hash change)
    window.addEventListener("hashchange", () => clearInterval(indexRefreshTimer), { once: true });

    const stocks = await StockStore.getActive();
    const settings = await MetaStore.getSettings();

    // Safety net: set watchlistPrice for any stock still missing it.
    let migrationHappened = false;
    for (const stock of stocks) {
      if (!stock.watchlistPrice && stock.fundamentals?.currentPrice) {
        stock.watchlistPrice = stock.fundamentals.currentPrice;
        await StockStore.set(stock.ticker, stock);
        migrationHappened = true;
      }
    }

    // Push to Drive immediately after migration so the next pull includes watchlistPrice
    if (migrationHappened && settings?.driveConnected) {
      try {
        const token = await getAccessToken({ silentOnly: true });
        if (token) {
          const localData = await exportAll();
          await pushToDrive(token, localData);
          settings.lastSyncPush = new Date().toISOString();
          await MetaStore.setSettings(settings);
        }
      } catch { /* non-critical */ }
    }

    const countEl = document.getElementById("watchlist-count");
    countEl.textContent = `· ${stocks.length} stock${stocks.length === 1 ? "" : "s"}`;

    // ── autoPush helper ───────────────────────────────────────────────
    async function autoPush() {
      if (!settings?.driveConnected) return;
      try {
        const token = await getAccessToken({ silentOnly: true });
        if (!token) return;
        const localData = await exportAll();
        await pushToDrive(token, localData);
        settings.lastSyncPush = new Date().toISOString();
        await MetaStore.setSettings(settings);
      } catch { /* non-critical */ }
    }

    // ── Sort dropdown wiring ──────────────────────────────────────────
    function wireSortDropdown() {
      const sel = document.getElementById("watchlist-sort");
      if (!sel) return;
      // Restore saved sort
      const saved = window.uiState?.watchlistSort || "default";
      if (sel.value !== saved) sel.value = saved;
      sel.addEventListener("change", () => {
        if (window.uiState) { window.uiState.watchlistSort = sel.value; uiStateSave(); }
        renderList();
      });
    }

    const driveLine = document.getElementById("drive-status-line");
    const drivePushBtn = document.getElementById("drive-push-btn");

    if (settings?.driveConnected) {
      driveLine.innerHTML = `<i>Drive connected · last pushed ${settings.lastSyncPush ? new Date(settings.lastSyncPush).toLocaleDateString("en-IN") : "never"}</i>${SORT_SELECT_HTML}`;
      wireSortDropdown();
      drivePushBtn.style.display = "";

      drivePushBtn.addEventListener("click", async () => {
        const progressEl = document.getElementById("refresh-progress");
        drivePushBtn.disabled = true;
        progressEl.textContent = "Saving to Drive...";
        try {
          const token = await getAccessToken({ silentOnly: true });
          if (!token) {
            progressEl.textContent = "⚠ Drive session expired — go to Settings → Sync now to refresh.";
            drivePushBtn.disabled = false;
            return;
          }
          const localData = await exportAll();
          await pushToDrive(token, localData);
          settings.lastSyncPush = new Date().toISOString();
          await MetaStore.setSettings(settings);
          driveLine.innerHTML = `<i>Drive connected · last pushed just now</i>${SORT_SELECT_HTML}`;
          wireSortDropdown();
          progressEl.textContent = "✓ Saved to Drive";
          setTimeout(() => { progressEl.textContent = ""; }, 3000);
        } catch (err) {
          progressEl.textContent = `⚠ Drive push failed: ${err.message}`;
        }
        drivePushBtn.disabled = false;
      });
    } else {
      driveLine.innerHTML = `<i>Working from local data only · <a href="#settings">Connect Drive</a></i>${SORT_SELECT_HTML}`;
      wireSortDropdown();
    }

    const listEl = document.getElementById("watchlist-list");

    // ── Filter state — use uiState.watchlistFilters Set directly (same pattern as holdings/analytics) ──
    const activeFilters = window.uiState.watchlistFilters; // always a Set, maintained by ui-state.js
    let favOnly = window.uiState?.watchlistFavOnly || false;

    document.querySelectorAll(".wl-chip[data-filter]").forEach(chip => {
      if (chip.id === "fav-filter-btn") return; // handled separately below
      chip.addEventListener("click", () => {
        const f = chip.dataset.filter;
        if (activeFilters.has(f)) activeFilters.delete(f);
        else activeFilters.add(f);
        chip.classList.toggle("wl-chip-active", activeFilters.has(f));
        uiStateSave();
        renderList();
      });
    });

    const favFilterBtn = document.getElementById("fav-filter-btn");
    if (favFilterBtn) {
      favFilterBtn.addEventListener("click", () => {
        favOnly = !favOnly;
        favFilterBtn.classList.toggle("wl-chip-active", favOnly);
        favFilterBtn.textContent = favOnly ? "★" : "☆";
        window.uiState.watchlistFavOnly = favOnly;
        uiStateSave();
        renderList();
      });
    }

    // ── Alert banner — stocks below alert price ───────────────────────
    function showAlertBanner(alertStocks) {
      if (alertStocks.length === 0) {
        alertBanner.style.display = "none";
        return;
      }
      alertBanner.style.display = "flex";
      alertBanner.style.alignItems = "flex-start";
      alertBanner.style.gap = "8px";
      alertBanner.innerHTML =
        `<span style="flex:1;">⚠ ${alertStocks.length} stock${alertStocks.length===1?"":"s"} below alert price: ` +
        alertStocks.map(s => `<strong>${s.name||s.ticker}</strong> ₹${s.fundamentals.currentPrice?.toLocaleString("en-IN")} &lt; ₹${s.alertPrice.toLocaleString("en-IN")}`).join(", ") +
        `</span><button style="background:none;border:none;cursor:pointer;color:var(--color-red);font-size:14px;line-height:1;flex-shrink:0;padding:0;" title="Dismiss">✕</button>`;
      alertBanner.querySelector("button").addEventListener("click", () => {
        alertBanner.style.display = "none";
      });
    }

    const alertBanner  = document.getElementById("alert-banner");
    const alertStocks  = stocks.filter(s => s.alertPrice && s.fundamentals?.currentPrice && s.fundamentals.currentPrice < s.alertPrice);
    showAlertBanner(alertStocks);

    // ── Sort function ─────────────────────────────────────────────────
    function sortStocks(arr, mode) {
      const sorted = [...arr];
      switch (mode) {
        case "since-desc": return sorted.sort((a,b) => {
          const ra = (a.fundamentals?.currentPrice&&a.watchlistPrice) ? (a.fundamentals.currentPrice-a.watchlistPrice)/a.watchlistPrice : null;
          const rb = (b.fundamentals?.currentPrice&&b.watchlistPrice) ? (b.fundamentals.currentPrice-b.watchlistPrice)/b.watchlistPrice : null;
          if (ra===null&&rb===null) return 0; if (ra===null) return 1; if (rb===null) return -1; return rb-ra;
        });
        case "since-asc": return sorted.sort((a,b) => {
          const ra = (a.fundamentals?.currentPrice&&a.watchlistPrice) ? (a.fundamentals.currentPrice-a.watchlistPrice)/a.watchlistPrice : null;
          const rb = (b.fundamentals?.currentPrice&&b.watchlistPrice) ? (b.fundamentals.currentPrice-b.watchlistPrice)/b.watchlistPrice : null;
          if (ra===null&&rb===null) return 0; if (ra===null) return 1; if (rb===null) return -1; return ra-rb;
        });
        case "pe-asc": return sorted.sort((a,b) => {
          const pa = a.priceContext?.peTTM??null, pb = b.priceContext?.peTTM??null;
          if (pa===null&&pb===null) return 0; if (pa===null) return 1; if (pb===null) return -1; return pa-pb;
        });
        case "eps-desc": return sorted.sort((a,b) => {
          const ea = epsCagr(a)??null, eb = epsCagr(b)??null;
          if (ea===null&&eb===null) return 0; if (ea===null) return 1; if (eb===null) return -1; return eb-ea;
        });
        case "roe-desc": return sorted.sort((a,b) => {
          const ra = roe5yAvg(a)??null, rb = roe5yAvg(b)??null;
          if (ra===null&&rb===null) return 0; if (ra===null) return 1; if (rb===null) return -1; return rb-ra;
        });
        case "stale": return sorted.sort((a,b) => {
          const da = a.fundamentals?.lastUpdated??"0", db = b.fundamentals?.lastUpdated??"0";
          return da.localeCompare(db);
        });
        default: return sorted.sort((a,b) => {
          // Latest added first
          const da = a.addedDate??"0000-00-00", db = b.addedDate??"0000-00-00";
          return db.localeCompare(da);
        });
      }
    }

    // ── Render list (called on load, filter/sort/fav changes) ─────────
    function renderList() {
      const sortMode = document.getElementById("watchlist-sort")?.value || window.uiState?.watchlistSort || "default";

      if (stocks.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No stocks yet. Tap "+ Add" to start tracking one.</div>`;
        return;
      }

      // Apply favOnly filter first
      let visible = favOnly ? stocks.filter(s => s.isFavorite) : stocks;

      let mainboard = visible.filter(s => !s.board || s.board === "mainboard");
      let satellite = visible.filter(s => s.board === "sme" || s.board === "microcap");
      let reitList  = visible.filter(s => s.board === "reit");

      mainboard = sortStocks(mainboard, sortMode);
      satellite = sortStocks(satellite, sortMode);
      reitList  = sortStocks(reitList,  sortMode);

      let html = "";
      if (activeFilters.has("mainboard") && mainboard.length > 0) {
        html += `<div class="watchlist-group-header">Mainboard <span class="muted">${mainboard.length}</span></div>`;
        html += mainboard.map(stockRow).join("");
      }
      if (activeFilters.has("sme") && satellite.length > 0) {
        html += `<div class="watchlist-group-header" style="margin-top:12px;">SME / Microcap <span class="muted">${satellite.length}</span></div>`;
        html += satellite.map(stockRow).join("");
      }
      if (activeFilters.has("reit") && reitList.length > 0) {
        html += `<div class="watchlist-group-header" style="margin-top:12px;">REIT / InvIT <span class="muted">${reitList.length}</span></div>`;
        html += reitList.map(reitRow).join("");
      }
      if (!html) html = `<div class="empty-state muted">No stocks match the selected filters.</div>`;
      listEl.innerHTML = html;
      wireRowEvents();
    }

    function wireRowEvents() {
      listEl.querySelectorAll(".stock-row").forEach(row => {
        row.addEventListener("click", (e) => {
          // Skip nav if clicking fav-btn or trash btn
          if (e.target.closest(".row-menu-btn") || e.target.closest(".fav-btn")) return;
          window.location.hash = `#stock/${encodeURIComponent(row.dataset.ticker)}`;
        });
      });

      // Favourite toggle
      listEl.querySelectorAll(".fav-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ticker = btn.dataset.favTicker;
          const s = stocks.find(x => x.ticker === ticker);
          if (!s) return;
          s.isFavorite = !s.isFavorite;
          await StockStore.set(ticker, s);
          autoPush().catch(() => {});
          // Update icon and class immediately without full re-render
          btn.innerHTML = s.isFavorite ? FAV_STAR_SOLID : FAV_STAR_OUTLINE;
          btn.classList.toggle("fav-btn-active", s.isFavorite);
          btn.closest(".stock-row")?.classList.toggle("stock-row-fav", s.isFavorite);
          btn.setAttribute("aria-label", s.isFavorite ? "Unfavourite" : "Favourite");
          btn.setAttribute("title", s.isFavorite ? "Unfavourite" : "Favourite");
          // If favOnly filter is on, re-render to remove/add the row
          if (favOnly) renderList();
        });
      });

      // Trash / delete
      listEl.querySelectorAll(".row-menu-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ticker = btn.dataset.menuTicker;
          const s = stocks.find(x => x.ticker === ticker);
          const label = s?.name || ticker;
          if (confirm(`Delete ${label}? This permanently removes all data for this stock.`)) {
            await deleteStockPermanently(ticker);
            autoPush().catch(() => {});
            // Remove from local array and re-render without full navigation
            const idx = stocks.findIndex(x => x.ticker === ticker);
            if (idx !== -1) stocks.splice(idx, 1);
            countEl.textContent = `· ${stocks.length} stock${stocks.length === 1 ? "" : "s"}`;
            renderList();
          }
        });
      });
    }

    // Initial list render
    renderList();

    document.getElementById("add-stock-btn").addEventListener("click", () => {
      window.location.hash = "#addStock";
    });

    // ── Parallel batch price refresh ──────────────────────────────────
    const BATCH_SIZE = 5;

    async function refreshOne(stock) {
      try {
        const result = await refreshStockFromNse(stock.ticker, stock.yahooSymbol || null, stock.exchange || null);
        if (!result.quoteInfo) return false;

        const fresh = await StockStore.get(stock.ticker);
        if (!fresh) return false;
        const today = new Date().toISOString().slice(0, 10);

        fresh.fundamentals = fresh.fundamentals || {};
        if (result.quoteInfo.currentPrice)  fresh.fundamentals.currentPrice  = result.quoteInfo.currentPrice;
        if (result.quoteInfo.marketCap)     fresh.fundamentals.marketCap     = result.quoteInfo.marketCap;
        if (result.quoteInfo.sector && !fresh.sector) fresh.sector = result.quoteInfo.sector;

        fresh.priceContext = fresh.priceContext || {};
        fresh.priceContext.source      = result.quoteInfo.source;
        fresh.priceContext.lastUpdated = today;
        // REIT/InvIT: Yahoo 52w data is unreliable — keep indianapi values
        if (fresh.board !== "reit") {
          if (result.quoteInfo.week52High) fresh.priceContext.week52High = result.quoteInfo.week52High;
          if (result.quoteInfo.week52Low)  fresh.priceContext.week52Low  = result.quoteInfo.week52Low;
        }
        if (result.quoteInfo.todayLow)      fresh.priceContext.todayLow      = result.quoteInfo.todayLow;
        if (result.quoteInfo.todayHigh)     fresh.priceContext.todayHigh     = result.quoteInfo.todayHigh;
        if (result.quoteInfo.previousClose) fresh.priceContext.previousClose = result.quoteInfo.previousClose;
        if (result.quoteInfo.dayChangePct != null) fresh.priceContext.dayChangePct = result.quoteInfo.dayChangePct;

        if (!fresh.watchlistPrice && result.quoteInfo.currentPrice) {
          fresh.watchlistPrice = result.quoteInfo.currentPrice;
        }

        if (!result.quoteInfo.marketCap && !fresh.fundamentals.marketCap) {
          const derived = calculateMarketCap(fresh);
          if (derived) fresh.fundamentals.marketCap = derived;
        }

        await StockStore.set(stock.ticker, fresh);
        // Update local in-memory stocks array so re-render reflects new price
        const idx = stocks.findIndex(x => x.ticker === stock.ticker);
        if (idx !== -1) stocks[idx] = fresh;
        return true;
      } catch {
        return false;
      }
    }

    document.getElementById("refresh-prices-btn").addEventListener("click", async () => {
      if (stocks.length === 0) return;
      const btn = document.getElementById("refresh-prices-btn");
      const progressEl = document.getElementById("refresh-progress");
      btn.disabled = true;

      let updated = 0, failed = 0;
      const total = stocks.length;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        progressEl.textContent = `Fetching ${i + 1}–${Math.min(i + BATCH_SIZE, total)} of ${total}…`;

        const results = await Promise.allSettled(batch.map(refreshOne));
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) updated++;
          else failed++;
        }
      }

      const summary = failed === 0
        ? `✓ All ${updated} prices updated`
        : `✓ ${updated} updated · ${failed} failed`;
      progressEl.textContent = summary;
      btn.disabled = false;
      setTimeout(() => { progressEl.textContent = ""; }, 5000);

      // Push to Drive after batch refresh
      autoPush().catch(() => {});

      // Save portfolio snapshot now that prices are fresh
      savePortfolioSnapshot().catch(() => {});

      renderList();
      const freshAlerts = stocks.filter(s => s.alertPrice && s.fundamentals?.currentPrice && s.fundamentals.currentPrice < s.alertPrice);
      showAlertBanner(freshAlerts);
    });
  },
};

registerScreen("watchlist", watchlistScreen);