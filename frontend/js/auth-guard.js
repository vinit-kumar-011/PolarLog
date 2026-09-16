/* =========================================================
   POLARLOG — AUTH GUARD
   Include this FIRST (before pl-sidebar.js / page scripts) on
   every protected page: dashboard, cargo, inventory, personnel,
   shipments, stations, alerts.

   Two things it protects against:
   1. Visiting a protected page directly with no session at all.
   2. Pressing "back" after logout. Browsers can restore a page
      from bfcache without re-running its normal load - the
      "pageshow" event with event.persisted === true is what
      fires on that restore, so we re-check there too, not just
      on DOMContentLoaded.

   This is a UX/UI convenience (so a logged-out user sees the
   login screen instead of a flash of stale UI), NOT the actual
   security boundary - that's the server rejecting API calls
   without a valid token (see auth_utils.py / config.js). Even
   if this script were skipped, no real data would load.
========================================================= */
(function () {
  function hasSession() {
    return !!sessionStorage.getItem("polarlogToken");
  }

  function enforce() {
    if (!hasSession()) {
      window.location.replace("login.html");
    }
  }

  enforce();

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) enforce();
  });
})();
