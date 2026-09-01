/* =========================================================
   POLARLOG — STATIONS PAGE
   Uses the shared apiGet() helper from config.js.
   Expects GET /api/stations, /api/inventory, /api/personnel,
   /api/shipments and /api/alerts (see the matching *.py routes).
========================================================= */

let allStations = [];
let allInventory = [];
let allPersonnel = [];
let allShipments = [];
let allAlerts = [];
let currentStatusFilter = "all";

const STATION_IMAGES = {
  bharati: "../assets/images/bharti.jpg",
  maitri: "../assets/images/maitri.jpg",
  himadri: "../assets/images/himadri.jpg",
};

async function loadStations() {
  try {
    const [stations, inventory, personnel, shipments, alerts] =
      await Promise.all([
        apiGet("/api/stations"),
        apiGet("/api/inventory"),
        apiGet("/api/personnel"),
        apiGet("/api/shipments"),
        apiGet("/api/alerts"),
      ]);

    allStations = stations || [];
    allInventory = inventory || [];
    allPersonnel = personnel || [];
    allShipments = shipments || [];
    allAlerts = alerts || [];

    renderSummary();
    renderStationCards();
    renderStationHealthList();
    renderActivityLog();
    populateStationSelect();
  } catch (err) {
    console.error("Stations page failed to load:", err);
    toast("Could not reach the server. Is the backend running?");
    document.getElementById("stationsContainer").innerHTML =
      '<p style="color:var(--text-muted)">Could not load station data.</p>';
  }
}

document.addEventListener("DOMContentLoaded", loadStations);

/* ---------------- helpers ---------------- */
function itemHealth(item) {
  const pct = Math.min(
    100,
    Math.round(((item.quantity || 0) / (item.reorder_level || 1)) * 100),
  );
  return isFinite(pct) ? pct : 0;
}

function stationHealth(stationName) {
  const items = allInventory.filter((i) => i.station === stationName);
  if (items.length === 0) return 0;
  return Math.round(
    items.reduce((sum, i) => sum + itemHealth(i), 0) / items.length,
  );
}

function stationHasShortage(stationName) {
  return allInventory.some(
    (i) =>
      i.station === stationName &&
      (i.status === "critical" || i.status === "low"),
  );
}

/* ---------------- summary stat cards ---------------- */
function renderSummary() {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("stat-total", String(allStations.length).padStart(2, "0"));
  setText(
    "stat-op",
    String(
      allStations.filter((s) => s.status === "operational").length,
    ).padStart(2, "0"),
  );
  setText("stat-personnel", allPersonnel.length);

  const avgHealth = allInventory.length
    ? Math.round(
        allInventory.reduce((sum, i) => sum + itemHealth(i), 0) /
          allInventory.length,
      )
    : 0;
  setText("stat-inv-health", avgHealth + "%");

  setText(
    "stat-shipments",
    allShipments.filter((s) => s.status === "in_transit").length,
  );
}

