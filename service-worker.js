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
  "./js/calculations.js",
  "./js/holdingsCalculations.js",
  "./js/storage.js",
  "./js/screenerParser.js",
  "./js/nseClient.js",
  "./js/driveSync.js",
  "./js/router.js",
  "./js/app.js",
  "./js/screens/watchlist.js",
  "./js/screens/stockDetail.js",
  "./js/screens/holdings.js",
  "./js/screens/portfolio.js",
  "./js/screens/archived.js",
  "./js/screens/settings.js",
  "./js/screens/addStock.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache NSE or Google API calls — always go to network.
  if (url.hostname.includes("nseindia.com") || url.hostname.includes("googleapis.com")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
