import type { SupabaseClient } from "@supabase/supabase-js";
import type { BagdropEvent, Booking, CrmActivity, Inquiry, Trip } from "./types";
import type { Attention, Delta, Metrics, Period, Trend, ViewKey } from "./metricsTypes";

/** Executive dashboard aggregation. ALL the math happens here, server-side —
 *  the browser receives computed figures only, never raw tables. One call
 *  returns every department's view for the chosen period (the admin
 *  dashboard flips between boards without refetching); the scoped board
 *  route slices the same payload down to one department. */

/* ---- IST day helpers (bookings are an India business; the server is UTC) */
const IST_MS = 5.5 * 3600 * 1000;
const istDay = (iso: string | number) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);
const dayMs = 86400000;

function periodStart(p: Period, now: number): string {
  const today = istDay(now);
  if (p === "today") return today;
  if (p === "7d") return istDay(now - 6 * dayMs);
  if (p === "mtd") return today.slice(0, 8) + "01";
  // financial year: 1 April
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  return `${m >= 4 ? y : y - 1}-04-01`;
}

const PERIOD_LABEL: Record<Period, string> = { today: "Today", "7d": "Last 7 days", mtd: "Month to date", fy: "Financial year" };

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

/** The IST day a booking was delivered — its last event that mentions
 *  delivery, else the payment date, else null. Good enough for a trend. */
function deliveredDay(b: Booking): string | null {
  if (b.status !== "delivered") return null;
  for (let i = b.events.length - 1; i >= 0; i--) if (/deliver/i.test(b.events[i].text)) return istDay(b.events[i].at);
  return b.pay ? istDay(b.pay.at) : istDay(b.created);
}

