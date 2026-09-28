// auth-guard.js
// Put this on every page that requires a logged-in user.
// It must load BEFORE any page script that assumes a session.

(function () {
  function hasSession() {
    return !!localStorage.getItem("token");
  }

  function kickOut() {
    // replace(), not href - so this page does not stay in history
    window.location.replace("login.html");
  }

  // 1. The ordinary case: a fresh page load
  if (!hasSession()) {
    kickOut();
    return;
  }

  // 2. The bfcache case: the page was frozen and is being thawed.
  //    pageshow fires on BOTH a normal load and a restore.
  //    event.persisted is true only on a restore.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && !hasSession()) {
      kickOut();
    }
  });

  // 3. Another tab logged out while this one sat idle.
  //    'storage' fires in OTHER tabs when localStorage changes.
  window.addEventListener("storage", function (event) {
    if (event.key === "token" && event.newValue === null) {
      kickOut();
    }
  });
})();