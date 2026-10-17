/** Command centre intelligence — ported from the static build's shared/ai.js.
 *  Everything here computes from the live bookings list; nothing is faked.
 *  No external AI call — this is the same "local analyst" the static site
 *  falls back to when no AI endpoint is configured (which is always true
 *  here, since this app has no such endpoint). */
import { inr, isPeak } from "./pricing";
import type { Booking, CrmActivity, Inquiry } from "./types";

const DAY = 86400000;
const dayKey = (iso: string) => (iso || "").slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

export interface Stats {
  total: number;
  today: number;
  needsDecision: number;
  revisedWaiting: number;
  quotedUnpaid: number;
  inCustody: number;
  delivered: number;
  paidToday: number;
  pieces: number;
}

export function stats(all: Booking[]): Stats {
  const today = daysAgo(0);
  const t = all.filter((d) => dayKey(d.created) === today);
  return {
    total: all.length,
    today: t.length,
    needsDecision: all.filter((d) => d.status === "submitted").length,
    revisedWaiting: all.filter((d) => d.status === "revised").length,
    quotedUnpaid: all.filter((d) => d.status === "quoted" || d.status === "identified").length,
    inCustody: all.filter((d) => d.status === "picked_up" || d.status === "in_transit").length,
    delivered: all.filter((d) => d.status === "delivered").length,
    paidToday: t.reduce((a, d) => a + (d.pay ? d.pay.amount : 0), 0),
    pieces: all.reduce((a, d) => a + (d.bags || 0) + (d.oversize || 0), 0),
  };
}

export interface ForecastPoint { day: string; actual?: number; mu?: number; lo?: number; hi?: number; peak?: boolean }
export interface Forecast {
  history: { day: string; actual: number }[];
  future: ForecastPoint[];
  weekTotal: number;
  trend: number;
  captainsNeeded: number;
  note: string;
}

/** Pieces per day: history from bookings (by travel date, falling back to
 *  created), forecast = trend + weekday seasonality + peak uplift. */
export function forecast(all: Booking[], horizon = 14): Forecast {
  const hist: Record<string, number> = {};
  all.forEach((d) => {
    const k = dayKey(d.date || d.created);
    hist[k] = (hist[k] || 0) + (d.bags || 0) + (d.oversize || 0);
  });
  const series: { day: string; actual: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const k = daysAgo(i);
    series.push({ day: k, actual: hist[k] || 0 });
  }
  const vals = series.map((x) => x.actual);
  const recent = vals.slice(-7), earlier = vals.slice(0, 7);
  const avgR = recent.reduce((a, b) => a + b, 0) / 7;
  const avgE = earlier.reduce((a, b) => a + b, 0) / 7;
  const trend = avgE > 0 ? (avgR - avgE) / 7 : avgR > 0 ? avgR * 0.08 : 0;
  const base = Math.max(avgR, 0.5);

  const wd = [0, 0, 0, 0, 0, 0, 0], wdn = [0, 0, 0, 0, 0, 0, 0];
  Object.keys(hist).forEach((k) => {
    const w = new Date(`${k}T12:00:00`).getDay();
    wd[w] += hist[k]; wdn[w]++;
  });
  const wAvg = vals.reduce((a, b) => a + b, 0) / 14 || 1;
  function wf(day: string): number {
    const w = new Date(`${day}T12:00:00`).getDay();
    const f = wdn[w] ? wd[w] / wdn[w] / wAvg : 1;
    return Math.min(1.6, Math.max(0.6, f || 1));
  }

  const future: ForecastPoint[] = [];
  for (let j = 1; j <= horizon; j++) {
    const day = new Date(Date.now() + j * DAY).toISOString().slice(0, 10);
    const peak = isPeak(day) ? 1.18 : 1;
    const mu = Math.max(0, (base + trend * j) * wf(day) * peak);
    future.push({ day, mu, lo: Math.max(0, mu * 0.65), hi: mu * 1.4, peak: peak > 1 });
  }
  const weekTotal = Math.round(future.slice(0, 7).reduce((a, x) => a + (x.mu ?? 0), 0));
  const captainsNeeded = Math.max(1, Math.ceil(weekTotal / 7 / 6));
  return {
    history: series, future, weekTotal, trend, captainsNeeded,
    note: all.length < 10
      ? "Early data — the band is wide until ~30 bookings exist. Retrains on every booking."
      : "Retrains on every booking · weekday seasonality + peak calendar applied.",
  };
}

/** Assumed cost per piece per lane (from tripsheets, editable later) — same
 *  table the static build ships with. */
