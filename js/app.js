/**
 * app.js
 *
 * Bootstraps the app: registers the service worker, seeds default
 * settings on first run, auto-pulls from Drive if already connected
 * (so opening the app on any device starts from the latest synced
 * data), then starts the router.
 *
 * Push stays manual — see js/driveSync.js for why.
 */

/**
 * Applies a theme to the document. "auto" removes any explicit
 * data-theme attribute so the CSS media query takes over.
 * "light" or "dark" sets the attribute to override the media query.
 * Exposed globally so settings.js can call it on toggle.
 */
function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

async function seedDefaultsIfNeeded() {
  const existing = await MetaStore.getSettings();
  if (!existing) {
    await MetaStore.setSettings({
      driveConnected: false,
      lastSyncPush: null,
      lastSyncPull: null,
      theme: "auto",
      deRule: { green: 0.1, yellow: 0.2 },
      verdictRules: {
        hardFlags: ["roeBelow15", "deAbove02", "marginCompression2Q", "promoterHoldingDeclining"],
        softFlagThreshold: 2,
      },
    });
  }
}

/**
 * Silently detects and fixes a stale service worker.
 *
 * How it works: the deploy workflow stamps a SHORT_SHA into a
 * <meta name="build-id"> in index.html AND into the CACHE_NAME in
 * service-worker.js. On every app open we fetch index.html from the
 * network (bypassing the SW cache) and read its build-id. If it
 * differs from the build-id in the currently-loaded page, the SW is
 * serving stale files — we unregister it, wipe all caches, and reload.
 *
 * This is self-healing: no user action needed. The reload re-registers
 * the correct SW and serves fresh files from that point on.
 */
async function silentSWUpdate() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const buildId = document.querySelector("meta[name='build-id']")?.content;
    if (!buildId || buildId === "BUILD_ID_PLACEHOLDER") return; // dev / not yet injected

    const reg = await navigator.serviceWorker.getRegistration("./");
    if (!reg) return;

    // Force the browser to re-fetch service-worker.js from network right now.
    // updateViaCache:"none" (set at register time) ensures no HTTP cache is used.
    await reg.update();

    // After update(), one of three states:
    // 1. reg.installing  — new SW downloading/installing right now
    // 2. reg.waiting     — new SW installed, waiting for old SW to release
    // 3. neither         — SW was already current, nothing to do

    const newWorker = reg.installing || reg.waiting;
    if (!newWorker) return; // already up to date

    console.info("[SW] New version detected — activating silently…");

    // Tell the new SW to skip waiting immediately.
    // Our new SW has the SKIP_WAITING message handler.
    newWorker.postMessage({ type: "SKIP_WAITING" });

    // Wait for it to become the active controller, then reload.
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      // Fallback: if controllerchange doesn't fire within 3s, reload anyway
      setTimeout(resolve, 3000);
    });

    window.location.reload();
    await new Promise(() => {}); // prevent initRouter running on stale page
  } catch (err) {
    console.warn("[SW] silentSWUpdate check failed:", err.message);
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    // updateViaCache: "none" forces the browser to always fetch
    // service-worker.js from the network, bypassing HTTP cache.
    // Without this, Chrome on Android can serve the old SW from disk
    // cache for up to 24 h — so users never see new deploys.
    const registration = await navigator.serviceWorker.register(
      "./service-worker.js",
      { updateViaCache: "none" }
    );

    // Check for an update immediately on every app open instead of
    // waiting for the browser's default polling interval.
    registration.update().catch(() => {});

    // SW_UPDATED is posted by the new SW after activate + clients.claim().
    // Small delay lets claim() fully settle on Android before reload fires.
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED") {
        setTimeout(() => window.location.reload(), 150);
      }
    });

    // If a waiting SW exists on load (app was in background during deploy),
    // tell it to activate immediately rather than waiting for tab close.
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

  } catch (err) {
    console.warn("Service worker registration failed:", err);
  }
}

/**
 * Full-screen auth gate shown when Drive is connected but the GIS token
 * has expired. Must be triggered by a user gesture — GIS does not allow
 * silent token refresh, so we show a button and wait for the tap.
 * Returns a Promise that resolves once the user authenticates or skips.
 */
