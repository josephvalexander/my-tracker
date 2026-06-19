/**
 * app.js
 *
 * Bootstraps the app: registers the service worker, seeds default
 * settings on first run, then starts the router.
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

async function init() {
  await seedDefaultsIfNeeded();
  await registerServiceWorker();
  initRouter();
}

document.addEventListener("DOMContentLoaded", init);
