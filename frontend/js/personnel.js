/* =========================================================
   POLARLOG — PERSONNEL PAGE
   Uses the shared apiGet() helper from config.js.
   Expects GET /api/personnel to return objects shaped like:
     { person_id, name, role, contact, status, station, season }
   (see personnel.py — station/season come from LEFT JOINs and
   can be null for unassigned personnel)
   Expects GET /api/stations for the station filter dropdown.
========================================================= */

let allPersonnel = [];
let allStations = [];
let selectedPersonId = null;
let currentSearch = "";
let currentStationFilter = "";
let currentRoleFilter = "";
let currentStatusFilter = "";

async function loadPersonnel() {
  try {
    const [personnel, stations] = await Promise.all([
      apiGet("/api/personnel"),
      apiGet("/api/stations").catch(() => []),
    ]);

    allPersonnel = personnel || [];
    allStations = stations || [];
    const stale = allPersonnel.__stale || allStations.__stale;
    setLiveStatus(!stale && navigator.onLine);

    setLiveStatus(true);
    populateFilters();
    renderStats();
    renderTable();
    renderRoleBreakdown();
    renderStationPersonnel();
    renderExpeditions();
  } catch (err) {
    console.error("Personnel page failed to load:", err);
    setLiveStatus(false);
    showToast("Could not reach the server. Is the backend running?", "err");
    document.getElementById("tableBody").innerHTML =
      '<tr><td colspan="6" class="empty-row">Could not load personnel</td></tr>';
    document.getElementById("roleBreakdown").innerHTML =
      '<p class="empty-state">Could not load roles</p>';
    document.getElementById("stationPersonnelList").innerHTML =
      '<p class="empty-state">Could not load station data</p>';
    document.getElementById("expeditionList").innerHTML =
      '<p class="empty-state">Could not load expedition data</p>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPersonnel();

  document.getElementById("tableSearch").addEventListener("input", (e) => {
    currentSearch = e.target.value.trim().toLowerCase();
    renderTable();
  });
  document.getElementById("filterStation").addEventListener("change", (e) => {
    currentStationFilter = e.target.value;
    renderTable();
  });
  document.getElementById("filterRole").addEventListener("change", (e) => {
    currentRoleFilter = e.target.value;
    renderTable();
  });
  document.getElementById("filterStatus").addEventListener("change", (e) => {
    currentStatusFilter = e.target.value;
    renderTable();
  });
  document.getElementById("newPersonBtn").addEventListener("click", () => {
    showToast("New Person form isn't wired up yet.", "warn");
  });
});

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function populateFilters() {
  const stationNames = [
    ...new Set(
      [
        ...allStations.map((s) => s.name),
        ...allPersonnel.map((p) => p.station),
      ].filter(Boolean),
    ),
  ];
  const stSelect = document.getElementById("filterStation");
  stSelect.innerHTML =
    '<option value="">All stations</option>' +
    stationNames.map((n) => `<option value="${n}">${n}</option>`).join("");

  const roles = [...new Set(allPersonnel.map((p) => p.role).filter(Boolean))];
  const roleSelect = document.getElementById("filterRole");
  roleSelect.innerHTML =
    '<option value="">All roles</option>' +
    roles.map((r) => `<option value="${r}">${r}</option>`).join("");

  const statuses = [
    ...new Set(allPersonnel.map((p) => p.status).filter(Boolean)),
  ];
  const statusSelect = document.getElementById("filterStatus");
  statusSelect.innerHTML =
    '<option value="">All statuses</option>' +
    statuses.map((s) => `<option value="${s}">${cap(s)}</option>`).join("");
}

function renderStats() {
  const total = allPersonnel.length;
  const deployed = allPersonnel.filter((p) => p.status === "deployed").length;
  const other = total - deployed;
  const stations = new Set(allPersonnel.map((p) => p.station).filter(Boolean))
    .size;
  const roles = new Set(allPersonnel.map((p) => p.role).filter(Boolean)).size;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statDeployed").textContent = deployed;
  document.getElementById("statOther").textContent = other;
  document.getElementById("statStations").textContent = stations;
  document.getElementById("statRoles").textContent = roles;
}

function getFilteredPersonnel() {
  return allPersonnel.filter((p) => {
    if (currentStationFilter && p.station !== currentStationFilter)
      return false;
    if (currentRoleFilter && p.role !== currentRoleFilter) return false;
    if (currentStatusFilter && p.status !== currentStatusFilter) return false;
    if (currentSearch) {
      const haystack = `${p.name || ""} ${p.role || ""}`.toLowerCase();
      if (!haystack.includes(currentSearch)) return false;
    }
    return true;
  });
}

