/** Command centre intelligence — ported from the static build's shared/ai.js.
 *  Everything here computes from the live bookings list; nothing is faked.
 *  No external AI call — this is the same "local analyst" the static site
 *  falls back to when no AI endpoint is configured (which is always true
 *  here, since this app has no such endpoint). */
import { isPeak } from "./pricing";
import type { Booking } from "./types";

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
