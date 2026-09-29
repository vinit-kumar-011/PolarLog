/* =========================================================
   POLARLOG — STATIONS PAGE
   Data-driven: everything on this page comes from the backend.
   Uses the shared apiGet() helper from config.js for reads, and a
   small local apiSend() wrapper (same auth/base-URL conventions) for
   writes, since config.js only exposes apiGet today.
========================================================= */

// ---- feature flags ----
// Map (Leaflet/OSM) and weather are both live.
// Weather: GET /api/weather/<station_name> (Open-Meteo,
// keyed by lowercase station name, e.g. "bharati" - not station_id).
const FEATURES = {
  map: true,
  weather: true,
};

let allStations = [];
let allPersonnel = [];
let allAlerts = [];
let weatherByStation = {}; // station_id -> normalized {available, temperature_c, condition, wind_kph, humidity_pct}
let sortState = { field: "name", dir: "asc" };
let map = null;
let markersByStation = {};

const STATUS_LABEL = {
  operational: "Operational",
  maintenance: "Under Maintenance",
  offline: "Offline",
  decommissioned: "Decommissioned",
};

const STATUS_MARKER_COLOR = {
  operational: "#4ade80",
  maintenance: "#fb923c",
  offline: "#f2685f",
  decommissioned: "#4e5a76",
};

// WMO weather_code -> icon, per Open-Meteo's code table
// (https://open-meteo.com/en/docs -> "WMO Weather interpretation codes")
function iconForWeatherCode(code) {
  if (code == null) return "—";
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "❄️";
  if (code >= 95) return "⛈️";
  return "—";
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadAll();
  initThemeToggle();
  const topSearch = document.getElementById("topSearch");
  if (topSearch) {
    topSearch.addEventListener("input", () => {
      const q = topSearch.value;
      const tableSearch = document.getElementById("stationSearch");
      if (tableSearch) {
        tableSearch.value = q;
        renderStationsTable();
      }
    });
  }
});

async function loadAll() {
  try {
    const [stations, personnel, alerts] = await Promise.all([
      apiGet("/api/stations"),
      apiGet("/api/personnel").catch(() => []),
      apiGet("/api/alerts").catch(() => []),
    ]);

    allStations = stations || [];
    allPersonnel = personnel || [];
    allAlerts = alerts || [];

    setLiveStatus(true);
    renderKPIs();
    initMap();
    renderMarkers();
    renderRegionFilterOptions();
    renderStationsTable();
    renderAlerts();
    loadWeatherForAllStations(); // fire-and-forget; renders as results arrive

    // Deep link from the dashboard map popup: stations.html?station_id=N
    const wantedId = Number(new URLSearchParams(location.search).get("station_id"));
    if (wantedId) openStationDetails(wantedId);
  } catch (err) {
    console.error("Stations page failed to load:", err);
    setLiveStatus(false);
    toast("Could not reach the server. Is the backend running?");
    document.getElementById("stationsTableBody").innerHTML =
      '<tr><td colspan="9" class="empty-state">Could not load station data.</td></tr>';
  }
}

function setLiveStatus(isLive) {
  const pill = document.getElementById("livePill");
  const text = document.getElementById("liveText");
  const sync = document.getElementById("syncText");
  if (pill) pill.classList.toggle("offline", !isLive);
  if (text) text.textContent = isLive ? "LIVE" : "OFFLINE";
  if (sync) sync.textContent = isLive ? "Synced just now" : "Sync failed";
}

/* ---------------- KPIs ---------------- */
function renderKPIs() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  if (!allStations.length) {
    ["kpi-total", "kpi-operational", "kpi-maintenance", "kpi-critical", "kpi-personnel"]
      .forEach((id) => set(id, "--"));
    return;
  }
  set("kpi-total", allStations.length);
  set("kpi-operational", allStations.filter((s) => s.status === "operational").length);
  set("kpi-maintenance", allStations.filter((s) => s.status === "maintenance").length);
  set(
    "kpi-critical",
    allStations.reduce((sum, s) => sum + Number(s.critical_alert_count || 0), 0),
  );
  const totalPersonnel = allStations.some((s) => s.personnel_count != null)
    ? allStations.reduce((sum, s) => sum + Number(s.personnel_count || 0), 0)
    : allPersonnel.length;
  set("kpi-personnel", totalPersonnel);
}

