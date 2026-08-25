/**
 * screens/editStock.js
 *
 * Edit screen for manual/qualitative fields: target entry price
 * and the three qualitative fields (business, moat, market position).
 * IV removed per user request.
 */

const MOAT_TAG_OPTIONS = [
  "pricing_power", "brand", "ip_patents", "switching_costs",
  "regulatory_barrier", "network_effect", "none_identified",
];

const editStockScreen = {
  async render(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Edit — ${stock.name || ticker}</div></div>
        </div>

        <div class="section-label">Board</div>
        <div class="card">
          <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="edit-board" value="mainboard" ${(!stock.board || stock.board==="mainboard") ? "checked" : ""}/> Mainboard</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="edit-board" value="sme" ${stock.board==="sme" ? "checked" : ""}/> SME</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="edit-board" value="microcap" ${stock.board==="microcap" ? "checked" : ""}/> Microcap</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="edit-board" value="reit" ${stock.board==="reit" ? "checked" : ""}/> REIT / InvIT</label>
          </div>
          <div id="reit-subtype-row" style="margin-top:10px; display:${stock.board==="reit"?"flex":"none"}; gap:20px;">
            <label style="font-size:12px; color:var(--color-text-secondary);">Sub-type:</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="edit-reit-type" value="REIT" ${(!stock.reitType || stock.reitType==="REIT") ? "checked" : ""}/> REIT</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="edit-reit-type" value="InvIT" ${stock.reitType==="InvIT" ? "checked" : ""}/> InvIT</label>
          </div>
          <div id="reit-asset-row" style="margin-top:10px; display:${stock.board==="reit"?"flex":"none"}; gap:10px; align-items:center;">
            <label style="font-size:12px; color:var(--color-text-secondary);">Asset class:</label>
            <select id="reit-asset-class" style="font-size:12px; padding:4px 8px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);">
              ${["Office","Retail","Warehouse","Mixed","Highways","Power Transmission","Gas Pipelines","Renewables","Mixed Infrastructure"].map(a =>
                `<option value="${a}" ${stock.reitAssetClass===a?"selected":""}>${a}</option>`
              ).join("")}
            </select>
          </div>
        </div>

        <div class="section-label">Position & price targets</div>
        <div class="card">
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:120px; margin-bottom:0;">
              <label>Target allocation (%)</label>
              <input type="number" id="target-alloc-input" min="0" max="100" step="0.5" placeholder="e.g. 10" value="${stock.targetAllocation ?? ""}" />
              <div class="field-hint">% of total portfolio you want in this stock</div>
            </div>
            <div class="form-group" style="flex:1; min-width:120px; margin-bottom:0;">
              <label>Alert below price (₹)</label>
              <input type="number" id="alert-price-input" min="0" step="0.5" placeholder="e.g. 1600" value="${stock.alertPrice ?? ""}" />
              <div class="field-hint">Shows a badge when price drops below this</div>
            </div>
          </div>
        </div>

        <div class="section-label">Business</div>
        <div class="card">
          <div class="muted" style="font-size:11px; margin-bottom:6px;">Drafted with AI during add — edit freely.</div>
          <textarea id="business-textarea" class="note-textarea" placeholder="What does this company actually do, in one sentence?">${stock.qualitative?.business || ""}</textarea>
        </div>

        <div class="section-label">Competitive advantage</div>
        <div class="card">
          <div class="muted" style="font-size:11px; margin-bottom:6px;">Drafted with AI during add — edit freely.</div>
          <textarea id="moat-textarea" class="note-textarea" placeholder="Pricing power, brand, IP, switching costs, regulatory barrier, network effect?">${stock.qualitative?.moatDescription || ""}</textarea>
          <div class="tag-row" style="margin-top:8px;">
            ${MOAT_TAG_OPTIONS.map((tag) =>
              `<label class="tag-checkbox"><input type="checkbox" class="moat-tag-checkbox" value="${tag}" ${stock.qualitative?.moatTags?.includes(tag) ? "checked" : ""}/> ${tag.replace(/_/g, " ")}</label>`
            ).join("")}
          </div>
        </div>

        <div class="section-label">Market position</div>
        <div class="card">
          <div class="muted" style="font-size:11px; margin-bottom:6px;">Drafted with AI during add — edit freely.</div>
          <textarea id="position-textarea" class="note-textarea" placeholder="Leader, top-3, or commodity player in its niche?">${stock.qualitative?.marketPosition || ""}</textarea>
        </div>

        <button id="save-edit-btn" class="btn btn-primary" style="margin-top:8px;">Save changes</button>
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];

    // Show/hide REIT sub-fields when board radio changes
    document.querySelectorAll('input[name="edit-board"]').forEach(radio => {
      radio.addEventListener("change", () => {
        const isReit = document.querySelector('input[name="edit-board"]:checked')?.value === "reit";
        document.getElementById("reit-subtype-row").style.display = isReit ? "flex" : "none";
        document.getElementById("reit-asset-row").style.display   = isReit ? "flex" : "none";
      });
    });

    document.getElementById("save-edit-btn").addEventListener("click", async () => {
      const current = await StockStore.get(ticker);
      current.board = document.querySelector('input[name="edit-board"]:checked')?.value || "mainboard";
      if (current.board === "reit") {
        current.reitType       = document.querySelector('input[name="edit-reit-type"]:checked')?.value || "REIT";
        current.reitAssetClass = document.getElementById("reit-asset-class")?.value || "Office";
      }
      const allocVal = parseFloat(document.getElementById("target-alloc-input").value);
      current.targetAllocation = !isNaN(allocVal) ? allocVal : null;
      const alertVal = parseFloat(document.getElementById("alert-price-input").value);
      current.alertPrice = !isNaN(alertVal) ? alertVal : null;
      current.qualitative = current.qualitative || {};
      current.qualitative.business = document.getElementById("business-textarea").value.trim();
      current.qualitative.moatDescription = document.getElementById("moat-textarea").value.trim();
      current.qualitative.moatTags = [...document.querySelectorAll(".moat-tag-checkbox:checked")].map((cb) => cb.value);
      current.qualitative.marketPosition = document.getElementById("position-textarea").value.trim();
      await StockStore.set(ticker, current);
      window.location.hash = `#stock/${ticker}`;
    });
  },
};

registerScreen("editStock", editStockScreen);
