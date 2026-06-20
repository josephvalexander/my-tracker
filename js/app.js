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

async function seedDefaultsIfNeeded() {
  const existing = await MetaStore.getSettings();
  if (!existing) {
    await MetaStore.setSettings({
      driveConnected: false,
      lastSyncPush: null,
      lastSyncPull: null,
      deRule: { green: 0.1, yellow: 0.2 },
      verdictRules: {
        hardFlags: ["roeBelow15", "deAbove02", "pledgingAboveZero", "marginCompression2Q", "promoterHoldingDeclining"],
        softFlagThreshold: 2,
      },
    });
  }
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
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
  await registerServiceWorker();
  await autoPullOnOpen();
  initRouter();
}

document.addEventListener("DOMContentLoaded", init);