/* ---------------- map ---------------- */
function initMap() {
  const container = document.getElementById("stationsMap");
  if (!container) return;

  if (!FEATURES.map) {
    container.innerHTML = `<div class="not-wired">
      <span class="nw-icon">🗺️</span>
      <strong>Map not wired up yet</strong>
      <span>Station locations will appear here once the map backend is connected.</span>
    </div>`;
    return;
  }

  if (map || typeof L === "undefined") return;
  WORLD_BOUNDS = L.latLngBounds([-85, -180], [85, 180]);
  map = L.map("stationsMap", {
    zoomControl: true,
    zoomSnap: 0.25, // fractional zoom so the world fits the card exactly
    maxBounds: WORLD_BOUNDS,
    maxBoundsViscosity: 1.0, // can't drag past the edge of the world
  });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
    noWrap: true,
    bounds: WORLD_BOUNDS,
  }).addTo(map);

  fitMapToCard();

  // Keep the map matched to its card whenever the card changes size
  // (weather/alerts loading, window resize, sidebar, dark/light toggle).
  if (typeof ResizeObserver !== "undefined") {
    let raf = null;
    new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitMapToCard);
    }).observe(container);
  } else {
    window.addEventListener("resize", fitMapToCard);
  }
}

let WORLD_BOUNDS = null; // built in initMap once Leaflet is known to be loaded
let stationBounds = null;

// Re-measure the container, set the minimum zoom to the level at which
// the world just fills the card (so no blank/white strips are ever
// visible), then frame the stations inside that.
function fitMapToCard() {
  if (!map) return;
  map.invalidateSize({ animate: false });
  map.setMinZoom(map.getBoundsZoom(WORLD_BOUNDS, true));
  if (stationBounds && stationBounds.length) {
    map.fitBounds(stationBounds, { padding: [30, 30], maxZoom: 5, animate: false });
  } else {
    map.setView([10, 30], map.getMinZoom(), { animate: false });
  }
}

function markerColor(station) {
  return STATUS_MARKER_COLOR[station.status] || "#38bdf8";
}

function renderMarkers() {
  if (!FEATURES.map) return;
  if (!map) return;
  Object.values(markersByStation).forEach((m) => map.removeLayer(m));
  markersByStation = {};

  const withCoords = allStations.filter(
    (s) => s.latitude != null && s.longitude != null,
  );

  if (withCoords.length === 0) return;

  const bounds = [];
  withCoords.forEach((station) => {
    const color = markerColor(station);
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;
        background:${color};transform:rotate(-45deg);
        border:2px solid rgba(255,255,255,0.85);
        box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 16],
    });
    const marker = L.marker([station.latitude, station.longitude], { icon }).addTo(map);
    marker.bindPopup(popupHtml(station));
    marker.on("click", () => openStationDetails(station.station_id));
    markersByStation[station.station_id] = marker;
    bounds.push([station.latitude, station.longitude]);
  });

  stationBounds = bounds;
  fitMapToCard();
}

function popupHtml(station) {
  const w = weatherByStation[station.station_id];
  const temp = w && w.available && w.temperature_c != null ? `${Math.round(w.temperature_c)}°C` : "--";
  return `<div style="font-size:13px;line-height:1.5">
    <strong>${escapeHtml(station.name)}</strong><br/>
    ${escapeHtml(station.region || "—")}<br/>
    Status: ${STATUS_LABEL[station.status] || station.status || "—"}<br/>
    Personnel: ${station.personnel_count ?? "--"}<br/>
    Temperature: ${temp}
  </div>`;
}

function focusStationOnMap(stationId) {
  if (!FEATURES.map) return;
  const marker = markersByStation[stationId];
  if (map && marker) {
    map.setView(marker.getLatLng(), 5);
    marker.openPopup();
  }
}

