/**
 * screens/addStock.js
 *
 * Add a new stock to the watchlist. On "Add to watchlist":
 *   1. Creates the stock record immediately
 *   2. Fetches all data from indianapi.in automatically — fundamentals,
 *      shareholding, corporate actions, current price, 52-week range
 *   3. Computes IV from the fetched OCF data
 *   4. Optionally drafts qualitative fields with AI
 *
 * Screener.xlsx upload is kept as a manual fallback in case indianapi
 * doesn't have data for a particular stock (very small/unlisted companies).
 *
 * Monthly refresh: called from stockDetail.js when lastUpdated is >30 days ago.
 */

const INDIAN_API_BASE = "https://stock.indianapi.in";

/**
 * Fetch all fundamentals + shareholding + corporate actions from indianapi.in
 * for one stock. Called on first add and on monthly refresh.
 */
async function fetchIndianApiData(stockName, apiKey) {
  const url = `${INDIAN_API_BASE}/stock?name=${encodeURIComponent(stockName)}`;
  const response = await fetch(url, {
    headers: { "X-Api-Key": apiKey },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`indianapi.in responded with ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return parseIndianApiResponse(data);
}

/**
 * Apply a parsed indianapi.in result to a stock record and save it.
 * Used both on first add and on monthly refresh.
 */
async function applyIndianApiResult(ticker, parsed) {
  const stock = await StockStore.get(ticker);

  stock.fundamentals = {
    ...parsed.stockFundamentals,
    // Preserve any manual overrides that are more specific
    currentPrice: parsed.stockFundamentals.currentPrice ?? stock.fundamentals?.currentPrice,
    marketCap: parsed.stockFundamentals.marketCap ?? stock.fundamentals?.marketCap,
  };

  if (parsed.companyName) {
    const isNumericCode = /^\d+$/.test(stock.name || "");
    if (!stock.name || stock.name === ticker || isNumericCode) {
      stock.name = parsed.companyName;
    }
  }
  if (parsed.sector && !stock.sector) {
    stock.sector = parsed.sector;
  }

  // Shareholding — merge with existing if already has pledging data from AI draft
  stock.shareholding = {
    ...parsed.shareholding,
    // Preserve pledging if we had it from AI draft and new data doesn't have it
    history: parsed.shareholding.history.map((entry, i) => ({
      ...entry,
      pledged: entry.pledged ?? stock.shareholding?.history?.[i]?.pledged ?? null,
    })),
  };

  // Corporate actions
  stock.corporateActions = {
    source: "indianapi",
    lastUpdated: new Date().toISOString().slice(0, 10),
    ...parsed.corporateActions,
  };

  // Auto-apply any unprocessed splits or bonus issues
  // Uses processedCorporateActions[] to track which record dates have
  // already been applied — prevents double-applying on subsequent refreshes.
  stock.processedCorporateActions = stock.processedCorporateActions || [];
  const processed = new Set(stock.processedCorporateActions);

  const allActions = [
    ...(parsed.corporateActions.splits || []).map(a => ({ ...a, _type: "split" })),
    ...(parsed.corporateActions.bonus  || []).map(a => ({ ...a, _type: "bonus" })),
  ].sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate)); // oldest first

  for (const action of allActions) {
    const key = `${action._type}_${action.recordDate}`;
    if (processed.has(key)) continue; // already applied

    let multiplier = null;
    if (action._type === "split")  multiplier = splitMultiplier(action);
    if (action._type === "bonus")  multiplier = bonusMultiplier(action);
    if (!multiplier || multiplier === 1) { processed.add(key); continue; }

    const recordDate = action.recordDate;

    // Adjust watchlistPrice
    if (stock.watchlistPrice) {
      stock.watchlistPrice = stock.watchlistPrice / multiplier;
    }

    // Adjust holding lots
    const holding = await HoldingStore.get(ticker);
    if (holding) {
      if (holding.lots?.length) {
        // Adjust only lots purchased before the record date
        for (const lot of holding.lots) {
          if (!lot.purchaseDate || lot.purchaseDate < recordDate) {
            lot.quantity = Math.round(lot.quantity * multiplier);
            lot.buyPrice = lot.buyPrice / multiplier;
          }
        }
      } else if (holding.quantity) {
        // Legacy single-lot format
        holding.quantity = Math.round(holding.quantity * multiplier);
        holding.avgBuyPrice = holding.avgBuyPrice / multiplier;
      }
      await HoldingStore.set(ticker, holding);
    }

    processed.add(key);
  }
  stock.processedCorporateActions = [...processed];

  // Recent news and analyst consensus
  // Always overwrite recentNews — even empty array clears old stale news
  stock.recentNews = parsed.recentNews ?? [];
  if (parsed.analystConsensus) {
    stock.analystConsensus = parsed.analystConsensus;
  }

  // Price context
  stock.priceContext = {
    ...stock.priceContext,
    source: "indianapi",
    lastUpdated: new Date().toISOString().slice(0, 10),
    week52High: parsed.priceContext.week52High,
    week52Low: parsed.priceContext.week52Low,
    peTTM: parsed.priceContext.peTTM ?? stock.priceContext?.peTTM ?? null,
    sectorPE: parsed.priceContext.sectorPE ?? stock.priceContext?.sectorPE ?? null,
    distributionYield:  parsed.priceContext.distributionYield  ?? stock.priceContext?.distributionYield  ?? null,
    gearing:            parsed.priceContext.gearing            ?? stock.priceContext?.gearing            ?? null,
    interestCoverage:   parsed.priceContext.interestCoverage   ?? stock.priceContext?.interestCoverage   ?? null,
    cashFlowPerShare:   parsed.priceContext.cashFlowPerShare   ?? stock.priceContext?.cashFlowPerShare   ?? null,
    distPerShare5yr:    parsed.priceContext.distPerShare5yr    ?? stock.priceContext?.distPerShare5yr    ?? null,
    operatingMargin:    parsed.priceContext.operatingMargin    ?? stock.priceContext?.operatingMargin    ?? null,
  };

  await StockStore.set(ticker, stock);

  autoPush().catch(()=>{});  return stock;
}

// ── Screener upload fallback ──────────────────────────────────────────

function renderUploadZone(zoneId) {
  return `
    <div id="${zoneId}" class="dropzone" tabindex="0">
      <input type="file" id="${zoneId}-input" accept=".xlsx" class="dropzone-hidden-input" />
      <div class="dropzone-icon">&#8593;</div>
      <div class="dropzone-text">Drag your Screener export here</div>
      <div class="dropzone-subtext">or click to browse · .xlsx exported from screener.in</div>
    </div>
    <div id="${zoneId}-status" class="dropzone-status"></div>`;
}

function wireUploadZone(zoneId, onFile) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(`${zoneId}-input`);
  const status = document.getElementById(`${zoneId}-status`);

  function setStatus(html) { status.innerHTML = html; }

  function validateAndHandle(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      zone.classList.add("dropzone-error");
      setStatus(`<div class="dropzone-error-text">⚠ "${file.name}" isn't an .xlsx file.</div>`);
      setTimeout(() => zone.classList.remove("dropzone-error"), 1500);
      return;
    }
    zone.classList.remove("dropzone-active", "dropzone-error");
    zone.classList.add("dropzone-parsing");
    setStatus(`<div class="dropzone-parsing-text">Parsing ${file.name}...</div>`);
    onFile(file).finally(() => zone.classList.remove("dropzone-parsing"));
  }

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
  input.addEventListener("change", (e) => validateAndHandle(e.target.files[0]));
  ["dragenter", "dragover"].forEach((evt) => {
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("dropzone-active"); });
  });
  ["dragleave", "dragend"].forEach((evt) => {
    zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("dropzone-active"); });
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dropzone-active");
    validateAndHandle(e.dataTransfer.files[0]);
  });
}