function statusPill(status) {
  const map = {
    deployed: ["pill-green", "Deployed"],
    active: ["pill-green", "Active"],
    on_leave: ["pill-amber", "On Leave"],
    rotating_out: ["pill-amber", "Rotating Out"],
    incoming: ["pill-blue", "Incoming"],
  };
  const [cls, label] = map[status] || ["pill-blue", cap(status) || "—"];
  return `<span class="pill ${cls}">${label}</span>`;
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  const rows = getFilteredPersonnel();

  document.getElementById("tableFootText").textContent =
    `Showing ${rows.length} of ${allPersonnel.length} personnel`;

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-row">No personnel match your filters</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  rows.forEach((p) => {
    const tr = document.createElement("tr");
    if (p.person_id === selectedPersonId) tr.classList.add("selected");
    tr.innerHTML = `
      <td class="cell-id">${p.name || "—"}</td>
      <td>${p.role || "—"}</td>
      <td>${p.station || "—"}</td>
      <td>${p.season || "—"}</td>
      <td>${p.contact || "—"}</td>
      <td>${statusPill(p.status)}</td>
    `;
    tr.addEventListener("click", () => selectPerson(p.person_id));
    tbody.appendChild(tr);
  });
}

function selectPerson(id) {
  selectedPersonId = id;
  renderTable();
  renderDetails(allPersonnel.find((p) => p.person_id === id));
}

function renderDetails(p) {
  const panel = document.getElementById("personDetailsPanel");
  if (!p) {
    panel.innerHTML =
      '<div class="panel-title-row"><div class="panel-title">Personnel Details</div></div><p class="empty-state">Select a person to see their details</p>';
    return;
  }

  panel.innerHTML = `
    <div class="panel-title-row"><div class="panel-title">Personnel Details</div></div>
    <div class="item-detail-head">
      <div class="item-detail-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="8.5" r="2.4" /><path d="M16 14.3c2.7.4 4.9 2.3 5 5.7" />
        </svg>
      </div>
      <div>
        <div class="item-detail-name">${p.name || "—"}</div>
        <div class="item-detail-sub">${p.role || "—"}</div>
      </div>
    </div>
    <div class="detail-rows">
      <div class="detail-row"><span>Station</span><span>${p.station || "Unassigned"}</span></div>
      <div class="detail-row"><span>Expedition Season</span><span>${p.season || "—"}</span></div>
      <div class="detail-row"><span>Contact</span><span>${p.contact || "—"}</span></div>
      <div class="detail-row"><span>Status</span><span>${statusPill(p.status)}</span></div>
    </div>
  `;
}

function renderRoleBreakdown() {
  const container = document.getElementById("roleBreakdown");
  if (allPersonnel.length === 0) {
    container.innerHTML = '<p class="empty-state">No personnel data yet</p>';
    return;
  }

  const byRole = {};
  allPersonnel.forEach((p) => {
    const role = p.role || "Unassigned";
    byRole[role] = (byRole[role] || 0) + 1;
  });
  const total = allPersonnel.length;

  const colors = ["#3b82f6", "#22c55e", "#f5a524", "#a855f7", "#8892a4"];
  container.innerHTML = Object.keys(byRole)
    .sort((a, b) => byRole[b] - byRole[a])
    .map((role, i) => {
      const val = byRole[role];
      const pct = Math.round((val / total) * 100);
      return `<div class="category-row">
        <span class="category-dot" style="background:${colors[i % colors.length]}"></span>
        <span class="category-name">${role}</span>
        <span class="category-value">${val} (${pct}%)</span>
      </div>`;
    })
    .join("");
}

function renderStationPersonnel() {
  const container = document.getElementById("stationPersonnelList");
  const stationNames = [
    ...new Set(
      [
        ...allStations.map((s) => s.name),
        ...allPersonnel.map((p) => p.station),
      ].filter(Boolean),
    ),
  ];

  if (stationNames.length === 0) {
    container.innerHTML = '<p class="empty-state">No station data yet</p>';
    return;
  }

  container.innerHTML = stationNames
    .map((name) => {
      const people = allPersonnel.filter((p) => p.station === name);
      const deployed = people.filter((p) => p.status === "deployed").length;
      return `<div class="lowstock-item">
        <div class="lowstock-ic" style="background:var(--blue-bg);color:var(--blue)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 21V9l8-5 8 5v12" /><path d="M9 21v-6h6v6" />
          </svg>
        </div>
        <div>
          <div class="lowstock-title">${name}</div>
          <div class="lowstock-sub">${deployed} deployed</div>
        </div>
        <div class="lowstock-qty">${people.length} total</div>
      </div>`;
    })
    .join("");
}

function renderExpeditions() {
  const container = document.getElementById("expeditionList");
  const seasons = [
    ...new Set(allPersonnel.map((p) => p.season).filter(Boolean)),
  ];

  if (seasons.length === 0) {
    container.innerHTML = '<p class="empty-state">No expedition data yet</p>';
    return;
  }

  container.innerHTML = seasons
    .map((season) => {
      const people = allPersonnel.filter((p) => p.season === season);
      const stations = new Set(people.map((p) => p.station).filter(Boolean));
      return `<div class="category-row">
        <span class="category-dot" style="background:var(--green)"></span>
        <span class="category-name">${season}</span>
        <span class="category-value">${people.length} personnel · ${stations.size} station${stations.size === 1 ? "" : "s"}</span>
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
