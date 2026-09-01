javascript;
let allStations = [];
let allInventory = [];
let allShipments = [];
let allPersonnel = [];

async function loadStations() {
  try {
    [allStations, allInventory, allShipments, allPersonnel] = await Promise.all(
      [
        apiGet("/api/stations"),
        apiGet("/api/inventory"),
        apiGet("/api/shipments"),
        apiGet("/api/personnel"),
      ],
    );

    renderStationSummary();
    renderStationCards();
    renderInventoryHealth();
    renderActivities(); // uses alerts - see Part 3
  } catch (err) {
    console.error("Stations page failed:", err);
    showToast("Could not reach the server.");
  }
}

document.addEventListener("DOMContentLoaded", loadStations);

javascript;
function renderStationSummary() {
  document.getElementById("summaryOperational").textContent =
    allStations.filter((s) => s.status === "operational").length;

  document.getElementById("summaryPersonnel").textContent = allPersonnel.length;

  const avgHealth = Math.round(
    allInventory.reduce(
      (sum, i) =>
        sum + Math.min(100, (i.quantity / (i.reorder_level || 1)) * 100),
      0,
    ) / allInventory.length,
  );
  document.getElementById("summaryHealth").textContent = avgHealth + "%";

  document.getElementById("summaryShipments").textContent = allShipments.filter(
    (s) => s.status === "in_transit",
  ).length;
}

function renderStationCards(filter = "all") {
  const container = document.getElementById("stationCards");
  container.innerHTML = "";

  let stations = allStations;

  if (filter === "operational") {
    stations = stations.filter((s) => s.status === "operational");
  } else if (filter === "low-stock") {
    stations = stations.filter((s) =>
      allInventory.some(
        (i) =>
          i.station === s.name &&
          (i.status === "low" || i.status === "critical"),
      ),
    );
  }

  stations.forEach((station) => {
    const items = allInventory.filter((i) => i.station === station.name);
    const people = allPersonnel.filter((p) => p.station === station.name);
    const inbound = allShipments.filter(
      (s) => s.destination === station.name && s.status === "in_transit",
    );
    const critical = items.filter((i) => i.status === "critical").length;

    const health =
      items.length === 0
        ? 0
        : Math.round(
            items.reduce(
              (sum, i) =>
                sum +
                Math.min(100, (i.quantity / (i.reorder_level || 1)) * 100),
              0,
            ) / items.length,
          );

    const card = document.createElement("div");
    card.className = "station-card";
    card.onclick = () => selectStation(station.station_id);
    card.innerHTML = `
      <div class="station-card-header">
        <h3>${station.name}</h3>
        <span class="station-code">${station.code}</span>
      </div>
      <p class="station-region">${station.region}</p>
      <p class="station-coords">${station.latitude}°, ${station.longitude}°</p>
      <div class="station-stats">
        <div><strong>${people.length}</strong><span>Personnel</span></div>
        <div><strong>${inbound.length}</strong><span>Inbound</span></div>
        <div><strong>${health}%</strong><span>Stock</span></div>
      </div>
      ${
        critical > 0
          ? `<div class="station-warning">${critical} critical shortage${critical > 1 ? "s" : ""}</div>`
          : ""
      }
    `;
    container.appendChild(card);
  });
}

// Wire your filter dropdown to this
document.getElementById("stationFilter").addEventListener("change", (e) => {
  renderStationCards(e.target.value);
});

function renderInventoryHealth() {
  const container = document.getElementById("inventoryHealthBars");
  container.innerHTML = "";

  allStations.forEach((station) => {
    const items = allInventory.filter((i) => i.station === station.name);
    if (items.length === 0) return;

    const health = Math.round(
      items.reduce(
        (sum, i) =>
          sum + Math.min(100, (i.quantity / (i.reorder_level || 1)) * 100),
        0,
      ) / items.length,
    );

    const level = health < 50 ? "critical" : health < 75 ? "warning" : "good";

    const bar = document.createElement("div");
    bar.className = "health-row";
    bar.innerHTML = `
      <span class="health-label">${station.name}</span>
      <div class="health-track">
        <div class="health-fill ${level}" style="width:${health}%"></div>
      </div>
      <span class="health-percent">${health}%</span>
    `;
    container.appendChild(bar);
  });
}
async function selectStation(stationId) {
  const summary = await apiGet(`/api/stations/${stationId}/summary`);
  // { station_id, name, region, status, personnel_count, inventory_items, open_alerts }

  document.getElementById("detailName").textContent = summary.name;
  document.getElementById("detailRegion").textContent = summary.region;
  document.getElementById("detailPersonnel").textContent =
    summary.personnel_count;
  document.getElementById("detailItems").textContent = summary.inventory_items;
  document.getElementById("detailAlerts").textContent = summary.open_alerts;
}
async function renderActivities() {
  const alerts = await apiGet("/api/alerts");
  const container = document.getElementById("activitiesFeed");
  container.innerHTML = "";

  alerts.slice(0, 8).forEach((a) => {
    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `
      <span class="activity-dot ${a.severity}"></span>
      <div class="activity-body">
        <p>${a.message}</p>
        <span class="activity-meta">
          ${a.station || "System"} · ${a.created_at} · ${a.status}
        </span>
      </div>
    `;
    container.appendChild(item);
  });
}
// PLACEHOLDER DATA - no weather API connected.
// A production deployment would use IMD or a satellite feed.
const WEATHER_PLACEHOLDER = [
  { station: "Bharati", temp: -18, condition: "Clear", wind: 24 },
  { station: "Maitri", temp: -22, condition: "Snow", wind: 35 },
  { station: "Himadri", temp: -9, condition: "Overcast", wind: 18 },
];

function renderWeather() {
  const container = document.getElementById("weatherWidget");
  container.innerHTML = "";

  WEATHER_PLACEHOLDER.forEach((w) => {
    const card = document.createElement("div");
    card.className = "weather-card";
    card.innerHTML = `
      <h4>${w.station}</h4>
      <span class="weather-temp">${w.temp}°C</span>
      <span class="weather-condition">${w.condition}</span>
      <span class="weather-wind">${w.wind} km/h</span>
    `;
    container.appendChild(card);
  });
}
