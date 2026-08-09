/**
 * screens/addHolding.js
 *
 * Add a new lot to an existing holding, or create a new holding
 * with its first lot. Date is now required (tax lot model).
 * If the stock already has a holding, the new entry is merged
 * as an additional lot — not a replacement.
 */

const addHoldingScreen = {
  async render() {
    const stocks = await StockStore.getActive();
    if (stocks.length === 0) {
      return `
        <div class="screen-padding">
          <div class="detail-header">
            <button class="back-btn" onclick="window.location.hash='#holdings'">&larr;</button>
            <div class="detail-title"><div class="detail-name">Add lot</div></div>
          </div>
          <div class="empty-state">Add stocks to your watchlist first.</div>
        </div>`;
    }

    const options = stocks.map((s) =>
      `<option value="${s.ticker}">${s.name || s.ticker} (${s.ticker})</option>`
    ).join("");

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#holdings'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Add lot</div></div>
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
            <label>Purchase date</label>
            <input type="date" id="holding-date-input" value="${new Date().toISOString().slice(0,10)}" />
          </div>
          <div class="form-group">
            <label>Quantity (shares)</label>
            <input type="number" id="holding-qty-input" min="1" step="1" placeholder="e.g. 50" />
          </div>
          <div class="form-group">
            <label>Buy price per share (₹)</label>
            <input type="number" id="holding-price-input" step="0.01" placeholder="e.g. 1640.50" />
          </div>
          <div id="holding-save-status" class="muted" style="font-size:12px; margin-bottom:8px;"></div>
          <button id="save-holding-btn" class="btn btn-primary">Add lot</button>
        </div>
      </div>`;
  },

  async afterRender() {
    const existingHoldings = await HoldingStore.getAll();
    const existingMap = {};
    existingHoldings.forEach((h) => { existingMap[h.ticker] = h; });

    const select    = document.getElementById("holding-ticker-select");
    const noteEl    = document.getElementById("existing-holding-note");
    const qtyInput  = document.getElementById("holding-qty-input");
    const priceInput = document.getElementById("holding-price-input");

    select.addEventListener("change", () => {
      const ticker   = select.value;
      const existing = existingMap[ticker];
      if (existing) {
        const qty = totalQuantity(existing);
        const avg = avgBuyPrice(existing);
        const lots = existing.lots?.length ?? 1;
        noteEl.textContent = `Already holding ${qty.toLocaleString()} shares across ${lots} lot${lots === 1 ? "" : "s"} at ₹${avg.toFixed(2)} avg — this will add a new lot.`;
      } else {
        noteEl.textContent = "";
      }
    });

    document.getElementById("save-holding-btn").addEventListener("click", async () => {
      const ticker   = select.value;
      const date     = document.getElementById("holding-date-input").value || null;
      const qty      = parseFloat(qtyInput.value);
      const price    = parseFloat(priceInput.value);
      const statusEl = document.getElementById("holding-save-status");

      if (!ticker)              { statusEl.textContent = "Select a stock first.";      return; }
      if (!qty   || qty <= 0)   { statusEl.textContent = "Enter a valid quantity.";    return; }
      if (!price || price <= 0) { statusEl.textContent = "Enter a valid price.";       return; }

      const newLot = { id: `lot_${Date.now()}`, purchaseDate: date, quantity: qty, buyPrice: price };

      const existing = existingMap[ticker];
      if (existing) {
        // Merge: add new lot to existing holding
        existing.lots = existing.lots || [
          // Migrate legacy single-lot format
          { id: `lot_migrated`, purchaseDate: null, quantity: existing.quantity, buyPrice: existing.avgBuyPrice }
        ];
        existing.lots.push(newLot);
        await HoldingStore.set(ticker, existing);
      } else {
        await HoldingStore.set(ticker, { ticker, lots: [newLot] });
      }
      window.location.hash = "#holdings";
    });
  },
};

registerScreen("addHolding", addHoldingScreen);
