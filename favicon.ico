/**
 * screens/holdings.js
 *
 * "My Holdings" tab. quantity and avgBuyPrice are manually entered per
 * the user's stated preference (max 10-12 stocks, entered once at buy
 * time). Everything else — current value, profit %, allocation % — is
 * computed live via holdingsCalculations.js against the linked Stock's
 * current price.
 */

function holdingRow(row, allocationColor) {
  const profitClass = row.profitPct === null ? "muted" : row.profitPct >= 0 ? "text-good" : "text-bad";
  const profitText = row.profitPct === null ? "—" : `${row.profitPct >= 0 ? "+" : ""}${row.profitPct.toFixed(1)}%`;

  return `
    <div class="holding-row">
      <div class="holding-row-top">
        <div>
          <div class="stock-name">${row.ticker}</div>
          <div class="stock-meta">${row.quantity} shares · avg ₹${row.avgBuyPrice.toLocaleString("en-IN")}</div>
        </div>
        <div class="holding-row-right">
          <div class="price-main">${formatCurrency(row.currentPrice)}</div>
          <div class="${profitClass}">${profitText}</div>
        </div>
      </div>
      <div class="allocation-bar-track">
        <div class="allocation-bar-fill" style="width:${row.allocationPct ?? 0}%; background:${allocationColor}"></div>
      </div>
      <div class="holding-row-bottom">
        <span>${formatCurrencyShort(row.currentValue)} current value</span>
        <span>${row.allocationPct !== null ? row.allocationPct.toFixed(0) : "—"}% of portfolio</span>
      </div>
    </div>`;
}

const PALETTE = ["#534AB7", "#378ADD", "#1D9E75", "#D85A30", "#D4537E", "#BA7517"];

const holdingsScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-header">
          <div class="screen-title">My holdings <span id="holdings-count" class="muted"></span></div>
          <button id="add-holding-btn" class="btn btn-small">+ Add position</button>
        </div>
        <div id="holdings-summary" class="metric-grid-3"></div>
        <div id="holdings-list" class="stock-list"></div>
      </div>`;
  },

  async afterRender() {
    const holdings = await HoldingStore.getAll();
    const allStocks = await StockStore.getAll();
    const priceMap = {};
    allStocks.forEach((s) => {
      priceMap[s.ticker] = s.fundamentals?.currentPrice ?? null;
    });

    document.getElementById("holdings-count").textContent = `· ${holdings.length} position${holdings.length === 1 ? "" : "s"}`;

    if (holdings.length === 0) {
      document.getElementById("holdings-list").innerHTML = `<div class="empty-state">No holdings yet. Add a position to start tracking your actual portfolio.</div>`;
      document.getElementById("add-holding-btn").addEventListener("click", () => {
        window.location.hash = "#addHolding";
      });
      return;
    }

    const summary = buildHoldingsSummary(holdings, priceMap);

    document.getElementById("holdings-summary").innerHTML = `
      <div class="metric-card-box"><div class="metric-card-label">Invested</div><div class="metric-card-value">${formatCurrencyShort(summary.totalInvested)}</div></div>
      <div class="metric-card-box"><div class="metric-card-label">Current value</div><div class="metric-card-value">${formatCurrencyShort(summary.totalCurrentValue)}</div></div>
      <div class="metric-card-box"><div class="metric-card-label">Overall</div><div class="metric-card-value ${summary.overallProfitPct >= 0 ? "text-good" : "text-bad"}">${summary.overallProfitPct !== null ? (summary.overallProfitPct >= 0 ? "+" : "") + summary.overallProfitPct.toFixed(1) + "%" : "—"}</div></div>
    `;

    document.getElementById("holdings-list").innerHTML = summary.rows
      .map((row, i) => holdingRow(row, PALETTE[i % PALETTE.length]))
      .join("");

    document.getElementById("add-holding-btn").addEventListener("click", () => {
      window.location.hash = "#addHolding";
    });
  },
};

registerScreen("holdings", holdingsScreen);
