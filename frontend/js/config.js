// The one place the API address lives.
const API_BASE = "http://localhost:5000";

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
    const response = await fetch(`${API_BASE}${path}`);
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
<<<<<<< HEAD
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return { ok: false, error: errBody.error || `Request failed (${response.status})` };
    }
    const data = await response.json().catch(() => ({}));
    return { ok: true, data };
  } catch (err) {
    // Couldn't reach the server at all - queue it for later.
    if (window.OfflineDB) {
      const id = await window.OfflineDB.addToOutbox({ method, endpoint: path, body });
      if (window.PolarLogSync) window.PolarLogSync.refreshBadge();
      return { ok: false, queued: true, id };
    }
    return { ok: false, error: "Offline and no local queue available." };
=======
>>>>>>> 678cdcc (your message)
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
