(function () {
  var titles = {
    "view-dashboard": "Dashboard",
    "view-cargo": "Cargo",
    "view-shipments": "Shipments",
    "view-inventory": "Inventory",
    "view-inventory-lowstock": "Inventory — Low Stock",
    "view-inventory-categories": "Inventory — Categories",
    "view-personnel": "Personnel",
    "view-personnel-shifts": "Personnel — Shifts",
    "view-personnel-assignments": "Personnel — Assignments",
    "view-stations": "Stations",
    "view-alerts": "Alerts",
    "view-reports": "Reports",
    "view-settings": "Settings",
  };

  // Nav items now live in the shared sidebar (pl-sidebar.js) and are
  // real <a> links (e.g. href="dashboard.html#view-shipments") so the
  // same sidebar works when clicked from cargo.html / stations.html too.
  var navItems = document.querySelectorAll(".pl-nav-item[data-view]");
  var subItems = document.querySelectorAll(".pl-sub-item[data-view]");
  var views = document.querySelectorAll(".view");
  var pageTitle = document.getElementById("pageTitle");

  function activateView(id, skipHash) {
    if (!document.getElementById(id)) return;
    views.forEach(function (v) {
      v.classList.toggle("active", v.id === id);
    });
    navItems.forEach(function (n) {
      n.classList.toggle("active", n.dataset.view === id);
    });
    subItems.forEach(function (s) {
      s.classList.toggle("active", s.dataset.view === id);
    });
    if (titles[id]) pageTitle.textContent = titles[id];
    if (!skipHash && location.hash !== "#" + id) {
      history.replaceState(null, "", "#" + id);
    }
    var searchInput = document.getElementById("searchInput");
    if (searchInput.value) filterActiveView(searchInput.value);
  }

  // We're already on dashboard.html — clicking a sidebar link that
  // targets a view here should switch views in place instead of doing
  // a full page reload. Links to cargo.html / stations.html are left
  // alone so they navigate normally.
  // We're already on dashboard.html — clicking a sidebar link that
  // targets a view here (an in-page hash link, or the Dashboard link
  // itself) should switch views in place instead of doing a full page
  // reload. Links to cargo.html / stations.html point at a different
  // page entirely, so those must be left alone to navigate normally.
  navItems.forEach(function (item) {
    item.addEventListener("click", function (e) {
      var href = item.getAttribute("href") || "";
      var isSamePage = href.indexOf("#") !== -1 || href === "dashboard.html";
      if (!isSamePage) return; // let the browser navigate to cargo.html / stations.html
      e.preventDefault();
      activateView(item.dataset.view);
    });
  });

  subItems.forEach(function (item) {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      activateView(item.dataset.view);
    });
  });

  // Deep-link support: dashboard.html#view-shipments (as linked from
  // the sidebar on other pages) opens directly on that view.
  var initialId = location.hash ? location.hash.slice(1) : "";
  if (initialId && document.getElementById(initialId)) {
    activateView(initialId, true);
  }
  window.addEventListener("hashchange", function () {
    var id = location.hash.slice(1);
    if (id) activateView(id, true);
  });

  document.querySelectorAll(".view-all[data-goto]").forEach(function (el) {
    el.addEventListener("click", function () {
      activateView(el.dataset.goto);
    });
  });

  // Notification dropdown
  var bellBtn = document.getElementById("bellBtn");
  var notifDropdown = document.getElementById("notifDropdown");
  bellBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    notifDropdown.classList.toggle("open");
  });
  document.addEventListener("click", function () {
    notifDropdown.classList.remove("open");
  });
  notifDropdown.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  // Theme toggle
  document.getElementById("themeBtn").addEventListener("click", function () {
    document.body.classList.toggle("light-mode");
  });

  // Search filter — filters rows within the currently active view
  function filterActiveView(query) {
    query = query.trim().toLowerCase();
    var activeView = document.querySelector(".view.active");
    if (!activeView) return;
    var rows = activeView.querySelectorAll(
      ".station-row, .alert-row, tbody tr",
    );
    rows.forEach(function (row) {
      var text = row.textContent.toLowerCase();
      var show = query === "" || text.indexOf(query) !== -1;
      row.style.display = show ? "" : "none";
    });
  }
  document
    .getElementById("searchInput")
    .addEventListener("input", function (e) {
      filterActiveView(e.target.value);
    });
})();
