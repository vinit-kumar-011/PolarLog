/* =========================================================
   POLARLOG — SHIPMENTS PAGE
   Uses the shared apiGet() helper from config.js.
   Expects GET /api/shipments to return objects shaped like:
     { id, reference, cargo_name, origin, destination, status,
       departure, eta, priority, station }
   (status: pending | in_transit | delivered)
   Expects GET /api/stations for the station filter dropdown.
========================================================= */

let allShipments = [];
let allStations = [];
let selectedShipmentId = null;
let currentSearch = "";
let currentStatusFilter = "";
let currentStationFilter = "";

async function loadShipments() {
  try {
    const [shipments, stations] = await Promise.all([
      apiGet("/api/shipments"),
      apiGet("/api/stations").catch(() => []), // station filter is a nice-to-have
    ]);

    allShipments = shipments || [];
    allStations = stations || [];
    const stale = allShipments.__stale || allStations.__stale;
    setLiveStatus(!stale && navigator.onLine);

    populateStationFilter();
    renderStats();
    renderTable();
  } catch (err) {
    console.error("Shipments page failed to load:", err);
    showToast("Could not reach the server. Is the backend running?", "err");
    document.getElementById("tableBody").innerHTML =
      '<tr><td colspan="7" class="empty-row">Could not load shipments</td></tr>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadShipments();

  document.getElementById("tableSearch").addEventListener("input", (e) => {
    currentSearch = e.target.value.trim().toLowerCase();
    renderTable();
  });
  document.getElementById("filterStatus").addEventListener("change", (e) => {
    currentStatusFilter = e.target.value;
    renderTable();
  });
  document.getElementById("filterStation").addEventListener("change", (e) => {
    currentStationFilter = e.target.value;
    renderTable();
  });
  document.getElementById("newShipmentBtn").addEventListener("click", () => {
    showToast("New Shipment form isn't wired up yet.", "warn");
  });
});

function populateStationFilter() {
  const select = document.getElementById("filterStation");
  const names = [...new Set(allStations.map((s) => s.name).filter(Boolean))];
  select.innerHTML =
    '<option value="">All stations</option>' +
    names.map((n) => `<option value="${n}">${n}</option>`).join("");
}

function renderStats() {
  const total = allShipments.length;
  const inTransit = allShipments.filter(
    (s) => s.status === "in_transit",
  ).length;
  const pending = allShipments.filter((s) => s.status === "pending").length;
  const delivered = allShipments.filter((s) => s.status === "delivered").length;
  const delayed = allShipments.filter((s) => s.delayed === true).length;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statInTransit").textContent = inTransit;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statDelivered").textContent = delivered;
  document.getElementById("statDelayed").textContent = delayed;
}

function getFilteredShipments() {
  return allShipments.filter((s) => {
    if (currentStatusFilter && s.status !== currentStatusFilter) return false;
    if (
      currentStationFilter &&
      s.origin !== currentStationFilter &&
      s.destination !== currentStationFilter
    )
      return false;
    if (currentSearch) {
      const haystack =
        `${s.reference || ""} ${s.origin || ""} ${s.destination || ""}`.toLowerCase();
      if (!haystack.includes(currentSearch)) return false;
    }
    return true;
  });
}

function statusPill(status) {
  const map = {
    pending: ["pill-amber", "Pending"],
    in_transit: ["pill-blue", "In Transit"],
    delivered: ["pill-green", "Delivered"],
  };
  const [cls, label] = map[status] || ["pill-red", status || "Unknown"];
  return `<span class="pill ${cls}">${label}</span>`;
}

function priorityPill(priority) {
  const map = {
    high: ["pill-red", "High"],
    medium: ["pill-amber", "Medium"],
    low: ["pill-green", "Low"],
  };
  const [cls, label] = map[priority] || ["pill-blue", priority || "—"];
  return `<span class="pill ${cls}">${label}</span>`;
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const rows = getFilteredShipments();

  document.getElementById("tableFootText").textContent =
    `Showing ${rows.length} of ${allShipments.length} shipments`;

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty-row">No shipments match your filters</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  rows.forEach((s) => {
    const tr = document.createElement("tr");
    if (s.id === selectedShipmentId) tr.classList.add("selected");
    tr.innerHTML = `
      <td class="cell-id">${s.reference || "—"}</td>
      <td>${s.cargo_name || "—"}</td>
      <td>${s.origin || "—"} → ${s.destination || "—"}</td>
      <td>${statusPill(s.status)}</td>
      <td>${s.departure || "—"}</td>
      <td>${s.eta || "—"}</td>
      <td>${priorityPill(s.priority)}</td>
    `;
    tr.addEventListener("click", () => selectShipment(s.id));
    tbody.appendChild(tr);
  });
}

function selectShipment(id) {
  selectedShipmentId = id;
  renderTable();
  renderDetails(allShipments.find((s) => s.id === id));
}

function renderDetails(s) {
  const panel = document.getElementById("shipmentDetailsPanel");
  if (!s) {
    panel.innerHTML =
      '<div class="panel-title-row"><div class="panel-title">Shipment Details</div></div><p class="empty-state">Select a shipment to see its details</p>';
    document.getElementById("progressTrack").innerHTML =
      '<p class="empty-state">Select a shipment above</p>';
    return;
  }

  panel.innerHTML = `
    <div class="panel-title-row"><div class="panel-title">Shipment Details</div></div>
    <div class="ship-detail-head">
      <div class="ship-detail-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 17h13l4-6h-4V6H3v11z" /><circle cx="7" cy="19" r="1.6" /><circle cx="16" cy="19" r="1.6" />
        </svg>
      </div>
      <div>
        <div class="ship-detail-ref">${s.reference || "—"}</div>
        <div class="ship-detail-cargo">${s.cargo_name || "—"}</div>
      </div>
    </div>
    <div class="detail-rows">
      <div class="detail-row"><span>Origin</span><span>${s.origin || "—"}</span></div>
      <div class="detail-row"><span>Destination</span><span>${s.destination || "—"}</span></div>
      <div class="detail-row"><span>Status</span><span>${statusPill(s.status)}</span></div>
      <div class="detail-row"><span>Departure</span><span>${s.departure || "—"}</span></div>
      <div class="detail-row"><span>ETA</span><span>${s.eta || "—"}</span></div>
      <div class="detail-row"><span>Priority</span><span>${priorityPill(s.priority)}</span></div>
    </div>
  `;

  renderProgress(s.status);
}

function renderProgress(status) {
  const steps = [
    { key: "pending", label: "Order Placed" },
    { key: "pending", label: "Preparing Cargo" },
    { key: "in_transit", label: "In Transit" },
    { key: "delivered", label: "Delivered" },
  ];
  const order = ["pending", "in_transit", "delivered"];
  const currentIdx = order.indexOf(status);

  const track = document.getElementById("progressTrack");
  track.innerHTML = '<div class="progress-line"></div>';
  steps.forEach((step, i) => {
    const stepIdx = order.indexOf(step.key);
    let state = "pending";
    if (
      stepIdx < currentIdx ||
      (step.key === status && i <= order.indexOf(status))
    )
      state = "done";
    if (step.key === status) state = "current";
    if (currentIdx === order.length - 1 && step.key === "delivered")
      state = "done";

    const item = document.createElement("div");
    item.className = `progress-item ${state}`;
    item.innerHTML = `
      <div class="progress-dot"></div>
      <div class="progress-label">${step.label}</div>
    `;
    track.appendChild(item);
  });
}

function showToast(message, type = "") {
  const wrap = document.getElementById("toastWrap");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