/* ---------------- weather ---------------- */
// Both routes/weather.py variants (Open-Meteo and WeatherAPI.com) hit
// the same GET /api/weather/<station_name> contract but pass through
// their provider's own field names as-is. This adapter normalizes
// either shape into {available, temperature_c, humidity_pct, wind_kph,
// icon} so the rest of the page never needs to know which provider is
// live - swapping routes/weather.py on the backend is enough.
function normalizeWeatherPayload(data) {
  const current = data.current || {};

  // WeatherAPI.com shape: current.temp_c / humidity / wind_kph / condition.{text,icon,code}
  if (current.temp_c !== undefined) {
    const condition = current.condition || {};
    return {
      available: true,
      temperature_c: current.temp_c,
      humidity_pct: current.humidity,
      wind_kph: current.wind_kph,
      iconUrl: condition.icon ? (condition.icon.startsWith("//") ? `https:${condition.icon}` : condition.icon) : null,
      conditionText: condition.text || null,
    };
  }

  // Open-Meteo shape: current.temperature_2m / relative_humidity_2m / wind_speed_10m / weather_code
  if (current.temperature_2m !== undefined) {
    return {
      available: true,
      temperature_c: current.temperature_2m,
      humidity_pct: current.relative_humidity_2m,
      wind_kph: current.wind_speed_10m,
      iconUrl: null,
      conditionText: null,
      weather_code: current.weather_code,
    };
  }

  return { available: false };
}

function weatherIconHtml(w) {
  if (w.iconUrl) return `<img src="${w.iconUrl}" alt="${escapeAttr(w.conditionText || "")}" width="22" height="22" />`;
  if (w.weather_code != null) return iconForWeatherCode(w.weather_code);
  return "—";
}

async function loadWeatherForAllStations() {
  if (!FEATURES.weather) {
    renderWeatherGrid();
    return;
  }
  // The weather endpoint is keyed by lowercase station name (a fixed
  // set of 3), not station_id - so a station added later via "Add
  // Station" that isn't one of those 3 will just show "--" here,
  // same as any other lookup miss.
  await Promise.all(
    allStations.map(async (station) => {
      const key = (station.name || "").toLowerCase();
      try {
        const data = await apiGet(`/api/weather/${encodeURIComponent(key)}`);
        weatherByStation[station.station_id] = normalizeWeatherPayload(data);
      } catch {
        weatherByStation[station.station_id] = { available: false };
      }
    }),
  );
  renderWeatherGrid();
}

function renderWeatherGrid() {
  const grid = document.getElementById("weatherGrid");
  if (!grid) return;

  if (!FEATURES.weather) {
    grid.innerHTML = `<div class="not-wired" style="grid-column:1 / -1">
      <span class="nw-icon">☁️</span>
      <strong>Weather not wired up yet</strong>
      <span>Live conditions will appear here once the weather backend is connected.</span>
    </div>`;
    return;
  }

  if (allStations.length === 0) {
    grid.innerHTML = '<div class="empty-state">No stations on file</div>';
    return;
  }

  grid.innerHTML = allStations
    .slice(0, 4)
    .map((station) => {
      const w = weatherByStation[station.station_id];
      const color = markerColor(station);
      if (!w || !w.available) {
        return `<div class="weather-tile">
          <div class="wt-head"><span class="wt-dot" style="background:${color}"></span>${escapeHtml(station.name)}</div>
          <div class="wt-main"><span class="wt-temp">--°C</span><span class="wt-icon">—</span></div>
          <div class="wt-meta"><span>-- km/h</span><span>--%</span></div>
        </div>`;
      }
      return `<div class="weather-tile">
        <div class="wt-head"><span class="wt-dot" style="background:${color}"></span>${escapeHtml(station.name)}</div>
        <div class="wt-main">
          <span class="wt-temp">${w.temperature_c != null ? Math.round(w.temperature_c) : "--"}°C</span>
          <span class="wt-icon">${weatherIconHtml(w)}</span>
        </div>
        <div class="wt-meta">
          <span>${w.wind_kph != null ? Math.round(w.wind_kph) : "--"} km/h</span>
          <span>${w.humidity_pct != null ? w.humidity_pct : "--"}%</span>
        </div>
      </div>`;
    })
    .join("");
}

