/* Bagdrop Admin OS */
(function () {
  "use strict";
  var P = window.PRICING, DB = window.DB, AI = window.AI;
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { return ($(id).value || "").trim(); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  DB.onState(function (ok, msg) {
    var el = $("dbstate");
    el.className = "pill " + (ok ? "ok" : "warn");
    el.textContent = msg;
  });
  function say(msg) {
    var t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(window.__tt);
    window.__tt = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }
  (function sess() {
    var t0 = Date.now();
    setInterval(function () {
      var m = Math.floor((Date.now() - t0) / 60000);
      $("who-sess").textContent = "Session " + Math.floor(m / 60) + "h " + (m % 60) + "m";
    }, 15000);
    $("who-sess").textContent = "Session 0h 0m";
  })();

  /* ---------------- visual polish: nav icons, KPI chips, header date ---------------- */
  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  var I = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 8.3L12 13l8.7-4.7"/><path d="M12 13v8"/>',
    receipt: '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6"/>',
    alert: '<path d="M10.3 4.1L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z"/>',
    truck: '<path d="M1 7h13v10H1z"/><path d="M14 10h4l4 4v3h-8z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    gauge: '<path d="M12 15l3.5-3.5"/><path d="M20.3 18a9 9 0 1 0-16.6 0"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    tag: '<path d="M20.6 13.4L11 3H3v8l9.6 10.4a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    wallet: '<path d="M21 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16V7"/><path d="M16 13h2"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M6 8h12v5a6 6 0 0 1-12 0z"/>',
    spark: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    layers: '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
    rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a6 6 0 0 0 6-6"/>',
    check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>',
    trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
  };
  var NAVICON = { cmd: "grid", ship: "box", quote: "receipt", exc: "alert", evt: "heart", drv: "truck", flt: "plane", cap: "gauge", crm: "users", price: "tag", id: "shield", fin: "wallet", part: "plug", intel: "spark", rep: "chart", rules: "bell", integ: "layers", sec: "lock", data: "db" };
  document.querySelectorAll(".railnav button[data-m]").forEach(function (b) {
    var k = NAVICON[b.dataset.m];
    if (k) b.insertAdjacentHTML("afterbegin", '<span class="ic">' + svgIcon(I[k]) + "</span>");
  });
  /* KPI icon chips, by label keyword */
  var KPIMAP = [
    [/booking/, "cal", "c-orange"], [/decision|waiting/, "alert", "c-amber"],
    [/paid|revenue|captured|value|avg/, "rupee", "c-green"], [/event/, "heart", "c-purple"],
    [/custody|pieces/, "box", "c-blue"], [/pickup/, "truck", "c-orange"],
    [/delivered/, "check", "c-green"], [/lead|inquir/, "users", "c-purple"],
    [/balance|refund/, "wallet", "c-rose"], [/gst/, "percent", "c-blue"],
    [/conversion|pass/, "trend", "c-green"], [/pipeline/, "trend", "c-orange"],
    [/customer/, "users", "c-purple"], [/check/, "shield", "c-blue"],
    [/review/, "eye", "c-amber"], [/flight/, "plane", "c-blue"], [/fresh/, "gauge", "c-blue"]
  ];
  document.querySelectorAll(".kpi").forEach(function (k) {
    if (k.querySelector(".ic")) return;
    var l = (k.querySelector(".l") || {}).textContent || "";
    var hit = KPIMAP.filter(function (m) { return m[0].test(l.toLowerCase()); })[0];
    if (hit && k.classList.contains("card")) k.insertAdjacentHTML("beforeend", '<span class="ic ' + hit[2] + '">' + svgIcon(I[hit[1]]) + "</span>");
  });
  /* today's date next to the search, like a proper console header */
  (function () {
    var holder = document.querySelector(".modtop > div:last-child");
    if (holder) holder.insertAdjacentHTML("afterbegin",
      '<span class="src" style="font-weight:500;color:var(--muted)">' +
      new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) + "</span>");
  })();

  /* ---------------- nav ---------------- */
  var TITLES = {
    cmd: ["Command centre", "Everything moving right now. Live from the booking platform, briefed by the intelligence engine."],
    ship: ["Shipments", "Every booking lands here the moment it is made. Decide, revise, assign and progress — the customer's screen updates as you do. Inquiries convert without leaving the screen."],
    quote: ["Quotes and payments", "Make a quote for any inquiry that reaches the team directly, share the payment link and QR, and watch it convert."],
    lr: ["LR and trips", "Lorry receipts, trip manifests and every expense of the run — revenue minus expenses, per vehicle, per day."],
    rep: ["Reports", "Revenue, funnel, lanes, channels — animated from the live database, exportable as CSV."],
    exc: ["Exceptions", "Owner, SLA and the automatic response for each exception type."],
    evt: ["Events and bulk", "Weddings and events: open the record, share the guest link, watch families book."],
    drv: ["Drivers", "Live positions, the captain app, and how every scan routes to the right department."],
    flt: ["Flights", "Live ADS-B board, per-booking flight watch, and the re-planning rules a delay triggers."],
    cap: ["Capacity and roster", "Seven-day load against the roster. Slots close on the website at 100%."],
    crm: ["CRM and follow-ups", "Every lead and every customer the platform generates, ranked follow-ups drafted by the engine, one click to act."],
    price: ["Pricing engine", "The region rate matrix every public quote is built from, with margin suggestions from live lanes."],
    id: ["Identity and compliance", "Every verification, its method and score. Minimal data, never the document."],
    fin: ["Finance", "Captured payments, GST, refunds owed, and live lane economics."],
    part: ["Partners and API", "Partner channels and the scoped API console."],
    intel: ["Forecast and copilot", "Demand forecast retrained on every booking, and a copilot that answers from the live database."],
    rules: ["Rules and notifications", "Every automatic message and its trigger. Toggles persist to the back end."],
    integ: ["Integrations", "Every external system, its status, and what it unlocks."],
    sec: ["Security and audit", "Roles enforced by Row Level Security, and the append-only audit log."],
    data: ["Data and privacy", "DPDPA consent, retention, residency, breach runbook, subject requests."]
  };
  document.querySelectorAll(".railnav button[data-m]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.m); });
  });
  function show(m) {
    document.querySelectorAll(".railnav button[data-m]").forEach(function (x) {
      if (x.dataset.m === m) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current");
    });
    document.querySelectorAll("section.mod").forEach(function (s) { s.classList.toggle("on", s.id === "m-" + m); });
    $("mtitle").textContent = TITLES[m][0];
    $("msub").textContent = TITLES[m][1];
    if (m === "flt" && !window.__fltStarted) { window.__fltStarted = true; loadLive(); }
    if (m === "cap") renderCapacity();
    if (m === "rep") renderReports(true);
  }
  /* ---------------- work drawer ---------------- */
  function openDrawer() {
    var bd = $("drawer-backdrop");
    bd.hidden = false;
    void bd.offsetHeight; /* reflow so the transition runs; rAF stalls in background tabs */
    bd.classList.add("show");
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    $("drawer").classList.remove("open");
    $("drawer-backdrop").classList.remove("show");
    $("drawer").setAttribute("aria-hidden", "true");
    setTimeout(function () { $("drawer-backdrop").hidden = true; }, 280);
  }
  $("drawer-close").addEventListener("click", closeDrawer);
  $("drawer-backdrop").addEventListener("click", closeDrawer);
  function openBooking(id) {
    selId = id;
    renderList();
    renderDetail();
    openDrawer();
  }

  /* ---------------- command palette (⌘K) ---------------- */
  var palSel = 0, palItems = [];
  function palOpen() {
    var bd = $("pal-backdrop");
    bd.hidden = false;
    $("pal").hidden = false;
    void bd.offsetHeight;
    bd.classList.add("show");
    $("pal").classList.add("show");
    $("pal-q").value = "";
    $("pal-q").focus();
    palRender("");
  }
  function palClose() {
    $("pal").classList.remove("show");
    $("pal-backdrop").classList.remove("show");
    setTimeout(function () { $("pal").hidden = true; $("pal-backdrop").hidden = true; }, 180);
  }
  function palIndex(qq) {
    qq = qq.toLowerCase();
    var out = [];
    function match(s) { return !qq || (s || "").toLowerCase().indexOf(qq) >= 0; }
    Object.keys(TITLES).forEach(function (m) {
      if (match(TITLES[m][0])) out.push({ grp: "Modules", icon: NAVICON[m] || "grid", label: TITLES[m][0], hint: "open module", act: function () { show(m); } });
    });
    ALL.forEach(function (d) {
      var hay = [d.id, d.traveller.name, d.traveller.mobile, d.from, d.to, (d.quote || {}).qid].join(" ");
      if (match(hay)) out.push({
        grp: "Bookings", icon: "box",
        label: d.id + " · " + (d.traveller.name || "—"),
        hint: d.from + " → " + d.to + " · " + (LABEL[d.status] || d.status),
        act: function () { openBooking(d.id); }
      });
    });
    AI.crmCustomers(ALL).forEach(function (c) {
      if (match(c.name + " " + c.mobile)) out.push({
        grp: "Customers", icon: "users",
        label: c.name || c.mobile,
        hint: c.bookings.length + " bookings · " + DB.inr(c.value),
        act: function () { openBooking(c.last.id); }
      });
    });
    INQ.forEach(function (i) {
      if (match(i.contact.name + " " + (i.venue || "") + " " + i.venueCity)) out.push({
        grp: "Leads", icon: "heart",
        label: i.contact.name + " · " + (i.venue || i.venueCity),
        hint: i.status,
        act: function () { show("crm"); }
      });
    });
    return out.slice(0, 14);
  }
  function palRender(qq) {
    palItems = palIndex(qq);
    palSel = 0;
    var lastGrp = null;
    $("pal-list").innerHTML = palItems.map(function (it, i) {
      var h = "";
      if (it.grp !== lastGrp) { h = '<div class="pal-grp">' + it.grp + "</div>"; lastGrp = it.grp; }
      return h + '<div class="pal-item' + (i === 0 ? " sel" : "") + '" data-pi="' + i + '"><span class="ic">' + svgIcon(I[it.icon] || I.grid) + "</span><span>" + esc(it.label) + "</span><small>" + esc(it.hint) + "</small></div>";
    }).join("") || '<div class="pal-grp">No matches</div>';
    $("pal-list").querySelectorAll(".pal-item").forEach(function (el) {
      el.addEventListener("click", function () { palGo(+el.dataset.pi); });
      el.addEventListener("mousemove", function () { palMark(+el.dataset.pi); });
    });
  }
  function palMark(i) {
    palSel = i;
    $("pal-list").querySelectorAll(".pal-item").forEach(function (el) { el.classList.toggle("sel", +el.dataset.pi === i); });
    var el = $("pal-list").querySelector('.pal-item[data-pi="' + i + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }
  function palGo(i) {
    var it = palItems[i];
    if (!it) return;
    palClose();
    it.act();
  }
  $("gsearch").addEventListener("click", palOpen);
  $("pal-backdrop").addEventListener("click", palClose);
  $("pal-q").addEventListener("input", function () { palRender(this.value); });
  $("pal-q").addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); palMark(Math.min(palSel + 1, palItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); palMark(Math.max(palSel - 1, 0)); }
    if (e.key === "Enter") palGo(palSel);
  });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palOpen(); }
    if (e.key === "Escape") { palClose(); closeDrawer(); }
  });

  /* ---------------- collapsible sidebar ---------------- */
  (function () {
    var app = document.querySelector(".app");
    document.querySelectorAll(".railnav button[data-m]").forEach(function (b) {
      b.title = b.textContent.trim();
    });
    function setNC(on) {
      app.classList.toggle("nc", on);
      $("railcollapse").textContent = on ? "⟩⟩" : "⟨⟨";
      $("railcollapse").title = on ? "Expand sidebar" : "Collapse sidebar";
      try { localStorage.setItem("bagdrop:nc", on ? "1" : ""); } catch (e) {}
    }
    $("railcollapse").addEventListener("click", function () { setNC(!app.classList.contains("nc")); });
    try { if (localStorage.getItem("bagdrop:nc") === "1") setNC(true); } catch (e) {}
  })();

  /* greeting on the command-centre brief */
  (function () {
    var h = document.querySelector("#m-cmd .copilot h3");
    if (!h) return;
    var hr = new Date().getHours();
    var g = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    h.firstChild.textContent = g + " — today's brief ";
  })();

  /* ---------------- live data ---------------- */
  var ALL = [], EVENTS = [], INQ = [], CRMLOG = [], filt = "all", selId = null, q = "";
  var RATES = JSON.parse(JSON.stringify(P.DEFAULT_RATES));
  var ROUTES = JSON.parse(JSON.stringify(P.DEFAULT_ROUTES));
  var ADDONS = JSON.parse(JSON.stringify(P.DEFAULT_ADDONS));
  var XCITIES = [];

  /* load the pricing masters from the back end (seed on first run) */
  Promise.all([DB.get("settings", "routes"), DB.get("settings", "addons"), DB.get("settings", "cities")]).then(function (r) {
    if (r[0] && r[0].routes) ROUTES = r[0].routes; else DB.put("settings", "routes", { id: "routes", created: DB.now(), routes: ROUTES });
    if (r[1] && r[1].addons) ADDONS = r[1].addons; else DB.put("settings", "addons", { id: "addons", created: DB.now(), addons: ADDONS });
    if (r[2] && r[2].cities) XCITIES = r[2].cities;
    P.setMasters({ routes: ROUTES, addons: ADDONS, cities: XCITIES, rates: RATES });
    renderRouteChart();
    renderAddons();
    fillCitySelects();
  });
  function saveRoutes() {
    P.setMasters({ routes: ROUTES });
    return DB.put("settings", "routes", { id: "routes", created: DB.now(), routes: ROUTES });
  }
  function saveAddons() {
    P.setMasters({ addons: ADDONS });
    return DB.put("settings", "addons", { id: "addons", created: DB.now(), addons: ADDONS });
  }
  function saveCities() {
    P.setMasters({ cities: XCITIES });
    return DB.put("settings", "cities", { id: "cities", created: DB.now(), cities: XCITIES });
  }
  function fillCitySelects() {
    var names = P.allCities().map(function (c) { return c.name; });
    ["qt-from", "qt-to", "rt-from", "rt-to", "qs-from", "qs-to"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var cur = el.value;
      el.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
      if (names.indexOf(cur) >= 0) el.value = cur;
    });
    if ($("qt-from") && !$("qt-from").value) $("qt-from").value = "Vadodara";
    if ($("qt-to") && names.indexOf("Mumbai") >= 0 && $("qt-to").value === names[0]) $("qt-to").value = "Mumbai";
  }

  var PILL = { quoted: "info", identified: "info", submitted: "warn", revised: "warn", accepted: "ok", assigned: "ok", picked_up: "ok", in_transit: "ok", delivered: "ok", rejected: "bad", cancelled: "bad" };
  var LABEL = { quoted: "quoted", identified: "verified", submitted: "needs decision", revised: "revised, waiting", accepted: "accepted", assigned: "captain assigned", picked_up: "picked up", in_transit: "in transit", delivered: "delivered", rejected: "rejected", cancelled: "cancelled" };
  var MOVING = ["assigned", "picked_up", "in_transit"];

  var TRIPS = [], selTrip = null;
  DB.watch("bookings", function (list) { ALL = list; renderAll(); });
  DB.watch("events", function (list) { EVENTS = list; renderEvents(); renderKpis(); });
  DB.watch("inquiries", function (list) { INQ = list; renderInquiries(); renderShipInq(); renderCrm(); renderKpis(); renderBrief(); });
  DB.watch("crm", function (list) { CRMLOG = list; renderCrmLog(); renderCrm(); renderCrmDue(); });
  DB.watch("trips", function (list) { TRIPS = list; renderTrips(); renderTripDetail(); renderMis(); });

  function renderAll() {
    renderList(); renderKpis(); renderFeed(); renderDecide(); renderIdentity(); renderFinance();
    renderEvents(); renderCrm(); renderBrief(); renderCharts(); renderIntel(); renderAudit();
    renderDrivers(); renderShipInq(); renderQuotes(); renderReports(false);
    renderTrips(); renderTripDetail(); renderFinDocSelect(); renderCrmDue(); renderCrmLost(); renderMis();
    if (selId) renderDetail();
  }

  /* ---------------- command centre ---------------- */
  function todayList() {
    var today = new Date().toDateString();
    return ALL.filter(function (d) { return new Date(d.created).toDateString() === today; });
  }
  function renderKpis() {
    var t = todayList();
    $("cc-n").textContent = t.length;
    $("st-n").textContent = t.length;
    var p = ALL.filter(function (d) { return d.status === "submitted"; }).length;
    $("cc-p").textContent = p; $("st-p").textContent = p;
    $("nav-ship").textContent = p || ALL.length;
    var paid = t.reduce(function (a, d) { return a + (d.pay ? d.pay.amount : 0); }, 0);
    $("cc-v").textContent = DB.inr(paid); $("st-v").textContent = DB.inr(paid);
    $("st-i").textContent = t.filter(function (d) { return d.identity && d.identity.ok; }).length;
    $("cc-e").textContent = EVENTS.filter(function (e) { return e.status !== "closed"; }).length;
    $("nav-evt").textContent = EVENTS.length + INQ.filter(function (i) { return i.status === "new"; }).length;
    $("cc-cust").textContent = ALL.filter(function (d) { return d.status === "picked_up" || d.status === "in_transit"; }).length;
    var picks = ALL.filter(function (d) { return (d.status === "accepted" || d.status === "assigned") && d.date; });
    $("cc-pick").textContent = picks.length;
    $("cc-pickd").textContent = picks.filter(function (d) { return !(d.admin && d.admin.captain); }).length + " without captain";
    $("cc-del").textContent = ALL.filter(function (d) { return d.status === "delivered"; }).length;
    $("cc-inq").textContent = INQ.filter(function (i) { return i.status === "new"; }).length;
    $("nav-crm").textContent = AI.crmSuggestions(ALL, INQ, followedKeys()).length;
    $("nav-id").textContent = ALL.filter(function (d) { return d.identity && d.identity.score >= 0.7 && d.identity.score < 0.85; }).length || ALL.filter(function (d) { return d.identity; }).length;
    /* today's numbers card */
    var del = ALL.filter(function (d) { return d.status === "delivered"; }).length;
    $("cc-numbers").innerHTML =
      '<li><span class="m">Paid</span><span class="num">' + DB.inr(paid) + " · " + t.length + " bookings · " + t.reduce(function (a, d) { return a + (d.bags || 0) + (d.oversize || 0); }, 0) + ' pieces</span></li>' +
      '<li><span class="m">On time</span><span class="num">' + del + " of " + del + ' deliveries</span></li>' +
      '<li><span class="m">Identity</span><span class="num">' + ALL.filter(function (d) { return d.identity && d.identity.ok; }).length + " passed · " +
      ALL.filter(function (d) { return d.identity && d.identity.score >= 0.7 && d.identity.score < 0.85; }).length + " review · 0 blocked</span></li>";
  }
  function renderBrief() {
    var lines = AI.brief(ALL, EVENTS, INQ, RATES);
    $("cc-brief").textContent = lines.join("\n");
    /* copilot noticed */
    var noticed = AI.anomalies(ALL).concat(
      AI.pricingSuggestions(ALL, RATES).map(function (s) { return { sev: "warn", text: s.text }; })
    ).slice(0, 4);
    $("cc-noticed").innerHTML = noticed.length ? noticed.map(function (n) {
      return '<li><span class="m">' + (n.sev === "warn" ? "Margin" : "Watch") + "</span><span>" + esc(n.text) + "</span></li>";
    }).join("") : '<li><span class="src">Quiet. Nothing unusual on the current data.</span></li>';
  }
  function renderFeed() {
    var evts = [];
    ALL.forEach(function (d) {
      (d.events || []).forEach(function (e) { evts.push({ at: e.at, by: e.by, text: d.id + " · " + e.text }); });
    });
    CRMLOG.forEach(function (c) { evts.push({ at: c.created, by: "admin", text: "CRM · " + c.text }); });
    evts.sort(function (a, b) { return b.at.localeCompare(a.at); });
    var cls = function (e) { return e.by === "admin" ? "info" : "ok"; };
    $("feed").innerHTML = evts.slice(0, 20).map(function (e) {
      return '<div><span class="dot ' + cls(e) + '"></span><span>' + esc(e.text) + "</span><time>" + DB.fmt(e.at) + "</time></div>";
    }).join("") || '<div><span class="src">No events yet. Make a booking on the customer site.</span></div>';
  }
  function renderDecide() {
    var need = ALL.filter(function (d) { return d.status === "submitted"; }).slice(0, 6);
    $("cc-decide").innerHTML = need.map(function (d) {
      return '<li><span class="m">' + esc(d.id) + "</span><span>" + esc(d.traveller.name || "—") + " · " + esc(d.from) + " → " + esc(d.to) + " · " + esc(d.date) + " · " + DB.inr(d.quote.total) +
        ' <button class="btn sm" data-open="' + esc(d.id) + '">Open</button></span></li>';
    }).join("") || '<li><span class="src">Nothing waiting.</span></li>';
    $("cc-decide").querySelectorAll("[data-open]").forEach(function (b) {
      b.addEventListener("click", function () { openBooking(b.dataset.open); });
    });
  }

  /* ---------------- forecast charts (command centre + intelligence) ---------------- */
  function chartSVG(f, w, h) {
    w = w || 560; h = h || 190;
    var pts = f.history.map(function (x) { return x.actual; }).concat(f.future.map(function (x) { return x.mu; }));
    var hi = Math.max.apply(null, f.future.map(function (x) { return x.hi; }).concat(pts, [4]));
    var n = f.history.length + f.future.length;
    var x0 = 34, x1 = w - 10, y0 = h - 28, y1 = 14;
    var X = function (i) { return x0 + (x1 - x0) * i / (n - 1); };
    var Y = function (v) { return y0 - (y0 - y1) * v / hi; };
    var histPts = f.history.map(function (p, i) { return X(i) + "," + Y(p.actual); }).join(" ");
    var fi0 = f.history.length - 1;
    var futPts = [X(fi0) + "," + Y(f.history[fi0].actual)].concat(f.future.map(function (p, i) { return X(fi0 + 1 + i) + "," + Y(p.mu); })).join(" ");
    var band = f.future.map(function (p, i) { return X(fi0 + 1 + i) + "," + Y(p.hi); })
      .concat(f.future.slice().reverse().map(function (p, i) { return X(fi0 + f.future.length - i) + "," + Y(p.lo); })).join(" ");
    var grid = [0, 0.5, 1].map(function (g) {
      var v = Math.round(hi * g);
      return '<line x1="' + x0 + '" y1="' + Y(v) + '" x2="' + x1 + '" y2="' + Y(v) + '" stroke="var(--line)" stroke-dasharray="2 3"/><text x="4" y="' + (Y(v) + 3) + '">' + v + "</text>";
    }).join("");
    var nowX = X(fi0);
    var peakMarks = f.future.map(function (p, i) {
      return p.peak ? '<circle cx="' + X(fi0 + 1 + i) + '" cy="' + (y0 + 8) + '" r="2" fill="var(--warn)"/>' : "";
    }).join("");
    var gid = "g" + Math.floor(Math.random() * 1e6);
    return '<svg class="fchart" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Pieces per day, actual and forecast with 80% band">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#EA580C" stop-opacity=".28"/><stop offset="100%" stop-color="#EA580C" stop-opacity=".04"/></linearGradient></defs>' +
      grid +
      '<polygon points="' + band + '" fill="url(#' + gid + ')"/>' +
      '<polyline points="' + histPts + '" fill="none" stroke="var(--fg)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<polyline points="' + futPts + '" fill="none" stroke="var(--accent)" stroke-width="2.25" stroke-dasharray="5 4" stroke-linecap="round"/>' +
      '<circle cx="' + nowX + '" cy="' + Y(f.history[fi0].actual) + '" r="4" fill="var(--accent)"/>' +
      '<text x="' + (nowX - 10) + '" y="' + (h - 6) + '" fill="var(--accent)">now</text>' +
      '<text x="' + x0 + '" y="' + (h - 6) + '">−14 d</text><text x="' + (x1 - 32) + '" y="' + (h - 6) + '">+14 d</text>' +
      peakMarks + "</svg>";
  }
  function renderCharts() {
    var f = AI.forecast(ALL, 14);
    $("cc-chart").innerHTML = chartSVG(f);
    $("cc-chartnote").textContent = "Next 7 days ≈ " + f.weekTotal + " pieces · " + f.captainsNeeded + " captain(s)/day needed · " + f.note;
  }

  /* ---------------- shipments inbox ---------------- */
  document.querySelectorAll("#admfilter button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("#admfilter button").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      filt = b.dataset.f;
      renderList();
    });
  });
  function inFilter(d) {
    if (filt === "all") return true;
    if (filt === "moving") return MOVING.indexOf(d.status) >= 0;
    if (filt === "quoted") return d.status === "quoted" || d.status === "identified";
    if (filt === "closed") return ["delivered", "rejected", "cancelled"].indexOf(d.status) >= 0;
    return d.status === filt;
  }
  function inSearch(d) {
    if (!q) return true;
    var hay = [d.id, d.traveller.name, d.traveller.mobile, d.from, d.to, d.ucName, d.ref].join(" ").toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function renderList() {
    var rows = $("admrows");
    var list = ALL.filter(inFilter).filter(inSearch);
    if (!list.length) {
      rows.innerHTML = '<tr><td colspan="6" class="src" style="padding:10px">' + (ALL.length ? "Nothing in this filter." : "No bookings yet. Make one on the customer site and it appears here.") + "</td></tr>";
      return;
    }
    rows.innerHTML = list.map(function (d) {
      return '<tr data-id="' + esc(d.id) + '"' + (d.id === selId ? ' class="sel"' : "") + ">" +
        '<td class="mono">' + esc(d.id) + '<br><span class="src">' + DB.fmt(d.created) + "</span></td>" +
        "<td>" + esc(d.traveller.name || "—") + '<br><span class="src">' + esc(d.traveller.mobile || "") + "</span></td>" +
        "<td>" + esc(d.from) + " → " + esc(d.to) + '<br><span class="src">' + esc(d.ucName) + " · " + esc(d.date) + (d.ref ? " · " + esc(d.ref) : "") + "</span></td>" +
        '<td class="num">' + d.billed + "</td>" +
        '<td class="num">' + DB.inr(d.quote.total) + "</td>" +
        '<td><span class="pill ' + (PILL[d.status] || "info") + '">' + (LABEL[d.status] || d.status) + "</span></td></tr>";
    }).join("");
    rows.querySelectorAll("tr[data-id]").forEach(function (r) {
      r.addEventListener("click", function () { openBooking(r.dataset.id); });
    });
  }

  /* inquiries inside shipments */
  function renderShipInq() {
    var el = $("ship-inq");
    if (!INQ.length) { el.innerHTML = '<tr><td colspan="4" class="src">No inquiries yet.</td></tr>'; return; }
    el.innerHTML = INQ.map(function (i) {
      return "<tr><td>" + DB.fmt(i.created) + "</td><td>" + esc(i.contact.name) + '<br><span class="src">' + esc(i.contact.mobile) + "</span></td>" +
        "<td>" + esc(i.venue || i.venueCity) + '<br><span class="src">' + (i.families || "?") + " fam · " + (i.bags || "?") + " bags</span></td>" +
        "<td>" + (i.status === "new"
          ? '<button class="btn sm primary" data-conv="' + esc(i.id) + '">Convert</button> <button class="btn sm" data-contacted="' + esc(i.id) + '">Contacted</button>'
          : '<span class="pill ' + (i.status === "converted" ? "ok" : "mute") + '">' + esc(i.status) + "</span>") + "</td></tr>";
    }).join("");
    wireConvertButtons(el);
  }

  /* ---------------- booking detail + actions ---------------- */
  function act(d, mut, evt, status) {
    var c = JSON.parse(JSON.stringify(d));
    if (status) c.status = status;
    mut(c);
    c.events = (c.events || []).concat([{ at: DB.now(), by: "admin", text: evt }]);
    return DB.put("bookings", d.id, c).then(function () { say(evt); });
  }
  function renderDetail() {
    var d = ALL.filter(function (x) { return x.id === selId; })[0];
    var el = $("admdetail");
    if (!d) { el.innerHTML = '<p class="lede" style="margin:0">Select a booking.</p>'; return; }
    var a = d.admin || {};
    var stages = ["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered"];
    var si = stages.indexOf(d.status);
    var tl = ["Submitted", "Accepted", "Captain", "Picked up", "In transit", "Delivered"].map(function (t, i) {
      var cls = i < si ? "done" : i === si ? "now" : "";
      return '<div class="st ' + cls + '">' + t + "</div>";
    }).join("");
    var brk = d.quote.breakdown || {};
    el.innerHTML =
      '<h3 style="font-family:var(--display);margin:0 0 2px">' + esc(d.id) + ' <span class="pill ' + (PILL[d.status] || "info") + '">' + (LABEL[d.status] || d.status) + "</span></h3>" +
      '<div class="src" style="margin-bottom:10px">' + esc(d.ucName) + " · created " + DB.fmt(d.created) + "</div>" +
      '<div class="timeline" style="margin-bottom:12px">' + tl + "</div>" +
      '<ul class="chk">' +
      '<li><span class="m">Traveller</span><span>' + esc((d.traveller.title ? d.traveller.title + " " : "") + (d.traveller.name || "—")) + " · " + esc(d.traveller.mobile || "") + (d.traveller.email ? " · " + esc(d.traveller.email) : "") +
        (d.traveller.res === "intl" ? ' · <span class="pill info">passport</span>' : "") + "</span></li>" +
      (d.business ? '<li><span class="m">Business</span><span>' + esc(d.business.name || "—") + (d.business.gstin ? " · GSTIN " + esc(d.business.gstin) : "") + "</span></li>" : "") +
      (d.paymentTerms && d.paymentTerms !== "Due on Receipt" ? '<li><span class="m">Terms</span><span>' + esc(d.paymentTerms) + "</span></li>" : "") +
      (d.deliveryDate ? '<li><span class="m">Deliver by</span><span>' + esc(d.deliveryDate) + "</span></li>" : "") +
      (d.payer ? '<li><span class="m">Payer</span><span>' + esc(d.payer.name) + " · " + esc(d.payer.contact) + "</span></li>" : "") +
      '<li><span class="m">Route</span><span>' + esc(d.from) + " → " + esc(d.to) + " · " + esc(d.date) + " · " + esc(d.slot || "no slot") + "</span></li>" +
      (d.ref ? '<li><span class="m">' + (d.mode === "rail" ? "Train" : d.mode === "sea" ? "Sailing" : "Flight") + "</span><span>" + esc(d.ref) +
        (d.pnr ? " · PNR " + esc(d.pnr) : "") + (d.flightTime ? " · " + (d.uc === "a2d" ? "lands " : "departs ") + esc(d.flightTime) : "") + "</span></li>" : "") +
      '<li><span class="m">Pickup</span><span>' + esc(d.pickAddr || "—") + "</span></li>" +
      '<li><span class="m">Drop</span><span>' + esc(d.dropAddr || "—") + "</span></li>" +
      '<li><span class="m">Pieces</span><span>' + d.bags + " bags" + (d.oversize ? " + " + d.oversize + " oversize" : "") + " · billed " + d.billed + "</span></li>" +
      '<li><span class="m">Quote</span><span class="num">' + DB.inr(d.quote.total) + (brk.gst ? " incl GST " + DB.inr(brk.gst) : "") + (d.quote.qid ? " · " + esc(d.quote.qid) : "") + "</span></li>" +
      '<li><span class="m">Identity</span><span>' + (d.identity && d.identity.ok ? '<span class="pill ok">passed</span> ' + esc(d.identity.method || "") : '<span class="pill warn">not verified</span>') + "</span></li>" +
      '<li><span class="m">Payment</span><span>' + (d.pay ? '<span class="pill ok">' + esc(d.pay.gateway) + "</span> " + DB.inr(d.pay.amount) + " · " + esc(d.pay.mode) : '<span class="pill mute">none</span>') + "</span></li>" +
      (a.captain ? '<li><span class="m">Captain</span><span>' + esc(a.captain) + "</span></li>" : "") +
      (d.note ? '<li><span class="m">Note</span><span>' + esc(d.note) + "</span></li>" : "") +
      "</ul>" +
      '<div class="gap"></div><div id="actrow" style="display:flex;gap:6px;flex-wrap:wrap"></div>' +
      '<div class="gap"></div><h3 style="font-size:13px">Event log</h3><div class="feed">' +
      (d.events || []).slice().reverse().map(function (e) {
        return '<div><span class="dot ' + (e.by === "admin" ? "info" : "ok") + '"></span><span>' + esc(e.text) + "</span><time>" + DB.fmt(e.at) + "</time></div>";
      }).join("") + "</div>";

    var row = $("actrow");
    var formBox = document.createElement("div");
    formBox.style.cssText = "flex-basis:100%;display:none";
    function btn(label, primary, fn, idAttr) {
      var b = document.createElement("button");
      b.className = "btn sm" + (primary ? " primary" : "");
      b.textContent = label;
      if (idAttr) b.id = idAttr;
      b.addEventListener("click", fn);
      row.appendChild(b);
      return b;
    }
    function inlineForm(html, onConfirm, confirmLabel) {
      formBox.innerHTML = '<div class="card" style="background:var(--surface-2);border:1px solid var(--line);margin-top:8px">' + html +
        '<div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm primary" id="if-ok">' + (confirmLabel || "Confirm") + '</button><button class="btn sm" id="if-no">Back</button></div></div>';
      formBox.style.display = "block";
      formBox.querySelector("#if-ok").addEventListener("click", onConfirm);
      formBox.querySelector("#if-no").addEventListener("click", function () { formBox.style.display = "none"; });
    }
    if (d.status === "submitted" || d.status === "revised") {
      btn("Accept", true, function () {
        inlineForm(
          '<div class="row"><label class="f" style="margin:0">Captain to assign (optional, can assign later)<input id="if-cap" value="' + esc(a.captain || "") + '" placeholder="Captain name"></label>' +
          '<label class="f" style="margin:0">Acceptance note (optional · internal)<input id="if-anote" placeholder="Capacity confirmed · identity clean · route proven"></label></div>',
          function () {
            var cap = formBox.querySelector("#if-cap").value.trim();
            var note = formBox.querySelector("#if-anote").value.trim();
            act(d, function (c) { c.admin.captain = cap || c.admin.captain || null; if (note) c.admin.acceptNote = note; },
              "Accepted by ops" + (cap ? " · captain " + cap : "") + (note ? " · " + note : "") + ". LR issued.", cap ? "assigned" : "accepted");
          }, "Accept booking");
      }, "act-accept");
      btn("Revise price", false, function () {
        inlineForm('<div class="row"><label class="f" style="margin:0">Revised total (₹)<input id="if-amt" inputmode="numeric" value="' + d.quote.total + '"></label>' +
          '<label class="f" style="margin:0">Reason shown to the customer<input id="if-why" value="Oversize re-rated after review"></label></div>', function () {
          var nt = +formBox.querySelector("#if-amt").value || 0;
          var reason = formBox.querySelector("#if-why").value.trim();
          if (!nt) return;
          act(d, function (c) { c.admin.revisedTotal = Math.round(nt); c.admin.reason = reason; }, "Price revised to " + DB.inr(nt) + " · " + reason, "revised");
        }, "Send revised price");
      }, "act-revise");
      btn("Reject", false, function () {
        var REASONS = [
          "Route not serviceable on that date",
          "Capacity full for the chosen date and slot",
          "Pickup pincode outside the service area",
          "Prohibited or restricted items declared",
          "Identity could not be verified",
          "Flight or travel detail could not be confirmed",
          "Pricing error in the quote — a corrected quote follows",
          "Payment could not be verified",
          "Custom reason"
        ];
        inlineForm(
          '<label class="f" style="margin:0 0 8px">Reason<select id="if-why-sel">' + REASONS.map(function (r) { return "<option>" + r + "</option>"; }).join("") + "</select></label>" +
          '<label class="f" style="margin:0 0 8px">Detail (added to the reason)<input id="if-why" placeholder="One line the customer will understand"></label>' +
          '<label class="src" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="if-send" checked> Also draft the WhatsApp / email to the client explaining it (optional)</label>',
          function () {
            var sel = formBox.querySelector("#if-why-sel").value;
            var extra = formBox.querySelector("#if-why").value.trim();
            var reason = sel === "Custom reason" ? (extra || "See message from the team") : sel + (extra ? " — " + extra : "");
            var send = formBox.querySelector("#if-send").checked;
            act(d, function (c) { c.admin.reason = reason; }, "Rejected · " + reason + " · refund initiated", "rejected").then(function () {
              if (!send) return;
              var m = "Hello " + (d.traveller.name || "").split(" ")[0] + ", about your Bagdrop booking " + d.id + " (" + d.from + " → " + d.to + ", " + d.date + "):\n\n" +
                "We are sorry — we could not confirm it. Reason: " + reason + ".\n" +
                (d.pay ? "Your payment of " + DB.inr(d.pay.amount) + " is being refunded in full, 5–7 working days.\n" : "") +
                "\nIf we can help re-plan the move, reply here or call " + (CFG.whatsapp || "") + ". — Team Bagdrop";
              crmLog("Rejection explained to " + (d.traveller.name || d.id) + " — WhatsApp/email draft ready", d.id, null, m);
              navigator.clipboard.writeText(m).then(function () {
                say("Rejection message drafted and copied — paste into WhatsApp or email. Logged.");
              }).catch(function () {
                say("Rejection message drafted and logged — copy it from the CRM activity log.");
              });
            });
          }, "Reject and refund");
      }, "act-reject");
    }
    if (d.status === "accepted") {
      btn(a.captain ? "Reassign captain" : "Assign captain", true, function () {
        inlineForm('<label class="f" style="margin:0">Captain name<input id="if-cap" value="' + esc(a.captain || "") + '"></label>', function () {
          var cap = formBox.querySelector("#if-cap").value.trim();
          if (!cap) return;
          act(d, function (c) { c.admin.captain = cap; }, "Captain " + cap + " assigned. Push sent to captain app.", "assigned");
        }, "Assign");
      }, "act-assign");
    }
    if (d.status === "assigned") btn("Mark picked up", true, function () { act(d, function () {}, "Picked up · sealed and photographed at the door", "picked_up"); }, "act-pickup");
    if (d.status === "picked_up") btn("Mark in transit", true, function () { act(d, function () {}, "On the line haul to " + d.to, "in_transit"); }, "act-transit");
    if (d.status === "in_transit") btn("Mark delivered", true, function () { act(d, function () {}, "Delivered against OTP · invoice sent", "delivered"); }, "act-deliver");
    if (["delivered", "rejected", "cancelled"].indexOf(d.status) < 0) {
      btn("Cancel", false, function () {
        inlineForm('<div style="font-size:12.5px">Cancel <b>' + esc(d.id) + "</b> and refund " + (d.pay ? DB.inr(d.pay.amount) : "in full") + "?</div>", function () {
          act(d, function (c) { c.admin.reason = "Cancelled by ops"; }, "Cancelled by ops · refund initiated", "cancelled");
        }, "Cancel and refund");
      }, "act-cancel");
    }
    row.appendChild(formBox);

    /* same-date moves: club runs internally — nothing crosses to any customer */
    var ACTIVE = ["submitted", "revised", "accepted", "assigned", "picked_up"];
    var sameDay = ALL.filter(function (x) {
      return x.id !== d.id && x.date === d.date && ACTIVE.indexOf(x.status) >= 0;
    });
    if (sameDay.length && ACTIVE.indexOf(d.status) >= 0) {
      var clubBox = document.createElement("div");
      clubBox.className = "card stripe info";
      clubBox.style.cssText = "margin-top:12px;padding:10px";
      clubBox.innerHTML = '<b style="font-family:var(--display)">Moves on the same date · ' + esc(d.date) + "</b>" +
        '<div class="src" style="margin:2px 0 8px">Club runs to share a vehicle or a line haul. Internal only — no customer ever sees another customer\'s details.</div>' +
        sameDay.map(function (x) {
          var sameClub = d.admin && d.admin.club && x.admin && x.admin.club === d.admin.club;
          return '<div style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:12.5px;flex-wrap:wrap">' +
            '<span class="mono">' + esc(x.id) + "</span><span>" + esc(x.from) + " → " + esc(x.to) + " · " + ((x.bags || 0) + (x.oversize || 0)) + " pcs · " + (LABEL[x.status] || x.status) + "</span>" +
            (sameClub ? '<span class="pill ok">clubbed · ' + esc(d.admin.club) + "</span>" :
              '<button class="btn sm" data-club="' + esc(x.id) + '">Club with this move</button>') + "</div>";
        }).join("");
      el.appendChild(clubBox);
      clubBox.querySelectorAll("[data-club]").forEach(function (b) {
        b.addEventListener("click", function () {
          var other = ALL.filter(function (x) { return x.id === b.dataset.club; })[0];
          if (!other) return;
          var clubId = (d.admin && d.admin.club) || (other.admin && other.admin.club) || ("CL-" + String(Math.floor(Math.random() * 900) + 100));
          act(d, function (c) { c.admin.club = clubId; }, "Clubbed into run " + clubId + " with " + other.id + " (internal · same date)").then(function () {
            var c2 = JSON.parse(JSON.stringify(other));
            c2.admin = c2.admin || {};
            c2.admin.club = clubId;
            c2.events = (c2.events || []).concat([{ at: DB.now(), by: "admin", text: "Clubbed into run " + clubId + " with " + d.id + " (internal · same date)" }]);
            DB.put("bookings", other.id, c2);
          });
        });
      });
    }
    if (d.admin && d.admin.club) {
      var tag = document.createElement("div");
      tag.className = "src";
      tag.style.marginTop = "8px";
      tag.innerHTML = 'Run <span class="pill info">' + esc(d.admin.club) + "</span> · clubbed with " +
        (ALL.filter(function (x) { return x.id !== d.id && x.admin && x.admin.club === d.admin.club; }).map(function (x) { return x.id; }).join(", ") || "—");
      el.appendChild(tag);
    }
  }

  /* ---------------- quotes and payments ---------------- */
  var CFG = window.BAGDROP_CONFIG || {};
  var UCMODE = { d2a: "air", a2d: "air", h2a: "air", h2h: "road", d2d: "road", rail: "rail", cruise: "sea" };
  (function initQuoteForm() {
    var ucSel = $("qt-uc");
    Object.keys(P.UCNAME).forEach(function (k) {
      if (k === "wed") return;
      var o = document.createElement("option");
      o.value = k; o.textContent = P.UCNAME[k];
      ucSel.appendChild(o);
    });
    ["qt-from", "qt-to"].forEach(function (id) {
      P.CITIES.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.name; o.textContent = c.name;
        $(id).appendChild(o);
      });
    });
    $("qt-from").value = "Ahmedabad"; $("qt-to").value = "Mumbai";
    $("qt-date").value = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    var pay = CFG.payments || {};
    $("qt-upi").textContent = pay.upi || "—";
    $("qt-bank").textContent = pay.bank || "—";
    $("qt-gst").textContent = pay.gst || "—";
    ["qt-uc", "qt-date", "qt-from", "qt-to", "qt-bags", "qt-odd", "qt-disc", "qt-newrate"].forEach(function (id) {
      $(id).addEventListener("change", renderQuoteBreakdown);
      $(id).addEventListener("input", renderQuoteBreakdown);
    });
    $("qt-override").addEventListener("click", function () {
      var w = $("qt-overwrap");
      w.hidden = !w.hidden;
      if (w.hidden) { $("qt-newrate").value = ""; $("qt-overwhy").value = ""; }
      renderQuoteBreakdown();
    });
    /* customer master lookup: name, phone or email pulls previous data */
    ["qt-name", "qt-mob", "qt-em"].forEach(function (id) {
      $(id).addEventListener("change", quoteLookup);
    });
    /* ---- travel-plan console: pickup and delivery timing from the airline schedule ---- */
    function hhmm(t, deltaMin) {
      var p = t.split(":");
      var tot = (+p[0]) * 60 + (+p[1]) + deltaMin;
      var day = Math.floor(tot / 1440);
      tot = ((tot % 1440) + 1440) % 1440;
      return ("0" + Math.floor(tot / 60)).slice(-2) + ":" + ("0" + (tot % 60)).slice(-2) +
        (day < 0 ? " (day before)" : day > 0 ? " (next day)" : "");
    }
    function niceDate(iso) {
      if (!iso) return "—";
      try { return new Date(iso + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return iso; }
    }
    function shiftDate(iso, days) {
      var d = new Date(iso + "T12:00:00");
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    }
    function slotFor(counterHHMM) {
      /* suggest the latest window that still lands bags ~2 h before the counter time */
      var mins = +counterHHMM.slice(0, 2) * 60 + +counterHHMM.slice(3, 5) - 120;
      var slots = [["06:00–08:00", 480], ["08:00–10:00", 600], ["10:00–12:00", 720], ["12:00–14:00", 840], ["16:00–18:00", 1080], ["18:00–20:00", 1200]];
      var ok = slots.filter(function (s) { return s[1] <= mins; });
      return ok.length ? ok[ok.length - 1][0] : null;
    }
    function travelPlan() {
      var uc = val("qt-uc"), m = UCMODE[uc] || "road";
      var flighty = m === "air" || m === "rail" || m === "sea";
      $("qt-flightrow").hidden = !flighty;
      $("qt-timerow").hidden = !flighty;
      var arriving = uc === "a2d";
      $("qt-ftimelab").firstChild.textContent =
        m === "rail" ? "Train departure time" : m === "sea" ? "Sailing time" : arriving ? "Flight arrival time" : "Flight departure time";
      $("qt-datelab").firstChild.textContent = flighty ? "Travel / flight date" : "Travel date";

      var date = val("qt-date"), t = val("qt-ftime");
      var mins = { air: 240, rail: 90, sea: 180 }[m] || 0;
      var counter = flighty && t ? hhmm(t, -mins) : null;
      var carousel = flighty && t ? hhmm(t, 35) : null;
      var sameZone = (P.cityByName(val("qt-from")) || {}).zone === (P.cityByName(val("qt-to")) || {}).zone;

      /* suggestions */
      var sugPick, sugDel, sugSlot = null;
      if (arriving) { sugPick = date; sugDel = date; }
      else if (flighty) {
        var prevDay = counter && counter.indexOf("day before") >= 0;
        sugSlot = counter ? slotFor(counter) : null;
        if (prevDay || (counter && !sugSlot)) {
          /* counter time too early for a same-day window → pick up the evening before */
          sugPick = date ? shiftDate(date, -1) : "";
          sugSlot = sugSlot && prevDay ? sugSlot : "18:00–20:00";
        } else sugPick = date;
        sugDel = date;
      } else { sugPick = date; sugDel = date ? shiftDate(date, sameZone ? 1 : 2) : ""; }

      /* auto-fill — and keep tracking the schedule until ops types their own value */
      window.__qtAuto = window.__qtAuto || { pick: "", del: "", slot: "" };
      var A = window.__qtAuto;
      if (sugPick && (!val("qt-pickdate") || val("qt-pickdate") === A.pick)) { $("qt-pickdate").value = sugPick; A.pick = sugPick; }
      if (sugDel && (!val("qt-ddate") || val("qt-ddate") === A.del)) { $("qt-ddate").value = sugDel; A.del = sugDel; }
      if (sugSlot && (!val("qt-slot") || val("qt-slot") === A.slot)) { $("qt-slot").value = sugSlot; A.slot = sugSlot; }

      $("qt-cutoff").textContent = !flighty ? "—" : !t ? "Set the time — cut-offs compute from it." :
        arriving ? "Driver at the carousel by " + carousel : "Bags at the counter by " + counter + " (" + (mins / 60) + " h before)";
      $("qt-delnote").textContent = arriving ? "Home delivery the same day, after the carousel pickup."
        : flighty ? "Bags reach the airport the flight day — traveller collects at the Bagdrop counter."
        : "Door to door by road · " + (sameZone ? "next-day" : "second-day") + " delivery on this lane.";

      /* timing console */
      var chips = [];
      var pd = val("qt-pickdate"), dd = val("qt-ddate"), slot = val("qt-slot");
      var fl = val("qt-flight"), pnr = val("qt-pnr");
      if (arriving) {
        chips.push(["Flight lands", (fl || "flight") + (t ? " · " + t : "") + " · " + niceDate(date), "now"]);
        if (carousel) chips.push(["Carousel pickup", "driver at the belt by " + carousel, ""]);
        chips.push(["Out for delivery", "straight from the terminal", ""]);
        chips.push(["Delivered home", niceDate(dd) + " · against OTP", "done"]);
      } else if (flighty) {
        chips.push(["Pickup", niceDate(pd) + (slot ? " · " + slot : " · window TBC"), "now"]);
        chips.push(["Hub + line haul", "sealed, scanned, on the run", ""]);
        if (counter) chips.push([m === "rail" ? "Parcel office" : m === "sea" ? "Terminal hall" : "At the counter", "by " + counter + " on " + niceDate(date), ""]);
        chips.push([m === "rail" ? "Train departs" : m === "sea" ? "Sailing" : "Flight departs", (fl || "—") + (pnr ? " · PNR " + pnr : "") + (t ? " · " + t : ""), "done"]);
      } else {
        chips.push(["Pickup", niceDate(pd) + (slot ? " · " + slot : " · window TBC"), "now"]);
        chips.push(["Line haul", sameZone ? "same-region run" : "overnight inter-city", ""]);
        chips.push(["Delivered", niceDate(dd) + " · against OTP", "done"]);
      }
      $("qt-plan").innerHTML = chips.map(function (c) {
        return '<div class="st ' + c[2] + '" style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(c[0]) + '</b><span style="text-align:right">' + esc(c[1]) + "</span></div>";
      }).join("");
    }
    ["qt-uc", "qt-date", "qt-ftime", "qt-pickdate", "qt-ddate", "qt-slot", "qt-flight", "qt-pnr", "qt-from", "qt-to"].forEach(function (id) {
      $(id).addEventListener("change", travelPlan);
    });
    travelPlan();
    /* business and payer sub-rows */
    $("qt-ctype").addEventListener("change", function () { $("qt-bizrow").hidden = val("qt-ctype") !== "business"; });
    $("qt-payer").addEventListener("change", function () { $("qt-payerrow").hidden = !$("qt-payer").checked; });
    renderQuoteBreakdown();
  })();
  function quoteLookup() {
    var box = $("qt-lookup");
    var mob = val("qt-mob").replace(/\D/g, ""), em = val("qt-em").toLowerCase(), nm = val("qt-name").toLowerCase();
    var hits = ALL.filter(function (d) {
      var t = d.traveller || {};
      return (mob.length >= 10 && (t.mobile || "").replace(/\D/g, "").indexOf(mob) >= 0) ||
        (em && (t.email || "").toLowerCase() === em) ||
        (nm.length > 3 && (t.name || "").toLowerCase() === nm);
    });
    if (!hits.length) { box.hidden = true; return; }
    var last = hits[0];
    var value = hits.reduce(function (a, d) { return a + (d.pay ? d.pay.amount : 0); }, 0);
    box.hidden = false;
    box.innerHTML = "<b>Master match</b> · " + esc(last.traveller.name) + " · " + hits.length + " previous booking(s) · lifetime " + DB.inr(value) +
      "<br>Last: " + esc(last.from) + " → " + esc(last.to) + " · " + esc(last.date) + " · " + (LABEL[last.status] || last.status) +
      ' <button class="btn sm" id="qt-prefill">Prefill from master</button>';
    $("qt-prefill").addEventListener("click", function () {
      $("qt-name").value = last.traveller.name || val("qt-name");
      $("qt-mob").value = last.traveller.mobile || val("qt-mob");
      $("qt-em").value = last.traveller.email || val("qt-em");
      var from = P.cityByName(last.from), to = P.cityByName(last.to);
      if (from) $("qt-from").value = last.from;
      if (to) $("qt-to").value = last.to;
      $("qt-src").value = "Repeat customer";
      renderQuoteBreakdown();
      say("Prefilled from the customer master — " + hits.length + " previous booking(s) found.");
    });
  }
  function quoteCalc() {
    var from = P.cityByName(val("qt-from")), to = P.cityByName(val("qt-to"));
    if (!from || !to) return null;
    /* the master is the route rate chart; the matrix only fills the gaps */
    var r = P.quoteCity({ fromName: from.name, toName: to.name, bags: +val("qt-bags") || 0, oversize: +val("qt-odd") || 0, mode: UCMODE[val("qt-uc")] || "road", date: val("qt-date") });
    if (r.error) { $("qt-masterrate").textContent = "—"; return r; }
    var masterLabel = r.source === "route"
      ? r.routeName + " · " + r.rule + " = " + DB.inr(r.base) + (r.routeNote ? " (" + r.routeNote + ")" : "")
      : "no route row — fallback matrix · " + r.rule;
    /* override replaces the computed BASE amount, gated by the ops passcode */
    var override = !$("qt-overwrap").hidden && +val("qt-newrate") > 0 ? Math.round(+val("qt-newrate")) : null;
    if (override) {
      var taxable = override + r.oversize + r.handling - r.slab + r.peak;
      r.base = override;
      r.gst = Math.round(taxable * ((window.BAGDROP_CONFIG || {}).gstRate || 0.18));
      r.total = taxable + r.gst;
      r.perBag = Math.round(r.total / r.billed);
      masterLabel += " → base overridden to " + DB.inr(override);
    }
    $("qt-masterrate").textContent = masterLabel;
    var disc = Math.min(30, Math.max(0, +val("qt-disc") || 0));
    r.discount = Math.round(r.total * disc / 100);
    r.discountPct = disc;
    r.final = r.total - r.discount;
    r.zo = from.zone; r.zd = to.zone;
    r.masterRate = r.source === "route" ? r.base : r.rate;
    r.overrideRate = override;
    $("qt-passrow").hidden = !(override || disc > 0);
    return r;
  }
  function renderQuoteBreakdown() {
    var r = quoteCalc(), el = $("qt-breakdown");
    if (!r) { el.innerHTML = '<li><span class="src">Pick the cities.</span></li>'; return; }
    if (r.error) { el.innerHTML = '<li><span class="m">Blocked</span><span style="color:var(--bad)">' + esc(r.error) + "</span></li>"; return; }
    el.innerHTML =
      '<li><span class="m">Base</span><span class="num">' + esc(r.rule) + " = " + DB.inr(r.base) + "</span></li>" +
      (r.oversize ? '<li><span class="m">Oversize</span><span class="num">' + DB.inr(r.oversize) + "</span></li>" : "") +
      (r.handling ? '<li><span class="m">Handling</span><span class="num">' + DB.inr(r.handling) + "</span></li>" : "") +
      (r.slab ? '<li><span class="m">Slab</span><span class="num">−' + DB.inr(r.slab) + "</span></li>" : "") +
      (r.peak ? '<li><span class="m">Peak</span><span class="num">+' + DB.inr(r.peak) + "</span></li>" : "") +
      '<li><span class="m">GST 5%</span><span class="num">' + DB.inr(r.gst) + "</span></li>" +
      (r.discount ? '<li><span class="m">Discount</span><span class="num" style="color:var(--warn)">−' + DB.inr(r.discount) + " (" + r.discountPct + "%)</span></li>" : "") +
      '<li><span class="m">Total</span><span class="num" style="font-family:var(--display);font-weight:800;font-size:18px">' + DB.inr(r.final) + "</span></li>" +
      '<li><span class="m">Per piece</span><span class="num">' + DB.inr(Math.round(r.final / r.billed)) + " · " + r.billed + " billed</span></li>";
  }
  function quoteLink(id) { return location.href.replace(/admin\.html.*/, "") + "index.html?quote=" + id; }
  function waText(d) {
    var pay = CFG.payments || {};
    var arriving = d.uc === "a2d";
    var flightLine = d.ref
      ? (arriving ? "Arriving on " : "Flying ") + d.ref + (d.pnr ? " · PNR " + d.pnr : "") +
        (d.flightTime ? (arriving ? " · lands " : " · departs ") + d.flightTime : "") + "\n"
      : "";
    var planLine = "Pickup " + (d.pickupDate || d.date) + (d.slot ? " · " + d.slot : "") +
      (d.deliveryDate ? " → delivered " + d.deliveryDate : "") + "\n";
    return "Hello " + (d.traveller.name || "").split(" ")[0] + ", your Bagdrop quote is ready.\n\n" +
      d.ucName + " · " + d.from + " → " + d.to + " · " + d.date + "\n" + flightLine + planLine +
      d.bags + " bag(s)" + (d.oversize ? " + " + d.oversize + " oversize" : "") + " · total " + DB.inr(d.quote.total) + " incl GST\n" +
      "Price locked until " + DB.fmt(d.quote.validUntil) + " · quote " + d.quote.qid + "\n\n" +
      "Pay and confirm in one tap: " + quoteLink(d.id) + "\n" +
      (pay.upi ? "Or UPI: " + pay.upi + " (reference " + d.id + ")\n" : "") +
      (pay.bank ? "Bank transfer: " + pay.bank + "\n" : "") +
      "\nBags are sealed with you at pickup, tracked door to door, released only against OTP. — Team Bagdrop";
  }
  function renderQr(container, upiString) {
    container.innerHTML = "";
    if (window.QRCode) {
      new window.QRCode(container, { text: upiString, width: 132, height: 132, correctLevel: window.QRCode.CorrectLevel.M });
    } else {
      container.innerHTML = '<span class="src" style="color:#333">QR library offline — share the UPI ID instead.</span>';
    }
  }
  function openShare(d) {
    $("qt-sharecard").hidden = false;
    $("qt-saved").innerHTML = "<b>" + esc(d.id) + "</b> · " + DB.inr(d.quote.total) +
      (d.ref ? " · ✈ " + esc(d.ref) + (d.flightTime ? " · " + (d.uc === "a2d" ? "lands " : "departs ") + esc(d.flightTime) : "") + (d.pnr ? " · PNR " + esc(d.pnr) : "") : "") +
      (d.quote.validUntil ? " · locked until " + DB.fmt(d.quote.validUntil) : "");
    $("qt-link").textContent = quoteLink(d.id);
    $("qt-watext").textContent = waText(d);
    var pay = CFG.payments || {};
    var upi = "upi://pay?pa=" + encodeURIComponent(pay.upi || "") + "&pn=" + encodeURIComponent("Bagdrop") +
      "&am=" + Math.round(d.quote.total) + "&cu=INR&tn=" + encodeURIComponent(d.id);
    renderQr($("qt-qr"), upi);
    $("qt-sharecard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("qt-save").addEventListener("click", function () {
    var msg = $("qt-msg");
    if (!val("qt-name")) { msg.textContent = "Customer name is needed — it is matched at identity check."; return; }
    if (!/^\+?[\d\s-]{10,15}$/.test(val("qt-mob"))) { msg.textContent = "A valid mobile is needed for the payment link."; return; }
    var r = quoteCalc();
    if (!r || r.error) { msg.textContent = r ? r.error : "Pick the cities."; return; }
    if (r.discountPct > 0 && !val("qt-why")) { msg.textContent = "A discount needs a reason — it is logged in the audit trail."; return; }
    if (r.overrideRate && !val("qt-overwhy")) { msg.textContent = "A rate override needs a reason — it is logged in the audit trail."; return; }
    if ((r.overrideRate || r.discountPct > 0) && val("qt-pass") !== String(CFG.opsPasscode || "")) {
      msg.textContent = "Wrong ops passcode. Rate overrides and discounts are gated — the master rate applies without it.";
      return;
    }
    var id = DB.id("BD");
    var hours = +val("qt-valid") || 24;
    var doc = {
      id: id, created: DB.now(), status: "quoted",
      uc: val("qt-uc"), ucName: P.UCNAME[val("qt-uc")], mode: UCMODE[val("qt-uc")] || "road",
      from: val("qt-from"), to: val("qt-to"),
      pickAddr: val("qt-pickaddr"), dropAddr: val("qt-dropaddr"),
      zo: r.zo, zd: r.zd, date: val("qt-date"),
      pickupDate: val("qt-pickdate") || val("qt-date"), deliveryDate: val("qt-ddate") || null,
      ref: val("qt-flight").toUpperCase(), pnr: val("qt-pnr").toUpperCase(),
      flightTime: val("qt-ftime") || null,
      slot: val("qt-slot"),
      bags: +val("qt-bags") || 0, oversize: +val("qt-odd") || 0, billed: r.billed,
      traveller: { title: val("qt-title"), name: val("qt-name"), mobile: val("qt-mob"), email: val("qt-em"), res: val("qt-res") },
      customerType: val("qt-ctype"),
      business: val("qt-ctype") === "business" ? { name: val("qt-bizname"), gstin: val("qt-gstin").toUpperCase() } : null,
      paymentTerms: val("qt-terms"),
      payer: $("qt-payer").checked ? { name: val("qt-pnm"), contact: val("qt-pct") } : null,
      note: val("qt-note"), source: "admin · " + val("qt-src"),
      quote: {
        qid: "QT-" + String(Math.floor(Math.random() * 9000) + 1000),
        total: r.final, breakdown: r,
        validUntil: new Date(Date.now() + hours * 3600000).toISOString(),
        discountPct: r.discountPct, discountReason: val("qt-why") || null,
        masterRate: r.masterRate, overrideRate: r.overrideRate || null, overrideReason: r.overrideRate ? val("qt-overwhy") : null
      },
      identity: null, pay: null, admin: { createdBy: "ops" },
      events: [{
        at: DB.now(), by: "admin",
        text: "Quote made by the team (" + val("qt-src") + ") · master rate " + DB.inr(r.masterRate) +
          (r.overrideRate ? " overridden to " + DB.inr(r.overrideRate) + " — " + val("qt-overwhy") + " [passcode]" : "") +
          (r.discountPct ? " · discount " + r.discountPct + "% — " + val("qt-why") + " [passcode]" : "") +
          " · locked " + hours + " h"
      }]
    };
    DB.put("bookings", id, doc).then(function () {
      openShare(doc);
      msg.textContent = "";
      $("qt-pass").value = "";
      say("Quote saved. Payment link and QR ready to share.");
    });
  });
  $("qt-copylink").addEventListener("click", function () {
    navigator.clipboard.writeText($("qt-link").textContent).then(function () { say("Payment link copied."); });
  });
  $("qt-copymsg").addEventListener("click", function () {
    navigator.clipboard.writeText($("qt-watext").textContent).then(function () { say("WhatsApp message copied. In production this sends via the Meta Cloud API."); });
  });
  $("qt-openlink").addEventListener("click", function () { window.open($("qt-link").textContent, "_blank"); });

  function renderQuotes() {
    var open = ALL.filter(function (d) { return (d.status === "quoted" || d.status === "identified") && !d.pay; });
    $("nav-quote").textContent = open.length;
    var rows = $("qt-rows");
    if (!open.length) { rows.innerHTML = '<tr><td colspan="8" class="src">No open quotes. Website quotes land here too the moment a customer unlocks a price.</td></tr>'; return; }
    rows.innerHTML = open.map(function (d) {
      var vu = d.quote.validUntil ? new Date(d.quote.validUntil) : null;
      var expired = vu && vu < new Date();
      return '<tr><td class="mono">' + esc(d.quote.qid || d.id) + '<br><span class="src">' + esc(d.id) + "</span></td>" +
        "<td>" + esc(d.traveller.name || "—") + '<br><span class="src">' + esc(d.traveller.mobile || "") + "</span></td>" +
        "<td>" + esc(d.from) + " → " + esc(d.to) + '<br><span class="src">' + esc(d.date) +
          (d.ref ? " · ✈ " + esc(d.ref) + (d.flightTime ? " " + esc(d.flightTime) : "") + (d.pnr ? " · " + esc(d.pnr) : "") : "") +
          (d.slot ? " · pickup " + esc(d.slot) : "") + "</span></td>" +
        '<td class="num">' + d.billed + "</td>" +
        '<td class="num">' + DB.inr(d.quote.total) + "</td>" +
        "<td>" + (vu ? '<span class="pill ' + (expired ? "bad" : "ok") + '">' + (expired ? "expired" : DB.fmt(d.quote.validUntil)) + "</span>" : '<span class="pill mute">24 h</span>') + "</td>" +
        '<td class="src">' + esc(d.source || "website") + "</td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-qshare="' + esc(d.id) + '">Share + QR</button> <button class="btn sm" data-qcopy="' + esc(d.id) + '">Link</button> <button class="btn sm" data-qwa="' + esc(d.id) + '">WhatsApp</button> <button class="btn sm primary" data-qpaid="' + esc(d.id) + '">Mark paid</button></td></tr>';
    }).join("");
    rows.querySelectorAll("[data-qshare]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.qshare; })[0];
        if (d) openShare(d);
      });
    });
    rows.querySelectorAll("[data-qcopy]").forEach(function (b) {
      b.addEventListener("click", function () { navigator.clipboard.writeText(quoteLink(b.dataset.qcopy)).then(function () { say("Payment link copied."); }); });
    });
    rows.querySelectorAll("[data-qwa]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.qwa; })[0];
        if (d) navigator.clipboard.writeText(waText(d)).then(function () { say("WhatsApp message copied."); });
      });
    });
    rows.querySelectorAll("[data-qpaid]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.qpaid; })[0];
        if (!d) return;
        act(d, function (c) {
          c.pay = { mode: "full", amount: Math.round(d.quote.total), status: "captured", gateway: "Manual · UPI/bank", at: DB.now() };
        }, "Payment received manually (UPI/bank) · " + DB.inr(d.quote.total) + " · booked", "submitted");
      });
    });
  }

  /* ---------------- exceptions (reference queue) ---------------- */
  (function () {
    var rows = [
      ["bad", "Seal mismatch", "BD-0293", "Hub BLR", "−12 min", "Escalate", "Escalated to Ops lead. Customer notified with photo comparison."],
      ["warn", "Cut off at risk", "BD-0271", "Ops lead", "38 min", "Resolve", "Resolved: captain run from MUM hub."],
      ["warn", "Over 32 kg", "BD-0295", "Captain Ravi K", "1 h 10", "Re-rate", "Re-rated as oversize. Customer approved on WhatsApp."],
      ["info", "Identity review", "BD-0296", "Sales", "3 h 40", "Review", "Match 0.78 confirmed by customer. Payment unlocked."]
    ];
    $("excrows").innerHTML = rows.map(function (r) {
      return '<tr><td><span class="pill ' + r[0] + '">' + r[1] + '</span></td><td class="num">' + r[2] + "</td><td>" + r[3] + '</td><td class="num">' + r[4] + '</td><td><button class="btn sm" data-toast="' + esc(r[6]) + '">' + r[5] + "</button></td></tr>";
    }).join("");
  })();
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-toast]");
    if (b) say(b.dataset.toast);
  });

  /* ---------------- events and bulk ---------------- */
  document.querySelectorAll("#evtabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("#evtabs button").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      $("ev-list").hidden = b.dataset.t !== "list";
      $("ev-new").hidden = b.dataset.t !== "new";
    });
  });
  (function () {
    ["ev-city", "ev-addsec-city"].forEach(function (id) {
      var el = $(id);
      P.CITIES.forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.name; o.textContent = c.name;
        el.appendChild(o);
      });
    });
    $("ev-city").value = "Udaipur";
    var d = new Date(); d.setMonth(d.getMonth() + 2);
    $("ev-in").value = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 1);
    $("ev-out").value = d.toISOString().slice(0, 10);
  })();

  var sectors = [];
  var evCode = DB.eventCode("WED");
  $("ev-code").textContent = evCode; $("es-code").textContent = evCode;
  $("ev-type").addEventListener("change", function () {
    evCode = DB.eventCode(val("ev-type"));
    $("ev-code").textContent = evCode; $("es-code").textContent = evCode;
  });
  function suggestRate(fromCity) {
    var from = P.cityByName(fromCity), to = P.cityByName(val("ev-city"));
    if (!from || !to) return 3500;
    var qq = P.quote({ zo: from.zone, zd: to.zone, bags: 1, oversize: 0, mode: "road", date: val("ev-in"), rates: RATES });
    return qq.rate || 3500;
  }
  function renderSectors() {
    $("ev-sectors").innerHTML = sectors.map(function (sct, i) {
      return '<div class="sec">' +
        '<label class="f">Pickup city<input value="' + esc(sct.city) + '" disabled></label>' +
        '<label class="f">Rate / bag / leg (₹)<input data-si="' + i + '" data-k="rate" inputmode="numeric" value="' + sct.rate + '"></label>' +
        '<label class="f">Pickup day<input data-si="' + i + '" data-k="pickDay" type="date" value="' + sct.pickDay + '"></label>' +
        '<label class="f">Return day<input data-si="' + i + '" data-k="retDay" type="date" value="' + sct.retDay + '"></label>' +
        '<button class="btn sm" data-del="' + i + '">Remove</button></div>';
    }).join("") || '<div class="src">No sectors yet. Add one per pickup city.</div>';
    $("ev-sectors").querySelectorAll("input[data-si]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var sct = sectors[+inp.dataset.si];
        sct[inp.dataset.k] = inp.dataset.k === "rate" ? (+inp.value || 0) : inp.value;
        evSummary();
      });
    });
    $("ev-sectors").querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () { sectors.splice(+b.dataset.del, 1); renderSectors(); evSummary(); });
    });
    evSummary();
  }
  $("ev-addsec").addEventListener("click", function () {
    var city = val("ev-addsec-city");
    if (sectors.some(function (x) { return x.city === city; })) { say("That city already has a sector."); return; }
    var inD = new Date(val("ev-in")); inD.setDate(inD.getDate() - 2);
    sectors.push({ city: city, rate: suggestRate(city), pickDay: inD.toISOString().slice(0, 10), retDay: val("ev-out") });
    renderSectors();
  });
  renderSectors();

  function evSummary() {
    $("es-venue").textContent = (val("ev-venue") || "—") + (val("ev-city") ? " · " + val("ev-city") : "");
    $("es-dates").textContent = (val("ev-in") || "—") + " → " + (val("ev-out") || "—");
    $("es-sec").textContent = sectors.length;
    $("es-bill").textContent = { host: "host pays", split: "host out, families return", family: "families pay" }[val("ev-bill")];
    var bags = +val("ev-expb") || 0;
    if (bags && sectors.length) {
      var avg = sectors.reduce(function (a, x) { return a + x.rate; }, 0) / sectors.length;
      var legs = val("ev-dir") === "both" ? 2 : 1;
      var gross = avg * bags * legs;
      var slab = gross * ((+val("ev-rslab") || 0) / 100);
      var est = Math.round((gross - slab) * 1.05);
      $("es-est").textContent = DB.inr(est) + " incl GST";
    } else $("es-est").textContent = "—";
  }
  ["ev-name", "ev-venue", "ev-city", "ev-in", "ev-out", "ev-bill", "ev-dir", "ev-expf", "ev-expb", "ev-rslab"].forEach(function (id) {
    $(id).addEventListener("change", evSummary);
  });

  $("ev-save").addEventListener("click", function () {
    if (!val("ev-name")) { $("ev-msg").textContent = "The wedding needs a name."; return; }
    if (!sectors.length) { $("ev-msg").textContent = "Add at least one sector — guests can only book from sector cities."; return; }
    var doc = {
      id: evCode, created: DB.now(), status: "open",
      name: val("ev-name"), type: val("ev-type"),
      venueCity: val("ev-city"), venue: val("ev-venue"),
      dates: { in: val("ev-in"), out: val("ev-out") },
      direction: val("ev-dir"), billing: val("ev-bill"),
      expected: { families: +val("ev-expf") || null, bags: +val("ev-expb") || null },
      rates: { oversize: +val("ev-rodd") || 900, minBags: +val("ev-rmin") || 2, slabPct: +val("ev-rslab") || 0, depositPct: +val("ev-rdep") || 0 },
      sectors: sectors,
      contacts: { host: val("ev-host"), hostMobile: val("ev-hostmob"), planner: val("ev-planner"), onsite: val("ev-onsite") },
      landing: {
        names: val("ev-lnames") || val("ev-name"),
        hashtag: val("ev-lhash"),
        datesText: val("ev-ldates"),
        sides: val("ev-lsides"),
        celebration: val("ev-lcel"),
        destination: val("ev-ldest")
      }
    };
    DB.put("events", evCode, doc).then(function () {
      var link = location.href.replace(/admin\.html.*/, "") + "wedding.html?code=" + evCode;
      $("ev-done").hidden = false;
      $("ev-done").innerHTML = "<b>Saved</b> · " + esc(doc.name) + " is open. Guest link ready below.";
      $("es-share").hidden = false;
      $("es-link").textContent = link;
      $("ev-msg").textContent = "";
      say("Wedding saved. Guest link created.");
    });
  });
  $("es-copy").addEventListener("click", function () {
    navigator.clipboard.writeText($("es-link").textContent).then(function () { say("Link copied."); });
  });
  $("es-open").addEventListener("click", function () { window.open($("es-link").textContent, "_blank"); });
  $("ev-reset").addEventListener("click", function () {
    sectors = []; renderSectors();
    ["ev-name", "ev-venue", "ev-host", "ev-hostmob", "ev-planner", "ev-onsite", "ev-lnames", "ev-lhash", "ev-ldates", "ev-lsides", "ev-lcel", "ev-ldest", "ev-expf", "ev-expb"].forEach(function (id) { $(id).value = ""; });
    evCode = DB.eventCode(val("ev-type"));
    $("ev-code").textContent = evCode; $("es-code").textContent = evCode;
    $("ev-done").hidden = true; $("es-share").hidden = true;
  });

  function renderEvents() {
    if (!EVENTS.length) { $("wx-rows").innerHTML = '<tr><td colspan="7" class="src">No weddings open yet.</td></tr>'; return; }
    $("wx-rows").innerHTML = EVENTS.map(function (e) {
      var fams = ALL.filter(function (d) { return d.eventCode === e.id; });
      var bags = fams.reduce(function (a, d) { return a + (d.bags || 0) + (d.oversize || 0); }, 0);
      var base = location.href.replace(/admin\.html.*/, "");
      var link = base + (e.page ? e.page : "wedding.html?code=" + e.id);
      var opsLink = e.page ? base + e.page + "?ops=1" : null;
      return "<tr><td><b>" + esc(e.name) + '</b><br><span class="src mono">' + esc(e.id) + "</span></td>" +
        "<td>" + esc(e.venue || e.venueCity) + '<br><span class="src">' + esc(e.dates.in) + " → " + esc(e.dates.out) + "</span></td>" +
        '<td class="num">' + (e.sectors || []).length + "</td>" +
        '<td class="num">' + fams.length + (e.expected.families ? " / " + e.expected.families : "") + "</td>" +
        '<td class="num">' + bags + (e.expected.bags ? " / " + e.expected.bags : "") + "</td>" +
        '<td><span class="pill ' + (e.status === "open" ? "ok" : "mute") + '">' + esc(e.status) + "</span></td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-copy="' + esc(link) + '">Copy link</button> <a class="btn sm" style="text-decoration:none" href="' + esc(link) + '" target="_blank">Open</a>' +
        (opsLink ? ' <a class="btn sm primary" style="text-decoration:none" href="' + esc(opsLink) + '" target="_blank">Ops desk</a>' : "") + "</td></tr>";
    }).join("");
    $("wx-rows").querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { navigator.clipboard.writeText(b.dataset.copy).then(function () { say("Guest link copied."); }); });
    });
  }
  function convertInquiry(i) {
    $("ev-name").value = i.contact.name + " — " + (i.venue || i.venueCity);
    $("ev-city").value = P.cityByName(i.venueCity) ? i.venueCity : $("ev-city").value;
    $("ev-venue").value = i.venue || "";
    if (i.dates.from) $("ev-in").value = i.dates.from;
    if (i.dates.to) $("ev-out").value = i.dates.to;
    $("ev-expf").value = i.families || "";
    $("ev-expb").value = i.bags || "";
    $("ev-host").value = i.contact.role === "host" ? i.contact.name : "";
    $("ev-hostmob").value = i.contact.role === "host" ? i.contact.mobile : "";
    $("ev-planner").value = i.contact.role === "planner" ? i.contact.name : "";
    sectors = (i.pickupCities || []).filter(function (c) { return P.cityByName(c); }).map(function (c) {
      var inD = new Date(i.dates.from || Date.now()); inD.setDate(inD.getDate() - 2);
      return { city: c, rate: suggestRate(c), pickDay: inD.toISOString().slice(0, 10), retDay: i.dates.to || "" };
    });
    renderSectors();
    var ci = JSON.parse(JSON.stringify(i)); ci.status = "converted";
    DB.put("inquiries", i.id, ci);
    crmLog("Lead " + i.id + " (" + i.contact.name + ") converted — wedding form prefilled", i.id);
    show("evt");
    document.querySelector('#evtabs [data-t="new"]').click();
    evSummary();
    say("Inquiry loaded into the wedding form. Set the rates and save.");
  }
  function wireConvertButtons(root) {
    root.querySelectorAll("[data-conv]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = INQ.filter(function (x) { return x.id === b.dataset.conv; })[0];
        if (i) convertInquiry(i);
      });
    });
    root.querySelectorAll("[data-contacted]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = INQ.filter(function (x) { return x.id === b.dataset.contacted; })[0];
        if (!i) return;
        var ci = JSON.parse(JSON.stringify(i)); ci.status = "contacted";
        DB.put("inquiries", i.id, ci);
        crmLog("Lead " + i.id + " (" + i.contact.name + ") marked contacted", i.id);
      });
    });
  }
  function renderInquiries() {
    if (!INQ.length) { $("ld-rows").innerHTML = '<tr><td colspan="6" class="src">No inquiries yet.</td></tr>'; return; }
    $("ld-rows").innerHTML = INQ.map(function (i) {
      return "<tr><td>" + DB.fmt(i.created) + "</td>" +
        "<td>" + esc(i.contact.name) + " (" + esc(i.contact.role) + ')<br><span class="src">' + esc(i.contact.mobile) + "</span></td>" +
        "<td>" + esc(i.venue || i.venueCity) + '<br><span class="src">' + esc(i.dates.from || "—") + " → " + esc(i.dates.to || "—") + "</span></td>" +
        "<td>" + (i.pickupCities || []).map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</td>" +
        '<td class="num">' + (i.families || "?") + " fam · " + (i.bags || "?") + " bags</td>" +
        "<td>" + (i.status === "new" ? '<button class="btn sm primary" data-conv="' + esc(i.id) + '">Convert</button>' : '<span class="pill ' + (i.status === "converted" ? "ok" : "mute") + '">' + esc(i.status) + "</span>") + "</td></tr>";
    }).join("");
    wireConvertButtons($("ld-rows"));
  }

  /* ---------------- CRM ---------------- */
  function followedKeys() {
    var m = {};
    CRMLOG.forEach(function (c) { if (c.followKey) m[c.followKey] = true; });
    return m;
  }
  function crmLog(text, refId, followKey, msg) {
    var id = "CRM-" + Date.now().toString(36) + Math.floor(Math.random() * 100);
    return DB.put("crm", id, { id: id, created: DB.now(), text: text, refId: refId || null, followKey: followKey || null, msg: msg || null });
  }
  function renderCrm() {
    var sugg = AI.crmSuggestions(ALL, INQ, followedKeys());
    var customers = AI.crmCustomers(ALL);
    var s = AI.stats(ALL, EVENTS, INQ);
    $("crm-new").textContent = s.newLeads;
    $("crm-pipe").textContent = DB.inr(INQ.filter(function (i) { return i.status !== "lost"; }).reduce(function (a, i) { return a + (i.bags || 60) * 3500 * 2; }, 0));
    $("crm-cust").textContent = customers.length;
    $("crm-custd").textContent = customers.filter(function (c) { return c.tier === "gold"; }).length + " gold · " + customers.filter(function (c) { return c.tier === "silver"; }).length + " silver";
    $("crm-conv").textContent = s.total ? s.conversion + "%" : "—";

    /* suggestions */
    $("crm-suggest").innerHTML = sugg.length ? sugg.slice(0, 6).map(function (x, i) {
      return '<div class="sugg"><b>' + (i + 1) + ". " + esc(x.who) + "</b> · " + esc(x.contact) + "<br>" + esc(x.text) +
        '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' +
        (x.action === "convert"
          ? '<button class="btn sm primary" data-conv="' + esc(x.refId) + '">' + esc(x.actionLabel) + "</button>"
          : '<button class="btn sm primary" data-nudge="' + esc(x.refId) + '" data-fk="' + esc(x.followKey || "") + '" data-msg="' + esc(x.msg) + '" data-who="' + esc(x.who) + '">' + esc(x.actionLabel) + "</button>") +
        '<button class="btn sm" data-showmsg="' + esc(x.msg) + '">Preview message</button></div></div>';
    }).join("") : '<div class="a">Quiet — nothing overdue. New leads and stalled bookings appear here ranked, with the message drafted.</div>';
    wireConvertButtons($("crm-suggest"));
    $("crm-suggest").querySelectorAll("[data-nudge]").forEach(function (b) {
      b.addEventListener("click", function () {
        crmLog("Follow-up sent to " + b.dataset.who + " re " + b.dataset.nudge + " — WhatsApp drafted", b.dataset.nudge, b.dataset.fk, b.dataset.msg)
          .then(function () { say("WhatsApp draft ready and logged. In production this sends via the Meta Cloud API."); });
      });
    });
    $("crm-suggest").querySelectorAll("[data-showmsg]").forEach(function (b) {
      b.addEventListener("click", function () { say("Draft: " + b.dataset.showmsg); });
    });

    /* leads table */
    $("crm-leads").innerHTML = INQ.length ? INQ.map(function (i) {
      return "<tr><td>" + DB.fmt(i.created) + "</td><td>" + esc(i.contact.name) + '<br><span class="src">' + esc(i.contact.mobile) + "</span></td>" +
        "<td>" + esc(i.venue || i.venueCity) + " · " + (i.families || "?") + " fam / " + (i.bags || "?") + " bags</td>" +
        '<td><span class="pill ' + (i.status === "new" ? "warn" : i.status === "converted" ? "ok" : "info") + '">' + esc(i.status) + "</span></td>" +
        "<td>" + (i.status === "new" ? '<button class="btn sm primary" data-conv="' + esc(i.id) + '">Convert</button> <button class="btn sm" data-contacted="' + esc(i.id) + '">Contacted</button>' : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="5" class="src">No leads yet.</td></tr>';
    wireConvertButtons($("crm-leads"));

    /* customer master table — matched by name, phone or email */
    if (crmQ) {
      customers = customers.filter(function (c) {
        return ((c.name || "") + " " + (c.mobile || "") + " " + c.bookings.map(function (b) { return b.traveller.email || ""; }).join(" ")).toLowerCase().indexOf(crmQ) >= 0;
      });
    }
    $("crm-customers").innerHTML = customers.length ? customers.map(function (c) {
      return "<tr><td>" + esc(c.name || "—") + '<br><span class="src">' + esc(c.mobile) + "</span></td>" +
        '<td class="num">' + c.bookings.length + " · " + c.pieces + ' pcs</td>' +
        '<td class="num">' + DB.inr(c.value) + "</td>" +
        '<td><span class="pill ' + (c.tier === "gold" ? "warn" : c.tier === "silver" ? "info" : "mute") + '">' + c.tier + "</span></td>" +
        '<td><button class="btn sm" data-openb="' + esc(c.last.id) + '">Open</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="src">No customers yet.</td></tr>';
    $("crm-customers").querySelectorAll("[data-openb]").forEach(function (b) {
      b.addEventListener("click", function () { openBooking(b.dataset.openb); });
    });
  }
  function renderCrmLog() {
    $("crm-log").innerHTML = CRMLOG.length ? CRMLOG.slice(0, 20).map(function (c) {
      return '<div><span class="dot info"></span><span>' + esc(c.text) + (c.msg ? '<br><span class="src">“' + esc(c.msg) + '”</span>' : "") + "</span><time>" + DB.fmt(c.created) + "</time></div>";
    }).join("") : '<div><span class="src">No activity yet.</span></div>';
  }

  /* ---------------- drivers (live tie-ins) ---------------- */
  function renderDrivers() {
    var assigned = ALL.filter(function (d) { return d.status === "assigned" || d.status === "picked_up"; });
    function jobFor(name) {
      var j = assigned.filter(function (d) { return (d.admin || {}).captain === name; })[0];
      return j ? j.id + " · " + ((d => (d.bags || 0) + (d.oversize || 0))(j)) + " pcs" : "—";
    }
    if ($("drv-ravi")) $("drv-ravi").textContent = jobFor("Ravi K");
    if ($("drv-amit")) $("drv-amit").textContent = jobFor("Amit S");
    if ($("drv-sameer")) $("drv-sameer").textContent = jobFor("Sameer D");
    if ($("cap-ravi")) $("cap-ravi").textContent = jobFor("Ravi K") === "—" ? "free" : jobFor("Ravi K");
    if ($("cap-amit")) $("cap-amit").textContent = jobFor("Amit S") === "—" ? "free" : jobFor("Amit S");
    /* driver app push preview from the latest assigned booking */
    var j = assigned[0];
    if (j) {
      $("drv-push-title").textContent = "New pickup · " + j.id + " · " + (j.slot || "slot TBC");
      $("drv-push-body").innerHTML = esc(j.traveller.name) + " · " + esc(j.pickAddr || j.from) + " · " + ((j.bags || 0) + (j.oversize || 0)) + " pieces · " + esc(j.ucName) +
        "<br>Customer verified: " + (j.identity && j.identity.ok ? "name match " + (j.identity.score || 0.9).toFixed(2) : "pending") +
        "<br>Travel " + esc(j.date) + (j.ref ? " · " + esc(j.ref) : "");
    }
  }
  document.querySelectorAll("#drvfilter button[data-f]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("#drvfilter button").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      var f = b.dataset.f;
      document.querySelectorAll("#drvrows tr").forEach(function (r) { r.hidden = f !== "all" && r.dataset.role !== f; });
      document.querySelectorAll("#m-drv .veh").forEach(function (v) { v.style.opacity = (f === "all" || v.dataset.role === f) ? 1 : 0.15; });
    });
  });

  /* ---------------- flights: live ADS-B ---------------- */
  var AP = { BOM: [19.0896, 72.8656], AMD: [23.0772, 72.6347], BDQ: [22.3362, 73.2263], DEL: [28.5562, 77.1000], BLR: [13.1986, 77.7066], HYD: [17.2403, 78.4294], MAA: [12.9941, 80.1709], GOI: [15.3808, 73.8314], GOX: [15.7440, 73.8630], COK: [10.1520, 76.4019], CCU: [22.6547, 88.4467], DXB: [25.2532, 55.3657] };
  var AIR = { IGO: ["6E", "IndiGo"], AIC: ["AI", "Air India"], VTI: ["UK", "Vistara"], AKJ: ["QP", "Akasa Air"], SEJ: ["SG", "SpiceJet"], AXB: ["IX", "Air India Express"], LLR: ["9I", "Alliance Air"], SDG: ["S5", "Star Air"], UAE: ["EK", "Emirates"], QTR: ["QR", "Qatar Airways"], ETD: ["EY", "Etihad"], FDB: ["FZ", "flydubai"], BAW: ["BA", "British Airways"], DLH: ["LH", "Lufthansa"], SIA: ["SQ", "Singapore Airlines"], THA: ["TG", "Thai Airways"], SVA: ["SV", "Saudia"], TUA: ["TK", "Turkish"], CPA: ["CX", "Cathay Pacific"], AFR: ["AF", "Air France"], KLM: ["KL", "KLM"], ETH: ["ET", "Ethiopian"], SLK: ["UL", "SriLankan"], BDA: ["BZ", "Blue Dart"] };
  var IATA2ICAO = {};
  Object.keys(AIR).forEach(function (k) { IATA2ICAO[AIR[k][0]] = k; });
  function km(a, b, c, d) {
    var R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) * Math.sin(y / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fx(url, ms) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, ms || 8000);
    return fetch(url, { signal: c.signal }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function normAdsb(j) {
    return (j.ac || []).filter(function (a) { return a.lat != null; }).map(function (a) {
      return { cs: (a.flight || "").trim(), hex: a.hex, type: a.t || "", reg: a.r || "", lat: a.lat, lon: a.lon, alt: a.alt_baro === "ground" ? 0 : +a.alt_baro || 0, gs: +a.gs || 0, vs: +a.baro_rate || +a.geom_rate || 0, ground: a.alt_baro === "ground" };
    });
  }
  function normOsk(j) {
    return (j.states || []).filter(function (s) { return s[6] != null; }).map(function (s) {
      return { cs: (s[1] || "").trim(), hex: s[0], type: "", reg: "", lat: s[6], lon: s[5], alt: s[7] != null ? Math.round(s[7] * 3.281) : 0, gs: s[9] != null ? Math.round(s[9] * 1.944) : 0, vs: s[11] != null ? Math.round(s[11] * 196.85) : 0, ground: !!s[8] };
    });
  }
  function liveNear(lat, lon, r) {
    var nm = Math.round(r / 1.852), d = r / 111;
    var box = "lamin=" + (lat - d) + "&lomin=" + (lon - d / Math.cos(lat * Math.PI / 180)) + "&lamax=" + (lat + d) + "&lomax=" + (lon + d / Math.cos(lat * Math.PI / 180));
    var chain = [
      ["adsb.lol", "https://api.adsb.lol/v2/point/" + lat + "/" + lon + "/" + nm, normAdsb],
      ["airplanes.live", "https://api.airplanes.live/v2/point/" + lat + "/" + lon + "/" + nm, normAdsb],
      ["OpenSky", "https://opensky-network.org/api/states/all?" + box, normOsk]
    ];
    var i = 0;
    function next() {
      if (i >= chain.length) return Promise.reject(new Error("all sources failed"));
      var c = chain[i++];
      return fx(c[1]).then(function (j) { return { src: c[0], ac: c[2](j) }; }).catch(next);
    }
    return next();
  }
  function phase(a) {
    if (a.ground) return ["on ground", "mute"];
    if (a.alt < 1500 && a.vs < -200) return ["landing", "ok"];
    if (a.alt < 8000 && a.vs < -300) return ["descending", "info"];
    if (a.alt < 8000 && a.vs > 300) return ["climbing", "warn"];
    if (a.alt < 3000 && a.vs > 100) return ["departing", "warn"];
    return ["en route", "mute"];
  }
  function airline(cs) {
    var k = cs.slice(0, 3), a = AIR[k];
    return a ? a[1] + " (" + a[0] + " " + cs.slice(3) + ")" : (/^[A-Z]{3}\d/.test(cs) ? k : "");
  }
  function fltlinks(a) {
    var qq = encodeURIComponent(a.cs || a.hex);
    return '<a href="https://www.flightradar24.com/' + qq + '" target="_blank" rel="noopener">FR24</a> · <a href="https://flightaware.com/live/flight/' + qq + '" target="_blank" rel="noopener">FA</a> · <a href="https://globe.adsbexchange.com/?icao=' + a.hex + '" target="_blank" rel="noopener">ADSBx</a>';
  }
  var lvtimer;
  function loadLive() {
    var code = $("lvap").value, r = +$("lvr").value, p = AP[code], rows = $("lvrows");
    $("lvsrc").textContent = "fetching…";
    liveNear(p[0], p[1], r).then(function (res) {
      var ac = res.ac.map(function (a) { a.d = km(p[0], p[1], a.lat, a.lon); return a; })
        .filter(function (a) { return a.d <= r; })
        .sort(function (x, y) { return x.d - y.d; });
      $("lvsrc").textContent = res.src + " · " + ac.length + " aircraft · " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (!ac.length) { rows.innerHTML = '<tr><td colspan="9" class="src">No aircraft reported within ' + r + " km of " + code + " right now. Coverage depends on volunteer receivers; try a larger radius.</td></tr>"; return; }
      rows.innerHTML = ac.slice(0, 40).map(function (a) {
        var ph = phase(a);
        return '<tr><td class="num"><b>' + (a.cs || "—") + '</b><br><span class="src">' + a.hex + "</span></td><td>" + airline(a.cs) + '</td><td class="num">' + (a.type || "—") + (a.reg ? '<br><span class="src">' + a.reg + "</span>" : "") + '</td><td class="num">' + (a.ground ? "ground" : a.alt.toLocaleString("en-IN") + " ft") + '</td><td class="num">' + Math.round(a.gs) + ' kt</td><td class="num">' + (a.vs ? (a.vs > 0 ? "+" : "") + Math.round(a.vs) + " fpm" : "—") + '</td><td class="num">' + a.d.toFixed(0) + ' km</td><td><span class="pill ' + ph[1] + '">' + ph[0] + '</span></td><td class="src">' + fltlinks(a) + "</td></tr>";
      }).join("");
    }).catch(function () {
      $("lvsrc").textContent = "no source reachable";
      rows.innerHTML = '<tr><td colspan="9" class="src">The ADS-B feeds are not reachable from this browser (their CORS policy blocks direct calls). In production the Bagdrop server polls them and this board reads the server. The callsign links in the tracker below still work.</td></tr>';
    });
    clearInterval(lvtimer);
    lvtimer = setInterval(function () { if ($("m-flt").classList.contains("on")) loadLive(); }, 30000);
  }
  $("lvgo").addEventListener("click", loadLive);
  $("lvap").addEventListener("change", loadLive);
  $("lvr").addEventListener("change", loadLive);
  function trackFlight() {
    var v = $("lvfn").value.toUpperCase().replace(/\s+/g, ""), m = v.match(/^([A-Z0-9]{2})(\d{1,4})$/), out = $("lvtrackout");
    if (!m) { out.textContent = "Enter an airline code and number, for example 6E 5219."; return; }
    var icao = IATA2ICAO[m[1]] || m[1], cs = icao + m[2];
    out.textContent = "Looking for " + cs + "…";
    var chain = ["https://api.adsb.lol/v2/callsign/" + cs, "https://api.airplanes.live/v2/callsign/" + cs];
    var i = 0;
    function next() { if (i >= chain.length) return Promise.reject(new Error("unreachable")); return fx(chain[i++]).then(normAdsb).catch(next); }
    next().then(function (ac) {
      if (!ac.length) {
        out.innerHTML = cs + ' is not airborne or not in receiver coverage right now. Before departure the schedule feed is the source: <a href="https://www.flightradar24.com/data/flights/' + v.toLowerCase() + '" target="_blank" rel="noopener">FR24 schedule for ' + v + '</a> · <a href="https://flightaware.com/live/flight/' + cs + '" target="_blank" rel="noopener">FlightAware</a>';
        return;
      }
      var a = ac[0], ph = phase(a);
      out.innerHTML = "<b>" + cs + "</b> · " + airline(cs) + " · " + (a.type || "") + " " + (a.reg || "") + " · " + (a.ground ? "on ground" : a.alt.toLocaleString("en-IN") + " ft") + " · " + Math.round(a.gs) + ' kt · <span class="pill ' + ph[1] + '">' + ph[0] + "</span> · " + a.lat.toFixed(2) + ", " + a.lon.toFixed(2) + " · " + fltlinks(a) +
        '<br><span class="src">In production this position, plus the schedule feed, sets the counter time and cut off for the linked shipment.</span>';
    }).catch(function () {
      out.innerHTML = 'Live sources unreachable from this browser. <a href="https://www.flightradar24.com/data/flights/' + v.toLowerCase() + '" target="_blank" rel="noopener">Open ' + v + " on FR24</a>.";
    });
  }
  $("lvtrack").addEventListener("click", trackFlight);
  $("lvfn").addEventListener("keydown", function (e) { if (e.key === "Enter") trackFlight(); });

  /* flight delay simulation + feed */
  var ff = $("fltfeed");
  function fline(cls, txt) {
    var d = document.createElement("div");
    var t = new Date();
    d.innerHTML = '<span class="dot ' + cls + '"></span><span>' + txt + "</span><time>" + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + "</time>";
    ff.insertBefore(d, ff.firstChild);
  }
  fline("warn", "UK 955 ETA +35 min · BD-0305 re-planned · customer and driver told");
  fline("ok", "EK 501 ETA −15 min · BD-0309 carousel time moved earlier");
  fline("bad", "6E 2033 cancelled · BD-0293 held at BLR hub · exception opened");
  var simmed = false;
  $("simdelay").addEventListener("click", function () {
    if (simmed) return;
    simmed = true;
    $("f1etd").textContent = "ETD 16:20";
    $("f1st").innerHTML = '<span class="pill warn">+2 h</span>';
    $("f1plan").textContent = "Pickup 10:00 · hub cut off 13:30 · counter by 12:20";
    $("f1imp").textContent = "Slot moved 08:00 → 10:00 · run sheet re-ordered · customer told · ops confirmed (over 60 min)";
    $("f1").querySelectorAll("td").forEach(function (td) { td.style.background = "var(--warn-bg)"; });
    fline("warn", "6E 5219 ETD +2 h · BD-0288 re-planned: pickup 10:00, hub cut off 13:30, counter 12:20");
    setTimeout(function () { fline("info", "Ops lead confirmed the re-plan · WhatsApp to the customer with the flight status line · push to the captain"); }, 900);
    setTimeout(function () { fline("ok", "Hub BRD bay board updated · line haul LH-15 now carries BD-0288"); }, 1800);
    say("Delay over 60 min: re-planned, ops confirmed, six parties told. Nothing typed by hand.");
  });
  function renderFltKpis() { $("flt-linked").textContent = ALL.filter(function (d) { return d.ref && d.mode === "air"; }).length; }

  /* ---------------- capacity ---------------- */
  function renderCapacity() {
    var f = AI.forecast(ALL, 7);
    var CAP = 30; /* pieces/day the current roster handles: 5 captains × 6 */
    var booked = {};
    ALL.forEach(function (d) {
      if (["accepted", "assigned", "submitted"].indexOf(d.status) < 0) return;
      var k = (d.date || "").slice(0, 10);
      booked[k] = (booked[k] || 0) + (d.bags || 0) + (d.oversize || 0);
    });
    $("capbars").innerHTML = f.future.map(function (p) {
      var day = new Date(p.day + "T12:00:00");
      var name = day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      var load = Math.round(100 * Math.max(booked[p.day] || 0, p.mu) / CAP);
      var cls = load >= 100 ? "bad" : load >= 80 ? "warn" : "";
      var note = (booked[p.day] ? booked[p.day] + " pcs booked · " : "") + "forecast " + p.mu.toFixed(1) + (p.peak ? " · peak" : "");
      return '<div><div class="src">' + name + " · " + note + '</div><div class="bar"><i class="' + cls + '" style="width:' + Math.min(load, 100) + '%"></i></div></div>';
    }).join("");
  }

  /* ---------------- pricing matrix ---------------- */
  var KNOWN = { "MUM-GUJ": 1, "GUJ-MUM": 1, "NOR-GUJ": 1, "GUJ-NOR": 1, "NOR-GOA": 1, "GOA-NOR": 1, "MUM-GOA": 1, "GOA-MUM": 1 };
  DB.get("settings", "rates").then(function (doc) {
    if (doc && doc.rates) RATES = doc.rates;
    renderMatrix();
  });
  function renderMatrix() {
    var Z = P.ZONES, mx = $("matrix");
    mx.innerHTML = '<div class="h">from \\ to</div>' + Z.map(function (z) { return '<div class="h">' + z + "</div>"; }).join("");
    Z.forEach(function (from) {
      mx.insertAdjacentHTML("beforeend", '<div class="h" style="text-align:left">' + from + "</div>");
      Z.forEach(function (to, i) {
        var v = RATES[from][i], k = KNOWN[from + "-" + to];
        var cls = "cell" + (k ? " known" : "") + (v < 2500 ? " floor" : "");
        mx.insertAdjacentHTML("beforeend", '<div class="' + cls + '" contenteditable="true" tabindex="0" data-f="' + from + '" data-t="' + i + '" aria-label="Rate ' + from + " to " + to + '">' + v.toLocaleString("en-IN") + "</div>");
      });
    });
  }
  $("matrix").addEventListener("input", function (e) {
    var c = e.target.closest(".cell");
    if (!c) return;
    var v = parseInt(c.textContent.replace(/\D/g, ""), 10) || 0;
    c.classList.add("edited");
    c.classList.toggle("floor", v < 2500);
    RATES[c.dataset.f][+c.dataset.t] = v;
    clearTimeout(window.__rt);
    window.__rt = setTimeout(function () {
      DB.put("settings", "rates", { id: "rates", created: DB.now(), rates: RATES }).then(function () {
        $("rate-msg").textContent = "saved " + new Date().toLocaleTimeString("en-IN");
      });
    }, 600);
    if (v < 2500) say("Below the ₹2,500 floor. Engine will refuse public quotes on this pair until fixed.");
  });
  $("rate-reset").addEventListener("click", function () {
    RATES = JSON.parse(JSON.stringify(P.DEFAULT_RATES));
    DB.put("settings", "rates", { id: "rates", created: DB.now(), rates: RATES });
    renderMatrix();
    say("Matrix reset to defaults.");
  });

  /* ---------------- route rate chart editor ---------------- */
  function renderRouteChart() {
    var tb = $("route-rows");
    if (!tb) return;
    function cell(i, k, v, w) {
      return '<input class="minisel num" style="width:' + (w || 86) + 'px" inputmode="numeric" data-ri="' + i + '" data-k="' + k + '" value="' + (v == null ? "" : v) + '"' + (v == null ? ' placeholder="—"' : "") + ">";
    }
    tb.innerHTML = ROUTES.map(function (r, i) {
      return "<tr><td><b>" + esc(r.from) + (r.dir === "both" ? " ↔ " : " → ") + esc(r.to) + "</b></td>" +
        "<td>" + (r.dir === "both" ? "Both ways" : "One way") + "</td>" +
        "<td>" + cell(i, "r1", r.r1) + "</td><td>" + cell(i, "r2", r.r2) + "</td><td>" + cell(i, "addl", r.addl) + "</td>" +
        "<td>" + cell(i, "bulkMin", r.bulkMin, 60) + "</td><td>" + cell(i, "bulkRate", r.bulkRate) + "</td>" +
        '<td><input class="minisel" style="width:140px" data-ri="' + i + '" data-k="note" value="' + esc(r.note || "") + '" placeholder="note"></td>' +
        '<td><button class="btn sm" data-rdel="' + i + '">✕</button></td></tr>';
    }).join("") || '<tr><td colspan="9" class="src">No routes yet — add the first one below.</td></tr>';
    tb.querySelectorAll("input[data-ri]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var r = ROUTES[+inp.dataset.ri], k = inp.dataset.k;
        r[k] = k === "note" ? inp.value.trim() : (inp.value === "" ? null : Math.round(+inp.value.replace(/\D/g, "")) || null);
        saveRoutes().then(function () { say("Rate chart saved · " + r.from + " – " + r.to); });
      });
    });
    tb.querySelectorAll("[data-rdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = ROUTES[+b.dataset.rdel];
        ROUTES.splice(+b.dataset.rdel, 1);
        saveRoutes().then(function () { say("Route removed · " + r.from + " – " + r.to + ". Pair falls back to the matrix."); });
        renderRouteChart();
      });
    });
  }
  $("rt-add").addEventListener("click", function () {
    var from = val("rt-from"), to = val("rt-to");
    if (from === to) { $("rt-msg").textContent = "Pick two different cities."; return; }
    if (P.routeFor(from, to)) { $("rt-msg").textContent = "That pair already has a route row."; return; }
    var r1 = +val("rt-r1") || 0, r2 = +val("rt-r2") || 0, addl = +val("rt-addl") || 0;
    if (!r1 || !r2 || !addl) { $("rt-msg").textContent = "1 bag, 2 bags and addl. rates are needed."; return; }
    ROUTES.push({ from: from, to: to, dir: val("rt-dir"), note: "", r1: r1, r2: r2, addl: addl, bulkMin: +val("rt-bmin") || null, bulkRate: +val("rt-brate") || null });
    saveRoutes().then(function () { say("Route added to the master · " + from + " – " + to); });
    renderRouteChart();
    $("rt-msg").textContent = "";
    ["rt-r1", "rt-r2", "rt-addl", "rt-bmin", "rt-brate"].forEach(function (id) { $(id).value = ""; });
  });

  /* add a city to the master */
  (function () {
    P.ZONES.forEach(function (z) {
      var o = document.createElement("option");
      o.value = z;
      o.textContent = { MUM: "Mumbai metro", GUJ: "Gujarat", NOR: "North", SOU: "South", GOA: "Goa", EAS: "East" }[z] + " (" + z + ")";
      $("ct-zone").appendChild(o);
    });
  })();
  $("ct-add").addEventListener("click", function () {
    var name = val("ct-name");
    if (!name) { $("ct-msg").textContent = "The city needs a name."; return; }
    if (P.cityByName(name)) { $("ct-msg").textContent = name + " is already in the master."; return; }
    XCITIES.push({ name: name, zone: val("ct-zone"), ap: val("ct-ap").toUpperCase() || null });
    saveCities().then(function () {
      say(name + " added to the master — live in every city list.");
      $("ct-msg").textContent = name + " added. Give it a route row above for chart rates; until then it quotes from the " + val("ct-zone") + " fallback.";
      $("ct-name").value = ""; $("ct-ap").value = "";
      fillCitySelects();
      crmLog("City " + name + " added to the pricing master (" + val("ct-zone") + ")", null);
    });
  });

  /* add-on rates editor */
  function renderAddons() {
    if (!$("ad-oversize")) return;
    $("ad-oversize").value = ADDONS.oversize;
  }
  [["ad-oversize", "oversize"]].forEach(function (pair) {
    $(pair[0]).addEventListener("change", function () {
      ADDONS[pair[1]] = Math.max(0, Math.round(+val(pair[0]) || 0));
      saveAddons().then(function () { $("ad-msg").textContent = "saved " + new Date().toLocaleTimeString("en-IN"); });
    });
  });

  /* ---------------- quote simulator: every city permutation ---------------- */
  (function () {
    $("qs-date").value = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
    function simulate() {
      var from = val("qs-from"), to = val("qs-to");
      if (from === to) { $("qs-out").innerHTML = '<span style="color:var(--bad)">Pick two different cities.</span>'; return; }
      var r = P.quoteCity({ fromName: from, toName: to, bags: +val("qs-bags") || 1, oversize: +val("qs-odd") || 0, mode: val("qs-mode"), date: val("qs-date") });
      if (r.error) {
        $("qs-out").innerHTML = '<span style="color:var(--bad)">' + esc(r.error) + "</span>";
        return;
      }
      var srcLine = r.source === "route"
        ? '<span class="pill ok">route chart</span> ' + esc(r.routeName) + (r.routeNote ? " · " + esc(r.routeNote) : "") + " · <b>" + esc(r.rule) + "</b>"
        : '<span class="pill warn">fallback matrix</span> ' + esc(r.rule) + ' — no route row for this pair yet · <button class="btn sm" id="qs-addroute">Add this route to the master</button>';
      $("qs-out").innerHTML = srcLine + "<br>" +
        "Base " + DB.inr(r.base) +
        (r.oversize ? " + oversize " + DB.inr(r.oversize) : "") +
        (r.handling ? " + handling " + DB.inr(r.handling) : "") +
        (r.slab ? " − slab " + DB.inr(r.slab) : "") +
        (r.peak ? " + peak " + DB.inr(r.peak) : "") +
        " + GST " + DB.inr(r.gst) + " = <b class='num' style='font-size:15px'>" + DB.inr(r.total) + "</b> (" + DB.inr(r.perBag) + "/pc · " + r.billed + " billed)";
      var ar = $("qs-addroute");
      if (ar) ar.addEventListener("click", function () {
        $("rt-from").value = from; $("rt-to").value = to;
        $("rt-from").scrollIntoView({ behavior: "smooth", block: "center" });
        say("Fill the rates and press Add route — the pair then prices from the chart everywhere.");
      });
    }
    $("qs-go").addEventListener("click", simulate);
    ["qs-from", "qs-to", "qs-mode", "qs-bags", "qs-odd", "qs-date"].forEach(function (id) { $(id).addEventListener("change", simulate); });
    /* ready reckoner: every route × 1–10 bags, like the chart's calculator sheet */
    $("qs-matrix").addEventListener("click", function () {
      var head = "<tr><th>Route</th>" + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return "<th>" + n + "</th>"; }).join("") + "</tr>";
      var body = ROUTES.map(function (r) {
        return "<tr><td><b>" + esc(r.from) + (r.dir === "both" ? " ↔ " : " → ") + esc(r.to) + "</b></td>" +
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
            var rb = P.routeBase(r, n);
            var bulk = r.bulkMin && n >= r.bulkMin;
            return '<td class="num"' + (bulk ? ' style="background:var(--ok-bg)"' : "") + ">" + rb.amount.toLocaleString("en-IN") + "</td>";
          }).join("") + "</tr>";
      }).join("");
      $("qs-reckoner").innerHTML = '<div class="tbl"><table><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
        '<p class="src" style="margin:6px 0 0">Amounts before GST, by number of bags. Green cells are where the bulk rate applies — matches the rate chart\'s ready reckoner.</p>';
    });
  })();

  /* pricing suggestions card */
  function renderPriceSuggest() {
    var sg = AI.pricingSuggestions(ALL, RATES);
    $("price-suggest").innerHTML = sg.length ? sg.map(function (s) {
      return '<div class="card stripe warn" style="padding:10px;margin-bottom:8px"><b style="font-family:var(--display)">Suggestion waiting</b><div style="font-size:12.5px">' + esc(s.text) + " Impact: " + esc(s.impact) +
        ' <button class="btn sm" data-toast="Applied to the matrix draft. Logged as copilot suggestion approved.">Accept</button> <button class="btn sm" data-toast="Dismissed. Copilot will not resuggest for 30 days.">Dismiss</button></div></div>';
    }).join("") : "";
  }

  /* ---------------- identity ---------------- */
  function renderIdentity() {
    var list = ALL.filter(function (d) { return d.identity; });
    $("id-n").textContent = list.length;
    var methods = {};
    list.forEach(function (d) { var m = (d.identity.method || "other").split(" ")[0]; methods[m] = (methods[m] || 0) + 1; });
    $("id-nd").textContent = Object.keys(methods).map(function (k) { return k + " " + methods[k]; }).join(" · ") || "—";
    $("id-rate").textContent = list.length ? Math.round(100 * list.filter(function (d) { return d.identity.score >= 0.85; }).length / list.length) + "%" : "—";
    $("id-rev").textContent = list.filter(function (d) { return d.identity.score >= 0.7 && d.identity.score < 0.85; }).length;
    if (!list.length) { $("idrows").innerHTML = '<tr><td colspan="5" class="src">No verifications yet.</td></tr>'; return; }
    $("idrows").innerHTML = list.map(function (d) {
      var i = d.identity;
      var sc = i.score != null ? i.score.toFixed(2) : "—";
      var pill = i.score >= 0.85 ? "ok" : i.score >= 0.7 ? "warn" : "bad";
      return '<tr><td class="mono">' + esc(d.id) + "</td><td>" + esc(d.traveller.name) + "</td><td>" + esc(i.method || "") + '</td><td class="num">' + sc + '</td><td><span class="pill ' + pill + '">' + (i.ok ? (i.score < 0.85 ? "confirmed" : "passed") : "review") + "</span></td></tr>";
    }).join("");
  }

  /* ---------------- finance ---------------- */
  function renderFinance() {
    var paid = ALL.filter(function (d) { return d.pay; });
    var today = new Date().toDateString();
    var tSum = paid.filter(function (d) { return new Date(d.pay.at).toDateString() === today; }).reduce(function (a, d) { return a + d.pay.amount; }, 0);
    var all = paid.reduce(function (a, d) { return a + d.pay.amount; }, 0);
    $("fin-today").textContent = DB.inr(tSum);
    $("fin-all").textContent = DB.inr(all);
    $("fin-gst").textContent = DB.inr(paid.reduce(function (a, d) { return a + ((d.quote.breakdown || {}).gst || 0); }, 0));
    /* balances: 20% holds and part-payments on live bookings */
    var OPEN = ["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered"];
    var bal = paid.filter(function (d) { return OPEN.indexOf(d.status) >= 0 && d.pay.amount < d.quote.total; });
    var balSum = bal.reduce(function (a, d) { return a + (d.quote.total - d.pay.amount); }, 0);
    $("fin-bal").textContent = DB.inr(balSum);
    $("fin-balrows").innerHTML = bal.length ? bal.map(function (d) {
      var due = d.quote.total - d.pay.amount;
      return '<tr><td class="mono">' + esc(d.id) + "</td><td>" + esc(d.traveller.name || "—") + '<br><span class="src">' + esc(d.traveller.mobile || "") + "</span></td>" +
        '<td class="num">' + DB.inr(d.quote.total) + '</td><td class="num">' + DB.inr(d.pay.amount) + '</td><td class="num" style="color:var(--warn)">' + DB.inr(due) + "</td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-balremind="' + esc(d.id) + '">Remind</button> <button class="btn sm primary" data-balcollect="' + esc(d.id) + '">Collect</button></td></tr>';
    }).join("") : '<tr><td colspan="6" class="src">No balances outstanding.</td></tr>';
    $("fin-balrows").querySelectorAll("[data-balremind]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.balremind; })[0];
        if (!d) return;
        var due = d.quote.total - d.pay.amount;
        var pays = CFG.payments || {};
        var m = "Hi " + (d.traveller.name || "").split(" ")[0] + ", a gentle reminder from Bagdrop: " + DB.inr(due) + " is due on booking " + d.id +
          " before pickup on " + d.date + ". Pay in one tap: " + quoteLink(d.id) + (pays.upi ? " · or UPI " + pays.upi + " (ref " + d.id + ")" : "") + ". Thank you!";
        crmLog("Balance reminder for " + d.id + " (" + DB.inr(due) + ") drafted", d.id, null, m);
        navigator.clipboard.writeText(m).then(function () {
          say("Balance reminder copied — paste into WhatsApp. Logged.");
        }).catch(function () {
          say("Balance reminder drafted and logged — copy it from the CRM activity log.");
        });
      });
    });
    $("fin-balrows").querySelectorAll("[data-balcollect]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.balcollect; })[0];
        if (!d) return;
        var due = d.quote.total - d.pay.amount;
        act(d, function (c) { c.pay.amount = c.quote.total; c.pay.mode = "full"; }, "Balance " + DB.inr(due) + " collected · booking fully paid");
      });
    });
    $("finrows").innerHTML = paid.length ? paid.map(function (d) {
      return "<tr><td>" + DB.fmt(d.pay.at) + '</td><td class="mono">' + esc(d.id) + "</td><td>" + esc(d.pay.gateway) + "</td><td>" + esc(d.pay.mode) + '</td><td class="num">' + DB.inr(d.pay.amount) + "</td>" +
        "<td>" + (d.pay.recon ? '<span class="pill ok">reconciled</span>' : '<span class="pill mute">pending</span>') + "</td>" +
        '<td><span class="pill ' + (PILL[d.status] || "info") + '">' + (LABEL[d.status] || d.status) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="7" class="src">No payments yet.</td></tr>';
    /* lane economics */
    var ls = AI.lanes(ALL, RATES);
    $("fin-lanes").innerHTML = ls.length ? ls.map(function (l) {
      var pill = l.cm >= 25 ? "ok" : l.cm >= 20 ? "warn" : "bad";
      return "<tr><td>" + l.lane + '</td><td class="num">' + l.pcs + '</td><td class="num">' + l.revPc.toLocaleString("en-IN") + '</td><td class="num">' + l.costPc.toLocaleString("en-IN") + '</td><td><span class="pill ' + pill + '">' + l.cm + "%</span></td></tr>";
    }).join("") : '<tr><td colspan="5" class="src">No inter-region volume yet.</td></tr>';
    renderFltKpis();
    renderPriceSuggest();
  }

  /* ---------------- intelligence ---------------- */
  function renderIntel() {
    var f = AI.forecast(ALL, 14);
    $("intel-chart").innerHTML = chartSVG(f, 560, 210);
    $("intel-fnote").textContent = f.note;
    $("intel-out").textContent = "Next 7 days ≈ " + f.weekTotal + " pieces · " + f.captainsNeeded + " captain(s)/day · trend " + (f.trend >= 0 ? "+" : "") + f.trend.toFixed(2) + " pcs/day";
    var an = AI.anomalies(ALL);
    $("intel-anom").innerHTML = an.length ? an.map(function (a) {
      return '<li><span class="m">' + a.sev + "</span><span>" + esc(a.text) + "</span></li>";
    }).join("") : '<li><span class="src">Nothing unusual on the current data: no scraping patterns, no identity scores in the review band, nothing stale.</span></li>';
    var ps = AI.pricingSuggestions(ALL, RATES);
    $("intel-price").innerHTML = ps.length ? ps.map(function (s) {
      return '<li><span class="m">' + s.lane + "</span><span>" + esc(s.text) + " Impact: " + esc(s.impact) + "</span></li>";
    }).join("") : '<li><span class="src">All lanes above the 20% margin floor. A lane below it for 30 days produces a suggestion with impact and risk.</span></li>';
    var cs = AI.crmCustomers(ALL).slice(0, 5);
    $("intel-cust").innerHTML = cs.length ? cs.map(function (c, i) {
      return '<li><span class="m">#' + (i + 1) + "</span><span>" + esc(c.name || c.mobile) + " · " + c.bookings.length + " booking(s) · " + c.pieces + " pcs · " + DB.inr(c.value) + " · " + c.tier + "</span></li>";
    }).join("") : '<li><span class="src">No customers yet. Repeat households, planners and concierges rank here by lifetime pieces.</span></li>';
  }
  function askCopilot(qq) {
    var a = $("ca");
    a.textContent = "Thinking…";
    var local = AI.answer(qq, ALL, EVENTS, INQ, RATES);
    var ep = ((window.BAGDROP_CONFIG || {}).ai || {}).endpoint;
    if (ep) {
      var digest = { stats: AI.stats(ALL, EVENTS, INQ), lanes: AI.lanes(ALL, RATES), forecast: AI.forecast(ALL, 7), suggestions: AI.crmSuggestions(ALL, INQ, followedKeys()).slice(0, 5) };
      AI.remoteAnswer(qq, digest).then(function (ans) { a.textContent = ans; }).catch(function () { a.textContent = local; });
    } else a.textContent = local;
  }
  $("cgo").addEventListener("click", function () { askCopilot(val("cq")); });
  $("cq").addEventListener("keydown", function (e) { if (e.key === "Enter") askCopilot(val("cq")); });
  document.querySelectorAll("#chips button").forEach(function (b) {
    b.addEventListener("click", function () { $("cq").value = b.textContent; askCopilot(b.textContent); });
  });

  /* ---------------- rules ---------------- */
  var RULES = [
    ["quote.ready", "customer · WhatsApp, SMS, email · pay or hold", "EN HI GU", true],
    ["identity.required", "traveller · WhatsApp link · 2 reminders then call task", "EN HI GU", true],
    ["captain.assigned", "customer · WhatsApp with photo and plate", "EN HI GU", true],
    ["captain.near", "(30 min) customer · WhatsApp live map, SMS", "EN HI", true],
    ["piece.picked_up", "customer, payer · photos and seal IDs", "EN HI GU", true],
    ["terminal.handed_over", "customer · receipt and counter instructions", "EN", true],
    ["delivery.otp", "receiver · SMS and WhatsApp", "EN HI GU", true],
    ["job.offered", "driver · app push · accept within 10 min, else re-offer", "driver", true],
    ["pickup.reminder", "(T−30) pickup driver · push with address, pieces, OTP prompt", "driver", true],
    ["driver.scan.*", "Operations feed · Hub manifest · Customer success message", "departments", true],
    ["delivery.completed", "Finance invoice · Sales partner webhook · Management on-time counter", "departments", true],
    ["flight.delay<60", "re-plan silently · customer, drivers, hub told", "auto", true],
    ["flight.delay>60", "re-plan · ops confirms · then everyone told", "ops gate", true],
    ["gps.gap>3min", "Operations alert · Management at 10 min", "departments", true],
    ["exception.*", "ops lead · push · escalate at SLA", "internal", true],
    ["crm.followup", "lead or customer · drafted by the engine · sales approves each send", "AI", true],
    ["shipment.closed+90d", "customer · return season nudge", "draft", false]
  ];
  var ruleState = {};
  DB.get("settings", "rules").then(function (doc) {
    if (doc && doc.state) ruleState = doc.state;
    renderRules();
  });
  function renderRules() {
    $("rules").innerHTML = RULES.map(function (r, i) {
      var on = ruleState[r[0]] != null ? ruleState[r[0]] : r[3];
      return '<div class="rule"><button class="tog" role="switch" aria-checked="' + on + '" data-rule="' + esc(r[0]) + '" aria-label="Toggle ' + esc(r[0]) + '"></button><span><code>' + esc(r[0]) + "</code> → " + esc(r[1]) + '</span><span class="src">' + esc(r[2]) + "</span></div>";
    }).join("");
    $("rules").querySelectorAll(".tog").forEach(function (t) {
      t.addEventListener("click", function () {
        var on = t.getAttribute("aria-checked") === "true";
        t.setAttribute("aria-checked", String(!on));
        ruleState[t.dataset.rule] = !on;
        DB.put("settings", "rules", { id: "rules", created: DB.now(), state: ruleState });
        say((!on ? "Rule active. " : "Rule paused. ") + t.dataset.rule + " · logged.");
      });
    });
  }
  renderRules();

  /* ---------------- reports (with motion) ---------------- */
  function countUp(el, to, isInr) {
    var t0 = null;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = isInr ? DB.inr(to) : to.toLocaleString("en-IN"); return; }
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 800), e = 1 - Math.pow(1 - p, 3);
      var v = Math.round(to * e);
      el.textContent = isInr ? DB.inr(v) : v.toLocaleString("en-IN");
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function hbar(label, v, max, cls) {
    var w = max ? Math.round(100 * v / max) : 0;
    return '<div><div class="src" style="display:flex;justify-content:space-between"><span>' + esc(label) + '</span><span class="num">' + v.toLocaleString("en-IN") + '</span></div><div class="bar"><i class="' + (cls || "") + '" style="width:0" data-w="' + w + '"></i></div></div>';
  }
  function animateBars(root) {
    setTimeout(function () {
      root.querySelectorAll(".bar i[data-w]").forEach(function (i) { i.style.width = i.dataset.w + "%"; });
    }, 60);
  }
  function renderReports(withMotion) {
    if (!$("m-rep").classList.contains("on")) return;
    var paid = ALL.filter(function (d) { return d.pay; });
    var rev = paid.reduce(function (a, d) { return a + d.pay.amount; }, 0);
    var pcs = ALL.reduce(function (a, d) { return a + (d.bags || 0) + (d.oversize || 0); }, 0);
    if (withMotion) {
      countUp($("rep-rev"), rev, true);
      countUp($("rep-n"), ALL.length, false);
      countUp($("rep-pcs"), pcs, false);
      countUp($("rep-avg"), paid.length ? Math.round(rev / paid.length) : 0, true);
    } else {
      $("rep-rev").textContent = DB.inr(rev);
      $("rep-n").textContent = ALL.length;
      $("rep-pcs").textContent = pcs;
      $("rep-avg").textContent = DB.inr(paid.length ? Math.round(rev / paid.length) : 0);
    }
    /* revenue by day, last 14 */
    var byDay = {};
    paid.forEach(function (d) { var k = (d.pay.at || "").slice(0, 10); byDay[k] = (byDay[k] || 0) + d.pay.amount; });
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push([k.slice(5), byDay[k] || 0]);
    }
    var mx = Math.max.apply(null, days.map(function (x) { return x[1]; }).concat([1]));
    var W = 560, H = 170, x0 = 46, bw = (W - x0 - 10) / 14;
    $("rep-revchart").innerHTML = '<svg class="fchart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Revenue per day">' +
      '<line x1="' + x0 + '" y1="' + (H - 26) + '" x2="' + (W - 10) + '" y2="' + (H - 26) + '" stroke="var(--line)"/>' +
      '<text x="4" y="18">' + DB.inr(mx) + "</text>" +
      days.map(function (d, i) {
        var h = Math.round((H - 44) * d[1] / mx);
        return '<rect x="' + (x0 + i * bw + 2) + '" y="' + (H - 26 - h) + '" width="' + (bw - 4) + '" height="' + h + '" rx="3" fill="var(--accent)" opacity="' + (d[1] ? 1 : 0.18) + '">' +
          "<title>" + d[0] + " · " + DB.inr(d[1]) + "</title></rect>" +
          (i % 3 === 0 ? '<text x="' + (x0 + i * bw + 2) + '" y="' + (H - 10) + '">' + d[0] + "</text>" : "");
      }).join("") + "</svg>";
    /* funnel */
    var fQuoted = ALL.length;
    var fVerified = ALL.filter(function (d) { return d.identity && d.identity.ok; }).length;
    var fPaid = paid.length;
    var fDelivered = ALL.filter(function (d) { return d.status === "delivered"; }).length;
    $("rep-funnel").innerHTML = hbar("Quoted", fQuoted, fQuoted) + hbar("Identity verified", fVerified, fQuoted) + hbar("Paid", fPaid, fQuoted, "ok") + hbar("Delivered", fDelivered, fQuoted, "ok");
    animateBars($("rep-funnel"));
    /* by status */
    var st = {};
    ALL.forEach(function (d) { st[LABEL[d.status] || d.status] = (st[LABEL[d.status] || d.status] || 0) + 1; });
    var stMax = Math.max.apply(null, Object.values(st).concat([1]));
    $("rep-status").innerHTML = Object.keys(st).map(function (k) { return hbar(k, st[k], stMax); }).join("") || '<span class="src">No data yet.</span>';
    animateBars($("rep-status"));
    /* by lane */
    var ln = {};
    ALL.forEach(function (d) {
      if (!d.zo || !d.zd) return;
      var k = d.zo === d.zd ? d.zo + " local" : [d.zo, d.zd].sort().join("↔");
      ln[k] = (ln[k] || 0) + (d.bags || 0) + (d.oversize || 0);
    });
    var lnMax = Math.max.apply(null, Object.values(ln).concat([1]));
    $("rep-lane").innerHTML = Object.keys(ln).map(function (k) { return hbar(k, ln[k], lnMax, "warn"); }).join("") || '<span class="src">No data yet.</span>';
    animateBars($("rep-lane"));
    /* by channel */
    var ch = {};
    ALL.forEach(function (d) {
      var k = d.eventCode ? "Wedding / event" : d.source ? "Team quote" : "Website";
      ch[k] = (ch[k] || 0) + 1;
    });
    var chMax = Math.max.apply(null, Object.values(ch).concat([1]));
    $("rep-channel").innerHTML = Object.keys(ch).map(function (k) { return hbar(k, ch[k], chMax, "ok"); }).join("") || '<span class="src">No data yet.</span>';
    animateBars($("rep-channel"));
  }
  /* CSV exports */
  function toCsv(rows) {
    return rows.map(function (r) {
      return r.map(function (c) { c = String(c == null ? "" : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(",");
    }).join("\n");
  }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/csv" }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  document.querySelectorAll("[data-csv]").forEach(function (b) {
    b.addEventListener("click", function () {
      var kind = b.dataset.csv, rows = [];
      if (kind === "bookings") {
        rows = [["id", "created", "status", "service", "from", "to", "date", "bags", "oversize", "billed", "traveller", "mobile", "email", "total", "gst", "paid", "gateway", "captain", "club", "source", "event"]]
          .concat(ALL.map(function (d) {
            return [d.id, d.created, d.status, d.ucName, d.from, d.to, d.date, d.bags, d.oversize, d.billed, d.traveller.name, d.traveller.mobile, d.traveller.email,
              d.quote.total, (d.quote.breakdown || {}).gst || "", d.pay ? d.pay.amount : 0, d.pay ? d.pay.gateway : "", (d.admin || {}).captain || "", (d.admin || {}).club || "", d.source || "website", d.eventCode || ""];
          }));
      } else if (kind === "payments") {
        rows = [["at", "booking", "gateway", "mode", "amount", "status"]]
          .concat(ALL.filter(function (d) { return d.pay; }).map(function (d) { return [d.pay.at, d.id, d.pay.gateway, d.pay.mode, d.pay.amount, d.status]; }));
      } else if (kind === "quotes") {
        rows = [["quote", "booking", "customer", "mobile", "from", "to", "date", "total", "valid_until", "source"]]
          .concat(ALL.filter(function (d) { return (d.status === "quoted" || d.status === "identified") && !d.pay; })
            .map(function (d) { return [d.quote.qid, d.id, d.traveller.name, d.traveller.mobile, d.from, d.to, d.date, d.quote.total, d.quote.validUntil || "", d.source || "website"]; }));
      } else if (kind === "customers") {
        rows = [["name", "mobile", "bookings", "pieces", "lifetime_value", "tier", "last_booking", "last_status"]]
          .concat(AI.crmCustomers(ALL).map(function (c) { return [c.name, c.mobile, c.bookings.length, c.pieces, c.value, c.tier, c.last.id, c.last.status]; }));
      } else if (kind === "leads") {
        rows = [["id", "created", "status", "name", "role", "mobile", "email", "venue", "from", "to", "families", "bags"]]
          .concat(INQ.map(function (i) { return [i.id, i.created, i.status, i.contact.name, i.contact.role, i.contact.mobile, i.contact.email, i.venue || i.venueCity, i.dates.from, i.dates.to, i.families, i.bags]; }));
      } else if (kind === "mis") {
        rows = [["month", "bookings", "pieces", "revenue", "trip_expenses", "margin"]]
          .concat(misData().map(function (m) { return [m.month, m.n, m.pcs, m.rev, m.exp, m.rev - m.exp]; }));
      } else if (kind === "trips") {
        rows = [["trip", "route", "date", "vehicle", "vehicle_type", "driver", "status", "lrs", "consignments", "revenue", "expenses", "margin"]]
          .concat(TRIPS.map(function (t) {
            var r = tripRevenue(t), e = tripExpense(t), bk = tripBookings(t.id);
            return [t.id, t.route, t.date, t.vehicle, t.vehicleType, t.driver, t.status, bk.filter(function (d) { return d.lr; }).length, bk.length, r, e, r - e];
          }));
      } else if (kind === "crm") {
        rows = [["at", "kind", "dept", "contact", "text", "due", "done"]]
          .concat(CRMLOG.map(function (c) { return [c.created, c.kind || "", c.dept || "", c.contact || "", c.text, c.dueAt || "", c.doneAt || ""]; }));
      }
      download("bagdrop-" + kind + "-" + new Date().toISOString().slice(0, 10) + ".csv", toCsv(rows));
      say(kind + ".csv exported from the live database.");
    });
  });

  /* CRM master search */
  var crmQ = "";
  $("crm-search").addEventListener("input", function () { crmQ = this.value.toLowerCase(); renderCrm(); });

  /* ================= LR AND TRIPS ================= */
  var EXP_HEADS = ["Fuel", "Toll / FASTag", "Driver bhatta", "Loading / unloading", "Parking", "Airport charges", "Vehicle hire", "Misc"];
  var CO = CFG.company || {};
  function tripBookings(id) { return ALL.filter(function (d) { return (d.admin || {}).trip === id; }); }
  function tripRevenue(t) { return tripBookings(t.id).reduce(function (a, d) { return a + (d.quote.total || 0); }, 0); }
  function tripExpense(t) { return (t.expenses || []).reduce(function (a, e) { return a + e.amount; }, 0); }
  $("tr-date").value = new Date().toISOString().slice(0, 10);
  $("tr-create").addEventListener("click", function () {
    if (!val("tr-route")) { $("tr-msg").textContent = "Name the route."; return; }
    DOCS.nextNo("TR").then(function (no) {
      var id = no.replace(/\//g, "-");
      var doc = {
        id: id, created: DB.now(), status: "planned",
        route: val("tr-route"), date: val("tr-date"),
        vehicle: val("tr-veh").toUpperCase(), vehicleType: val("tr-vtype"),
        driver: val("tr-drv"), driverMobile: val("tr-drvmob"),
        expenses: []
      };
      DB.put("trips", id, doc).then(function () {
        selTrip = id;
        renderTrips(); renderTripDetail();
        say("Trip " + id + " created. Assign consignments from the panel on the right.");
        ["tr-route", "tr-veh", "tr-drv", "tr-drvmob"].forEach(function (i) { $(i).value = ""; });
      });
    });
  });
  function renderTrips() {
    if (!$("tr-rows")) return;
    var open = TRIPS.filter(function (t) { return t.status !== "completed"; });
    $("nav-lr").textContent = open.length;
    $("lr-kpi-trips").textContent = open.length;
    $("lr-kpi-lrs").textContent = ALL.filter(function (d) { return d.lr; }).length;
    var rev = TRIPS.reduce(function (a, t) { return a + tripRevenue(t); }, 0);
    var exp = TRIPS.reduce(function (a, t) { return a + tripExpense(t); }, 0);
    $("lr-kpi-rev").textContent = DB.inr(rev);
    $("lr-kpi-exp").textContent = DB.inr(exp);
    $("lr-kpi-margin").textContent = rev ? "margin " + Math.round(100 * (rev - exp) / rev) + "%" : "";
    $("tr-rows").innerHTML = TRIPS.length ? TRIPS.map(function (t) {
      var bk = tripBookings(t.id), r = tripRevenue(t), e = tripExpense(t);
      return '<tr data-trip="' + esc(t.id) + '"' + (t.id === selTrip ? ' class="sel"' : "") + ' style="cursor:pointer">' +
        '<td class="mono">' + esc(t.id) + "</td><td>" + esc(t.route) + '<br><span class="src">' + esc(t.date) + "</span></td>" +
        "<td>" + esc(t.vehicle || "—") + '<br><span class="src">' + esc(t.driver || "") + "</span></td>" +
        '<td class="num">' + bk.filter(function (d) { return d.lr; }).length + "/" + bk.length + "</td>" +
        '<td class="num">' + DB.inr(r) + '</td><td class="num">' + DB.inr(e) + "</td>" +
        '<td class="num" style="color:var(--' + (r - e >= 0 ? "ok" : "bad") + ')">' + DB.inr(r - e) + "</td>" +
        '<td><span class="pill ' + (t.status === "completed" ? "ok" : t.status === "running" ? "info" : "warn") + '">' + esc(t.status) + "</span></td></tr>";
    }).join("") : '<tr><td colspan="8" class="src">No trips yet.</td></tr>';
    $("tr-rows").querySelectorAll("tr[data-trip]").forEach(function (r) {
      r.addEventListener("click", function () { selTrip = r.dataset.trip; renderTrips(); renderTripDetail(); });
    });
  }
  function saveTrip(t, evt) {
    return DB.put("trips", t.id, t).then(function () { if (evt) say(evt); });
  }
  function renderTripDetail() {
    var el = $("tr-detail");
    if (!el) return;
    var t = TRIPS.filter(function (x) { return x.id === selTrip; })[0];
    if (!t) { el.innerHTML = '<p class="lede" style="margin:0">Select a trip — or create one. Everything about the run lives here: its consignments and LRs, the manifest, and every rupee it spends.</p>'; return; }
    var bk = tripBookings(t.id);
    var ACTIVE = ["submitted", "accepted", "assigned", "picked_up", "in_transit"];
    var free = ALL.filter(function (d) { return !(d.admin || {}).trip && ACTIVE.indexOf(d.status) >= 0; });
    var rev = tripRevenue(t), exp = tripExpense(t);
    el.innerHTML =
      '<h3 style="font-family:var(--display);margin:0 0 2px">' + esc(t.id) + ' <span class="pill ' + (t.status === "completed" ? "ok" : "info") + '">' + esc(t.status) + "</span></h3>" +
      '<div class="src" style="margin-bottom:10px">' + esc(t.route) + " · " + esc(t.date) + " · " + esc(t.vehicle || "vehicle TBC") + " (" + esc(t.vehicleType || "") + ") · " + esc(t.driver || "driver TBC") + "</div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="btn sm primary" id="td-manifest">Print manifest</button>' +
      '<select class="minisel" id="td-status">' + ["planned", "running", "completed"].map(function (s) { return "<option" + (t.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
      "</div>" +
      '<h3 style="font-size:13px">Consignments · ' + bk.length + "</h3>" +
      (bk.length ? '<div class="tbl"><table><thead><tr><th>Booking</th><th>Consignor</th><th>Pcs</th><th>LR</th><th></th></tr></thead><tbody>' +
        bk.map(function (d) {
          return "<tr><td class='mono'>" + esc(d.id) + "</td><td>" + esc(d.traveller.name || "—") + "<br><span class='src'>" + esc(d.from) + " → " + esc(d.to) + "</span></td>" +
            "<td class='num'>" + d.billed + "</td>" +
            "<td class='mono' style='font-size:11px'>" + (d.lr ? esc(d.lr.no) : "<span class='src'>—</span>") + "</td>" +
            '<td style="white-space:nowrap">' + (d.lr
              ? '<button class="btn sm" data-lrprint="' + esc(d.id) + '">Print LR</button> <button class="btn sm" data-eway="' + esc(d.id) + '">E-way</button>'
              : '<button class="btn sm primary" data-lrgen="' + esc(d.id) + '">Generate LR</button>') +
            ' <button class="btn sm" data-unassign="' + esc(d.id) + '">✕</button></td></tr>';
        }).join("") + "</tbody></table></div>"
        : '<p class="src">No consignments on this trip yet.</p>') +
      '<div style="display:flex;gap:6px;margin:8px 0 14px;flex-wrap:wrap;align-items:center">' +
      '<select class="minisel" id="td-add" style="min-width:220px">' +
      '<option value="">Assign a booking…</option>' +
      free.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.id) + " · " + esc(d.traveller.name || "") + " · " + esc(d.from) + "→" + esc(d.to) + " · " + d.billed + " pcs</option>"; }).join("") +
      '</select><button class="btn sm" id="td-assign">Add to trip</button></div>' +
      '<h3 style="font-size:13px">Trip expenses · ' + DB.inr(exp) + "</h3>" +
      ((t.expenses || []).length ? '<div class="tbl"><table><thead><tr><th>Head</th><th>Note</th><th>Amount</th><th></th></tr></thead><tbody>' +
        t.expenses.map(function (e, i) {
          return "<tr><td>" + esc(e.head) + "</td><td class='src'>" + esc(e.note || "") + " · " + DB.fmt(e.at) + "</td><td class='num'>" + DB.inr(e.amount) + "</td>" +
            '<td><button class="btn sm" data-expdel="' + i + '">✕</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="src">No expenses logged.</p>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:end;margin:8px 0 12px">' +
      '<label class="f" style="margin:0;min-width:150px">Head<select class="minisel" id="te-head" style="width:100%">' + EXP_HEADS.map(function (h) { return "<option>" + h + "</option>"; }).join("") + "</select></label>" +
      '<label class="f" style="margin:0;width:110px">Amount ₹<input class="minisel" id="te-amt" inputmode="numeric"></label>' +
      '<label class="f" style="margin:0;flex:1;min-width:140px">Note<input class="minisel" id="te-note" style="width:100%" placeholder="FASTag · diesel 40 L"></label>' +
      '<button class="btn sm primary" id="te-add">Log expense</button></div>' +
      '<h3 style="font-size:13px">Driver advances · ' + DB.inr((t.advances || []).reduce(function (a, x) { return a + x.amount; }, 0)) + "</h3>" +
      ((t.advances || []).length ? '<div class="tbl"><table><tbody>' +
        t.advances.map(function (a, i) {
          return "<tr><td class='src'>" + DB.fmt(a.at) + (a.note ? " · " + esc(a.note) : "") + "</td><td class='num'>" + DB.inr(a.amount) + "</td>" +
            '<td><button class="btn sm" data-advdel="' + i + '">✕</button></td></tr>';
        }).join("") + "</tbody></table></div>" : '<p class="src">No advances given yet.</p>') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:end;margin:8px 0 12px">' +
      '<label class="f" style="margin:0;width:110px">Advance ₹<input class="minisel" id="ta-amt" inputmode="numeric"></label>' +
      '<label class="f" style="margin:0;flex:1;min-width:140px">Note<input class="minisel" id="ta-note" style="width:100%" placeholder="Cash at departure · UPI"></label>' +
      '<button class="btn sm" id="ta-add">Give advance</button>' +
      '<button class="btn sm primary" id="ta-settle">Driver settlement</button></div>' +
      '<div class="card stripe ' + (rev - exp >= 0 ? "ok" : "bad") + '" style="padding:10px"><b style="font-family:var(--display)">Trip P&amp;L</b>' +
      '<div style="font-size:12.5px">Revenue ' + DB.inr(rev) + " − expenses " + DB.inr(exp) + " = <b>" + DB.inr(rev - exp) + "</b>" + (rev ? " (" + Math.round(100 * (rev - exp) / rev) + "% margin)" : "") +
      " · advances " + DB.inr((t.advances || []).reduce(function (a, x) { return a + x.amount; }, 0)) + "</div></div>";

    $("td-status").addEventListener("change", function () {
      t.status = this.value;
      saveTrip(t, "Trip " + t.id + " → " + t.status);
    });
    $("td-assign").addEventListener("click", function () {
      var id = val("td-add");
      if (!id) return;
      var d = ALL.filter(function (x) { return x.id === id; })[0];
      act(d, function (c) { c.admin.trip = t.id; c.admin.club = c.admin.club || t.id; }, "Assigned to trip " + t.id + " · " + t.route);
    });
    el.querySelectorAll("[data-unassign]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.unassign; })[0];
        act(d, function (c) { delete c.admin.trip; }, "Removed from trip " + t.id);
      });
    });
    el.querySelectorAll("[data-lrgen]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.lrgen; })[0];
        DOCS.nextNo("LR").then(function (no) {
          act(d, function (c) { c.lr = { no: no, at: DB.now(), trip: t.id }; }, "LR " + no + " issued on trip " + t.id).then(function () {
            var d2 = JSON.parse(JSON.stringify(d)); d2.lr = { no: no, at: DB.now(), trip: t.id };
            printLR(d2, t);
          });
        });
      });
    });
    el.querySelectorAll("[data-lrprint]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.lrprint; })[0];
        printLR(d, t);
      });
    });
    $("te-add").addEventListener("click", function () {
      var amt = Math.round(+val("te-amt") || 0);
      if (!amt) { say("Enter the expense amount."); return; }
      t.expenses = (t.expenses || []).concat([{ at: DB.now(), head: val("te-head"), amount: amt, note: val("te-note") }]);
      saveTrip(t, "Expense logged · " + val("te-head") + " " + DB.inr(amt));
    });
    el.querySelectorAll("[data-expdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        t.expenses.splice(+b.dataset.expdel, 1);
        saveTrip(t, "Expense removed");
      });
    });
    $("ta-add").addEventListener("click", function () {
      var amt = Math.round(+val("ta-amt") || 0);
      if (!amt) { say("Enter the advance amount."); return; }
      t.advances = (t.advances || []).concat([{ at: DB.now(), amount: amt, note: val("ta-note") }]);
      saveTrip(t, "Advance " + DB.inr(amt) + " given to " + (t.driver || "driver"));
    });
    el.querySelectorAll("[data-advdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        t.advances.splice(+b.dataset.advdel, 1);
        saveTrip(t, "Advance removed");
      });
    });
    $("ta-settle").addEventListener("click", function () { printSettlement(t); });
    el.querySelectorAll("[data-eway]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.eway; })[0];
        if (!d) return;
        download("ewaybill-" + d.id + ".json", JSON.stringify(ewayJson(d, t), null, 2), "application/json");
        act(d, function (c) { c.eway = { at: DB.now(), status: "payload generated" }; }, "E-way bill payload generated for " + d.id);
        say("E-way bill JSON downloaded — upload to ewaybillgst.gov.in (or auto-file via GSP once the Edge Function is wired). Set transDistance before filing.");
      });
    });
    $("td-manifest").addEventListener("click", function () { printManifest(t); });
  }

  /* ---- LR + manifest documents ---- */
  function gstSplit(d) {
    var gst = (d.quote.breakdown || {}).gst || Math.round(d.quote.total - d.quote.total / (1 + (CFG.gstRate || 0.05)));
    var taxable = d.quote.total - gst;
    return { taxable: taxable, gst: gst };
  }
  function printLR(d, t) {
    var g = gstSplit(d);
    DOCS.openDoc("Lorry Receipt (Consignment Note)", d.lr.no,
      DOCS.kv([
        ["Consignor", esc((d.traveller.title ? d.traveller.title + " " : "") + d.traveller.name) + "<br>" + esc(d.pickAddr || d.from) + "<br>" + esc(d.traveller.mobile || "")],
        ["Consignee", esc(d.traveller.name) + "<br>" + esc(d.dropAddr || d.to)],
        ["From → To", esc(d.from) + " → " + esc(d.to) + "<br>Booking " + esc(d.id) + " · " + esc(d.date)],
        ["Vehicle · Driver", esc((t && t.vehicle) || "—") + " (" + esc((t && t.vehicleType) || "") + ")<br>" + esc((t && t.driver) || "—") + " · " + esc((t && t.driverMobile) || "")]
      ]) +
      "<table><thead><tr><th>Packages</th><th>Said to contain</th><th>Declared value</th><th class='num'>Freight</th></tr></thead><tbody>" +
      "<tr><td>" + d.billed + " piece(s)" + (d.oversize ? " incl. " + d.oversize + " oversize" : "") + "</td>" +
      "<td>Personal baggage / household effects — sealed at pickup</td>" +
      "<td>As declared</td><td class='num'>" + DOCS.inr(g.taxable) + "</td></tr></tbody></table>" +
      DOCS.moneyTable([["Freight charges (" + esc(d.from) + " → " + esc(d.to) + ")", g.taxable], ["GST @ 5% (GTA · SAC " + (CO.sac || "9965") + ")", g.gst]], "Total freight", d.quote.total) +
      "<div class='box' style='margin-top:8px'><b>Payment</b>" + (d.pay ? "PAID · " + esc(d.pay.gateway) + " · " + DOCS.inr(d.pay.amount) + (d.pay.amount < d.quote.total ? " · balance " + DOCS.inr(d.quote.total - d.pay.amount) + " TO-PAY" : "") : "TO-PAY") + "</div>" +
      "<div class='terms'>1. Goods accepted sealed, said to contain as declared; carrier liability per the indemnity, insured up to ₹50,000 per shipment. 2. Cancellation within 96 hours of pickup is charged in full. 3. Delivery against OTP to the named consignee only. 4. GST payable under GTA — SAC " + (CO.sac || "9965") + ". 5. Subject to Vadodara jurisdiction.</div>" +
      DOCS.sigBlock("Consignor signature"),
      "LR " + d.lr.no + " · " + d.id + " · " + d.from + "→" + d.to + " · " + d.billed + " pcs · " + DOCS.inr(d.quote.total),
      d.traveller.mobile, d.traveller.email);
  }
  function printManifest(t) {
    var bk = tripBookings(t.id);
    var pcs = bk.reduce(function (a, d) { return a + d.billed; }, 0);
    var rev = tripRevenue(t), exp = tripExpense(t);
    DOCS.openDoc("Trip Manifest", t.id,
      DOCS.kv([
        ["Route · Date", esc(t.route) + " · " + esc(t.date)],
        ["Vehicle", esc(t.vehicle || "—") + " · " + esc(t.vehicleType || "")],
        ["Driver", esc(t.driver || "—") + " · " + esc(t.driverMobile || "")],
        ["Status", esc(t.status)]
      ]) +
      "<table><thead><tr><th>LR No.</th><th>Booking</th><th>Consignor</th><th>From → To</th><th class='num'>Pcs</th><th class='num'>Freight</th><th>Payment</th></tr></thead><tbody>" +
      bk.map(function (d) {
        return "<tr><td style='font-family:ui-monospace,monospace;font-size:11px'>" + esc(d.lr ? d.lr.no : "NOT ISSUED") + "</td><td class='mono'>" + esc(d.id) + "</td>" +
          "<td>" + esc(d.traveller.name) + "<br><span style='color:#888;font-size:10px'>" + esc(d.traveller.mobile || "") + "</span></td>" +
          "<td>" + esc(d.from) + " → " + esc(d.to) + "</td><td class='num'>" + d.billed + "</td>" +
          "<td class='num'>" + DOCS.inr(d.quote.total) + "</td><td>" + (d.pay ? (d.pay.amount >= d.quote.total ? "PAID" : "PART · bal " + DOCS.inr(d.quote.total - d.pay.amount)) : "TO-PAY") + "</td></tr>";
      }).join("") +
      "<tr class='tot'><td colspan='4'>Totals · " + bk.length + " consignment(s)</td><td class='num'>" + pcs + "</td><td class='num'>" + DOCS.inr(rev) + "</td><td></td></tr></tbody></table>" +
      ((t.expenses || []).length ? "<div class='dt'><h2 style='font-size:12px'>Trip expenses</h2></div>" +
        DOCS.moneyTable(t.expenses.map(function (e) { return [e.head + (e.note ? " · " + e.note : ""), e.amount]; }), "Total expenses", exp) +
        "<div class='box'><b>Trip P&amp;L</b>Revenue " + DOCS.inr(rev) + " − expenses " + DOCS.inr(exp) + " = <b>" + DOCS.inr(rev - exp) + "</b></div>" : "") +
      "<div class='terms'>No bag moves without its LR on this manifest. Driver confirms piece count at loading and at every handover.</div>" +
      DOCS.sigBlock("Driver signature"),
      "Manifest " + t.id + " · " + t.route + " · " + bk.length + " LRs · " + pcs + " pcs",
      t.driverMobile, "");
  }

  /* ================= FINANCE DOCUMENTS ================= */
  function renderFinDocSelect() {
    var sel = $("fd-booking");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = ALL.map(function (d) {
      return '<option value="' + esc(d.id) + '">' + esc(d.id) + " · " + esc(d.traveller.name || "—") + " · " + DB.inr(d.quote.total) + " · " + (LABEL[d.status] || d.status) + "</option>";
    }).join("") || "<option value=''>No bookings</option>";
    if (cur) sel.value = cur;
    renderFdLog();
  }
  function fdBooking() { return ALL.filter(function (d) { return d.id === val("fd-booking"); })[0]; }
  function renderFdLog() {
    var d = fdBooking(), el = $("fd-log");
    if (!el) return;
    el.innerHTML = d && (d.docs || []).length ? d.docs.slice().reverse().map(function (x) {
      return '<div><span class="dot info"></span><span>' + esc(x.type) + " · <span class='mono'>" + esc(x.no) + "</span> · " + DB.inr(x.amount) + "</span><time>" + DB.fmt(x.at) + "</time></div>";
    }).join("") : '<div><span class="src">Documents generated for the selected booking appear here.</span></div>';
  }
  $("fd-booking").addEventListener("change", renderFdLog);
  function logDocOn(d, type, no, amount) {
    return act(d, function (c) { c.docs = (c.docs || []).concat([{ type: type, no: no, at: DB.now(), amount: Math.round(amount) }]); }, type + " " + no + " generated · " + DB.inr(amount));
  }
  function billTo(d) {
    return (d.business ? esc(d.business.name) + "<br>GSTIN " + esc(d.business.gstin || "—") + "<br>" : "") +
      esc((d.traveller.title ? d.traveller.title + " " : "") + d.traveller.name) + "<br>" + esc(d.traveller.mobile || "") + (d.traveller.email ? "<br>" + esc(d.traveller.email) : "");
  }
  function invoiceBody(d, title) {
    var g = gstSplit(d);
    return DOCS.kv([
      ["Bill to", billTo(d)],
      ["Service", esc(d.ucName) + "<br>" + esc(d.from) + " → " + esc(d.to) + " · " + esc(d.date) + "<br>Booking " + esc(d.id) + (d.lr ? " · LR " + esc(d.lr.no) : "")]
    ]) +
      "<table><thead><tr><th>#</th><th>Description</th><th>SAC</th><th class='num'>Qty</th><th class='num'>Taxable</th></tr></thead><tbody>" +
      "<tr><td>1</td><td>Door-to-door baggage transport · " + esc(d.from) + " → " + esc(d.to) + (d.oversize ? "<br>incl. " + d.oversize + " oversize piece(s)" : "") + "</td><td>9965</td><td class='num'>" + d.billed + " pcs</td><td class='num'>" + DOCS.inr(g.taxable) + "</td></tr></tbody></table>" +
      DOCS.moneyTable([["Taxable value", g.taxable], ["GST @ 5% (GTA)", g.gst]], "Invoice total", d.quote.total) +
      "<div class='box'><b>Amount in words</b>" + DOCS.inWords(d.quote.total) + "</div>" +
      "<div class='grid2'><div class='box'><b>Payment</b>" + (d.pay ? esc(d.pay.gateway) + " · " + DOCS.inr(d.pay.amount) + (d.pay.amount < d.quote.total ? " · balance due " + DOCS.inr(d.quote.total - d.pay.amount) : " · PAID IN FULL") : "Unpaid — pay via " + esc((CFG.payments || {}).upi || "")) + "</div>" +
      "<div class='box'><b>Bank</b>" + esc((CFG.payments || {}).bank || "") + "</div></div>" +
      (title === "Proforma Invoice" ? "<div class='terms'>Proforma only — not a demand for payment and not valid for input credit. The tax invoice follows on confirmation.</div>" : "<div class='terms'>GST payable by the transporter under GTA at 5%. Insured up to ₹50,000 per shipment. Subject to Vadodara jurisdiction.</div>") +
      DOCS.sigBlock("Receiver");
  }
  $("fd-pi").addEventListener("click", function () {
    var d = fdBooking(); if (!d) return;
    DOCS.nextNo("PI").then(function (no) {
      DOCS.openDoc("Proforma Invoice", no, invoiceBody(d, "Proforma Invoice"),
        "Proforma invoice " + no + " · " + d.id + " · " + DOCS.inr(d.quote.total) + " incl GST 5%", d.traveller.mobile, d.traveller.email);
      logDocOn(d, "Proforma invoice", no, d.quote.total);
    });
  });
  $("fd-inv").addEventListener("click", function () {
    var d = fdBooking(); if (!d) return;
    DOCS.nextNo("INV").then(function (no) {
      DOCS.openDoc("Tax Invoice", no, invoiceBody(d, "Tax Invoice"),
        "Tax invoice " + no + " · " + d.id + " · " + DOCS.inr(d.quote.total) + " incl GST 5%", d.traveller.mobile, d.traveller.email);
      logDocOn(d, "Tax invoice", no, d.quote.total);
    });
  });
  function receiptBody(d, amount, mode, note) {
    return DOCS.kv([["Received from", billTo(d)], ["Against", "Booking " + esc(d.id) + " · " + esc(d.from) + " → " + esc(d.to) + " · " + esc(d.date)]]) +
      DOCS.moneyTable([[mode + (note ? " · " + esc(note) : ""), amount]], "Amount received", amount) +
      "<div class='box'><b>In words</b>" + DOCS.inWords(amount) + "</div>" +
      "<div class='terms'>Receipt subject to realisation. Balance, if any, is payable before pickup.</div>" + DOCS.sigBlock("Received by");
  }
  $("fd-rct").addEventListener("click", function () {
    var d = fdBooking(); if (!d) return;
    if (!d.pay) { $("fd-msg").textContent = "No captured payment on this booking — use Cash receipt for money taken by hand."; return; }
    DOCS.nextNo("RCT").then(function (no) {
      DOCS.openDoc("Payment Receipt", no, receiptBody(d, d.pay.amount, d.pay.gateway + " · " + d.pay.mode, d.pay.at && DB.fmt(d.pay.at)),
        "Payment receipt " + no + " · " + DOCS.inr(d.pay.amount) + " received against " + d.id + ". Thank you!", d.traveller.mobile, d.traveller.email);
      logDocOn(d, "Payment receipt", no, d.pay.amount);
    });
  });
  ["fd-csh", "fd-cv"].forEach(function (id) {
    $(id).addEventListener("click", function () {
      if ($("fd-cashrow").hidden) { $("fd-cashrow").hidden = false; $("fd-cashrow").dataset.kind = id; $("fd-msg").textContent = "Enter the amount, then press the button again."; return; }
      var d = fdBooking(); if (!d) return;
      var amt = Math.round(+val("fd-cashamt") || 0);
      if (!amt) { $("fd-msg").textContent = "Enter the amount."; return; }
      if (id === "fd-csh") {
        DOCS.nextNo("CSH").then(function (no) {
          DOCS.openDoc("Cash Receipt", no, receiptBody(d, amt, "Cash", val("fd-note")),
            "Cash receipt " + no + " · " + DOCS.inr(amt) + " received against " + d.id + ".", d.traveller.mobile, d.traveller.email);
          act(d, function (c) {
            if (c.pay) c.pay.amount += amt; else c.pay = { mode: "cash", amount: amt, status: "captured", gateway: "Cash", at: DB.now() };
            if (c.status === "quoted" || c.status === "identified") c.status = "submitted";
            c.docs = (c.docs || []).concat([{ type: "Cash receipt", no: no, at: DB.now(), amount: amt }]);
          }, "Cash " + DB.inr(amt) + " received · receipt " + no);
          $("fd-cashrow").hidden = true; $("fd-cashamt").value = ""; $("fd-msg").textContent = "";
        });
      } else {
        DOCS.nextNo("CV").then(function (no) {
          DOCS.openDoc("Credit Voucher", no,
            DOCS.kv([["Credit to", billTo(d)], ["Against", "Booking " + esc(d.id) + " · " + (val("fd-note") || "refund / adjustment")]]) +
            DOCS.moneyTable([["Credit · " + (val("fd-note") || "refund"), amt]], "Credit amount", amt) +
            "<div class='box'><b>In words</b>" + DOCS.inWords(amt) + "</div>" + DOCS.sigBlock("Approved by"),
            "Credit voucher " + no + " · " + DOCS.inr(amt) + " against " + d.id + " — " + (val("fd-note") || "refund"), d.traveller.mobile, d.traveller.email);
          logDocOn(d, "Credit voucher", no, amt);
          $("fd-cashrow").hidden = true; $("fd-cashamt").value = ""; $("fd-msg").textContent = "";
        });
      }
    });
  });

  /* ---- bank reconciliation ---- */
  $("br-run").addEventListener("click", function () {
    var lines = val("br-paste").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) { $("br-msg").textContent = "Paste the statement rows first."; return; }
    var rows = lines.map(function (l) {
      var parts = l.split(/\t|,/).map(function (x) { return x.trim(); });
      var amt = 0;
      for (var i = parts.length - 1; i >= 0; i--) {
        var n = parseFloat(parts[i].replace(/[₹,\s]/g, ""));
        if (n > 0 && !/\d{2}[\/\-]\d{2}/.test(parts[i])) { amt = Math.round(n); break; }
      }
      return { raw: l, desc: parts.join(" "), amount: amt };
    });
    var out = [], matchedIds = {};
    rows.forEach(function (r) {
      var hit = ALL.filter(function (d) {
        if (matchedIds[d.id]) return false;
        var refHit = r.desc.toUpperCase().indexOf(d.id.toUpperCase()) >= 0;
        var mobHit = d.traveller.mobile && r.desc.replace(/\D/g, "").indexOf(d.traveller.mobile.replace(/\D/g, "").slice(-10)) >= 0;
        var amtHit = d.pay ? Math.abs(d.pay.amount - r.amount) < 1 : Math.abs(d.quote.total - r.amount) < 1;
        return (refHit || mobHit) ? true : amtHit && r.amount > 0;
      })[0];
      if (hit) matchedIds[hit.id] = true;
      out.push({ row: r, booking: hit });
    });
    var matched = out.filter(function (x) { return x.booking; });
    $("br-msg").textContent = matched.length + " of " + rows.length + " row(s) matched.";
    $("br-out").innerHTML =
      '<div class="tbl"><table><thead><tr><th>Statement row</th><th>Matched booking</th><th></th></tr></thead><tbody>' +
      out.map(function (x, i) {
        return "<tr><td style='font-size:11.5px'>" + esc(x.row.raw.slice(0, 60)) + "<br><b class='num'>" + DB.inr(x.row.amount) + "</b></td>" +
          "<td>" + (x.booking ? "<span class='mono'>" + esc(x.booking.id) + "</span> · " + esc(x.booking.traveller.name || "") + "<br><span class='src'>" + (x.booking.pay ? "payment on record " + DB.inr(x.booking.pay.amount) : "NO payment on record — " + DB.inr(x.booking.quote.total) + " due") + "</span>" : "<span class='pill bad'>unmatched</span>") + "</td>" +
          "<td>" + (x.booking ? '<button class="btn sm primary" data-brok="' + i + '">Confirm</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="src" style="margin:6px 0 0">Confirm writes the bank reference onto the booking\'s payment (creating a bank-transfer payment when none exists) and marks it reconciled.</p>';
    $("br-out").querySelectorAll("[data-brok]").forEach(function (b) {
      b.addEventListener("click", function () {
        var x = out[+b.dataset.brok];
        act(x.booking, function (c) {
          if (!c.pay) c.pay = { mode: "full", amount: x.row.amount, status: "captured", gateway: "Bank transfer", at: DB.now() };
          c.pay.recon = { at: DB.now(), ref: x.row.raw.slice(0, 80) };
          if (c.status === "quoted" || c.status === "identified") c.status = "submitted";
        }, "Bank reconciliation confirmed · " + DB.inr(x.row.amount) + " matched to statement");
      });
    });
  });

  /* ================= CRM INTENSE ================= */
  function renderCaWho() {
    var sel = $("ca-who");
    if (!sel) return;
    var cur = sel.value;
    var opts = AI.crmCustomers(ALL).map(function (c) {
      return { v: "c:" + c.mobile, t: (c.name || c.mobile) + " · customer", mob: c.mobile, em: (c.bookings[0].traveller || {}).email };
    }).concat(INQ.map(function (i) {
      return { v: "l:" + i.id, t: i.contact.name + " · lead (" + i.status + ")", mob: i.contact.mobile, em: i.contact.email };
    }));
    sel.innerHTML = opts.map(function (o) { return '<option value="' + esc(o.v) + '" data-mob="' + esc(o.mob || "") + '" data-em="' + esc(o.em || "") + '">' + esc(o.t) + "</option>"; }).join("") || "<option value=''>No contacts yet</option>";
    if (cur) sel.value = cur;
  }
  function caContact() {
    var o = $("ca-who").selectedOptions[0];
    return o ? { label: o.textContent, mob: o.dataset.mob, em: o.dataset.em } : null;
  }
  $("ca-log").addEventListener("click", function () {
    var c = caContact();
    if (!c || !val("ca-text")) { $("ca-msg").textContent = "Pick the contact and say what happened."; return; }
    var id = "CRM-" + Date.now().toString(36) + Math.floor(Math.random() * 100);
    DB.put("crm", id, {
      id: id, created: DB.now(),
      text: val("ca-type") + " · " + c.label + " — " + val("ca-text") + " [" + val("ca-dept") + "]",
      kind: val("ca-type"), dept: val("ca-dept"), contact: c.label,
      msg: val("ca-text"), dueAt: val("ca-due") || null, doneAt: null, refId: null, followKey: null
    }).then(function () {
      $("ca-text").value = ""; $("ca-due").value = "";
      $("ca-msg").textContent = "Logged" + (val("ca-due") ? " · follow-up scheduled" : "") + ".";
    });
  });
  $("ca-email").addEventListener("click", function () {
    var c = caContact(); if (!c) return;
    location.href = "mailto:" + encodeURIComponent(c.em || "") + "?subject=" + encodeURIComponent("Bagdrop · your luggage move") + "&body=" + encodeURIComponent(val("ca-text") || "");
    say("Email composer opened — log the activity once sent.");
  });
  $("ca-wa").addEventListener("click", function () {
    var c = caContact(); if (!c) return;
    window.open("https://wa.me/" + (c.mob || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(val("ca-text") || ""), "_blank");
    say("WhatsApp opened — log the activity once sent.");
  });
  function renderCrmDue() {
    var el = $("crm-due");
    if (!el) return;
    renderCaWho();
    var due = CRMLOG.filter(function (c) { return c.dueAt && !c.doneAt; })
      .sort(function (a, b) { return a.dueAt.localeCompare(b.dueAt); });
    var today = new Date().toISOString().slice(0, 10);
    el.innerHTML = due.length ? due.map(function (c) {
      var late = c.dueAt < today;
      return '<div><span class="dot ' + (late ? "bad" : c.dueAt === today ? "warn" : "info") + '"></span><span><b>' + esc(c.dueAt) + (late ? " · OVERDUE" : "") + "</b> · " + esc(c.text) +
        ' <button class="btn sm" data-cadone="' + esc(c.id) + '">Done</button></span></div>';
    }).join("") : '<div><span class="src">Nothing due. Schedule follow-ups from the activity form above.</span></div>';
    el.querySelectorAll("[data-cadone]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = CRMLOG.filter(function (x) { return x.id === b.dataset.cadone; })[0];
        if (!c) return;
        var c2 = JSON.parse(JSON.stringify(c)); c2.doneAt = DB.now();
        DB.put("crm", c.id, c2).then(function () { say("Follow-up closed."); });
      });
    });
  }
  function renderCrmLost() {
    var el = $("crm-lost");
    if (!el) return;
    var lost = ALL.filter(function (d) { return d.status === "cancelled" || d.status === "rejected"; });
    el.innerHTML = lost.length ? lost.map(function (d) {
      return "<tr><td class='mono'>" + esc(d.id) + "</td><td>" + esc(d.traveller.name || "—") + "<br><span class='src'>" + esc(d.traveller.mobile || "") + "</span></td>" +
        "<td class='src'>" + esc((d.admin || {}).reason || d.status) + "</td>" +
        '<td><button class="btn sm" data-winback="' + esc(d.id) + '">Win-back draft</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="src">None — good.</td></tr>';
    el.querySelectorAll("[data-winback]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = ALL.filter(function (x) { return x.id === b.dataset.winback; })[0];
        var m = "Hi " + (d.traveller.name || "").split(" ")[0] + ", sorry we couldn't serve your " + d.from + " → " + d.to + " move. When you plan the next one, your quote is ready in a minute and the first pickup carries 10% off: bagdrop.co";
        crmLog("Win-back drafted for " + d.id + " (" + d.traveller.name + ")", d.id, null, m);
        navigator.clipboard.writeText(m).then(function () { say("Win-back message copied and logged."); })
          .catch(function () { say("Win-back message logged — copy it from the activity log."); });
      });
    });
  }

  /* ================= MIS + PDF/EXCEL/SHARE ================= */
  function misData() {
    var by = {};
    ALL.forEach(function (d) {
      var k = (d.created || "").slice(0, 7);
      var m = by[k] = by[k] || { month: k, n: 0, pcs: 0, rev: 0, exp: 0 };
      m.n++; m.pcs += (d.bags || 0) + (d.oversize || 0);
      if (d.pay) m.rev += d.pay.amount;
    });
    TRIPS.forEach(function (t) {
      var k = (t.date || t.created || "").slice(0, 7);
      if (!by[k]) by[k] = { month: k, n: 0, pcs: 0, rev: 0, exp: 0 };
      by[k].exp += tripExpense(t);
    });
    return Object.values(by).sort(function (a, b) { return a.month.localeCompare(b.month); });
  }
  function renderMis() {
    var el = $("mis-rows");
    if (!el) return;
    var rows = misData();
    el.innerHTML = rows.length ? rows.map(function (m) {
      return "<tr><td>" + m.month + "</td><td class='num'>" + m.n + "</td><td class='num'>" + m.pcs + "</td><td class='num'>" + DB.inr(m.rev) + "</td><td class='num'>" + DB.inr(m.exp) + "</td><td class='num' style='color:var(--" + (m.rev - m.exp >= 0 ? "ok" : "bad") + ")'>" + DB.inr(m.rev - m.exp) + "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="src">No data yet.</td></tr>';
  }
  function misSummaryText() {
    var rows = misData();
    return "Bagdrop MIS · " + new Date().toLocaleDateString("en-IN") + "\n" +
      rows.map(function (m) { return m.month + ": " + m.n + " bookings · " + m.pcs + " pcs · rev " + DB.inr(m.rev) + " · exp " + DB.inr(m.exp) + " · margin " + DB.inr(m.rev - m.exp); }).join("\n");
  }
  function reportTable(headers, rows) {
    return "<table><thead><tr>" + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }
  $("mis-pdf").addEventListener("click", function () {
    DOCS.openDoc("MIS Report · Monthly", "MIS/" + DOCS.FY, reportTable(
      ["Month", "Bookings", "Pieces", "Revenue", "Trip expenses", "Margin"],
      misData().map(function (m) { return [m.month, m.n, m.pcs, DOCS.inr(m.rev), DOCS.inr(m.exp), DOCS.inr(m.rev - m.exp)]; })
    ), misSummaryText(), "", "");
  });
  $("mis-wa").addEventListener("click", function () {
    window.open("https://wa.me/?text=" + encodeURIComponent(misSummaryText()), "_blank");
  });
  $("mis-mail").addEventListener("click", function () {
    location.href = "mailto:?subject=" + encodeURIComponent("Bagdrop MIS · monthly") + "&body=" + encodeURIComponent(misSummaryText());
  });
  document.querySelectorAll("[data-pdf]").forEach(function (b) {
    b.addEventListener("click", function () {
      var kind = b.dataset.pdf;
      if (kind === "bookings") {
        DOCS.openDoc("Bookings Report", "RPT/" + DOCS.FY, reportTable(
          ["Booking", "Customer", "Route", "Date", "Pcs", "Total", "Status"],
          ALL.map(function (d) { return [d.id, esc(d.traveller.name || ""), esc(d.from) + " → " + esc(d.to), d.date, d.billed, DOCS.inr(d.quote.total), LABEL[d.status] || d.status]; })
        ), "Bagdrop bookings report · " + ALL.length + " bookings", "", "");
      } else if (kind === "payments") {
        var paid = ALL.filter(function (d) { return d.pay; });
        DOCS.openDoc("Payments Report", "RPT/" + DOCS.FY, reportTable(
          ["When", "Booking", "Gateway", "Amount", "Reconciled"],
          paid.map(function (d) { return [DB.fmt(d.pay.at), d.id, d.pay.gateway, DOCS.inr(d.pay.amount), d.pay.recon ? "Yes" : "—"]; })
        ), "Bagdrop payments report · " + paid.length + " captures", "", "");
      } else if (kind === "trips") {
        DOCS.openDoc("Trips P&L Report", "RPT/" + DOCS.FY, reportTable(
          ["Trip", "Route", "Date", "Vehicle", "LRs", "Revenue", "Expenses", "Margin"],
          TRIPS.map(function (t) {
            var r = tripRevenue(t), e = tripExpense(t);
            return [t.id, esc(t.route), t.date, esc(t.vehicle || ""), tripBookings(t.id).length, DOCS.inr(r), DOCS.inr(e), DOCS.inr(r - e)];
          })
        ), "Bagdrop trips P&L", "", "");
      }
    });
  });

  /* ================= OUTBOX (automated sending architecture) ================= */
  var OUTBOX = [];
  DB.watch("outbox", function (list) { OUTBOX = list; renderOutbox(); });
  function queueSend(channel, to, text, ref) {
    var id = "OB-" + Date.now().toString(36) + Math.floor(Math.random() * 100);
    return DB.put("outbox", id, { id: id, created: DB.now(), channel: channel, to: to || "", text: text, ref: ref || null, status: "queued", sentAt: null });
  }
  function renderOutbox() {
    var el = $("ob-list");
    if (!el) return;
    var open = OUTBOX.filter(function (o) { return o.status === "queued"; });
    el.innerHTML = OUTBOX.length ? OUTBOX.slice(0, 12).map(function (o) {
      return '<div><span class="dot ' + (o.status === "sent" ? "ok" : "warn") + '"></span><span><b>' + esc(o.channel) + "</b> → " + esc(o.to || "—") + " · " + esc(o.text.slice(0, 70)) + "…" +
        (o.status === "queued" ? ' <button class="btn sm" data-obsend="' + esc(o.id) + '">Send now</button> <button class="btn sm" data-obdel="' + esc(o.id) + '">✕</button>' : ' <span class="pill ok">sent</span>') +
        "</span><time>" + DB.fmt(o.created) + "</time></div>";
    }).join("") : '<div><span class="src">Nothing queued. Documents and reminders queue here when shared.</span></div>';
    el.querySelectorAll("[data-obsend]").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = OUTBOX.filter(function (x) { return x.id === b.dataset.obsend; })[0];
        if (!o) return;
        if (o.channel === "whatsapp") window.open("https://wa.me/" + (o.to || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(o.text), "_blank");
        else location.href = "mailto:" + encodeURIComponent(o.to || "") + "?subject=" + encodeURIComponent("Bagdrop") + "&body=" + encodeURIComponent(o.text);
        var o2 = JSON.parse(JSON.stringify(o)); o2.status = "sent"; o2.sentAt = DB.now();
        DB.put("outbox", o.id, o2);
      });
    });
    el.querySelectorAll("[data-obdel]").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = OUTBOX.filter(function (x) { return x.id === b.dataset.obdel; })[0];
        var o2 = JSON.parse(JSON.stringify(o)); o2.status = "sent"; o2.sentAt = DB.now(); o2.text = "[discarded] " + o2.text;
        DB.put("outbox", o.id, o2);
      });
    });
    /* gateway pills */
    DB.get("settings", "gateways").then(function (g) {
      g = (g && g.keys) || {};
      $("ob-wa-pill").className = "pill " + (g.whatsapp ? "ok" : "mute");
      $("ob-wa-pill").textContent = "WhatsApp — " + (g.whatsapp ? "key set (server sends on deploy)" : "not wired");
      $("ob-em-pill").className = "pill " + (g.email ? "ok" : "mute");
      $("ob-em-pill").textContent = "Email — " + (g.email ? "key set (server sends on deploy)" : "not wired");
    });
  }
  $("ob-keys").addEventListener("click", function () {
    var row = $("ob-keysrow");
    if (row.hidden) { row.hidden = false; return; }
    DB.put("settings", "gateways", { id: "gateways", created: DB.now(), keys: { whatsapp: val("ob-watoken") || null, email: val("ob-emkey") || null } }).then(function () {
      row.hidden = true;
      say("Gateway keys saved to the back end. The send worker (Edge Function) drains the outbox with them once deployed.");
      renderOutbox();
    });
  });
  /* auto-queue document summaries to the customer */
  var _logDocOn = logDocOn;
  logDocOn = function (d, type, no, amount) {
    queueSend("whatsapp", d.traveller.mobile, type + " " + no + " · " + DB.inr(amount) + " · booking " + d.id + " — Bagdrop", d.id);
    return _logDocOn(d, type, no, amount);
  };

  /* ================= GST CREDIT NOTE · E-INVOICE · POD ================= */
  $("fd-cn").addEventListener("click", function () {
    if ($("fd-cashrow").hidden) { $("fd-cashrow").hidden = false; $("fd-msg").textContent = "Enter the credit amount (incl GST) and the reason, then press GST credit note again."; return; }
    var d = fdBooking(); if (!d) return;
    var amt = Math.round(+val("fd-cashamt") || 0);
    if (!amt) { $("fd-msg").textContent = "Enter the credit amount."; return; }
    var gstR = CFG.gstRate || 0.05;
    var taxable = Math.round(amt / (1 + gstR)), gst = amt - taxable;
    var inv = (d.docs || []).filter(function (x) { return x.type === "Tax invoice"; }).slice(-1)[0];
    DOCS.nextNo("CN").then(function (no) {
      DOCS.openDoc("Credit Note (GST)", no,
        DOCS.kv([["Issued to", billTo(d)], ["Against", (inv ? "Tax invoice " + esc(inv.no) : "Booking " + esc(d.id)) + "<br>Reason: " + esc(val("fd-note") || "adjustment")]]) +
        DOCS.moneyTable([["Taxable value reversed", taxable], ["GST @ 5% reversed (GTA)", gst]], "Credit note total", amt) +
        "<div class='box'><b>In words</b>" + DOCS.inWords(amt) + "</div>" +
        "<div class='terms'>Credit note under Section 34, CGST Act — reduces the tax liability of the referenced invoice. SAC 9965.</div>" +
        DOCS.sigBlock("Accepted by"),
        "GST credit note " + no + " · " + DOCS.inr(amt) + " against " + d.id, d.traveller.mobile, d.traveller.email);
      logDocOn(d, "GST credit note", no, amt);
      $("fd-cashrow").hidden = true; $("fd-cashamt").value = ""; $("fd-msg").textContent = "";
    });
  });
  $("fd-einv").addEventListener("click", function () {
    var d = fdBooking(); if (!d) return;
    var g = gstSplit(d);
    var inv = (d.docs || []).filter(function (x) { return x.type === "Tax invoice"; }).slice(-1)[0];
    var payload = {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: "B2C", RegRev: "N" },
      DocDtls: { Typ: "INV", No: (inv ? inv.no : "PENDING").replace(/\//g, "-"), Dt: new Date().toLocaleDateString("en-GB").replace(/\//g, "/") },
      SellerDtls: { Gstin: (CFG.company || {}).gstin, LglNm: (CFG.company || {}).name, Loc: "Vadodara", Pos: "24", Addr1: (CFG.company || {}).address },
      BuyerDtls: { Gstin: d.business ? d.business.gstin : null, LglNm: d.business ? d.business.name : d.traveller.name, Pos: "24" },
      ItemList: [{ SlNo: "1", PrdDesc: "Door-to-door baggage transport " + d.from + " to " + d.to, IsServc: "Y", HsnCd: "9965", Qty: d.billed, Unit: "NOS", UnitPrice: g.taxable / d.billed, TotAmt: g.taxable, AssAmt: g.taxable, GstRt: 5, IgstAmt: g.gst, TotItemVal: d.quote.total }],
      ValDtls: { AssVal: g.taxable, IgstVal: g.gst, TotInvVal: d.quote.total }
    };
    download("einvoice-" + d.id + ".json", JSON.stringify(payload, null, 2), "application/json");
    logDocOn(d, "E-invoice payload", "IRP/" + d.id, d.quote.total);
    say("E-invoice JSON downloaded — upload to the IRP (or a GSP like ClearTax) to get the IRN + QR. Auto-submission wires into the Edge Function.");
  });
  $("fd-pod").addEventListener("click", function () {
    var d = fdBooking(); if (!d) return;
    var delivered = (d.events || []).filter(function (e) { return /deliver/i.test(e.text); }).slice(-1)[0];
    DOCS.nextNo("POD").then(function (no) {
      DOCS.openDoc("Proof of Delivery", no,
        DOCS.kv([
          ["Consignment", "Booking " + esc(d.id) + (d.lr ? " · LR " + esc(d.lr.no) : "") + "<br>" + esc(d.from) + " → " + esc(d.to)],
          ["Delivered to", esc(d.traveller.name) + "<br>" + esc(d.dropAddr || d.to)],
          ["Delivered at", delivered ? DB.fmt(delivered.at) : "— (not yet marked delivered)"],
          ["Verification", "OTP verified at handover · " + d.billed + " piece(s), seals intact" + (val("fd-note") ? "<br>Remarks: " + esc(val("fd-note")) : "")]
        ]) +
        "<table><thead><tr><th>Pieces</th><th>Condition</th><th>Received by</th></tr></thead><tbody><tr><td>" + d.billed + "</td><td>Seals intact, no damage reported</td><td>" + esc(d.traveller.name) + "</td></tr></tbody></table>" +
        "<div class='terms'>Delivery completed against OTP to the verified consignee. Claims, if any, must be raised within 24 hours with photographs.</div>" +
        DOCS.sigBlock("Receiver signature"),
        "POD " + no + " · " + d.id + " delivered — thank you for moving with Bagdrop!", d.traveller.mobile, d.traveller.email);
      act(d, function (c) { c.pod = { no: no, at: DB.now(), receiver: d.traveller.name }; }, "POD " + no + " issued");
    });
  });

  /* ================= DRIVER ADVANCES (settlement handled in trip detail) ================= */
  function advTotal(t) { return (t.advances || []).reduce(function (a, e) { return a + e.amount; }, 0); }
  function printSettlement(t) {
    var exp = tripExpense(t), adv = advTotal(t), bal = adv - exp;
    DOCS.openDoc("Driver Trip Settlement", t.id,
      DOCS.kv([["Driver", esc(t.driver || "—") + " · " + esc(t.driverMobile || "")], ["Trip", esc(t.id) + " · " + esc(t.route) + " · " + esc(t.date)]]) +
      "<div class='dt'><h2 style='font-size:12px'>Advances given</h2></div>" +
      DOCS.moneyTable((t.advances || []).map(function (a) { return [DB.fmt(a.at) + (a.note ? " · " + esc(a.note) : ""), a.amount]; }), "Total advances", adv) +
      "<div class='dt'><h2 style='font-size:12px'>Expenses submitted</h2></div>" +
      DOCS.moneyTable((t.expenses || []).map(function (e) { return [e.head + (e.note ? " · " + esc(e.note) : ""), e.amount]; }), "Total expenses", exp) +
      "<div class='box'><b>Settlement</b>" + (bal > 0 ? "Driver returns " + DOCS.inr(bal) + " to the company" : bal < 0 ? "Company pays driver " + DOCS.inr(-bal) : "Settled — advances equal expenses") + "</div>" +
      "<div class='box'><b>In words</b>" + DOCS.inWords(Math.abs(bal)) + "</div>" +
      DOCS.sigBlock("Driver signature"),
      "Trip settlement " + t.id + ": advances " + DOCS.inr(adv) + " · expenses " + DOCS.inr(exp) + " · " + (bal >= 0 ? "driver returns " : "company pays ") + DOCS.inr(Math.abs(bal)),
      t.driverMobile, "");
  }

  /* ================= E-WAY BILL ================= */
  function ewayJson(d, t) {
    var g = gstSplit(d);
    return {
      supplyType: "O", subSupplyType: "1", docType: "INV",
      docNo: ((d.docs || []).filter(function (x) { return x.type === "Tax invoice"; }).slice(-1)[0] || { no: d.lr ? d.lr.no : d.id }).no.replace(/\//g, "-"),
      docDate: new Date().toLocaleDateString("en-GB"),
      fromGstin: (CFG.company || {}).gstin, fromTrdName: (CFG.company || {}).name, fromPlace: d.from, fromStateCode: 24,
      toGstin: d.business ? d.business.gstin : "URP", toTrdName: d.business ? d.business.name : d.traveller.name, toPlace: d.to,
      totalValue: g.taxable, igstValue: g.gst, totInvValue: d.quote.total,
      transMode: "1", transDistance: "0",
      vehicleNo: (t && t.vehicle || "").replace(/\s/g, ""), vehicleType: "R",
      itemList: [{ productDesc: "Personal baggage / household effects", hsnCode: "9965", quantity: d.billed, qtyUnit: "NOS", taxableAmount: g.taxable, igstRate: 5 }]
    };
  }

  /* ================= PDF FILES (jsPDF) ================= */
  document.querySelectorAll("[data-fpdf]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.fpdf;
      if (k === "mis") {
        DOCS.filePdf("MIS Report Monthly", "MIS/" + DOCS.FY, ["Month", "Bookings", "Pieces", "Revenue", "Expenses", "Margin"],
          misData().map(function (m) { return [m.month, m.n, m.pcs, m.rev, m.exp, m.rev - m.exp]; }),
          ["GST charged at 5% (GTA). Figures from the live database, " + new Date().toLocaleString("en-IN") + "."]);
      } else if (k === "bookings") {
        DOCS.filePdf("Bookings Report", "RPT/" + DOCS.FY, ["Booking", "Customer", "Route", "Date", "Pcs", "Total", "Status"],
          ALL.map(function (d) { return [d.id, d.traveller.name || "", d.from + ">" + d.to, d.date, d.billed, d.quote.total, LABEL[d.status] || d.status]; }), []);
      } else if (k === "payments") {
        DOCS.filePdf("Payments Report", "RPT/" + DOCS.FY, ["When", "Booking", "Gateway", "Amount", "Recon"],
          ALL.filter(function (d) { return d.pay; }).map(function (d) { return [DB.fmt(d.pay.at), d.id, d.pay.gateway, d.pay.amount, d.pay.recon ? "Yes" : "-"]; }), []);
      } else if (k === "trips") {
        DOCS.filePdf("Trips PnL Report", "RPT/" + DOCS.FY, ["Trip", "Route", "Date", "Vehicle", "Revenue", "Expenses", "Margin"],
          TRIPS.map(function (t) { var r = tripRevenue(t), e = tripExpense(t); return [t.id, t.route, t.date, t.vehicle || "", r, e, r - e]; }), []);
      }
      say("PDF file downloading.");
    });
  });

  /* ---------------- audit ---------------- */
  function renderAudit() {
    var evts = [];
    ALL.forEach(function (d) {
      (d.events || []).forEach(function (e) {
        if (e.by === "admin") evts.push({ at: e.at, text: d.id + " · " + e.text });
      });
    });
    CRMLOG.forEach(function (c) { evts.push({ at: c.created, text: "CRM · " + c.text }); });
    evts.sort(function (a, b) { return b.at.localeCompare(a.at); });
    $("auditfeed").innerHTML = evts.length ? evts.slice(0, 40).map(function (e) {
      return '<div><span class="dot info"></span><span>Ops · ' + esc(e.text) + "</span><time>" + DB.fmt(e.at) + "</time></div>";
    }).join("") : '<div><span class="src">No admin actions yet. Every accept, revision, assignment and CRM follow-up lands here.</span></div>';
  }
})();
