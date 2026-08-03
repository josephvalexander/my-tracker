/**
 * screens/addHolding.js
 *
 * Add or edit a holding position. Only stocks already on the watchlist
 * can be added as holdings — the ticker is selected from a dropdown of
 * active stocks. Quantity and average buy price are entered manually.
 */

const addHoldingScreen = {
  async render() {
    const stocks = await StockStore.getActive();
    const existingHoldings = await HoldingStore.getAll();
    const existingTickers = new Set(existingHoldings.map((h) => h.ticker));

    const options = stocks
      .map((s) => `<option value="${s.ticker}">${s.name || s.ticker} (${s.ticker})</option>`)
      .join("");

    if (stocks.length === 0) {
      return `
        <div class="screen-padding">
          <div class="detail-header">
            <button class="back-btn" onclick="window.location.hash='#holdings'">&larr;</button>
            <div class="detail-title"><div class="detail-name">Add position</div></div>
          </div>
          <div class="empty-state">Add stocks to your watchlist first, then track your holdings here.</div>
        </div>`;
    }

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#holdings'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Add position</div></div>
        </div>

        <div class="card" style="margin-top:16px;">
          <div class="form-group">
            <label>Stock</label>
            <select id="holding-ticker-select">
              <option value="">— Select a stock —</option>
              ${options}
            </select>
            <div id="existing-holding-note" class="muted" style="font-size:11px; margin-top:4px;"></div>
          </div>

          <div class="form-group">
            <label>Quantity (shares)</label>
            <input type="number" id="holding-qty-input" min="1" step="1" placeholder="e.g. 50" />
          </div>

          <div class="form-group">
            <label>Average buy price (₹)</label>
            <input type="number" id="holding-price-input" step="0.01" placeholder="e.g. 1640.50" />
          </div>

          <div class="form-group">
            <label>Date of purchase <span class="muted">(optional)</span></label>
            <input type="date" id="holding-date-input" value="${new Date().toISOString().slice(0, 10)}" />
          </div>

          <div id="holding-save-status" class="muted" style="font-size:12px; margin-bottom:8px;"></div>
          <button id="save-holding-btn" class="btn btn-primary">Save position</button>
        </div>
      </div>`;
  },

  async afterRender() {
    const existingHoldings = await HoldingStore.getAll();
    const existingMap = {};
    existingHoldings.forEach((h) => { existingMap[h.ticker] = h; });

    const select = document.getElementById("holding-ticker-select");
    const noteEl = document.getElementById("existing-holding-note");
    const qtyInput = document.getElementById("holding-qty-input");
    const priceInput = document.getElementById("holding-price-input");
    const dateInput = document.getElementById("holding-date-input");

    select.addEventListener("change", () => {
      const ticker = select.value;
      const existing = existingMap[ticker];
      if (existing) {
        noteEl.textContent = `You already have ${existing.quantity} shares at ₹${existing.avgBuyPrice} avg — saving will replace this.`;
        qtyInput.value = existing.quantity;
        priceInput.value = existing.avgBuyPrice;
        dateInput.value = existing.purchaseDate || new Date().toISOString().slice(0, 10);
      } else {
        noteEl.textContent = "";
        qtyInput.value = "";
        priceInput.value = "";
      }
    });

    document.getElementById("save-holding-btn").addEventListener("click", async () => {
      const ticker = select.value;
      const qty = parseFloat(qtyInput.value);
      const price = parseFloat(priceInput.value);
      const date = dateInput.value;
      const statusEl = document.getElementById("holding-save-status");

      if (!ticker) { statusEl.textContent = "Select a stock first."; return; }
      if (!qty || qty <= 0) { statusEl.textContent = "Enter a valid quantity."; return; }
      if (!price || price <= 0) { statusEl.textContent = "Enter a valid buy price."; return; }

      await HoldingStore.set(ticker, {
        ticker,
        quantity: qty,
        avgBuyPrice: price,
        purchaseDate: date || null,
      });

      navigate("#holdings");
    });
  },
};

registerScreen("addHolding", addHoldingScreen);
