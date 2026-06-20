/**
 * screens/settings.js
 *
 * Drive connection status, manual sync trigger, sector benchmarks,
 * and the D/E threshold (configurable here rather than hardcoded,
 * since the user already changed it once during planning).
 */

const settingsScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Settings</div>

        <div class="section-label">Google Drive</div>
        <div class="card" id="drive-status-card">Loading...</div>

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

        <div class="section-label">Sector benchmarks</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px;">Used by the "vs sector" comparison on each stock. Set once, update yearly.</div>
          <div id="sector-benchmarks-list"></div>
          <button id="add-sector-bench-btn" class="btn btn-small" style="margin-top:8px;">+ Add sector</button>
        </div>

        <div class="section-label">Archived stocks</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px;">Stocks you researched and passed on. Notes stay intact — restore or delete from here.</div>
          <button id="view-archived-btn" class="btn btn-small">View archived (<span id="archived-count">0</span>)</button>
        </div>

        <div class="section-label">Data</div>
        <div class="card">
          <button id="export-backup-btn" class="btn btn-small">Export backup (.json)</button>
        </div>
      </div>`;
  },

  async afterRender() {
    const settings = (await MetaStore.getSettings()) || {
      driveConnected: false,
      lastSyncPush: null,
      lastSyncPull: null,
      deRule: { green: 0.1, yellow: 0.2 },
    };

    document.getElementById("drive-status-card").innerHTML = settings.driveConnected
      ? `<div>Connected · last pushed ${settings.lastSyncPush || "never"} · last pulled ${settings.lastSyncPull || "never"}</div>
         <button id="sync-now-btn" class="btn btn-small">Sync now</button>`
      : `<div class="muted">Not connected</div><button id="connect-drive-btn" class="btn btn-small">Connect Drive</button>`;

    document.getElementById("de-green-input").value = settings.deRule.green;
    document.getElementById("de-yellow-input").value = settings.deRule.yellow;

    document.getElementById("save-thresholds-btn").addEventListener("click", async () => {
      settings.deRule.green = parseFloat(document.getElementById("de-green-input").value);
      settings.deRule.yellow = parseFloat(document.getElementById("de-yellow-input").value);
      await MetaStore.setSettings(settings);
      DEFAULT_RULES.de.green = settings.deRule.green;
      DEFAULT_RULES.de.yellow = settings.deRule.yellow;
      alert("Thresholds saved.");
    });

    const archived = await StockStore.getArchived();
    document.getElementById("archived-count").textContent = archived.length;
    document.getElementById("view-archived-btn").addEventListener("click", () => {
      window.location.hash = "#archived";
    });

    async function renderSectorBenchmarks() {
      const benchmarks = (await MetaStore.getSectorBenchmarks()) || {};
      const entries = Object.entries(benchmarks);
      document.getElementById("sector-benchmarks-list").innerHTML =
        entries.length === 0
          ? '<div class="muted">No sector benchmarks set yet.</div>'
          : entries
              .map(
                ([sector, b]) => `
            <div class="metric-row">
              <div class="metric-row-label">${sector}</div>
              <div class="metric-row-value">ROE ${b.roe}% · D/E ${b.de} · CAGR ${b.epsCagr}%</div>
            </div>`
              )
              .join("");
    }
    await renderSectorBenchmarks();

    document.getElementById("add-sector-bench-btn").addEventListener("click", async () => {
      const sector = prompt("Sector name (must match what you type for stocks, e.g. 'Pharma'):");
      if (!sector) return;
      const roe = parseFloat(prompt("Sector median ROE %:", "15"));
      const de = parseFloat(prompt("Sector median D/E:", "0.2"));
      const epsCagr = parseFloat(prompt("Sector median EPS CAGR %:", "10"));
      const fcfYield = parseFloat(prompt("Sector median FCF yield %:", "2.5"));
      const benchmarks = (await MetaStore.getSectorBenchmarks()) || {};
      benchmarks[sector] = { roe, de, epsCagr, fcfYield };
      await MetaStore.setSectorBenchmarks(benchmarks);
      await renderSectorBenchmarks();
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

    const syncBtn = document.getElementById("sync-now-btn");
    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        alert("Wire this button to your OAuth token + driveSync.pushToDrive/pullFromDrive — see js/driveSync.js");
      });
    }
    const connectBtn = document.getElementById("connect-drive-btn");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        alert("Wire this button to your existing Google OAuth flow from V-Plantations/Veettu Chilavu.");
      });
    }
  },
};

registerScreen("settings", settingsScreen);
