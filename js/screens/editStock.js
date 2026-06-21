/**
 * screens/editStock.js
 *
 * Edit screen for everything that's manual or assumption-driven:
 * target entry price, intrinsic value, and the three qualitative
 * fields (business, moat, market position). AI drafting now happens
 * once, right after a Screener upload (see addStock.js) — this screen
 * just has plain editable textareas for those three fields, no
 * per-field AI button.
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

function ivSection(stock) {
  const isManual = stock.intrinsicValue && stock.intrinsicValue.method === "manual";
  const defaultIv = calculateDefaultIV(stock);

  if (isManual) {
    return `
      <div class="card">
        <div class="muted" style="margin-bottom:8px; font-size:11px;">Manually entered. Switch back to the computed default below if you'd rather not maintain this by hand.</div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;"><label style="font-size:11px; color:var(--color-text-secondary);">Low</label><input type="number" id="iv-low-input" value="${stock.intrinsicValue?.low ?? ""}" /></div>
          <div style="flex:1;"><label style="font-size:11px; color:var(--color-text-secondary);">High</label><input type="number" id="iv-high-input" value="${stock.intrinsicValue?.high ?? ""}" /></div>
        </div>
        ${defaultIv ? `<button id="use-default-iv-btn" class="btn btn-small" style="margin-top:8px;">Use computed default instead (₹${defaultIv.base.toFixed(0)})</button>` : ""}
      </div>`;
  }

  if (!defaultIv) {
    return `
      <div class="card">
        <div class="muted" style="font-size:11px; margin-bottom:8px;">Not enough cash flow data yet to compute a default (needs at least one year of positive operating cash flow and shares outstanding). Enter manually instead, or upload more Screener history.</div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;"><label style="font-size:11px; color:var(--color-text-secondary);">Low</label><input type="number" id="iv-low-input" value="" /></div>
          <div style="flex:1;"><label style="font-size:11px; color:var(--color-text-secondary);">High</label><input type="number" id="iv-high-input" value="" /></div>
        </div>
      </div>`;
  }

  return `
    <div class="card">
      <div class="muted" style="font-size:11px; margin-bottom:8px;">
        Auto-computed: simple DCF on operating cash flow (not a rigorous FCF model — capex isn't cleanly isolated in Screener's export, see Help). Adjust assumptions below; recalculates live.
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
        <div><label style="font-size:11px; color:var(--color-text-secondary);">Growth, yrs 1–5 (%)</label><input type="number" step="0.1" id="iv-growth1-input" value="${defaultIv.assumptions.growthYears1to5.toFixed(1)}" /></div>
        <div><label style="font-size:11px; color:var(--color-text-secondary);">Growth, yrs 6–10 (%)</label><input type="number" step="0.1" id="iv-growth2-input" value="${defaultIv.assumptions.growthYears6to10.toFixed(1)}" /></div>
        <div><label style="font-size:11px; color:var(--color-text-secondary);">Terminal growth (%)</label><input type="number" step="0.1" id="iv-terminal-input" value="${defaultIv.assumptions.terminalGrowth}" /></div>
        <div><label style="font-size:11px; color:var(--color-text-secondary);">Discount rate (%)</label><input type="number" step="0.1" id="iv-discount-input" value="${defaultIv.assumptions.discountRate}" /></div>
      </div>
      <div id="iv-computed-output" class="iv-computed-box">
        <span>Estimate: <strong>₹${defaultIv.low.toFixed(0)} – ₹${defaultIv.high.toFixed(0)}</strong></span>
        <span class="muted" style="font-size:11px;">(base ₹${defaultIv.base.toFixed(0)})</span>
      </div>
      <button id="enter-manual-iv-btn" class="btn btn-small" style="margin-top:8px;">Enter a fixed value manually instead</button>
    </div>`;
}

function aiDraftHint(fieldName) {
  return `<div class="muted" style="font-size:11px; margin-bottom:6px;">Drafted once with AI during Screener upload, if you used that option. Edit freely below.</div>`;
}

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

        <div class="section-label">Target entry price</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px; font-size:11px;">Leave blank to auto-default to 15% below your intrinsic value estimate.</div>
          <input type="number" id="target-price-input" placeholder="e.g. 1890" value="${stock.targetEntryPrice ?? ""}" />
        </div>

        <div class="section-label">Intrinsic value estimate</div>
        <div id="iv-section-wrap">${ivSection(stock)}</div>

        <div class="section-label">Business</div>
        <div class="card">
          ${aiDraftHint("business")}
          <textarea id="business-textarea" class="note-textarea" placeholder="What does this company actually do, in one sentence?">${stock.qualitative?.business || ""}</textarea>
        </div>

        <div class="section-label">Competitive advantage</div>
        <div class="card">
          ${aiDraftHint("moat")}
          <textarea id="moat-textarea" class="note-textarea" placeholder="Pricing power, brand, IP, switching costs, regulatory barrier, network effect?">${stock.qualitative?.moatDescription || ""}</textarea>
          <div class="tag-row" style="margin-top:8px;">
            ${MOAT_TAG_OPTIONS.map(
              (tag) =>
                `<label class="tag-checkbox"><input type="checkbox" class="moat-tag-checkbox" value="${tag}" ${stock.qualitative?.moatTags?.includes(tag) ? "checked" : ""}/> ${tag.replace(/_/g, " ")}</label>`
            ).join("")}
          </div>
        </div>

        <div class="section-label">Market position</div>
        <div class="card">
          ${aiDraftHint("marketPosition")}
          <textarea id="position-textarea" class="note-textarea" placeholder="Leader, top-3, or commodity player in its niche?">${stock.qualitative?.marketPosition || ""}</textarea>
        </div>

        <button id="save-edit-btn" class="btn btn-primary" style="margin-top:8px;">Save changes</button>
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];
    let stock = await StockStore.get(ticker);

    function wireIvSectionHandlers() {
      const useDefaultBtn = document.getElementById("use-default-iv-btn");
      if (useDefaultBtn) {
        useDefaultBtn.addEventListener("click", async () => {
          stock.intrinsicValue = null; // clear manual override, falls back to computed default on next render
          document.getElementById("iv-section-wrap").innerHTML = ivSection(stock);
          wireIvSectionHandlers();
        });
      }

      const enterManualBtn = document.getElementById("enter-manual-iv-btn");
      if (enterManualBtn) {
        enterManualBtn.addEventListener("click", () => {
          const defaultIv = calculateDefaultIV(stock);
          stock.intrinsicValue = { low: defaultIv?.low ?? null, high: defaultIv?.high ?? null, method: "manual" };
          document.getElementById("iv-section-wrap").innerHTML = ivSection(stock);
          wireIvSectionHandlers();
        });
      }

      ["iv-growth1-input", "iv-growth2-input", "iv-terminal-input", "iv-discount-input"].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener("input", () => {
          const overrides = {
            growthYears1to5: parseFloat(document.getElementById("iv-growth1-input").value),
            growthYears6to10: parseFloat(document.getElementById("iv-growth2-input").value),
            terminalGrowth: parseFloat(document.getElementById("iv-terminal-input").value),
            discountRate: parseFloat(document.getElementById("iv-discount-input").value),
          };
          const recomputed = calculateDefaultIV(stock, overrides);
          const outputEl = document.getElementById("iv-computed-output");
          if (recomputed && outputEl) {
            outputEl.innerHTML = `
              <span>Estimate: <strong>₹${recomputed.low.toFixed(0)} – ₹${recomputed.high.toFixed(0)}</strong></span>
              <span class="muted" style="font-size:11px;">(base ₹${recomputed.base.toFixed(0)})</span>`;
            outputEl.dataset.low = recomputed.low;
            outputEl.dataset.high = recomputed.high;
          } else if (outputEl) {
            outputEl.innerHTML = `<span class="text-red">Invalid assumptions — discount rate must be above terminal growth.</span>`;
          }
        });
      });
    }

    wireIvSectionHandlers();

    document.getElementById("save-edit-btn").addEventListener("click", async () => {
      const current = await StockStore.get(ticker);

      const targetVal = document.getElementById("target-price-input").value;
      current.targetEntryPrice = targetVal ? parseFloat(targetVal) : null;

      const manualLowInput = document.getElementById("iv-low-input");
      const computedOutput = document.getElementById("iv-computed-output");

      if (manualLowInput) {
        const ivLow = document.getElementById("iv-low-input").value;
        const ivHigh = document.getElementById("iv-high-input").value;
        current.intrinsicValue = ivLow && ivHigh ? { low: parseFloat(ivLow), high: parseFloat(ivHigh), method: "manual", lastCalculated: new Date().toISOString().slice(0, 10) } : null;
      } else if (computedOutput) {
        const overrides = {
          growthYears1to5: parseFloat(document.getElementById("iv-growth1-input").value),
          growthYears6to10: parseFloat(document.getElementById("iv-growth2-input").value),
          terminalGrowth: parseFloat(document.getElementById("iv-terminal-input").value),
          discountRate: parseFloat(document.getElementById("iv-discount-input").value),
        };
        const recomputed = calculateDefaultIV(current, overrides);
        if (recomputed) {
          current.intrinsicValue = {
            low: recomputed.low,
            high: recomputed.high,
            method: "dcf_ocf_based",
            assumptions: overrides,
            lastCalculated: new Date().toISOString().slice(0, 10),
          };
        }
      }

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
