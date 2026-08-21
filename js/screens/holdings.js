/**
 * screens/holdings.js
 * Tax-lot holdings with board filter (All / Mainboard / SME+Microcap),
 * Abs/XIRR overall toggle, and dividend breakdown modal.
 */

const PENCIL_SVG = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const TRASH_SVG  = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const SELL_SVG = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;

function lotRows(row) {
  if (!row.lots?.length) return `<div class="lot-empty muted">No lots recorded.</div>`;
  return row.lots.map((lot, i) => `
    <div class="lot-row" data-lot-idx="${i}">
      <div class="lot-display">
        <span class="muted" style="font-size:11px;">${lot.purchaseDate || "Date unknown"}</span>
        <span>${lot.quantity} shares @ ₹${lot.buyPrice.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
        <div class="lot-actions">
          <button class="lot-edit-btn icon-btn" data-ticker="${row.ticker}" data-lot-idx="${i}" title="Edit lot">${PENCIL_SVG}</button>
          <button class="lot-delete-btn icon-btn icon-btn-danger" data-ticker="${row.ticker}" data-lot-idx="${i}" title="Delete lot">${TRASH_SVG}</button>
        </div>
      </div>
      <div class="lot-edit-form" style="display:none;">
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          <input type="date" class="lot-date-input" value="${lot.purchaseDate||""}" style="flex:1;min-width:120px;" />
          <input type="number" class="lot-qty-input" value="${lot.quantity}" min="1" step="1" placeholder="Qty" style="flex:0.6;min-width:70px;" />
          <input type="number" class="lot-price-input" value="${lot.buyPrice}" step="0.01" placeholder="Price" style="flex:0.8;min-width:90px;" />
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
          <div class="stock-meta">${row.quantity.toLocaleString()} shares · avg ₹${row.avgBuyPrice.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
        <div class="holding-row-right">
          <div class="price-main">${formatCurrency(row.currentPrice)}</div>
          <div class="${pClass}">${pText}</div>
        </div>
        <div class="holding-row-actions">
          <button class="sell-lot-btn icon-btn" data-ticker="${row.ticker}" title="Record a sale" style="color:var(--color-red);">${SELL_SVG}</button>
          <button class="holding-remove-btn icon-btn icon-btn-danger" data-ticker="${row.ticker}" title="Remove holding">${TRASH_SVG}</button>
        </div>
      </div>
      <div class="sell-accordion" style="display:none;">
        <div style="padding:10px 0 4px; border-top:0.5px solid var(--color-border); margin-top:6px;">
          <div style="font-size:12px; font-weight:500; margin-bottom:8px; color:var(--color-red);">Record sale</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
            <div class="form-group" style="flex:1; min-width:110px; margin-bottom:0;">
              <label style="font-size:11px;">Sale date</label>
              <input type="date" class="sell-date-input" value="${new Date().toISOString().slice(0,10)}" />
            </div>
            <div class="form-group" style="flex:0.7; min-width:80px; margin-bottom:0;">
              <label style="font-size:11px;">Qty to sell</label>
              <input type="number" class="sell-qty-input" min="1" step="1" placeholder="Qty" />
            </div>
            <div class="form-group" style="flex:1; min-width:90px; margin-bottom:0;">
              <label style="font-size:11px;">Sell price (₹)</label>
              <input type="number" class="sell-price-input" step="0.01" placeholder="Price" />
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <label style="font-size:11px; display:flex; align-items:center; gap:4px;">
              <input type="checkbox" class="sell-manual-lot" /> Override FIFO — pick lots manually
            </label>
          </div>
          <div class="sell-preview" style="font-size:11px; color:var(--color-text-secondary); margin-bottom:8px;"></div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-small btn-primary confirm-sell-btn" data-ticker="${row.ticker}">Confirm sale</button>
            <button class="btn btn-small cancel-sell-btn" data-ticker="${row.ticker}">Cancel</button>
          </div>
        </div>
      </div>
      <div class="allocation-bar-track">
        <div class="allocation-bar-fill" style="width:${row.allocationPct??0}%; background:${color}"></div>
      </div>
      <div class="holding-row-bottom">
        <span>${formatCurrencyShort(row.invested)} inv</span>
        <span>${formatCurrencyShort(row.currentValue)} cur</span>
        <span>div ${divText}</span>
        <span>${row.allocationPct!==null?row.allocationPct.toFixed(0):"—"}% of portfolio</span>
      </div>
      <div class="lot-accordion" style="display:none;">
        <div class="lot-header">
          <span class="section-label" style="margin:0;">Tax lots</span>
          <button class="btn btn-small add-lot-btn" data-ticker="${row.ticker}">+ Add lot</button>
        </div>
        <div class="lot-add-form" style="display:none;">
          <div style="display:flex; gap:6px; margin:8px 0; flex-wrap:wrap;">
            <input type="date" class="new-lot-date" style="flex:1;min-width:120px;" />
            <input type="number" class="new-lot-qty" min="1" step="1" placeholder="Qty" style="flex:0.6;min-width:70px;" />
            <input type="number" class="new-lot-price" step="0.01" placeholder="Buy price ₹" style="flex:0.8;min-width:90px;" />
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

function renderSummaryCard(summary) {
  const absCls   = (summary.overallProfitPct ?? 0) >= 0 ? "text-good" : "text-bad";
  const absText  = summary.overallProfitPct !== null ? `${summary.overallProfitPct >= 0 ? "+" : ""}${summary.overallProfitPct.toFixed(1)}%` : "—";
  const xirrText = summary.xirrPct !== null ? `${summary.xirrPct >= 0 ? "+" : ""}${summary.xirrPct.toFixed(1)}%` : null;

  document.getElementById("holdings-summary").innerHTML = `
    <div class="metric-card-box"><div class="metric-card-label">Invested</div><div class="metric-card-value">${formatCurrencyShort(summary.totalInvested)}</div></div>
    <div class="metric-card-box"><div class="metric-card-label">Current</div><div class="metric-card-value">${formatCurrencyShort(summary.totalCurrentValue)}</div></div>
    <div class="metric-card-box" id="overall-metric-box">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <span class="metric-card-label">Overall</span>
        ${xirrText ? `<div style="display:flex;border:0.5px solid var(--color-border);border-radius:4px;overflow:hidden;">
          <button id="toggle-abs"  style="padding:1px 5px;background:var(--color-text);color:var(--color-surface);border:none;cursor:pointer;font-size:9px;">Abs</button>
          <button id="toggle-xirr" style="padding:1px 5px;background:none;color:var(--color-text-secondary);border:none;cursor:pointer;font-size:9px;">XIRR</button>
        </div>` : ""}
      </div>
      <div class="metric-card-value ${absCls}" id="overall-value">${absText}</div>
    </div>
    <div class="metric-card-box" id="div-summary-card" style="cursor:pointer;" title="Tap to see dividend breakdown">
      <div class="metric-card-label">Dividends ↗</div>
      <div class="metric-card-value">${formatCurrencyShort(summary.totalDividends)}</div>
    </div>`;

  // Abs/XIRR toggle
  const tA = document.getElementById("toggle-abs");
  const tX = document.getElementById("toggle-xirr");
  const oV = document.getElementById("overall-value");
  if (tA && tX && oV && xirrText) {
    const xirrCls = (summary.xirrPct ?? 0) >= 0 ? "text-good" : "text-bad";
    function setMode(m) {
      if (m === "abs") {
        oV.textContent = absText; oV.className = `metric-card-value ${absCls}`;
        tA.style.background = "var(--color-text)"; tA.style.color = "var(--color-surface)";
        tX.style.background = "none"; tX.style.color = "var(--color-text-secondary)";
      } else {
        oV.textContent = xirrText; oV.className = `metric-card-value ${xirrCls}`;
        tX.style.background = "var(--color-text)"; tX.style.color = "var(--color-surface)";
        tA.style.background = "none"; tA.style.color = "var(--color-text-secondary)";
      }
    }
    tA.addEventListener("click", e => { e.stopPropagation(); setMode("abs"); });
    tX.addEventListener("click", e => { e.stopPropagation(); setMode("xirr"); });
  }
}

function wireLotHandlers() {
  document.querySelectorAll(".holding-row-tap").forEach(tap => {
    tap.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      const acc = tap.closest(".holding-row").querySelector(".lot-accordion");
      acc.style.display = acc.style.display !== "none" ? "none" : "block";
    });
  });
  document.querySelectorAll(".add-lot-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.closest(".lot-accordion").querySelector(".lot-add-form");
      f.style.display = f.style.display === "none" ? "block" : "none";
    });
  });
  document.querySelectorAll(".cancel-new-lot-btn").forEach(btn => {
    btn.addEventListener("click", () => { btn.closest(".lot-add-form").style.display = "none"; });
  });
  document.querySelectorAll(".save-new-lot-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ticker = btn.dataset.ticker;
      const form = btn.closest(".lot-add-form");
      const date = form.querySelector(".new-lot-date").value || null;
      const qty  = parseFloat(form.querySelector(".new-lot-qty").value);
      const price= parseFloat(form.querySelector(".new-lot-price").value);
      if (!qty || !price) { alert("Enter quantity and price."); return; }
      const h = await HoldingStore.get(ticker);
      h.lots = h.lots || [];
      h.lots.push({ id:`lot_${Date.now()}`, purchaseDate:date, quantity:qty, buyPrice:price });
      await HoldingStore.set(ticker, h);
      navigate("#holdings");
    });
  });
  document.querySelectorAll(".lot-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const lr = btn.closest(".lot-row");
      const isOpen = lr.querySelector(".lot-edit-form").style.display !== "none";
      lr.querySelector(".lot-edit-form").style.display = isOpen ? "none" : "block";
      lr.querySelector(".lot-display").style.display   = isOpen ? "" : "none";
    });
  });
  document.querySelectorAll(".lot-cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const lr = btn.closest(".lot-row");
      lr.querySelector(".lot-edit-form").style.display = "none";
      lr.querySelector(".lot-display").style.display = "";
    });
  });
  document.querySelectorAll(".lot-save-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ticker = btn.dataset.ticker;
      const idx = parseInt(btn.dataset.lotIdx);
      const lr = btn.closest(".lot-row");
      const date = lr.querySelector(".lot-date-input").value || null;
      const qty  = parseFloat(lr.querySelector(".lot-qty-input").value);
      const price= parseFloat(lr.querySelector(".lot-price-input").value);
      if (!qty || !price) { alert("Enter quantity and price."); return; }
      const h = await HoldingStore.get(ticker);
      h.lots[idx] = { ...h.lots[idx], purchaseDate:date, quantity:qty, buyPrice:price };
      await HoldingStore.set(ticker, h);
      navigate("#holdings");
    });
  });
  document.querySelectorAll(".lot-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ticker = btn.dataset.ticker;
      const idx = parseInt(btn.dataset.lotIdx);
      const h = await HoldingStore.get(ticker);
      if (h.lots.length === 1) {
        if (!confirm("Deleting the last lot will remove this holding entirely.")) return;
        await HoldingStore.remove(ticker);
      } else {
        h.lots.splice(idx, 1);
        await HoldingStore.set(ticker, h);
      }
      navigate("#holdings");
    });
  });

    // ── Sell handlers ────────────────────────────────────────────────
    document.querySelectorAll(".sell-lot-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const acc = btn.closest(".holding-row").querySelector(".sell-accordion");
        acc.style.display = acc.style.display !== "none" ? "none" : "block";
      });
    });

    document.querySelectorAll(".cancel-sell-btn").forEach(btn => {
      btn.addEventListener("click", () => { btn.closest(".sell-accordion").style.display = "none"; });
    });

    function fifoMatch(lots, qtyToSell, saleDate) {
      const dated   = [...lots].map((l,i)=>({...l,origIdx:i})).filter(l=>l.purchaseDate && l.purchaseDate<=saleDate).sort((a,b)=>a.purchaseDate.localeCompare(b.purchaseDate));
      const undated = [...lots].map((l,i)=>({...l,origIdx:i})).filter(l=>!l.purchaseDate);
      const queue   = [...dated, ...undated];
      const consumed=[]; let remaining=qtyToSell;
      for (const lot of queue) {
        if (remaining<=0) break;
        const take=Math.min(lot.quantity, remaining);
        consumed.push({lotId:lot.id, origIdx:lot.origIdx, qty:take, buyPrice:lot.buyPrice, buyDate:lot.purchaseDate});
        remaining-=take;
      }
      return {consumed, unmatched:remaining};
    }

    function holdingPeriodType(buyDate, sellDate) {
      if (!buyDate) return "Unknown";
      return (new Date(sellDate)-new Date(buyDate))/(30.44*86400000)>=12 ? "LTCG" : "STCG";
    }

    document.querySelectorAll(".sell-qty-input,.sell-price-input,.sell-date-input").forEach(input => {
      input.addEventListener("input", () => {
        const hRow = input.closest(".holding-row");
        const ticker = hRow.dataset.ticker;
        const previewEl = hRow.querySelector(".sell-preview");
        const qty   = parseFloat(hRow.querySelector(".sell-qty-input").value);
        const price = parseFloat(hRow.querySelector(".sell-price-input").value);
        const date  = hRow.querySelector(".sell-date-input").value;
        const summaryRow = summary.rows.find(r=>r.ticker===ticker);
        if (!summaryRow||!qty||!price||!date){previewEl.textContent="";return;}
        if (qty>summaryRow.quantity){previewEl.textContent="⚠ Exceeds holding.";previewEl.style.color="var(--color-red)";return;}
        const h = holdings.find(h=>h.ticker===ticker);
        const {consumed, unmatched} = fifoMatch(h.lots||[], qty, date);
        if (unmatched>0){previewEl.textContent=`⚠ Only ${qty-unmatched} shares matchable via FIFO.`;return;}
        const pnl = qty*price - consumed.reduce((s,c)=>s+c.qty*c.buyPrice,0);
        const types = [...new Set(consumed.map(c=>holdingPeriodType(c.buyDate,date)))].join("/");
        previewEl.style.color = pnl>=0?"var(--color-green)":"var(--color-red)";
        previewEl.textContent = `FIFO: ${consumed.length} lot(s) · P&L ${pnl>=0?"+":""}₹${Math.round(pnl).toLocaleString("en-IN")} · ${types}`;
      });
    });

    document.querySelectorAll(".confirm-sell-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ticker  = btn.dataset.ticker;
        const hRow    = btn.closest(".holding-row");
        const qty     = parseFloat(hRow.querySelector(".sell-qty-input").value);
        const price   = parseFloat(hRow.querySelector(".sell-price-input").value);
        const date    = hRow.querySelector(".sell-date-input").value;
        if (!qty||!price||!date){alert("Enter date, quantity and sell price.");return;}
        const holding = await HoldingStore.get(ticker);
        const lots    = holding.lots||[];
        const totalQty = lots.reduce((s,l)=>s+(l.quantity||0),0);
        if (qty>totalQty){alert(`Cannot sell ${qty} — only ${totalQty} shares held.`);return;}
        const {consumed,unmatched} = fifoMatch(lots, qty, date);
        if (unmatched>0){alert("Not enough dated lots for FIFO. Add purchase dates to lots first.");return;}
        const updatedLots = lots.map(l=>({...l}));
        consumed.forEach(c=>{updatedLots[c.origIdx].quantity-=c.qty;});
        holding.lots  = updatedLots.filter(l=>l.quantity>0);
        holding.sells = holding.sells||[];
        holding.sells.push({
          id:`sell_${Date.now()}`, date, quantity:qty, sellPrice:price,
          lotsConsumed: consumed.map(c=>({lotId:c.lotId, quantity:c.qty, buyPrice:c.buyPrice, buyDate:c.buyDate, type:holdingPeriodType(c.buyDate,date), pnl:Math.round((price-c.buyPrice)*c.qty)})),
        });
        if (holding.lots.reduce((s,l)=>s+(l.quantity||0),0)===0) {
          const stock = await StockStore.get(ticker);
          if (stock){stock.status="archived";stock.archivedDate=date;stock.archiveReason=`Fully sold on ${date}`;stock.sellHistory=holding.sells;await StockStore.set(ticker,stock);}
          await HoldingStore.remove(ticker);
          alert(`${ticker} fully sold and archived.`);
        } else {
          await HoldingStore.set(ticker, holding);
        }
        navigate("#holdings");
      });
    });

  document.querySelectorAll(".holding-remove-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const ticker = btn.dataset.ticker;
      if (!confirm(`Remove ${ticker} from your holdings? The stock stays on your watchlist.`)) return;
      await HoldingStore.remove(ticker);
      navigate("#holdings");
    });
  });
}

function buildDivEntries(filteredHoldings, divMap) {
  const entries = [];
  const today = new Date(); today.setHours(23,59,59,0);
  for (const h of filteredHoldings) {
    const divs = divMap[h.ticker] ?? [];
    const lots = h.lots?.length ? h.lots : [{ purchaseDate:null, quantity:h.quantity??0, buyPrice:h.avgBuyPrice??0 }];
    for (const div of divs) {
      if (!div.amount) continue;
      const dateStr = div.recordDate || div.announced || null;
      const recordDate = dateStr ? new Date(dateStr) : null;
      if (recordDate && recordDate > today) continue;
      const fy = recordDate ? (recordDate.getMonth()>=3 ? recordDate.getFullYear()+1 : recordDate.getFullYear()) : null;
      const divDate = dateStr || "—";
      const divFY   = fy ? `FY${fy}` : "Unknown";
      // Total quantity eligible at this dividend date — one row per dividend per holding
      const eligibleQty = lots.reduce((sum, lot) => {
        if (!lot.purchaseDate) return sum + (lot.quantity || 0); // undated = assume eligible
        if (!recordDate || new Date(lot.purchaseDate) <= recordDate) return sum + (lot.quantity || 0);
        return sum;
      }, 0);
      if (eligibleQty > 0)
        entries.push({ ticker:h.ticker, divDate, divFY, amountPerShare:div.amount, qty:eligibleQty, total:eligibleQty*div.amount });
    }
  }
  return entries;
}

function wireDividendModal(filteredHoldings, divMap) {
  const divEntries = buildDivEntries(filteredHoldings, divMap);
  const allFYs = [...new Set(divEntries.map(e => e.divFY))].sort().reverse();
  const existing = document.getElementById("div-modal-overlay");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div id="div-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:200;overflow-y:auto;padding:20px;">
      <div style="background:var(--color-surface);border-radius:var(--radius-lg);max-width:520px;margin:0 auto;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:15px;font-weight:600;">Dividend breakdown</div>
          <button id="div-modal-close" class="btn btn-small">✕ Close</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          <span class="muted" style="font-size:12px;">Filter by FY:</span>
          <button class="fy-filter-btn btn btn-small" data-fy="all" style="background:var(--color-text);color:var(--color-surface);">All</button>
          ${allFYs.map(fy=>`<button class="fy-filter-btn btn btn-small" data-fy="${fy}">${fy}</button>`).join("")}
        </div>
        <div id="div-modal-total" style="font-size:13px;font-weight:600;margin-bottom:8px;"></div>
        <div id="div-modal-table" style="overflow-x:auto;"></div>
      </div>
    </div>`);
  function renderDivTable(fyFilter) {
    const filtered = fyFilter==="all" ? divEntries : divEntries.filter(e=>e.divFY===fyFilter);
    const byTicker = {};
    filtered.forEach(e => { if(!byTicker[e.ticker]) byTicker[e.ticker]={total:0,entries:[]}; byTicker[e.ticker].total+=e.total; byTicker[e.ticker].entries.push(e); });
    const grand = filtered.reduce((s,e)=>s+e.total,0);
    document.getElementById("div-modal-total").textContent = `Total: ₹${Math.round(grand).toLocaleString("en-IN")}`;
    if (filtered.length===0) { document.getElementById("div-modal-table").innerHTML=`<div class="muted" style="font-size:13px;">No dividends for this period.</div>`; return; }
    document.getElementById("div-modal-table").innerHTML = Object.entries(byTicker).sort((a,b)=>b[1].total-a[1].total).map(([ticker,data])=>`
      <div style="margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;padding:4px 0;border-bottom:0.5px solid var(--color-border);">${ticker} — ₹${Math.round(data.total).toLocaleString("en-IN")} total</div>
        ${data.entries.map(e=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:0.5px solid var(--color-border);gap:8px;flex-wrap:wrap;">
          <span class="muted">${e.divDate} (${e.divFY})</span>
          <span>${e.qty.toLocaleString()} × ₹${e.amountPerShare}</span>
          <span style="font-weight:500;">₹${Math.round(e.total).toLocaleString("en-IN")}</span>
        </div>`).join("")}
      </div>`).join("");
  }
  document.getElementById("div-summary-card").addEventListener("click", () => { renderDivTable("all"); document.getElementById("div-modal-overlay").style.display="block"; });
  document.getElementById("div-modal-close").addEventListener("click", () => { document.getElementById("div-modal-overlay").style.display="none"; });
  document.getElementById("div-modal-overlay").addEventListener("click", e => { if(e.target.id==="div-modal-overlay") document.getElementById("div-modal-overlay").style.display="none"; });
  document.querySelectorAll(".fy-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".fy-filter-btn").forEach(b=>{b.style.background="";b.style.color="";});
      btn.style.background="var(--color-text)"; btn.style.color="var(--color-surface)";
      renderDivTable(btn.dataset.fy);
    });
  });
}

const holdingsScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-header">
          <div class="screen-title">My holdings <span id="holdings-count" class="muted"></span></div>
          <button id="add-holding-btn" class="btn btn-small">+ Add position</button>
        </div>
        <div class="toggle-row" style="margin-bottom:8px;">
          <button id="filter-all"       class="toggle-btn">All</button>
          <button id="filter-mainboard" class="toggle-btn toggle-btn-active">Mainboard</button>
          <button id="filter-sme"       class="toggle-btn">SME / Microcap</button>
        </div>
        <div id="holdings-summary" class="metric-grid-4"></div>
        <div id="holdings-list" class="stock-list"></div>
      </div>`;
  },

  async afterRender() {
    const holdings  = await HoldingStore.getAll();
    const allStocks = await StockStore.getAll();
    const priceMap  = {}, divMap = {};
    allStocks.forEach(s => {
      priceMap[s.ticker] = s.fundamentals?.currentPrice ?? null;
      divMap[s.ticker]   = s.corporateActions?.dividends ?? [];
    });

    document.getElementById("holdings-count").textContent =
      `· ${holdings.length} position${holdings.length===1?"":"s"}`;
    document.getElementById("add-holding-btn").addEventListener("click", () => { window.location.hash="#addHolding"; });

    let activeFilter = "mainboard";

    function filterHoldings() {
      if (activeFilter==="all") return holdings;
      if (activeFilter==="mainboard") return holdings.filter(h => {
        const s = allStocks.find(x=>x.ticker===h.ticker);
        return isMainboard(s||{});
      });
      return holdings.filter(h => {
        const s = allStocks.find(x=>x.ticker===h.ticker);
        return s?.board==="sme" || s?.board==="microcap";
      });
    }

    function applyFilter() {
      const filtered = filterHoldings();
      if (filtered.length===0) {
        document.getElementById("holdings-summary").innerHTML="";
        document.getElementById("holdings-list").innerHTML=`<div class="empty-state">No ${activeFilter==="all"?"":"matching "}holdings yet.</div>`;
        return;
      }
      const summary = buildHoldingsSummary(filtered, priceMap, divMap);
      renderSummaryCard(summary);
      document.getElementById("holdings-list").innerHTML = summary.rows
        .map((row,i) => holdingRow(row, ["#534AB7","#378ADD","#1D9E75","#D85A30","#D4537E","#BA7517"][i%6])).join("");
      wireLotHandlers();
      wireDividendModal(filtered, divMap);
    }

    ["all","mainboard","sme"].forEach(f => {
      document.getElementById(`filter-${f}`).addEventListener("click", () => {
        activeFilter=f;
        document.querySelectorAll(".toggle-btn").forEach(b=>b.classList.remove("toggle-btn-active"));
        document.getElementById(`filter-${f}`).classList.add("toggle-btn-active");
        applyFilter();
      });
    });

    if (holdings.length===0) {
      document.getElementById("holdings-list").innerHTML=`<div class="empty-state">No holdings yet. Add a position to start tracking your actual portfolio.</div>`;
      return;
    }
    applyFilter();
  },
};

registerScreen("holdings", holdingsScreen);