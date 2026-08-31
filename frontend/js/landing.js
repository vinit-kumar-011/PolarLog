// Nav scroll + active state
document.querySelectorAll(".navlinks a").forEach((link) => {
  link.addEventListener("click", () => {
    document
      .querySelectorAll(".navlinks a")
      .forEach((a) => a.classList.remove("active"));
    link.classList.add("active");
    const target = document.querySelector(link.dataset.target);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// Station marker toggle panels
const panels = {
  bharati: "bharatiPanel",
  maitri: "maitriPanel",
  himadri: "himadriPanel",
};
function closeAllPanels() {
  Object.values(panels).forEach((id) =>
    document.getElementById(id).classList.remove("show"),
  );
}
document.querySelectorAll(".station-dot, .station-label").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const key = el.dataset.key;
    const panelId = panels[key];
    const panel = document.getElementById(panelId);
    const wasOpen = panel.classList.contains("show");
    closeAllPanels();
    if (!wasOpen) panel.classList.add("show");
  });
});
document.addEventListener("click", closeAllPanels);

// Stat count-up animation
function animateCounts() {
  document.querySelectorAll(".num").forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    let cur = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const iv = setInterval(() => {
      cur += step;
      if (cur >= target) {
        cur = target;
        clearInterval(iv);
      }
      el.textContent = cur;
    }, 25);
  });
}
const statsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounts();
        statsObserver.disconnect();
      }
    });
  },
  { threshold: 0.4 },
);
statsObserver.observe(document.getElementById("statsBar"));

// Feature card click -> shows detail in modal-lite via alert-style panel
document.querySelectorAll(".fcard").forEach((card) => {
  card.addEventListener("click", () => {
    document.getElementById("modalTitle").textContent =
      card.querySelector("h3").textContent;
    document.getElementById("modalSub").textContent = card.dataset.info;
    document.getElementById("userField").style.display = "none";
    document.querySelector(".modal input[type=password]").style.display =
      "none";
    document.getElementById("modalGo").textContent = "Close";
    document.getElementById("modalBg").classList.add("show");
  });
});

// Enter PolarLog button -> scroll to stats bar
document.getElementById("enterBtn").addEventListener("click", () => {
  document
    .getElementById("statsBar")
    .scrollIntoView({ behavior: "smooth", block: "center" });
});

// Sign in modal
function openSignIn() {
  document.getElementById("modalTitle").textContent = "Sign in to PolarLog";
  document.getElementById("modalSub").textContent =
    "Access cargo, inventory and shipment data for your station.";
  document.getElementById("userField").style.display = "block";
  document.querySelector(".modal input[type=password]").style.display = "block";
  document.getElementById("modalGo").textContent = "Continue";
  document.getElementById("modalBg").classList.add("show");
}
document.getElementById("signinBtn").addEventListener("click", openSignIn);
document.getElementById("previewSignIn").addEventListener("click", openSignIn);

// Dashboard preview: tabs + sidebar both drive the same "active view" state
const ledgerData = {
  cargo: [
    [
      "Diesel fuel drums",
      "Manifest #PL-2291",
      "Maitri",
      "1,200 kg",
      "Mar 14",
      "transit",
      "In Transit",
    ],
    [
      "Spectrometer unit",
      "Manifest #PL-2288",
      "Bharati",
      "84 kg",
      "—",
      "critical",
      "Critical",
    ],
    [
      "Ration pallets (Q1)",
      "Manifest #PL-2277",
      "Himadri",
      "3,050 kg",
      "Feb 28",
      "delivered",
      "Delivered",
    ],
    [
      "Snowcat spare parts",
      "Manifest #PL-2299",
      "Maitri",
      "310 kg",
      "Mar 20",
      "transit",
      "In Transit",
    ],
    [
      "Medical resupply kit",
      "Manifest #PL-2301",
      "Bharati",
      "46 kg",
      "Mar 12",
      "critical",
      "Critical",
    ],
  ],
  alerts: [
    [
      "Low fuel reserve",
      "Threshold breach",
      "Maitri",
      "—",
      "Now",
      "critical",
      "Critical",
    ],
    [
      "Cargo hold sensor offline",
      "Equipment fault",
      "Bharati",
      "—",
      "2h ago",
      "critical",
      "Critical",
    ],
    [
      "Shipment delayed 3 days",
      "Weather hold",
      "Himadri",
      "—",
      "Today",
      "transit",
      "In Transit",
    ],
    [
      "Ration stock below 20%",
      "Threshold breach",
      "Maitri",
      "—",
      "Yesterday",
      "transit",
      "In Transit",
    ],
    [
      "Generator maintenance due",
      "Scheduled",
      "Bharati",
      "—",
      "Resolved",
      "delivered",
      "Delivered",
    ],
  ],
  personnel: [
    [
      "Dr. A. Rao — Glaciologist",
      "On station",
      "Bharati",
      "—",
      "—",
      "delivered",
      "Deployed",
    ],
    [
      "Cdr. S. Iyer — Logistics",
      "Rotation due",
      "Maitri",
      "—",
      "Apr 02",
      "transit",
      "Rotating Out",
    ],
    [
      "R. Thomas — Medic",
      "On station",
      "Himadri",
      "—",
      "—",
      "delivered",
      "Deployed",
    ],
    [
      "Team Alpha (6)",
      "Resupply crew",
      "Maitri",
      "—",
      "Mar 18",
      "transit",
      "Incoming",
    ],
    [
      "P. Nair — Comms",
      "On station",
      "Bharati",
      "—",
      "—",
      "delivered",
      "Deployed",
    ],
  ],
};
function renderLedger(key) {
  const rows = ledgerData[key] || ledgerData.cargo;
  const table = document.getElementById("ledgerTable");
  const head = table.querySelector(".ledger-head");
  table.innerHTML = "";
  table.appendChild(head);
  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "ledger-row";
    row.innerHTML = `<div class="item"><b>${r[0]}</b><span>${r[1]}</span></div><span>${r[2]}</span><span>${r[3]}</span><span>${r[4]}</span><span class="stamp ${r[5]}">${r[6]}</span>`;
    table.appendChild(row);
  });
}
function setActiveView(key) {
  document
    .querySelectorAll(".ptab")
    .forEach((t) => t.classList.toggle("active", t.dataset.view === key));
  document
    .querySelectorAll(".dnav")
    .forEach((n) => n.classList.toggle("active", n.dataset.nav === key));
  renderLedger(ledgerData[key] ? key : "cargo");
}
document.querySelectorAll(".ptab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveView(tab.dataset.view));
});
document.querySelectorAll(".dnav").forEach((nav) => {
  nav.addEventListener("click", () => {
    const key = nav.dataset.nav;
    setActiveView(ledgerData[key] ? key : "cargo");
  });
});
setActiveView("cargo");
document
  .getElementById("modalClose")
  .addEventListener("click", () =>
    document.getElementById("modalBg").classList.remove("show"),
  );
document
  .getElementById("modalGo")
  .addEventListener("click", () =>
    document.getElementById("modalBg").classList.remove("show"),
  );
document.getElementById("modalBg").addEventListener("click", (e) => {
  if (e.target.id === "modalBg")
    document.getElementById("modalBg").classList.remove("show");
});
