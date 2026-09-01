/* =========================================================
   POLARLOG — INVENTORY PAGE
   Uses the shared apiGet() helper from config.js.
   Expects GET /api/inventory to return objects shaped like:
     { id, name, category, quantity, reorder_level, station, status }
   (status, if present, e.g. "critical" | "low" | "ok" — otherwise
   stock health is derived from quantity / reorder_level)
   Expects GET /api/stations for the station filter + health bars.
========================================================= */

const CATEGORY_COLORS = {
  fuel: "#3b82f6",
  food: "#22c55e",
  medical: "#f5a524",
  equipment: "#a855f7",
  others: "#8892a4",
};

let allInventory = [];
let allStations = [];
let selectedItemId = null;
let currentSearch = "";
let currentCategoryFilter = "";
let currentStationFilter = "";
let currentStockFilter = "";

async function loadInventory() {
  try {
    const [inventory, stations] = await Promise.all([
      apiGet("/api/inventory"),
      apiGet("/api/stations").catch(() => []),
    ]);

    allInventory = (inventory || []).map((item, i) => ({
      id: item.id ?? i,
      ...item,
    }));
    allStations = stations || [];

    setLiveStatus(true);
    populateFilters();
    renderStats();
    renderTable();
    renderCategoryBreakdown();
    renderLowStockList();
    renderStationHealth();
  } catch (err) {
    console.error("Inventory page failed to load:", err);
    setLiveStatus(false);
    showToast("Could not reach the server. Is the backend running?", "err");
    document.getElementById("tableBody").innerHTML =
      '<tr><td colspan="7" class="empty-row">Could not load inventory</td></tr>';
    document.getElementById("categoryBreakdown").innerHTML =
      '<p class="empty-state">Could not load categories</p>';
    document.getElementById("lowStockList").innerHTML =
      '<p class="empty-state">Could not load low stock items</p>';
    document.getElementById("stationHealthList").innerHTML =
      '<p class="empty-state">Could not load station health</p>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadInventory();

  document.getElementById("tableSearch").addEventListener("input", (e) => {
    currentSearch = e.target.value.trim().toLowerCase();
    renderTable();
  });
  document.getElementById("filterCategory").addEventListener("change", (e) => {
    currentCategoryFilter = e.target.value;
    renderTable();
  });
  document.getElementById("filterStation").addEventListener("change", (e) => {
    currentStationFilter = e.target.value;
    renderTable();
  });
  document
    .getElementById("filterStockStatus")
    .addEventListener("change", (e) => {
      currentStockFilter = e.target.value;
      renderTable();
    });
  document.getElementById("newItemBtn").addEventListener("click", () => {
    showToast("New Item form isn't wired up yet.", "warn");
  });

  // Sidebar sub-links to #lowstock / #categories just scroll to the
  // matching panel on this same page (no separate view to toggle).
  if (location.hash === "#lowstock") {
    setTimeout(
      () =>
        document
          .getElementById("lowstockSection")
          ?.scrollIntoView({ behavior: "smooth" }),
      200,
    );
  } else if (location.hash === "#categories") {
    setTimeout(
      () =>
        document
          .getElementById("categoriesPanel")
          ?.scrollIntoView({ behavior: "smooth" }),
      200,
    );
  }
});

function setLiveStatus(online) {
  const pill = document.getElementById("livePill");
  const dot = document.getElementById("liveDot");
  const text = document.getElementById("liveText");
  const sync = document.getElementById("syncText");
  if (online) {
    pill.style.color = "var(--green)";
    pill.style.background = "var(--green-bg)";
    dot.style.background = "var(--green)";
    dot.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.2)";
    text.textContent = "LIVE";
    sync.textContent = "Synced just now";
  } else {
    pill.style.color = "var(--red)";
    pill.style.background = "var(--red-bg)";
    dot.style.background = "var(--red)";
    dot.style.boxShadow = "none";
    text.textContent = "OFFLINE";
    sync.textContent = "Sync failed";
  }
}

function itemHealth(item) {
  const pct = Math.min(
    100,
    Math.round(((item.quantity || 0) / (item.reorder_level || 1)) * 100),
  );
  return isFinite(pct) ? pct : 0;
}

