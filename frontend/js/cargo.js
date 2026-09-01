(function () {
  "use strict";

  /* ---------------- helpers ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  function toast(msg, type = "info") {
    const wrap = $("#toastWrap");
    const t = document.createElement("div");
    t.className =
      "toast " +
      (type === "success"
        ? "success"
        : type === "warn"
          ? "warn"
          : type === "err"
            ? "err"
            : "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transition = "opacity .3s";
      setTimeout(() => t.remove(), 300);
    }, 2600);
  }
  function closeAllMenus() {
    $$(".action-menu.show").forEach((m) => m.classList.remove("show"));
  }

  /* ================================================================
     BACKEND INTEGRATION POINT
     ================================================================
     This build ships with NO mock/sample data — every field starts
     empty, zeroed, or as a placeholder ("--") so the UI accurately
     reflects "no data yet" until it's wired to a real API.

     To connect your backend:
       1. Point BACKEND.cargoEndpoint / statsEndpoint / alertsEndpoint
          at your real API routes.
       2. Implement fetchCargoData(), fetchStats(), fetchAlerts()
          below (fetch() calls are stubbed — just uncomment / adapt).
       3. Call initFromBackend() instead of the empty-state init at
          the bottom of this script once your endpoints are ready.
     Until then, the dashboard renders a clean empty state and the
     "+ New Cargo" form can be used to add rows manually at runtime.
  ================================================================ */
  const BACKEND = {
    cargoEndpoint: "/api/cargo",
    statsEndpoint: "/api/cargo/stats",
    alertsEndpoint: "/api/alerts",
  };

  // Dropdown option sets — keep these in sync with your backend's enums.
  const CATEGORIES = ["Fuel", "Food", "Equipment", "Medical", "Others"];
  const STATIONS = []; // e.g. ["Bharati","Himadri","Maitri"]
  const STATUSES = ["In Transit", "Pending", "Delivered"];
  const PRIORITIES = ["High", "Medium", "Low"];
  const UNIT_FOR = {}; // e.g. {"Fuel Drums":"Drum"}

  function pick(arr, r) {
    return arr[Math.floor(r * arr.length)];
  }

  // Empty by default — populated by fetchCargoData() when a backend is connected.
  const DATA = [];

  async function fetchCargoData() {
    try {
      // const res = await fetch(BACKEND.cargoEndpoint);
      // const json = await res.json();
      // DATA.push(...json);
      return [];
    } catch (err) {
      console.error("Failed to load cargo data:", err);
      return [];
    }
  }

  /* ---------------- state ---------------- */
  let filtered = [...DATA];
  let page = 1;
  const PAGE_SIZE = 10;
  let sortKey = null,
    sortDir = 1;
  let selectedId = DATA[0] ? DATA[0].id : null;

  const statusPillClass = {
    "In Transit": "pill-blue",
    Pending: "pill-amber",
    Delivered: "pill-green",
  };
  const priorityPillClass = {
    High: "pill-red",
    Medium: "pill-amber",
    Low: "pill-green",
  };
  const categoryIcon = {
    Fuel: "⛽",
    Food: "🍱",
    Equipment: "⚙️",
    Medical: "🩹",
    Others: "📦",
  };

  /* ---------------- stat cards ---------------- */
  function renderStats() {
    const total = DATA.length;
    const inTransit = DATA.filter((d) => d.status === "In Transit").length;
    const pending = DATA.filter((d) => d.status === "Pending").length;
    const delivered = DATA.filter((d) => d.status === "Delivered").length;
    const totalWeight = DATA.reduce((s, d) => s + (d.weight || 0), 0);
    const pct = (n) =>
      total > 0 ? ((n / total) * 100).toFixed(1) + "%" : "--";
    const cards = [
      {
        label: "TOTAL CARGO",
        value: total,
        foot: "All time",
        icon: "box",
        color: "blue",
      },
      {
        label: "IN TRANSIT",
        value: inTransit,
        foot: pct(inTransit),
        icon: "truck",
        color: "green",
      },
      {
        label: "PENDING",
        value: pending,
        foot: pct(pending),
        icon: "clock",
        color: "amber",
      },
      {
        label: "DELIVERED",
        value: delivered,
        foot: pct(delivered),
        icon: "check",
        color: "teal",
      },
      {
        label: "TOTAL WEIGHT",
        value:
          total > 0 ? totalWeight.toLocaleString("en-IN") + " kg" : "-- kg",
        foot: "Across all cargo",
        icon: "weight",
        color: "blue2",
      },
    ];

    const icons = {
      box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
      truck:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 16V6a1 1 0 0 1 1-1h9v11"/><path d="M13 9h4l3 3v4h-7z"/><circle cx="7.5" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/></svg>',
      clock:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
      check:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 13 5 5L20 7"/></svg>',
      weight:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 7h11l2 13H4.5Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
      rupee:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10M7 9h10M7 4c4 0 6 2 6 4.5S11 13 7 13h0l7 7"/></svg>',
    };
    const colorMap = {
      blue: ["var(--blue)", "var(--blue-bg)"],
      green: ["var(--green)", "var(--green-bg)"],
      amber: ["var(--amber)", "var(--amber-bg)"],
      teal: ["var(--teal)", "var(--teal-bg)"],
      blue2: ["var(--blue)", "var(--blue-bg)"],
      purple: ["var(--purple)", "var(--purple-bg)"],
    };

    $("#statsRow").innerHTML = cards
      .map((c, i) => {
        const [fg, bg] = colorMap[c.color];
        const iconKey = ["box", "truck", "clock", "check", "weight"][i];
        return `<div class="stat-card" data-stat="${c.label}">
        <div class="stat-icon" style="background:${bg}; color:${fg}">${icons[iconKey]}</div>
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.value}</div>
        <div class="stat-foot">${c.foot}</div>
      </div>`;
      })
      .join("");
    $$(".stat-card").forEach((card) =>
      card.addEventListener("click", () =>
        toast("Filtering by " + card.dataset.stat.toLowerCase() + "…"),
      ),
    );
  }

  /* ---------------- filters ---------------- */
  function fillSelect(id, label, options) {
    const el = $(id);
    el.innerHTML =
      `<option value="">${label}</option>` +
      options.map((o) => `<option value="${o}">${o}</option>`).join("");
  }
  fillSelect("#filterCategory", "All Categories", CATEGORIES);
  fillSelect("#filterStation", "All Stations", STATIONS);
  fillSelect("#filterStatus", "All Status", STATUSES);
  fillSelect("#filterPriority", "All Priority", PRIORITIES);

  function applyFilters() {
    const q = ($("#tableSearch").value || $("#topSearch").value || "")
      .toLowerCase()
      .trim();
    const cat = $("#filterCategory").value,
      st = $("#filterStation").value,
      status = $("#filterStatus").value,
      pr = $("#filterPriority").value;
    filtered = DATA.filter((d) => {
      if (
        q &&
        !(
          d.id.toLowerCase().includes(q) ||
          d.item.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q)
        )
      )
        return false;
      if (cat && d.category !== cat) return false;
      if (st && d.origin !== st && d.destination !== st) return false;
      if (status && d.status !== status) return false;
      if (pr && d.priority !== pr) return false;
      return true;
    });
    if (sortKey) {
      filtered.sort((a, b) => {
        let av = a[sortKey],
          bv = b[sortKey];
        if (sortKey === "priority") {
          const order = { High: 0, Medium: 1, Low: 2 };
          av = order[av];
          bv = order[bv];
        }
        return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
      });
    }
    page = 1;
    renderTable();
  }

  /* ---------------- table ---------------- */
  function renderTable() {
    const start = (page - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);
    $("#tableBody").innerHTML =
      rows
        .map(
          (d) => `
      <tr data-id="${d.id}" class="${d.id === selectedId ? "selected" : ""}">
        <td class="cell-id">${d.id}</td>
        <td>${d.item}</td>
        <td>${d.category}</td>
        <td>${d.origin}</td>
        <td>${d.destination}</td>
        <td>${d.qty}</td>
        <td>${d.unit}</td>
        <td>${d.weight.toLocaleString("en-IN")} kg</td>
        <td><span class="pill ${statusPillClass[d.status]}">${d.status}</span></td>
        <td>${d.eta}</td>
        <td><span class="pill ${priorityPillClass[d.priority]}">${d.priority}</span></td>
        <td class="row-actions">
          <button class="dots-btn" data-menu="${d.id}">⋯</button>
          <div class="action-menu" data-menufor="${d.id}">
            <button data-act="view">View Details</button>
            <button data-act="edit">Edit Cargo</button>
            <button data-act="track">Track Shipment</button>
            <button class="danger" data-act="delete">Delete</button>
          </div>
        </td>
      </tr>`,
        )
        .join("") ||
      `<tr><td colspan="12" style="text-align:center; color:var(--text-faint); padding:26px;">${DATA.length === 0 ? 'No cargo data available yet. Connect your backend, or use "New Cargo" to add records.' : "No cargo matches your filters."}</td></tr>`;

    const totalCount = filtered.length;
    const shownFrom = totalCount === 0 ? 0 : start + 1;
    const shownTo = Math.min(start + PAGE_SIZE, totalCount);
    $("#tableFootText").textContent =
      `Showing ${shownFrom} to ${shownTo} of ${totalCount} entries`;
    renderPagination();
    bindRowEvents();
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    let html = `<button class="page-btn" id="prevPage" ${page === 1 ? "disabled" : ""}>‹</button>`;
    const pagesToShow = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= 1)
        pagesToShow.push(p);
    }
    let last = 0;
    pagesToShow.forEach((p) => {
      if (last && p - last > 1) html += `<span class="page-dots">…</span>`;
      html += `<button class="page-btn ${p === page ? "active" : ""}" data-page="${p}">${p}</button>`;
      last = p;
    });
    html += `<button class="page-btn" id="nextPage" ${page === totalPages ? "disabled" : ""}>›</button>`;
    $("#pagination").innerHTML = html;
    $$(".page-btn[data-page]").forEach((b) =>
      b.addEventListener("click", () => {
        page = parseInt(b.dataset.page);
        renderTable();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }),
    );
    const prev = $("#prevPage"),
      next = $("#nextPage");
    if (prev)
      prev.addEventListener("click", () => {
        if (page > 1) {
          page--;
          renderTable();
        }
      });
    if (next)
      next.addEventListener("click", () => {
        if (page < totalPages) {
          page++;
          renderTable();
        }
      });
  }

  function bindRowEvents() {
    $$("#tableBody tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".row-actions")) return;
        selectedId = tr.dataset.id;
        renderTable();
        renderCargoDetails();
      });
    });
    $$(".dots-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = $(`.action-menu[data-menufor="${btn.dataset.menu}"]`);
        const isOpen = menu.classList.contains("show");
        closeAllMenus();
        if (!isOpen) menu.classList.add("show");
      });
    });
    $$(".action-menu button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.closest(".action-menu").dataset.menufor;
        closeAllMenus();
        handleRowAction(btn.dataset.act, id);
      });
    });
  }

  function handleRowAction(act, id) {
    const row = DATA.find((d) => d.id === id);
    if (!row) return;
    if (act === "view") {
      selectedId = id;
      renderTable();
      renderCargoDetails();
      toast("Viewing " + id);
    } else if (act === "track") {
      selectedId = id;
      renderCargoDetails();
      toast("Tracking " + id + " — " + row.status);
    } else if (act === "edit") {
      openCargoModal(row);
    } else if (act === "delete") {
      if (confirm("Delete cargo " + id + "? This cannot be undone.")) {
        const idx = DATA.findIndex((d) => d.id === id);
        DATA.splice(idx, 1);
        if (selectedId === id) selectedId = DATA[0]?.id;
        applyFilters();
        renderStats();
        renderCargoDetails();
        toast(id + " deleted.", "warn");
      }
    }
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".row-actions")) closeAllMenus();
  });

  /* header sort */
  $$("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = 1;
      }
      $$("th.sortable .sort-arrow").forEach((a) => (a.textContent = "▾"));
      th.querySelector(".sort-arrow").textContent = sortDir === 1 ? "▾" : "▴";
      applyFilters();
    });
  });

  /* ---------------- cargo details / progress ---------------- */
  function renderCargoDetails() {
    const d = DATA.find((x) => x.id === selectedId) || DATA[0];
    if (!d) {
      $("#cargoDetailsPanel").innerHTML = `
        <div class="panel-title-row"><div class="panel-title">Cargo Details</div></div>
        <div style="text-align:center; padding:26px 6px; color:var(--text-faint); font-size:12.5px;">
          No cargo selected.<br>Select a row from the table, or add one via "New Cargo".
        </div>`;
      $("#progressTrack").innerHTML =
        `<div style="text-align:center; padding:10px 0; color:var(--text-faint); font-size:12.5px;">No shipment progress to show.</div>`;
      return;
    }
    $("#cargoDetailsPanel").innerHTML = `
      <div class="panel-title-row">
        <div class="panel-title">Cargo Details</div>
        <span class="pill ${statusPillClass[d.status]}">${d.status}</span>
      </div>
      <div class="cargo-detail-head">
        <div class="cargo-detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></div>
        <div><div class="cargo-detail-id">${d.id}</div><div class="cargo-detail-item">${d.item}</div></div>
      </div>
      <div class="detail-rows">
        <div class="detail-row"><span>Category</span><span>${d.category}</span></div>
        <div class="detail-row"><span>Quantity</span><span>${d.qty} ${d.unit}${d.qty > 1 ? "s" : ""}</span></div>
        <div class="detail-row"><span>Weight</span><span>${d.weight.toLocaleString("en-IN")} kg</span></div>
        <div class="detail-row"><span>Volume</span><span>${(d.weight / 430).toFixed(1)} m³</span></div>
        <div class="detail-row"><span>Origin</span><span>${d.origin} Station</span></div>
        <div class="detail-row"><span>Destination</span><span>${d.destination} Station</span></div>
        <div class="detail-row"><span>Dispatched</span><span>28 May 2025, 09:30 AM</span></div>
        <div class="detail-row"><span>ETA</span><span>${d.eta}, 10:00 AM</span></div>
        <div class="detail-row"><span>Priority</span><span><span class="pill ${priorityPillClass[d.priority]}">${d.priority}</span></span></div>
      </div>`;

    const steps = [
      {
        t: "28 May, 08:30 AM",
        l: "Loaded at " + d.origin + " Station",
        state: "done",
      },
      {
        t: "28 May, 11:15 AM",
        l: "Departed " + d.origin + " Station",
        state: "done",
      },
      {
        t: "29 May, 02:40 PM",
        l: "Arrived at Intermediate Camp",
        state: d.status === "Pending" ? "pending" : "done",
      },
      {
        t: "30 May, 07:10 AM",
        l: "In transit to " + d.destination,
        state:
          d.status === "In Transit"
            ? "current"
            : d.status === "Delivered"
              ? "done"
              : "pending",
      },
      {
        t: d.eta + ", 10:00 AM",
        l:
          d.status === "Delivered"
            ? "Delivered at " + d.destination + " Station"
            : "Expected at " + d.destination,
        state: d.status === "Delivered" ? "done" : "pending",
      },
    ];
    $("#progressTrack").innerHTML =
      `<div class="progress-line"></div>` +
      steps
        .map(
          (s) => `
      <div class="progress-item ${s.state}">
        <div class="progress-dot">${s.state === "done" ? '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#06120a" stroke-width="4"><path d="m4 13 5 5L20 7"/></svg>' : ""}</div>
        <div class="progress-time">${s.t}</div>
        <div class="progress-label">${s.l}</div>
      </div>`,
        )
        .join("");
  }

  /* ---------------- line chart ---------------- */
  // Populate this from your backend's time-series endpoint (e.g. cargo
  // counts per status, grouped by day/week). Left empty until connected.
  let CHART_LABELS = [];
  let CHART_SERIES = { "In Transit": [], Pending: [], Delivered: [] };

  function renderLineChart() {
    if (CHART_LABELS.length === 0) {
      $("#lineChart").innerHTML =
        `<text x="280" y="100" font-size="12" fill="#586074" text-anchor="middle">No trend data available yet</text>`;
      return;
    }
    const labels = CHART_LABELS;
    const series = CHART_SERIES;
    const colors = {
      "In Transit": "#3b82f6",
      Pending: "#f5a524",
      Delivered: "#22c55e",
    };
    const W = 560,
      H = 190,
      padL = 30,
      padB = 24,
      padT = 10;
    const maxY = 100;
    const xFor = (i) => padL + (i / (labels.length - 1)) * (W - padL - 10);
    const yFor = (v) => padT + (1 - v / maxY) * (H - padT - padB);
    let svg = `<g>`;
    // gridlines
    [0, 25, 50, 75, 100].forEach((v) => {
      svg += `<line x1="${padL}" y1="${yFor(v)}" x2="${W - 6}" y2="${yFor(v)}" stroke="#1e2635" stroke-width="1"/>`;
      svg += `<text x="0" y="${yFor(v) + 4}" font-size="10" fill="#586074">${v}</text>`;
    });
    labels.forEach((l, i) => {
      svg += `<text x="${xFor(i)}" y="${H + 4}" font-size="10" fill="#586074" text-anchor="middle">${l}</text>`;
    });

    // area + line per series (drawn in reverse so first legend item sits on top visually similar to image ordering: In Transit, Pending, Delivered)
    Object.keys(series).forEach((key) => {
      const pts = series[key].map((v, i) => [xFor(i), yFor(v)]);
      const path = "M" + pts.map((p) => p.join(",")).join(" L");
      const areaPath =
        path +
        ` L${xFor(labels.length - 1)},${H - padB} L${xFor(0)},${H - padB} Z`;
      svg += `<path d="${areaPath}" fill="${colors[key]}" opacity="0.08"></path>`;
      svg += `<path d="${path}" fill="none" stroke="${colors[key]}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"></path>`;
      pts.forEach((p) => {
        svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${colors[key]}"></circle>`;
      });
    });
    svg += `</g>`;
    $("#lineChart").innerHTML = svg;
  }

  /* ---------------- donut ---------------- */
  // Category color map — values are computed live from DATA, not hardcoded.
  const DONUT_COLORS = {
    Fuel: "#3b82f6",
    Food: "#22c55e",
    Equipment: "#f5a524",
    Medical: "#a855f7",
    Others: "#8892a4",
  };
  function computeDonut() {
    const total = DATA.length;
    return CATEGORIES.map((name) => {
      const val = DATA.filter((d) => d.category === name).length;
      const pct = total > 0 ? (val / total) * 100 : 0;
      return { name, val, pct, color: DONUT_COLORS[name] || "#8892a4" };
    });
  }
  function renderDonut(highlight = null) {
    const donutData = computeDonut();
    const total = DATA.length;
    $(".donut-total").textContent = total > 0 ? total : "--";
    if (total === 0) {
      $("#donutBg").style.background = "#171f2c";
      $("#donutLegend").innerHTML = donutData
        .map(
          (d) => `
        <div class="donut-legend-row dim" data-cat="${d.name}">
          <span class="legend-dot" style="background:${d.color}"></span>
          <span class="name">${d.name}</span>
          <span class="val">--</span>
        </div>`,
        )
        .join("");
      return;
    }
    let acc = 0;
    const stops = donutData
      .map((d) => {
        const from = acc,
          to = acc + d.pct;
        acc = to;
        const dim = highlight && highlight !== d.name;
        return `${dim ? "#232c3d" : d.color} ${from}% ${to}%`;
      })
      .join(", ");
    $("#donutBg").style.background = `conic-gradient(${stops})`;
    $("#donutLegend").innerHTML = donutData
      .map(
        (d) => `
      <div class="donut-legend-row ${highlight && highlight !== d.name ? "dim" : ""}" data-cat="${d.name}">
        <span class="legend-dot" style="background:${d.color}"></span>
        <span class="name">${d.name}</span>
        <span class="val">${d.val} (${d.pct.toFixed(1)}%)</span>
      </div>`,
      )
      .join("");
    $$(".donut-legend-row").forEach((row) => {
      row.addEventListener("click", () => {
        const cat = row.dataset.cat;
        if (highlight === cat) {
          renderDonut(null);
          $("#filterCategory").value = "";
        } else {
          renderDonut(cat);
          $("#filterCategory").value = cat;
        }
        applyFilters();
      });
    });
  }

  /* ---------------- alerts ---------------- */
  // Populate from BACKEND.alertsEndpoint. Empty until connected.
  let ALERTS = [];
  function renderAlerts() {
    if (ALERTS.length === 0) {
      $("#alertsList").innerHTML =
        `<div style="text-align:center; color:var(--text-faint); padding:18px 0; font-size:12.5px;">No new alerts.</div>`;
      return;
    }
    $("#alertsList").innerHTML = ALERTS.map(
      (a, i) => `
      <div class="alert-item" data-idx="${i}">
        <div class="alert-ic" style="background:var(--${a.color}-bg); color:var(--${a.color});">${a.icon}</div>
        <div><div class="alert-title">${a.title}</div><div class="alert-sub">${a.sub}</div></div>
        <div class="alert-time">${a.time}</div>
      </div>`,
    ).join("");
    $$(".alert-item").forEach((el) =>
      el.addEventListener("click", () => {
        const i = parseInt(el.dataset.idx);
        toast("Dismissed: " + ALERTS[i].title);
        ALERTS.splice(i, 1);
        renderAlerts();
        updateBellBadge();
      }),
    );
  }
  function updateBellBadge() {
    $("#bellBadge").textContent = ALERTS.length;
    $("#bellBadge").style.display = ALERTS.length ? "flex" : "none";
  }

  /* bell dropdown */
  $("#bellBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = $("#notifPanel");
    $("#notifList").innerHTML = ALERTS.length
      ? ALERTS.map(
          (a) =>
            `<div class="notif-item"><span>${a.icon}</span><div><b style="display:block; font-size:12px;">${a.title}</b><span style="color:var(--text-faint); font-size:11.5px;">${a.sub} · ${a.time}</span></div></div>`,
        ).join("")
      : `<div class="notif-item">All caught up 🎉</div>`;
    panel.classList.toggle("show");
  });
  $("#notifClear").addEventListener("click", (e) => {
    e.stopPropagation();
    ALERTS = [];
    renderAlerts();
    updateBellBadge();
    $("#notifPanel").classList.remove("show");
    toast("Notifications cleared.");
  });
  document.addEventListener("click", () => {
    $("#notifPanel").classList.remove("show");
  });

  /* ---------------- top-level UI wiring ---------------- */
  $("#tableSearch").addEventListener("input", applyFilters);
  $("#topSearch").addEventListener("input", () => {
    $("#tableSearch").value = $("#topSearch").value;
    applyFilters();
  });
  [
    "#filterCategory",
    "#filterStation",
    "#filterStatus",
    "#filterPriority",
  ].forEach((sel) => $(sel).addEventListener("change", applyFilters));
  $("#filterMoreBtn").addEventListener("click", () =>
    toast("Additional filters: date range, weight range, value range."),
  );
  $("#monthSelect").addEventListener("change", (e) =>
    toast("Showing overview for: " + e.target.value),
  );

  $("#exportBtn").addEventListener("click", () => {
    const rows = [
      [
        "Cargo ID",
        "Item",
        "Category",
        "Origin",
        "Destination",
        "Qty",
        "Unit",
        "Weight (kg)",
        "Status",
        "ETA",
        "Priority",
      ],
    ];
    filtered.forEach((d) =>
      rows.push([
        d.id,
        d.item,
        d.category,
        d.origin,
        d.destination,
        d.qty,
        d.unit,
        d.weight,
        d.status,
        d.eta,
        d.priority,
      ]),
    );
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "polarlog_cargo_export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported " + filtered.length + " cargo records to CSV.", "success");
  });

  /* ---------------- modal: new / edit cargo ---------------- */
  function openCargoModal(existing) {
    const isEdit = !!existing;
    $("#modalBox").innerHTML = `
      <h3>${isEdit ? "Edit Cargo " + existing.id : "New Cargo Entry"}</h3>
      <p class="sub">${isEdit ? "Update the shipment details below." : "Fill in the details to register a new cargo shipment."}</p>
      <div class="form-row"><label>Item Name</label><input id="fItem" value="${isEdit ? existing.item : ""}" placeholder="e.g. Fuel Drums"></div>
      <div class="form-grid2">
        <div class="form-row"><label>Category</label>
          <select id="fCategory">${CATEGORIES.map((c) => `<option ${isEdit && existing.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
        </div>
        <div class="form-row"><label>Priority</label>
          <select id="fPriority">${PRIORITIES.map((p) => `<option ${isEdit && existing.priority === p ? "selected" : ""}>${p}</option>`).join("")}</select>
        </div>
      </div>
      <div class="form-grid2">
        <div class="form-row"><label>Origin Station</label>
          ${
            STATIONS.length
              ? `<select id="fOrigin">${STATIONS.map((s) => `<option ${isEdit && existing.origin === s ? "selected" : ""}>${s}</option>`).join("")}</select>`
              : `<input id="fOrigin" value="${isEdit ? existing.origin || "" : ""}" placeholder="e.g. Bharati">`
          }
        </div>
        <div class="form-row"><label>Destination Station</label>
          ${
            STATIONS.length
              ? `<select id="fDestination">${STATIONS.map((s) => `<option ${isEdit && existing.destination === s ? "selected" : ""}>${s}</option>`).join("")}</select>`
              : `<input id="fDestination" value="${isEdit ? existing.destination || "" : ""}" placeholder="e.g. Himadri">`
          }
        </div>
      </div>
      <div class="form-grid2">
        <div class="form-row"><label>Quantity</label><input id="fQty" type="number" min="1" value="${isEdit ? existing.qty : 1}"></div>
        <div class="form-row"><label>Weight (kg)</label><input id="fWeight" type="number" min="1" value="${isEdit ? existing.weight : 100}"></div>
      </div>
      <div class="form-row"><label>Status</label>
        <select id="fStatus">${STATUSES.map((s) => `<option ${isEdit && existing.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      </div>
      <div class="modal-actions">
        <button class="btn" id="modalCancel">Cancel</button>
        <button class="btn btn-primary" id="modalSave">${isEdit ? "Save Changes" : "Create Cargo"}</button>
      </div>`;
    $("#overlay").classList.add("show");
    $("#modalCancel").addEventListener("click", closeModal);
    $("#modalSave").addEventListener("click", () => {
      const item = $("#fItem").value.trim() || "Untitled Cargo";
      const category = $("#fCategory").value,
        priority = $("#fPriority").value,
        origin = $("#fOrigin").value;
      let destination = $("#fDestination").value;
      if (destination === origin)
        toast("Note: origin and destination are the same.", "warn");
      const qty = Math.max(1, parseInt($("#fQty").value) || 1);
      const weight = Math.max(1, parseInt($("#fWeight").value) || 1);
      const status = $("#fStatus").value;
      const unit = UNIT_FOR[item] || "Unit";
      const eta = "10 Jun 2025";
      if (isEdit) {
        Object.assign(existing, {
          item,
          category,
          priority,
          origin,
          destination,
          qty,
          weight,
          status,
          unit,
        });
        toast(existing.id + " updated.", "success");
      } else {
        const newId = "CRG-" + (1024 + DATA.length);
        DATA.unshift({
          id: newId,
          item,
          category,
          origin,
          destination,
          qty,
          unit,
          weight,
          status,
          eta,
          priority,
        });
        selectedId = newId;
        toast(newId + " created.", "success");
        renderCargoDetails();
      }
      closeModal();
      renderStats();
      applyFilters();
    });
  }
  function closeModal() {
    $("#overlay").classList.remove("show");
  }
  $("#overlay").addEventListener("click", (e) => {
    if (e.target.id === "overlay") closeModal();
  });
  $("#newCargoBtn").addEventListener("click", () => openCargoModal(null));

  /* ---------------- quick actions / misc buttons ---------------- */
  $("#updateStatusBtn").addEventListener("click", () => {
    const d = DATA.find((x) => x.id === selectedId);
    if (!d) return;
    const order = ["Pending", "In Transit", "Delivered"];
    const next = order[(order.indexOf(d.status) + 1) % order.length];
    d.status = next;
    renderCargoDetails();
    applyFilters();
    renderStats();
    toast(d.id + " status updated to " + next + ".", "success");
  });
  $("#reportIssueBtn").addEventListener("click", () => {
    const d = DATA.find((x) => x.id === selectedId);
    toast(
      "Issue reported for " + (d ? d.id : "cargo") + ". Ops team notified.",
      "warn",
    );
  });
  $$("[data-toast]").forEach((el) =>
    el.addEventListener("click", () => toast(el.dataset.toast)),
  );
  $$("[data-toast-success]").forEach((el) =>
    el.addEventListener("click", () =>
      toast(el.dataset.toastSuccess, "success"),
    ),
  );

  /* Sidebar nav, submenu toggles, and the profile/user menu now live in
     the shared sidebar and are handled by pl-sidebar.js (see
     ../js/pl-sidebar.js), so that logic no longer lives here. */

  /* theme toggle */
  $("#themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("light");
    toast(
      document.body.classList.contains("light")
        ? "Switched to light mode."
        : "Switched to dark mode.",
    );
  });

  /* Sync status, SATCOM state, and the "last synced" text are left as
     placeholders ("--" / "Not yet synced") — wire these up to your
     backend's connection/health check once available. */

  /* ---------------- init ---------------- */
  function renderAll() {
    renderStats();
    applyFilters();
    renderCargoDetails();
    renderLineChart();
    renderDonut();
    renderAlerts();
    updateBellBadge();
  }

  // Uncomment once BACKEND endpoints are live — this fetches real data,
  // then re-renders every widget with it instead of the empty state.
  //
  // async function initFromBackend(){
  //   const rows = await fetchCargoData();
  //   DATA.push(...rows);
  //   selectedId = DATA[0] ? DATA[0].id : null;
  //   $("#satcomState").textContent = "Connected";
  //   $("#satcomDot").style.background = "var(--green)";
  //   $("#liveText").textContent = "ONLINE";
  //   $("#syncText").textContent = "Last synced: just now";
  //   renderAll();
  // }
  // initFromBackend();

  renderAll();
})();
