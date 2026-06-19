/**
 * screens/watchlist.js
 *
 * Home screen. Lists active stocks with the 3 scan-fast metrics
 * (ROE, D/E, EPS CAGR) color-coded, plus entry-zone status. Pulls real
 * data via StockStore and computes ratios via calculations.js — nothing
 * here is hardcoded sample data.
 */

function metricChip(label, value, formatted, colorClass) {
  const cls = colorClass ? `chip chip-${colorClass}` : "chip chip-neutral";
  return `
    <div class="metric-col">
      <div class="metric-label">${label}</div>
      <div class="${cls}">${formatted}</div>
    </div>`;
}

function formatPct(v, decimals = 0) {
  return v === null || v === undefined ? "—" : `${v.toFixed(decimals)}%`;
}

function formatRatio(v, decimals = 2) {
  return v === null || v === undefined ? "—" : v.toFixed(decimals);
}

function formatCurrency(v) {
  return v === null || v === undefined ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function entryZoneBanner(stock) {
  const status = entryZoneStatus(stock);
  if (!status) {
    return `<div class="zone-banner zone-neutral"><span>No target price set</span></div>`;
  }
  if (status.inZone) {
    return `<div class="zone-banner zone-good">
      <span>In entry zone — target ₹${status.target.toLocaleString("en-IN")}, now ${Math.abs(status.pctFromTarget).toFixed(0)}% below</span>
    </div>`;
  }
  return `<div class="zone-banner zone-wait">
    <span>${status.pctFromTarget.toFixed(0)}% above target ₹${status.target.toLocaleString("en-IN")} — wait</span>
  </div>`;
}

function stockRow(stock) {
  const roe = roe5yAvg(stock);
  const de = debtToEquity(stock);
  const cagr = epsCagr(stock);
  const cmp = stock.fundamentals?.currentPrice ?? null;
  const iv = stock.intrinsicValue;

  const roeColor = colorForMetric(roe, DEFAULT_RULES.roe);
  const deColor = colorForMetric(de, DEFAULT_RULES.de);
  const cagrColor = colorForMetric(cagr, DEFAULT_RULES.epsCagr);

  return `
    <div class="stock-row" data-ticker="${stock.ticker}">
      <div class="stock-row-grid">
        <div class="stock-identity">
          <div class="stock-name">${stock.name || stock.ticker}</div>
          <div class="stock-meta">${stock.ticker} · ${stock.sector || "Sector not set"}</div>
        </div>
        ${metricChip("ROE", roe, formatPct(roe), roeColor)}
        ${metricChip("D/E", de, formatRatio(de), deColor)}
        ${metricChip("EPS CAGR", cagr, formatPct(cagr), cagrColor)}
        <div class="stock-price">
          <div class="price-main">${formatCurrency(cmp)}</div>
          <div class="price-sub">${iv ? `IV ₹${iv.low.toLocaleString("en-IN")}+` : "No IV set"}</div>
        </div>
      </div>
      ${entryZoneBanner(stock)}
    </div>`;
}

const watchlistScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-header">
          <div class="screen-title">My watchlist <span id="watchlist-count" class="muted"></span></div>
          <div class="header-actions">
            <button id="sync-btn" class="btn btn-small">Sync</button>
            <button id="add-stock-btn" class="btn btn-small">+ Add</button>
          </div>
        </div>
        <div id="watchlist-list" class="stock-list">
          <div class="loading">Loading...</div>
        </div>
      </div>`;
  },

  async afterRender() {
    const stocks = await StockStore.getActive();
    const countEl = document.getElementById("watchlist-count");
    countEl.textContent = `· ${stocks.length} stock${stocks.length === 1 ? "" : "s"}`;

    const listEl = document.getElementById("watchlist-list");
    if (stocks.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No stocks yet. Tap "+ Add" to start tracking one.</div>`;
    } else {
      listEl.innerHTML = stocks.map(stockRow).join("");
    }

    listEl.querySelectorAll(".stock-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.hash = `#stock/${row.dataset.ticker}`;
      });
    });

    document.getElementById("add-stock-btn").addEventListener("click", () => {
      window.location.hash = "#addStock";
    });

    document.getElementById("sync-btn").addEventListener("click", () => {
      window.location.hash = "#settings/sync";
    });
  },
};

registerScreen("watchlist", watchlistScreen);
