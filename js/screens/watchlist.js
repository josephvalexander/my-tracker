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

function stockRow(stock) {
  const roe = roe5yAvg(stock);
  const de = debtToEquity(stock);
  const cagr = epsCagr(stock);
  const cmp = stock.fundamentals?.currentPrice ?? null;

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
        </div>
        <button class="row-menu-btn" data-menu-ticker="${stock.ticker}" aria-label="Row options">&#8942;</button>
      </div>
    </div>`;
}

const watchlistScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-header">
          <div class="screen-title">My watchlist <span id="watchlist-count" class="muted"></span></div>
          <div class="header-actions">
            <button id="drive-push-btn" class="btn btn-small" style="display:none;" title="Save to Drive">↑ Drive</button>
            <button id="refresh-prices-btn" class="btn btn-small">↻ Prices</button>
            <button id="add-stock-btn" class="btn btn-small">+ Add</button>
          </div>
        </div>
        <div id="refresh-progress" class="muted" style="font-size:11px; min-height:16px; margin-bottom:4px;"></div>
        <div id="drive-status-line" class="drive-status-line"></div>
        <div id="watchlist-list" class="stock-list">
          <div class="loading">Loading...</div>
        </div>
      </div>`;
  },

  async afterRender() {
    const stocks = await StockStore.getActive();
    const countEl = document.getElementById("watchlist-count");
    countEl.textContent = `· ${stocks.length} stock${stocks.length === 1 ? "" : "s"}`;

    const settings = await MetaStore.getSettings();
    const driveLine = document.getElementById("drive-status-line");
    const drivePushBtn = document.getElementById("drive-push-btn");

    if (settings?.driveConnected) {
      driveLine.innerHTML = `<i>Drive connected · last pushed ${settings.lastSyncPush ? new Date(settings.lastSyncPush).toLocaleDateString("en-IN") : "never"}</i> <a href="#settings">Manage</a>`;
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
          driveLine.innerHTML = `<i>Drive connected · last pushed just now</i> <a href="#settings">Manage</a>`;
          progressEl.textContent = "✓ Saved to Drive";
          setTimeout(() => { progressEl.textContent = ""; }, 3000);
        } catch (err) {
          progressEl.textContent = `⚠ Drive push failed: ${err.message}`;
        }
        drivePushBtn.disabled = false;
      });
    } else {
      driveLine.innerHTML = `<i>Working from local data only</i> <a href="#settings">Connect Drive</a>`;
    }

    const listEl = document.getElementById("watchlist-list");
    if (stocks.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No stocks yet. Tap "+ Add" to start tracking one.</div>`;
    } else {
      listEl.innerHTML = stocks.map(stockRow).join("");
    }

    listEl.querySelectorAll(".stock-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".row-menu-btn")) return;
        window.location.hash = `#stock/${row.dataset.ticker}`;
      });
    });

    listEl.querySelectorAll(".row-menu-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ticker = btn.dataset.menuTicker;
        const confirmed = confirm(`Delete ${ticker}? This permanently removes all data for this stock and cannot be undone.`);
        if (confirmed) {
          await deleteStockPermanently(ticker);
          navigate("#watchlist");
        }
      });
    });

    document.getElementById("add-stock-btn").addEventListener("click", () => {
      window.location.hash = "#addStock";
    });

    // ── Batch price refresh ──────────────────────────────────────────
    document.getElementById("refresh-prices-btn").addEventListener("click", async () => {
      if (stocks.length === 0) return;
      const btn = document.getElementById("refresh-prices-btn");
      const progressEl = document.getElementById("refresh-progress");
      btn.disabled = true;

      let updated = 0;
      let failed = 0;

      for (const stock of stocks) {
        progressEl.textContent = `Fetching ${stock.ticker}… (${updated + failed + 1}/${stocks.length})`;

        try {
          const result = await refreshStockFromNse(stock.ticker);
          if (result.quoteInfo) {
            const fresh = await StockStore.get(stock.ticker);
            const today = new Date().toISOString().slice(0, 10);

            fresh.fundamentals = fresh.fundamentals || {};
            if (result.quoteInfo.currentPrice) fresh.fundamentals.currentPrice = result.quoteInfo.currentPrice;
            if (result.quoteInfo.marketCap) fresh.fundamentals.marketCap = result.quoteInfo.marketCap;
            if (result.quoteInfo.sector && !fresh.sector) fresh.sector = result.quoteInfo.sector;

            fresh.priceContext = fresh.priceContext || {};
            fresh.priceContext.source = result.quoteInfo.source;
            fresh.priceContext.lastUpdated = today;
            if (result.quoteInfo.week52High) fresh.priceContext.week52High = result.quoteInfo.week52High;
            if (result.quoteInfo.week52Low)  fresh.priceContext.week52Low  = result.quoteInfo.week52Low;
            if (result.quoteInfo.todayLow)   fresh.priceContext.todayLow   = result.quoteInfo.todayLow;
            if (result.quoteInfo.todayHigh)  fresh.priceContext.todayHigh  = result.quoteInfo.todayHigh;
            if (result.quoteInfo.previousClose) fresh.priceContext.previousClose = result.quoteInfo.previousClose;

            // Recalculate derived market cap if YF didn't return one
            if (!result.quoteInfo.marketCap) {
              const derived = calculateMarketCap(fresh);
              if (derived) fresh.fundamentals.marketCap = derived;
            }

            await StockStore.set(stock.ticker, fresh);

            // Update the price cell in the list in-place without a full re-render
            const priceMain = document.querySelector(`.stock-row[data-ticker="${stock.ticker}"] .price-main`);
            if (priceMain) {
              priceMain.textContent = formatCurrency(result.quoteInfo.currentPrice);
            }
            updated++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      const summary = failed === 0
        ? `✓ All ${updated} prices updated`
        : `✓ ${updated} updated · ${failed} failed`;
      progressEl.textContent = summary;
      btn.disabled = false;

      // Clear the progress message after 5 seconds
      setTimeout(() => { progressEl.textContent = ""; }, 5000);
    });
  },
};

registerScreen("watchlist", watchlistScreen);