/* ---------------- alerts ---------------- */
function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const then = new Date(String(dateStr).replace(" ", "T"));
  if (isNaN(then.getTime())) return dateStr;
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function renderAlerts() {
  const list = document.getElementById("alertsList");
  const sub = document.getElementById("alertsSub");
  if (!list) return;

  const open = allAlerts.filter((a) => a.status === "open");
  if (sub) sub.textContent = `${open.length} active alert${open.length === 1 ? "" : "s"} across stations`;

  if (open.length === 0) {
    list.innerHTML = '<div class="empty-state">No active alerts</div>';
    return;
  }

  const icon = { critical: "🔴", warning: "🟠", info: "🔵" };
  list.innerHTML = open
    .slice(0, 6)
    .map(
      (a) => `<div class="alert-row ${a.severity}">
        <span class="alert-icon">${icon[a.severity] || "•"}</span>
        <span class="alert-msg">${escapeHtml(a.message || "—")}${a.station ? ` — ${escapeHtml(a.station)}` : ""}</span>
        <span class="severity-tag ${a.severity}">${a.severity}</span>
        <span class="alert-time">${timeAgo(a.created_at)}</span>
      </div>`,
    )
    .join("");
}

/* ---------------- table ---------------- */
function renderRegionFilterOptions() {
  const select = document.getElementById("regionFilter");
  if (!select) return;
  const current = select.value;
  const regions = [...new Set(allStations.map((s) => s.region).filter(Boolean))].sort();
  select.innerHTML =
    '<option value="all">All regions</option>' +
    regions.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join("");
  if (regions.includes(current)) select.value = current;
}

function toggleSort(field) {
  if (sortState.field === field) {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  } else {
    sortState = { field, dir: "asc" };
  }
  renderStationsTable();
}

function stationLocationText(station) {
  if (station.latitude == null || station.longitude == null) return "--, --";
  return `${Number(station.latitude).toFixed(2)}, ${Number(station.longitude).toFixed(2)}`;
}

