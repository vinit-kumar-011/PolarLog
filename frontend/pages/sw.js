/* =========================================================
   POLARLOG — SERVICE WORKER
   Basic installable PWA: caches the app shell (HTML/CSS/JS/icons)
   so pages load offline. API calls (/api/...) always go to the
   network — they are NOT cached, since that's phase 2
   (offline-first sync) work.
========================================================= */

const CACHE_NAME = "polarlog-shell-v4";

// Everything needed to render the app shell offline.
// Paths are relative to this file's location (/pages/sw.js).
const SHELL_ASSETS = [
  "dashboard.html",
  "cargo.html",
  "inventory.html",
  "stations.html",
  "shipments.html",
  "personnel.html",
  "alerts.html",
  "login.html",
  "index.html",
  "manifest.json",

  "../css/design-system.css",
  "../css/pl-sidebar.css",
  "../css/dashboard.css",
  "../css/cargo.css",
  "../css/inventory.css",
  "../css/stations.css",
  "../css/shipments.css",
  "../css/personnel.css",
  "../css/alerts.css",
  "../css/login.css",
  "../css/landing.css",

  "../js/offline-db.js",
  "../js/config.js",
  "../js/sync-manager.js",
  "../js/pl-sidebar.js",
  "../js/dashboard.js",
  "../js/dashboard-data.js",
  "../js/cargo.js",
  "../js/inventory.js",
  "../js/stations.js",
  "../js/shipments.js",
  "../js/personnel.js",
  "../js/alerts.js",
  "../js/login.js",
  "../js/landing.js",
  "../js/main.js",
  "../js/pwa-register.js",

  "../assets/icons/icon-192.png",
  "../assets/icons/icon-512.png",
];

// ---------- install: pre-cache the app shell ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails the whole install if one asset 404s, so cache
      // individually and just warn about the ones that are missing
      // (e.g. an image path that doesn't exist yet in this build).
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn("[sw] skip", url, err)),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

// ---------- activate: drop old caches ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// ---------- fetch: cache-first for the shell, network-only for the API ----------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — always hit the live backend so data
  // stays current. If offline, let it fail; each page's own
  // try/catch already shows an "OFFLINE" pill and a toast.
  if (url.pathname.startsWith("/api")) {
    return;
  }

  // Only handle same-origin GET requests.
  if (event.request.method !== "GET" || url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Cache a copy of newly-seen shell assets for next time.
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          // Offline and not cached: for a page navigation, fall back
          // to the dashboard shell rather than showing a browser error.
          if (event.request.mode === "navigate") {
            return caches.match("dashboard.html");
          }
          return undefined;
        });
    }),
  );
});