function stockLevel(item) {
  if (
    item.status === "critical" ||
    item.status === "low" ||
    item.status === "ok"
  ) {
    return item.status === "ok" ? "ok" : item.status;
  }
  const h = itemHealth(item);
  if (h < 50) return "critical";
  if (h < 75) return "low";
  return "ok";
}

function populateFilters() {
  const categories = [
    ...new Set(allInventory.map((i) => i.category).filter(Boolean)),
  ];
  const catSelect = document.getElementById("filterCategory");
  catSelect.innerHTML =
    '<option value="">All categories</option>' +
    categories.map((c) => `<option value="${c}">${cap(c)}</option>`).join("");

  const stationNames = [
    ...new Set(
      [
        ...allStations.map((s) => s.name),
        ...allInventory.map((i) => i.station),
      ].filter(Boolean),
    ),
  ];
  const stSelect = document.getElementById("filterStation");
  stSelect.innerHTML =
    '<option value="">All stations</option>' +
    stationNames.map((n) => `<option value="${n}">${n}</option>`).join("");
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function renderStats() {
  const total = allInventory.length;
  const avgHealth = total
    ? Math.round(
        allInventory.reduce((sum, i) => sum + itemHealth(i), 0) / total,
      )
    : 0;
  const low = allInventory.filter((i) => stockLevel(i) === "low").length;
  const critical = allInventory.filter(
    (i) => stockLevel(i) === "critical",
  ).length;
  const categories = new Set(
    allInventory.map((i) => i.category).filter(Boolean),
  ).size;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statHealth").textContent = total
    ? avgHealth + "%"
    : "—";
  document.getElementById("statLow").textContent = low;
  document.getElementById("statCritical").textContent = critical;
  document.getElementById("statCategories").textContent = categories;
}

function getFilteredInventory() {
  return allInventory.filter((i) => {
    if (currentCategoryFilter && i.category !== currentCategoryFilter)
      return false;
    if (currentStationFilter && i.station !== currentStationFilter)
      return false;
    if (currentStockFilter && stockLevel(i) !== currentStockFilter)
      return false;
    if (currentSearch) {
      const haystack = `${i.name || ""} ${i.category || ""}`.toLowerCase();
      if (!haystack.includes(currentSearch)) return false;
    }
    return true;
  });
}

function stockPill(level) {
  const map = {
    critical: ["pill-red", "Critical"],
    low: ["pill-amber", "Low"],
    ok: ["pill-green", "Healthy"],
  };
  const [cls, label] = map[level] || ["pill-blue", level || "—"];
  return `<span class="pill ${cls}">${label}</span>`;
}

function healthColor(pct) {
  if (pct < 50) return "var(--red)";
  if (pct < 75) return "var(--amber)";
  return "var(--green)";
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const rows = getFilteredInventory();

  document.getElementById("tableFootText").textContent =
    `Showing ${rows.length} of ${allInventory.length} items`;

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty-row">No items match your filters</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  rows.forEach((item) => {
    const health = itemHealth(item);
    const level = stockLevel(item);
    const tr = document.createElement("tr");
    if (item.id === selectedItemId) tr.classList.add("selected");
    tr.innerHTML = `
      <td class="cell-id">${item.name || cap(item.category) || "—"}</td>
      <td>${cap(item.category) || "—"}</td>
      <td>${item.station || "—"}</td>
      <td>${item.quantity ?? "—"}</td>
      <td>${item.reorder_level ?? "—"}</td>
      <td>
        <div class="mini-health">
          <div class="mini-health-track"><div class="mini-health-fill" style="width:${health}%;background:${healthColor(health)}"></div></div>
          <span class="mini-health-pct">${health}%</span>
        </div>
      </td>
      <td>${stockPill(level)}</td>
    `;
    tr.addEventListener("click", () => selectItem(item.id));
    tbody.appendChild(tr);
  });
}

function selectItem(id) {
  selectedItemId = id;
  renderTable();
  renderDetails(allInventory.find((i) => i.id === id));
}

