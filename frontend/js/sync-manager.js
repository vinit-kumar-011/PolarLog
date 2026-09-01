/* =========================================================
   POLARLOG — SYNC MANAGER
   Watches for connectivity and replays whatever is sitting in
   the offline outbox (see offline-db.js). Included on every page.

   Retry policy: an entry is retried on every sync pass. After
   5 failed attempts it's marked "failed" and left in the outbox
   (not auto-deleted) so nothing silently disappears - the badge
   still counts it and a click shows what's stuck.

   Conflict handling: this API has no versioning/timestamps to
   detect a real conflict, so this is last-write-wins - a queued
   write is simply replayed as-is against whatever the server's
   current state is. If the server rejects it outright (400/404),
   that's treated as a real failure, not a network retry.
========================================================= */
(function () {
  const MAX_ATTEMPTS = 5;
  let syncing = false;

  function badgeEl() {
    let el = document.getElementById("plSyncBadge");
    if (!el) {
      el = document.createElement("div");
      el.id = "plSyncBadge";
      el.style.cssText = [
        "position:fixed",
        "left:16px",
        "bottom:16px",
        "z-index:400",
        "display:none",
        "align-items:center",
        "gap:8px",
        "background:#151d2b",
        "border:1px solid #2a3345",
        "color:#e8ecf3",
        "font:600 12px 'Segoe UI',Inter,system-ui,sans-serif",
        "padding:9px 13px",
        "border-radius:20px",
        "box-shadow:0 10px 26px rgba(0,0,0,0.4)",
        "cursor:pointer",
      ].join(";");
      el.addEventListener("click", () => window.PolarLogSync.syncNow());
      document.body.appendChild(el);
    }
    return el;
  }

  async function refreshBadge() {
    if (!window.OfflineDB) return;
    const items = await window.OfflineDB.listOutbox();
    const pending = items.filter((i) => i.status === "pending").length;
    const failed = items.filter((i) => i.status === "failed").length;
    const el = badgeEl();

    if (pending === 0 && failed === 0) {
      el.style.display = "none";
      return;
    }

    el.style.display = "flex";
    if (failed > 0) {
      el.innerHTML =
        `<span style="width:7px;height:7px;border-radius:50%;background:#f04452;flex-shrink:0"></span>` +
        `${pending ? pending + " pending, " : ""}${failed} failed to sync - click to retry`;
    } else {
      el.innerHTML =
        `<span style="width:7px;height:7px;border-radius:50%;background:#f5a524;flex-shrink:0"></span>` +
        `${pending} change${pending === 1 ? "" : "s"} waiting to sync`;
    }
  }

  function toast(message, type = "") {
    // Reuse each page's own toast wiring if present; otherwise no-op.
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
    } else if (typeof window.toast === "function") {
      window.toast(message);
    } else {
      console.log("[sync]", message);
    }
  }

  async function syncNow() {
    if (syncing || !window.OfflineDB) return;
    if (!navigator.onLine) {
      toast("Still offline - can't sync yet.", "warn");
      return;
    }

    syncing = true;
    const items = await window.OfflineDB.listOutbox();
    const toTry = items.filter((i) => i.status === "pending" || i.status === "failed");

    let succeeded = 0;
    let failed = 0;

    for (const item of toTry) {
      try {
        const response = await fetch(`${API_BASE}${item.endpoint}`, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });

        if (response.ok) {
          await window.OfflineDB.removeFromOutbox(item.id);
          succeeded++;
        } else {
          // Server rejected it outright - not a connectivity problem.
          const errBody = await response.json().catch(() => ({}));
          await window.OfflineDB.updateOutboxEntry(item.id, {
            status: "failed",
            attempts: item.attempts + 1,
            lastError: errBody.error || `Server returned ${response.status}`,
          });
          failed++;
        }
      } catch (err) {
        // Network dropped again mid-sync - leave it pending, try again next time.
        const attempts = item.attempts + 1;
        await window.OfflineDB.updateOutboxEntry(item.id, {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          lastError: err.message,
        });
        if (attempts >= MAX_ATTEMPTS) failed++;
        else {
          syncing = false;
          await refreshBadge();
          return; // network's down again, stop trying the rest right now
        }
      }
    }

    syncing = false;
    await refreshBadge();

    if (succeeded > 0 && failed === 0) {
      toast(`Synced ${succeeded} change${succeeded === 1 ? "" : "s"}.`, "success");
    } else if (succeeded > 0 && failed > 0) {
      toast(`Synced ${succeeded}, ${failed} failed - will keep retrying.`, "warn");
    } else if (failed > 0) {
      toast(`${failed} change${failed === 1 ? "" : "s"} failed to sync.`, "err");
    }
  }

  window.PolarLogSync = { syncNow, refreshBadge };

  window.addEventListener("online", () => syncNow());
  document.addEventListener("DOMContentLoaded", () => {
    refreshBadge();
    if (navigator.onLine) syncNow();
  });
})();
