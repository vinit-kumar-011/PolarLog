// The one place the API address lives.
const API_BASE = "http://localhost:5000";

/* =========================================================
   Session token helpers.
   The token is issued by POST /api/auth/login (see login.js)
   and must be sent as "Authorization: Bearer <token>" on every
   other API call. If the server ever says the token is missing/
   expired (401), we drop the session and bounce to login.html -
   this is what actually stops the "back button after logout"
   problem, since it doesn't matter what the page *looks* like
   restored from cache, the API calls behind it will fail closed.
========================================================= */
function getAuthToken() {
  return sessionStorage.getItem("polarlogToken");
}

function authHeaders(extra) {
  const token = getAuthToken();
  return Object.assign(
    {},
    extra,
    token ? { Authorization: "Bearer " + token } : {}
  );
}

function handleUnauthorized() {
  sessionStorage.removeItem("polarlogToken");
  sessionStorage.removeItem("polarlogDemoUser");
  if (!location.pathname.endsWith("login.html")) {
    window.location.replace("login.html");
  }
}

/* =========================================================
   apiGet(path)
   Network-first, cache-fallback. On success, the response is
   also stashed in IndexedDB so the same call can still return
   real (if stale) data when offline.
   Returns the same shape as before (the parsed JSON) so no
   existing page code needs to change. If the data came from
   the offline cache, a marker is attached:
     data.__stale === true
     data.__cachedAt === <timestamp the cache was written>
========================================================= */
async function apiGet(path) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error(`${path} returned 401`);
    }
    if (!response.ok) {
      throw new Error(`${path} returned ${response.status}`);
    }
    const data = await response.json();
    if (window.OfflineDB) window.OfflineDB.setCache(path, data);
    return data;
  } catch (err) {
    // Network unreachable (or the fetch itself failed) - fall back
    // to the last-known-good response for this endpoint, if we have one.
    if (window.OfflineDB) {
      const cached = await window.OfflineDB.getCache(path);
      if (cached) {
        const data = cached.data;
        try {
          data.__stale = true;
          data.__cachedAt = cached.updatedAt;
        } catch (_) {
          /* primitive response, can't tag it - fine, just return as-is */
        }
        return data;
      }
    }
    throw err;
  }
}

/* =========================================================
   apiSend(path, method, body)
   Tries the network first. If the request fails to even reach
   the server (offline), the write is queued in IndexedDB and
   replayed automatically once the connection returns (see
   sync-manager.js). HTTP-level errors (validation failures,
   4xx/5xx) are NOT queued - those are real failures and are
   returned immediately so the UI can show them.

   Returns:
     { ok: true,  data }              - succeeded immediately
     { ok: false, queued: true, id }  - offline, queued for later
     { ok: false, error }             - real HTTP/validation error
========================================================= */
async function apiSend(path, method, body) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (response.status === 401) {
      handleUnauthorized();
      return { ok: false, error: "Session expired, please log in again" };
    }
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: errBody.error || `Request failed (${response.status})`,
      };
    }
    const data = await response.json().catch(() => ({}));
    return { ok: true, data };
  } catch (err) {
    // Couldn't reach the server at all - queue it for later.
    if (window.OfflineDB) {
      const id = await window.OfflineDB.addToOutbox({
        method,
        endpoint: path,
        body,
      });
      if (window.PolarLogSync) window.PolarLogSync.refreshBadge();
      return { ok: false, queued: true, id };
    }
    return { ok: false, error: "Offline and no local queue available." };
  }
}

// config.js — append at the bottom

function setLiveStatus(online) {
  const pill = document.getElementById("livePill");
  if (!pill) return; // this page has no live pill (e.g. dashboard, stations) — no-op
  const dot = document.getElementById("liveDot");
  const text = document.getElementById("liveText");
  const sync = document.getElementById("syncText");

  if (online) {
    pill.style.color = "var(--green)";
    pill.style.background = "var(--green-bg)";
    dot.style.background = "var(--green)";
    dot.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.2)";
    text.textContent = "LIVE";
    if (sync) sync.textContent = "Synced just now";
  } else {
    pill.style.color = "var(--red)";
    pill.style.background = "var(--red-bg)";
    dot.style.background = "var(--red)";
    dot.style.boxShadow = "none";
    text.textContent = "OFFLINE";
    if (sync) sync.textContent = "Sync failed";
  }
}

// React live, not just on page load
window.addEventListener("online", () => setLiveStatus(true));
window.addEventListener("offline", () => setLiveStatus(false));

/* =========================================================
   initThemeToggle(lightClass)
   Wires up a page's #themeBtn to flip a light/dark class on
   <body>. Call this once from each page's own script (cargo.js
   already has its own bespoke handler with a toast, so it
   doesn't call this). Pages using the shared alerts.css-style
   stylesheet should call initThemeToggle() (defaults to the
   "light" class); dashboard.html's fuller theme + icon-swap CSS
   uses "light-mode", so dashboard.js calls
   initThemeToggle("light-mode").
   If a page's showToast()/toast() is in global scope, a short
   confirmation is shown; if not (e.g. an IIFE-scoped helper),
   this just toggles the class silently.
========================================================= */
function initThemeToggle(lightClass = "light") {
  const btn = document.getElementById("themeBtn");
  if (!btn) return; // this page has no theme button - no-op

  btn.addEventListener("click", () => {
    document.body.classList.toggle(lightClass);
    const isLight = document.body.classList.contains(lightClass);
    const msg = isLight ? "Switched to light mode." : "Switched to dark mode.";
    if (typeof showToast === "function") showToast(msg);
    else if (typeof toast === "function") toast(msg);
  });
}
