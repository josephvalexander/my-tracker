/**
 * screens/batchRefresh.js
 *
 * Refresh shareholding, bulk deals, corporate actions, and live price
 * for multiple watchlist stocks in one pass. Same NSE session covers
 * all of it — one browser visit to NSE, then fetch each selected stock
 * with a short delay between requests (nseClient.js batchRefresh) to
 * avoid looking like scripted traffic.
 */

const batchRefreshScreen = {
  async render() {
    const stocks = await StockStore.getActive();
    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#watchlist'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Refresh from NSE</div></div>
        </div>

        <div class="card">
          <div class="nse-step">
            <span class="nse-step-num">1</span>
            <span>Open NSE, let it fully load (covers all stocks below)</span>
            <button class="btn btn-small" id="batch-nse-open-btn">Open</button>
          </div>
          <div class="nse-step">
            <span class="nse-step-num">2</span>
            <span>Select stocks below, then fetch</span>
          </div>
        </div>

        <div class="section-label">Select stocks <span id="select-count" class="muted"></span></div>
        <div class="card" style="padding:4px 14px;">
          ${stocks
            .map(
              (s) => `
            <label class="batch-select-row">
              <input type="checkbox" class="batch-stock-checkbox" value="${s.ticker}" checked />
              <span class="stock-name" style="flex:1;">${s.name || s.ticker}</span>
              <span class="muted" style="font-size:11px;">last fetched ${s.shareholding?.lastUpdated || "never"}</span>
            </label>`
            )
            .join("")}
        </div>

        <button id="batch-fetch-btn" class="btn btn-primary" style="margin-top:12px;">Fetch selected stocks</button>

        <div id="batch-results" style="margin-top:14px;"></div>
      </div>`;
  },

  async afterRender() {
    function updateCount() {
      const checked = document.querySelectorAll(".batch-stock-checkbox:checked").length;
      document.getElementById("select-count").textContent = `· ${checked} selected`;
    }
    document.querySelectorAll(".batch-stock-checkbox").forEach((cb) => cb.addEventListener("change", updateCount));
    updateCount();

    document.getElementById("batch-nse-open-btn").addEventListener("click", () => {
      window.open("https://www.nseindia.com/", "_blank");
    });

    document.getElementById("batch-fetch-btn").addEventListener("click", async () => {
      const tickers = [...document.querySelectorAll(".batch-stock-checkbox:checked")].map((cb) => cb.value);
      if (tickers.length === 0) return;

      const resultsEl = document.getElementById("batch-results");
      resultsEl.innerHTML = tickers.map((t) => `<div class="card batch-result-row" id="batch-row-${t}">${t} — waiting...</div>`).join("");

      const today = new Date().toISOString().slice(0, 10);

      await batchRefresh(tickers, async (ticker, result) => {
        const stock = await StockStore.get(ticker);
        if (!stock) return;

        if (result.shareholding) stock.shareholding = { source: "nse_fetch", lastUpdated: today, history: result.shareholding };
        if (result.bulkDeals) stock.bulkDeals = { source: "nse_fetch", lastUpdated: today, deals: result.bulkDeals };
        if (result.corporateActions) stock.corporateActions = { source: "nse_fetch", lastUpdated: today, actions: result.corporateActions };
        if (result.quoteInfo) {
          stock.fundamentals = stock.fundamentals || {};
          if (result.quoteInfo.currentPrice) stock.fundamentals.currentPrice = result.quoteInfo.currentPrice;
          if (result.quoteInfo.marketCap) stock.fundamentals.marketCap = result.quoteInfo.marketCap;
          if (result.quoteInfo.sector) stock.sector = result.quoteInfo.sector;
          stock.priceContext = stock.priceContext || {};
          stock.priceContext.lastUpdated = today;
          if (result.quoteInfo.week52High) stock.priceContext.week52High = result.quoteInfo.week52High;
          if (result.quoteInfo.week52Low) stock.priceContext.week52Low = result.quoteInfo.week52Low;
        }
        await StockStore.set(ticker, stock);

        const errorCount = Object.keys(result.errors || {}).length;
        const rowEl = document.getElementById(`batch-row-${ticker}`);
        if (!rowEl) return;
        if (errorCount === 0) {
          rowEl.innerHTML = `<span class="stock-name">${ticker}</span> <span class="nse-fetch-success">✓ updated</span>`;
        } else if (result.partial) {
          rowEl.innerHTML = `<span class="stock-name">${ticker}</span> <span class="nse-fetch-partial">⚠ partial — ${Object.keys(result.errors).join(", ")} failed</span>`;
        } else {
          rowEl.innerHTML = `<span class="stock-name">${ticker}</span> <span class="nse-fetch-error">⚠ blocked by NSE's site policy — use manual entry on the stock's own page</span>`;
        }
      });
    });
  },
};

registerScreen("batchRefresh", batchRefreshScreen);
