/**
 * screens/editStock.js
 *
 * Edit screen for everything that's manual by design: target entry
 * price, intrinsic value, and the three qualitative fields (business,
 * moat, market position) — each with a "Draft with AI" button that
 * calls Gemini with web-search grounding (js/geminiClient.js) and
 * drops the result into the textarea as an editable draft. Nothing
 * from AI is ever auto-saved; the person must hit Save themselves,
 * same as any manually-typed edit.
 */

const MOAT_TAG_OPTIONS = [
  "pricing_power",
  "brand",
  "ip_patents",
  "switching_costs",
  "regulatory_barrier",
  "network_effect",
  "none_identified",
];

function aiDraftButton(fieldKey, label) {
  return `<button class="btn btn-small ai-draft-btn" data-field="${fieldKey}">✨ Draft with AI — ${label}</button>`;
}

const editStockScreen = {
  async render(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }
    const settings = await MetaStore.getSettings();
    const hasGeminiKey = !!settings?.geminiApiKey;

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Edit — ${stock.name || ticker}</div></div>
        </div>

        ${!hasGeminiKey
          ? `<div class="hint-box">Add a Gemini API key in Settings to enable "Draft with AI" buttons below. <a href="#settings">Go to Settings</a></div>`
          : ""}

        <div class="section-label">Target entry price</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px; font-size:11px;">Leave blank to auto-default to 15% below your intrinsic value estimate.</div>
          <input type="number" id="target-price-input" placeholder="e.g. 1890" value="${stock.targetEntryPrice ?? ""}" />
        </div>

        <div class="section-label">Intrinsic value estimate</div>
        <div class="card">
          <div style="display:flex; gap:8px;">
            <div style="flex:1;">
              <label style="font-size:11px; color:var(--color-text-secondary);">Low</label>
              <input type="number" id="iv-low-input" value="${stock.intrinsicValue?.low ?? ""}" />
            </div>
            <div style="flex:1;">
              <label style="font-size:11px; color:var(--color-text-secondary);">High</label>
              <input type="number" id="iv-high-input" value="${stock.intrinsicValue?.high ?? ""}" />
            </div>
          </div>
        </div>

        <div class="section-label">Business <span class="section-label-note">(AI can draft, you should verify)</span></div>
        <div class="card">
          <textarea id="business-textarea" class="note-textarea" placeholder="What does this company actually do, in one sentence?">${stock.qualitative?.business || ""}</textarea>
          <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
            ${aiDraftButton("business", "Business")}
            <span id="business-ai-status" class="muted" style="font-size:11px;"></span>
          </div>
          <div id="business-ai-sources"></div>
        </div>

        <div class="section-label">Competitive advantage <span class="section-label-note">(AI can draft, you should verify)</span></div>
        <div class="card">
          <textarea id="moat-textarea" class="note-textarea" placeholder="Pricing power, brand, IP, switching costs, regulatory barrier, network effect?">${stock.qualitative?.moatDescription || ""}</textarea>
          <div class="tag-row" style="margin-top:8px;">
            ${MOAT_TAG_OPTIONS.map(
              (tag) =>
                `<label class="tag-checkbox"><input type="checkbox" class="moat-tag-checkbox" value="${tag}" ${stock.qualitative?.moatTags?.includes(tag) ? "checked" : ""}/> ${tag.replace(/_/g, " ")}</label>`
            ).join("")}
          </div>
          <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
            ${aiDraftButton("moat", "Moat")}
            <span id="moat-ai-status" class="muted" style="font-size:11px;"></span>
          </div>
          <div id="moat-ai-sources"></div>
        </div>

        <div class="section-label">Market position <span class="section-label-note">(AI can draft, you should verify)</span></div>
        <div class="card">
          <textarea id="position-textarea" class="note-textarea" placeholder="Leader, top-3, or commodity player in its niche?">${stock.qualitative?.marketPosition || ""}</textarea>
          <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
            ${aiDraftButton("marketPosition", "Position")}
            <span id="position-ai-status" class="muted" style="font-size:11px;"></span>
          </div>
          <div id="position-ai-sources"></div>
        </div>

        <button id="save-edit-btn" class="btn btn-primary" style="margin-top:8px;">Save changes</button>
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];

    document.querySelectorAll(".ai-draft-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const fieldKey = btn.dataset.field;
        const statusEl = document.getElementById(`${fieldKey === "marketPosition" ? "position" : fieldKey}-ai-status`);
        const textareaId = fieldKey === "marketPosition" ? "position-textarea" : fieldKey === "moat" ? "moat-textarea" : "business-textarea";
        const sourcesElId = `${fieldKey === "marketPosition" ? "position" : fieldKey}-ai-sources`;

        const settings = await MetaStore.getSettings();
        if (!settings?.geminiApiKey) {
          statusEl.textContent = "Add a Gemini API key in Settings first.";
          return;
        }

        statusEl.textContent = "Drafting...";
        btn.disabled = true;
        try {
          const stock = await StockStore.get(ticker);
          const { text, sources } = await draftQualitativeField(settings.geminiApiKey, fieldKey, stock);
          document.getElementById(textareaId).value = text;
          statusEl.textContent = "Draft inserted — review before saving.";
          if (sources.length > 0) {
            document.getElementById(sourcesElId).innerHTML = `
              <div class="ai-sources-box">
                <div class="muted" style="font-size:10px;">Sources used:</div>
                ${sources.map((s) => `<a href="${s.uri}" target="_blank" class="ai-source-link">${s.title || s.uri}</a>`).join("")}
              </div>`;
          }
        } catch (err) {
          statusEl.textContent = `Draft failed: ${err.message}`;
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.getElementById("save-edit-btn").addEventListener("click", async () => {
      const stock = await StockStore.get(ticker);

      const targetVal = document.getElementById("target-price-input").value;
      stock.targetEntryPrice = targetVal ? parseFloat(targetVal) : null;

      const ivLow = document.getElementById("iv-low-input").value;
      const ivHigh = document.getElementById("iv-high-input").value;
      stock.intrinsicValue = ivLow && ivHigh ? { low: parseFloat(ivLow), high: parseFloat(ivHigh), method: "manual", lastCalculated: new Date().toISOString().slice(0, 10) } : null;

      stock.qualitative = stock.qualitative || {};
      stock.qualitative.business = document.getElementById("business-textarea").value.trim();
      stock.qualitative.moatDescription = document.getElementById("moat-textarea").value.trim();
      stock.qualitative.moatTags = [...document.querySelectorAll(".moat-tag-checkbox:checked")].map((cb) => cb.value);
      stock.qualitative.marketPosition = document.getElementById("position-textarea").value.trim();

      await StockStore.set(ticker, stock);
      window.location.hash = `#stock/${ticker}`;
    });
  },
};

registerScreen("editStock", editStockScreen);
