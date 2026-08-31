/* =========================================================
   POLARLOG — SHARED SIDEBAR BEHAVIOR
   Included on dashboard.html, cargo.html, stations.html.
   Handles: active-page highlighting, submenu expand/collapse,
   the profile dropdown, and demo logout.
========================================================= */
(function () {
  // ---- highlight the nav item for the current page ----
  var currentPage = location.pathname.split("/").pop() || "dashboard.html";

  document.querySelectorAll(".pl-nav-item[data-page]").forEach(function (item) {
    if (item.dataset.page === currentPage) {
      item.classList.add("active");
    }
  });

  // If we landed on dashboard.html with a view hash (e.g. #view-shipments),
  // dashboard.js owns highlighting the exact view/sub-item — nothing more to do here.

  // ---- submenu expand/collapse ----
  document.querySelectorAll(".pl-nav-chevron-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var sub = document.getElementById(btn.dataset.toggle);
      if (!sub) return;
      var willOpen = !sub.classList.contains("open");
      sub.classList.toggle("open", willOpen);
      btn.classList.toggle("expanded", willOpen);
    });
  });

  // Auto-expand a submenu if a sub-item inside it matches the current page+hash
  document.querySelectorAll(".pl-submenu").forEach(function (sub) {
    var match = Array.from(sub.querySelectorAll(".pl-sub-item")).some(function (a) {
      return a.getAttribute("href") === currentPage + location.hash;
    });
    if (match) {
      sub.classList.add("open");
      var btn = document.querySelector('.pl-nav-chevron-btn[data-toggle="' + sub.id + '"]');
      if (btn) btn.classList.add("expanded");
    }
  });

  // ---- profile dropdown ----
  var wrap = document.querySelector(".pl-sidebar-profile-wrap");
  if (wrap) {
    var trigger = wrap.querySelector(".pl-sidebar-profile");
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    document.addEventListener("click", function () {
      wrap.classList.remove("open");
    });
    wrap.querySelector(".pl-profile-menu").addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  // ---- reflect the demo-logged-in user, if login.html set one ----
  try {
    var demoUser = JSON.parse(sessionStorage.getItem("polarlogDemoUser") || "null");
    if (demoUser) {
      var nameEl = document.querySelector(".pl-sidebar-profile .who .n");
      var roleEl = document.querySelector(".pl-sidebar-profile .who .r");
      var avatarEl = document.querySelector(".pl-sidebar-profile .pl-avatar");
      if (nameEl && demoUser.name) nameEl.textContent = demoUser.name;
      if (roleEl && demoUser.role) roleEl.textContent = demoUser.role;
      if (avatarEl && demoUser.name) avatarEl.textContent = demoUser.name.charAt(0).toUpperCase();
    }
  } catch (err) {
    /* ignore malformed session data */
  }

  // ---- demo logout ----
  document.querySelectorAll(".pl-logout").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      sessionStorage.removeItem("polarlogDemoUser");
      window.location.href = "login.html";
    });
  });
})();
