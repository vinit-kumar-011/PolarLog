
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

        var navItems = document.querySelectorAll(".nav-item[data-view]");
        var subItems = document.querySelectorAll(".sub-item[data-view]");
        var views = document.querySelectorAll(".view");
        var pageTitle = document.getElementById("pageTitle");

        function activateView(id) {
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
          var searchInput = document.getElementById("searchInput");
          if (searchInput.value) filterActiveView(searchInput.value);
        }

        navItems.forEach(function (item) {
          item.addEventListener("click", function () {
            if (item.dataset.parent === "true") {
              item.classList.toggle("expanded");
              var sm = item.parentElement.querySelector(".submenu");
              if (sm) sm.classList.toggle("open");
            }
            activateView(item.dataset.view);
          });
        });

        subItems.forEach(function (item) {
          item.addEventListener("click", function (e) {
            e.stopPropagation();
            activateView(item.dataset.view);
          });
        });

        document
          .querySelectorAll(".view-all[data-goto]")
          .forEach(function (el) {
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
        document
          .getElementById("themeBtn")
          .addEventListener("click", function () {
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
    