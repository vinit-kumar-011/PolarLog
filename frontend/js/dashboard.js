async function loadDashboard() {
  try {
    const [inventory, cargo, shipments, alerts, stations, personnel] =
      await Promise.all([
        apiGet("/api/inventory"),
        apiGet("/api/cargo"),
        apiGet("/api/shipments"),
        apiGet("/api/alerts"),
        apiGet("/api/stations"),
        apiGet("/api/personnel"),
      ]);

    renderKPIs(inventory, cargo, shipments, alerts, stations, personnel);
    renderInventoryDonut(inventory);
    renderShipmentsBar(shipments);
    renderCriticalAlerts(alerts);
    renderRecentShipments(shipments);
    renderStationOverview(stations, inventory);
    renderWeather(); // placeholder - see Part 3
  } catch (err) {
    console.error("Dashboard failed to load:", err);
    showToast("Could not reach the server. Is the backend running?");
  }
}

document.addEventListener("DOMContentLoaded", loadDashboard);

function renderKPIs(inventory, cargo, shipments, alerts, stations, personnel) {
  // Active stations
  document.getElementById("kpiStations").textContent = stations.filter(
    (s) => s.status === "operational",
  ).length;

  // Cargo not yet delivered
  document.getElementById("kpiCargo").textContent = cargo.filter(
    (c) => c.status !== "delivered",
  ).length;

  // Open alerts, plus how many are critical
  const openAlerts = alerts.filter((a) => a.status === "open");
  document.getElementById("kpiAlerts").textContent = openAlerts.length;
  document.getElementById("kpiAlertsCritical").textContent =
    openAlerts.filter((a) => a.severity === "critical").length + " critical";

  // Personnel currently deployed
  document.getElementById("kpiPersonnel").textContent = personnel.length;

  // Shipments on the move
  document.getElementById("kpiShipments").textContent = shipments.filter(
    (s) => s.status === "in_transit",
  ).length;

  // Inventory health - average across every item
  const health = Math.round(
    inventory.reduce(
      (sum, i) =>
        sum + Math.min(100, (i.quantity / (i.reorder_level || 1)) * 100),
      0,
    ) / inventory.length,
  );
  document.getElementById("kpiHealth").textContent = health + "%";
}

let inventoryChart = null;

function renderInventoryDonut(inventory) {
  // Add up quantity per category
  const byCategory = {};
  inventory.forEach((item) => {
    byCategory[item.category] =
      (byCategory[item.category] || 0) + item.quantity;
  });
  // byCategory is now { fuel: 7720, food: 1710, medical: 50, equipment: 36 }

  const ctx = document.getElementById("inventoryDonut").getContext("2d");

  if (inventoryChart) inventoryChart.destroy(); // avoid stacking charts on reload

  inventoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(byCategory).map(
        (c) => c.charAt(0).toUpperCase() + c.slice(1),
      ),
      datasets: [
        {
          data: Object.values(byCategory),
          backgroundColor: [
            "#2E8BC0",
            "#F97316",
            "#12456B",
            "#A9D6E5",
            "#5B7182",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
    },
  });
}
let shipmentsChart = null;

function renderShipmentsBar(shipments) {
  const counts = { delivered: 0, in_transit: 0, pending: 0 };
  shipments.forEach((s) => {
    if (counts[s.status] !== undefined) counts[s.status]++;
  });

  const ctx = document.getElementById("shipmentsBar").getContext("2d");

  if (shipmentsChart) shipmentsChart.destroy();

  shipmentsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Delivered", "In Transit", "Pending"],
      datasets: [
        {
          label: "Shipments",
          data: [counts.delivered, counts.in_transit, counts.pending],
          backgroundColor: ["#2E8BC0", "#F97316", "#A9D6E5"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}
function renderCriticalAlerts(alerts) {
  const container = document.getElementById("criticalAlertsList");
  container.innerHTML = "";

  const open = alerts.filter((a) => a.status === "open");

  if (open.length === 0) {
    container.innerHTML = '<p class="empty-state">No open alerts</p>';
    return;
  }

  open.slice(0, 5).forEach((alert) => {
    const item = document.createElement("div");
    item.className = `alert-item alert-${alert.severity}`;
    item.innerHTML = `
      <span class="alert-badge ${alert.severity}">${alert.severity}</span>
      <div class="alert-body">
        <p class="alert-message">${alert.message}</p>
        <span class="alert-meta">${alert.station || "All stations"} · ${alert.created_at}</span>
      </div>
    `;
    container.appendChild(item);
  });
}
function renderRecentShipments(shipments) {
  const tbody = document.getElementById("recentShipmentsBody");
  tbody.innerHTML = "";

  shipments.slice(0, 5).forEach((s) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${s.reference}</td>
      <td>${s.origin} → ${s.destination}</td>
      <td><span class="status-badge ${s.status}">${s.status.replace("_", " ")}</span></td>
      <td>${s.eta || "—"}</td>
    `;
    tbody.appendChild(row);
  });
}
function renderStationOverview(stations, inventory) {
  const container = document.getElementById("stationOverviewList");
  container.innerHTML = "";

  stations.forEach((station) => {
    const items = inventory.filter((i) => i.station === station.name);
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

    const row = document.createElement("div");
    row.className = "station-row";
    row.innerHTML = `
      <span class="station-name">${station.name}</span>
      <span class="station-region">${station.region}</span>
      <div class="health-bar">
        <div class="health-fill" style="width:${health}%"></div>
      </div>
      <span class="health-value">${health}%</span>
      ${critical > 0 ? `<span class="badge critical">${critical} critical</span>` : ""}
    `;
    container.appendChild(row);
  });
}
