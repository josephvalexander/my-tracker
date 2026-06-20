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

function entryZoneBanner(stock) {
  const status = entryZoneStatus(stock);
  if (!status) {
    return `<div class="zone-banner zone-neutral"><span>No target price set — add an intrinsic value estimate or set a target manually</span></div>`;
  }
  const targetLabel = status.isDefaulted
    ? `suggested target ₹${Math.round(status.target).toLocaleString("en-IN")} (15% below IV)`
    : `target ₹${Math.round(status.target).toLocaleString("en-IN")}`;
  if (status.inZone) {
    return `<div class="zone-banner zone-good">
      <span>In entry zone — ${targetLabel}, now ${Math.abs(status.pctFromTarget).toFixed(0)}% below</span>
    </div>`;
  }
  return `<div class="zone-banner zone-wait">
    <span>${status.pctFromTarget.toFixed(0)}% above ${targetLabel} — wait</span>
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
        <button class="row-menu-btn" data-menu-ticker="${stock.ticker}" aria-label="Row options">&#8942;</button>
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
      row.addEventListener("click", (e) => {
        if (e.target.closest(".row-menu-btn")) return; // don't navigate when the menu button itself was clicked
        window.location.hash = `#stock/${row.dataset.ticker}`;
      });
    });

    listEl.querySelectorAll(".row-menu-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ticker = btn.dataset.menuTicker;
        const confirmed = confirm(`Archive ${ticker}? It'll move to Archived (under Settings) — your notes and data stay intact and you can restore it anytime.`);
        if (confirmed) {
          await archiveStock(ticker);
          navigate("#watchlist");
        }
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
