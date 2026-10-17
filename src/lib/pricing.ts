/** Bagdrop pricing engine — pure TypeScript, runs identically on the server
 *  (app/api/quote) and in the client preview. Two layers:
 *  1. ROUTE RATE CHART (the master): 1-bag / 2-bag / each-addl / bulk rules.
 *  2. Fallback regional matrix for pairs without a chart row.
 *  No handling charges — chart figures + oversize + GST 5% only. */
import type { City, Mode, QuoteInput, QuoteResult, RouteRate, Zone } from "./types";

export const GST_RATE = 0.05; // 5% GTA transport rate — never 18%
export const MIN_PIECES = 2;
export const RATE_FLOOR = 2500;
export const OVERSIZE_RATE = 900; // per oversize piece, per the rate chart add-ons

export const ZONES: Zone[] = ["MUM", "GUJ", "NOR", "SOU", "GOA", "EAS"];

export const CITIES: City[] = [
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
  { name: "Kolkata", zone: "EAS", ap: "CCU" },
];

/** THE MASTER — official Bagdrop rate chart, effective 16-Oct-2026. */
export const ROUTES: RouteRate[] = [
  { from: "Vadodara", to: "Mumbai", dir: "both", r1: 3950, r2: 5000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
  { from: "Ahmedabad", to: "Mumbai", dir: "both", r1: 4500, r2: 6000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
  { from: "Nadiad", to: "Mumbai", dir: "both", note: "Ahmedabad rates", r1: 4500, r2: 6000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
  { from: "Anand", to: "Mumbai", dir: "both", note: "Ahmedabad rates", r1: 4500, r2: 6000, addl: 1500, bulkMin: 6, bulkRate: 1500 },
  { from: "Vadodara", to: "Delhi NCR", dir: "both", note: "Delhi Airport", r1: 6500, r2: 10500, addl: 4000, bulkMin: 4, bulkRate: 4000 },
  { from: "Ahmedabad", to: "Delhi NCR", dir: "both", r1: 7000, r2: 11000, addl: 4000, bulkMin: 4, bulkRate: 4000 },
  { from: "Mumbai", to: "North Goa", dir: "one", note: "Non-airport", r1: 3900, r2: 5900, addl: 2000, bulkMin: 6, bulkRate: 1000 },
  { from: "Mumbai", to: "Goa", dir: "one", note: "Goa Airport", r1: 4500, r2: 7000, addl: 2500 },
];

/** Fallback per-bag rate, from-zone → to-zone (ZONES order). */
export const MATRIX: Record<Zone, number[]> = {
  MUM: [2500, 2500, 4500, 3900, 3675, 6500],
  GUJ: [2500, 2500, 4900, 4500, 5250, 6500],
  NOR: [4500, 4900, 2500, 5500, 5250, 6000],
  SOU: [3900, 4500, 5500, 2750, 4200, 6500],
  GOA: [3675, 5250, 5250, 4200, 2500, 7000],
  EAS: [6500, 6500, 6000, 6500, 7000, 2750],
};

export function cityByName(n: string): City | undefined {
  return CITIES.find((c) => c.name === n);
}

const norm = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();

export function routeFor(from: string, to: string): RouteRate | undefined {
  const f = norm(from), t = norm(to);
  return ROUTES.find((r) => {
    const a = norm(r.from), b = norm(r.to);
    return (a === f && b === t) || (r.dir === "both" && a === t && b === f);
  });
}

/** Chart rules: 1 → r1 · 2 → r2 · 3+ → r2 + (n−2)·addl · n ≥ bulkMin → n·bulkRate. */
export function routeBase(r: RouteRate, bags: number): { amount: number; rule: string } {
  const n = Math.max(1, Math.floor(bags));
  if (r.bulkMin && r.bulkRate && n >= r.bulkMin) {
    return { amount: n * r.bulkRate, rule: `bulk rate · ${n} × ₹${r.bulkRate.toLocaleString("en-IN")} (min ${r.bulkMin} bags)` };
  }
  if (n === 1) return { amount: r.r1, rule: "1-bag rate" };
  if (n === 2) return { amount: r.r2, rule: "2-bag rate" };
  return { amount: r.r2 + (n - 2) * r.addl, rule: `2-bag rate + ${n - 2} × ₹${r.addl.toLocaleString("en-IN")} addl` };
}

function slabPct(pieces: number): number {
  if (pieces >= 8) return 0.15;
  if (pieces >= 5) return 0.1;
  if (pieces >= 3) return 0.05;
  return 0;
}

export function isPeak(date?: string): boolean {
  if (!date) return false;
  const d = new Date(`${date}T12:00:00`);
  const m = d.getMonth(), day = d.getDate(), wd = d.getDay();
  if ((m === 11 && day >= 15) || (m === 0 && day <= 5)) return true;
  return wd === 5 || wd === 6 || wd === 0;
}

export type QuoteOutcome = QuoteResult | { error: string };

export function quote(q: QuoteInput): QuoteOutcome {
  const bags = Math.max(0, Math.floor(q.bags));
  const odd = Math.max(0, Math.floor(q.oversize));
  const oversizeAmt = OVERSIZE_RATE * odd;

  const r = routeFor(q.fromName, q.toName);
  if (r) {
    const rb = routeBase(r, Math.max(bags, 1));
    const taxable = rb.amount + oversizeAmt;
    const gst = Math.round(taxable * GST_RATE);
    const billed = Math.max(bags, 1) + odd;
    return {
      source: "route",
      rule: rb.rule,
      routeName: `${r.from}${r.dir === "both" ? " ↔ " : " → "}${r.to}`,
      billed, base: rb.amount, oversize: oversizeAmt,
      slab: 0, peak: 0, gst, total: taxable + gst,
      perBag: Math.round((taxable + gst) / billed),
    };
  }

  const from = cityByName(q.fromName), to = cityByName(q.toName);
  if (!from || !to) return { error: "RATE_ON_REQUEST" };
  const rate = MATRIX[from.zone][ZONES.indexOf(to.zone)];
  if (!rate || rate < RATE_FLOOR) return { error: "BELOW_FLOOR" };

  const billed = Math.max(bags + odd, MIN_PIECES);
  const base = rate * (billed - odd);
  const sub = base + oversizeAmt;
  const slab = Math.round(sub * slabPct(billed));
  const peak = isPeak(q.date) ? Math.round((sub - slab) * 0.08) : 0;
  const taxable = sub - slab + peak;
  const gst = Math.round(taxable * GST_RATE);
  return {
    source: "matrix",
    rule: `regional matrix · ₹${rate.toLocaleString("en-IN")} × ${billed - odd}`,
    billed, base, oversize: oversizeAmt, slab, peak, gst,
    total: taxable + gst, perBag: Math.round((taxable + gst) / billed),
  };
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
