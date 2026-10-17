/* Bagdrop pricing engine — the single source of truth for every quote.
   Two layers, in order:
   1. ROUTE RATE CHART (the master, from the official Bagdrop rate chart):
      per city pair — 1 bag, 2 bags total, each additional bag, and a bulk
      rate that applies to EVERY bag once the booking meets the bulk minimum.
      GST extra. New routes and new cities are added in the admin panel.
   2. FALLBACK REGIONAL MATRIX: zone-to-zone per-piece rates used only when
      no route rate exists for the pair, so every permutation still quotes.
   Add-on rates (oversize, terminal handling) sit on top of either layer.
   In production this logic also runs inside a Supabase Edge Function. */
(function () {
  "use strict";
  var CFG = window.BAGDROP_CONFIG || {};

  var ZONES = ["MUM", "GUJ", "NOR", "SOU", "GOA", "EAS"];

  /* fallback per-bag rate, from-zone -> [to-zone by ZONES order] */
  var DEFAULT_RATES = {
    MUM: [2500, 2500, 4500, 3900, 3675, 6500],
    GUJ: [2500, 2500, 4900, 4500, 5250, 6500],
    NOR: [4500, 4900, 2500, 5500, 5250, 6000],
    SOU: [3900, 4500, 5500, 2750, 4200, 6500],
    GOA: [3675, 5250, 5250, 4200, 2500, 7000],
    EAS: [6500, 6500, 6000, 6500, 7000, 2750]
  };

  var CITIES = [
    { name: "Mumbai", zone: "MUM", ap: "BOM" },
    { name: "Navi Mumbai / Thane", zone: "MUM", ap: "BOM" },
    { name: "Pune", zone: "MUM", ap: "PNQ" },
    { name: "Ahmedabad", zone: "GUJ", ap: "AMD" },
    { name: "Vadodara", zone: "GUJ", ap: "BDQ" },
    { name: "Nadiad", zone: "GUJ", ap: "BDQ" },
    { name: "Anand", zone: "GUJ", ap: "BDQ" },
    { name: "Surat", zone: "GUJ", ap: "STV" },
    { name: "Rajkot", zone: "GUJ", ap: "RAJ" },
    { name: "Delhi NCR", zone: "NOR", ap: "DEL" },
    { name: "Jaipur", zone: "NOR", ap: "JAI" },
    { name: "Udaipur", zone: "NOR", ap: "UDR" },
    { name: "Chandigarh", zone: "NOR", ap: "IXC" },
    { name: "Bengaluru", zone: "SOU", ap: "BLR" },
    { name: "Hyderabad", zone: "SOU", ap: "HYD" },
    { name: "Chennai", zone: "SOU", ap: "MAA" },
    { name: "Kochi", zone: "SOU", ap: "COK" },
    { name: "Goa", zone: "GOA", ap: "GOI" },
    { name: "North Goa", zone: "GOA", ap: "GOX" },
    { name: "Kolkata", zone: "EAS", ap: "CCU" }
  ];

  var AIRPORTS = [
    ["BOM", "Mumbai T1/T2"], ["AMD", "Ahmedabad"], ["BDQ", "Vadodara"], ["STV", "Surat"],
    ["DEL", "Delhi T1/T2/T3"], ["JAI", "Jaipur"], ["UDR", "Udaipur"], ["BLR", "Bengaluru"],
    ["HYD", "Hyderabad"], ["MAA", "Chennai"], ["COK", "Kochi"], ["GOI", "Goa Dabolim"],
    ["GOX", "Goa Mopa"], ["CCU", "Kolkata"], ["PNQ", "Pune"], ["RAJ", "Rajkot"], ["IXC", "Chandigarh"]
  ];

  /* THE MASTER — Bagdrop rate chart, effective 16-Oct-2026 (₹ per booking, GST extra) */
  var DEFAULT_ROUTES = [
    { from: "Vadodara", to: "Mumbai", dir: "both", note: "", r1: 3950, r2: 5000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
    { from: "Ahmedabad", to: "Mumbai", dir: "both", note: "", r1: 4500, r2: 6000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
    { from: "Nadiad", to: "Mumbai", dir: "both", note: "Ahmedabad rates", r1: 4500, r2: 6000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
    { from: "Anand", to: "Mumbai", dir: "both", note: "Ahmedabad rates", r1: 4500, r2: 6000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
    { from: "Vadodara", to: "Delhi NCR", dir: "both", note: "Delhi Airport", r1: 6500, r2: 10500, addl: 4000, bulkMin: 4, bulkRate: 4000 },
    { from: "Ahmedabad", to: "Delhi NCR", dir: "both", note: "", r1: 7000, r2: 11000, addl: 4000, bulkMin: 4, bulkRate: 4000 },
    { from: "Mumbai", to: "North Goa", dir: "one", note: "Non-airport", r1: 3900, r2: 5900, addl: 2000, bulkMin: 6, bulkRate: 1000 },
    { from: "Mumbai", to: "Goa", dir: "one", note: "Goa Airport", r1: 4500, r2: 7000, addl: 2500, bulkMin: null, bulkRate: null }
  ];

  /* ADD-ON RATES — only what the rate chart defines. No handling charges:
     the quote carries the route rate (or matrix rate) + oversize + GST, nothing else. */
  var DEFAULT_ADDONS = {
    oversize: 900           /* per oversize piece (over 32 kg / non-standard) */
  };

  /* mutable masters — admin saves these to the back end and calls setMasters */
  var ROUTES = JSON.parse(JSON.stringify(DEFAULT_ROUTES));
  var ADDONS = JSON.parse(JSON.stringify(DEFAULT_ADDONS));
  var EXTRA_CITIES = [];
  var RATES = DEFAULT_RATES;

  function setMasters(m) {
    if (m.routes) ROUTES = m.routes;
    if (m.addons) ADDONS = m.addons;
    if (m.cities) EXTRA_CITIES = m.cities;
    if (m.rates) RATES = m.rates;
  }
  function allCities() {
    return CITIES.concat(EXTRA_CITIES);
  }
  function cityByName(n) {
    var list = allCities();
    for (var i = 0; i < list.length; i++) if (list[i].name === n) return list[i];
    return null;
  }

  function norm(s) { return (s || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim(); }
  function routeFor(fromName, toName) {
    var f = norm(fromName), t = norm(toName);
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i];
      var a = norm(r.from), b = norm(r.to);
      if (a === f && b === t) return { route: r, reversed: false };
      if (r.dir === "both" && a === t && b === f) return { route: r, reversed: true };
    }
    return null;
  }

  /* chart rules: 1 bag → r1 · 2 bags → r2 · 3+ → r2 + (n−2)×addl ·
     n ≥ bulkMin → every bag at bulkRate (whichever the chart defines) */
  function routeBase(r, bags) {
    bags = Math.max(1, bags | 0);
    if (r.bulkMin && bags >= r.bulkMin) {
      return { amount: bags * r.bulkRate, rule: "bulk rate · " + bags + " × ₹" + r.bulkRate.toLocaleString("en-IN") + " (min " + r.bulkMin + " bags)" };
    }
    if (bags === 1) return { amount: r.r1, rule: "1-bag rate" };
    if (bags === 2) return { amount: r.r2, rule: "2-bag rate" };
    return { amount: r.r2 + (bags - 2) * r.addl, rule: "2-bag rate + " + (bags - 2) + " × ₹" + r.addl.toLocaleString("en-IN") + " addl" };
  }

  function slabPct(pieces) {
    if (pieces >= 8) return 0.15;
    if (pieces >= 5) return 0.10;
    if (pieces >= 3) return 0.05;
    return 0;
  }
  function isPeak(dateStr) {
    if (!dateStr) return false;
    var d = new Date(dateStr + "T12:00:00");
    var m = d.getMonth(), day = d.getDate(), wd = d.getDay();
    if ((m === 11 && day >= 15) || (m === 0 && day <= 5)) return true;
    return wd === 5 || wd === 6 || wd === 0;
  }
  function handlingFor() { return 0; } /* handling removed — chart charges only */

  /* legacy zone quote (fallback layer) — q = {zo, zd, bags, oversize, mode, date, rates?} */
  function quote(q) {
    var rates = q.rates || RATES;
    var rate = (rates[q.zo] || DEFAULT_RATES[q.zo])[ZONES.indexOf(q.zd)];
    var minPieces = CFG.minPieces || 2;
    var floor = CFG.rateFloor || 2500;
    if (!rate || rate < floor) return { error: "This route is below the rate floor and cannot be quoted publicly." };
    var bags = Math.max(0, q.bags | 0), odd = Math.max(0, q.oversize | 0);
    var billed = Math.max(bags + odd, minPieces);
    var billedStd = billed - odd;
    var base = rate * billedStd;
    var oversize = (ADDONS.oversize || 900) * odd;
    var handling = handlingFor(q.mode);
    var sub = base + oversize + handling;
    var slab = Math.round(sub * slabPct(billed));
    var peak = isPeak(q.date) ? Math.round((sub - slab) * 0.08) : 0;
    var taxable = sub - slab + peak;
    var gst = Math.round(taxable * (CFG.gstRate || 0.18));
    var total = taxable + gst;
    return {
      source: "matrix", rule: "regional matrix · ₹" + rate.toLocaleString("en-IN") + " × " + billedStd,
      rate: rate, billed: billed, base: base, oversize: oversize, handling: handling,
      slab: slab, peak: peak, gst: gst, total: total, perBag: Math.round(total / billed)
    };
  }

  /* THE quote — route chart first, matrix fallback.
     q = { fromName, toName, bags, oversize, mode, date } */
  function quoteCity(q) {
    var bags = Math.max(0, q.bags | 0), odd = Math.max(0, q.oversize | 0);
    var hit = routeFor(q.fromName, q.toName);
    if (hit) {
      if (hit.reversed === false || hit.route.dir === "both") {
        var rb = routeBase(hit.route, Math.max(bags, 1));
        var oversize = (ADDONS.oversize || 900) * odd;
        var handling = handlingFor(q.mode);
        var taxable = rb.amount + oversize + handling;
        var gst = Math.round(taxable * (CFG.gstRate || 0.18));
        var billed = Math.max(bags, 1) + odd;
        return {
          source: "route", rule: rb.rule, routeNote: hit.route.note || "",
          routeName: hit.route.from + (hit.route.dir === "both" ? " ↔ " : " → ") + hit.route.to,
          rate: null, billed: billed, base: rb.amount, oversize: oversize, handling: handling,
          slab: 0, peak: 0, gst: gst, total: taxable + gst, perBag: Math.round((taxable + gst) / billed)
        };
      }
    }
    /* one-way route in the wrong direction, or no route: fall back to the matrix */
    var from = cityByName(q.fromName), to = cityByName(q.toName);
    if (!from || !to) return { error: "City not in the master yet — add it in Pricing, or quote on request." };
    var r = quote({ zo: from.zone, zd: to.zone, bags: bags, oversize: odd, mode: q.mode, date: q.date });
    if (!r.error) { r.zo = from.zone; r.zd = to.zone; }
    return r;
  }

  var HANDLING = { air: 400, rail: 250, sea: 600, road: 0 }; /* kept for back-compat */
  var UCNAME = {
    d2a: "Home → Airport", a2d: "Airport → Home", h2a: "Hotel → Airport",
    h2h: "Hotel → Hotel", d2d: "Door → Door", rail: "Railway station",
    cruise: "Cruise terminal", wed: "Wedding or event"
  };

  window.PRICING = {
    ZONES: ZONES, DEFAULT_RATES: DEFAULT_RATES, CITIES: CITIES, AIRPORTS: AIRPORTS,
    DEFAULT_ROUTES: DEFAULT_ROUTES, DEFAULT_ADDONS: DEFAULT_ADDONS,
    HANDLING: HANDLING, UCNAME: UCNAME,
    setMasters: setMasters, allCities: allCities, cityByName: cityByName,
    routeFor: routeFor, routeBase: routeBase,
    quote: quote, quoteCity: quoteCity, isPeak: isPeak, slabPct: slabPct,
    addons: function () { return ADDONS; }, routes: function () { return ROUTES; }
  };
})();
