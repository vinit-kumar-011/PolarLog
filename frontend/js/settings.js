/* =========================================================
   POLARLOG — SETTINGS PAGE
   Uses the shared layers, does not replace them:
     config.js        apiGet / apiSend / authHeaders / setLiveStatus
     offline-db.js    IndexedDB cache + outbox
     sync-manager.js  PolarLogSync.syncNow (outbox replay)
     theme.js         PolarLogTheme + showToast

   What is persisted where:
     name (admin)        -> server  (PUT /api/settings/account), queued offline
     name (everyone else)-> approval request to the approval service,
                            ONLINE ONLY - an admin must approve it
     notification prefs  -> server  (PUT /api/settings/preferences), queued offline
     theme               -> this device only (localStorage "theme")
     password            -> server, ONLINE ONLY (never queued)
========================================================= */
(function () {
  "use strict";

  var PATH_ACCOUNT = "/api/settings/account";
  var PATH_PREFS = "/api/settings/preferences";
  var NAME_MIN = 2;
  var NAME_MAX = 100;
  var PASSWORD_MIN = 8;
  var PASSWORD_MAX = 128;
  var USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;
  var ROLE_LABEL = {
    admin: "Admin",
    coordinator: "Coordinator",
    station_officer: "Station Officer",
    field_staff: "Field Staff",
  };
  var FIELD_LABEL = { full_name: "name", username: "username", role: "role", station_id: "station" };
  var PROFILE_INPUTS = ["fullName", "username", "role", "station"];

  /* ---- Profile-change approval service (backend team's prototype) ----
     Non-admin users can't change their name directly; the change is sent
     here for an admin to approve. Admins skip this and save directly.
     TODO: replace "PORT" with the port the approval service runs on.
     APPROVAL_PATH is a guess - confirm the real route with the backend team. */
  var APPROVAL_PORT = "PORT";
  var APPROVAL_PATH = "/api/approvals";
  function approvalBase() {
    var u = new URL(API_BASE);
    return u.protocol + "//" + u.hostname + ":" + APPROVAL_PORT;
  }
  function approvalConfigured() {
    return /^\d{2,5}$/.test(String(APPROVAL_PORT));
  }

  var $ = function (id) {
    return document.getElementById(id);
  };

  var state = {
    account: null,
    prefs: null,
    accountStale: false,
    prefsStale: false,
    staleAt: null,
    loadFailed: false,
    saving: false,
    pendingChanges: null, // fields the user has asked for that an admin hasn't approved yet
    inputBase: null, // the form values last written by code (not the user)
    connection: "checking", // checking | live | offline | unreachable | server-error
  };

  /* ---------------- helpers ---------------- */
  function toast(msg, type) {
    if (typeof window.showToast === "function") window.showToast(msg, type);
  }

  // The token payload (user id, expiry) is readable client-side. The token
  // itself is never displayed or stored anywhere by this page.
  function tokenPayload() {
    try {
      var t = getAuthToken();
      if (!t) return null;
      var b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b.length % 4) b += "=";
      return JSON.parse(atob(b));
    } catch (_) {
      return null;
    }
  }
  function currentUserId() {
    var p = tokenPayload();
    return p ? p.user_id : null;
  }

  function isAdmin() {
    return !!(state.account && state.account.role === "admin");
  }

  // Real time of the last successful (non-cached) fetch of this user's
  // settings. Kept per user, since the offline cache is shared by everyone
  // who uses this browser and gets rewritten by offline saves too.
  function fetchedKey() {
    return "polarlogSettingsFetchedAt:" + currentUserId();
  }
  function markFetched() {
    try {
      localStorage.setItem(fetchedKey(), String(Date.now()));
    } catch (_) {
      /* storage unavailable - not critical */
    }
  }
  function lastFetched() {
    return Number(localStorage.getItem(fetchedKey())) || null;
  }

  function fmtDateTime(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    } catch (_) {
      return new Date(ts).toString();
    }
  }
  function prettyRole(role) {
    if (!role) return "—";
    return String(role)
      .split("_")
      .map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(" ");
  }
  function initials(name) {
    var parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    var a = parts[0].charAt(0);
    var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
  }
  function normaliseName(v) {
    return String(v || "")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
  }
  function stripMeta(d) {
    var c = Object.assign({}, d);
    delete c.__stale;
    delete c.__cachedAt;
    return c;
  }
  function setBusy(btn, busy) {
    btn.classList.toggle("loading", busy);
    btn.disabled = busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
  }
  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  /* ---------------- loading ---------------- */
  // apiGet falls back to the IndexedDB copy for ANY failure, and that
  // cache is shared by everyone who uses this browser - so a stale copy
  // is only trusted if it belongs to the signed-in user.
  async function fetchOwn(path) {
    try {
      var d = await apiGet(path);
      if (d.__stale && d.user_id !== currentUserId()) {
        return { error: new Error("no saved copy for this account") };
      }
      if (!d.__stale) markFetched();
      return { data: stripMeta(d), stale: !!d.__stale, cachedAt: d.__cachedAt || null };
    } catch (err) {
      return { error: err };
    }
  }

  async function loadSettings() {
    var results = await Promise.all([fetchOwn(PATH_ACCOUNT), fetchOwn(PATH_PREFS)]);
    var acc = results[0];
    var pre = results[1];

    state.accountStale = !!acc.stale;
    state.prefsStale = !!pre.stale;
    var times = [acc.cachedAt, pre.cachedAt].filter(Boolean);
    state.staleAt = times.length ? Math.min.apply(null, times) : null;

    if (acc.data) state.account = acc.data;
    if (pre.data) state.prefs = pre.data;
    state.loadFailed = !state.account && !state.prefs;

    renderAll();
    renderLastRefresh();
  }

  var refreshing = null;
  function refreshAll() {
    if (refreshing) return refreshing;
    refreshing = Promise.all([loadSettings(), refreshSyncStatus()]).finally(function () {
      refreshing = null;
    });
    return refreshing;
  }

  /* ---------------- rendering: banners ---------------- */
  function renderBanners() {
    var stale = $("staleBanner");
    var err = $("loadError");

    if (state.loadFailed) {
      err.replaceChildren();
      var msg = document.createElement("span");
      msg.textContent =
        state.connection === "offline"
          ? "You’re offline and no saved copy of your settings is available on this device yet. Connect once to load them."
          : "Couldn’t load your settings. The server may be unavailable.";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn";
      retry.textContent = "Retry";
      retry.addEventListener("click", function () {
        refreshAll();
      });
      err.append(msg, retry);
      err.classList.add("show");
    } else {
      err.classList.remove("show");
    }

    if ((state.accountStale || state.prefsStale) && !state.loadFailed) {
      stale.textContent =
        "Showing a saved copy of your settings" +
        (state.staleAt ? " from " + fmtDateTime(state.staleAt) : "") +
        (isAdmin() ? ". Name and notification changes will sync when you’re back online; " : ". Notification changes will sync when you’re back online; ") +
        "name change requests and password changes need a connection.";
      stale.classList.add("show");
    } else {
      stale.classList.remove("show");
    }
  }

  /* ---------------- rendering: profile / summary ---------------- */
  var PROFILE_NOTE_BASE = "Email, phone and department are not stored by PolarLog yet.";

  function ensureOption(sel, value, label) {
    if (value === null || value === undefined || value === "") return;
    var v = String(value);
    var has = Array.prototype.some.call(sel.options, function (o) {
      return o.value === v;
    });
    if (!has) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    }
  }
  function accountValues(a) {
    return {
      full_name: normaliseName(a.full_name),
      username: a.username || "",
      role: a.role || "",
      station_id: a.station_id === null || a.station_id === undefined ? null : Number(a.station_id),
    };
  }
  function formValues() {
    var st = $("station").value;
    return {
      full_name: normaliseName($("fullName").value),
      username: $("username").value.trim(),
      role: $("role").value,
      station_id: st === "" ? null : Number(st),
    };
  }
  function sameValues(a, b) {
    return Object.keys(a).every(function (k) {
      return a[k] === b[k];
    });
  }
  // Writes values into the form and remembers them as "what code put there",
  // so a background refresh can tell whether the user is mid-edit.
  function writeForm(v) {
    $("fullName").value = v.full_name;
    $("username").value = v.username;
    $("role").value = v.role;
    $("station").value = v.station_id === null ? "" : String(v.station_id);
    state.inputBase = formValues();
  }
  function changedFields() {
    if (!state.account) return {};
    var now = formValues();
    var was = accountValues(state.account);
    var out = {};
    Object.keys(now).forEach(function (k) {
      if (now[k] !== was[k]) out[k] = now[k];
    });
    return out;
  }
  function stationLabel(id) {
    if (id === null || id === undefined) return "Not assigned";
    var opt = Array.prototype.find.call($("station").options, function (o) {
      return o.value === String(id);
    });
    return opt ? opt.textContent : "Station #" + id;
  }
  function displayValue(field, value) {
    if (field === "role") return ROLE_LABEL[value] || prettyRole(value);
    if (field === "station_id") return stationLabel(value);
    return value;
  }

  function renderAccount() {
    var a = state.account;
    var inputs = PROFILE_INPUTS.map($);

    if (!a) {
      inputs.forEach(function (el) {
        el.disabled = true;
      });
      $("fullName").value = "";
      $("username").value = "";
      $("role").selectedIndex = -1;
      $("station").selectedIndex = 0;
      state.inputBase = null;
      setText("avatar", "—");
      ["sumId", "sumUser", "sumRole", "sumStation"].forEach(function (id) {
        setText(id, "—");
      });
      updateProfileButtons();
      return;
    }

    ensureOption($("role"), a.role, prettyRole(a.role));
    ensureOption($("station"), a.station_id, a.station || "Station #" + a.station_id);

    // The user is mid-edit only if the form differs from what code last put there.
    var editing = state.inputBase !== null && !sameValues(formValues(), state.inputBase);
    // Don't clobber what the user is typing when a background refresh lands.
    if (!editing) writeForm(accountValues(a));
    inputs.forEach(function (el) {
      el.disabled = false;
    });
    setText("avatar", initials(a.full_name || a.username));

    setText("sumId", String(a.user_id));
    setText("sumUser", a.username || "—");
    setText("sumRole", prettyRole(a.role));
    setText("sumStation", a.station || "Not assigned");

    if (!state.accountStale) reflectNameInSidebar(a.full_name);
    // Once the approved values show up on the account, the request is done.
    if (state.pendingChanges) {
      var now = accountValues(a);
      var done = Object.keys(state.pendingChanges).every(function (k) {
        return now[k] === state.pendingChanges[k];
      });
      if (done) state.pendingChanges = null;
    }
    renderApprovalUi();
    updateProfileButtons();
  }

  // Wording and the pending notice differ for admins (save directly) and
  // everyone else (request an admin's approval).
  function renderApprovalUi() {
    var admin = isAdmin();
    $("profileSave").textContent = admin ? "Save Changes" : "Request Change";
    setText(
      "profileSub",
      admin ? "Update your personal information" : "Changes are reviewed by an administrator",
    );
    setText(
      "profileNote",
      PROFILE_NOTE_BASE +
        (admin
          ? " As an administrator, your changes apply immediately."
          : " Changes need administrator approval before they take effect."),
    );

    var note = $("approvalNote");
    if (!admin && state.pendingChanges && state.account) {
      var parts = Object.keys(state.pendingChanges).map(function (k) {
        return FIELD_LABEL[k] + " to “" + displayValue(k, state.pendingChanges[k]) + "”";
      });
      note.textContent =
        "Your request to change your " + parts.join(", ") +
        " is waiting for administrator approval. Your profile stays as it is until it’s approved.";
      note.classList.add("show");
    } else {
      note.textContent = "";
      note.classList.remove("show");
    }
  }

  function reflectNameInSidebar(fullName) {
    if (!fullName) return;
    try {
      var u = JSON.parse(sessionStorage.getItem("polarlogDemoUser") || "null");
      if (u) {
        u.name = fullName;
        sessionStorage.setItem("polarlogDemoUser", JSON.stringify(u));
      }
    } catch (_) {
      /* ignore malformed session data */
    }
    var n = document.querySelector(".pl-sidebar-profile .who .n");
    var av = document.querySelector(".pl-sidebar-profile .pl-avatar");
    if (n) n.textContent = fullName;
    if (av) av.textContent = fullName.charAt(0).toUpperCase();
  }

  function renderSession() {
    var p = tokenPayload();
    if (!p || !p.exp) {
      setText("secExpires", "Unknown");
      setText("sumSession", "Signed in");
      return;
    }
    var expMs = p.exp * 1000;
    var expired = expMs <= Date.now();
    setText("secExpires", fmtDateTime(expMs));
    setText("sumSession", expired ? "Expired" : "Signed in");
  }

  /* ---------------- profile form ---------------- */
  function isDirty() {
    return Object.keys(changedFields()).length > 0;
  }
  function updateProfileButtons() {
    var dirty = isDirty();
    $("profileSave").disabled = !dirty || state.saving;
    $("profileCancel").disabled = !dirty || state.saving;
  }
  function clearProfileErrors() {
    setText("nameError", "");
    setText("usernameError", "");
    setText("profileFormErr", "");
    ["fullName", "username", "role", "station"].forEach(function (id) {
      $(id).setAttribute("aria-invalid", "false");
    });
  }
  function fieldError(inputId, errId, msg) {
    setText(errId, msg);
    $(inputId).setAttribute("aria-invalid", "true");
  }
  // Checks only the fields the user actually changed. Returns the first
  // invalid input's id, or null if everything is fine.
  function validateProfile(changes) {
    clearProfileErrors();
    var bad = null;
    if ("full_name" in changes) {
      var n = changes.full_name;
      var msg = "";
      if (n.length < NAME_MIN) msg = "Enter your full name (at least " + NAME_MIN + " characters).";
      else if (n.length > NAME_MAX) msg = "Name must be " + NAME_MAX + " characters or fewer.";
      if (msg) {
        fieldError("fullName", "nameError", msg);
        bad = bad || "fullName";
      }
    }
    if ("username" in changes && !USERNAME_RE.test(changes.username)) {
      fieldError("username", "usernameError", "3–50 characters: letters, numbers, . _ -");
      bad = bad || "username";
    }
    if ("role" in changes && !ROLE_LABEL[changes.role]) {
      fieldError("role", "profileFormErr", "Choose a valid role.");
      bad = bad || "role";
    }
    return bad;
  }
  function showServerError(msg) {
    if (/username/i.test(msg)) fieldError("username", "usernameError", msg);
    else if (/name must/i.test(msg)) fieldError("fullName", "nameError", msg);
    else setText("profileFormErr", msg);
    toast(msg, "err");
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (state.saving || !isDirty()) return;
    var changes = changedFields();
    var bad = validateProfile(changes);
    if (bad) {
      $(bad).focus();
      return;
    }

    if (!isAdmin()) {
      await requestProfileChange(changes);
      return;
    }

    if (
      "role" in changes &&
      state.account.role === "admin" &&
      changes.role !== "admin" &&
      !window.confirm(
        "You’re about to remove your own administrator access. You won’t be able to edit your profile directly or approve requests afterwards. Continue?",
      )
    ) {
      return;
    }

    state.saving = true;
    setBusy($("profileSave"), true);
    var body = Object.assign({ user_id: currentUserId() }, changes);
    var res = await apiSend(PATH_ACCOUNT, "PUT", body);
    state.saving = false;
    setBusy($("profileSave"), false);

    var identityChanged = "username" in changes || "role" in changes || "station_id" in changes;
    if (res.ok) {
      state.account = res.data;
      state.accountStale = false;
      if (window.OfflineDB) OfflineDB.setCache(PATH_ACCOUNT, res.data);
      writeForm(accountValues(res.data));
      toast(
        identityChanged
          ? "Profile saved. Sign out and back in for username, role or station changes to apply everywhere."
          : "Profile saved.",
        "success",
      );
    } else if (res.queued) {
      // Offline: keep the change locally (and in the offline cache so a
      // reload still shows it); the outbox replays it on reconnect.
      var local = Object.assign({}, state.account, changes);
      if ("station_id" in changes) {
        local.station = changes.station_id === null ? null : stationLabel(changes.station_id);
      }
      state.account = local;
      if (window.OfflineDB) OfflineDB.setCache(PATH_ACCOUNT, state.account);
      writeForm(accountValues(local));
      toast("You’re offline — changes saved on this device and will sync when you reconnect.", "warn");
    } else {
      showServerError(res.error || "Couldn’t save your profile.");
    }
    renderAccount();
    renderBanners();
    refreshSyncStatus();
  }

  // Non-admins: send the change to the approval service instead of saving it.
  // Direct fetch on purpose (like the password change): apiSend would queue a
  // failed request in the outbox and replay it against the wrong service.
  async function requestProfileChange(changes) {
    function fail(msg) {
      setText("profileFormErr", msg);
      toast(msg, "err");
    }
    if (!approvalConfigured()) {
      fail("Change requests aren’t available yet — the approval service isn’t connected.");
      return;
    }
    if (!navigator.onLine) {
      fail("Change requests need a connection. Nothing was sent.");
      return;
    }

    var was = accountValues(state.account);
    var diff = {};
    Object.keys(changes).forEach(function (k) {
      diff[k] = { from: was[k], to: changes[k] };
    });

    state.saving = true;
    setBusy($("profileSave"), true);
    try {
      var r = await fetch(approvalBase() + APPROVAL_PATH, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          type: "profile_change",
          user_id: currentUserId(),
          username: state.account.username,
          changes: diff,
        }),
      });
      // Not handleUnauthorized(): a 401 from the approval service must not
      // log the user out of PolarLog itself.
      var body = await r.json().catch(function () {
        return {};
      });
      if (r.ok) {
        state.pendingChanges = Object.assign({}, state.pendingChanges, changes);
        writeForm(was);
        clearProfileErrors();
        toast("Request sent — an administrator needs to approve your change.", "success");
      } else {
        fail(body.error || "Couldn’t send your request (" + r.status + ").");
      }
    } catch (_) {
      fail("Couldn’t reach the approval service. Nothing was sent.");
    } finally {
      state.saving = false;
      setBusy($("profileSave"), false);
    }
    renderApprovalUi();
    updateProfileButtons();
  }

  function cancelProfile() {
    if (!state.account) return;
    writeForm(accountValues(state.account));
    clearProfileErrors();
    updateProfileButtons();
  }

  /* ---------------- station choices ---------------- */
  // Fills the Station dropdown from the stations list. Decommissioned
  // stations aren't offered (the user's current one is kept regardless).
  async function loadStationChoices() {
    var list;
    try {
      list = await apiGet("/api/stations");
    } catch (_) {
      return; // dropdown keeps "Not assigned" plus the user's current station
    }
    if (!Array.isArray(list)) return;
    var sel = $("station");
    var keep = sel.value;
    var current = state.account && state.account.station_id;
    sel.replaceChildren(new Option("Not assigned", ""));
    list
      .filter(function (s) {
        return s.status !== "decommissioned" || s.station_id === current;
      })
      .sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      })
      .forEach(function (s) {
        sel.appendChild(new Option(s.name, String(s.station_id)));
      });
    ensureOption(sel, keep, "Station #" + keep);
    sel.value = keep;
    if (state.account) renderAccount();
  }

  /* ---------------- notifications ---------------- */
  function renderPrefs() {
    var prefs = state.prefs ? state.prefs.notifications : null;
    document.querySelectorAll("#notifRows .set-switch").forEach(function (btn) {
      var key = btn.dataset.pref;
      var known = prefs && typeof prefs[key] === "boolean";
      var on = known ? prefs[key] : false;
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.querySelector(".state").textContent = known ? (on ? "On" : "Off") : "—";
      if (!btn.dataset.saving) btn.disabled = !known;
    });
  }

  var prefChain = Promise.resolve();
  function togglePref(btn) {
    if (!state.prefs || btn.disabled) return;
    var key = btn.dataset.pref;
    var prev = !!state.prefs.notifications[key];
    var next = !prev;

    state.prefs.notifications[key] = next; // optimistic
    btn.dataset.saving = "1";
    btn.disabled = true;
    renderPrefs();

    // One request at a time so rapid toggles can't land out of order.
    prefChain = prefChain.then(async function () {
      var patch = {};
      patch[key] = next;
      var res = await apiSend(PATH_PREFS, "PUT", { user_id: currentUserId(), notifications: patch });
      if (res.ok) {
        state.prefs = res.data;
        state.prefsStale = false;
        if (window.OfflineDB) OfflineDB.setCache(PATH_PREFS, res.data);
        toast("Notification preference saved.", "success");
      } else if (res.queued) {
        if (window.OfflineDB) OfflineDB.setCache(PATH_PREFS, state.prefs);
        toast("You’re offline — saved on this device, will sync when you reconnect.", "warn");
      } else {
        state.prefs.notifications[key] = prev; // roll back
        toast(res.error || "Couldn’t save that preference.", "err");
      }
      delete btn.dataset.saving;
      renderPrefs();
      renderBanners();
      refreshSyncStatus();
    });
  }

  /* ---------------- appearance ---------------- */
  function renderTheme() {
    var current = window.PolarLogTheme ? PolarLogTheme.get() : "light";
    document.querySelectorAll("#themeSeg button[data-theme]").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.theme === current ? "true" : "false");
    });
  }

  /* ---------------- connection + sync status ---------------- */
  async function checkConnection() {
    if (!navigator.onLine) return "offline";
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, 4000);
    try {
      var r = await fetch(API_BASE + "/", { cache: "no-store", signal: ctrl.signal });
      return r.ok ? "live" : "server-error";
    } catch (_) {
      return "unreachable";
    } finally {
      clearTimeout(timer);
    }
  }

  var CONNECTION_TEXT = {
    checking: ["Checking…", "pill-muted", "Checking…"],
    live: ["Live", "pill-green", "Connected to the PolarLog API"],
    offline: ["Offline", "pill-red", "No network connection"],
    unreachable: ["Offline", "pill-red", "Network up, API unreachable"],
    "server-error": ["Degraded", "pill-amber", "API responded with an error"],
  };

  async function refreshConnection() {
    var status = await checkConnection();
    state.connection = status;

    var t = CONNECTION_TEXT[status];
    var pill = $("syncConn");
    pill.textContent = t[0];
    pill.className = "pill " + t[1];
    setText("syncConnDetail", t[2]);
    setText("aboutApi", status === "live" ? "Reachable" : t[2]);

    setLiveStatus(status === "live"); // shared topbar pill from config.js
    renderTopSync();

    document.querySelectorAll("[data-needs-online]").forEach(function (b) {
      var offline = status === "offline";
      b.disabled = offline;
      b.title = offline ? "Requires a connection" : "";
    });
    renderBanners();
    return status;
  }

  var lastRefreshTs = null;
  function renderTopSync() {
    // config.js's setLiveStatus writes generic text here; replace it with
    // the real last-refresh time, or say plainly that we don't have one.
    setText("syncText", lastRefreshTs ? "Last synced: " + fmtDateTime(lastRefreshTs) : "Not yet synced");
  }

  function renderLastRefresh() {
    lastRefreshTs = lastFetched();
    setText("syncLastRefresh", lastRefreshTs ? fmtDateTime(lastRefreshTs) : "Never on this device");
    renderTopSync();
  }

  async function refreshSyncStatus() {
    if (!window.OfflineDB) {
      setText("syncPending", "Not available");
      return;
    }
    var data = await Promise.all([OfflineDB.listOutbox(), OfflineDB.listCache()]);
    var outbox = data[0];
    var cache = data[1];
    var pending = outbox.filter(function (i) {
      return i.status === "pending";
    });
    var failed = outbox.filter(function (i) {
      return i.status === "failed";
    });

    renderLastRefresh();

    var up = Number(localStorage.getItem("polarlogLastSyncAt")) || null;
    setText("syncLastUpload", up ? fmtDateTime(up) : "None yet");

    setText("syncPending", pending.length ? pending.length + " waiting" : "None");
    setText("syncFailed", failed.length ? failed.length + " failed" : "None");
    setText(
      "syncCached",
      cache.length ? cache.length + " data set" + (cache.length === 1 ? "" : "s") + " saved" : "Nothing saved yet",
    );

    var list = $("failedList");
    list.replaceChildren();
    failed.forEach(function (item) {
      var li = document.createElement("li");
      var b = document.createElement("b");
      b.textContent = item.method + " " + item.endpoint;
      var span = document.createElement("span");
      span.textContent =
        (item.lastError || "Rejected by the server") + " (" + item.attempts + " attempt" + (item.attempts === 1 ? "" : "s") + ")";
      li.append(b, span);
      list.appendChild(li);
    });
    return { pending: pending.length, failed: failed.length };
  }

  async function syncNow() {
    var btn = $("syncNowBtn");
    setBusy(btn, true);
    try {
      var status = await refreshConnection();
      if (status !== "live") {
        toast(
          status === "offline"
            ? "You’re offline — queued changes stay on this device until you reconnect."
            : "Can’t reach the PolarLog server right now — changes stay queued.",
          "warn",
        );
        return;
      }
      var before = await refreshSyncStatus();
      // PolarLogSync.syncNow shows its own result toast when it uploads anything.
      if (window.PolarLogSync) await PolarLogSync.syncNow();
      await refreshAll();
      if (before && before.pending === 0 && before.failed === 0) {
        toast("Up to date — settings refreshed from the server.", "success");
      }
    } finally {
      setBusy(btn, false);
    }
  }

  /* ---------------- cache dialog ---------------- */
  async function clearCache() {
    $("cacheDialog").close();
    try {
      await OfflineDB.clearCache();
      toast("Offline cache cleared. Queued changes were kept.", "success");
    } catch (err) {
      toast("Couldn’t clear the offline cache.", "err");
    }
    refreshSyncStatus();
  }

  /* ---------------- password dialog ---------------- */
  var PW_FIELDS = ["pwCurrent", "pwNew", "pwConfirm"];
  function clearPwErrors() {
    ["pwCurrentErr", "pwNewErr", "pwConfirmErr", "pwFormErr"].forEach(function (id) {
      setText(id, "");
    });
    PW_FIELDS.forEach(function (id) {
      $(id).setAttribute("aria-invalid", "false");
    });
  }
  function pwFieldError(inputId, errId, msg) {
    setText(errId, msg);
    $(inputId).setAttribute("aria-invalid", "true");
  }
  function openPwDialog() {
    if (!navigator.onLine) {
      toast("Changing your password needs a connection.", "warn");
      return;
    }
    clearPwErrors();
    $("pwForm").reset();
    $("pwDialog").showModal();
    $("pwCurrent").focus();
  }
  function closePwDialog() {
    $("pwForm").reset();
    clearPwErrors();
    $("pwDialog").close();
  }

  async function submitPassword(e) {
    e.preventDefault();
    clearPwErrors();
    var cur = $("pwCurrent").value;
    var nw = $("pwNew").value;
    var conf = $("pwConfirm").value;

    var bad = null;
    if (!cur) {
      pwFieldError("pwCurrent", "pwCurrentErr", "Enter your current password.");
      bad = bad || "pwCurrent";
    }
    if (nw.length < PASSWORD_MIN || nw.length > PASSWORD_MAX) {
      pwFieldError("pwNew", "pwNewErr", "Use " + PASSWORD_MIN + "–" + PASSWORD_MAX + " characters.");
      bad = bad || "pwNew";
    } else if (nw === cur) {
      pwFieldError("pwNew", "pwNewErr", "New password must differ from the current one.");
      bad = bad || "pwNew";
    }
    if (conf !== nw) {
      pwFieldError("pwConfirm", "pwConfirmErr", "Passwords don’t match.");
      bad = bad || "pwConfirm";
    }
    if (bad) {
      $(bad).focus();
      return;
    }

    var btn = $("pwSubmit");
    setBusy(btn, true);
    try {
      // Direct request on purpose: apiSend would queue a failed request in
      // the outbox, and a password change must never be replayed later.
      var r = await fetch(API_BASE + "/api/settings/password", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ current_password: cur, new_password: nw }),
      });
      if (r.status === 401) {
        handleUnauthorized();
        return;
      }
      var body = await r.json().catch(function () {
        return {};
      });
      if (r.ok) {
        closePwDialog();
        toast("Password updated.", "success");
      } else if (r.status === 403) {
        pwFieldError("pwCurrent", "pwCurrentErr", body.error || "Current password is incorrect.");
        $("pwCurrent").focus();
      } else {
        setText("pwFormErr", body.error || "Couldn’t update your password (" + r.status + ").");
      }
    } catch (_) {
      setText("pwFormErr", "Couldn’t reach the server. Nothing was changed — password changes need a connection.");
    } finally {
      setBusy(btn, false);
    }
  }

  /* ---------------- search ---------------- */
  function filterCards() {
    var searchEl = $("topSearch");
    var q = searchEl ? searchEl.value.trim().toLowerCase() : "";
    var visible = 0;
    document.querySelectorAll(".set-card[data-search]").forEach(function (card) {
      var hay = (card.dataset.search + " " + card.textContent).toLowerCase();
      var show = !q || hay.indexOf(q) !== -1;
      card.hidden = !show;
      if (show) visible++;
    });
    $("searchEmpty").hidden = visible !== 0;
  }

  /* ---------------- render all ---------------- */
  function renderAll() {
    renderAccount();
    renderPrefs();
    renderBanners();
  }

  /* ---------------- init ---------------- */
  function init() {

    $("profileForm").addEventListener("submit", saveProfile);
    PROFILE_INPUTS.forEach(function (id) {
      $(id).addEventListener(id === "role" || id === "station" ? "change" : "input", function () {
        clearProfileErrors();
        updateProfileButtons();
      });
    });
    $("profileCancel").addEventListener("click", cancelProfile);

    document.querySelectorAll("#notifRows .set-switch").forEach(function (btn) {
      btn.addEventListener("click", function () {
        togglePref(btn);
      });
    });

    $("themeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-theme]");
      if (!b || b.disabled) return;
      PolarLogTheme.set(b.dataset.theme);
      renderTheme();
      toast(b.dataset.theme === "dark" ? "Switched to dark mode." : "Switched to light mode.", "success");
    });
    // The topbar button toggles the same theme; keep the radios in step.
    new MutationObserver(renderTheme).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("storage", renderTheme);
    renderTheme();

    $("syncNowBtn").addEventListener("click", syncNow);
    $("clearCacheBtn").addEventListener("click", function () {
      $("cacheDialog").showModal();
    });
    $("cacheCancel").addEventListener("click", function () {
      $("cacheDialog").close();
    });
    $("cacheConfirm").addEventListener("click", clearCache);

    $("openPwBtn").addEventListener("click", openPwDialog);
    $("openPwBtn2").addEventListener("click", openPwDialog);
    $("pwCancel").addEventListener("click", closePwDialog);
    $("pwForm").addEventListener("submit", submitPassword);
    $("pwDialog").addEventListener("cancel", function () {
      $("pwForm").reset();
      clearPwErrors();
    });

    $("signOutBtn").addEventListener("click", function () {
      sessionStorage.removeItem("polarlogDemoUser");
      sessionStorage.removeItem("polarlogToken");
      window.location.replace("login.html");
    });

    if ($("topSearch")) $("topSearch").addEventListener("input", filterCards);

    // Mobile: the existing sidebar opens as a drawer (hidden by CSS <= 820px).
    function setNav(open) {
      document.body.classList.toggle("nav-open", open);
      $("navScrim").hidden = !open;
      $("navToggle").setAttribute("aria-expanded", open ? "true" : "false");
      $("navToggle").setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      if (open) {
        var first = document.querySelector("#plSidebar .pl-nav-item");
        if (first) first.focus();
      } else if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#plSidebar")) {
        $("navToggle").focus();
      }
    }
    $("navToggle").addEventListener("click", function () {
      setNav(!document.body.classList.contains("nav-open"));
    });
    $("navScrim").addEventListener("click", function () {
      setNav(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) setNav(false);
    });
    window.matchMedia("(min-width: 821px)").addEventListener("change", function (e) {
      if (e.matches) setNav(false);
    });

    // About
    setText("aboutApiUrl", API_BASE);
    setText(
      "aboutSw",
      "serviceWorker" in navigator
        ? navigator.serviceWorker.controller
          ? "Active"
          : "Not active yet"
        : "Not supported",
    );
    renderSession();
    setInterval(renderSession, 60000);

    // Connectivity: registered after config.js's own listeners, so this
    // runs last and its result wins.
    window.addEventListener("online", function () {
      refreshConnection().then(refreshAll);
    });
    window.addEventListener("offline", function () {
      refreshConnection();
    });
    // Fired by sync-manager.js after every outbox replay (auto or manual).
    document.addEventListener("polarlog:sync", function () {
      refreshAll();
    });

    refreshConnection();
    loadSettings().then(function () {
      refreshSyncStatus();
      loadStationChoices();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
