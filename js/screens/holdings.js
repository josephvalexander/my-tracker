/**
 * screens/holdings.js
 *
 * My Holdings tab. Shows all positions with current value, P&L,
 * and allocation. Each row has inline edit (pencil icon expands
 * qty/price inputs) and a remove button.
 */

function holdingRow(row, allocationColor) {
  const profitClass = row.profitPct === null ? "muted" : row.profitPct >= 0 ? "text-good" : "text-bad";
  const profitText  = row.profitPct === null ? "—" : `${row.profitPct >= 0 ? "+" : ""}${row.profitPct.toFixed(1)}%`;

  return `
    <div class="holding-row" data-ticker="${row.ticker}">
      <div class="holding-row-top">
        <div>
          <div class="stock-name">${row.ticker}</div>
          <div class="stock-meta holding-display-meta">${row.quantity} shares · avg ₹${row.avgBuyPrice.toLocaleString("en-IN")}</div>
        </div>
        <div class="holding-row-right">
          <div class="price-main">${formatCurrency(row.currentPrice)}</div>
          <div class="${profitClass}">${profitText}</div>
        </div>
        <div class="holding-row-actions">
          <button class="holding-edit-btn icon-btn" data-ticker="${row.ticker}" title="Edit">✏</button>
          <button class="holding-remove-btn icon-btn icon-btn-danger" data-ticker="${row.ticker}" title="Remove">✕</button>
        </div>
      </div>

      <!-- Inline edit form — hidden by default -->
      <div class="holding-edit-form" style="display:none;">
        <div style="display:flex; gap:8px; margin-top:8px;">
          <div class="form-group" style="flex:1; margin-bottom:0;">
            <label style="font-size:11px;">Quantity</label>
            <input type="number" class="holding-qty-edit" min="1" step="1" value="${row.quantity}" />
          </div>
          <div class="form-group" style="flex:1; margin-bottom:0;">
            <label style="font-size:11px;">Avg buy price (₹)</label>
            <input type="number" class="holding-price-edit" step="0.01" value="${row.avgBuyPrice}" />
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-small btn-primary holding-save-edit" data-ticker="${row.ticker}">Save</button>
          <button class="btn btn-small holding-cancel-edit" data-ticker="${row.ticker}">Cancel</button>
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
    allStocks.forEach((s) => { priceMap[s.ticker] = s.fundamentals?.currentPrice ?? null; });

    document.getElementById("holdings-count").textContent =
      `· ${holdings.length} position${holdings.length === 1 ? "" : "s"}`;

    document.getElementById("add-holding-btn").addEventListener("click", () => {
      window.location.hash = "#addHolding";
    });

    if (holdings.length === 0) {
      document.getElementById("holdings-list").innerHTML =
        `<div class="empty-state">No holdings yet. Add a position to start tracking your actual portfolio.</div>`;
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

    // ── Edit button — toggle inline form ──────────────────────────────
    document.querySelectorAll(".holding-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".holding-row");
        const form = row.querySelector(".holding-edit-form");
        const meta = row.querySelector(".holding-display-meta");
        const isOpen = form.style.display !== "none";
        form.style.display = isOpen ? "none" : "block";
        meta.style.display = isOpen ? "" : "none";
        btn.textContent = isOpen ? "✏" : "✕";
        btn.title = isOpen ? "Edit" : "Cancel edit";
      });
    });

    // ── Cancel edit ───────────────────────────────────────────────────
    document.querySelectorAll(".holding-cancel-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".holding-row");
        const form = row.querySelector(".holding-edit-form");
        const meta = row.querySelector(".holding-display-meta");
        const editBtn = row.querySelector(".holding-edit-btn");
        form.style.display = "none";
        meta.style.display = "";
        editBtn.textContent = "✏";
        editBtn.title = "Edit";
      });
    });

    // ── Save inline edit ──────────────────────────────────────────────
    document.querySelectorAll(".holding-save-edit").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticker = btn.dataset.ticker;
        const row = btn.closest(".holding-row");
        const qty   = parseFloat(row.querySelector(".holding-qty-edit").value);
        const price = parseFloat(row.querySelector(".holding-price-edit").value);

        if (!qty || qty <= 0 || !price || price <= 0) {
          alert("Enter valid quantity and price.");
          return;
        }

        await HoldingStore.set(ticker, { ticker, quantity: qty, avgBuyPrice: price });
        navigate("#holdings");
      });
    });

    // ── Remove position ───────────────────────────────────────────────
    document.querySelectorAll(".holding-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticker = btn.dataset.ticker;
        if (!confirm(`Remove ${ticker} from your holdings? This only removes the position — the stock stays on your watchlist.`)) return;
        await HoldingStore.remove(ticker);
        navigate("#holdings");
      });
    });
  },
};

registerScreen("holdings", holdingsScreen);