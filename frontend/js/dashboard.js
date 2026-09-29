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

    setLiveStatus(true);
    renderKPIs();
    renderStationList();
    renderCriticalAlerts();
    renderDonut();
    renderShipmentsChart();
    renderRecentShipments();
    renderTimeline();
    renderStationMap();
    renderWeather(); // fetches independently; won't block the rest on failure
    updateBellBadge();
  } catch (err) {
    console.error("Dashboard failed to load:", err);
    setLiveStatus(false);
  } finally {
    isLoadingDashboard = false;
    checkSystemStatus(); // real probes, never hardcoded
  }
}

/* ---------------- Hero: greeting from the authenticated user ----------------
   No user name is hardcoded. We read the session token this app already
   stores on login (see auth-guard.js/config.js) and decode its JWT payload
   client-side purely for display — the payload is the same one
   auth_utils.generate_token() signs server-side (username, role, station). */
function getStoredToken() {
  const keys = ["plToken", "authToken", "token", "pl_token"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch (e) {
    return null;
  }
}

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

function setHeroText(name, role) {
  const el = document.getElementById("heroGreeting");
  if (!el) return;
  el.textContent = name
    ? `${timeOfDayGreeting()}, ${name}${role ? " — " + role.replace("_", " ") : ""} 👋`
    : `${timeOfDayGreeting()} 👋`;
}

async function renderHero() {
  const token = getStoredToken();
  const payload = token ? decodeJwtPayload(token) : null;
  // Show something immediately from the token, then upgrade to the
  // full_name from /api/auth/me once it resolves (falls back silently
  // if that endpoint isn't deployed yet).
  setHeroText(payload?.username, payload?.role);
  try {
    const me = await apiGet("/api/auth/me");
    if (me && (me.full_name || me.username)) {
      setHeroText(me.full_name || me.username, me.role);
    }
  } catch (e) {
    // keep the token-derived greeting
  }
}
renderHero();

/* ---------------- System Status ---------------- */
// state: true/"ok" | false/"down" | "warn" | "unknown"
function setSystemStatus(id, state, label) {
  const stateEl = document.getElementById(id);
  if (!stateEl) return;
  stateEl.textContent = label;
  const cls =
    state === true || state === "ok"
      ? "sys-ok"
      : state === "warn"
        ? "sys-warn"
        : state === "unknown"
          ? "sys-unknown"
          : "sys-down";
  const dot = stateEl.parentElement?.querySelector(".sys-dot");
  if (dot) {
    dot.classList.remove("sys-ok", "sys-down", "sys-warn", "sys-unknown");
    dot.classList.add(cls);
  }
}

// Set by renderWeather() once every station's request has settled.
let wxSummary = null; // { ok: n, total: n }

async function checkSystemStatus() {
  // API + Database: ask the backend (/api/health pings MySQL).
  let health = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${API_BASE}/api/health`, {
      headers: authHeaders(),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
    if (res.ok) {
      health = await res.json();
      setSystemStatus("sysApi", true, "Operational");
      setSystemStatus(
        "sysDb",
        health.database ? true : false,
        health.database ? "Operational" : "Unreachable",
      );
    } else {
      setSystemStatus("sysApi", "warn", `Error (${res.status})`);
      setSystemStatus("sysDb", "unknown", "Unknown");
    }
  } catch (e) {
    setSystemStatus("sysApi", false, "Unreachable");
    setSystemStatus("sysDb", "unknown", "Unknown");
  }

  // Weather: key configured on the server + stations actually answering.
  if (health && !health.weather_configured) {
    setSystemStatus("sysWeather", false, "Not configured");
  } else if (wxSummary) {
    if (wxSummary.total === 0) setSystemStatus("sysWeather", "unknown", "No stations");
    else if (wxSummary.ok === wxSummary.total)
      setSystemStatus("sysWeather", true, "Operational");
    else if (wxSummary.ok > 0)
      setSystemStatus("sysWeather", "warn", `Degraded (${wxSummary.ok}/${wxSummary.total})`);
    else setSystemStatus("sysWeather", false, "Unavailable");
  } else {
    setSystemStatus("sysWeather", "unknown", "Checking…");
  }

  // Sync: browser connectivity + the offline write queue.
  try {
    if (!navigator.onLine) {
      setSystemStatus("sysSync", false, "Offline");
    } else if (window.OfflineDB) {
      const items = await window.OfflineDB.listOutbox();
      const failed = items.filter((i) => i.status === "failed").length;
      const pending = items.filter((i) => i.status === "pending").length;
      if (failed) setSystemStatus("sysSync", false, `${failed} failed`);
      else if (pending) setSystemStatus("sysSync", "warn", `${pending} pending`);
      else setSystemStatus("sysSync", true, "Up to date");
    } else {
      setSystemStatus("sysSync", "unknown", "Unavailable");
    }
  } catch (e) {
    setSystemStatus("sysSync", "unknown", "Unknown");
  }
}

window.addEventListener("online", checkSystemStatus);
window.addEventListener("offline", checkSystemStatus);
setInterval(checkSystemStatus, 30000);

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

/* ---------------- Topbar: live status pill ----------------
   Matches cargo.html's live-pill markup/behaviour: a colored dot +
   label that reflects whether the last API call succeeded, plus a
   "last synced" timestamp next to it. */
function setLiveStatus(isLive) {
  const pill = document.getElementById("livePill");
  const dot = document.getElementById("liveDot");
  const label = document.getElementById("liveText");
  const sync = document.getElementById("syncText");

  if (pill && dot && label) {
    if (isLive) {
      pill.style.color = "var(--green)";
      pill.style.background = "var(--green-bg)";
      dot.style.background = "var(--green)";
      dot.style.boxShadow = "0 0 0 3px rgba(55,211,143,0.2)";
      label.textContent = "LIVE";
    } else {
      pill.style.color = "var(--red)";
      pill.style.background = "var(--red-bg)";
      dot.style.background = "var(--red)";
      dot.style.boxShadow = "0 0 0 3px rgba(242,104,95,0.2)";
      label.textContent = "OFFLINE";
    }
  }

  if (sync) {
    sync.textContent = isLive
      ? "Last synced: " +
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Sync failed";
  }
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

// Free-text query typed into the shared topbar search box (cargo-style).
// Filters the station list live, same spirit as cargo's topSearch -> tableSearch wiring.
let dashSearchQuery = "";

function renderStationList() {
  const container = document.getElementById("stationListContainer");
  if (!container) {
    console.warn("stationListContainer not found in DOM");
    return;
  }

  const q = dashSearchQuery.trim().toLowerCase();
  const visible = q
    ? dbStations.filter((s) => (s.name || "").toLowerCase().includes(q))
    : dbStations;

  if (dbStations.length === 0) {
    container.innerHTML = '<p class="empty-state">No station data yet</p>';
    return;
  }

  if (visible.length === 0) {
    container.innerHTML = '<p class="empty-state">No stations match your search</p>';
    return;
  }

  // IMPORTANT: use = not +=
  container.innerHTML = visible
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
    .filter((a) => a.status === "open" && !dashDismissedAlertIds.has(a.alert_id ?? a.id))
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
  if (dbShipments.length === 0) {
    box.innerHTML = '<span class="chart-empty-text">No shipments yet</span>';
    return;
  }

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
  box.innerHTML =
    '<div class="ship-chart"><div class="ship-plot">' +
    bars
      .map((b) => {
        const val = counts[b.key];
        const pct = val === 0 ? 0 : Math.max(4, Math.round((val / max) * 100));
        return `<div class="ship-slot" title="${b.label}: ${val}">
          <div class="ship-col" style="height:${pct}%;">
            <span class="ship-val">${val}</span>
            <div class="ship-bar" style="background:${b.color};"></div>
          </div>
        </div>`;
      })
      .join("") +
    '</div><div class="ship-labels">' +
    bars.map((b) => `<span>${b.label}</span>`).join("") +
    "</div></div>";
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
let timelineExpanded = false;
document.getElementById("timelineToggle")?.addEventListener("click", () => {
  timelineExpanded = !timelineExpanded;
  renderTimeline();
});

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

  const top = timelineExpanded ? events.slice(0, 30) : events.slice(0, 5);
  const toggle = document.getElementById("timelineToggle");
  if (toggle) {
    toggle.style.display = events.length > 5 ? "" : "none";
    toggle.textContent = timelineExpanded ? "Show less" : "View all";
  }
  container.classList.toggle("expanded", timelineExpanded);
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

/* =========================================================
   TOPBAR — unified with cargo.html's design & behaviour:
   live-pill / sync text, a single free-text search box,
   a bell button with a dropdown notifications panel, and a
   one-click theme toggle using body.classList("light").
========================================================= */

const dashDismissedAlertIds = new Set();

function updateBellBadge() {
  const openAlerts = dbAlerts.filter(
    (a) => a.status === "open" && !dashDismissedAlertIds.has(a.alert_id ?? a.id),
  );
  const badge = document.getElementById("bellBadge");
  if (!badge) return;
  badge.textContent = openAlerts.length;
  badge.style.display = openAlerts.length ? "flex" : "none";
}

function renderNotifList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  const openAlerts = dbAlerts.filter(
    (a) => a.status === "open" && !dashDismissedAlertIds.has(a.alert_id ?? a.id),
  );
  list.innerHTML = openAlerts.length
    ? openAlerts
        .map(
          (a) => `<div class="notif-item">
            <div>
              <b style="display:block; font-size:12px;">${a.message || "Alert"}</b>
              <span style="color:var(--text-faint); font-size:11.5px;">${a.station || "All stations"} · ${a.created_at || "—"}</span>
            </div>
          </div>`,
        )
        .join("")
    : `<div class="notif-item">All caught up 🎉</div>`;
}

const dashBellBtn = document.getElementById("bellBtn");
if (dashBellBtn) {
  dashBellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    renderNotifList();
    document.getElementById("notifPanel")?.classList.toggle("show");
  });
}

const dashNotifClear = document.getElementById("notifClear");
if (dashNotifClear) {
  dashNotifClear.addEventListener("click", (e) => {
    e.stopPropagation();
    dbAlerts.forEach((a) => dashDismissedAlertIds.add(a.alert_id ?? a.id));
    renderNotifList();
    updateBellBadge();
    renderCriticalAlerts();
    document.getElementById("notifPanel")?.classList.remove("show");
  });
}

document.addEventListener("click", () => {
  document.getElementById("notifPanel")?.classList.remove("show");
});

const dashTopSearch = document.getElementById("topSearch");
if (dashTopSearch) {
  dashTopSearch.addEventListener("input", (e) => {
    dashSearchQuery = e.target.value || "";
    renderStationList();
  });
}

/* Theme toggle (init + persistence + cross-page sync + toast) is
   now handled by the shared ../js/theme.js, loaded on every page. */

/* =========================================================
   Weather at Stations — calls /api/weather/<station name>, matching
   routes/weather.py's actual contract (keyed by lowercase station
   name, not station_id - see stations.js's normalizeWeatherPayload
   for the same logic). Both provider files
   (weather.py / weather_openmeteo_backup.py) pass through their own
   provider's raw field names, so this normalizes either shape before
   rendering. Each station's card fails independently: one station's
   weather being unavailable never blocks the rest of the dashboard.
========================================================= */
function normalizeWeatherPayload(data) {
  const current = (data && data.current) || {};

  // WeatherAPI.com shape: current.temp_c / humidity / wind_kph / condition.{text,icon}
  if (current.temp_c !== undefined) {
    const condition = current.condition || {};
    return {
      available: true,
      temperature_c: current.temp_c,
      conditionText: condition.text || null,
      iconUrl: condition.icon
        ? condition.icon.startsWith("//")
          ? `https:${condition.icon}`
          : condition.icon
        : null,
    };
  }

  // Open-Meteo shape: current.temperature_2m / weather_code
  if (current.temperature_2m !== undefined) {
    return {
      available: true,
      temperature_c: current.temperature_2m,
      conditionText: weatherCodeToText(current.weather_code),
      iconUrl: null,
    };
  }

  return { available: false };
}

function weatherCodeToText(code) {
  if (code == null) return null;
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Storm";
  return null;
}

function weatherIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M17.5 19H9a5 5 0 111.3-9.8A6 6 0 0117.5 12a3.5 3.5 0 010 7z" />
  </svg>`;
}

async function renderWeather() {
  const row = document.getElementById("weatherRow");
  if (!row) return;

  if (dbStations.length === 0) {
    row.innerHTML = '<p class="empty-state">No stations yet</p>';
    return;
  }

  // Render a skeleton card per station immediately, then fill each in
  // as its own request resolves (or mark it unavailable on failure).
  row.innerHTML = dbStations
    .map(
      (s) => `<div class="weather-card" id="wxCard-${s.station_id}">
        <div class="weather-icon">${weatherIconSvg()}</div>
        <div class="weather-temp">—°</div>
        <div class="weather-cond">Loading…</div>
        <div class="weather-place">${(s.name || "—").toUpperCase()}</div>
      </div>`,
    )
    .join("");

  let wxDone = 0;
  let wxOk = 0;
  const wxSettle = (ok) => {
    wxDone++;
    if (ok) wxOk++;
    if (wxDone === dbStations.length) {
      wxSummary = { ok: wxOk, total: dbStations.length };
      checkSystemStatus();
    }
  };

  dbStations.forEach(async (s) => {
    const card = document.getElementById(`wxCard-${s.station_id}`);
    if (!card) return wxSettle(false);
    const key = (s.name || "").toLowerCase();
    try {
      const data = await apiGet(`/api/weather/${encodeURIComponent(key)}`);
      const w = normalizeWeatherPayload(data);
      const tempEl = card.querySelector(".weather-temp");
      const condEl = card.querySelector(".weather-cond");
      const iconEl = card.querySelector(".weather-icon");

      if (!w.available) {
        if (tempEl) tempEl.textContent = "—°";
        if (condEl) condEl.textContent = "Unavailable";
        wxSettle(false);
        return;
      }
      wxSettle(true);
      if (tempEl)
        tempEl.textContent =
          w.temperature_c !== undefined && w.temperature_c !== null
            ? `${Math.round(w.temperature_c)}°`
            : "—°";
      if (condEl) condEl.textContent = w.conditionText || "—";
      if (iconEl && w.iconUrl) {
        iconEl.innerHTML = `<img src="${w.iconUrl}" alt="" width="24" height="24" />`;
      }
    } catch (e) {
      const condEl = card.querySelector(".weather-cond");
      if (condEl) condEl.textContent = "Unavailable";
      wxSettle(false);
    }
  });
}

/* =========================================================
   Station Network Map (Leaflet + OpenStreetMap). Markers come
   entirely from dbStations (/api/stations) — nothing hardcoded.
   Supports Antarctica, Arctic and Himalayas since it just plots
   whatever latitude/longitude the backend returns.
========================================================= */
let dashLeafletMap = null;
let dashLeafletMarkers = [];

// Station names/regions come from user input (Add Station form), so they
// must never be dropped into popup HTML unescaped.
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// Stations span Arctic -> Antarctic, so a plain fitBounds zooms out until
// the world is smaller than the box and leaves empty grey space. Compute
// the smallest zoom at which the world still FILLS the container, use it
// as minZoom, then fit the markers (centred, never below that zoom).
function fitDashMap(bounds) {
  const map = dashLeafletMap;
  if (!map) return;
  map.invalidateSize();
  const world = L.latLngBounds([[-85, -180], [85, 180]]);
  const fillZoom = map.getBoundsZoom(world, true); // inside = true -> fills box
  map.setMinZoom(fillZoom);
  map.fitBounds(bounds.pad(0.15), { maxZoom: 6, animate: false });
  if (map.getZoom() < fillZoom) map.setZoom(fillZoom, { animate: false });
  if (!bounds.isValid() || bounds.getSouthWest().equals(bounds.getNorthEast())) {
    map.setView(bounds.getCenter(), Math.max(fillZoom, 4), { animate: false });
  }
}

function renderStationMap() {
  const mapEl = document.getElementById("dashStationMap");
  const emptyEl = document.getElementById("dashMapEmpty");
  if (!mapEl || typeof L === "undefined") return;

  const withCoords = dbStations.filter(
    (s) =>
      s.latitude !== null &&
      s.latitude !== undefined &&
      s.longitude !== null &&
      s.longitude !== undefined,
  );

  if (withCoords.length === 0) {
    mapEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }
  mapEl.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";

  if (!dashLeafletMap) {
    dashLeafletMap = L.map(mapEl, {
      zoomControl: true,
      attributionControl: false, // re-added below in a compact form
      scrollWheelZoom: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBounds: [[-85, -180], [85, 180]], // never pan into empty space
      maxBoundsViscosity: 1.0,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      noWrap: true,
    }).addTo(dashLeafletMap);
    L.control
      .attribution({ prefix: false, position: "bottomright" })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>')
      .addTo(dashLeafletMap);
  }

  dashLeafletMarkers.forEach((m) => dashLeafletMap.removeLayer(m));
  dashLeafletMarkers = [];

  const statusColor = {
    operational: "#37d38f",
    maintenance: "#f2b84b",
    offline: "#f2685f",
    decommissioned: "#4e5a76",
  };

  withCoords.forEach((s) => {
    const color = statusColor[s.status] || "#4f8bff";
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 0 3px rgba(0,0,0,0.25);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const marker = L.marker([s.latitude, s.longitude], { icon }).addTo(
      dashLeafletMap,
    );
    marker.bindPopup(
      `<div class="dash-map-popup" style="min-width:160px;">
        <b>${escapeHtml(s.name || "—")}</b><br/>
        <span style="font-size:11.5px;">${escapeHtml(s.region || "—")} · ${escapeHtml(s.status || "—")}</span><br/>
        <a href="stations.html?station_id=${encodeURIComponent(s.station_id)}">View Station →</a>
      </div>`,
      { className: "dash-map-popup" },
    );
    dashLeafletMarkers.push(marker);
  });

  const group = L.featureGroup(dashLeafletMarkers);
  fitDashMap(group.getBounds());
  // Leaflet needs a size recalculation once its container is actually
  // laid out (it starts at 0×0 while the tab/section is hidden/animating).
  // Refit once layout has settled (container starts at 0x0 while hidden).
  setTimeout(() => fitDashMap(group.getBounds()), 150);
  if (!window.__dashMapResizeBound) {
    window.__dashMapResizeBound = true;
    window.addEventListener("resize", () => {
      if (!dashLeafletMap || !dashLeafletMarkers.length) return;
      fitDashMap(L.featureGroup(dashLeafletMarkers).getBounds());
    });
  }
}