function showAuthGate() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "auth-gate";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:9999",
      "display:flex", "flex-direction:column",
      "align-items:center", "justify-content:center",
      "background:var(--color-bg)",
      "padding:32px 24px",
      "text-align:center",
    ].join(";");

    overlay.innerHTML = `
      <div style="margin-bottom:28px;">
        <div style="font-size:36px;margin-bottom:12px;">📈</div>
        <div style="font-size:22px;font-weight:700;color:var(--color-text);margin-bottom:6px;">Buffett Compos</div>
        <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.5;">
          Your portfolio is backed up on Google Drive.<br>Sign in to sync the latest data.
        </div>
      </div>
      <div id="auth-status" style="font-size:12px;color:var(--color-text-secondary);min-height:18px;margin-bottom:16px;"></div>
      <button id="auth-signin-btn" style="
        display:flex;align-items:center;gap:10px;
        padding:12px 24px;
        background:var(--color-surface);
        color:var(--color-text);
        border:0.5px solid var(--color-border);
        border-radius:10px;
        font-size:15px;font-weight:600;
        cursor:pointer;width:100%;max-width:280px;
        justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,0.08);
        margin-bottom:12px;
      ">
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
        Sign in with Google
      </button>
      <button id="auth-offline-btn" style="
        background:none;border:none;
        color:var(--color-text-tertiary);
        font-size:12px;cursor:pointer;
        padding:8px;text-decoration:underline;
      ">Continue without syncing</button>
    `;

    document.body.appendChild(overlay);

    const statusEl  = overlay.querySelector("#auth-status");
    const signinBtn = overlay.querySelector("#auth-signin-btn");
    const offlineBtn = overlay.querySelector("#auth-offline-btn");

    function dismiss() { overlay.remove(); resolve(); }

    signinBtn.addEventListener("click", async () => {
      signinBtn.disabled = true;
      signinBtn.style.opacity = "0.6";
      statusEl.textContent = "Connecting to Google…";
      try {
        const token = await getAccessToken();
        statusEl.textContent = "Pulling latest data…";
        const remoteData = await pullFromDrive(token);
        if (remoteData) {
          await importAll(remoteData);
          const s = await MetaStore.getSettings();
          s.lastSyncPull = new Date().toISOString();
          await MetaStore.setSettings(s);
        }
        dismiss();
      } catch (err) {
        console.warn("Auth gate sign-in failed:", err.message);
        statusEl.style.color = "var(--color-red)";
        statusEl.textContent = "Sign-in failed — try again or continue offline.";
        signinBtn.disabled = false;
        signinBtn.style.opacity = "1";
      }
    });

    offlineBtn.addEventListener("click", () => dismiss());
  });
}

async function autoPullOnOpen() {
  const settings = await MetaStore.getSettings();
  if (!settings?.driveConnected) return;

  // Try silent token first — works within ~1 hour of the last explicit sign-in
  try {
    const token = await getAccessToken({ silentOnly: true });
    if (token) {
      const remoteData = await pullFromDrive(token);
      if (remoteData) {
        await importAll(remoteData);
        settings.lastSyncPull = new Date().toISOString();
        await MetaStore.setSettings(settings);
      }
      return;
    }
  } catch (err) {
    console.warn("Silent Drive pull failed:", err.message);
  }

  // Token expired — show auth gate so user can re-authenticate with a
  // deliberate gesture (GIS requires a user action to issue tokens).
  await showAuthGate();
}

async function migrateWatchlistPrice() {
  // One-time migration: set watchlistPrice = currentPrice for any active
  // stock that doesn't have it yet. Runs silently on every startup but
  // only does work on stocks missing the field — effectively runs once.
  try {
    const stocks = await StockStore.getActive();
    for (const stock of stocks) {
      if (!stock.watchlistPrice && stock.fundamentals?.currentPrice) {
        stock.watchlistPrice = stock.fundamentals.currentPrice;
        await StockStore.set(stock.ticker, stock);
      }
    }
  } catch (err) {
    console.warn("watchlistPrice migration failed:", err);
  }
}


/**
 * Silently pushes local data to Drive after any user-initiated write.
 * Uses silentOnly — never triggers a consent popup mid-flow.
 * If the token has expired the push is skipped silently; the auth gate
 * on next launch will re-authenticate and pull the latest data.
 * Exposed as window.autoPush so all screen scripts can call it.
 */
async function autoPush() {
  try {
    const settings = await MetaStore.getSettings();
    if (!settings?.driveConnected) return;
    const token = await getAccessToken({ silentOnly: true });
    if (!token) return;
    const localData = await exportAll();
    await pushToDrive(token, localData);
    settings.lastSyncPush = new Date().toISOString();
    await MetaStore.setSettings(settings);
  } catch (err) {
    console.warn("Auto-push to Drive failed:", err.message);
  }
}
window.autoPush = autoPush;

async function init() {
  await seedDefaultsIfNeeded();
  const settings = await MetaStore.getSettings();
  applyTheme(settings?.theme || "auto");
  // Apply user-saved thresholds to DEFAULT_RULES immediately so all screens
  // use the correct values on every launch, not just after visiting Settings.
  if (settings?.deRule) {
    if (settings.deRule.green  != null) DEFAULT_RULES.de.green  = settings.deRule.green;
    if (settings.deRule.yellow != null) DEFAULT_RULES.de.yellow = settings.deRule.yellow;
  }
  await silentSWUpdate(); // unregisters stale SW and reloads if a new build is available
  await registerServiceWorker();
  await autoPullOnOpen();
  await migrateWatchlistPrice(); // must run AFTER pull so Drive doesn't overwrite it
  savePortfolioSnapshot().catch(() => {}); // capture today's value on each open
  initRouter();
}

document.addEventListener("DOMContentLoaded", init);