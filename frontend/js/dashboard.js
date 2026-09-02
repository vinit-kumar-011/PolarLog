/* =========================================================
   POLARLOG — DASHBOARD (Overview page)
   Uses the shared apiGet() helper from config.js.
   Pulls /api/stations, /api/inventory, /api/cargo, /api/shipments,
   /api/alerts and /api/personnel and renders the overview cards.
========================================================= */

let dbStations = [];
let dbInventory = [];
let dbCargo = [];
let dbShipments = [];
let dbAlerts = [];
let dbPersonnel = [];
let isLoadingDashboard = false;

async function loadDashboard() {
  // Guard: prevent duplicate simultaneous loads
  if (isLoadingDashboard) {
    console.warn("Dashboard load already in progress, skipping...");
    return;
  }

  isLoadingDashboard = true;

  try {
    console.log("Loading dashboard data...");
    const [stations, inventory, cargo, shipments, alerts, personnel] =
      await Promise.all([
        apiGet("/api/stations"),
        apiGet("/api/inventory"),
        apiGet("/api/cargo"),
        apiGet("/api/shipments"),
        apiGet("/api/alerts"),
        apiGet("/api/personnel"),
      ]);

    // Clear old data
    dbStations = [];
    dbInventory = [];
    dbCargo = [];
    dbShipments = [];
    dbAlerts = [];
    dbPersonnel = [];

    // Load new data
    dbStations = stations || [];
    dbInventory = inventory || [];
    dbCargo = cargo || [];
    dbShipments = shipments || [];
    dbAlerts = alerts || [];
    dbPersonnel = personnel || [];

    console.log("Dashboard data loaded:", {
      stations: dbStations.length,
      inventory: dbInventory.length,
      cargo: dbCargo.length,
      shipments: dbShipments.length,
      alerts: dbAlerts.length,
      personnel: dbPersonnel.length,
    });

<<<<<<< HEAD
=======
    setLiveStatus(true);
>>>>>>> 678cdcc (your message)
    renderKPIs();
    renderStationList();
    renderCriticalAlerts();
    renderDonut();
    renderShipmentsChart();
    renderRecentShipments();
    renderTimeline();
  } catch (err) {
    console.error("Dashboard failed to load:", err);
<<<<<<< HEAD
=======
    setLiveStatus(false);
>>>>>>> 678cdcc (your message)
  } finally {
    isLoadingDashboard = false;
  }
}

