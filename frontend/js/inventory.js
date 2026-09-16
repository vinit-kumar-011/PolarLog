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
let forecastData = []; // add this
let selectedItemId = null;
let currentSearch = "";
let currentCategoryFilter = "";
let currentStationFilter = "";
let currentStockFilter = "";

async function loadInventory() {
  try {
    const [inventory, stations, forecast] = await Promise.all([
      apiGet("/api/inventory"),
      apiGet("/api/stations").catch(() => []),
      apiGet("/api/inventory/forecast/with-shipments").catch(() => []),
    ]);

    const stale = inventory?.__stale || stations?.__stale;

    allInventory = (inventory || []).map((item, i) => ({
      id: item.id ?? i,
      ...item,
    }));
    allStations = stations || [];
    forecastData = forecast || [];

    setLiveStatus(!stale && navigator.onLine);
    populateFilters();
    renderStats();
    renderTable();
    renderCategoryBreakdown();
    renderLowStockList();
    renderStationHealth();
    renderForecast();
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
    document.getElementById("forecastList").innerHTML =
      '<p class="empty-state">Could not load forecast</p>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadInventory();
  initThemeToggle();

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
  document
    .getElementById("newItemBtn")
    .addEventListener("click", openNewItemModal);

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
      <td class="cell-id">${item.name || cap(item.category) || "—"}${
        item._pending
          ? '<span class="pending-badge">PENDING SYNC</span>'
          : item._pendingDelta
            ? `<span class="pending-badge">${item._pendingDelta > 0 ? "+" : ""}${item._pendingDelta} PENDING</span>`
            : ""
      }</td>
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
    <div style="display:flex;gap:8px;margin-top:16px;">
      <button type="button" class="btn" id="editStockBtn" style="flex:1;justify-content:center;" ${item._pending ? "disabled title=\"Wait for this item to sync first\"" : ""}>
        Edit Stock
      </button>
      <button type="button" class="btn btn-primary" id="transferBtn" style="flex:1;justify-content:center;" ${item._pending || !item.item_id ? "disabled title=\"Wait for this item to sync first\"" : ""}>
        Transfer
      </button>
    </div>
  `;

  const editBtn = document.getElementById("editStockBtn");
  if (!item._pending) {
    editBtn.addEventListener("click", () => openEditItemModal(item));
  }

  const transferBtn = document.getElementById("transferBtn");
  if (!item._pending && item.item_id) {
    transferBtn.addEventListener("click", () => openTransferModal(item));
  }
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

function renderForecast() {
  const container = document.getElementById("forecastList");

  const items = [...forecastData]
    .sort(
      (a, b) => (a.days_remaining ?? Infinity) - (b.days_remaining ?? Infinity),
    )
    .slice(0, 8);

  if (items.length === 0) {
    container.innerHTML =
      '<p class="empty-state">No usage-rate data yet to forecast from</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const days = item.days_remaining;
      const urgent = days !== null && days <= 7;
      const soon = days !== null && days > 7 && days <= 14;
      const color = urgent
        ? "var(--red)"
        : soon
          ? "var(--amber)"
          : "var(--green)";
      const bg = urgent
        ? "var(--red-bg)"
        : soon
          ? "var(--amber-bg)"
          : "var(--green-bg)";

      const shipment = item.incoming_shipment;
      const shipmentTag = shipment
        ? `<div class="lowstock-sub" style="margin-top:2px">
             <span class="pill pill-blue">Incoming: ${shipment.reference}</span>
             ${cap((shipment.status || "").replace(/_/g, " "))} · ETA ${shipment.eta || "—"}
           </div>`
        : `<div class="lowstock-sub" style="margin-top:2px;color:var(--text-faint)">No shipment incoming</div>`;

      return `<div class="lowstock-item">
        <div class="lowstock-ic" style="background:${bg};color:${color}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
          </svg>
        </div>
        <div>
          <div class="lowstock-title">${item.name || "—"}</div>
          <div class="lowstock-sub">${item.station || "—"} · ${cap(item.category) || "—"}</div>
          ${shipmentTag}
        </div>
        <div class="lowstock-qty">${days != null ? days + " days" : "—"}</div>
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

/* =========================================================
   NEW ITEM — works offline
   On submit: tries the network immediately. If that fails
   (offline), apiSend() queues it in IndexedDB and this just
   adds an optimistic "pending sync" row so the item is visible
   right away; sync-manager.js replays it automatically once
   back online and the pending tag clears on the next reload.
========================================================= */
function ensureModalStyles() {
  if (document.getElementById("plModalStyles")) return;
  const style = document.createElement("style");
  style.id = "plModalStyles";
  style.textContent = `
    .pl-modal-overlay{position:fixed;inset:0;background:rgba(2,6,12,0.6);
      display:flex;align-items:center;justify-content:center;z-index:500;}
    .pl-modal{background:var(--panel,#10161f);border:1px solid var(--border,#1e2635);
      border-radius:14px;padding:22px;width:380px;max-width:90vw;display:flex;
      flex-direction:column;gap:12px;}
    .pl-modal h3{font-size:15.5px;font-weight:700;margin-bottom:2px;}
    .pl-modal label{display:flex;flex-direction:column;gap:5px;font-size:12px;
      color:var(--text-dim,#8892a4);}
    .pl-modal input,.pl-modal select{background:var(--panel-2,#131a26);
      border:1px solid var(--border,#1e2635);color:var(--text,#e8ecf3);
      padding:9px 10px;border-radius:8px;font-size:13px;outline:none;}
    .pl-modal-row{display:flex;gap:10px;}
    .pl-modal-row > label{flex:1;}
    .pl-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px;}
    .pl-modal-err{font-size:12px;color:#ff8b93;display:none;}
    .pending-badge{display:inline-block;margin-left:7px;font-size:9.5px;
      font-weight:700;letter-spacing:.3px;color:#ffc35c;
      background:rgba(245,165,36,0.16);padding:2px 6px;border-radius:8px;
      vertical-align:middle;}
  `;
  document.head.appendChild(style);
}

function openNewItemModal() {
  ensureModalStyles();

  const stationOpts = allStations
    .map((s) => `<option value="${s.station_id}">${s.name}</option>`)
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "pl-modal-overlay";
  overlay.innerHTML = `
    <div class="pl-modal">
      <h3>Add Inventory Item</h3>
      <label>Name
        <input type="text" id="niName" placeholder="e.g. Diesel" />
      </label>
      <div class="pl-modal-row">
        <label>Category
          <select id="niCategory">
            <option value="fuel">Fuel</option>
            <option value="food">Food</option>
            <option value="medical">Medical</option>
            <option value="equipment">Equipment</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Station
          <select id="niStation">${stationOpts}</select>
        </label>
      </div>
      <div class="pl-modal-row">
        <label>Quantity
          <input type="number" id="niQuantity" min="0" placeholder="0" />
        </label>
        <label>Unit
          <input type="text" id="niUnit" placeholder="units" />
        </label>
        <label>Reorder level
          <input type="number" id="niReorder" min="0" placeholder="0" />
        </label>
      </div>
      <div class="pl-modal-err" id="niErr"></div>
      <div class="pl-modal-actions">
        <button type="button" class="btn" id="niCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="niSubmit">Add Item</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay
    .querySelector("#niCancel")
    .addEventListener("click", () => overlay.remove());
  overlay
    .querySelector("#niSubmit")
    .addEventListener("click", () => submitNewItem(overlay));
}

async function submitNewItem(overlay) {
  const errBox = overlay.querySelector("#niErr");
  const name = overlay.querySelector("#niName").value.trim();
  const category = overlay.querySelector("#niCategory").value;
  const stationId = overlay.querySelector("#niStation").value;
  const quantity = overlay.querySelector("#niQuantity").value;
  const unit = overlay.querySelector("#niUnit").value.trim();
  const reorder = overlay.querySelector("#niReorder").value;

  if (!name || !stationId || quantity === "") {
    errBox.textContent = "Name, station and quantity are required.";
    errBox.style.display = "block";
    return;
  }

  const payload = {
    name,
    category,
    station_id: parseInt(stationId, 10),
    quantity: parseInt(quantity, 10),
    unit: unit || "units",
    reorder_level: reorder === "" ? 0 : parseInt(reorder, 10),
  };

  const result = await apiSend("/api/inventory", "POST", payload);
  const stationName =
    allStations.find((s) => s.station_id === payload.station_id)?.name || "—";

  if (result.ok) {
    overlay.remove();
    if (result.data && result.data.merged) {
      showToast(
        `Added ${payload.quantity} — now ${result.data.quantity} total.`,
        "success",
      );
    } else {
      showToast("Item added.", "success");
    }
    loadInventory(); // re-pull the real list so it's fully in sync
    return;
  }

  if (result.queued) {
    overlay.remove();

    // Mirror the backend's merge behavior locally: if this station already
    // has this item (same name + category), add to it instead of creating
    // a second row that would just get folded away once synced anyway.
    const match = allInventory.find(
      (i) =>
        !i._pending &&
        (i.station || "").toLowerCase() === stationName.toLowerCase() &&
        (i.category || "").toLowerCase() === payload.category.toLowerCase() &&
        (i.name || "").toLowerCase() === payload.name.toLowerCase(),
    );

    if (match) {
      match.quantity = (match.quantity || 0) + payload.quantity;
      match._pendingDelta = (match._pendingDelta || 0) + payload.quantity;
      showToast(
        `Offline — will add ${payload.quantity} to existing ${match.name} once synced.`,
        "warn",
      );
    } else {
      allInventory.push({
        id: `pending-${result.id}`,
        ...payload,
        station: stationName,
        status: "ok",
        _pending: true,
      });
      showToast("Offline — item queued, will sync automatically.", "warn");
    }

    renderStats();
    renderTable();
    renderCategoryBreakdown();
    renderLowStockList();
    renderStationHealth();
    return;
  }

  errBox.textContent = result.error || "Could not add item.";
  errBox.style.display = "block";
}

/* =========================================================
   EDIT STOCK — works offline
   Lets you correct an item's quantity, reorder level, and unit
   in place (e.g. after a physical count) rather than only being
   able to add to it. Status is recomputed server-side from the
   new quantity vs. reorder level. Same offline-queue pattern as
   "New Item": if the PUT can't reach the server it's queued and
   applied optimistically here so the table reflects it right away.
========================================================= */
function openEditItemModal(item) {
  ensureModalStyles();

  const overlay = document.createElement("div");
  overlay.className = "pl-modal-overlay";
  overlay.innerHTML = `
    <div class="pl-modal">
      <h3>Edit ${item.name || cap(item.category)}</h3>
      <label>Station
        <input type="text" value="${item.station || "—"}" disabled />
      </label>
      <div class="pl-modal-row">
        <label>Quantity
          <input type="number" id="eiQuantity" min="0" value="${item.quantity ?? 0}" />
        </label>
        <label>Unit
          <input type="text" id="eiUnit" value="${item.unit || ""}" placeholder="units" />
        </label>
      </div>
      <label>Reorder level
        <input type="number" id="eiReorder" min="0" value="${item.reorder_level ?? 0}" />
      </label>
      <div class="pl-modal-err" id="eiErr"></div>
      <div class="pl-modal-actions">
        <button type="button" class="btn" id="eiCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="eiSubmit">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#eiCancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#eiSubmit").addEventListener("click", () => submitEditItem(overlay, item));
}

async function submitEditItem(overlay, item) {
  const errBox = overlay.querySelector("#eiErr");
  const quantity = overlay.querySelector("#eiQuantity").value;
  const unit = overlay.querySelector("#eiUnit").value.trim();
  const reorder = overlay.querySelector("#eiReorder").value;

  if (quantity === "" || parseInt(quantity, 10) < 0) {
    errBox.textContent = "Enter a valid quantity.";
    errBox.style.display = "block";
    return;
  }

  const payload = {
    quantity: parseInt(quantity, 10),
    reorder_level: reorder === "" ? 0 : parseInt(reorder, 10),
    unit: unit || "units",
  };

  // Editing an item that hasn't synced yet (no item_id) - just update it
  // locally; there's nothing on the server yet to PUT to.
  if (!item.item_id) {
    Object.assign(item, payload);
    overlay.remove();
    showToast("Updated (will sync once this item is added).", "warn");
    renderStats();
    renderTable();
    renderCategoryBreakdown();
    renderLowStockList();
    renderStationHealth();
    renderDetails(item);
    return;
  }

  const result = await apiSend(`/api/inventory/${item.item_id}`, "PUT", payload);

  if (result.ok) {
    overlay.remove();
    showToast("Stock updated.", "success");
    loadInventory();
    return;
  }

  if (result.queued) {
    overlay.remove();
    const local = allInventory.find((i) => i.id === item.id);
    if (local) {
      Object.assign(local, payload);
      local._pendingDelta = undefined;
    }
    showToast("Offline — edit queued, will sync automatically.", "warn");
    renderStats();
    renderTable();
    renderCategoryBreakdown();
    renderLowStockList();
    renderStationHealth();
    renderDetails(local);
    return;
  }

  errBox.textContent = result.error || "Could not update item.";
  errBox.style.display = "block";
}

/* =========================================================
   TRANSFER SUPPLY BETWEEN STATIONS — works offline
   Draws down the source item at its current station and adds
   the same quantity to the matching item at the destination
   station (creating one there if it doesn't exist yet).
   Online: calls POST /api/inventory/transfer directly.
   Offline: apiSend() queues it, and this applies the same move
   optimistically to the local table so both rows update right
   away, each tagged with a signed PENDING badge (-100 / +100)
   until the real sync reconciles them.
========================================================= */
function openTransferModal(item) {
  ensureModalStyles();

  const otherStations = allStations.filter((s) => s.name !== item.station);
  if (otherStations.length === 0) {
    showToast("No other stations to transfer to.", "warn");
    return;
  }

  const stationOpts = otherStations
    .map((s) => `<option value="${s.station_id}">${s.name}</option>`)
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "pl-modal-overlay";
  overlay.innerHTML = `
    <div class="pl-modal">
      <h3>Transfer ${item.name || cap(item.category)}</h3>
      <label>From
        <input type="text" value="${item.station || "—"} (${item.quantity ?? 0} ${item.unit || "units"} available)" disabled />
      </label>
      <label>To
        <select id="trToStation">${stationOpts}</select>
      </label>
      <label>Quantity
        <input type="number" id="trQuantity" min="1" max="${item.quantity ?? 0}" placeholder="0" />
      </label>
      <div class="pl-modal-err" id="trErr"></div>
      <div class="pl-modal-actions">
        <button type="button" class="btn" id="trCancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="trSubmit">Transfer</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#trCancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#trSubmit").addEventListener("click", () => submitTransfer(overlay, item));
}

async function submitTransfer(overlay, item) {
  const errBox = overlay.querySelector("#trErr");
  const toStationId = parseInt(overlay.querySelector("#trToStation").value, 10);
  const quantity = parseInt(overlay.querySelector("#trQuantity").value, 10);

  if (!quantity || quantity <= 0) {
    errBox.textContent = "Enter a quantity greater than 0.";
    errBox.style.display = "block";
    return;
  }
  if (quantity > item.quantity) {
    errBox.textContent = `Only ${item.quantity} ${item.unit || "units"} available at ${item.station}.`;
    errBox.style.display = "block";
    return;
  }

  const payload = {
    from_item_id: item.item_id,
    to_station_id: toStationId,
    quantity,
  };

  const result = await apiSend("/api/inventory/transfer", "POST", payload);
  const toStationName = allStations.find((s) => s.station_id === toStationId)?.name || "—";

  if (result.ok) {
    overlay.remove();
    const ref = result.data && result.data.shipment_reference;
    showToast(
      `Transferred ${quantity} ${item.unit || "units"} of ${item.name} to ${toStationName}` +
        (ref ? ` — logged as ${ref}.` : "."),
      "success",
    );
    loadInventory();
    if (typeof loadResupplyStatus === "function") loadResupplyStatus();
    return;
  }

  if (result.queued) {
    overlay.remove();

    // Draw down the source row locally.
    const source = allInventory.find((i) => i.item_id === item.item_id);
    if (source) {
      source.quantity -= quantity;
      source._pendingDelta = (source._pendingDelta || 0) - quantity;
    }

    // Add to (or create) the destination row locally, mirroring the
    // backend's merge behavior.
    const destMatch = allInventory.find(
      (i) =>
        !i._pending &&
        i.item_id &&
        (i.station || "").toLowerCase() === toStationName.toLowerCase() &&
        (i.category || "").toLowerCase() === (item.category || "").toLowerCase() &&
        (i.name || "").toLowerCase() === (item.name || "").toLowerCase(),
    );

    if (destMatch) {
      destMatch.quantity = (destMatch.quantity || 0) + quantity;
      destMatch._pendingDelta = (destMatch._pendingDelta || 0) + quantity;
    } else {
      allInventory.push({
        id: `pending-transfer-${result.id}`,
        name: item.name,
        category: item.category,
        station: toStationName,
        quantity,
        unit: item.unit,
        reorder_level: item.reorder_level,
        status: "ok",
        _pending: true,
      });
    }

    renderDetails(null);
    renderStats();
    renderTable();
    renderCategoryBreakdown();
    renderLowStockList();
    renderStationHealth();
    showToast(
      `Offline — transfer of ${quantity} ${item.unit || "units"} to ${toStationName} queued.`,
      "warn",
    );
    return;
  }

  errBox.textContent = result.error || "Transfer failed.";
  errBox.style.display = "block";
}
