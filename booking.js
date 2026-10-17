/* Bagdrop customer booking flow */
(function () {
  "use strict";
  var P = window.PRICING, DB = window.DB, CFG = window.BAGDROP_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var val = function (id) { return ($(id).value || "").trim(); };

  document.querySelectorAll("#wa-num").forEach(function (el) { el.textContent = CFG.whatsapp || ""; });

  /* connection pill */
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

  /* ---------------- state ---------------- */
  var s = { uc: "d2a", mode: "air", zo: "GUJ", zd: "MUM", std: 2, odd: 0, pay: "full", total: 0, qid: null, otp: null, unlocked: false, idok: false };
  var B = null, unsubDoc = null;

  /* ---------------- populate selects ---------------- */
  function fillCities(sel, defName) {
    var el = $(sel); el.innerHTML = "";
    P.allCities().forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.name; o.textContent = c.name;
      el.appendChild(o);
    });
    var other = document.createElement("option");
    other.value = "other"; other.textContent = "Others · tell us the city";
    el.appendChild(other);
    if (defName) el.value = defName;
  }
  function fillAirports(sel, def) {
    var el = $(sel); el.innerHTML = "";
    P.AIRPORTS.forEach(function (a) {
      var o = document.createElement("option");
      o.value = a[0]; o.textContent = a[0] + " · " + a[1];
      el.appendChild(o);
    });
    if (def) el.value = def;
  }
  fillCities("cityo", "Ahmedabad");
  fillCities("cityd", "Mumbai");
  /* load the pricing masters (route chart, add-ons, extra cities) from the back end */
  Promise.all([DB.get("settings", "routes"), DB.get("settings", "addons"), DB.get("settings", "cities"), DB.get("settings", "rates")]).then(function (r) {
    P.setMasters({
      routes: r[0] && r[0].routes, addons: r[1] && r[1].addons,
      cities: (r[2] && r[2].cities) || [], rates: r[3] && r[3].rates
    });
    var keepO = val("cityo"), keepD = val("cityd");
    fillCities("cityo", keepO); fillCities("cityd", keepD);
    $("citychips").innerHTML = P.allCities().map(function (c) { return '<span class="chip">' + c.name + "</span>"; }).join("");
    route();
  });
  fillAirports("apo", "BOM");
  fillAirports("apd", "BOM");
  fillCities("iq-city", "Udaipur");
  $("citychips").innerHTML = P.CITIES.map(function (c) { return '<span class="chip">' + c.name + "</span>"; }).join("");
  $("iq-cities").innerHTML = P.CITIES.map(function (c) {
    return '<label class="chip" style="cursor:pointer"><input type="checkbox" value="' + c.name + '" style="vertical-align:-2px"> ' + c.name + "</label>";
  }).join("");

  /* travel date default: 4 days out, min today */
  (function () {
    var d = new Date(); d.setDate(d.getDate() + 4);
    var iso = d.toISOString().slice(0, 10);
    $("tdate").value = iso;
    $("tdate").min = new Date().toISOString().slice(0, 10);
  })();

  /* ---------------- step navigation ---------------- */
  var cur = 1;
  function goto(n) {
    if (n === 6 && s.uc === "wed") { location.hash = "inquiry"; return; }
    cur = n;
    document.querySelectorAll(".step").forEach(function (x) { x.classList.toggle("on", +x.dataset.s === n); });
    document.querySelectorAll("#prog i").forEach(function (i, k) { i.classList.toggle("on", k < n); });
    if (n === 6) prepPrice();
    if (n === 8) {
      var payOpts = document.querySelector('.step[data-s="8"] .opts');
      if (payOpts) payOpts.style.display = s.ror ? "none" : "";
      $("paybtn").textContent = s.ror ? "Submit booking request — no payment now" : "Pay securely";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () {
      var n = +b.dataset.go;
      if (n > cur && !validate(cur)) return;
      goto(n);
    });
  });
  function validate(step) {
    if (step === 2) {
      var needPickCity = !$("pickwrap").hidden, needDropCity = !$("dropwrap").hidden;
      if (needPickCity && val("cityo") === "other") { say("Tell us the city in the address field and we confirm within the hour."); }
      if (needPickCity && !val("pick")) { say("Add the pickup address."); return false; }
      if (needDropCity && !val("drop")) { say("Add the delivery address."); return false; }
    }
    if (step === 3 && !s.slot) { say("Pick a pickup window."); return false; }
    if (step === 5) {
      if (!val("nm")) { say("The traveller's name is needed — it is matched against the ID."); return false; }
      if (!/^\+?[\d\s-]{10,15}$/.test(val("mob"))) { say("Enter a valid mobile number."); return false; }
    }
    if (step === 6 && !s.unlocked) { say("Unlock the price with the code first."); return false; }
    if (step === 7 && !s.idok) { say("Verify the traveller first."); return false; }
    return true;
  }

  /* ---------------- step 1: use case ---------------- */
  document.querySelectorAll("#uc .opt").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("#uc .opt").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      s.uc = b.dataset.v; s.mode = b.dataset.mode;
      $("s-uc").textContent = P.UCNAME[s.uc];
      applyUc();
    });
  });
  function applyUc() {
    var pickIsAirport = s.uc === "a2d";
    var dropIsAirport = s.uc === "d2a" || s.uc === "h2a";
    $("pickwrap").hidden = pickIsAirport;
    $("pickair").hidden = !pickIsAirport;
    $("dropwrap").hidden = dropIsAirport;
    $("dropair").hidden = !dropIsAirport;
    $("whenlede").textContent =
      s.mode === "air" ? "Your flight sets the cut off. We work backwards from it." :
      s.mode === "rail" ? "Your train sets the cut off. We work backwards from it." :
      s.mode === "sea" ? "Your sailing sets the cut off. We work backwards from it." :
      "Pick the day; we pick up in the window you choose.";
    $("reflab").firstChild.textContent =
      s.mode === "air" ? "Flight number" : s.mode === "rail" ? "Train number" : s.mode === "sea" ? "Sailing / cruise line" : "Reference (optional)";
    $("trk5").innerHTML =
      s.mode === "air" ? "At airport<small>receipt</small>" : s.mode === "rail" ? "At station<small>receipt</small>" : s.mode === "sea" ? "At terminal<small>receipt</small>" : "Out for delivery<small>OTP</small>";
    route();
  }

  /* ---------------- step 2: route ---------------- */
  function cityOfAp(code) {
    var list = P.allCities();
    for (var i = 0; i < list.length; i++) if (list[i].ap === code) return list[i];
    return { name: "Mumbai", zone: "MUM" };
  }
  function zoneOf() {
    var pickIsAirport = !$("pickair").hidden, dropIsAirport = !$("dropair").hidden;
    var from, to;
    if (pickIsAirport) {
      var ap = P.AIRPORTS.filter(function (a) { return a[0] === val("apo"); })[0];
      var fc = cityOfAp(val("apo"));
      from = { name: ap[1], zone: fc.zone, qcity: fc.name };
    } else if (val("cityo") === "other") {
      var tn = val("cityo-name") || "Other city";
      from = { name: tn, zone: "", qcity: tn, other: true };
    } else {
      var c = P.cityByName(val("cityo"));
      from = c ? { name: c.name, zone: c.zone, qcity: c.name } : { name: val("cityo"), zone: "GUJ", qcity: val("cityo") };
    }
    if (dropIsAirport) {
      var ap2 = P.AIRPORTS.filter(function (a) { return a[0] === val("apd"); })[0];
      var tc = cityOfAp(val("apd"));
      to = { name: ap2[1], zone: tc.zone, qcity: tc.name };
    } else if (val("cityd") === "other") {
      var tn2 = val("cityd-name") || "Other city";
      to = { name: tn2, zone: "", qcity: tn2, other: true };
    } else {
      var c2 = P.cityByName(val("cityd"));
      to = c2 ? { name: c2.name, zone: c2.zone, qcity: c2.name } : { name: val("cityd"), zone: "MUM", qcity: val("cityd") };
    }
    return { from: from, to: to };
  }
  function route() {
    var r = zoneOf();
    s.zo = r.from.zone; s.zd = r.to.zone;
    s.fromName = r.from.name; s.toName = r.to.name;
    s.qFrom = r.from.qcity; s.qTo = r.to.qcity;
    s.otherRoute = !!(r.from.other || r.to.other);
    $("cityo-name").hidden = val("cityo") !== "other";
    $("cityd-name").hidden = val("cityd") !== "other";
    $("otherhint").hidden = !s.otherRoute;
    if (s.otherRoute) {
      $("routetxt").textContent = r.from.name + " → " + r.to.name + " · not on our rate chart yet — book now, the team confirms the rate and the plan with you.";
      $("s-route").textContent = r.from.name.slice(0, 10) + " → " + r.to.name.slice(0, 10);
    } else {
      $("routetxt").textContent = r.from.name + " → " + r.to.name + " · " +
        (s.zo === s.zd ? "same-region run, delivered same or next day" :
          "line haul " + s.zo + " → " + s.zd + ", handed to the terminal team on arrival");
      $("s-route").textContent = s.zo + " → " + s.zd;
    }
    calc();
  }
  ["cityo", "cityd", "apo", "apd", "cityo-name", "cityd-name"].forEach(function (id) { $(id).addEventListener("change", route); });

  /* ---------------- step 3: date + slots ---------------- */
  var SLOTS = [["06:00–08:00", "quiet roads"], ["08:00–10:00", "most chosen"], ["10:00–12:00", ""], ["12:00–14:00", ""], ["16:00–18:00", ""], ["18:00–20:00", "evening"]];
  function renderSlots() {
    $("slots").innerHTML = SLOTS.map(function (sl, i) {
      return '<button class="slot" aria-pressed="' + (s.slot === sl[0] ? "true" : "false") + '" data-slot="' + sl[0] + '"><b>' + sl[0] + "</b><small>" + sl[1] + "</small></button>";
    }).join("");
    document.querySelectorAll(".slot").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".slot").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        s.slot = b.dataset.slot;
        $("s-slot").textContent = s.slot;
      });
    });
  }
  renderSlots();
  $("tdate").addEventListener("change", function () {
    $("s-when").textContent = val("tdate");
    calc();
  });
  $("ref").addEventListener("change", function () {
    var v = val("ref").toUpperCase().replace(/\s+/g, "");
    var m = v.match(/^([A-Z0-9]{2})(\d{1,4})$/);
    if (s.mode === "air" && m) {
      $("refai").innerHTML = "<b>Flight check</b> · " + m[1] + " " + m[2] +
        " on " + val("tdate") + " — schedule confirmed. Bags must be at the counter 4 h before departure; your pickup windows below are set from that cut off.";
      $("s-when").textContent = val("tdate") + " · " + m[1] + " " + m[2];
    } else if (v) {
      $("refai").innerHTML = "<b>Reference noted</b> · " + val("ref");
      $("s-when").textContent = val("tdate");
    }
  });

  /* ---------------- step 4: pieces ---------------- */
  document.querySelectorAll(".stepper button").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.b, d = +b.dataset.d;
      if (k === "std") s.std = Math.max(0, s.std + d);
      if (k === "odd") s.odd = Math.max(0, s.odd + d);
      if (s.std + s.odd < 1) s.std = 1;
      $("n-std").textContent = s.std;
      $("n-odd").textContent = s.odd;
      $("s-pcs").textContent = s.std + " bags" + (s.odd ? " + " + s.odd + " oversize" : "");
      calc();
    });
  });

  /* ---------------- step 5: traveller ---------------- */
  $("payer").addEventListener("change", function () { $("payerwrap").hidden = !$("payer").checked; });
  $("nm").addEventListener("change", function () { $("s-who").textContent = val("nm") || "—"; });

  /* ---------------- pricing ---------------- */
  function calc() {
    var q = s.otherRoute ? { error: "ror" } :
      P.quoteCity({ fromName: s.qFrom || val("cityo"), toName: s.qTo || val("cityd"), bags: s.std, oversize: s.odd, mode: s.mode, date: val("tdate") });
    if (q.error) {
      /* rate on request: route not on the chart — bookable, no price shown */
      s.ror = true; s.q = { ror: true }; s.total = 0;
      $("p-total").textContent = "On request";
      $("p-per").textContent = "Our team calls with the rate for this route";
      $("p-basek").textContent = "Route not on the rate chart yet";
      ["p-base", "p-odd", "p-slab", "p-peak", "p-gst"].forEach(function (id) { $(id).textContent = "—"; });
      $("payfull").textContent = "No payment now";
      $("payhold").textContent = "No payment now";
      return;
    }
    s.ror = false;
    s.q = q; s.total = q.total;
    $("p-total").textContent = DB.inr(q.total);
    $("p-per").textContent = DB.inr(q.perBag) + " per piece · " + q.billed + " billed" + (q.source === "route" ? " · rate chart" : "");
    $("p-basek").textContent = q.rule;
    $("p-base").textContent = DB.inr(q.base);
    $("p-odd").textContent = s.odd ? DB.inr(q.oversize) : "—";
    $("p-slab").textContent = q.slab ? "−" + DB.inr(q.slab) : "—";
    $("p-peak").textContent = q.peak ? "+" + DB.inr(q.peak) : "—";
    $("p-gst").textContent = DB.inr(q.gst);
    $("payfull").textContent = DB.inr(q.total) + " now";
    $("payhold").textContent = DB.inr(Math.round(q.total * 0.2)) + " now, rest at pickup";
    /* price changed after unlock → relock (never for rate-on-request routes) */
    if (s.unlocked && !s.ror) { s.unlocked = false; lockUI(); say("Details changed — the price recalculated. Unlock it again."); }
  }
  function lockUI() {
    $("pbody").classList.toggle("locked", !s.unlocked);
    $("phead").textContent = s.unlocked ? "Locked for 24 hours" : "Price after one OTP";
    $("toid").disabled = !s.unlocked;
    $("pricenote").hidden = !s.unlocked;
  }
  function prepPrice() {
    calc();
    var otpRow = $("sendotp").parentElement;
    if (s.ror) {
      /* rate on request: nothing to lock — the booking goes through without payment */
      otpRow.hidden = true;
      s.unlocked = true;
      s.qid = "ROR-" + String(Math.floor(Math.random() * 9000) + 1000);
      $("pbody").classList.remove("locked");
      $("phead").textContent = "Rate on request";
      $("otpmsg").innerHTML = "<b>No price to unlock</b> — this route is not on our rate chart yet. Continue the booking: no payment is taken, and our team gets in touch with the rate before anything moves.";
      $("toid").disabled = false;
      $("pricenote").hidden = true;
      return;
    }
    otpRow.hidden = false;
    $("otpmsg").textContent = "";
    lockUI();
  }

  /* ---------------- step 6: OTP ---------------- */
  $("sendotp").addEventListener("click", function () {
    if (!/^\+?[\d\s-]{10,15}$/.test(val("mob"))) { say("Go back one step and add the traveller's mobile first."); return; }
    s.otp = String(Math.floor(Math.random() * 900000) + 100000);
    /* In production the SMS gateway sends this. Demo shows it here. */
    $("otpmsg").innerHTML = "Code sent to " + val("mob") + ". <span class='mono'>(demo code: " + s.otp + ")</span>";
  });
  $("otp").addEventListener("input", function () { $("verify").disabled = $("otp").value !== s.otp; });
  $("verify").addEventListener("click", function () {
    s.unlocked = true;
    s.qid = "QT-" + String(Math.floor(Math.random() * 9000) + 1000);
    var until = new Date(Date.now() + 24 * 3600 * 1000);
    $("lockuntil").textContent = until.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    $("qid").textContent = s.qid;
    lockUI();
    if (!B) B = { id: DB.id("BD"), created: DB.now() };
    push("quoted", "Price unlocked after OTP · " + s.qid);
  });

  /* ---------------- step 7: identity ---------------- */
  var AAD_DEMO = "112233";
  function nameScore(a, b) {
    a = (a || "").toLowerCase().trim(); b = (b || "").toLowerCase().trim();
    if (!a || !b) return 0;
    if (a === b) return 0.97;
    var aw = a.split(/\s+/), bw = b.split(/\s+/);
    var hit = aw.filter(function (w) { return bw.indexOf(w) >= 0; }).length;
    var r = hit / Math.max(aw.length, bw.length);
    return r >= 0.99 ? 0.95 : r >= 0.5 ? 0.78 : r > 0 ? 0.6 : 0.2;
  }
  function idResult(verifiedName, method) {
    var nm = val("nm"), sc = nameScore(verifiedName, nm), el = $("idres");
    if (sc >= 0.85) {
      s.idok = true; $("topay").disabled = false;
      el.innerHTML = '<div class="okbox"><b>Verified</b> · ' + method + " · name matched " + sc.toFixed(2) + ". Only the verified name and a reference are stored.</div>";
      B.identity = { ok: true, at: DB.now(), method: method, score: sc };
      push("identified", "Identity verified · " + method);
    } else if (sc >= 0.7) {
      el.innerHTML = '<div class="warnbox"><b>Almost</b> · verified "' + verifiedName + '" vs booking "' + nm + '". Confirm this is you: <button class="btn sm" id="confirmnm">Yes, same person</button></div>';
      $("confirmnm").addEventListener("click", function () {
        s.idok = true; $("topay").disabled = false;
        el.innerHTML = '<div class="okbox"><b>Verified</b> · confirmed by you. Logged for review.</div>';
        B.identity = { ok: true, at: DB.now(), method: method + " · customer confirmed " + sc.toFixed(2), score: sc };
        push("identified", "Identity verified after customer confirmation · " + sc.toFixed(2));
      });
    } else {
      el.innerHTML = '<div class="badbox"><b>Does not match</b> · verified "' + verifiedName + '" vs booking "' + nm + "\". Go back and correct the traveller's name, or verify the person who is actually travelling.</div>";
    }
  }
  $("res").addEventListener("change", function () {
    var intl = val("res") === "intl";
    $("idin").hidden = intl; $("idintl").hidden = !intl;
  });
  $("idlocker").addEventListener("click", function () {
    $("aadrow").hidden = false;
    $("idres").innerHTML = '<div class="ai"><b>DigiLocker</b> · UIDAI has sent an OTP to the mobile linked with your Aadhaar <span class="mono">(demo: ' + AAD_DEMO + ")</span>. Bagdrop never sees your Aadhaar number.</div>";
  });
  $("aadcode").addEventListener("input", function () { $("aadverify").disabled = $("aadcode").value !== AAD_DEMO; });
  $("aadverify").addEventListener("click", function () {
    $("aadrow").hidden = true;
    idResult(val("nm") || "Traveller", "DigiLocker");
  });
  $("idapp").addEventListener("click", function () {
    $("idres").innerHTML = '<div class="ai"><b>Aadhaar app</b> · a QR appears here; scan it in the Aadhaar app and share your name only. (demo: verified in 2 s)</div>';
    setTimeout(function () { idResult(val("nm") || "Traveller", "Aadhaar app"); }, 1500);
  });
  $("idpass").addEventListener("click", function () {
    $("idres").innerHTML = '<div class="ai"><b>Passport</b> · camera opens for the data page, then a short selfie. (demo: matched in 2 s)</div>';
    setTimeout(function () { idResult(val("nm") || "Traveller", "Passport · face match 0.94"); }, 1500);
  });

  /* ---------------- step 8: pay ---------------- */
  document.querySelectorAll("[data-pay]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll("[data-pay]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      s.pay = b.dataset.pay;
    });
  });
  $("paybtn").addEventListener("click", function () {
    if (!B && s.ror) B = { id: DB.id("BD"), created: DB.now() };
    if (!B) return;
    if (s.ror) {
      /* rate on request: submit without payment */
      B.pay = null;
      say("Booking request sent — the team calls with the rate for your route.");
      push("submitted", "Booking request · route not on the rate chart — RATE ON REQUEST").then(function () {
        $("payview").hidden = true;
        $("doneview").hidden = false;
        $("bref").textContent = B.id;
        $("livestatus").innerHTML = "<b>Status</b> · Request received. Our team gets in touch with the rate for " + (s.fromName || "") + " → " + (s.toName || "") + " and confirms the pickup plan.";
        renderNextInfo();
        watchMine(B.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      return;
    }
    var intl = $("payer").checked && /^\+(?!91)/.test(val("pct"));
    say((intl ? "Stripe" : "Razorpay") + " checkout opens here. Demo: payment succeeded.");
    B.pay = { mode: s.pay, amount: Math.round(s.pay === "full" ? s.total : s.total * 0.2), status: "captured", gateway: intl ? "Stripe" : "Razorpay", at: DB.now() };
    push("submitted", "Payment captured · booking submitted for confirmation").then(function () {
      setTimeout(function () {
        $("payview").hidden = true;
        $("doneview").hidden = false;
        $("bref").textContent = B.id;
        renderNextInfo();
        watchMine(B.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 700);
    });
  });
  function renderNextInfo() {
    var ref = B.id, slot = s.slot || "your window";
    var last =
      s.mode === "air" ? ["Airport", "Bags are at the Bagdrop counter 4 h before departure. Show " + ref + " and your ID. Receipt on WhatsApp."] :
      s.mode === "rail" ? ["Station", "Bags reach the parcel office 90 min before departure. Show " + ref + "."] :
      s.mode === "sea" ? ["Terminal", "Bags reach the terminal baggage hall 3 h before sailing, tagged with your cabin."] :
      ["Delivery", "Delivered to the receiver against the OTP we send you. Share it only with them."];
    $("nextinfo").innerHTML = [
      ["Tonight", "Your captain is assigned. You get their name, photo and vehicle number on WhatsApp."],
      ["Pickup", slot + " · have the bags closed but unlocked for the seal check. Keep valuables, documents and medicines with you."],
      ["At pickup", "Captain weighs, photographs and seals each piece. You e-sign the indemnity on their phone. Photos and seal numbers reach you before they drive off."],
      last,
      ["Changes", "Flight delay or cancellation: we re-plan and tell you. Reschedule free up to 6 h before pickup. Help on WhatsApp 06:00 to 23:00."]
    ].map(function (r) { return '<li><span class="m">' + r[0] + "</span><span>" + r[1] + "</span></li>"; }).join("");
  }
  $("rebook").addEventListener("click", function () { say("Return leg prefilled with your details, 10% off. Pick the date."); });
  $("share").addEventListener("click", function () { say("WhatsApp opens with your booking card and tracking link."); });

  /* ---------------- persistence ---------------- */
  function snapshot(status) {
    var pickIsAirport = !$("pickair").hidden, dropIsAirport = !$("dropair").hidden;
    var actual = s.std + s.odd, billed = Math.max(actual, CFG.minPieces || 2);
    return {
      id: B.id, created: B.created, status: status,
      uc: s.uc, ucName: P.UCNAME[s.uc], mode: s.mode,
      from: s.fromName || val("cityo"), to: s.toName || val("cityd"),
      pickAddr: pickIsAirport ? val("apo") : val("pick"),
      dropAddr: dropIsAirport ? val("apd") : val("drop"),
      zo: s.zo, zd: s.zd, date: val("tdate"), ref: val("ref"), slot: s.slot || "",
      bags: s.std, oversize: s.odd, billed: billed,
      traveller: { name: val("nm"), mobile: val("mob"), email: val("em"), res: val("res") },
      payer: $("payer").checked ? { name: val("pnm"), contact: val("pct") } : null,
      note: val("note"),
      quote: { qid: s.qid, total: Math.round(s.total), breakdown: s.q || {} },
      identity: B.identity || null, pay: B.pay || null,
      admin: B.admin || {}, events: B.events || []
    };
  }
  function push(status, evt) {
    if (!B) return Promise.resolve();
    B.events = (B.events || []).concat([{ at: DB.now(), by: "customer", text: evt }]);
    var d = snapshot(status);
    B.doc = d;
    return DB.put("bookings", B.id, d);
  }

  /* ---------------- live status ---------------- */
  function statusText(d) {
    var a = d.admin || {};
    if (d.status === "rejected") return '<b style="color:var(--bad)">Not confirmed</b> · ' + (a.reason || "Bagdrop could not serve this booking") + ". Payment is being refunded in full.";
    if (d.status === "revised") return '<b style="color:var(--warn)">Revised price</b> · Bagdrop proposes <b class="mono">' + DB.inr(a.revisedTotal) + "</b> instead of " + DB.inr(d.quote.total) + ". Reason: " + (a.reason || "") +
      ' <div style="margin-top:8px;display:flex;gap:8px"><button class="btn primary sm" id="acc-rev">Accept new price</button><button class="btn sm" id="dec-rev">Cancel booking</button></div>';
    if (d.status === "accepted") return '<b style="color:var(--ok)">Confirmed</b> · captain ' + (a.captain || "to be assigned") + " · pickup " + d.slot + " on " + d.date + ". LR issued.";
    if (d.status === "assigned") return '<b style="color:var(--ok)">Captain on the way</b> · ' + (a.captain || "") + " · you will get a call 30 minutes before.";
    if (d.status === "picked_up") return '<b style="color:var(--ok)">Picked up</b> · sealed and photographed. Bags are with Bagdrop.';
    if (d.status === "in_transit") return '<b style="color:var(--ok)">In transit</b> · on the line haul to ' + d.to + ".";
    if (d.status === "delivered") return '<b style="color:var(--ok)">Delivered</b> · thank you. Invoice sent. Rate your captain?';
    if (d.status === "cancelled") return "<b>Cancelled</b> · at your request. Refund in 5 to 7 days.";
    return "<b>Sent to Bagdrop operations</b> · awaiting confirmation. You will hear within the hour.";
  }
  function renderMine(d) {
    if (!d) return;
    $("livestatus").innerHTML = "<b>Status</b> · " + statusText(d);
    var stages = ["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered"];
    var i = stages.indexOf(d.status);
    if (d.status === "revised") i = 0;
    document.querySelectorAll("#trackrow div").forEach(function (x, k) { x.classList.toggle("on", k <= i); });
    var ar = $("acc-rev"), dr = $("dec-rev");
    if (ar) ar.addEventListener("click", function () {
      var c = JSON.parse(JSON.stringify(d));
      c.status = "accepted"; c.quote.total = c.admin.revisedTotal;
      c.events = (c.events || []).concat([{ at: DB.now(), by: "customer", text: "Accepted revised price " + DB.inr(c.admin.revisedTotal) }]);
      DB.put("bookings", d.id, c).then(function () { say("New price accepted. Booking confirmed."); });
    });
    if (dr) dr.addEventListener("click", function () {
      var c = JSON.parse(JSON.stringify(d));
      c.status = "cancelled";
      c.events = (c.events || []).concat([{ at: DB.now(), by: "customer", text: "Declined revised price, cancelled" }]);
      DB.put("bookings", d.id, c);
    });
  }
  function watchMine(id) {
    if (unsubDoc) unsubDoc();
    unsubDoc = DB.watchDoc("bookings", id, renderMine);
  }

  /* ---------------- track entry ---------------- */
  $("trackgo").addEventListener("click", function () {
    var id = val("trackref").toUpperCase();
    DB.get("bookings", id).then(function (d) {
      if (!d) { $("trackmsg").textContent = "No booking with that reference."; return; }
      $("trackmsg").textContent = "";
      goto(8);
      $("payview").hidden = true;
      $("doneview").hidden = false;
      $("bref").textContent = d.id;
      $("nextinfo").innerHTML =
        '<li><span class="m">Route</span><span>' + d.from + " → " + d.to + " · " + d.date + " · " + d.slot + "</span></li>" +
        '<li><span class="m">Pieces</span><span>' + d.bags + " bags" + (d.oversize ? " + " + d.oversize + " oversize" : "") + " · " + DB.inr(d.quote.total) + "</span></li>";
      document.querySelectorAll("#prog i").forEach(function (i) { i.classList.add("on"); });
      watchMine(d.id);
    });
  });

  /* ---------------- inquiry ---------------- */
  $("iq-send").addEventListener("click", function () {
    if (!val("iq-name") || !/^\+?[\d\s-]{10,15}$/.test(val("iq-mob"))) { $("iq-msg").textContent = "Your name and a valid mobile are needed."; return; }
    var cities = [];
    document.querySelectorAll("#iq-cities input:checked").forEach(function (c) { cities.push(c.value); });
    var id = DB.id("INQ");
    var doc = {
      id: id, created: DB.now(), status: "new",
      contact: { name: val("iq-name"), role: val("iq-role"), mobile: val("iq-mob"), email: val("iq-em") },
      venueCity: val("iq-city"), venue: val("iq-venue"),
      dates: { from: val("iq-in"), to: val("iq-out") },
      pickupCities: cities,
      families: +val("iq-fam") || null, bags: +val("iq-bags") || null,
      note: val("iq-note")
    };
    DB.put("inquiries", id, doc).then(function () {
      $("inq-form").hidden = true;
      $("inq-done").hidden = false;
      $("iq-ref").textContent = id;
    });
  });

  /* ---------------- hash routing ---------------- */
  function applyHash() {
    var h = location.hash;
    $("inqwrap").hidden = h !== "#inquiry";
    $("bookwrap").style.display = h === "#inquiry" ? "none" : "";
    $("trackbox").hidden = h !== "#track";
    if (h === "#track") window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", applyHash);
  applyHash();

  /* ---------------- team quote link (?quote=BD-…) ---------------- */
  (function () {
    var qid = new URLSearchParams(location.search).get("quote");
    if (!qid) return;
    DB.get("bookings", qid.toUpperCase()).then(function (d) {
      if (!d) { say("That quote link is not valid any more."); return; }
      var wrap = $("bookwrap").firstElementChild;
      var card = document.createElement("section");
      card.className = "card";
      card.style.marginBottom = "14px";
      var vu = d.quote.validUntil ? new Date(d.quote.validUntil) : null;
      var expired = vu && vu < new Date();
      var pays = (window.BAGDROP_CONFIG || {}).payments || {};
      var brk = d.quote.breakdown || {};
      if (d.pay) {
        card.innerHTML = '<h1 style="font-size:20px">This quote is already paid</h1><p class="lede">Booking ' + d.id + ' is confirmed. Track it any time with the reference.</p>';
      } else if (expired) {
        card.innerHTML = '<h1 style="font-size:20px">This price lock has expired</h1><p class="lede">Quote ' + (d.quote.qid || d.id) + ' was locked until ' + DB.fmt(d.quote.validUntil) + '. Message us on WhatsApp ' + ((window.BAGDROP_CONFIG || {}).whatsapp || "") + ' and the team re-issues it in a minute.</p>';
      } else {
        card.innerHTML =
          '<h1 style="font-size:20px">Your Bagdrop quote</h1>' +
          '<p class="lede">Prepared for ' + (d.traveller.name || "you") + ' · quote <b class="mono">' + (d.quote.qid || d.id) + "</b>" + (vu ? " · price locked until <b>" + DB.fmt(d.quote.validUntil) + "</b>" : "") + "</p>" +
          '<ul class="info">' +
          '<li><span class="m">Service</span><span>' + d.ucName + "</span></li>" +
          '<li><span class="m">Route</span><span>' + d.from + " → " + d.to + " · " + d.date + "</span></li>" +
          (d.ref ? '<li><span class="m">' + (d.mode === "rail" ? "Train" : d.mode === "sea" ? "Sailing" : "Flight") + "</span><span>" + d.ref +
            (d.pnr ? " · PNR " + d.pnr : "") + (d.flightTime ? " · " + (d.uc === "a2d" ? "lands " : "departs ") + d.flightTime : "") + "</span></li>" : "") +
          (d.pickupDate ? '<li><span class="m">Pickup</span><span>' + d.pickupDate + (d.slot ? " · " + d.slot : "") + "</span></li>" : "") +
          (d.deliveryDate ? '<li><span class="m">Delivered by</span><span>' + d.deliveryDate + "</span></li>" : "") +
          '<li><span class="m">Pieces</span><span>' + d.bags + " bag(s)" + (d.oversize ? " + " + d.oversize + " oversize" : "") + " · billed " + d.billed + "</span></li>" +
          (brk.gst ? '<li><span class="m">Includes</span><span>GST ' + DB.inr(brk.gst) + (brk.discount ? " · discount −" + DB.inr(brk.discount) : "") + "</span></li>" : "") +
          '<li><span class="m">Total</span><span style="font-family:var(--display);font-weight:800;font-size:20px">' + DB.inr(d.quote.total) + "</span></li>" +
          (d.note ? '<li><span class="m">Note</span><span>' + d.note + "</span></li>" : "") +
          "</ul>" +
          '<div class="btns"><button class="btn" id="qp-hold">Hold with 20% · ' + DB.inr(Math.round(d.quote.total * 0.2)) + '</button><button class="btn primary" id="qp-pay">Pay ' + DB.inr(d.quote.total) + " and confirm</button></div>" +
          '<div class="hint" style="margin-top:8px">UPI, cards and net banking' + (pays.upi ? " · or pay by UPI to <b>" + pays.upi + "</b> with reference " + d.id : "") + ". Bags are sealed with you at pickup and released only against OTP.</div>";
      }
      wrap.insertBefore(card, wrap.firstChild);
      document.querySelectorAll(".step").forEach(function (x) { x.classList.remove("on"); });
      function payQuote(mode) {
        var c = JSON.parse(JSON.stringify(d));
        c.pay = { mode: mode, amount: Math.round(mode === "full" ? d.quote.total : d.quote.total * 0.2), status: "captured", gateway: "Razorpay", at: DB.now() };
        c.status = "submitted";
        c.events = (c.events || []).concat([{ at: DB.now(), by: "customer", text: "Quote " + (d.quote.qid || d.id) + " paid via the shared link (" + mode + ")" }]);
        DB.put("bookings", c.id, c).then(function () {
          say("Razorpay checkout opens here. Demo: payment succeeded.");
          card.remove();
          goto(8);
          $("payview").hidden = true;
          $("doneview").hidden = false;
          $("bref").textContent = c.id;
          document.querySelectorAll("#prog i").forEach(function (i) { i.classList.add("on"); });
          B = { id: c.id, created: c.created };
          s.mode = c.mode; s.slot = c.slot;
          renderNextInfo();
          watchMine(c.id);
        });
      }
      var pb = card.querySelector("#qp-pay"), hb = card.querySelector("#qp-hold");
      if (pb) pb.addEventListener("click", function () { payQuote("full"); });
      if (hb) hb.addEventListener("click", function () { payQuote("hold"); });
    });
  })();

  /* initial paint */
  applyUc();
  $("s-when").textContent = val("tdate");
})();
