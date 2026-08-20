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
      </div>`;
  },

  async afterRender() {
    const settings = (await MetaStore.getSettings()) || {
      driveConnected: false, lastSyncPush: null, lastSyncPull: null,
      deRule: { green: 0.1, yellow: 0.2 },
    };

    // ── Board classification — expand/collapse, re-reads DB on expand ──
    async function renderBoardList() {
      const stocks = await StockStore.getActive();
      const classEl = document.getElementById("board-classification-list");
      if (stocks.length === 0) {
        classEl.innerHTML = `<span class="muted">No stocks on watchlist yet.</span>`;
        return;
      }
      classEl.innerHTML = stocks.map(s => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:0.5px solid var(--color-border); gap:8px;">
          <span style="font-size:13px; flex:1;">${s.name || s.ticker}</span>
          <div style="display:flex; gap:10px;">
            ${["mainboard","sme","microcap"].map(b => `
              <label style="display:flex; align-items:center; gap:3px; font-size:11px;">
                <input type="radio" name="board-${s.ticker}" value="${b}" ${(!s.board && b==="mainboard") || s.board===b ? "checked" : ""}/>
                ${b==="mainboard"?"Main":b==="sme"?"SME":"μCap"}
              </label>`).join("")}
          </div>
        </div>`).join("");

      document.getElementById("save-board-classification-btn").onclick = async () => {
        const statusEl = document.getElementById("board-save-status");
        statusEl.textContent = "Saving...";
        const freshStocks = await StockStore.getActive();
        for (const s of freshStocks) {
          const selected = document.querySelector(`input[name="board-${CSS.escape(s.ticker)}"]:checked`);
          if (selected) {
            const fresh = await StockStore.get(s.ticker);
            if (fresh && fresh.board !== selected.value) {
              fresh.board = selected.value;
              await StockStore.set(s.ticker, fresh);
            }
          }
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
  },
};

registerScreen("settings", settingsScreen);