const COST: Record<string, number> = {
  "MUM-GUJ": 1610, "GUJ-MUM": 1610, "NOR-GUJ": 3900, "GUJ-NOR": 3900,
  "MUM-GOA": 2700, "GOA-MUM": 2700, "NOR-GOA": 4700, "GOA-NOR": 4700,
  "MUM-NOR": 3300, "NOR-MUM": 3300, "GUJ-GOA": 3800, "GOA-GUJ": 3800,
  "SOU-MUM": 2900, "MUM-SOU": 2900, "GUJ-SOU": 3400, "SOU-GUJ": 3400,
};
function costFor(zo: string, zd: string, rate: number): number {
  return COST[`${zo}-${zd}`] ?? Math.round(rate * 0.72);
}

export interface Lane { lane: string; pcs: number; rev: number; cost: number; revPc: number; costPc: number; cm: number }

/** Lane-level revenue/cost/contribution-margin, for the Finance module's
 *  economics table. `fallbackRate` — the matrix rate to assume per piece
 *  when a booking's own quote breakdown doesn't carry one (used only for
 *  the cost estimate, never billed). */
export function lanes(all: Booking[], fallbackRate = 3000): Lane[] {
  const map: Record<string, Lane> = {};
  all.forEach((d) => {
    if (!d.zo || !d.zd || d.zo === d.zd) return;
    const key = [d.zo, d.zd].sort().join("↔");
    const m = (map[key] = map[key] || { lane: key, pcs: 0, rev: 0, cost: 0, revPc: 0, costPc: 0, cm: 0 });
    const pcs = (d.bags || 0) + (d.oversize || 0);
    m.pcs += pcs;
    m.rev += d.quote ? d.quote.total : 0;
    m.cost += costFor(d.zo, d.zd, fallbackRate) * pcs;
  });
  return Object.values(map)
    .map((m) => ({
      ...m,
      revPc: m.pcs ? Math.round(m.rev / m.pcs) : 0,
      costPc: m.pcs ? Math.round(m.cost / m.pcs) : 0,
      cm: m.rev ? Math.round((100 * (m.rev - m.cost)) / m.rev) : 0,
    }))
    .sort((a, b) => b.rev - a.rev);
}

export interface Notice { sev: "warn" | "info"; text: string }

/** "Copilot noticed" — simple real heuristics over the live bookings, no AI call. */
export function anomalies(all: Booking[]): Notice[] {
  const out: Notice[] = [];
  const byMob: Record<string, Booking[]> = {};
  all.forEach((d) => {
    const m = (d.traveller.mobile || "").replace(/\D/g, "");
    if (!m) return;
    (byMob[m] = byMob[m] || []).push(d);
  });
  Object.keys(byMob).forEach((m) => {
    const unpaid = byMob[m].filter((d) => !d.pay);
    if (unpaid.length >= 3) {
      out.push({ sev: "warn", text: `${unpaid.length} unpaid quotes from +${m.slice(-10)} — possible scraping; consider a per-contact quote limit.` });
    }
  });
  all.forEach((d) => {
    if (d.identity && d.identity.score >= 0.7 && d.identity.score < 0.85) {
      out.push({ sev: "info", text: `${d.id} identity matched at ${d.identity.score.toFixed(2)} and was customer-confirmed — in the review ledger.` });
    }
    if (d.status === "revised") {
      out.push({ sev: "warn", text: `${d.id} is waiting on the customer's answer to a revised price — goes stale after 24 h.` });
    }
  });
  return out.slice(0, 6);
}

/** Today's brief — a plain-language summary, no external AI call. */
export function brief(s: Stats, notices: Notice[]): string {
  const parts: string[] = [];
  parts.push(s.today > 0 ? `${s.today} booking${s.today === 1 ? "" : "s"} today` : "No bookings yet today");
  if (s.needsDecision > 0) parts.push(`${s.needsDecision} waiting on a decision`);
  if (s.inCustody > 0) parts.push(`${s.inCustody} in custody right now`);
  if (s.paidToday > 0) parts.push(`₹${s.paidToday.toLocaleString("en-IN")} collected today`);
  const warn = notices.filter((n) => n.sev === "warn").length;
  if (warn > 0) parts.push(`${warn} item${warn === 1 ? "" : "s"} flagged below`);
  return parts.length ? `${parts.join(" · ")}.` : "Quiet so far — nothing waiting, nothing flagged.";
}

/* ============================= CRM ============================= */

export interface Customer {
  mobile: string; name: string; bookings: Booking[]; value: number; pieces: number;
  last: Booking; tier: "gold" | "silver" | "prospect";
}

/** Customers aren't a stored table — computed live by grouping bookings on
 *  the traveller's mobile, same as the static build's AI.crmCustomers. */
