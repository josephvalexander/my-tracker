/**
 * service-worker.js
 *
 * Cache-first for app shell (HTML/CSS/JS), network-first for anything
 * hitting nseindia.com or googleapis.com — those must always be live
 * data, never served stale from cache.
 *
 * Update strategy:
 *  - CACHE_NAME is injected with the commit SHA by deploy.yml on every
 *    push — this guarantees the SW file changes byte-for-byte each deploy.
 *  - skipWaiting() + clients.claim() activate the new SW immediately.
 *  - Old caches are deleted in activate so stale files are never served.
 *  - SW_UPDATED postMessage triggers a hard reload in app.js.
 */

// deploy.yml replaces "portfolio-tracker-v1" with "portfolio-tracker-<SHA>"
// on every push to main, guaranteeing a byte-change in this file.
const CACHE_NAME = "portfolio-tracker-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/formatters.js",
  "./js/calculations.js",
  "./js/holdingsCalculations.js",
  "./js/storage.js",
  "./js/screenerParser.js",
  "./js/indianApiParser.js",
  "./js/nseClient.js",
  "./js/driveSync.js",
  "./js/geminiClient.js",
  "./js/router.js",
  "./js/app.js",
  "./js/screens/watchlist.js",
  "./js/screens/stockDetail.js",
  "./js/screens/stockCharts.js",
  "./js/screens/stockNotes.js",
  "./js/screens/editStock.js",
  "./js/screens/holdings.js",
  "./js/screens/addHolding.js",
  "./js/screens/portfolio.js",
  "./js/screens/compare.js",
  "./js/screens/calendar.js",
  "./js/screens/goals.js",
  "./js/screens/archived.js",
  "./js/screens/settings.js",
  "./js/screens/addStock.js",
  "./js/screens/help.js",
  "./manifest.json",
];

// ── Message ──────────────────────────────────────────────────────────────────
// app.js posts SKIP_WAITING when it detects a waiting SW (e.g. user had the
// PWA open in the background during deployment). This lets the new SW activate
// immediately without requiring the user to close and reopen the app.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Install ───────────────────────────────────────────────────────────────────
// Pre-cache the full app shell. skipWaiting() means the new SW activates
// immediately without waiting for old tabs to close — critical for PWAs
// where the user often never closes the tab.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
// 1. Delete every cache that isn't the new CACHE_NAME (removes old versioned
//    caches left by previous deploys).
// 2. clients.claim() makes this SW the controller for all open tabs immediately
//    (pairs with skipWaiting above).
// 3. Notify all open windows so they hard-reload and pick up new JS/CSS.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => {
            // SW_UPDATED tells app.js to do a hard reload so the new cached
            // files are actually used rather than the already-parsed old ones.
            client.postMessage({ type: "SW_UPDATED" });
          });
        })
      )
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
// Network-first for live data APIs; cache-first for the app shell.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always fetch live: API proxy, Google APIs, Indian stock API
  if (
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("generativelanguage.googleapis.com") ||
    url.hostname.includes("indianapi.in")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: cache-first, fall back to network
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});