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

        <div class="section-label">AI draft assist</div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px; font-size:11px;">Used by "Draft with AI" buttons on each stock's edit screen, for the business/moat/market-position fields. Get a free key from <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a>. Stored only on this device — never committed to your repo, never sent anywhere except Google's API.</div>
          <input type="password" id="gemini-key-input" placeholder="Paste your Gemini API key" />
          <button id="save-gemini-key-btn" class="btn btn-small" style="margin-top:8px;">Save key</button>
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
           <div style="display:flex; gap:8px; margin-top:8px;">
             <button id="sync-now-btn" class="btn btn-small">Sync now</button>
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
    document.getElementById("gemini-key-input").value = settings.geminiApiKey || "";

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

    const archived = await StockStore.getArchived();
    document.getElementById("archived-count").textContent = archived.length;
    document.getElementById("view-archived-btn").addEventListener("click", () => {
      window.location.hash = "#archived";
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
  },
};

registerScreen("settings", settingsScreen);
