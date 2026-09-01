/* =========================================================
   POLARLOG — ALERTS PAGE
   Uses the shared apiGet() helper from config.js.
   Expects GET /api/alerts to return objects shaped like:
     { alert_id, alert_type, severity, message, status, station, created_at }
   (see alerts.py — station can be null for system-wide alerts)
   Expects GET /api/stations for the station filter dropdown.
========================================================= */

let allAlerts = [];
let allStations = [];
let selectedAlertId = null;
let currentSearch = "";
let currentSeverityFilter = "";
let currentStationFilter = "";
let currentStatusFilter = "";

async function loadAlerts() {
  try {
    const [alerts, stations] = await Promise.all([
      apiGet("/api/alerts"),
      apiGet("/api/stations").catch(() => []),
    ]);

    allAlerts = alerts || [];
    allStations = stations || [];

    setLiveStatus(true);
    populateFilters();
    renderStats();
    renderTable();
    renderSeverityBreakdown();
    renderCriticalOpen();
    renderStationAlerts();
  } catch (err) {
    console.error("Alerts page failed to load:", err);
    setLiveStatus(false);
    showToast("Could not reach the server. Is the backend running?", "err");
    document.getElementById("tableBody").innerHTML =
      '<tr><td colspan="6" class="empty-row">Could not load alerts</td></tr>';
    document.getElementById("severityBreakdown").innerHTML =
      '<p class="empty-state">Could not load severities</p>';
    document.getElementById("criticalAlertsList").innerHTML =
      '<p class="empty-state">Could not load alerts</p>';
    document.getElementById("stationAlertsList").innerHTML =
      '<p class="empty-state">Could not load station data</p>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadAlerts();

  document.getElementById("tableSearch").addEventListener("input", (e) => {
    currentSearch = e.target.value.trim().toLowerCase();
    renderTable();
  });
  document.getElementById("filterSeverity").addEventListener("change", (e) => {
    currentSeverityFilter = e.target.value;
    renderTable();
  });
  document.getElementById("filterStation").addEventListener("change", (e) => {
    currentStationFilter = e.target.value;
    renderTable();
  });
  document.getElementById("filterStatus").addEventListener("change", (e) => {
    currentStatusFilter = e.target.value;
    renderTable();
  });
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

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function populateFilters() {
  const stationNames = [
    ...new Set(
      [...allStations.map((s) => s.name), ...allAlerts.map((a) => a.station)].filter(Boolean),
    ),
  ];
  const stSelect = document.getElementById("filterStation");
  stSelect.innerHTML =
    '<option value="">All stations</option>' +
    stationNames.map((n) => `<option value="${n}">${n}</option>`).join("");
}

function renderStats() {
  const total = allAlerts.length;
  const critical = allAlerts.filter((a) => a.severity === "critical").length;
  const warning = allAlerts.filter((a) => a.severity === "warning").length;
  const open = allAlerts.filter((a) => a.status === "open").length;
  const stations = new Set(allAlerts.map((a) => a.station).filter(Boolean)).size;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statCritical").textContent = critical;
  document.getElementById("statWarning").textContent = warning;
  document.getElementById("statOpen").textContent = open;
  document.getElementById("statStations").textContent = stations;
}

function getFilteredAlerts() {
  return allAlerts.filter((a) => {
    if (currentSeverityFilter && a.severity !== currentSeverityFilter) return false;
    if (currentStationFilter && a.station !== currentStationFilter) return false;
    if (currentStatusFilter && a.status !== currentStatusFilter) return false;
    if (currentSearch) {
      const haystack = `${a.message || ""} ${a.alert_type || ""}`.toLowerCase();
      if (!haystack.includes(currentSearch)) return false;
    }
    return true;
  });
}

function severityPill(severity) {
  const map = {
    critical: ["pill-red", "Critical"],
    warning: ["pill-amber", "Warning"],
    info: ["pill-blue", "Info"],
  };
  const [cls, label] = map[severity] || ["pill-blue", cap(severity) || "—"];
  return `<span class="pill ${cls}">${label}</span>`;
}

function statusPill(status) {
  const map = {
    open: ["pill-red", "Open"],
    acknowledged: ["pill-amber", "Acknowledged"],
    resolved: ["pill-green", "Resolved"],
  };
  const [cls, label] = map[status] || ["pill-blue", cap(status) || "—"];
  return `<span class="pill ${cls}">${label}</span>`;
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const rows = getFilteredAlerts();

  document.getElementById("tableFootText").textContent =
    `Showing ${rows.length} of ${allAlerts.length} alerts`;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No alerts match your filters</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  rows.forEach((a) => {
    const tr = document.createElement("tr");
    if (a.alert_id === selectedAlertId) tr.classList.add("selected");
    tr.innerHTML = `
      <td>${severityPill(a.severity)}</td>
      <td class="cell-id">${a.message || "—"}</td>
      <td>${(a.alert_type || "—").replace(/_/g, " ")}</td>
      <td>${a.station || "All stations"}</td>
      <td>${a.created_at || "—"}</td>
      <td>${statusPill(a.status)}</td>
    `;
    tr.addEventListener("click", () => selectAlert(a.alert_id));
    tbody.appendChild(tr);
  });
}

function selectAlert(id) {
  selectedAlertId = id;
  renderTable();
  renderDetails(allAlerts.find((a) => a.alert_id === id));
}

function renderDetails(a) {
  const panel = document.getElementById("alertDetailsPanel");
  if (!a) {
    panel.innerHTML =
      '<div class="panel-title-row"><div class="panel-title">Alert Details</div></div><p class="empty-state">Select an alert to see its details</p>';
    return;
  }

  panel.innerHTML = `
    <div class="panel-title-row"><div class="panel-title">Alert Details</div></div>
    <div class="item-detail-head">
      <div class="item-detail-icon" style="background:var(--red-bg);color:var(--red)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.5 17a1.5 1.5 0 0 0 1.3 2.3h16.4a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <div>
        <div class="item-detail-name">${a.message || "—"}</div>
        <div class="item-detail-sub">${(a.alert_type || "—").replace(/_/g, " ")}</div>
      </div>
    </div>
    <div class="detail-rows">
      <div class="detail-row"><span>Severity</span><span>${severityPill(a.severity)}</span></div>
      <div class="detail-row"><span>Station</span><span>${a.station || "All stations"}</span></div>
      <div class="detail-row"><span>Created</span><span>${a.created_at || "—"}</span></div>
      <div class="detail-row"><span>Status</span><span>${statusPill(a.status)}</span></div>
    </div>
  `;
}

function renderSeverityBreakdown() {
  const container = document.getElementById("severityBreakdown");
  if (allAlerts.length === 0) {
    container.innerHTML = '<p class="empty-state">No alerts data yet</p>';
    return;
  }

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  allAlerts.forEach((a) => {
    if (bySeverity[a.severity] !== undefined) bySeverity[a.severity]++;
  });
  const total = allAlerts.length;
  const colors = { critical: "var(--red)", warning: "var(--amber)", info: "var(--blue)" };

  container.innerHTML = Object.keys(bySeverity)
    .map((sev) => {
      const val = bySeverity[sev];
      const pct = total > 0 ? Math.round((val / total) * 100) : 0;
      return `<div class="category-row">
        <span class="category-dot" style="background:${colors[sev]}"></span>
        <span class="category-name">${cap(sev)}</span>
        <span class="category-value">${val} (${pct}%)</span>
      </div>`;
    })
    .join("");
}

function renderCriticalOpen() {
  const container = document.getElementById("criticalAlertsList");
  const items = allAlerts
    .filter((a) => a.status === "open")
    .sort((a, b) => (a.severity === "critical" ? -1 : 1))
    .slice(0, 8);

  if (items.length === 0) {
    container.innerHTML = '<p class="empty-state">No open alerts</p>';
    return;
  }

  container.innerHTML = items
    .map((a) => {
      const color = a.severity === "critical" ? "var(--red)" : "var(--amber)";
      const bg = a.severity === "critical" ? "var(--red-bg)" : "var(--amber-bg)";
      return `<div class="lowstock-item">
        <div class="lowstock-ic" style="background:${bg};color:${color}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.5 17a1.5 1.5 0 0 0 1.3 2.3h16.4a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <div>
          <div class="lowstock-title">${a.message || "—"}</div>
          <div class="lowstock-sub">${a.station || "All stations"} · ${a.created_at || "—"}</div>
        </div>
      </div>`;
    })
    .join("");
}

function renderStationAlerts() {
  const container = document.getElementById("stationAlertsList");
  const stationNames = [
    ...new Set(
      [...allStations.map((s) => s.name), ...allAlerts.map((a) => a.station)].filter(Boolean),
    ),
  ];

  if (stationNames.length === 0) {
    container.innerHTML = '<p class="empty-state">No station data yet</p>';
    return;
  }

  container.innerHTML = stationNames
    .map((name) => {
      const alerts = allAlerts.filter((a) => a.station === name);
      const open = alerts.filter((a) => a.status === "open").length;
      const level = open === 0 ? "good" : open > 1 ? "critical" : "warning";
      const pct = alerts.length === 0 ? 0 : Math.round((open / alerts.length) * 100);
      return `<div class="health-row">
        <span class="health-label">${name}</span>
        <div class="health-track"><div class="health-fill ${level}" style="width:${pct}%"></div></div>
        <span class="health-percent">${open} open</span>
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
