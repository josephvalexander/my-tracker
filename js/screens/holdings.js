/**
 * screens/holdings.js
 *
 * Holdings tab. Each holding uses a tax-lot model (lots array).
 * Tap a holding row to expand/collapse its lot list.
 * Summary row shows: invested, current value, P&L, total dividends.
 */

const PENCIL_SVG = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const TRASH_SVG  = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

function lotRows(row) {
  if (!row.lots?.length) return `<div class="lot-empty muted">No lots recorded.</div>`;
  return row.lots.map((lot, i) => `
    <div class="lot-row" data-lot-idx="${i}">
      <div class="lot-display">
        <span class="muted" style="font-size:11px;">${lot.purchaseDate || "Date unknown"}</span>
        <span>${lot.quantity} shares @ ₹${lot.buyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <div class="lot-actions">
          <button class="lot-edit-btn icon-btn" data-ticker="${row.ticker}" data-lot-idx="${i}" title="Edit lot">${PENCIL_SVG}</button>
          <button class="lot-delete-btn icon-btn icon-btn-danger" data-ticker="${row.ticker}" data-lot-idx="${i}" title="Delete lot">${TRASH_SVG}</button>
        </div>
      </div>
      <div class="lot-edit-form" style="display:none;">
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          <input type="date" class="lot-date-input" value="${lot.purchaseDate || ""}" style="flex:1; min-width:120px;" />
          <input type="number" class="lot-qty-input" value="${lot.quantity}" min="1" step="1" placeholder="Qty" style="flex:0.6; min-width:70px;" />
          <input type="number" class="lot-price-input" value="${lot.buyPrice}" step="0.01" placeholder="Price" style="flex:0.8; min-width:90px;" />
        </div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <button class="btn btn-small btn-primary lot-save-btn" data-ticker="${row.ticker}" data-lot-idx="${i}">Save</button>
          <button class="btn btn-small lot-cancel-btn" data-ticker="${row.ticker}" data-lot-idx="${i}">Cancel</button>
        </div>
      </div>
    </div>`).join("");
}

function holdingRow(row, color) {
  const pClass = row.profitPct === null ? "muted" : row.profitPct >= 0 ? "text-good" : "text-bad";
  const pText  = row.profitPct === null ? "—" : `${row.profitPct >= 0 ? "+" : ""}${row.profitPct.toFixed(1)}%`;
  const divText = row.dividends > 0 ? formatCurrencyShort(row.dividends) : "—";

  return `
    <div class="holding-row" data-ticker="${row.ticker}">
      <div class="holding-row-top holding-row-tap" data-ticker="${row.ticker}" style="cursor:pointer;">
        <div>
          <div class="stock-name">${row.ticker}</div>
          <div class="stock-meta">${row.quantity.toLocaleString()} shares · avg ₹${row.avgBuyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div class="holding-row-right">
          <div class="price-main">${formatCurrency(row.currentPrice)}</div>
          <div class="${pClass}">${pText}</div>
        </div>
        <div class="holding-row-actions">
          <button class="holding-remove-btn icon-btn icon-btn-danger" data-ticker="${row.ticker}" title="Remove holding">${TRASH_SVG}</button>
        </div>
      </div>

      <div class="allocation-bar-track">
        <div class="allocation-bar-fill" style="width:${row.allocationPct ?? 0}%; background:${color}"></div>
      </div>
      <div class="holding-row-bottom">
        <span>${formatCurrencyShort(row.invested)} inv</span>
        <span>${formatCurrencyShort(row.currentValue)} cur</span>
        <span>div ${divText}</span>
        <span>${row.allocationPct !== null ? row.allocationPct.toFixed(0) : "—"}% alloc</span>
      </div>

      <!-- Accordion: lots + add lot — hidden by default -->
      <div class="lot-accordion" style="display:none;">
        <div class="lot-header">
          <span class="section-label" style="margin:0;">Tax lots</span>
          <button class="btn btn-small add-lot-btn" data-ticker="${row.ticker}">+ Add lot</button>
        </div>
        <div class="lot-add-form" style="display:none;">
          <div style="display:flex; gap:6px; margin:8px 0; flex-wrap:wrap;">
            <input type="date" class="new-lot-date" style="flex:1; min-width:120px;" />
            <input type="number" class="new-lot-qty" min="1" step="1" placeholder="Qty" style="flex:0.6; min-width:70px;" />
            <input type="number" class="new-lot-price" step="0.01" placeholder="Buy price ₹" style="flex:0.8; min-width:90px;" />
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-small btn-primary save-new-lot-btn" data-ticker="${row.ticker}">Save lot</button>
            <button class="btn btn-small cancel-new-lot-btn" data-ticker="${row.ticker}">Cancel</button>
          </div>
        </div>
        <div class="lot-list">${lotRows(row)}</div>
      </div>
    </div>`;
}

