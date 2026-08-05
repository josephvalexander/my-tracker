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
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");

      // Listen for the SW_UPDATED message sent by the new service worker
      // when it activates. Reload immediately so the user gets the new
      // files without needing to manually refresh or reinstall the PWA.
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_UPDATED") {
          window.location.reload();
        }
      });
    } catch (err) {
      console.warn("Service worker registration failed:", err);
    }
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

async function init() {
  await seedDefaultsIfNeeded();
  const settings = await MetaStore.getSettings();
  applyTheme(settings?.theme || "auto");
  await registerServiceWorker();
  await autoPullOnOpen();
  initRouter();
}

document.addEventListener("DOMContentLoaded", init);
