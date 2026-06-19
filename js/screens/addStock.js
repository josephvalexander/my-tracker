/**
 * screens/addStock.js
 *
 * Add a new ticker, then optionally upload a Screener export to
 * populate fundamentals immediately. Per the design decision: adding a
 * stock should be instant (just a ticker + name), with data upload as
 * a follow-up step you can skip and do later.
 */

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
        </div>
        <div class="form-group">
          <label>Company name</label>
          <input type="text" id="name-input" placeholder="e.g. Caplin Point Laboratories Ltd" />
        </div>
        <div class="form-group">
          <label>Sector</label>
          <input type="text" id="sector-input" placeholder="e.g. Pharma" />
        </div>

        <button id="create-stock-btn" class="btn btn-primary">Add to watchlist</button>

        <div id="upload-section" style="display:none; margin-top:24px;">
          <div class="section-label">Upload Screener export (optional, can do later)</div>
          <input type="file" id="screener-file-input" accept=".xlsx" />
          <div id="upload-preview"></div>
        </div>
      </div>`;
  },

  async afterRender() {
    document.getElementById("create-stock-btn").addEventListener("click", async () => {
      const ticker = document.getElementById("ticker-input").value.trim().toUpperCase();
      const name = document.getElementById("name-input").value.trim();
      const sector = document.getElementById("sector-input").value.trim();

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
        name: name || ticker,
        sector: sector || null,
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
      document.getElementById("screener-file-input").dataset.ticker = ticker;
    });

    document.getElementById("screener-file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ticker = e.target.dataset.ticker;

      const buffer = await file.arrayBuffer();
      const { stockFundamentals, companyName, warnings } = parseScreenerFile(buffer, XLSX);

      const stock = await StockStore.get(ticker);
      stock.fundamentals = stockFundamentals;
      if (companyName && (!stock.name || stock.name === ticker)) stock.name = companyName;
      await StockStore.set(ticker, stock);

      document.getElementById("upload-preview").innerHTML = `
        <div class="card">
          <div>Parsed ${stockFundamentals.annual.years?.length ?? 0} years of data.</div>
          ${warnings.map((w) => `<div class="warning-text">⚠ ${w}</div>`).join("")}
          <button class="btn btn-small" onclick="window.location.hash='#stock/${ticker}'">View stock</button>
        </div>`;
    });
  },
};

registerScreen("addStock", addStockScreen);
