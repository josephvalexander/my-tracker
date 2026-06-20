/**
 * screens/addStock.js
 *
 * Add a new ticker, then optionally upload a Screener export to
 * populate fundamentals immediately. Per the design decision: adding a
 * stock should be instant (just a ticker + name), with data upload as
 * a follow-up step you can skip and do later.
 */

/**
 * Renders a drag-and-drop capable upload zone. Reusable wherever a
 * Screener .xlsx needs uploading (here on first add, and later from the
 * stock detail screen for refreshes). `onFile(file)` is called with the
 * raw File object once a file is dropped or picked — the caller does
 * the actual parsing, this just handles the interaction.
 */
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

  function setStatus(html) {
    status.innerHTML = html;
  }

  function validateAndHandle(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      zone.classList.remove("dropzone-active");
      zone.classList.add("dropzone-error");
      setStatus(`<div class="dropzone-error-text">⚠ "${file.name}" isn't an .xlsx file. Export from Screener's "Export to Excel" button and try again.</div>`);
      setTimeout(() => zone.classList.remove("dropzone-error"), 1500);
      return;
    }
    zone.classList.remove("dropzone-active", "dropzone-error");
    zone.classList.add("dropzone-parsing");
    setStatus(`<div class="dropzone-parsing-text">Parsing ${file.name}...</div>`);
    onFile(file).finally(() => zone.classList.remove("dropzone-parsing"));
  }

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") input.click();
  });

  input.addEventListener("change", (e) => validateAndHandle(e.target.files[0]));

  ["dragenter", "dragover"].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add("dropzone-active");
    });
  });

  ["dragleave", "dragend"].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove("dropzone-active");
    });
  });

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dropzone-active");
    const file = e.dataTransfer.files[0];
    validateAndHandle(file);
  });
}

const addStockScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="history.back()">&larr;</button>
          <div class="detail-title"><div class="detail-name">Add stock</div></div>
        </div>

        <div class="form-group">
          <label>Ticker (NSE symbol)</label>
          <input type="text" id="ticker-input" placeholder="e.g. CAPLIPOINT" />
          <div class="field-hint">Company name and sector are filled in automatically once you upload a Screener export below.</div>
        </div>

        <button id="create-stock-btn" class="btn btn-primary">Add to watchlist</button>

        <div id="upload-section" style="display:none; margin-top:24px;">
          <div class="section-label">Upload Screener export (optional, can do later)</div>
          ${renderUploadZone("screener-dropzone")}
          <div id="upload-preview"></div>
        </div>
      </div>`;
  },

  async afterRender() {
    document.getElementById("create-stock-btn").addEventListener("click", async () => {
      const ticker = document.getElementById("ticker-input").value.trim().toUpperCase();

      if (!ticker) {
        alert("Ticker is required.");
        return;
      }

      const existing = await StockStore.get(ticker);
      if (existing) {
        alert("This stock is already on your watchlist.");
        return;
      }

      const stock = {
        ticker,
        name: ticker,
        sector: null,
        status: "active",
        addedDate: new Date().toISOString().slice(0, 10),
        archivedDate: null,
        archiveReason: null,
        qualitative: { business: "", moatDescription: "", moatTags: [], marketPosition: "", marketPositionTag: "" },
        targetEntryPrice: null,
        fundamentals: { source: null, lastUpdated: null, currentPrice: null, marketCap: null, annual: {}, quarterly: {} },
        shareholding: { source: null, lastUpdated: null, history: [] },
        bulkDeals: { source: null, lastUpdated: null, deals: [] },
        corporateActions: { source: null, lastUpdated: null, actions: [] },
        priceContext: { source: null, lastUpdated: null },
        intrinsicValue: null,
        notes: [],
        thesis: { text: "", lastUpdated: null },
      };

      await StockStore.set(ticker, stock);
      document.getElementById("upload-section").style.display = "block";
      document.getElementById("create-stock-btn").textContent = "Added — upload data below or skip";
      document.getElementById("create-stock-btn").disabled = true;

      wireUploadZone("screener-dropzone", async (file) => {
        try {
          const buffer = await file.arrayBuffer();
          const { stockFundamentals, companyName, warnings } = parseScreenerFile(buffer, XLSX);

          const currentStock = await StockStore.get(ticker);
          currentStock.fundamentals = stockFundamentals;
          if (companyName && (!currentStock.name || currentStock.name === ticker)) {
            currentStock.name = companyName;
          }
          await StockStore.set(ticker, currentStock);

          document.getElementById(
            "screener-dropzone-status"
          ).innerHTML = `<div class="dropzone-success-text">✓ Parsed ${stockFundamentals.annual.years?.length ?? 0} years of data from ${file.name}</div>`;

          // Run the same metrics the detail screen will show, so the
          // preview reflects exactly what got computed — not just that
          // parsing finished without crashing.
          const roe = roe5yAvg(currentStock);
          const de = debtToEquity(currentStock);
          const cagr = epsCagr(currentStock);
          const yearsFound = stockFundamentals.annual.years?.length ?? 0;
          const sharesGaps = (stockFundamentals.annual.sharesOutstandingHistory || []).filter(
            (v) => v === null || v === undefined
          ).length;

          document.getElementById("upload-preview").innerHTML = `
            <div class="card preview-card">
              <div class="section-label" style="margin-top:0;">Preview before saving</div>
              <table class="preview-table">
                <tr><td>Detected company</td><td>${companyName || "Not found"}</td></tr>
                <tr><td>Years of data</td><td>${yearsFound} ${yearsFound >= 10 ? "✓" : yearsFound > 0 ? "⚠ fewer than 10" : "✗"}</td></tr>
                <tr><td>ROE (5y avg)</td><td>${roe !== null ? formatPct(roe) + " ✓" : "N/A ⚠"}</td></tr>
                <tr><td>D/E</td><td>${de !== null ? formatRatio(de) + " ✓" : "N/A ⚠"}</td></tr>
                <tr><td>EPS CAGR (5y)</td><td>${cagr !== null ? formatPct(cagr) + " ✓" : "N/A ⚠"}</td></tr>
                <tr><td>Share count gaps</td><td>${sharesGaps === 0 ? "None ✓" : `${sharesGaps} year(s) missing ⚠`}</td></tr>
              </table>
              ${warnings.length > 0 ? `<div class="preview-warnings">${warnings.map((w) => `<div class="warning-text">⚠ ${w}</div>`).join("")}</div>` : ""}
              <button class="btn btn-primary" style="margin-top:10px;" onclick="window.location.hash='#stock/${ticker}'">View full stock page</button>
            </div>`;
        } catch (err) {
          document.getElementById(
            "screener-dropzone-status"
          ).innerHTML = `<div class="dropzone-error-text">⚠ Couldn't parse this file: ${err.message}. Make sure it's an unmodified Screener "Export to Excel" file.</div>`;
        }
      });
    });
  },
};

registerScreen("addStock", addStockScreen);
