/**
 * screens/settings.js
 *
 * Drive connection (real OAuth, see js/driveSync.js), manual sync
 * trigger, archived stocks link, and the D/E threshold.
 *
 * Sync model: PULL happens automatically on every app open if a valid
 * session exists (see app.js autoPullOnOpen) — this screen's "Sync
 * now" button does a PUSH (and also opportunistically pulls first, so
 * a manual sync always reconciles both directions). Connecting Drive
 * for the first time on a device requires one explicit click here,
 * since that's the only way to get the consent popup past the
 * browser's popup blocker.
 */

const settingsScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Settings</div>

        <div class="section-label">Google Drive</div>
        <div class="card" id="drive-status-card">Loading...</div>

        <div class="section-label" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="board-class-header">
          Stock board classification
          <span id="board-class-chevron" style="font-size:11px; color:var(--color-text-tertiary);">▶ expand</span>
        </div>
        <div id="board-class-panel" style="display:none;">
          <div class="card">
            <div class="muted" style="font-size:11px; margin-bottom:8px;">Set each stock's board — Mainboard, SME, or Microcap. Affects watchlist grouping and analytics.</div>
            <div id="board-classification-list"></div>
            <button id="save-board-classification-btn" class="btn btn-small" style="margin-top:10px;">Save classifications</button>
            <div id="board-save-status" class="muted" style="font-size:11px; margin-top:4px;"></div>
          </div>
        </div>

        <div class="section-label">Export data</div>
        <div class="card">
          <div class="muted" style="font-size:11px; margin-bottom:10px;">Download your holdings and watchlist as CSV.</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <button id="export-holdings-csv" class="btn btn-small">↓ Holdings CSV</button>
            <button id="export-watchlist-csv" class="btn btn-small">↓ Watchlist CSV</button>
          </div>
          <div class="muted" style="font-size:11px; margin-bottom:6px;">Tax summary (realised gains only):</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <select id="tax-fy-select" style="font-size:12px; padding:4px 8px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);">
              <option value="all">All years</option>
            </select>
            <button id="export-tax-csv" class="btn btn-small">↓ Tax summary CSV</button>
          </div>
          <div id="export-status" class="muted" style="font-size:11px; margin-top:6px;"></div>
        </div>

        <div class="section-label">Import watchlist</div>
        <div class="card">
          <div class="muted" style="font-size:11px; margin-bottom:8px;">Import a watchlist CSV exported from another device. Merges with existing stocks — does not overwrite fundamentals already fetched.</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="file" id="import-watchlist-file" accept=".csv" style="font-size:12px;" />
            <button id="import-watchlist-btn" class="btn btn-small">↑ Import</button>
          </div>
          <div id="import-status" class="muted" style="font-size:11px; margin-top:6px;"></div>
        </div>

        <div class="section-label">Buffett rule thresholds</div>
        <div class="card">
          <div class="metric-row">
            <div class="metric-row-label">D/E green threshold</div>
            <input type="number" step="0.01" id="de-green-input" class="inline-input" />
          </div>
          <div class="metric-row">
            <div class="metric-row-label">D/E yellow threshold</div>
            <input type="number" step="0.01" id="de-yellow-input" class="inline-input" />
          </div>
          <button id="save-thresholds-btn" class="btn btn-small">Save</button>
        </div>

        <div class="section-label">Appearance</div>
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px;">Theme</span>
            <div class="theme-toggle-group" id="theme-toggle-group">
              <button class="theme-btn" data-theme="auto">Auto</button>
              <button class="theme-btn" data-theme="light">Light</button>
              <button class="theme-btn" data-theme="dark">Dark</button>
            </div>
          </div>
        </div>

        <div class="section-label">Data APIs</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px; font-size:11px;"><strong>indianapi.in</strong> — provides fundamentals, shareholding, corporate actions, and live price for Indian stocks. Free tier: 500 requests/month. Sign up at <a href="https://indianapi.in" target="_blank">indianapi.in</a>, subscribe to the free/hobby plan, copy the API key from your dashboard.</div>
          <input type="password" id="indian-api-key-input" placeholder="Paste your indianapi.in API key" />
          <button id="save-indian-api-key-btn" class="btn btn-small" style="margin-top:8px;">Save key</button>
        </div>

        <div class="section-label">AI draft assist</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px; font-size:11px;">Used by "Draft with AI" buttons on each stock's edit screen, for the business/moat/market-position fields. Get a free key from <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a>. Stored only on this device — never committed to your repo, never sent anywhere except Google's API.</div>
          <input type="password" id="gemini-key-input" placeholder="Paste your Gemini API key" />
          <button id="save-gemini-key-btn" class="btn btn-small" style="margin-top:8px;">Save key</button>
        </div>

        <div class="section-label">Data</div>
        <div class="card">
          <button id="export-backup-btn" class="btn btn-small">Export backup (.json)</button>
          <div style="margin-top:10px; padding-top:10px; border-top:0.5px solid var(--color-border);">
            <div class="muted" style="font-size:11px; margin-bottom:8px;">For the NSE scraper (GitHub Actions): export your current ticker list, then replace <code>data/tickers.json</code> in your repo with it.</div>
            <button id="export-tickers-btn" class="btn btn-small">Export ticker list for scraper</button>
          </div>
        </div>

        <div class="section-label collapsible-header" id="diag-header" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
          Diagnostics <span class="muted" style="font-size:11px;" id="diag-chevron">▶ expand</span>
        </div>
        <div id="diag-panel" style="display:none;">
          <div class="card">
            <div class="muted" style="font-size:11px; margin-bottom:12px;">Use these tools to fix data issues on mobile without needing browser DevTools.</div>

            <div style="margin-bottom:12px;">
              <div style="font-size:13px; font-weight:500; margin-bottom:4px;">Portfolio snapshots</div>
              <div class="muted" style="font-size:11px; margin-bottom:8px;">Clears all stored portfolio value history (used for the Analytics growth chart). After clearing, tap ↻ Prices on the watchlist to start recording fresh snapshots. The next Drive push will save the cleared state.</div>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <button id="clear-snapshots-btn" class="btn btn-small" style="color:var(--color-red); border-color:var(--color-red);">Clear snapshots</button>
                <span id="snapshot-count" class="muted" style="font-size:11px;"></span>
              </div>
              <div id="diag-status" class="muted" style="font-size:11px; margin-top:6px;"></div>
              <div style="margin-top:12px; padding-top:10px; border-top:0.5px solid var(--color-border);">
                <div class="muted" style="font-size:11px; margin-bottom:6px;">If the app is showing stale UI after an update, clear the service worker cache and reload fresh.</div>
                <a href="./clear-cache.html" style="font-size:12px; color:var(--color-green); text-decoration:none; font-weight:500;">↺ Clear app cache &amp; update →</a>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  async afterRender() {
    const settings = (await MetaStore.getSettings()) || {
      driveConnected: false, lastSyncPush: null, lastSyncPull: null,
      deRule: { green: 0.1, yellow: 0.2 },
    };

    // ── CSV Export ──────────────────────────────────────────────────────
    function downloadCSV(filename, rows) {
      const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }

    document.getElementById("export-holdings-csv").addEventListener("click", async () => {
      const holdings = await HoldingStore.getAll();
      const stocks   = await StockStore.getAll();
      const sMap = {}; stocks.forEach(s => { sMap[s.ticker] = s; });
      const rows = [["Ticker","Name","Lot","Purchase Date","Quantity","Buy Price","Current Price","Invested","Current Value","P&L%"]];
      for (const h of holdings) {
        const s = sMap[h.ticker];
        const cmp = s?.fundamentals?.currentPrice ?? "";
        const lots = h.lots?.length ? h.lots : [{ purchaseDate:"", quantity:h.quantity??0, buyPrice:h.avgBuyPrice??0 }];
        lots.forEach((l, i) => {
          const invested = l.quantity * l.buyPrice;
          const current  = cmp ? l.quantity * cmp : "";
          const pnl      = (cmp && invested) ? ((l.quantity*cmp - invested)/invested*100).toFixed(2)+"%" : "";
          rows.push([h.ticker, s?.name||h.ticker, i+1, l.purchaseDate||"", l.quantity, l.buyPrice, cmp, invested, current, pnl]);
        });
      }
      downloadCSV("buffett-compos-holdings.csv", rows);
      document.getElementById("export-status").textContent = `✓ Downloaded (${holdings.length} positions)`;
      setTimeout(() => { document.getElementById("export-status").textContent=""; }, 3000);
    });

    document.getElementById("export-watchlist-csv").addEventListener("click", async () => {
      const stocks = await StockStore.getActive();
      const rows = [["Ticker","Name","Sector","Cap Category","Board","ROE 5y%","D/E","EPS CAGR 5y%","P/E TTM","Market Cap Cr","Current Price","Verdict","Added Date"]];
      for (const s of stocks) {
        rows.push([
          s.ticker, s.name||s.ticker, normalizeSector(s.sector), capCategory(s), s.board||"mainboard",
          roe5yAvg(s)?.toFixed(1)??"", debtToEquity(s)?.toFixed(2)??"", epsCagr(s)?.toFixed(1)??"",
          s.priceContext?.peTTM?.toFixed(1)??"", s.fundamentals?.marketCap?.toFixed(0)??"",
          s.fundamentals?.currentPrice??"", deriveVerdict(s).verdict, s.addedDate??""
        ]);
      }
      downloadCSV("buffett-compos-watchlist.csv", rows);
      document.getElementById("export-status").textContent = `✓ Downloaded (${stocks.length} stocks)`;
      setTimeout(() => { document.getElementById("export-status").textContent=""; }, 3000);
    });

    // ── Tax FY select — populate with available years ───────────────
    async function populateFYSelect() {
      const allStocks = await StockStore.getAll();
      const holdings  = await HoldingStore.getAll();
      const fySet = new Set();
      for (const s of allStocks) {
        for (const sale of s.sellHistory||[]) {
          const d = sale.date; if (d) { const m = new Date(d).getMonth(); fySet.add(m>=3?new Date(d).getFullYear()+1:new Date(d).getFullYear()); }
        }
      }
      for (const h of holdings) {
        for (const sale of h.sells||[]) {
          const d = sale.date; if (d) { const m = new Date(d).getMonth(); fySet.add(m>=3?new Date(d).getFullYear()+1:new Date(d).getFullYear()); }
        }
      }
      const fySelect = document.getElementById("tax-fy-select");
      const sorted = [...fySet].sort((a,b)=>b-a);
      fySelect.innerHTML = `<option value="all">All years</option>` +
        sorted.map(fy=>`<option value="${fy}">FY${fy} (Apr ${fy-1} – Mar ${fy})</option>`).join("");
    }
    populateFYSelect();

    // Tax summary: realized gains only with summary header, FY filter
    document.getElementById("export-tax-csv").addEventListener("click", async () => {
      const selectedFY = document.getElementById("tax-fy-select").value;
      const allStocks  = await StockStore.getAll();
      const holdings   = await HoldingStore.getAll();
      const sMap = {}; allStocks.forEach(s=>{sMap[s.ticker]=s;});

      // Collect dividends per holding for the selected FY
      const allHoldingStocks = await StockStore.getAll();
      const stockMap = {}; allHoldingStocks.forEach(s=>{stockMap[s.ticker]=s;});

      function inFY(dateStr, fy) {
        if (!dateStr||dateStr==="none"||fy==="all") return fy==="all";
        const d = new Date(dateStr); const m = d.getMonth();
        const yearFY = m>=3 ? d.getFullYear()+1 : d.getFullYear();
        return yearFY===parseInt(fy);
      }
      function inSelectedFY(dateStr) { return selectedFY==="all" ? true : inFY(dateStr, selectedFY); }

      // Gather all realized transactions
      const realized = [];
      function addSells(ticker, name, sells) {
        for (const sale of sells||[]) {
          if (!inSelectedFY(sale.date)) continue;
          for (const lc of sale.lotsConsumed||[]) {
            realized.push({
              ticker, name, buyDate:lc.buyDate||"", buyPrice:lc.buyPrice,
              sellDate:lc.sellDate||sale.date, sellPrice:lc.sellPrice||sale.sellPrice,
              quantity:lc.quantity, pnl:lc.pnl, type:lc.type||"Unknown",
            });
          }
        }
      }
      for (const s of allStocks)  addSells(s.ticker, s.name||s.ticker, s.sellHistory);
      for (const h of holdings)   addSells(h.ticker, sMap[h.ticker]?.name||h.ticker, h.sells);

      // Aggregate dividends for selected FY from held stocks
      let totalDivFY = 0;
      const today = new Date(); today.setHours(23,59,59,0);
      for (const h of holdings) {
        const s = sMap[h.ticker]; if (!s) continue;
        const divs = s.corporateActions?.dividends||[];
        const lots = h.lots?.length?h.lots:[{purchaseDate:null,quantity:h.quantity??0}];
        for (const div of divs) {
          if (!div.amount) continue;
          const dateStr = div.recordDate||div.announced||null;
          if (!dateStr||!inSelectedFY(dateStr)) continue;
          const recordDate = new Date(dateStr); if (recordDate>today) continue;
          const eligibleQty = lots.reduce((sum,lot)=>{
            if (!lot.purchaseDate) return sum+(lot.quantity||0);
            return new Date(lot.purchaseDate)<=recordDate?sum+(lot.quantity||0):sum;
          },0);
          totalDivFY += eligibleQty*div.amount;
        }
      }

      // Summary figures
      const stcgTotal = realized.filter(r=>r.type==="STCG").reduce((s,r)=>s+r.pnl,0);
      const ltcgTotal = realized.filter(r=>r.type==="LTCG").reduce((s,r)=>s+r.pnl,0);
      const fyLabel   = selectedFY==="all" ? "All years" : `FY${selectedFY}`;

      const rows = [];
      // Summary block at top
      rows.push(["SUMMARY",fyLabel,"","","","","","","",""]);
      rows.push(["Short Term P&L (STCG)","",stcgTotal.toFixed(2),"","","","","","",""]);
      rows.push(["Long Term P&L (LTCG)","",ltcgTotal.toFixed(2),"","","","","","",""]);
      rows.push(["Dividends received","",totalDivFY.toFixed(2),"","","","","","",""]);
      rows.push(["","","","","","","","","",""]);
      // Detail header
      rows.push(["Ticker","Name","Buy Date","Buy Price","Sell Date","Sell Price","Quantity","P&L","Type","Status"]);
      // Detail rows — realized only
      for (const r of realized) {
        rows.push([r.ticker, r.name, r.buyDate, r.buyPrice, r.sellDate, r.sellPrice, r.quantity, r.pnl.toFixed(2), r.type, "Realized"]);
      }
      if (realized.length===0) rows.push(["No realized transactions for the selected period","","","","","","","","",""]);

      // BOM prefix ensures Excel opens UTF-8 correctly and avoids foreign characters
      const bom = "\uFEFF";
      const csv = bom + rows.map(r=>r.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob = new Blob([csv],{type:"text/csv;charset=utf-8"});
      const a = Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:`buffett-compos-tax-${fyLabel.replace(/\s/g,"-")}.csv`});
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
      document.getElementById("export-status").textContent=`✓ Tax summary downloaded (${fyLabel})`;
      setTimeout(()=>{document.getElementById("export-status").textContent="";},3000);
    });
    // ── Import watchlist CSV ─────────────────────────────────────────
    document.getElementById("import-watchlist-btn").addEventListener("click", async () => {
      const file = document.getElementById("import-watchlist-file").files[0];
      const statusEl = document.getElementById("import-status");
      if (!file) { statusEl.textContent = "Select a CSV file first."; return; }
      statusEl.textContent = "Reading…";
      try {
        const text = await file.text();
        const lines = text.replace(/^\uFEFF/,"").split("\n").map(l=>l.trim()).filter(Boolean);
        if (lines.length < 2) { statusEl.textContent = "CSV appears empty."; return; }
        const header = lines[0].split(",").map(h=>h.replace(/^"|"$/g,"").trim());
        const tickerIdx = header.findIndex(h=>h.toLowerCase()==="ticker");
        const nameIdx   = header.findIndex(h=>h.toLowerCase()==="name");
        const boardIdx  = header.findIndex(h=>h.toLowerCase()==="board");
        const capIdx    = header.findIndex(h=>h.toLowerCase().includes("cap category"));
        if (tickerIdx===-1){statusEl.textContent="CSV must have a Ticker column.";return;}

        function getCell(cells, idx) { return idx>=0 ? (cells[idx]||"").replace(/^"|"$/g,"").trim() : ""; }

        let added=0, skipped=0;
        for (let i=1;i<lines.length;i++) {
          const cells = lines[i].split(",");
          const ticker = getCell(cells, tickerIdx); if (!ticker) continue;
          const existing = await StockStore.get(ticker);
          if (existing) { skipped++; continue; } // don't overwrite
          const newStock = {
            ticker,
            name:         getCell(cells, nameIdx) || ticker,
            status:       "active",
            board:        getCell(cells, boardIdx) || "mainboard",
            capOverride:  getCell(cells, capIdx) || null,
            addedDate:    new Date().toISOString().slice(0,10),
            fundamentals: { source:null, lastUpdated:null, currentPrice:null, marketCap:null, annual:{}, quarterly:{} },
            shareholding: { source:null, lastUpdated:null, history:[] },
            corporateActions: { source:null, lastUpdated:null, dividends:[], splits:[], bonus:[] },
            priceContext: { source:null, lastUpdated:null },
            notes: [], thesis: { text:"", lastUpdated:null },
          };
          await StockStore.set(ticker, newStock);
          added++;
        }
        statusEl.textContent = `✓ Imported ${added} stock${added===1?"":"s"}${skipped?` · ${skipped} already existed`:""}. Fetch fundamentals to load data.`;
        setTimeout(()=>{statusEl.textContent="";},6000);
      } catch(e) {
        statusEl.textContent = `Import failed: ${e.message}`;
      }
    });

    async function renderBoardList() {
      const stocks = await StockStore.getActive();
      const classEl = document.getElementById("board-classification-list");
      if (stocks.length === 0) {
        classEl.innerHTML = `<span class="muted">No stocks on watchlist yet.</span>`;
        return;
      }

      const CAP_OPTIONS = ["", "Large cap", "Mid cap", "Small cap"];

      classEl.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; padding:4px 0; border-bottom:0.5px solid var(--color-border); margin-bottom:4px;">
          <span class="muted" style="font-size:10px;">Stock</span>
          <span class="muted" style="font-size:10px;">Board</span>
          <span class="muted" style="font-size:10px;">Cap category</span>
        </div>` +
        stocks.map(s => `
        <div style="display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; padding:5px 0; border-bottom:0.5px solid var(--color-border);">
          <span style="font-size:12px;">${s.name || s.ticker}</span>
          <div style="display:flex; gap:8px;">
            ${["mainboard","sme","microcap"].map(b => `
              <label style="display:flex; align-items:center; gap:2px; font-size:10px;">
                <input type="radio" name="board-${s.ticker}" value="${b}" ${(!s.board && b==="mainboard") || s.board===b ? "checked" : ""}/>
                ${b==="mainboard"?"Main":b==="sme"?"SME":"μCap"}
              </label>`).join("")}
          </div>
          <select name="cap-${s.ticker}" style="font-size:10px; padding:2px 4px; border:0.5px solid var(--color-border); border-radius:4px; background:var(--color-bg); color:var(--color-text);">
            ${CAP_OPTIONS.map(c => `<option value="${c}" ${(s.capOverride||"")=== c ? "selected":""}>${c || "Auto"}</option>`).join("")}
          </select>
        </div>`).join("");

      document.getElementById("save-board-classification-btn").onclick = async () => {
        const statusEl = document.getElementById("board-save-status");
        statusEl.textContent = "Saving...";
        const freshStocks = await StockStore.getActive();
        for (const s of freshStocks) {
          const boardSel = document.querySelector(`input[name="board-${CSS.escape(s.ticker)}"]:checked`);
          const capSel   = document.querySelector(`select[name="cap-${CSS.escape(s.ticker)}"]`);
          const fresh = await StockStore.get(s.ticker);
          if (!fresh) continue;
          if (boardSel) fresh.board = boardSel.value;
          if (capSel)   fresh.capOverride = capSel.value || null;
          await StockStore.set(s.ticker, fresh);
        }
        statusEl.textContent = "✓ Saved";
        setTimeout(() => { statusEl.textContent = ""; }, 2000);
      };
    }

    const boardHeader = document.getElementById("board-class-header");
    const boardPanel  = document.getElementById("board-class-panel");
    const boardChev   = document.getElementById("board-class-chevron");
    let boardOpen = false;
    boardHeader.addEventListener("click", async () => {
      boardOpen = !boardOpen;
      boardPanel.style.display = boardOpen ? "block" : "none";
      boardChev.textContent = boardOpen ? "▼ collapse" : "▶ expand";
      if (boardOpen) await renderBoardList(); // re-reads from DB every time
    });

    function formatWhen(iso) {
      if (!iso) return "never";
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.round(diffMs / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.round(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return new Date(iso).toLocaleDateString("en-IN");
    }

    function renderDriveCard() {
      document.getElementById("drive-status-card").innerHTML = settings.driveConnected
        ? `<div>Connected · last pushed ${formatWhen(settings.lastSyncPush)} · last pulled ${formatWhen(settings.lastSyncPull)}</div>
           <div class="muted" style="font-size:11px; margin-top:4px;">
             "Sync now" pulls from Drive first, then pushes your local data — both directions, Drive wins on conflict.<br>
             Auto-pull runs silently on every app open if a valid session exists.
           </div>
           <div style="display:flex; gap:8px; margin-top:8px;">
             <button id="sync-now-btn" class="btn btn-small">Sync now (↓ pull + ↑ push)</button>
             <button id="disconnect-drive-btn" class="btn btn-small btn-danger">Disconnect</button>
           </div>
           <div id="sync-status-line" class="muted" style="margin-top:6px; font-size:11px;"></div>`
        : `<div class="muted">Not connected — your data stays local-only on this device until connected.</div>
           <button id="connect-drive-btn" class="btn btn-small" style="margin-top:8px;">Connect Drive</button>
           <div id="sync-status-line" class="muted" style="margin-top:6px; font-size:11px;"></div>`;
      wireDriveButtons();
    }

    function wireDriveButtons() {
      const connectBtn = document.getElementById("connect-drive-btn");
      if (connectBtn) {
        connectBtn.addEventListener("click", async () => {
          const statusLine = document.getElementById("sync-status-line");
          statusLine.textContent = "Connecting...";
          try {
            const token = await getAccessToken();
            settings.driveConnected = true;
            await MetaStore.setSettings(settings);

            const remoteData = await pullFromDrive(token);
            if (remoteData) {
              await importAll(remoteData);
              settings.lastSyncPull = new Date().toISOString();
              await MetaStore.setSettings(settings);
            }
            statusLine.textContent = "Connected.";
            renderDriveCard();
          } catch (err) {
            statusLine.textContent = `Couldn't connect: ${err.message}`;
          }
        });
      }

      const syncBtn = document.getElementById("sync-now-btn");
      if (syncBtn) {
        syncBtn.addEventListener("click", async () => {
          const statusLine = document.getElementById("sync-status-line");
          statusLine.textContent = "Syncing...";
          try {
            const token = await getAccessToken();
            const remoteData = await pullFromDrive(token);
            if (remoteData) {
              await importAll(remoteData);
              settings.lastSyncPull = new Date().toISOString();
            }
            const localData = await exportAll();
            await pushToDrive(token, localData);
            settings.lastSyncPush = new Date().toISOString();
            await MetaStore.setSettings(settings);
            statusLine.textContent = "Synced.";
            renderDriveCard();
          } catch (err) {
            statusLine.textContent = `Sync failed: ${err.message}`;
          }
        });
      }

      const disconnectBtn = document.getElementById("disconnect-drive-btn");
      if (disconnectBtn) {
        disconnectBtn.addEventListener("click", async () => {
          const confirmed = confirm("Disconnect Drive? Your local data stays on this device, but this device will stop syncing until you reconnect.");
          if (!confirmed) return;
          disconnectDrive();
          settings.driveConnected = false;
          await MetaStore.setSettings(settings);
          renderDriveCard();
        });
      }
    }

    renderDriveCard();

    document.getElementById("de-green-input").value = settings.deRule.green;
    document.getElementById("de-yellow-input").value = settings.deRule.yellow;
    document.getElementById("indian-api-key-input").value = settings.indianApiKey || "";
    document.getElementById("gemini-key-input").value = settings.geminiApiKey || "";

    // Theme toggle
    const currentTheme = settings.theme || "auto";
    document.querySelectorAll(".theme-btn").forEach((btn) => {
      if (btn.dataset.theme === currentTheme) btn.classList.add("theme-btn-active");
      btn.addEventListener("click", async () => {
        const chosen = btn.dataset.theme;
        settings.theme = chosen;
        await MetaStore.setSettings(settings);
        applyTheme(chosen);
        document.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("theme-btn-active"));
        btn.classList.add("theme-btn-active");
      });
    });

    document.getElementById("save-indian-api-key-btn").addEventListener("click", async () => {
      settings.indianApiKey = document.getElementById("indian-api-key-input").value.trim();
      await MetaStore.setSettings(settings);
      alert(settings.indianApiKey ? "indianapi.in key saved." : "indianapi.in key cleared.");
    });

    document.getElementById("save-gemini-key-btn").addEventListener("click", async () => {
      settings.geminiApiKey = document.getElementById("gemini-key-input").value.trim();
      await MetaStore.setSettings(settings);
      alert(settings.geminiApiKey ? "Gemini key saved." : "Gemini key cleared.");
    });

    document.getElementById("save-thresholds-btn").addEventListener("click", async () => {
      settings.deRule.green = parseFloat(document.getElementById("de-green-input").value);
      settings.deRule.yellow = parseFloat(document.getElementById("de-yellow-input").value);
      await MetaStore.setSettings(settings);
      DEFAULT_RULES.de.green = settings.deRule.green;
      DEFAULT_RULES.de.yellow = settings.deRule.yellow;
      alert("Thresholds saved.");
    });

    document.getElementById("export-backup-btn").addEventListener("click", async () => {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById("export-tickers-btn").addEventListener("click", async () => {
      const stocks = await StockStore.getActive();
      const tickers = stocks.map((s) => s.ticker);
      const blob = new Blob([JSON.stringify(tickers, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tickers.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    // ── Diagnostics — expand/collapse + snapshot clear ────────────────
    const diagHeader = document.getElementById("diag-header");
    const diagPanel  = document.getElementById("diag-panel");
    const diagChev   = document.getElementById("diag-chevron");
    let diagOpen = false;

    async function showSnapshotCount() {
      try {
        const snaps = (await MetaStore.getSnapshots()) || {};
        const counts = ["all","mainboard","sme"].map(f => `${f}: ${(snaps[f]||[]).length}`).join(" · ");
        const countEl = document.getElementById("snapshot-count");
        if (countEl) countEl.textContent = `(${counts} snapshots stored)`;
      } catch {}
    }

    diagHeader.addEventListener("click", async () => {
      diagOpen = !diagOpen;
      diagPanel.style.display = diagOpen ? "block" : "none";
      diagChev.textContent    = diagOpen ? "▼ collapse" : "▶ expand";
      if (diagOpen) await showSnapshotCount();
    });

    document.getElementById("clear-snapshots-btn").addEventListener("click", async () => {
      const statusEl = document.getElementById("diag-status");
      if (!confirm("Clear all portfolio snapshots? The growth chart will be empty until you refresh prices again.")) return;
      await MetaStore.setSnapshots({ all: [], mainboard: [], sme: [], index: [] });
      statusEl.textContent = "✓ Snapshots cleared. Tap ↻ Prices on the watchlist to start fresh. Push to Drive to sync the cleared state.";
      await showSnapshotCount();
      setTimeout(() => { statusEl.textContent = ""; }, 8000);
    });
  },
};

registerScreen("settings", settingsScreen);