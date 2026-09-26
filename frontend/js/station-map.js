/* =========================================================
   POLARLOG - STATION MAP
   Leaflet + OpenStreetMap. No API key needed.

   Needs: <div id="stationMap"> on the page, leaflet.js loaded
   before this file, and config.js (for API_BASE).
========================================================= */

// One colour per region so the three areas read apart.
// These keys must match your API's region values EXACTLY -
// yours returns "Antarctica", not "Antarctic".
const REGION_COLOURS = {
  Antarctica: "#3fd4ee",
  Arctic: "#8b9dff",
  Himalayan: "#ffb454",
};

async function initStationMap() {
  const container = document.getElementById("stationMap");
  if (!container) return; // this page has no map - nothing to do

  // Start zoomed right out - the stations are on opposite
  // sides of the planet
  const map = L.map("stationMap").setView([0, 40], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  let stations;
  try {
    const res = await fetch(`${API_BASE}/api/stations`);
    stations = await res.json();
  } catch (err) {
    container.innerHTML =
      '<p style="padding:20px; color:#888">Could not load stations. Is Flask running?</p>';
    return;
  }

  const bounds = [];

  stations.forEach((station) => {
    const lat = parseFloat(station.latitude);
    const lng = parseFloat(station.longitude);

    // Skip anything without usable coordinates
    if (isNaN(lat) || isNaN(lng)) return;

    L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: REGION_COLOURS[station.region] || "#888888",
      fillOpacity: 1,
      color: "#ffffff",
      weight: 2,
    })
      .addTo(map)
      .bindPopup(
        `<strong style="font-size:14px">${station.name}</strong><br>` +
          `<span style="color:#666">${station.region || "—"}</span><br>` +
          `<span style="font-size:12px">${lat.toFixed(4)}°, ${lng.toFixed(4)}°</span>`
      );

    bounds.push([lat, lng]);
  });

  // Zoom so every station is visible at once
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStationMap);
} else {
  initStationMap();
}