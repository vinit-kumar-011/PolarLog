/* =========================================================
   POLARLOG — SHARED THEME CONTROLLER
   Include on every page (after pl-sidebar.js is fine, order
   doesn't matter — this binds on DOMContentLoaded itself).

   Owns, for the whole app:
   - applying the saved theme on load (no flash — see the tiny
     inline snippet at the top of <body> in each page)
   - wiring the #themeBtn click on whichever page has one
   - persisting the choice to localStorage so it's the same on
     every page, including the sidebar, once you navigate
   - keeping every open tab in sync (storage event)
   - the toast shown on toggle, and a single toast() / showToast()
     implementation every page's other toasts now share too

   This replaces the separate, inconsistent theme/toast code that
   used to live in dashboard.js, stations.js and cargo.js.
========================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "theme";
  var LIGHT_META_COLOR = "#f1f4f9";
  var DARK_META_COLOR = "#03111f";

  // Light is the app-wide default: a page with nothing saved yet
  // (or a value other than "dark") renders light.
  function getStoredTheme() {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, animate) {
    var root = document.documentElement;
    if (animate) {
      root.classList.add("theme-transition");
      window.clearTimeout(applyTheme._t);
      applyTheme._t = window.setTimeout(function () {
        root.classList.remove("theme-transition");
      }, 280);
    }
    document.body.classList.toggle("light", theme === "light");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? LIGHT_META_COLOR : DARK_META_COLOR);
  }

  // Apply immediately on every page, even if the blocking inline
  // snippet in <body> is ever missing — cheap and idempotent.
  applyTheme(getStoredTheme(), false);

  /* ---------------- shared toast ---------------- */
  function showToast(message, type) {
    var wrap = document.getElementById("toastWrap");
    if (!wrap) return;
    var t = document.createElement("div");
    t.className = ("toast " + (type || "")).trim();
    t.textContent = message;
    wrap.appendChild(t);
    window.setTimeout(function () {
      t.style.opacity = "0";
      t.style.transform = "translateX(12px)";
      t.style.transition = "opacity .3s ease, transform .3s ease";
      window.setTimeout(function () {
        t.remove();
      }, 300);
    }, 3200);
  }
  // Every page's existing toast(...) / showToast(...) calls keep
  // working unchanged — now backed by one consistent implementation.
  window.showToast = showToast;
  window.toast = showToast;

  /* ---------------- theme toggle button ---------------- */
  function initThemeToggle() {
    var btn = document.getElementById("themeBtn");
    if (!btn || btn.dataset.themeWired === "1") return; // avoid double-binding
    btn.dataset.themeWired = "1";
    btn.addEventListener("click", function () {
      var next = document.body.classList.contains("light") ? "dark" : "light";
      applyTheme(next, true);
      localStorage.setItem(STORAGE_KEY, next);
      showToast(
        next === "light" ? "Switched to light mode." : "Switched to dark mode.",
        "success",
      );
    });
  }
  // kept as a global too, since a couple of pages already call this
  // themselves on DOMContentLoaded — safe, initThemeToggle() no-ops
  // the second time thanks to the dataset guard above.
  window.initThemeToggle = initThemeToggle;

  // Same storage key and code path as the topbar button, for pages
  // (Settings) that offer an explicit Light / Dark choice.
  window.PolarLogTheme = {
    get: getStoredTheme,
    set: function (theme) {
      var next = theme === "dark" ? "dark" : "light";
      applyTheme(next, true);
      localStorage.setItem(STORAGE_KEY, next);
    },
  };

  /* ---------------- cross-tab / cross-page sync ---------------- */
  // Changing the theme on any page updates every other open PolarLog
  // tab immediately, and every other page picks it up on next load.
  window.addEventListener("storage", function (e) {
    if (e.key === STORAGE_KEY) applyTheme(getStoredTheme(), true);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
