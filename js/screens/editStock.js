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

    document.getElementById("save-edit-btn").addEventListener("click", async () => {
      const current = await StockStore.get(ticker);
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