// Only attach listener once
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadDashboard);
} else {
  // If this script loads after DOMContentLoaded already fired
  loadDashboard();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function itemHealth(item) {
  const pct = Math.min(
    100,
    Math.round(((item.quantity || 0) / (item.reorder_level || 1)) * 100),
  );
  return isFinite(pct) ? pct : 0;
}

/* ---------------- KPI stat cards ---------------- */
function renderKPIs() {
  setText(
    "kpiStations",
    dbStations.filter((s) => s.status === "operational").length,
  );

  setText("kpiCargo", dbCargo.filter((c) => c.status !== "delivered").length);

  const openAlerts = dbAlerts.filter((a) => a.status === "open");
  setText("kpiAlerts", openAlerts.length);

  const avgHealth = dbInventory.length
    ? Math.round(
        dbInventory.reduce((sum, i) => sum + itemHealth(i), 0) /
          dbInventory.length,
      )
    : 0;
  setText("kpiHealth", dbInventory.length ? avgHealth + "%" : "—");

  setText("kpiPersonnel", dbPersonnel.length);

  setText(
    "kpiShipments",
    dbShipments.filter((s) => s.status === "in_transit").length,
  );
}

/* ---------------- Antarctic Station Overview list ---------------- */
function formatCoord(value, isLat) {
  if (value === null || value === undefined) return "—° —' —";
  const dir = isLat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = Math.round((abs - deg) * 60);
  return `${deg}° ${min}' ${dir}`;
}

function renderStationList() {
  const container = document.getElementById("stationListContainer");
  if (!container) {
    console.warn("stationListContainer not found in DOM");
    return;
  }

  if (dbStations.length === 0) {
    container.innerHTML = '<p class="empty-state">No station data yet</p>';
    return;
  }

  // IMPORTANT: use = not +=
  container.innerHTML = dbStations
    .map((station) => {
      const items = dbInventory.filter((i) => i.station === station.name);
      const health = items.length
        ? Math.round(
            items.reduce((sum, i) => sum + itemHealth(i), 0) / items.length,
          )
        : 0;
      const coords = `${formatCoord(station.latitude, true)}, ${formatCoord(station.longitude, false)}`;
      return `<div class="station-row">
        <div class="top-line">
          <span class="station-dot"></span><span class="station-name">${(station.name || "").toUpperCase()}</span>
        </div>
        <div class="station-coords">${coords}</div>
        <div class="health-label">HEALTH</div>
        <div class="health-track">
          <div class="health-fill" style="width:${health}%"></div>
        </div>
      </div>`;
    })
    .join("");
}

/* ---------------- Critical Alerts ---------------- */
function renderCriticalAlerts() {
  const container = document.getElementById("criticalAlertsList");
  if (!container) return;

  const top = [...dbAlerts]
    .filter((a) => a.status === "open")
    .sort((a, b) => (a.severity === "critical" ? -1 : 1))
    .slice(0, 3);

  if (top.length === 0) {
    container.innerHTML = '<p class="empty-state">No open alerts</p>';
    return;
  }

  container.innerHTML = top
    .map((a) => {
      const sev = a.severity || "info";
      const tagLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
      return `<div class="alert-row">
        <div class="alert-icon ${sev}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M10.3 3.9L2.7 18a1.8 1.8 0 001.6 2.7h15.4a1.8 1.8 0 001.6-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z" />
            <path d="M12 9.5v4.2" />
          </svg>
        </div>
        <div class="alert-text">
          <div class="alert-title-row">
            <span class="alert-title">${a.message || "—"}</span><span class="alert-tag ${sev}">${tagLabel.toUpperCase()}</span>
          </div>
          <div class="alert-sub">${a.station || "All stations"} · ${a.created_at || "—"}</div>
        </div>
      </div>`;
    })
    .join("");
}

/* ---------------- Inventory Distribution donut ---------------- */
const DONUT_CATEGORIES = ["fuel", "food", "medical", "equipment"];
const DONUT_COLORS = {
  fuel: "var(--cyan)",
  food: "var(--green)",
  medical: "var(--amber)",
  equipment: "var(--blue)",
  others: "var(--text-faint)",
};
const LEGEND_IDS = {
  fuel: "legendValFuel",
  food: "legendValFood",
  medical: "legendValMedical",
  equipment: "legendValEquipment",
  others: "legendValOthers",
};

function renderDonut() {
  if (dbInventory.length === 0) return;

  const byCategory = {};
  let total = 0;
  dbInventory.forEach((item) => {
    const cat = DONUT_CATEGORIES.includes(item.category)
      ? item.category
      : "others";
    byCategory[cat] = (byCategory[cat] || 0) + (item.quantity || 0);
    total += item.quantity || 0;
  });

  const donutWrap = document.querySelector(".donut-wrap svg");
  if (donutWrap) {
    const circumference = 2 * Math.PI * 40;
    let offsetAcc = 0;
    let svgSegments = "";
    [...DONUT_CATEGORIES, "others"].forEach((cat) => {
      const val = byCategory[cat] || 0;
      const pct = total > 0 ? val / total : 0;
      const dash = pct * circumference;
      if (dash > 0) {
        svgSegments += `<circle cx="50" cy="50" r="40" fill="none" stroke="${DONUT_COLORS[cat]}" stroke-width="12" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offsetAcc}" transform="rotate(-90 50 50)"/>`;
      }
      offsetAcc += dash;
    });
    // remove any previously injected segments, then insert fresh ones
    donutWrap.querySelectorAll("circle.dyn-segment").forEach((c) => c.remove());
    donutWrap.insertAdjacentHTML(
      "beforeend",
      svgSegments.replace(/<circle /g, '<circle class="dyn-segment" '),
    );
  }

  const topCat = [...DONUT_CATEGORIES, "others"].reduce(
    (best, cat) =>
      (byCategory[cat] || 0) > (byCategory[best] || 0) ? cat : best,
    "fuel",
  );
  const topPct =
    total > 0 ? Math.round(((byCategory[topCat] || 0) / total) * 100) : 0;
  setText("donutCenterLabel", topPct + "%");

  [...DONUT_CATEGORIES, "others"].forEach((cat) => {
    const val = byCategory[cat] || 0;
    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
    setText(LEGEND_IDS[cat], pct + "%");
  });
}

/* ---------------- Shipments Status chart ---------------- */
function renderShipmentsChart() {
  const box = document.getElementById("shipmentsChartBox");
  if (!box) return;
  if (dbShipments.length === 0) return; // leave "Chart data pending"

  const counts = { delivered: 0, in_transit: 0, pending: 0 };
  dbShipments.forEach((s) => {
    if (counts[s.status] !== undefined) counts[s.status]++;
  });
  const max = Math.max(1, counts.delivered, counts.in_transit, counts.pending);
  const bars = [
    { label: "Delivered", key: "delivered", color: "var(--green)" },
    { label: "In Transit", key: "in_transit", color: "var(--blue)" },
    { label: "Pending", key: "pending", color: "var(--amber)" },
  ];
  box.innerHTML = bars
    .map((b) => {
      const val = counts[b.key];
      const pct = Math.round((val / max) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <span style="width:70px;font-size:11px;color:var(--text-faint);">${b.label}</span>
        <div style="flex:1;background:rgba(127,127,127,0.12);border-radius:4px;height:14px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${b.color};"></div>
        </div>
        <span style="width:24px;font-size:11px;text-align:right;">${val}</span>
      </div>`;
    })
    .join("");
}

/* ---------------- Recent Shipments table ---------------- */
function renderRecentShipments() {
  const body = document.getElementById("recentShipmentsBody");
  if (!body || dbShipments.length === 0) return; // leave placeholder rows

  const recent = [...dbShipments]
    .sort((a, b) => (a.eta > b.eta ? -1 : 1))
    .slice(0, 4);

  body.innerHTML = recent
    .map(
      (s) => `<tr>
        <td>${s.reference || "—"}</td>
        <td>${s.origin || "—"} → ${s.destination || "—"}</td>
        <td><span class="status-chip">${(s.status || "—").replace("_", " ")}</span></td>
        <td>${s.eta || "—"}</td>
      </tr>`,
    )
    .join("");
}

/* ---------------- Mission Timeline (recent activity) ---------------- */
function renderTimeline() {
  const container = document.getElementById("missionTimelineContainer");
  if (!container) return;

  // Combine open alerts + shipment dispatches into one recency-sorted feed.
  const events = [];
  dbAlerts.forEach((a) => {
    events.push({
      title: a.message || "Alert raised",
      time: a.created_at || "—",
    });
  });
  dbShipments
    .filter((s) => s.status === "in_transit")
    .forEach((s) => {
      events.push({
        title: `${s.reference} en route to ${s.destination || "—"}`,
        time: `ETA ${s.eta || "—"}`,
      });
    });

  const top = events.slice(0, 5);
  if (top.length === 0) {
    container.innerHTML = '<p class="empty-state">No recent activity</p>';
    return;
  }

  container.innerHTML = top
    .map(
      (e, i) => `<div class="tl-item">
        <div class="tl-marker"><span class="tl-dot"></span>${i < top.length - 1 ? '<span class="tl-line"></span>' : ""}</div>
        <div class="tl-content">
          <div class="tl-title">${e.title}</div>
          <div class="tl-time">${e.time}</div>
        </div>
      </div>`,
    )
    .join("");
}