export async function computeMetrics(sb: SupabaseClient, period: Period): Promise<Metrics | { error: string }> {
  const [bk, tr, ev, inq, crm] = await Promise.all([
    sb.from("bookings").select("doc"),
    sb.from("trips").select("doc"),
    sb.from("events").select("doc"),
    sb.from("inquiries").select("doc"),
    sb.from("crm").select("doc"),
  ]);
  for (const r of [bk, tr, ev, inq, crm]) if (r.error) return { error: r.error.message };

  const bookings = (bk.data ?? []).map((r) => r.doc as Booking);
  const trips = (tr.data ?? []).map((r) => r.doc as Trip);
  const events = (ev.data ?? []).map((r) => r.doc as BagdropEvent);
  const inquiries = (inq.data ?? []).map((r) => r.doc as Inquiry);
  const activity = (crm.data ?? []).map((r) => r.doc as CrmActivity);

  const now = Date.now();
  const start = periodStart(period, now);
  const today = istDay(now);

  /* Previous comparison window: the same number of days, ending where this
   * period starts. periodDays counts start..today inclusive. */
  const periodDays = Math.max(1, Math.round((new Date(today).getTime() - new Date(start).getTime()) / dayMs) + 1);
  const prevStart = istDay(new Date(start).getTime() - periodDays * dayMs);

  const inP = (iso?: string | null) => !!iso && istDay(iso) >= start;
  const inPrev = (iso?: string | null) => { if (!iso) return false; const d = istDay(iso); return d >= prevStart && d < start; };

  const created = bookings.filter((b) => inP(b.created));
  const paid = bookings.filter((b) => b.pay?.status === "captured" && inP(b.pay.verifiedAt ?? b.pay.at));
  const createdPrev = bookings.filter((b) => inPrev(b.created));
  const paidPrev = bookings.filter((b) => b.pay?.status === "captured" && inPrev(b.pay.verifiedAt ?? b.pay.at));

  /* ---- money ---- */
  const payGst = (b: Booking) => num(b.quote.breakdown.gst) || Math.round(num(b.pay!.amount) * 5 / 105);
  const revenue = paid.reduce((s, b) => s + num(b.pay!.amount), 0);
  const revenuePrev = paidPrev.reduce((s, b) => s + num(b.pay!.amount), 0);
  const gst = paid.reduce((s, b) => s + payGst(b), 0);
  const gstPrev = paidPrev.reduce((s, b) => s + payGst(b), 0);
  const billedValue = created.reduce((s, b) => s + num(b.quote.total), 0);
  const billedValuePrev = createdPrev.reduce((s, b) => s + num(b.quote.total), 0);
  const unrecon = bookings.filter((b) => b.pay?.status === "captured" && !b.pay.recon);
  const receivable = bookings.filter((b) => b.pay?.status !== "captured" && num(b.quote.total) > 0 && ["accepted", "assigned", "picked_up", "in_transit", "delivered"].includes(b.status));
  const ageBucket = (b: Booking) => { const d = Math.floor((now - new Date(b.created).getTime()) / dayMs); return d <= 7 ? "0–7 d" : d <= 30 ? "8–30 d" : "30+ d"; };
  const ageing = ["0–7 d", "8–30 d", "30+ d"].map((bucket) => ({
    bucket, amount: receivable.filter((b) => ageBucket(b) === bucket).reduce((s, b) => s + num(b.quote.total), 0),
  }));

  /* ---- trips & margin ---- */
  const tripRows = trips.map((t) => {
    const linked = bookings.filter((b) => (b.admin as { trip?: string }).trip === t.id);
    const rev = linked.reduce((s, b) => s + num(b.pay?.amount), 0);
    const exp = t.expenses.reduce((s, e) => s + num(e.amount), 0);
    const adv = t.advances.reduce((s, a) => s + num(a.amount), 0);
    return { id: t.id, route: t.route, date: t.date, status: t.status, bookings: linked.length, revenue: rev, expenses: exp, advances: adv, pnl: rev - exp };
  });
  const tripRev = tripRows.reduce((s, t) => s + t.revenue, 0);
  const tripExp = tripRows.reduce((s, t) => s + t.expenses, 0);
  const marginPct = tripRev > 0 ? Math.round(((tripRev - tripExp) / tripRev) * 100) : null;

  /* ---- ops ---- */
  const byStage: Record<string, number> = {};
  for (const b of bookings) byStage[b.status] = (byStage[b.status] ?? 0) + 1;
  const pickupsToday = bookings.filter((b) => ["accepted", "assigned"].includes(b.status) && (b.pickupDate ?? b.date) === today);
  const podsPending = bookings.filter((b) => b.status === "delivered" && !b.pod);
  const inCustody = bookings.filter((b) => ["picked_up", "in_transit"].includes(b.status));
  const delivered = bookings.map((b) => ({ b, day: deliveredDay(b) })).filter((x) => x.day !== null) as { b: Booking; day: string }[];
  const deliveredInPeriod = delivered.filter((x) => x.day >= start).length;
  const deliveredPrev = delivered.filter((x) => x.day >= prevStart && x.day < start).length;

  /* ---- sales ---- */
  const rorPending = bookings.filter((b) => b.quote.breakdown.ror && ["submitted", "quoted"].includes(b.status));
  const unpaidPipeline = bookings.filter((b) => b.pay?.status !== "captured" && ["quoted", "submitted", "revised"].includes(b.status));
  const overdue = activity.filter((a) => a.dueAt && !a.doneAt && new Date(a.dueAt).getTime() < now);
  const conv = created.length > 0 ? Math.round((created.filter((b) => b.pay?.status === "captured").length / created.length) * 100) : null;
  const inqInP = inquiries.filter((i) => inP(i.created)).length;
  const inqPrev = inquiries.filter((i) => inPrev(i.created)).length;

  /* ---- commercial ---- */
  const laneMap = new Map<string, { bags: number; revenue: number; n: number }>();
  for (const b of paid) {
    const k = `${b.from} → ${b.to}`;
    const l = laneMap.get(k) ?? { bags: 0, revenue: 0, n: 0 };
    l.bags += num(b.billed) || num(b.bags); l.revenue += num(b.pay!.amount); l.n += 1;
    laneMap.set(k, l);
  }
  const lanes = [...laneMap.entries()].map(([lane, l]) => ({ lane, ...l, perBag: l.bags ? Math.round(l.revenue / l.bags) : 0 }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const revised = bookings.filter((b) => b.status === "revised" || b.events.some((e) => /discount|revis/i.test(e.text)));
  const oversizeRev = paid.reduce((s, b) => s + num(b.quote.breakdown.oversize), 0);
  const pieces = (list: Booking[]) => list.reduce((s, b) => s + (num(b.billed) || num(b.bags)), 0);
  const billedPieces = pieces(paid);
  const avgPerBag = billedPieces ? Math.round(revenue / billedPieces) : 0;
  const prevPieces = pieces(paidPrev);
  const avgPerBagPrev = prevPieces ? Math.round(revenuePrev / prevPieces) : 0;

  /* ---- weddings ---- */
  const wedBookings = bookings.filter((b) => b.uc === "wed" || b.eventCode);
  const openEvents = events.filter((e) => e.status === "open");
  const bagsOut = wedBookings.filter((b) => ["picked_up", "in_transit"].includes(b.status)).reduce((s, b) => s + num(b.bags), 0);
  const noRoom = wedBookings.reduce((s, b) => {
    const st = b.wedding?.state as { members?: { room?: string }[] } | undefined;
    return s + (st?.members?.filter((m) => !m.room).length ?? 0);
  }, 0);
  const wedCreated = wedBookings.filter((b) => inP(b.created)).length;
  const wedCreatedPrev = wedBookings.filter((b) => inPrev(b.created)).length;

  /* ---- series: last 14 IST days + 7-day forecast band ---- */
  const lastDays = Array.from({ length: 14 }, (_, i) => istDay(now - (13 - i) * dayMs));
  const days = lastDays.map((day) => {
    const dayPaid = bookings.filter((b) => b.pay?.status === "captured" && istDay(b.pay.verifiedAt ?? b.pay.at) === day);
    return {
      day,
      revenue: dayPaid.reduce((s, b) => s + num(b.pay!.amount), 0),
      pieces: bookings.filter((b) => istDay(b.created) === day).reduce((s, b) => s + (num(b.billed) || num(b.bags)), 0),
    };
  });
  const last7 = days.slice(-7).map((d) => d.pieces);
  const mu = last7.reduce((s, v) => s + v, 0) / 7;
  const sd = Math.sqrt(last7.reduce((s, v) => s + (v - mu) ** 2, 0) / 7);
  const forecast = Array.from({ length: 7 }, (_, i) => ({
    day: istDay(now + (i + 1) * dayMs), mu: Math.round(mu * 10) / 10,
    lo: Math.max(0, Math.round((mu - sd) * 10) / 10), hi: Math.round((mu + sd) * 10) / 10,
  }));

  /* ---- per-department 14-day trends ---- */
  const byDay = <T,>(list: T[], day: (x: T) => string | null, value: (xs: T[]) => number): Trend["days"] =>
    lastDays.map((d) => ({ day: d, v: value(list.filter((x) => day(x) === d)) }));
  const trends: Metrics["trends"] = {
    ops: { label: "Deliveries per day", days: byDay(delivered, (x) => x.day, (xs) => xs.length) },
    fin: { label: "Collected per day (₹)", days: days.map((d) => ({ day: d.day, v: d.revenue })) },
    sales: { label: "Bookings created per day", days: byDay(bookings, (b) => istDay(b.created), (xs) => xs.length) },
    comm: {
      label: "Realization ₹/bag per day",
      days: byDay(bookings.filter((b) => b.pay?.status === "captured"), (b) => istDay(b.pay!.verifiedAt ?? b.pay!.at), (xs) => {
        const p = pieces(xs); return p ? Math.round(xs.reduce((s, b) => s + num(b.pay!.amount), 0) / p) : 0;
      }),
    },
    wed: { label: "Family bookings per day", days: byDay(wedBookings, (b) => istDay(b.created), (xs) => xs.length) },
  };

  /* ---- ticker ---- */
  const feed = bookings.flatMap((b) => b.events.map((e) => ({ at: e.at, id: b.id, text: e.text })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14);

  /* ---- per-department attention lists (CEO = the union, ranked) ---- */
  const noCaptain = pickupsToday.filter((b) => b.status === "accepted");
  const lossTrips = tripRows.filter((t) => t.status !== "planned" && t.pnl < 0);
  const old30 = ageing[2].amount;
  const att: Record<ViewKey, Attention[]> = { ceo: [], ops: [], fin: [], sales: [], comm: [], wed: [] };
  noCaptain.slice(0, 3).forEach((b) => att.ops.push({ text: `Pickup today without a captain — ${b.from} → ${b.to}`, module: "ship", id: b.id }));
  if (podsPending.length) att.ops.push({ text: `${podsPending.length} delivered without POD`, module: "ship", id: podsPending[0].id });
  lossTrips.forEach((t) => att.ops.push({ text: `Trip ${t.id} running at a loss (₹${(-t.pnl).toLocaleString("en-IN")})`, module: "lr" }));
  if (unrecon.length) att.fin.push({ text: `${unrecon.length} payment${unrecon.length > 1 ? "s" : ""} not reconciled (₹${unrecon.reduce((s, b) => s + num(b.pay?.amount), 0).toLocaleString("en-IN")})`, module: "fin", id: unrecon[0].id });
  if (old30 > 0) att.fin.push({ text: `₹${old30.toLocaleString("en-IN")} receivable older than 30 days`, module: "fin" });
  rorPending.slice(0, 3).forEach((b) => att.sales.push({ text: `Rate on request waiting — ${b.from} → ${b.to} (${b.traveller.name || "guest"})`, module: "ship", id: b.id }));
  if (overdue.length) att.sales.push({ text: `${overdue.length} CRM follow-up${overdue.length > 1 ? "s" : ""} overdue`, module: "crm" });
  if (revised.length) att.comm.push({ text: `${revised.length} quote${revised.length > 1 ? "s" : ""} revised or discounted — check lane pricing`, module: "price" });
  lanes.filter((l) => avgPerBag && l.perBag < avgPerBag * 0.7).slice(0, 2).forEach((l) => att.comm.push({ text: `${l.lane} realizes ₹${l.perBag}/bag — well under the ₹${avgPerBag} average`, module: "price" }));
  if (noRoom) att.wed.push({ text: `${noRoom} wedding guest${noRoom > 1 ? "s" : ""} without a room — bags held at bell desk`, module: "wed" });
  openEvents.forEach((e) => { const fams = wedBookings.filter((b) => b.eventCode === e.id).length; if (fams === 0) att.wed.push({ text: `${e.name} (${e.id}) is open with no bookings yet — share its landing page`, module: "wed" }); });
  att.ceo = [...att.fin, ...att.ops, ...att.sales, ...att.comm, ...att.wed].slice(0, 8);

  /* ---- KPI deltas vs the previous window ---- */
  const d = (nowV: number, prevV: number): Delta => ({ prev: prevV, pct: prevV > 0 ? Math.round(((nowV - prevV) / prevV) * 100) : null });
  const deltas: Record<string, Delta> = {
    revenue: d(revenue, revenuePrev),
    gst: d(gst, gstPrev),
    billedValue: d(billedValue, billedValuePrev),
    bookings: d(created.length, createdPrev.length),
    paidCount: d(paid.length, paidPrev.length),
    inquiries: d(inqInP, inqPrev),
    delivered: d(deliveredInPeriod, deliveredPrev),
    avgPerBag: d(avgPerBag, avgPerBagPrev),
    wedCreated: d(wedCreated, wedCreatedPrev),
  };

  const dept = (key: string, name: string, ok: boolean, note: string) => ({ key, name, ok, note });

  return {
    asOf: new Date(now).toISOString(), period, periodLabel: PERIOD_LABEL[period], start, prevStart,
    series: { days, forecast },
    feed,
    deltas,
    trends,
    attention: att,
    ceo: {
      revenue, gst, billedValue, bookings: created.length, paidCount: paid.length,
      collected: revenue, marginPct,
      depts: [
        dept("ops", "Operations", att.ops.length === 0, `${inCustody.length} in custody · ${tripRows.filter((t) => t.status === "running").length} trips running`),
        dept("fin", "Finance", att.fin.length === 0, `₹${receivable.reduce((s, b) => s + num(b.quote.total), 0).toLocaleString("en-IN")} receivable · ${unrecon.length} unreconciled`),
        dept("sales", "Sales & CRM", att.sales.length === 0, `${unpaidPipeline.length} open quotes · ${overdue.length} follow-ups overdue`),
        dept("comm", "Commercial", att.comm.length === 0, `${lanes.length} active lanes · ${rorPending.length} ROR pending`),
        dept("wed", "Weddings", att.wed.length === 0, `${openEvents.length} open event${openEvents.length === 1 ? "" : "s"} · ${bagsOut} bags out`),
      ],
    },
    ops: {
      byStage, pickupsToday: pickupsToday.length, tripsRunning: tripRows.filter((t) => t.status === "running").length,
      inCustody: inCustody.length, podsPending: podsPending.length,
      deliveredTotal: byStage["delivered"] ?? 0, deliveredInPeriod, trips: tripRows.slice(0, 8),
    },
    fin: {
      invoiced: billedValue, collected: revenue, gst,
      receivableTotal: receivable.reduce((s, b) => s + num(b.quote.total), 0), receivableCount: receivable.length,
      ageing, unreconCount: unrecon.length, unreconAmount: unrecon.reduce((s, b) => s + num(b.pay?.amount), 0),
      docsCount: bookings.reduce((s, b) => s + (b.docs?.length ?? 0), 0),
    },
    sales: {
      inquiries: inqInP, inquiriesTotal: inquiries.length,
      conversionPct: conv, pipelineValue: unpaidPipeline.reduce((s, b) => s + num(b.quote.total), 0),
      pipelineCount: unpaidPipeline.length, overdueFollowups: overdue.length, rorPending: rorPending.length,
    },
    comm: {
      lanes, avgPerBag,
      revisedCount: revised.length, oversizeRevenue: oversizeRev,
      oversizeSharePct: revenue > 0 ? Math.round((oversizeRev / revenue) * 100) : 0,
    },
    wed: {
      openEvents: openEvents.length, familyBookings: wedBookings.length, newFamilies: wedCreated,
      guests: wedBookings.reduce((s, b) => s + num(b.family?.guests), 0), bagsOut, noRoom,
      events: openEvents.slice(0, 6).map((e) => ({
        code: e.id, name: e.name, venue: `${e.venue}, ${e.venueCity}`, dates: e.dates,
        families: wedBookings.filter((b) => b.eventCode === e.id).length,
      })),
    },
  };
}

/** Keys of deltas each scoped board is entitled to see. */
const SCOPE_DELTAS: Record<ViewKey, string[]> = {
  ceo: [],
  ops: ["delivered"],
  fin: ["revenue", "gst", "billedValue", "paidCount"],
  sales: ["inquiries", "bookings"],
  comm: ["avgPerBag", "paidCount"],
  wed: ["wedCreated"],
};

/** Strips a full Metrics payload down to one department for a read-only
 *  board link: only that view's section, trend, attention and deltas remain;
 *  company-wide numbers (CEO board, ticker, revenue series) are zeroed. */
export function scopeMetrics(m: Metrics, view: ViewKey): Metrics {
  if (view === "ceo") return m;
  const emptyTrend: Trend = { label: "", days: [] };
  const keep = new Set(SCOPE_DELTAS[view]);
  return {
    ...m,
    series: { days: [], forecast: [] },
    feed: [],
    deltas: Object.fromEntries(Object.entries(m.deltas).filter(([k]) => keep.has(k))),
    trends: { ops: emptyTrend, fin: emptyTrend, sales: emptyTrend, comm: emptyTrend, wed: emptyTrend, [view]: m.trends[view as Exclude<ViewKey, "ceo">] },
    attention: { ceo: [], ops: [], fin: [], sales: [], comm: [], wed: [], [view]: m.attention[view] },
    ceo: { revenue: 0, gst: 0, billedValue: 0, bookings: 0, paidCount: 0, collected: 0, marginPct: null, depts: [] },
    ops: view === "ops" ? m.ops : { byStage: {}, pickupsToday: 0, tripsRunning: 0, inCustody: 0, podsPending: 0, deliveredTotal: 0, deliveredInPeriod: 0, trips: [] },
    fin: view === "fin" ? m.fin : { invoiced: 0, collected: 0, gst: 0, receivableTotal: 0, receivableCount: 0, ageing: [], unreconCount: 0, unreconAmount: 0, docsCount: 0 },
    sales: view === "sales" ? m.sales : { inquiries: 0, inquiriesTotal: 0, conversionPct: null, pipelineValue: 0, pipelineCount: 0, overdueFollowups: 0, rorPending: 0 },
    comm: view === "comm" ? m.comm : { lanes: [], avgPerBag: 0, revisedCount: 0, oversizeRevenue: 0, oversizeSharePct: 0 },
    wed: view === "wed" ? m.wed : { openEvents: 0, familyBookings: 0, newFamilies: 0, guests: 0, bagsOut: 0, noRoom: 0, events: [] },
  };
}

export function parsePeriod(v: string | null): Period {
  return (["today", "7d", "mtd", "fy"].includes(v ?? "") ? v : "today") as Period;
}