const PALETTE = ["#534AB7","#378ADD","#1D9E75","#D85A30","#D4537E","#BA7517"];

const holdingsScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-header">
          <div class="screen-title">My holdings <span id="holdings-count" class="muted"></span></div>
          <button id="add-holding-btn" class="btn btn-small">+ Add position</button>
        </div>
        <div id="holdings-summary" class="metric-grid-4"></div>
        <div id="holdings-list" class="stock-list"></div>
      </div>`;
  },

  async afterRender() {
    const holdings  = await HoldingStore.getAll();
    const allStocks = await StockStore.getAll();
    const priceMap  = {};
    const divMap    = {};
    allStocks.forEach((s) => {
      priceMap[s.ticker] = s.fundamentals?.currentPrice ?? null;
      divMap[s.ticker]   = s.corporateActions?.dividends ?? [];
    });

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

    const summary = buildHoldingsSummary(holdings, priceMap, divMap);

    document.getElementById("holdings-summary").innerHTML = `
      <div class="metric-card-box"><div class="metric-card-label">Invested</div><div class="metric-card-value">${formatCurrencyShort(summary.totalInvested)}</div></div>
      <div class="metric-card-box"><div class="metric-card-label">Current</div><div class="metric-card-value">${formatCurrencyShort(summary.totalCurrentValue)}</div></div>
      <div class="metric-card-box" id="overall-metric-box" style="cursor:default;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
          <span class="metric-card-label" id="overall-mode-label">Overall</span>
          ${summary.xirrPct !== null ? `
            <div style="display:flex; border:0.5px solid var(--color-border); border-radius:4px; overflow:hidden; font-size:9px;">
              <button id="toggle-abs" style="padding:1px 5px; background:var(--color-text); color:var(--color-surface); border:none; cursor:pointer; font-size:9px;">Abs</button>
              <button id="toggle-xirr" style="padding:1px 5px; background:none; color:var(--color-text-secondary); border:none; cursor:pointer; font-size:9px;">XIRR</button>
            </div>` : ""}
        </div>
        <div class="metric-card-value ${(summary.overallProfitPct ?? 0) >= 0 ? "text-good" : "text-bad"}" id="overall-value">
          ${summary.overallProfitPct !== null ? (summary.overallProfitPct >= 0 ? "+" : "") + summary.overallProfitPct.toFixed(1) + "%" : "—"}
        </div>
      </div>
      <div class="metric-card-box" id="div-summary-card" style="cursor:pointer;" title="Tap to see dividend breakdown">
        <div class="metric-card-label">Dividends ↗</div>
        <div class="metric-card-value">${formatCurrencyShort(summary.totalDividends)}</div>
      </div>
    `;

    // ── Abs / XIRR toggle ────────────────────────────────────────────
    const toggleAbs  = document.getElementById("toggle-abs");
    const toggleXirr = document.getElementById("toggle-xirr");
    const overallVal = document.getElementById("overall-value");

    if (toggleAbs && toggleXirr && overallVal) {
      const absText  = summary.overallProfitPct !== null
        ? `${summary.overallProfitPct >= 0 ? "+" : ""}${summary.overallProfitPct.toFixed(1)}%` : "—";
      const xirrText = summary.xirrPct !== null
        ? `${summary.xirrPct >= 0 ? "+" : ""}${summary.xirrPct.toFixed(1)}%` : "—";
      const absCls  = (summary.overallProfitPct ?? 0) >= 0 ? "text-good" : "text-bad";
      const xirrCls = (summary.xirrPct ?? 0) >= 0 ? "text-good" : "text-bad";

      function setMode(mode) {
        if (mode === "abs") {
          overallVal.textContent = absText;
          overallVal.className = `metric-card-value ${absCls}`;
          toggleAbs.style.background  = "var(--color-text)";
          toggleAbs.style.color       = "var(--color-surface)";
          toggleXirr.style.background = "none";
          toggleXirr.style.color      = "var(--color-text-secondary)";
        } else {
          overallVal.textContent = xirrText;
          overallVal.className = `metric-card-value ${xirrCls}`;
          toggleXirr.style.background = "var(--color-text)";
          toggleXirr.style.color      = "var(--color-surface)";
          toggleAbs.style.background  = "none";
          toggleAbs.style.color       = "var(--color-text-secondary)";
        }
      }

      toggleAbs.addEventListener("click",  (e) => { e.stopPropagation(); setMode("abs"); });
      toggleXirr.addEventListener("click", (e) => { e.stopPropagation(); setMode("xirr"); });
    }

    // ── Dividend detail modal ─────────────────────────────────────────
    // Build data: for each holding, for each lot, for each dividend — collect eligible entries
    // Build dividend entries per holding per dividend
    // Key insight: lots with no purchaseDate are treated as a single combined
    // position (summed) per dividend to avoid duplicates when multiple legacy
    // lots all have null dates.
    const divEntries = [];
    const modalToday = new Date(); modalToday.setHours(23, 59, 59, 0);
    for (const h of holdings) {
      const divs = divMap[h.ticker] ?? [];
      const lots = h.lots?.length ? h.lots : [{ purchaseDate: null, quantity: h.quantity ?? 0, buyPrice: h.avgBuyPrice ?? 0 }];

      for (const div of divs) {
        if (!div.amount) continue;
        // Use recordDate first, fall back to announced date
        const dateStr = div.recordDate || div.announced || null;
        const recordDate = dateStr ? new Date(dateStr) : null;
        if (recordDate && recordDate > modalToday) continue; // future — not yet paid
        // Indian FY: Apr–Mar. Date in May 2026 → FY2027, Jan 2026 → FY2026
        const fy = recordDate
          ? (recordDate.getMonth() >= 3 ? recordDate.getFullYear() + 1 : recordDate.getFullYear())
          : null;
        const divDate = dateStr || "—";
        const divFY   = fy ? `FY${fy}` : "Unknown";

        // Separate dated and undated lots
        const datedLots   = lots.filter(l => l.purchaseDate);
        const undatedTotal = lots.filter(l => !l.purchaseDate).reduce((s, l) => s + (l.quantity || 0), 0);

        // Credit dated lots individually (only if purchased on or before record date)
        for (const lot of datedLots) {
          const lotDate = new Date(lot.purchaseDate);
          if (!recordDate || lotDate <= recordDate) {
            divEntries.push({ ticker: h.ticker, lotDate: lot.purchaseDate, divDate, divFY,
              amountPerShare: div.amount, qty: lot.quantity, total: lot.quantity * div.amount });
          }
        }
        // Credit all undated shares as one combined entry (avoids duplicates)
        if (undatedTotal > 0) {
          divEntries.push({ ticker: h.ticker, lotDate: "—", divDate, divFY,
            amountPerShare: div.amount, qty: undatedTotal, total: undatedTotal * div.amount });
        }
      }
    }

    // Get unique FYs for the filter
    const allFYs = [...new Set(divEntries.map(e => e.divFY))].sort().reverse();

    // Inject modal HTML
    const modalHtml = `
      <div id="div-modal-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:200; overflow-y:auto; padding:20px;">
        <div style="background:var(--color-surface); border-radius:var(--radius-lg); max-width:520px; margin:0 auto; padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:15px; font-weight:600;">Dividend breakdown</div>
            <button id="div-modal-close" class="btn btn-small">✕ Close</button>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center;">
            <span class="muted" style="font-size:12px;">Filter by FY:</span>
            <button class="fy-filter-btn btn btn-small ${allFYs.length === 0 ? "" : ""}" data-fy="all" style="background:var(--color-text); color:var(--color-surface);">All</button>
            ${allFYs.map(fy => `<button class="fy-filter-btn btn btn-small" data-fy="${fy}">${fy}</button>`).join("")}
          </div>
          <div id="div-modal-total" style="font-size:13px; font-weight:600; margin-bottom:8px;"></div>
          <div id="div-modal-table" style="overflow-x:auto;"></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    function renderDivTable(fyFilter) {
      const filtered = fyFilter === "all" ? divEntries : divEntries.filter(e => e.divFY === fyFilter);
      // Group by ticker
      const byTicker = {};
      filtered.forEach(e => {
        if (!byTicker[e.ticker]) byTicker[e.ticker] = { total: 0, entries: [] };
        byTicker[e.ticker].total += e.total;
        byTicker[e.ticker].entries.push(e);
      });
      const grandTotal = filtered.reduce((s, e) => s + e.total, 0);
      document.getElementById("div-modal-total").textContent =
        `Total: ₹${Math.round(grandTotal).toLocaleString("en-IN")}`;

      if (filtered.length === 0) {
        document.getElementById("div-modal-table").innerHTML = `<div class="muted" style="font-size:13px;">No dividends for this period.</div>`;
        return;
      }
      const rows = Object.entries(byTicker)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([ticker, data]) => `
          <div style="margin-bottom:12px;">
            <div style="font-size:13px; font-weight:600; padding:4px 0; border-bottom:0.5px solid var(--color-border);">
              ${ticker} — ₹${Math.round(data.total).toLocaleString("en-IN")} total
            </div>
            ${data.entries.map(e => `
              <div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0; border-bottom:0.5px solid var(--color-border); gap:8px; flex-wrap:wrap;">
                <span class="muted">${e.divDate} (${e.divFY})</span>
                <span>${e.qty.toLocaleString()} × ₹${e.amountPerShare}</span>
                <span style="font-weight:500;">₹${Math.round(e.total).toLocaleString("en-IN")}</span>
              </div>`).join("")}
          </div>`).join("");
      document.getElementById("div-modal-table").innerHTML = rows;
    }

    document.getElementById("div-summary-card").addEventListener("click", () => {
      renderDivTable("all");
      document.getElementById("div-modal-overlay").style.display = "block";
    });
    document.getElementById("div-modal-close").addEventListener("click", () => {
      document.getElementById("div-modal-overlay").style.display = "none";
    });
    document.getElementById("div-modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "div-modal-overlay") {
        document.getElementById("div-modal-overlay").style.display = "none";
      }
    });
    document.querySelectorAll(".fy-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".fy-filter-btn").forEach(b => {
          b.style.background = ""; b.style.color = "";
        });
        btn.style.background = "var(--color-text)";
        btn.style.color = "var(--color-surface)";
        renderDivTable(btn.dataset.fy);
      });
    });

    document.getElementById("holdings-list").innerHTML = summary.rows
      .map((row, i) => holdingRow(row, PALETTE[i % PALETTE.length]))
      .join("");

    // ── Accordion toggle on tap ───────────────────────────────────────
    document.querySelectorAll(".holding-row-tap").forEach((tap) => {
      tap.addEventListener("click", (e) => {
        if (e.target.closest("button")) return; // don't toggle when tapping buttons
        const holdingRow = tap.closest(".holding-row");
        const accordion  = holdingRow.querySelector(".lot-accordion");
        const isOpen = accordion.style.display !== "none";
        accordion.style.display = isOpen ? "none" : "block";
      });
    });

    // ── Add lot — show form ───────────────────────────────────────────
    document.querySelectorAll(".add-lot-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const form = btn.closest(".lot-accordion").querySelector(".lot-add-form");
        form.style.display = form.style.display === "none" ? "block" : "none";
      });
    });

    document.querySelectorAll(".cancel-new-lot-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".lot-add-form").style.display = "none";
      });
    });

    document.querySelectorAll(".save-new-lot-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticker = btn.dataset.ticker;
        const form   = btn.closest(".lot-add-form");
        const date   = form.querySelector(".new-lot-date").value || null;
        const qty    = parseFloat(form.querySelector(".new-lot-qty").value);
        const price  = parseFloat(form.querySelector(".new-lot-price").value);
        if (!qty || !price) { alert("Enter quantity and price."); return; }
        const holding = await HoldingStore.get(ticker);
        holding.lots  = holding.lots || [];
        holding.lots.push({ id: `lot_${Date.now()}`, purchaseDate: date, quantity: qty, buyPrice: price });
        await HoldingStore.set(ticker, holding);
        navigate("#holdings");
      });
    });

    // ── Edit lot ─────────────────────────────────────────────────────
    document.querySelectorAll(".lot-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lotRow  = btn.closest(".lot-row");
        const display = lotRow.querySelector(".lot-display");
        const form    = lotRow.querySelector(".lot-edit-form");
        const isOpen  = form.style.display !== "none";
        form.style.display    = isOpen ? "none" : "block";
        display.style.display = isOpen ? ""     : "none";
      });
    });

    document.querySelectorAll(".lot-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lotRow  = btn.closest(".lot-row");
        lotRow.querySelector(".lot-edit-form").style.display = "none";
        lotRow.querySelector(".lot-display").style.display   = "";
      });
    });

    document.querySelectorAll(".lot-save-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticker  = btn.dataset.ticker;
        const idx     = parseInt(btn.dataset.lotIdx);
        const lotRow  = btn.closest(".lot-row");
        const date    = lotRow.querySelector(".lot-date-input").value  || null;
        const qty     = parseFloat(lotRow.querySelector(".lot-qty-input").value);
        const price   = parseFloat(lotRow.querySelector(".lot-price-input").value);
        if (!qty || !price) { alert("Enter quantity and price."); return; }
        const holding = await HoldingStore.get(ticker);
        holding.lots[idx] = { ...holding.lots[idx], purchaseDate: date, quantity: qty, buyPrice: price };
        await HoldingStore.set(ticker, holding);
        navigate("#holdings");
      });
    });

    // ── Delete lot ───────────────────────────────────────────────────
    document.querySelectorAll(".lot-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ticker = btn.dataset.ticker;
        const idx    = parseInt(btn.dataset.lotIdx);
        const holding = await HoldingStore.get(ticker);
        if (holding.lots.length === 1) {
          if (!confirm("Deleting the last lot will remove this holding entirely.")) return;
          await HoldingStore.remove(ticker);
        } else {
          holding.lots.splice(idx, 1);
          await HoldingStore.set(ticker, holding);
        }
        navigate("#holdings");
      });
    });

    // ── Remove entire holding ─────────────────────────────────────────
    document.querySelectorAll(".holding-remove-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ticker = btn.dataset.ticker;
        if (!confirm(`Remove ${ticker} from your holdings? The stock stays on your watchlist.`)) return;
        await HoldingStore.remove(ticker);
        navigate("#holdings");
      });
    });
  },
};

registerScreen("holdings", holdingsScreen);