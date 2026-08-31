const API_BASE_URL = "http://localhost:5000/api";

// Helper API Fetcher
async function sendApiRequest(endpoint, payload) {
  try {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Server error");
    return data;
  } catch (err) {
    console.warn(
      "Backend API connection failed, executing frontend fallback execution.",
    );
    return null;
  }
}

// Toast Helper
function showToast(msg) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Header Actions (Notifications, Settings, Profile)
function toggleNotifications() {
  document.getElementById("notifDot").style.display = "none";
  showToast("Notifications: Himadri Station reports low fuel stock level");
}

function openSettings() {
  showToast("Opening System Settings & SATCOM Parameters panel");
}

function openProfile() {
  showToast("User Profile: ASTRO (Logistics Operator)");
}

// Modal Controls
function openModal(id) {
  document.getElementById(id).classList.add("active");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

// Quick Action Buttons
async function triggerAction(actionName) {
  showToast(`Success: ${actionName}`);
  addActivityLog(actionName, "Just now");
  await sendApiRequest("actions/trigger", { actionType: actionName });
}

// Dropdown Filter Functionality
function filterStations() {
  const val = document.getElementById("statusFilter").value;
  const cards = document.querySelectorAll(".station-card");
  cards.forEach((card) => {
    if (val === "all" || card.dataset.status === val) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

// View Alerts Action
function filterAlertsOnly() {
  document.getElementById("statusFilter").value = "warning";
  filterStations();
  showToast("Filtered view to stations with Active Alerts");
}

// Append Activity Log Item
function addActivityLog(text, time) {
  const log = document.getElementById("activityLog");
  const item = document.createElement("div");
  item.className = "list-item";
  item.innerHTML = `<span>${text}</span><span style="color: var(--text-muted);">${time}</span>`;
  log.insertBefore(item, log.firstChild);
}

// Submit Form: Add New Station Card
async function submitNewStation() {
  const name = document.getElementById("stationName").value;
  const coords = document.getElementById("stationCoords").value;

  if (!name || !coords) {
    showToast("Error: Please fill in all fields");
    return;
  }

  const payload = { name, coords, status: "operational" };
  await sendApiRequest("stations", payload);

  const container = document.getElementById("stationsContainer");
  const card = document.createElement("div");
  card.className = "station-card";
  card.dataset.status = "operational";
  card.innerHTML = `
      <div class="station-image-container">
        <img src="images/bharti.jpg" alt="${name}" />
        <span class="status-tag operational">Operational</span>
      </div>
      <div class="station-info">
        <h4>${name.toUpperCase()}</h4>
        <p class="coords">${coords}</p>
        <div class="metrics-summary">
          <div class="metric-box"><span>Inventory</span><strong>100%</strong></div>
          <div class="metric-box"><span>Personnel</span><strong class="count-personnel">10</strong></div>
          <div class="metric-box"><span>Shipments</span><strong>0</strong></div>
        </div>
      </div>
    `;
  container.appendChild(card);
  closeModal("addStationModal");
  showToast(`New station ${name.toUpperCase()} registered successfully!`);

  const totalCount = document.querySelectorAll(".station-card").length;
  document.getElementById("stat-total").innerText =
    totalCount < 10 ? `0${totalCount}` : totalCount;
  document.getElementById("stat-op").innerText =
    totalCount < 10 ? `0${totalCount}` : totalCount;
}

// Submit Form: Assign Personnel
async function submitPersonnelAssignment() {
  const count = parseInt(document.getElementById("personnelCount").value, 10);
  const station = document.getElementById("stationSelect").value;

  await sendApiRequest("personnel/assign", { stationId: station, count });

  const cards = document.querySelectorAll(".station-card");
  cards.forEach((card) => {
    const title = card.querySelector("h4").innerText;
    if (title === station) {
      const el = card.querySelector(".count-personnel");
      const current = parseInt(el.innerText, 10);
      el.innerText = current + count;
    }
  });

  const totalEl = document.getElementById("stat-personnel");
  totalEl.innerText = parseInt(totalEl.innerText, 10) + count;

  closeModal("assignModal");
  showToast(`Assigned ${count} personnel to ${station}`);
  addActivityLog(`Deployed ${count} personnel to ${station}`, "Just now");
}

// Real-time Latency Pulse Generator
setInterval(() => {
  const latency = Math.floor(135 + Math.random() * 20);
  document.getElementById("latency-val").innerText = `${latency} ms`;
}, 3000);
