/* =========================================================
   POLARLOG — DASHBOARD DATA (KPIs, donut, shipments chart, health bars)
   =========================================================
   ASSUMPTIONS FLAGGED FOR THE TEAM — verify once each endpoint is live:
     - /api/cargo        confirmed shape (from cargo.py): status field
       values are pending/in_transit/delivered.
     - /api/inventory    assumed fields: category, quantity, reorder_level
       (per the integration doc's own example JS — inventory.py wasn't
       shared with me, so this is unverified).
     - /api/shipments    assumed a `status` field with the same
       pending/in_transit/delivered values. NOT LIVE YET per the doc
       ("critical path" — Prateek's endpoint). This file fails soft:
       if the fetch 404s/errors, the chart/KPI/table stay at their
       existing "—" / "Chart data pending" placeholders instead of
       throwing.
     - /api/stations     assumed a plain array (for the station count
       and coordinates) — shape otherwise unverified.
     - /api/alerts       assumed a plain array, used for the Alerts KPI.
   ========================================================= */
(function () {
  "use strict";

  const API_BASE = "http://localhost:5000/api";

  async function safeFetch(path) {
    try {
      const res = await fetch(API_BASE + path);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      console.warn("dashboard-data: could not load " + path, err);
      return null; // caller treats null as "endpoint not ready yet"
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ---------------- KPIs ---------------- */
  function renderKPIs({ cargo, inventory, shipments, stations, alerts }) {
    if (stations) setText("kpiTotalStations", stations.length);
    if (cargo) {
      const active = cargo.filter(
        (c) => c.status === "pending" || c.status === "in_transit",
      ).length;
      setText("kpiActiveCargo", active);
    }
    if (alerts) setText("kpiAlerts", alerts.length);
    if (inventory && inventory.length) {
      const avg =
        inventory.reduce(
          (sum, item) =>
            sum +
            Math.min(
              100,
              Math.round((item.quantity / (item.reorder_level || 1)) * 100),
            ),
          0,
        ) / inventory.length;
      setText("kpiInventoryHealth", Math.round(avg) + "%");
    }
    // TOTAL PERSONNEL has no confirmed endpoint/field shared with me —
    // left as "—" until /api/personnel (or equivalent) is confirmed.
    if (shipments) {
      const active = shipments.filter((s) => s.status !== "delivered").length;
      setText("kpiActiveShipments", active);
    }
  }

  /* ---------------- Inventory Distribution donut ---------------- */
  const DONUT_CATEGORIES = ["Fuel", "Food", "Medical", "Equipment", "Others"];
  const DONUT_COLORS = {
    Fuel: "var(--cyan)",
    Food: "var(--green)",
    Medical: "var(--amber)",
    Equipment: "var(--blue)",
    Others: "var(--text-faint)",
  };
  function renderDonut(inventory) {
    if (!inventory || !inventory.length) return; // leave placeholder "—%" state

    const byCategory = {};
    let total = 0;
    inventory.forEach((item) => {
      byCategory[item.category] =
        (byCategory[item.category] || 0) + item.quantity;
      total += item.quantity;
    });

    // conic-style ring built as a single stroke-dasharray/offset per segment
    // is awkward with plain SVG circles, so we redraw the ring as stacked
    // dasharray segments using the circle's circumference.
    const ring = document.getElementById("donutRing");
    const circumference = 2 * Math.PI * 40; // r=40
    let offsetAcc = 0;
    let svgSegments = "";
    DONUT_CATEGORIES.forEach((cat) => {
      const val = byCategory[cat] || 0;
      const pct = total > 0 ? val / total : 0;
      const dash = pct * circumference;
      svgSegments += `<circle cx="50" cy="50" r="40" fill="none" stroke="${DONUT_COLORS[cat]}" stroke-width="12" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offsetAcc}" transform="rotate(-90 50 50)"/>`;
      offsetAcc += dash;
    });
    if (ring) ring.insertAdjacentHTML("afterend", svgSegments);

    // Center label: share of the largest category (a reasonable single
    // headline number for a ring that otherwise has 5 legend rows).
    const topCat = DONUT_CATEGORIES.reduce(
      (best, cat) =>
        (byCategory[cat] || 0) > (byCategory[best] || 0) ? cat : best,
      DONUT_CATEGORIES[0],
    );
    const topPct =
      total > 0 ? Math.round(((byCategory[topCat] || 0) / total) * 100) : 0;
    setText("donutCenterLabel", topPct + "%");

    const legendIds = {
      Fuel: "legendValFuel",
      Food: "legendValFood",
      Medical: "legendValMedical",
      Equipment: "legendValEquipment",
      Others: "legendValOthers",
    };
    DONUT_CATEGORIES.forEach((cat) => {
      const val = byCategory[cat] || 0;
      const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
      setText(legendIds[cat], pct + "%");
    });
  }

  /* ---------------- Shipments Status bar chart ---------------- */
  function renderShipmentsChart(shipments) {
    const box = document.getElementById("shipmentsChartBox");
    if (!box) return;
    if (!shipments || !shipments.length) return; // leave "Chart data pending"

    const counts = { delivered: 0, in_transit: 0, pending: 0 };
    shipments.forEach((s) => {
      if (counts[s.status] !== undefined) counts[s.status]++;
    });
    const max = Math.max(
      1,
      counts.delivered,
      counts.in_transit,
      counts.pending,
    );
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
  function renderRecentShipments(shipments) {
    const body = document.getElementById("recentShipmentsBody");
    if (!body || !shipments || !shipments.length) return; // leave placeholder row

    const recent = [...shipments]
      .sort((a, b) => (a.eta > b.eta ? -1 : 1))
      .slice(0, 5);
    body.innerHTML = recent
      .map(
        (s) => `<tr>
          <td>${s.reference || s.shipment_id || "—"}</td>
          <td>${s.origin || "—"} → ${s.destination || "—"}</td>
          <td><span class="status-chip">${s.status || "—"}</span></td>
          <td>${s.eta || "—"}</td>
        </tr>`,
      )
      .join("");
  }

  /* ---------------- Station health bars ---------------- */
  function renderStationHealth(inventory) {
    if (!inventory || !inventory.length) return; // leave 0-width bars as-is

    const byStation = {};
    inventory.forEach((item) => {
      const station = item.station || item.station_name;
      if (!station) return;
      const health = Math.min(
        100,
        Math.round((item.quantity / (item.reorder_level || 1)) * 100),
      );
      if (!byStation[station]) byStation[station] = [];
      byStation[station].push(health);
    });

    const fillIds = {
      BHARATI: "healthFillBharati",
      MAITRI: "healthFillMaitri",
      HIMADRI: "healthFillHimadri",
    };
    Object.keys(fillIds).forEach((station) => {
      const vals = byStation[station];
      if (!vals || !vals.length) return; // no per-station data — leave as-is
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      const el = document.getElementById(fillIds[station]);
      if (el) el.style.width = avg + "%";
    });
  }

  /* ---------------- init ---------------- */
  async function init() {
    const [cargo, inventory, shipments, stations, alerts] = await Promise.all([
      safeFetch("/cargo"),
      safeFetch("/inventory"),
      safeFetch("/shipments"),
      safeFetch("/stations"),
      safeFetch("/alerts"),
    ]);

    renderKPIs({ cargo, inventory, shipments, stations, alerts });
    renderDonut(inventory);
    renderShipmentsChart(shipments); // stays "Chart data pending" until /api/shipments exists
    renderRecentShipments(shipments);
    renderStationHealth(inventory); // needs a per-item station field — see note above
  }

  init();
})();
