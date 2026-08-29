/**
 * service-worker.js
 *
 * Cache-first for app shell (HTML/CSS/JS), network-first for anything
 * hitting nseindia.com or googleapis.com — those must always be live
 * data, never served stale from cache.
 */

const CACHE_NAME = "portfolio-tracker-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/ui-state.js",
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

// app.js posts SKIP_WAITING when it detects a waiting SW so it activates
// immediately without requiring the user to close and reopen the PWA.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Add each file individually so a single 404 doesn't abort the
      // entire install and leave the old SW permanently in control.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      // claim() FIRST so the new SW controls all clients before we tell them to reload.
      // The old order (postMessage then claim) caused a race on Android where the page
      // reloaded under the old SW because claim() hadn't completed yet.
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: "SW_UPDATED" }));
        })
      )
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always serve clear-cache.html from network — it must never be cached
  // so it can be used to escape a broken cache state.
  if (url.pathname.endsWith("clear-cache.html")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Never cache the NSE proxy Worker or Google API calls — always go
  // to network, since this data must always be live, never stale.
  if (url.hostname.includes("workers.dev") || url.hostname.includes("googleapis.com") || url.hostname.includes("generativelanguage.googleapis.com") || url.hostname.includes("indianapi.in")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});