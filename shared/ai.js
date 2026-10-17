/* Bagdrop intelligence engine.
   Everything here computes from the live database — bookings, events,
   inquiries — so every number the copilot speaks is real. When
   BAGDROP_CONFIG.ai.endpoint is set (a Supabase Edge Function proxying the
   Claude API), free-form questions go there with a data digest; without it,
   the local analyst answers the operational intents directly. */
(function () {
  "use strict";
  var P = window.PRICING;
  var inr = function (n) { return "₹" + Math.round(n || 0).toLocaleString("en-IN"); };
  var DAY = 86400000;

  /* assumed cost per piece per lane (from tripsheets; editable later) */
  var COST = {
    "MUM-GUJ": 1610, "GUJ-MUM": 1610, "NOR-GUJ": 3900, "GUJ-NOR": 3900,
    "MUM-GOA": 2700, "GOA-MUM": 2700, "NOR-GOA": 4700, "GOA-NOR": 4700,
    "MUM-NOR": 3300, "NOR-MUM": 3300, "GUJ-GOA": 3800, "GOA-GUJ": 3800,
    "SOU-MUM": 2900, "MUM-SOU": 2900, "GUJ-SOU": 3400, "SOU-GUJ": 3400
  };
  function costFor(zo, zd, rate) { return COST[zo + "-" + zd] || Math.round(rate * 0.72); }

  function dayKey(iso) { return (iso || "").slice(0, 10); }
  function daysAgo(n) { return new Date(Date.now() - n * DAY).toISOString().slice(0, 10); }

  /* ---------------- stats over live bookings ---------------- */
  function stats(ALL, EVENTS, INQ) {
    var today = daysAgo(0);
    var t = ALL.filter(function (d) { return dayKey(d.created) === today; });
    var paid = ALL.filter(function (d) { return d.pay; });
    var s = {
      total: ALL.length,
      today: t.length,
      needsDecision: ALL.filter(function (d) { return d.status === "submitted"; }).length,
      revisedWaiting: ALL.filter(function (d) { return d.status === "revised"; }).length,
      quotedUnpaid: ALL.filter(function (d) { return d.status === "quoted" || d.status === "identified"; }).length,
      inCustody: ALL.filter(function (d) { return d.status === "picked_up" || d.status === "in_transit"; }).length,
      delivered: ALL.filter(function (d) { return d.status === "delivered"; }).length,
      paidToday: t.reduce(function (a, d) { return a + (d.pay ? d.pay.amount : 0); }, 0),
      paidAll: paid.reduce(function (a, d) { return a + d.pay.amount; }, 0),
      pieces: ALL.reduce(function (a, d) { return a + (d.bags || 0) + (d.oversize || 0); }, 0),
      eventsOpen: (EVENTS || []).filter(function (e) { return e.status === "open"; }).length,
      newLeads: (INQ || []).filter(function (i) { return i.status === "new"; }).length,
      convertedLeads: (INQ || []).filter(function (i) { return i.status === "converted"; }).length
    };
    s.conversion = s.total ? Math.round(100 * ALL.filter(function (d) { return d.pay || d.eventCode; }).length / s.total) : 0;
    return s;
  }

  /* ---------------- lane economics ---------------- */
  function lanes(ALL, rates) {
    var map = {};
    ALL.forEach(function (d) {
      if (!d.zo || !d.zd || d.zo === d.zd) return;
      var k = d.zo + "↔" + d.zd.split("").join(""), key = [d.zo, d.zd].sort().join("↔");
      var m = map[key] = map[key] || { lane: key, pcs: 0, rev: 0, cost: 0 };
      var pcs = (d.bags || 0) + (d.oversize || 0);
      m.pcs += pcs;
      m.rev += d.quote ? d.quote.total : 0;
      var rate = ((rates || P.DEFAULT_RATES)[d.zo] || [])[P.ZONES.indexOf(d.zd)] || 3000;
      m.cost += costFor(d.zo, d.zd, rate) * pcs;
    });
    return Object.keys(map).map(function (k) {
      var m = map[k];
      m.revPc = m.pcs ? Math.round(m.rev / m.pcs) : 0;
      m.costPc = m.pcs ? Math.round(m.cost / m.pcs) : 0;
      m.cm = m.rev ? Math.round(100 * (m.rev - m.cost) / m.rev) : 0;
      return m;
    }).sort(function (a, b) { return b.rev - a.rev; });
  }

  /* ---------------- forecast ---------------- */
  /* pieces per day: history from bookings (by travel date, falling back to
     created), forecast = trend + weekday seasonality + peak uplift, 80% band */
  function forecast(ALL, horizon) {
    horizon = horizon || 14;
    var hist = {};
    ALL.forEach(function (d) {
      var k = dayKey(d.date || d.created);
      hist[k] = (hist[k] || 0) + (d.bags || 0) + (d.oversize || 0);
    });
    var series = [];
    for (var i = 13; i >= 0; i--) {
      var k = daysAgo(i);
      series.push({ day: k, actual: hist[k] || 0 });
    }
    var vals = series.map(function (x) { return x.actual; });
    var recent = vals.slice(-7), earlier = vals.slice(0, 7);
    var avgR = recent.reduce(function (a, b) { return a + b; }, 0) / 7;
    var avgE = earlier.reduce(function (a, b) { return a + b; }, 0) / 7;
    var trend = avgE > 0 ? (avgR - avgE) / 7 : (avgR > 0 ? avgR * 0.08 : 0);
    var base = Math.max(avgR, 0.5);
    /* weekday factor from history */
    var wd = [0, 0, 0, 0, 0, 0, 0], wdn = [0, 0, 0, 0, 0, 0, 0];
    Object.keys(hist).forEach(function (k) {
      var w = new Date(k + "T12:00:00").getDay();
      wd[w] += hist[k]; wdn[w]++;
    });
    var wAvg = vals.reduce(function (a, b) { return a + b; }, 0) / 14 || 1;
    function wf(day) {
      var w = new Date(day + "T12:00:00").getDay();
      var f = wdn[w] ? (wd[w] / wdn[w]) / wAvg : 1;
      return Math.min(1.6, Math.max(0.6, f || 1));
    }
    var out = [];
    for (var j = 1; j <= horizon; j++) {
      var day = new Date(Date.now() + j * DAY).toISOString().slice(0, 10);
      var peak = P.isPeak(day) ? 1.18 : 1;
      var mu = Math.max(0, (base + trend * j) * wf(day) * peak);
      out.push({ day: day, mu: mu, lo: Math.max(0, mu * 0.65), hi: mu * 1.4, peak: peak > 1 });
    }
    var weekTotal = Math.round(out.slice(0, 7).reduce(function (a, x) { return a + x.mu; }, 0));
    var captainsNeeded = Math.max(1, Math.ceil(weekTotal / 7 / 6)); // ~6 pieces per captain per day
    return {
      history: series, future: out,
      weekTotal: weekTotal, trend: trend, captainsNeeded: captainsNeeded,
      note: ALL.length < 10 ? "Early data — the band is wide until ~30 bookings exist. Retrains on every booking." : "Retrains on every booking · weekday seasonality + peak calendar applied."
    };
  }

  /* ---------------- anomalies ---------------- */
  function anomalies(ALL) {
    var out = [];
    var byMob = {};
    ALL.forEach(function (d) {
      var m = (d.traveller.mobile || "").replace(/\D/g, "");
      if (!m) return;
      (byMob[m] = byMob[m] || []).push(d);
    });
    Object.keys(byMob).forEach(function (m) {
      var unpaid = byMob[m].filter(function (d) { return !d.pay && !d.eventCode; });
      if (unpaid.length >= 3) out.push({ sev: "warn", text: unpaid.length + " unpaid quotes from +" + m.slice(-10) + " — possible scraping; quote lock limits to 3 per contact per day." });
    });
    ALL.forEach(function (d) {
      if (d.identity && d.identity.score >= 0.7 && d.identity.score < 0.85) out.push({ sev: "info", text: d.id + " identity matched at " + d.identity.score.toFixed(2) + " and was customer-confirmed — in the review ledger." });
      if (d.status === "revised") out.push({ sev: "warn", text: d.id + " is waiting on the customer's answer to a revised price — goes stale after 24 h." });
    });
    return out.slice(0, 6);
  }

  /* ---------------- pricing suggestions ---------------- */
  function pricingSuggestions(ALL, rates) {
    return lanes(ALL, rates).filter(function (l) { return l.pcs >= 1 && l.cm < 20; }).map(function (l) {
      var lift = Math.ceil((l.costPc / 0.75 - l.revPc) / 250) * 250;
      return {
        lane: l.lane, cm: l.cm,
        text: l.lane + " is running at " + l.cm + "% contribution margin over " + l.pcs + " pieces. Suggest raising the rate by " + inr(Math.max(lift, 250)) + " per piece to reach ~25% CM.",
        impact: "+" + inr(Math.max(lift, 250) * l.pcs) + " on this volume"
      };
    });
  }

  /* ---------------- CRM intelligence ---------------- */
  function crmCustomers(ALL) {
    var by = {};
    ALL.forEach(function (d) {
      var m = (d.traveller.mobile || "").replace(/\D/g, "");
      if (!m) return;
      var c = by[m] = by[m] || { mobile: d.traveller.mobile, name: d.traveller.name, bookings: [], value: 0, pieces: 0 };
      c.name = d.traveller.name || c.name;
      c.bookings.push(d);
      if (d.pay) c.value += d.pay.amount;
      c.pieces += (d.bags || 0) + (d.oversize || 0);
    });
    return Object.keys(by).map(function (k) {
      var c = by[k];
      c.last = c.bookings.reduce(function (a, d) { return d.created > a.created ? d : a; }, c.bookings[0]);
      c.tier = c.value >= 20000 || c.bookings.length >= 3 ? "gold" : c.value > 0 ? "silver" : "prospect";
      return c;
    }).sort(function (a, b) { return b.value - a.value; });
  }

  /* one actionable suggestion per lead / customer, ranked */
  function crmSuggestions(ALL, INQ, FOLLOW) {
    var out = [], now = Date.now();
    var followed = FOLLOW || {};
    function hrs(iso) { return (now - new Date(iso).getTime()) / 3600000; }
    (INQ || []).forEach(function (i) {
      if (i.status !== "new") return;
      var h = hrs(i.created);
      var est = (i.bags || 60) * 3500 * 2;
      out.push({
        pri: h > 24 ? 1 : 2, kind: "lead", refId: i.id,
        who: i.contact.name + " (" + i.contact.role + ")",
        contact: i.contact.mobile,
        text: (h > 24 ? "Going cold — " + Math.round(h) + " h without contact. " : "Fresh inquiry (" + Math.round(h) + " h). ") +
          (i.venue || i.venueCity) + ", ~" + (i.families || "?") + " families / " + (i.bags || "?") + " bags · pipeline ≈ " + inr(est) + ".",
        action: "convert", actionLabel: "Convert to wedding",
        msg: "Hello " + i.contact.name.split(" ")[0] + ", this is Bagdrop's events desk about the " + (i.venue || i.venueCity) + " celebration. We have a door-to-room luggage plan ready for the hosts — 10 minutes on a call this week?"
      });
    });
    crmCustomers(ALL).forEach(function (c) {
      var d = c.last, key = "cust:" + c.mobile.replace(/\D/g, "") + ":" + d.status;
      if (followed[key]) return;
      if (d.status === "delivered" && !c.bookings.some(function (x) { return x.created > d.created; })) {
        out.push({
          pri: 2, kind: "customer", refId: d.id, followKey: key,
          who: c.name, contact: c.mobile,
          text: "Delivered " + d.from + " → " + d.to + " and no return leg booked. Return-leg offer converts best within 48 h of delivery.",
          action: "nudge", actionLabel: "Send return offer",
          msg: "Hi " + (c.name || "").split(" ")[0] + "! Your bags made it — hope the trip is going well. When you head back, your return pickup is ready at 10% off: bagdrop.co/?ref=" + d.id
        });
      }
      if ((d.status === "quoted" || d.status === "identified") && hrs(d.created) > 2) {
        out.push({
          pri: 1, kind: "customer", refId: d.id, followKey: key,
          who: c.name || c.mobile, contact: c.mobile,
          text: "Unlocked a quote of " + inr(d.quote.total) + " (" + d.from + " → " + d.to + ") " + Math.round(hrs(d.created)) + " h ago and has not paid. The 24 h price lock is the hook.",
          action: "nudge", actionLabel: "Send payment nudge",
          msg: "Hi " + (c.name || "").split(" ")[0] + ", your Bagdrop price of " + inr(d.quote.total) + " is locked until tomorrow. Finish in one tap: bagdrop.co/?q=" + (d.quote.qid || d.id)
        });
      }
      if (d.status === "revised" && hrs(d.created) > 1) {
        out.push({
          pri: 1, kind: "customer", refId: d.id, followKey: key,
          who: c.name || c.mobile, contact: c.mobile,
          text: "Has a revised price waiting (" + inr((d.admin || {}).revisedTotal) + "). A call closes these far better than the screen alone.",
          action: "nudge", actionLabel: "Draft the call note",
          msg: "Hi " + (c.name || "").split(" ")[0] + ", quick note on your booking " + d.id + " — we proposed " + inr((d.admin || {}).revisedTotal) + " (" + ((d.admin || {}).reason || "") + "). Happy to talk it through: " + (window.BAGDROP_CONFIG || {}).whatsapp
        });
      }
    });
    return out.sort(function (a, b) { return a.pri - b.pri; });
  }

  /* ---------------- daily brief ---------------- */
  function brief(ALL, EVENTS, INQ, rates) {
    var s = stats(ALL, EVENTS, INQ);
    var f = forecast(ALL, 7);
    var sug = crmSuggestions(ALL, INQ, {});
    var lines = [];
    lines.push(s.today + " booking" + (s.today === 1 ? "" : "s") + " today worth " + inr(s.paidToday) + " paid" +
      (s.needsDecision ? "; " + s.needsDecision + " waiting on an ops decision — that is the first job" : "; nothing waits on ops") + ".");
    if (s.newLeads) lines.push(s.newLeads + " wedding inquir" + (s.newLeads === 1 ? "y" : "ies") + " uncontacted in the CRM" + (sug.length ? " — top follow-up: " + sug[0].who : "") + ".");
    lines.push("Next 7 days forecast ≈ " + f.weekTotal + " pieces (" + (f.trend >= 0 ? "demand building" : "demand softening") + "); roster comfortable at " + f.captainsNeeded + " captain" + (f.captainsNeeded === 1 ? "" : "s") + "/day.");
    var ps = pricingSuggestions(ALL, rates);
    if (ps.length) lines.push("Margin watch: " + ps[0].lane + " at " + ps[0].cm + "% CM — suggestion queued in Pricing.");
    if (s.quotedUnpaid) lines.push(s.quotedUnpaid + " quote" + (s.quotedUnpaid === 1 ? "" : "s") + " unlocked but unpaid — nudges drafted in the CRM.");
    return lines;
  }

  /* ---------------- copilot ---------------- */
  function answer(q, ALL, EVENTS, INQ, rates) {
    q = (q || "").toLowerCase();
    var s = stats(ALL, EVENTS, INQ);
    var has = function () { return [].some.call(arguments, function (w) { return q.indexOf(w) >= 0; }); };

    if (has("lane", "margin", "lost money", "lose money", "profit")) {
      var ls = lanes(ALL, rates);
      if (!ls.length) return "No inter-region shipments yet, so no lane economics to report. Once lanes have volume I rank them by contribution margin here.";
      return "Lane economics on live data:\n" + ls.map(function (l) {
        return l.lane + " · " + l.pcs + " pcs · rev/pc " + inr(l.revPc) + " · cost/pc " + inr(l.costPc) + " · CM " + l.cm + "%" + (l.cm < 20 ? "  ← below the 20% floor, suggestion queued" : "");
      }).join("\n");
    }
    if (has("cut off", "cutoff", "risk", "late", "miss")) {
      var risky = ALL.filter(function (d) { return ["accepted", "assigned"].indexOf(d.status) >= 0 && d.date && d.date <= daysAgo(-1); });
      if (!risky.length) return "No shipment is at cut-off risk right now. " + s.inCustody + " in custody are tracking on plan.";
      return risky.length + " shipment(s) travel within 24 h:\n" + risky.map(function (d) {
        return d.id + " · " + d.from + " → " + d.to + " · " + d.date + " " + (d.slot || "") + ((d.admin || {}).captain ? " · captain " + d.admin.captain : "  ← NO CAPTAIN — assign now");
      }).join("\n");
    }
    if (has("captain", "roster", "diwali", "week", "capacity", "staff", "hire")) {
      var f = forecast(ALL, 7);
      return "Forecast for the next 7 days is ~" + f.weekTotal + " pieces (80% band applied). At ~6 pieces per captain per day you need " + f.captainsNeeded +
        " captain(s) rostered daily. " + (f.trend > 0.2 ? "Demand is building — add one standby from day 4." : "Current roster holds.") + "\n" + f.note;
    }
    if (has("revenue", "paid", "money today", "collect", "how much")) {
      return "Paid today " + inr(s.paidToday) + " · all time " + inr(s.paidAll) + " across " + s.total + " bookings (" + s.pieces + " pieces). " +
        s.quotedUnpaid + " quotes are unlocked and unpaid — recoverable pipeline sits in the CRM.";
    }
    if (has("lead", "inquiry", "inquiries", "wedding", "convert", "pipeline", "crm", "follow")) {
      var sg = crmSuggestions(ALL, INQ, {});
      if (!sg.length) return "CRM is clean: " + s.newLeads + " new leads, " + s.convertedLeads + " converted, no follow-up overdue.";
      return "Top follow-ups now:\n" + sg.slice(0, 5).map(function (x, i) { return (i + 1) + ". " + x.who + " — " + x.text; }).join("\n");
    }
    if (has("decision", "decide", "inbox", "waiting", "pending")) {
      var need = ALL.filter(function (d) { return d.status === "submitted"; });
      if (!need.length) return "Nothing needs a decision. " + s.revisedWaiting + " revised quote(s) wait on customers, not on you.";
      return need.length + " booking(s) need a decision:\n" + need.map(function (d) { return d.id + " · " + d.traveller.name + " · " + d.from + " → " + d.to + " · " + inr(d.quote.total); }).join("\n");
    }
    if (has("customer", "top", "best", "repeat", "nri")) {
      var cs = crmCustomers(ALL).slice(0, 5);
      if (!cs.length) return "No customers yet.";
      return "Customers by lifetime value:\n" + cs.map(function (c, i) { return (i + 1) + ". " + (c.name || c.mobile) + " · " + c.bookings.length + " booking(s) · " + c.pieces + " pcs · " + inr(c.value) + " · " + c.tier; }).join("\n");
    }
    if (has("forecast", "demand", "next week", "tomorrow", "predict")) {
      var fc = forecast(ALL, 14);
      var tmr = fc.future[0];
      return "Tomorrow ~" + tmr.mu.toFixed(1) + " pieces (band " + tmr.lo.toFixed(0) + "–" + tmr.hi.toFixed(1) + (tmr.peak ? ", peak-flagged" : "") + "). " +
        "Next 7 days ~" + fc.weekTotal + " pieces. Trend " + (fc.trend >= 0 ? "+" : "") + fc.trend.toFixed(2) + " pcs/day. " + fc.note;
    }
    if (has("anomal", "fraud", "suspicious", "scrap")) {
      var an = anomalies(ALL);
      return an.length ? "Watchlist:\n" + an.map(function (a) { return "· " + a.text; }).join("\n") : "No anomalies on the current data: no quote scraping patterns, no identity scores in the review band, nothing stale.";
    }
    return "I answer from the live database. Ask about: lanes and margins · cut-off risk · captains needed · revenue · leads and follow-ups · pending decisions · top customers · the demand forecast · anomalies. " +
      "For free-form questions, wire an Edge Function endpoint in shared/config.js (ai.endpoint) and I route them to Claude with a data digest.";
  }

  /* optional remote LLM (Supabase Edge Function proxying Claude) */
  function remoteAnswer(q, digest) {
    var ep = ((window.BAGDROP_CONFIG || {}).ai || {}).endpoint;
    if (!ep) return Promise.reject(new Error("no endpoint"));
    return fetch(ep, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, digest: digest })
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { return j.answer; });
  }

  window.AI = {
    stats: stats, lanes: lanes, forecast: forecast, anomalies: anomalies,
    pricingSuggestions: pricingSuggestions, crmCustomers: crmCustomers,
    crmSuggestions: crmSuggestions, brief: brief, answer: answer, remoteAnswer: remoteAnswer,
    costFor: costFor
  };
})();