function renderDetails(item) {
  const panel = document.getElementById("itemDetailsPanel");
  if (!item) {
    panel.innerHTML =
      '<div class="panel-title-row"><div class="panel-title">Item Details</div></div><p class="empty-state">Select an item to see its details</p>';
    return;
  }

  const health = itemHealth(item);
  const level = stockLevel(item);

  panel.innerHTML = `
    <div class="panel-title-row"><div class="panel-title">Item Details</div></div>
    <div class="item-detail-head">
      <div class="item-detail-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
        </svg>
      </div>
      <div>
        <div class="item-detail-name">${item.name || cap(item.category) || "—"}</div>
        <div class="item-detail-sub">${item.station || "—"}</div>
      </div>
    </div>
    <div class="detail-rows">
      <div class="detail-row"><span>Category</span><span>${cap(item.category) || "—"}</span></div>
      <div class="detail-row"><span>Quantity</span><span>${item.quantity ?? "—"}</span></div>
      <div class="detail-row"><span>Reorder Level</span><span>${item.reorder_level ?? "—"}</span></div>
      <div class="detail-row"><span>Stock Health</span><span>${health}%</span></div>
      <div class="detail-row"><span>Status</span><span>${stockPill(level)}</span></div>
    </div>
  `;
}

function renderCategoryBreakdown() {
  const container = document.getElementById("categoryBreakdown");
  if (allInventory.length === 0) {
    container.innerHTML = '<p class="empty-state">No inventory data yet</p>';
    return;
  }

  const byCategory = {};
  let total = 0;
  allInventory.forEach((item) => {
    byCategory[item.category] =
      (byCategory[item.category] || 0) + (item.quantity || 0);
    total += item.quantity || 0;
  });

  container.innerHTML = Object.keys(byCategory)
    .sort((a, b) => byCategory[b] - byCategory[a])
    .map((cat) => {
      const val = byCategory[cat];
      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
      const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.others;
      return `<div class="category-row">
        <span class="category-dot" style="background:${color}"></span>
        <span class="category-name">${cap(cat)}</span>
        <span class="category-value">${pct}%</span>
      </div>`;
    })
    .join("");
}

function renderLowStockList() {
  const container = document.getElementById("lowStockList");
  const items = allInventory
    .filter((i) => stockLevel(i) !== "ok")
    .sort((a, b) => itemHealth(a) - itemHealth(b))
    .slice(0, 8);

  if (items.length === 0) {
    container.innerHTML =
      '<p class="empty-state">No low or critical stock items</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const level = stockLevel(item);
      const color = level === "critical" ? "var(--red)" : "var(--amber)";
      const bg = level === "critical" ? "var(--red-bg)" : "var(--amber-bg)";
      return `<div class="lowstock-item">
        <div class="lowstock-ic" style="background:${bg};color:${color}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.5 17a1.5 1.5 0 0 0 1.3 2.3h16.4a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <div>
          <div class="lowstock-title">${item.name || cap(item.category) || "—"}</div>
          <div class="lowstock-sub">${item.station || "—"} · ${cap(item.category) || "—"}</div>
        </div>
        <div class="lowstock-qty">${item.quantity ?? "—"} / ${item.reorder_level ?? "—"}</div>
      </div>`;
    })
    .join("");
}

function renderStationHealth() {
  const container = document.getElementById("stationHealthList");
  const stationNames = [
    ...new Set(
      [
        ...allStations.map((s) => s.name),
        ...allInventory.map((i) => i.station),
      ].filter(Boolean),
    ),
  ];

  if (stationNames.length === 0) {
    container.innerHTML = '<p class="empty-state">No station data yet</p>';
    return;
  }

  container.innerHTML = stationNames
    .map((name) => {
      const items = allInventory.filter((i) => i.station === name);
      if (items.length === 0) return "";
      const health = Math.round(
        items.reduce((sum, i) => sum + itemHealth(i), 0) / items.length,
      );
      const level = health < 50 ? "critical" : health < 75 ? "warning" : "good";
      return `<div class="health-row">
        <span class="health-label">${name}</span>
        <div class="health-track"><div class="health-fill ${level}" style="width:${health}%"></div></div>
        <span class="health-percent">${health}%</span>
      </div>`;
    })
    .join("");
}

function showToast(message, type = "") {
  const wrap = document.getElementById("toastWrap");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