export function crmCustomers(all: Booking[]): Customer[] {
  const by: Record<string, Omit<Customer, "last" | "tier">> = {};
  all.forEach((d) => {
    const m = (d.traveller.mobile || "").replace(/\D/g, "");
    if (!m) return;
    const c = (by[m] = by[m] || { mobile: d.traveller.mobile, name: d.traveller.name, bookings: [], value: 0, pieces: 0 });
    c.name = d.traveller.name || c.name;
    c.bookings.push(d);
    if (d.pay) c.value += d.pay.amount;
    c.pieces += (d.bags || 0) + (d.oversize || 0);
  });
  return Object.values(by)
    .map((c) => {
      const last = c.bookings.reduce((a, d) => (d.created > a.created ? d : a), c.bookings[0]);
      const tier: Customer["tier"] = c.value >= 20000 || c.bookings.length >= 3 ? "gold" : c.value > 0 ? "silver" : "prospect";
      return { ...c, last, tier };
    })
    .sort((a, b) => b.value - a.value);
}

export interface Suggestion {
  pri: 1 | 2; kind: "lead" | "customer"; refId: string; who: string; contact: string;
  text: string; action: "convert" | "nudge" | "contact"; actionLabel: string; msg: string; followKey?: string;
}

/** One actionable suggestion per lead/customer, ranked — ported from
 *  AI.crmSuggestions. `followedKeys` is the set of CrmActivity.followKey
 *  values already logged, so a nudge isn't suggested twice. */
export function crmSuggestions(all: Booking[], inquiries: Inquiry[], followedKeys: Set<string>): Suggestion[] {
  const out: Suggestion[] = [];
  const now = Date.now();
  const hrs = (iso: string) => (now - new Date(iso).getTime()) / 3600000;

  inquiries.forEach((i) => {
    if (i.status !== "new") return;
    const h = hrs(i.created);
    const est = (i.bags || 60) * 3500 * 2;
    out.push({
      pri: h > 24 ? 1 : 2, kind: "lead", refId: i.id,
      who: `${i.contact.name} (${i.contact.role})`, contact: i.contact.mobile,
      text: `${h > 24 ? `Going cold — ${Math.round(h)} h without contact. ` : `Fresh inquiry (${Math.round(h)} h). `}` +
        `${i.venue || i.venueCity || "venue tbd"}, ~${i.families ?? "?"} families / ${i.bags ?? "?"} bags · pipeline ≈ ${inr(est)}.`,
      action: "convert", actionLabel: "Mark converted",
      msg: `Hello ${i.contact.name.split(" ")[0]}, this is Bagdrop's events desk about the ${i.venue || i.venueCity || "upcoming"} celebration. We have a door-to-room luggage plan ready for the hosts — 10 minutes on a call this week?`,
    });
  });

  crmCustomers(all).forEach((c) => {
    const d = c.last;
    const key = `cust:${c.mobile.replace(/\D/g, "")}:${d.status}`;
    if (followedKeys.has(key)) return;

    if (d.status === "delivered" && !c.bookings.some((x) => x.created > d.created)) {
      out.push({
        pri: 2, kind: "customer", refId: d.id, followKey: key, who: c.name, contact: c.mobile,
        text: `Delivered ${d.from} → ${d.to} and no return leg booked. Return-leg offers convert best within 48 h of delivery.`,
        action: "nudge", actionLabel: "Send return offer",
        msg: `Hi ${c.name.split(" ")[0]}, hope the bags reached safely! Booking the return leg today locks today's rate — want me to send the link?`,
      });
    } else if ((d.status === "quoted" || d.status === "identified") && hrs(d.created) > 2) {
      out.push({
        pri: hrs(d.created) > 20 ? 1 : 2, kind: "customer", refId: d.id, followKey: key, who: c.name, contact: c.mobile,
        text: `Quote ${d.quote.qid ?? d.id} unpaid for ${Math.round(hrs(d.created))} h — the 24 h price lock is running out.`,
        action: "nudge", actionLabel: "Send payment reminder",
        msg: `Hi ${c.name.split(" ")[0]}, your Bagdrop quote (${inr(d.quote.total)}) is locked for a few more hours — here's the payment link again: /q/${d.id}`,
      });
    } else if (d.status === "revised" && hrs(d.events[d.events.length - 1]?.at ?? d.created) > 1) {
      out.push({
        pri: 2, kind: "customer", refId: d.id, followKey: key, who: c.name, contact: c.mobile,
        text: `${d.id} has been waiting ${Math.round(hrs(d.created))} h on a revised price — a quick call usually closes it.`,
        action: "contact", actionLabel: "Log a call",
        msg: `Hi ${c.name.split(" ")[0]}, following up on the revised quote for ${d.from} → ${d.to} — happy to talk through it on a call.`,
      });
    }
  });

  return out.sort((a, b) => a.pri - b.pri);
}

export function followedKeySet(activity: CrmActivity[]): Set<string> {
  return new Set(activity.map((a) => a.followKey).filter((k): k is string => !!k));
}
