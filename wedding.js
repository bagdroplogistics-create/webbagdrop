/* Wedding guest landing page — loads the event record by ?code= and books families. */
(function () {
  "use strict";
  var DB = window.DB;
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { return ($(id).value || "").trim(); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var code = new URLSearchParams(location.search).get("code");
  var EV = null;

  if (!code) { $("notfound").hidden = false; return; }

  DB.watchDoc("events", code, function (e) {
    if (!e) { $("notfound").hidden = false; $("page").hidden = true; return; }
    EV = e;
    $("notfound").hidden = true;
    $("page").hidden = false;
    render(e);
  });

  function render(e) {
    var L = e.landing || {};
    document.title = (L.names || e.name) + " · Travel light";
    $("l-place").textContent = (e.venue || "") + (e.venueCity ? " · " + e.venueCity.toUpperCase() : "");
    $("l-names").textContent = L.names || e.name;
    $("l-dates").textContent = L.datesText || (e.dates.in + " → " + e.dates.out);
    $("l-footnames").textContent = L.names || e.name;
    $("l-footdates").textContent = L.datesText || "";
    $("l-foothash").textContent = L.hashtag || "";
    $("l-destp").textContent = L.destination || ("Every bag gets its own tag, linked to the person it belongs to and the room they're staying in. You see each one move, and you get a photo when it reaches your room.");
    if (L.celebration) $("l-stripp").textContent = L.celebration;

    var hostPays = e.billing === "host";
    $("l-chips").innerHTML = [
      hostPays ? "No payment needed" : "Simple family billing",
      "Room-matched delivery", "Tagged & sealed", "Live tracking",
      e.direction === "both" ? "Return home included" : null
    ].filter(Boolean).map(function (c) { return '<span class="chip"><i></i>' + c + "</span>"; }).join("");
    $("l-booklede").textContent = "About three minutes. " + (hostPays ? "No payment: the hosts have covered it." : "We confirm the details with you on WhatsApp.") + " You confirm with a one-time Aadhaar code at the end.";

    /* pickup cities = sectors only */
    var citySel = $("w-city");
    citySel.innerHTML = e.sectors.map(function (s) { return '<option value="' + esc(s.city) + '">' + esc(s.city) + "</option>"; }).join("");
    citySel.addEventListener("change", showDays);
    showDays();

    var sideSel = $("w-side");
    var sides = (L.sides || "Bride side · Groom side").split("·").map(function (s) { return s.trim(); }).filter(Boolean);
    sideSel.innerHTML = sides.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "<option>Friends & others</option>";

    countdown(e.dates.in);
  }

  function sectorFor(city) {
    return (EV.sectors || []).filter(function (s) { return s.city === city; })[0];
  }
  function showDays() {
    var s = sectorFor(val("w-city"));
    if (!s) return;
    $("w-days").innerHTML = "<b>" + esc(s.city) + "</b> · pickup at your door on <b>" + esc(s.pickDay) + "</b>" +
      (EV.direction !== "out" ? ", bags home again after <b>" + esc(s.retDay) + "</b>" : "") + ". We message the exact window the evening before.";
  }

  function countdown(dateIso) {
    var target = new Date(dateIso + "T00:00:00");
    function tick() {
      var d = target - Date.now();
      if (d < 0) d = 0;
      $("cd-d").textContent = Math.floor(d / 86400000);
      $("cd-h").textContent = Math.floor(d / 3600000) % 24;
      $("cd-m").textContent = Math.floor(d / 60000) % 60;
      $("cd-s").textContent = Math.floor(d / 1000) % 60;
    }
    tick();
    setInterval(tick, 1000);
  }

  /* bags stepper */
  var bags = 2;
  $("w-minus").addEventListener("click", function () { bags = Math.max(1, bags - 1); $("w-n").textContent = bags; });
  $("w-plus").addEventListener("click", function () { bags = Math.min(20, bags + 1); $("w-n").textContent = bags; });

  /* reserve */
  var aadShown = false;
  $("w-go").addEventListener("click", function () {
    var msg = $("w-msg");
    msg.textContent = "";
    if (!val("w-fam") || !val("w-lead")) { msg.textContent = "Family name and the lead guest's name are needed."; return; }
    if (!/^\+?[\d\s-]{10,15}$/.test(val("w-mob"))) { msg.textContent = "Enter a valid mobile number."; return; }
    if (!val("w-addr")) { msg.textContent = "Add the pickup address."; return; }
    if (!$("w-proh").checked || !$("w-ind").checked) { msg.textContent = "Please tick both declarations."; return; }
    if (!aadShown) {
      aadShown = true;
      $("w-aadbox").hidden = false;
      $("w-go").textContent = "Confirm and reserve";
      return;
    }
    if (val("w-aad") !== "112233") { msg.textContent = "The Aadhaar code is not right. (demo code: 112233)"; return; }

    var s = sectorFor(val("w-city"));
    var id = DB.id("BD");
    var doc = {
      id: id, created: DB.now(), status: "submitted",
      eventCode: EV.id, eventName: EV.name,
      uc: "wed", ucName: "Wedding · " + ((EV.landing || {}).names || EV.name), mode: "road",
      from: val("w-city"), to: EV.venueCity,
      pickAddr: val("w-addr"), dropAddr: EV.venue || EV.venueCity,
      zo: "", zd: "", date: s ? s.pickDay : EV.dates.in, ref: EV.id,
      slot: "Wedding pickup day",
      bags: bags, oversize: 0, billed: Math.max(bags, (EV.rates || {}).minBags || 2),
      traveller: { name: val("w-lead"), mobile: val("w-mob"), email: "", res: "in" },
      family: { name: val("w-fam"), side: val("w-side") },
      payer: EV.billing === "host" ? { name: "Host account · " + EV.id, contact: (EV.contacts || {}).hostMobile || "" } : null,
      note: val("w-note"),
      quote: { qid: null, total: s ? s.rate * Math.max(bags, (EV.rates || {}).minBags || 2) * (EV.direction === "both" ? 2 : 1) : 0, breakdown: { internal: true } },
      identity: { ok: true, at: DB.now(), method: "DigiLocker (guest link)", score: 0.95 },
      pay: null, admin: {}, events: [{ at: DB.now(), by: "customer", text: "Family booked on the wedding landing page · " + EV.id }]
    };
    DB.put("bookings", id, doc).then(function () {
      $("formview").hidden = true;
      $("doneview").hidden = false;
      $("w-ref").textContent = id;
      $("w-donedays").innerHTML = "<b>" + esc(val("w-fam")) + "</b> · " + bags + " bags from " + esc(val("w-city")) +
        " · pickup " + esc(s ? s.pickDay : EV.dates.in) + (EV.direction !== "out" ? " · home again after " + esc(s ? s.retDay : EV.dates.out) : "") + ".";
    });
  });

  /* track by mobile */
  $("l-trackgo").addEventListener("click", function () {
    var mob = val("l-trackmob").replace(/\s|-/g, "");
    if (!mob) return;
    DB.list("bookings").then(function (list) {
      var mine = list.filter(function (d) {
        return d.eventCode === EV.id && (d.traveller.mobile || "").replace(/\s|-/g, "").indexOf(mob) >= 0;
      });
      if (!mine.length) { $("l-trackBox").innerHTML = '<p class="hint">No booking found with that mobile for this event.</p>'; return; }
      var LABEL = { submitted: "Reserved", accepted: "Confirmed", assigned: "Captain assigned", picked_up: "Picked up", in_transit: "On the way", delivered: "Delivered", revised: "Being confirmed", rejected: "Could not confirm", cancelled: "Cancelled" };
      $("l-trackBox").innerHTML = mine.map(function (d) {
        return '<div class="trk"><div class="top"><div><b>' + esc(d.family ? d.family.name : d.traveller.name) + "</b> · " + d.bags + " bags · " + esc(d.from) +
          ' → ' + esc(d.to) + '</div><span class="state">' + (LABEL[d.status] || d.status) + "</span></div>" +
          '<div class="hint" style="margin-top:6px">' + esc(d.id) + " · pickup " + esc(d.date) + "</div></div>";
      }).join("");
    });
  });
})();
