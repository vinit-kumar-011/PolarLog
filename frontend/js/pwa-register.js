/* =========================================================
   POLARLOG — PWA REGISTRATION
   Included on every page. Registers the service worker (scoped
   to /pages/) and wires up an "Install app" affordance using the
   beforeinstallprompt event, if the browser fires one.
========================================================= */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => console.log("[pwa] service worker registered:", reg.scope))
        .catch((err) => console.warn("[pwa] service worker registration failed:", err));
    });
  }

  // Capture the browser's install prompt so we can trigger it from our
  // own UI (e.g. a button) instead of only the browser's built-in menu.
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.dispatchEvent(new CustomEvent("polarlog:install-available"));
  });

  window.installPolarLogApp = function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      deferredPrompt = null;
    });
  };

  window.addEventListener("appinstalled", () => {
    console.log("[pwa] PolarLog installed");
    deferredPrompt = null;
  });
})();