function renderStationsTable() {
  const tbody = document.getElementById("stationsTableBody");
  if (!tbody) return;

  const q = (document.getElementById("stationSearch")?.value || "").toLowerCase().trim();
  const regionFilter = document.getElementById("regionFilter")?.value || "all";
  const statusFilter = document.getElementById("statusFilter")?.value || "all";

  let rows = allStations.filter((s) => {
    if (regionFilter !== "all" && s.region !== regionFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!q) return true;
    const haystack = [s.name, s.region, s.country, s.station_type, s.status, stationLocationText(s)]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  rows.sort((a, b) => {
    const dir = sortState.dir === "asc" ? 1 : -1;
    const av = (a[sortState.field] ?? "").toString().toLowerCase();
    const bv = (b[sortState.field] ?? "").toString().toLowerCase();
    return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
  });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No stations found</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((s) => {
      const w = weatherByStation[s.station_id];
      const temp = w && w.available && w.temperature_c != null ? `${Math.round(w.temperature_c)}°C` : "--°C";
      const statusClass = s.status || "operational";
      return `<tr onclick="openStationDetails(${s.station_id})">
        <td>
          <div class="station-name-cell">
            <span class="station-avatar">🏢</span>
            <div>
              <strong>${escapeHtml(s.name)}</strong>
              <div class="sub">${escapeHtml(s.station_type || "Station")}</div>
            </div>
          </div>
        </td>
        <td><span class="status-badge ${statusClass}">${STATUS_LABEL[statusClass] || statusClass}</span></td>
        <td>📍 ${stationLocationText(s)}</td>
        <td><span class="region-badge">${escapeHtml(s.region || "—")}</span></td>
        <td><span class="type-badge">${escapeHtml(s.station_type || "Research")}</span></td>
        <td>👥 ${s.personnel_count ?? "--"}</td>
        <td>🌡️ ${temp}</td>
        <td>${s.updated_at ? timeAgo(s.updated_at) : "—"}</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <button title="View" onclick="openStationDetails(${s.station_id})">👁</button>
            <button title="Edit" onclick="openEditStationModal(${s.station_id})">✏️</button>
            <button title="Deactivate" onclick="deactivateStation(${s.station_id})">…</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

/* ---------------- station details ---------------- */
function openStationDetails(stationId) {
  const station = allStations.find((s) => s.station_id === stationId);
  if (!station) return;
  focusStationOnMap(stationId);

  const content = document.getElementById("stationDetailsContent");
  const w = weatherByStation[stationId];
  const temp = w && w.available && w.temperature_c != null ? `${Math.round(w.temperature_c)}°C` : "--°C";

  content.innerHTML = `
    <h3>${escapeHtml(station.name)}</h3>
    <div class="form-group"><label>Status</label><div>${STATUS_LABEL[station.status] || station.status}</div></div>
    <div class="form-row">
      <div class="form-group"><label>Region</label><div>${escapeHtml(station.region || "—")}</div></div>
      <div class="form-group"><label>Country</label><div>${escapeHtml(station.country || "—")}</div></div>
    </div>
    <div class="form-group"><label>Coordinates</label><div>${stationLocationText(station)}</div></div>
    <div class="form-row">
      <div class="form-group"><label>Personnel</label><div>${station.personnel_count ?? "--"}</div></div>
      <div class="form-group"><label>Temperature</label><div>${temp}</div></div>
    </div>
    ${station.description ? `<div class="form-group"><label>Description</label><div>${escapeHtml(station.description)}</div></div>` : ""}
    <div class="modal-actions" style="flex-wrap:wrap">
      <button class="btn-cancel" onclick="window.location.href='personnel.html'">View Personnel</button>
      <button class="btn-cancel" onclick="window.location.href='inventory.html'">Manage Inventory</button>
      <button class="btn-cancel" onclick="window.location.href='shipments.html'">Create Shipment</button>
      <button class="btn-cancel" onclick="window.location.href='alerts.html'">View Alerts</button>
      <button class="btn-submit" onclick="closeModal('stationDetailsModal'); openEditStationModal(${station.station_id})">Edit Station</button>
    </div>`;
  openModal("stationDetailsModal");
}

/* ---------------- add / edit station ---------------- */
function openAddStationModal() {
  document.getElementById("stationModalTitle").textContent = "Add New Station";
  document.getElementById("stationId").value = "";
  ["stationName", "stationRegion", "stationCountry", "stationType", "stationLat", "stationLon", "stationDescription", "stationContact"]
    .forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("stationStatus").value = "operational";
  openModal("stationModal");
}

function openEditStationModal(stationId) {
  const s = allStations.find((st) => st.station_id === stationId);
  if (!s) return;
  document.getElementById("stationModalTitle").textContent = "Edit Station";
  document.getElementById("stationId").value = s.station_id;
  document.getElementById("stationName").value = s.name || "";
  document.getElementById("stationRegion").value = s.region || "";
  document.getElementById("stationCountry").value = s.country || "";
  document.getElementById("stationType").value = s.station_type || "";
  document.getElementById("stationLat").value = s.latitude ?? "";
  document.getElementById("stationLon").value = s.longitude ?? "";
  document.getElementById("stationStatus").value = s.status || "operational";
  document.getElementById("stationDescription").value = s.description || "";
  document.getElementById("stationContact").value = s.contact_info || "";
  openModal("stationModal");
}

async function submitStationForm() {
  const id = document.getElementById("stationId").value;
  const name = document.getElementById("stationName").value.trim();
  const region = document.getElementById("stationRegion").value.trim();
  if (!name || !region) {
    toast("Station name and region are required.");
    return;
  }

  const payload = {
    name,
    region,
    country: document.getElementById("stationCountry").value.trim() || null,
    station_type: document.getElementById("stationType").value.trim() || null,
    latitude: document.getElementById("stationLat").value.trim() || null,
    longitude: document.getElementById("stationLon").value.trim() || null,
    status: document.getElementById("stationStatus").value,
    description: document.getElementById("stationDescription").value.trim() || null,
    contact_info: document.getElementById("stationContact").value.trim() || null,
  };

  try {
    if (id) {
      await apiSend(`/api/stations/${id}`, "PUT", payload);
      toast(`"${name}" updated.`);
    } else {
      await apiSend("/api/stations", "POST", payload);
      toast(`"${name}" added.`);
    }
    closeModal("stationModal");
    await loadAll();
  } catch (err) {
    toast(err.message || "Failed to save station.");
  }
}

async function deactivateStation(stationId) {
  if (!confirm("Deactivate this station? Historical records are kept.")) return;
  try {
    await apiSend(`/api/stations/${stationId}`, "DELETE");
    toast("Station deactivated.");
    await loadAll();
  } catch (err) {
    toast(err.message || "Failed to deactivate station.");
  }
}

/* ---------------- shared helpers ---------------- */
async function apiSend(path, method, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired, please log in again");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("active");
}

/* Theme toggle (init + persistence + cross-page sync) and the
   toast() calls used throughout this file are now handled by the
   shared ../js/theme.js, loaded on every page. */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function escapeAttr(str) {
  return escapeHtml(str);
}