/* ---------------- station cards ---------------- */
function renderStationCards() {
  const container = document.getElementById("stationsContainer");
  if (!container) return;

  let stations = allStations;
  if (currentStatusFilter === "operational") {
    stations = stations.filter((s) => s.status === "operational");
  } else if (currentStatusFilter === "warning") {
    stations = stations.filter((s) => stationHasShortage(s.name));
  }

  if (stations.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-muted)">No stations match this filter.</p>';
    return;
  }

  container.innerHTML = stations
    .map((station) => {
      const key = (station.name || "").toLowerCase();
      const img =
        STATION_IMAGES[key] || "../assets/images/antarctic-stations-map.jpg";
      const health = stationHealth(station.name);
      const personnelCount = allPersonnel.filter(
        (p) => p.station === station.name,
      ).length;
      const inboundShipments = allShipments.filter(
        (s) => s.destination === station.name && s.status === "in_transit",
      ).length;
      const warn = stationHasShortage(station.name);
      const statusClass = warn ? "warning" : "operational";
      const statusLabel = warn ? "Low Stock" : "Operational";

      return `<div class="station-card" data-status="${statusClass}">
        <div class="station-image-container">
          <img src="${img}" alt="${station.name} Station" />
          <span class="status-tag ${statusClass}">${statusLabel}</span>
        </div>
        <div class="station-info">
          <h4>${(station.name || "").toUpperCase()}</h4>
          <p class="coords">${station.latitude ?? "—"}°, ${station.longitude ?? "—"}°</p>
          <div class="metrics-summary">
            <div class="metric-box">
              <span>Inventory</span><strong>${health}%</strong>
            </div>
            <div class="metric-box">
              <span>Personnel</span><strong class="count-personnel">${personnelCount}</strong>
            </div>
            <div class="metric-box">
              <span>Shipments</span><strong>${inboundShipments}</strong>
            </div>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function filterStations() {
  const select = document.getElementById("statusFilter");
  currentStatusFilter = select ? select.value : "all";
  renderStationCards();
}

/* ---------------- inventory health by station ---------------- */
function renderStationHealthList() {
  const container = document.getElementById("stationHealthList");
  if (!container) return;

  if (allStations.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-muted)">No station data yet</p>';
    return;
  }

  container.innerHTML = allStations
    .map((station) => {
      const health = stationHealth(station.name);
      const color = health < 50 ? "#fb923c" : "#4ade80";
      const fillClass = health < 50 ? "progress-fill warning" : "progress-fill";
      return `<div class="list-item">
        <div>
          <strong>${station.name} Station</strong>
          <div class="progress-bar-bg">
            <div class="${fillClass}" style="width:${health}%"></div>
          </div>
        </div>
        <span style="color:${color}">${health}%</span>
      </div>`;
    })
    .join("");
}

/* ---------------- recent activity (from alerts) ---------------- */
function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const then = new Date(dateStr.replace(" ", "T"));
  if (isNaN(then.getTime())) return dateStr;
  const diffMs = Date.now() - then.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} day(s) ago`;
}

function renderActivityLog() {
  const container = document.getElementById("activityLog");
  if (!container) return;

  const recent = [...allAlerts]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-muted)">No recent activity</p>';
    return;
  }

  container.innerHTML = recent
    .map((a) => {
      const isWarn = a.severity === "critical" || a.severity === "warning";
      return `<div class="list-item${isWarn ? " warning-item" : ""}">
        <span>${a.message || "—"}</span>
        <span style="color:${isWarn ? "#fb923c" : "var(--text-muted)"}">${timeAgo(a.created_at)}</span>
      </div>`;
    })
    .join("");
}

/* ---------------- assign-personnel modal select ---------------- */
function populateStationSelect() {
  const select = document.getElementById("stationSelect");
  if (!select) return;
  select.innerHTML = allStations
    .map(
      (s) =>
        `<option value="${s.name}">${(s.name || "").toUpperCase()}</option>`,
    )
    .join("");
}

/* ---------------- modal + toast + quick-action handlers ----------------
   These are called directly from inline onclick="" attributes in
   stations.html, so they're attached to window rather than kept private
   inside a closure.
------------------------------------------------------------------------ */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("active");
}

function submitNewStation() {
  const name = document.getElementById("stationName").value.trim();
  if (!name) {
    toast("Enter a station name first.");
    return;
  }
  // NOTE: there's no POST /api/stations endpoint yet, so this is a
  // demo-only confirmation — it doesn't persist to the database.
  toast(`"${name}" queued for registration (demo only — not yet saved).`);
  closeModal("addStationModal");
  document.getElementById("stationName").value = "";
  document.getElementById("stationCoords").value = "";
}

function submitPersonnelAssignment() {
  const station = document.getElementById("stationSelect").value;
  const count = document.getElementById("personnelCount").value;
  // NOTE: there's no assignment-write endpoint yet, so this is a
  // demo-only confirmation — it doesn't persist to the database.
  toast(`${count} personnel queued for assignment to ${station} (demo only).`);
  closeModal("assignModal");
}

function triggerAction(message) {
  toast(message);
}

function filterAlertsOnly() {
  window.location.href = "alerts.html";
}

function toggleNotifications() {
  toast(
    `${allAlerts.filter((a) => a.status === "open").length} open alert(s).`,
  );
}

function openSettings() {
  toast("Settings screen isn't wired up yet.");
}

function openProfile() {
  toast("Profile screen isn't wired up yet.");
}

function toast(message) {
  const wrap = document.getElementById("toastContainer");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
