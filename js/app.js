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

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    // updateViaCache: "none" tells the browser to ALWAYS fetch service-worker.js
    // from the network (bypassing the HTTP cache) when checking for updates.
    // Without this, Chrome on Android can serve the old SW from disk cache for
    // up to 24 hours, so users never see new deploys without reinstalling.
    const registration = await navigator.serviceWorker.register(
      "./service-worker.js",
      { updateViaCache: "none" }
    );

    // Immediately check for an update so installs don't have to wait for
    // the browser's default polling interval (up to 24 h in practice).
    registration.update().catch(() => {});

    // SW_UPDATED is posted by the new SW after it activates and claims all
    // clients. Hard-reload (location.reload()) so the new cached files are
    // actually executed, not just fetched — the page's already-parsed JS
    // won't update otherwise.
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED") {
        // Small delay lets clients.claim() fully settle on Android before
        // the reload fires, avoiding a race where the page reloads under
        // the old SW.
        setTimeout(() => window.location.reload(), 150);
      }
    });

    // Fallback: if a waiting SW exists when the page loads (e.g. the user
    // had the app open in the background during deployment), tell it to
    // activate immediately rather than waiting for the tab to close.
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
 * Auto-pulls from Drive if the user has previously connected it AND a
 * still-valid cached token exists from a recent manual sign-in. Never
 * triggers a consent popup (popups on page load get blocked by the
 * browser anyway, and silently failing to do so would just look like
 * a hang). If no valid cached token exists, this is a no-op — the
 * watchlist's "last synced" line reflects this honestly rather than
 * implying a pull happened when it didn't.
 */
async function autoPullOnOpen() {
  const settings = await MetaStore.getSettings();
  if (!settings?.driveConnected) return;

  try {
    const token = await getAccessToken({ silentOnly: true });
    if (!token) {
      console.info("Auto-pull skipped: no valid cached Drive session. Tap Sync in Settings to refresh.");
      return;
    }
    const remoteData = await pullFromDrive(token);
    if (remoteData) {
      await importAll(remoteData);
      settings.lastSyncPull = new Date().toISOString();
      await MetaStore.setSettings(settings);
    }
  } catch (err) {
    console.warn("Auto-pull from Drive failed:", err.message);
  }
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

async function init() {
  await seedDefaultsIfNeeded();
  const settings = await MetaStore.getSettings();
  applyTheme(settings?.theme || "auto");
  await registerServiceWorker();
  await autoPullOnOpen();
  await migrateWatchlistPrice(); // must run AFTER pull so Drive doesn't overwrite it
  savePortfolioSnapshot().catch(() => {}); // capture today's value on each open
  initRouter();
}

document.addEventListener("DOMContentLoaded", init);