// ── Screen ───────────────────────────────────────────────────────────

const addStockScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#watchlist'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Add stock</div></div>
        </div>

        <div class="form-group">
          <label>Ticker (NSE symbol)</label>
          <input type="text" id="ticker-input" placeholder="e.g. CAPLIPOINT" />
        </div>
        <div class="form-group">
          <label>Company name <span class="muted">(optional — for display only)</span></label>
          <input type="text" id="name-input" placeholder="e.g. Caplin Point" />
          <div class="field-hint">Ticker is used to search indianapi.in. Company name is just for display.</div>
        </div>

        <div class="form-group">
          <label>Board</label>
          <div style="display:grid; grid-template-columns:repeat(4,auto); gap:12px 16px; margin-top:4px; width:fit-content;">
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap;"><input type="radio" name="board" value="mainboard" checked /> Mainboard</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap;"><input type="radio" name="board" value="sme" /> SME</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap;"><input type="radio" name="board" value="microcap" /> Microcap</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap;"><input type="radio" name="board" value="reit" /> REIT / InvIT</label>
          </div>
          <div id="add-reit-subtype-row" style="display:none; gap:20px; margin-top:10px;">
            <label style="font-size:12px; color:var(--color-text-secondary);">Sub-type:</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="add-reit-type" value="REIT" checked /> REIT</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="radio" name="add-reit-type" value="InvIT" /> InvIT</label>
          </div>
          <div id="add-reit-asset-row" style="display:none; gap:10px; align-items:center; margin-top:6px;">
            <label style="font-size:12px; color:var(--color-text-secondary);">Asset class:</label>
            <select id="add-reit-asset-class" style="font-size:12px; padding:4px 8px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);">
              ${["Office","Retail","Warehouse","Mixed","Highways","Power Transmission","Gas Pipelines","Renewables","Mixed Infrastructure"].map(a => `<option value="${a}">${a}</option>`).join("")}
            </select>
          </div>
        </div>

        <button id="create-stock-btn" class="btn btn-primary">Add &amp; fetch data</button>
        <div id="fetch-status" class="muted" style="font-size:12px; margin-top:8px;"></div>

        <div id="post-add-section" style="display:none; margin-top:24px;">
          <div id="fetch-preview"></div>

          <details style="margin-top:16px;">
            <summary class="muted" style="cursor:pointer; font-size:12px;">Screener.xlsx fallback (if data above looks wrong or incomplete)</summary>
            <div style="margin-top:8px;">
              ${renderUploadZone("screener-dropzone")}
            </div>
          </details>
        </div>
      </div>`;
  },

  async afterRender() {
    // Show/hide REIT sub-fields when board changes
    document.querySelectorAll('input[name="board"]').forEach(radio => {
      radio.addEventListener("change", () => {
        const isReit = document.querySelector('input[name="board"]:checked')?.value === "reit";
        document.getElementById("add-reit-subtype-row").style.display = isReit ? "flex" : "none";
        document.getElementById("add-reit-asset-row").style.display   = isReit ? "flex" : "none";
      });
    });
    document.getElementById("create-stock-btn").addEventListener("click", async () => {
      const ticker    = document.getElementById("ticker-input").value.trim().toUpperCase();
      const nameInput = document.getElementById("name-input").value.trim();
      const searchName = ticker;
      const board     = document.querySelector('input[name="board"]:checked')?.value || "mainboard";
      const reitType  = board === "reit" ? (document.querySelector('input[name="add-reit-type"]:checked')?.value || "REIT") : undefined;
      const reitAssetClass = board === "reit" ? (document.getElementById("add-reit-asset-class")?.value || "Office") : undefined;
      const statusEl = document.getElementById("fetch-status");

      if (!ticker) { alert("Ticker is required."); return; }

      const existing = await StockStore.get(ticker);
      // Only block re-add if stock is genuinely active on the watchlist.
      // Deleted stocks should be fully gone; archived stocks (from before
      // the delete-instead-of-archive change) should be cleaned up first.
      if (existing) {
        if (existing.status === "active") {
          alert("This stock is already on your watchlist.");
          return;
        }
        // Stale archived record — delete it so we can re-add cleanly
        await deleteStockPermanently(ticker);

        autoPush().catch(()=>{});      }

      const settings = await MetaStore.getSettings();
      const apiKey = settings?.indianApiKey;

      // Create the stock record immediately
      const stock = {
        ticker, name: nameInput || ticker, sector: null, board,
        ...(reitType ? { reitType, reitAssetClass } : {}),
        status: "active",
        addedDate: new Date().toISOString().slice(0, 10),
        archivedDate: null, archiveReason: null,
        qualitative: { business: "", moatDescription: "", moatTags: [], marketPosition: "", marketPositionTag: "" },
        targetEntryPrice: null,
        fundamentals: { source: null, lastUpdated: null, currentPrice: null, marketCap: null, annual: {}, quarterly: {} },
        shareholding: { source: null, lastUpdated: null, history: [] },
        corporateActions: { source: null, lastUpdated: null, dividends: [], splits: [], bonus: [] },
        priceContext: { source: null, lastUpdated: null },
        intrinsicValue: null, notes: [], thesis: { text: "", lastUpdated: null },
      };
      await StockStore.set(ticker, stock);

      autoPush().catch(()=>{});
      document.getElementById("create-stock-btn").disabled = true;
      document.getElementById("post-add-section").style.display = "block";

      // Fetch from indianapi.in if key is configured
      if (!apiKey) {
        statusEl.innerHTML = `<span style="color:var(--color-warning);">⚠ No indianapi.in key in Settings — upload a Screener file below to add data, or add your key in Settings first.</span>`;
        wireScreenerFallback(ticker);
        return;
      }

      statusEl.textContent = "Fetching from indianapi.in...";
      try {
        const parsed = await fetchIndianApiData(searchName, apiKey);
        const updatedStock = await applyIndianApiResult(ticker, parsed);

        // Store the price at time of adding as the watchlist baseline
        if (parsed.stockFundamentals.currentPrice && !updatedStock.watchlistPrice) {
          updatedStock.watchlistPrice = parsed.stockFundamentals.currentPrice;
          await StockStore.set(ticker, updatedStock);

        autoPush().catch(()=>{});        }

        const roe = roe5yAvg(updatedStock);
        const de = debtToEquity(updatedStock);
        const cagr = epsCagr(updatedStock);
        const years = parsed.stockFundamentals.annual.years?.length ?? 0;
        const latestShareholding = parsed.shareholding.history?.slice(-1)?.[0];
        const isReitAdd = (document.querySelector('input[name="board"]:checked')?.value) === "reit";
        const pc = parsed.priceContext;

        const equityRows = `
              <tr><td>Years of data</td><td>${years} ${years >= 8 ? "✓" : "⚠ fewer than 8"}</td></tr>
              <tr><td>ROE (5y avg)</td><td>${roe !== null ? formatPct(roe) : "N/A"}</td></tr>
              <tr><td>D/E</td><td>${de !== null ? formatRatio(de) : "N/A"}</td></tr>
              <tr><td>EPS CAGR (5y)</td><td>${cagr !== null ? formatPct(cagr) : "N/A"}</td></tr>
              <tr><td>Promoter holding</td><td>${latestShareholding?.promoter != null ? latestShareholding.promoter + "% (Q: " + latestShareholding.quarter + ")" : "—"}</td></tr>`;

        const reitRows = `
              <tr><td>Distribution yield</td><td>${pc.distributionYield ? pc.distributionYield.toFixed(2)+"%" : "—"}</td></tr>
              <tr><td>Gearing (D/E)</td><td>${pc.gearing != null ? pc.gearing.toFixed(2)+"x" : "—"}</td></tr>
              <tr><td>Interest coverage</td><td>${pc.interestCoverage != null ? pc.interestCoverage.toFixed(2)+"x" : "—"}</td></tr>
              <tr><td>Operating margin</td><td>${pc.operatingMargin != null ? pc.operatingMargin.toFixed(1)+"%" : "—"}</td></tr>`;

        statusEl.textContent = "";
        document.getElementById("fetch-preview").innerHTML = `
          <div class="card preview-card">
            <div class="section-label" style="margin-top:0;">Fetched from indianapi.in</div>
            <table class="preview-table">
              <tr><td>Company</td><td>${parsed.companyName || ticker}</td></tr>
              <tr><td>Current price</td><td>${parsed.stockFundamentals.currentPrice ? "₹" + parsed.stockFundamentals.currentPrice.toLocaleString("en-IN") : "—"}</td></tr>
              <tr><td>52w range</td><td>${parsed.priceContext.week52Low && parsed.priceContext.week52High ? `₹${parsed.priceContext.week52Low.toLocaleString("en-IN")} – ₹${parsed.priceContext.week52High.toLocaleString("en-IN")}` : "—"}</td></tr>
              ${isReitAdd ? reitRows : equityRows}
              <tr><td>Distributions on record</td><td>${parsed.corporateActions.dividends?.length ?? 0}</td></tr>
            </table>
            ${parsed.warnings.length > 0 ? `<div class="preview-warnings">${parsed.warnings.map(w => `<div class="warning-text">⚠ ${w}</div>`).join("")}</div>` : ""}

            <button id="ai-draft-all-btn" class="btn btn-small" style="margin-top:10px; width:100%;">✨ Draft business, moat &amp; market position with AI</button>
            <div id="ai-draft-all-status" class="muted" style="font-size:11px; margin-top:6px;"></div>

            <button class="btn btn-primary" style="margin-top:10px; width:100%;" onclick="window.location.hash='#stock/${ticker}'">View full stock page &rarr;</button>
          </div>`;

        document.getElementById("ai-draft-all-btn").addEventListener("click", async (e) => {
          const btn = e.target;
          const aiStatus = document.getElementById("ai-draft-all-status");
          const s = await MetaStore.getSettings();
          if (!s?.geminiApiKey) { aiStatus.textContent = "Add a Gemini API key in Settings first."; return; }
          btn.disabled = true;
          aiStatus.textContent = "Drafting business, moat & market position...";
          try {
            const stockNow = await StockStore.get(ticker);
            const result = await draftAllQualitative(s.geminiApiKey, stockNow);
            stockNow.qualitative = stockNow.qualitative || {};
            stockNow.qualitative.business = result.business;
            stockNow.qualitative.moatDescription = result.moat;
            stockNow.qualitative.marketPosition = result.marketPosition;
            await StockStore.set(ticker, stockNow);
            
autoPush().catch(()=>{});
            aiStatus.textContent = "✓ All three drafted — review on the stock page.";
          } catch (err) {
            aiStatus.textContent = `Draft failed: ${err.message}`;
          }
          btn.disabled = false;
        });

      } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--color-error);">⚠ Fetch failed: ${err.message}</span>`;
        wireScreenerFallback(ticker);
      }

      wireScreenerFallback(ticker);
    });

    function wireScreenerFallback(ticker) {
      wireUploadZone("screener-dropzone", async (file) => {
        try {
          const buffer = await file.arrayBuffer();
          const { stockFundamentals, companyName } = parseScreenerFile(buffer, XLSX);
          const currentStock = await StockStore.get(ticker);
          currentStock.fundamentals = stockFundamentals;
          if (companyName && (!currentStock.name || currentStock.name === ticker)) currentStock.name = companyName;
          await StockStore.set(ticker, currentStock);

        autoPush().catch(()=>{});          document.getElementById("screener-dropzone-status").innerHTML = `<div class="dropzone-success-text">✓ Parsed ${stockFundamentals.annual.years?.length ?? 0} years from ${file.name}</div>`;
        } catch (err) {
          document.getElementById("screener-dropzone-status").innerHTML = `<div class="dropzone-error-text">⚠ Parse failed: ${err.message}</div>`;
        }
      });
    }
  },
};

registerScreen("addStock", addStockScreen);