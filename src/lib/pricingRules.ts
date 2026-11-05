/** The pricing engine's safety net — shared by the server (which enforces
 *  it on every publish) and the Pricing engine screen (which shows it while
 *  you edit). Nothing reaches customers unless:
 *    · every route passes the hard rules (errors block publishing);
 *    · every warning has been looked at and confirmed;
 *    · the engine self-test and the per-route price checks pass.
 *  Also: the change list between live and draft, and the profitability
 *  maths (cost per booking, margin, target-margin prices). */
import { GST_RATE, quote, type Masters } from "./pricing";
import { targetCost, type CostModel } from "./opsModel";
import type { City, InstantAll, InstantRule, RouteRate, Zone } from "./types";
import { addDays, effectiveInstant, instantCheck, noticeDays, type InstantDefaults } from "./instant";

export type Issue = { level: "error" | "warn"; lane?: string; msg: string };

const norm = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();
export const laneName = (r: Pick<RouteRate, "from" | "to" | "dir">) => `${r.from}${r.dir === "both" ? " ↔ " : " → "}${r.to}`;
const key = (r: Pick<RouteRate, "from" | "to">) => `${norm(r.from)}|${norm(r.to)}`;
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const isInt = (n: unknown) => typeof n === "number" && Number.isInteger(n);
const isoDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const EMPTY_MATRIX = {} as Record<Zone, number[]>;

/** Total (incl. 5% GST) for n bags on one route — the live engine itself. */
export function priceFor(r: RouteRate, bags: number, oversize = 0, oversizeRate = 0): number {
  const q = quote({ fromName: r.from, toName: r.to, bags, oversize, mode: "road" }, { routes: [r], cities: [], matrix: EMPTY_MATRIX, oversizeRate });
  return "error" in q ? NaN : q.total;
}

/* ---------------- both directions ---------------- */
/** Every route is listed once per direction: Vadodara → Mumbai and, right
 *  under it, Mumbai → Vadodara, each with its own prices. */
export const returnOf = (r: RouteRate, note?: string): RouteRate => ({ ...r, from: r.to, to: r.from, dir: "one", ...(note !== undefined ? { note } : {}) });
export const hasReturn = (routes: RouteRate[], r: Pick<RouteRate, "from" | "to">) =>
  routes.some((x) => key(x) === key({ from: r.to, to: r.from }) || (x.dir === "both" && key(x) === key(r)));

/** Splits each two-way row into its two directions (same prices) and adds a
 *  return for every one-way route that has none, copying its prices with a
 *  note to check them. Returns sit right under their route. */
export function withReturns(routes: RouteRate[]): { routes: RouteRate[]; split: number; added: string[] } {
  const out: RouteRate[] = [], done = new Set<string>(), added: string[] = [];
  let split = 0;
  const oneWay = routes.flatMap((r) => (r.dir === "both" ? (split++, [{ ...r, dir: "one" as const }, returnOf(r)]) : [r]));
  for (const r of oneWay) {
    if (done.has(key(r))) continue;
    out.push(r); done.add(key(r));
    const back = oneWay.find((x) => key(x) === key({ from: r.to, to: r.from }));
    if (back) { if (!done.has(key(back))) { out.push(back); done.add(key(back)); } }
    else { out.push(returnOf(r, `Return of ${r.from} → ${r.to} — check the price`)); done.add(key({ from: r.to, to: r.from })); added.push(`${r.to} → ${r.from}`); }
  }
  return { routes: out, split, added };
}

/* ---------------- hard rules + warnings ---------------- */
/** The same checks for any instant rule (a route's own rule or the master default rule). */
function instantRuleIssues(i: InstantRule, err: (m: string) => void, warn: (m: string) => void) {
  if (i.minNoticeDays != null && (!isInt(i.minNoticeDays) || i.minNoticeDays < 1 || i.minNoticeDays > 60)) err("Instant: minimum notice must be 1–60 days.");
  if (i.from && !isoDate(i.from)) err("Instant: the 'from' date is not a valid date.");
  if (i.to && !isoDate(i.to)) err("Instant: the 'to' date is not a valid date.");
  if (i.from && i.to && i.from > i.to) err("Instant: the window ends before it starts.");
  if ((i.blackout ?? []).some((d) => !isoDate(d))) err("Instant: a blackout date is not a valid date.");
  if (i.weekdays && (i.weekdays.length === 0 || i.weekdays.some((w) => !isInt(w) || w < 0 || w > 6))) err("Instant: choose at least one weekday.");
  if (i.dailyCap != null && (!isInt(i.dailyCap) || i.dailyCap < 1)) err("Instant: daily capacity must be 1 or more.");
  if (i.maxBags != null && (!isInt(i.maxBags) || i.maxBags < 1)) err("Instant: maximum bags must be 1 or more.");
  if (!i.dailyCap) warn("Instant: no daily capacity set — every qualifying booking is confirmed automatically.");
}

export function validateCard(o: {
  routes: RouteRate[]; oversizeRate: number; cities: City[];
  live?: { routes: RouteRate[]; oversizeRate: number }; costModel?: CostModel;
  instantAll?: InstantAll | null;
}): Issue[] {
  const out: Issue[] = [];
  if (o.instantAll?.enabled) {
    instantRuleIssues(o.instantAll.rule ?? { enabled: true }, (msg) => out.push({ level: "error", lane: "Instant booking (all routes)", msg }), (msg) => out.push({ level: "warn", lane: "Instant booking (all routes)", msg }));
  }
  const cityNames = new Set(o.cities.map((c) => norm(c.name)));
  const liveByKey = new Map((o.live?.routes ?? []).map((r) => [key(r), r]));
  const seen = new Map<string, string>();

  if (!isInt(o.oversizeRate) || o.oversizeRate < 0) out.push({ level: "error", msg: "Oversize add-on must be a whole rupee amount, 0 or more." });
  if (o.live && o.live.oversizeRate > 0 && Math.abs(o.oversizeRate - o.live.oversizeRate) / o.live.oversizeRate > 0.25) {
    out.push({ level: "warn", msg: `Oversize add-on changes by more than 25% (${inr(o.live.oversizeRate)} → ${inr(o.oversizeRate)}).` });
  }

  for (const r of o.routes) {
    const lane = laneName(r);
    const err = (msg: string) => out.push({ level: "error", lane, msg });
    const warn = (msg: string) => out.push({ level: "warn", lane, msg });
    if (!r.from?.trim() || !r.to?.trim()) { err("From and To are both required."); continue; }
    if (norm(r.from) === norm(r.to)) err("From and To are the same city.");
    const live = liveByKey.get(key(r)) ?? (r.dir === "both" ? liveByKey.get(key({ from: r.to, to: r.from })) : undefined);
    const changed = !live || JSON.stringify(live) !== JSON.stringify(r);
    for (const c of [r.from, r.to]) {
      if (!cityNames.has(norm(c))) (changed ? err : warn)(`"${c}" isn't in the city list — customers can't select it. Add it under Cities first.`);
    }

    /* duplicates, including the reverse of a two-way route */
    for (const k of [key(r), ...(r.dir === "both" ? [key({ from: r.to, to: r.from })] : [])]) {
      if (seen.has(k)) err(`Duplicates ${seen.get(k)} — one route per lane.`);
    }
    seen.set(key(r), lane);
    if (r.dir === "both") seen.set(key({ from: r.to, to: r.from }), lane);

    /* prices */
    for (const [f, v] of [["1-bag", r.r1], ["2-bag", r.r2], ["extra-bag", r.addl]] as const) {
      if (!isInt(v) || v <= 0) err(`${f} price must be a whole rupee amount above 0.`);
    }
    if (isInt(r.r1) && r.r1 > 0 && r.r1 < 500) err(`1-bag price ${inr(r.r1)} looks like a typo (under ₹500).`);
    if (r.r2 < r.r1) err(`2 bags (${inr(r.r2)}) can't cost less than 1 bag (${inr(r.r1)}).`);
    if (r.r2 > 2 * r.r1) warn(`2 bags (${inr(r.r2)}) cost more than two single bags (${inr(2 * r.r1)}).`);
    if (r.addl > r.r1) warn(`An extra bag (${inr(r.addl)}) costs more than the first bag (${inr(r.r1)}).`);
    const hasMin = r.bulkMin != null, hasRate = r.bulkRate != null;
    if (hasMin !== hasRate) err("Bulk needs both a minimum bag count and a bulk rate (or neither).");
    if (hasMin && (!isInt(r.bulkMin) || r.bulkMin! < 3)) err("Bulk minimum must be 3 bags or more.");
    if (hasRate && (!isInt(r.bulkRate) || r.bulkRate! <= 0)) err("Bulk rate must be a whole rupee amount above 0.");
    if (hasRate && r.bulkRate! > r.r1) err(`Bulk rate per bag (${inr(r.bulkRate!)}) is above the 1-bag price.`);

    /* the price must never drop when a bag is added */
    if (!out.some((i) => i.level === "error" && i.lane === lane)) {
      let prev = priceFor(r, 1);
      for (let n = 2; n <= 12; n++) {
        const t = priceFor(r, n);
        if (t < prev) { warn(`${n} bags (${inr(t)}) cost less than ${n - 1} bags (${inr(prev)}) — the bulk rate kicks in below the running price.`); break; }
        prev = t;
      }
    }

    /* big moves against the live price */
    if (live) {
      for (const [f, a, b] of [["1-bag", live.r1, r.r1], ["2-bag", live.r2, r.r2], ["extra-bag", live.addl, r.addl]] as const) {
        if (a > 0 && Math.abs(b - a) / a > 0.25) warn(`${f} price moves ${b > a ? "up" : "down"} more than 25% (${inr(a)} → ${inr(b)}).`);
      }
    }

    /* profitability */
    if (o.costModel) {
      const target = o.costModel.marginFloorPct;
      const m1 = marginAt(r, 1, o.costModel), m2 = marginAt(r, 2, o.costModel);
      if (m1 < target) warn(`1-bag margin ${m1}% is below the ${target}% target (cost ${inr(laneCost(o.costModel, r, 1))}).`);
      if (m2 < target) warn(`2-bag margin ${m2}% is below the ${target}% target.`);
    }

    /* instant booking settings: the route's own rule is checked when it is the one in force */
    const own = o.instantAll ? r.instantMode === "own" : !!r.instant?.enabled;
    if (r.instantMode && !["default", "own", "off"].includes(r.instantMode)) err("Instant: choose default, own rule or off.");
    if (own) {
      if (!r.instant) err("Instant: this route is set to its own rule but has none — set the rule or choose the default.");
      else instantRuleIssues(r.instant, err, warn);
    }

    /* every route is listed both ways */
    if (r.dir !== "both" && r.from?.trim() && r.to?.trim() && !hasReturn(o.routes, r)) err(`No return route — add ${r.to} → ${r.from} (Add the return routes does it).`);
  }
  return out;
}

/* ---------------- engine self-test: the price formula itself ---------------- */
export function engineSelfTest(): string[] {
  const fail: string[] = [];
  const t: RouteRate = { from: "Test A", to: "Test B", dir: "both", r1: 1000, r2: 1800, addl: 500, bulkMin: 6, bulkRate: 450 };
  const one: RouteRate = { ...t, from: "Test C", to: "Test D", dir: "one", bulkMin: null, bulkRate: null };
  const m: Masters = { routes: [t, one], cities: [], matrix: EMPTY_MATRIX, oversizeRate: 999 };
  const total = (from: string, to: string, bags: number, oversize = 0) => {
    const q = quote({ fromName: from, toName: to, bags, oversize, mode: "road" }, m);
    return "error" in q ? q.error : q.total;
  };
  const expect = (label: string, got: unknown, want: unknown) => { if (got !== want) fail.push(`${label}: expected ${want}, got ${got}`); };
  expect("1 bag", total("Test A", "Test B", 1), 1050);
  expect("2 bags", total("Test A", "Test B", 2), 1890);
  expect("4 bags = 2-bag + 2 extra", total("Test A", "Test B", 4), 2940);
  expect("6 bags = bulk", total("Test A", "Test B", 6), 2835);
  expect("oversize add-on + GST", total("Test A", "Test B", 1, 1), 2099);
  expect("two-way route reversed", total("Test B", "Test A", 2), 1890);
  expect("one-way route reversed", total("Test D", "Test C", 1), "RATE_ON_REQUEST");
  expect("off-chart lane", total("Test A", "Test D", 1), "RATE_ON_REQUEST");
  expect("GST rate", GST_RATE, 0.05);
  return fail;
}

/* ---------------- change list ---------------- */
export type Change = { kind: "added" | "removed" | "changed"; lane: string; fields: { field: string; from: string; to: string }[] };
const FIELDS: [keyof RouteRate, string][] = [["dir", "direction"], ["r1", "1 bag"], ["r2", "2 bags"], ["addl", "extra bag"], ["bulkMin", "bulk from"], ["bulkRate", "bulk rate"], ["note", "note"]];
const show = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "number" ? inr(v) : String(v));
const ruleText = (i: InstantRule | null | undefined) => !i ? "off" : [`on · ${i.minNoticeDays ?? "default"}d notice`, i.from || i.to ? `${i.from ?? "…"}–${i.to ?? "…"}` : "", i.dailyCap ? `${i.dailyCap}/day` : "", i.maxBags ? `≤${i.maxBags} bags` : "", i.allowOversize ? "oversize ok" : "", i.blackout?.length ? `${i.blackout.length} blackout` : "", i.weekdays?.length ? `${i.weekdays.length} weekdays` : ""].filter(Boolean).join(" · ");
const modeText = (r: RouteRate) => r.instantMode === "default" ? "ON (standard rule)" : r.instantMode === "own" ? `ON, own limits: ${ruleText(r.instant ? { ...r.instant, enabled: true } : null)}` : "OFF (team approval)";
const allText = (a: InstantAll | null | undefined) => !a ? "per-route (no master switch)" : !a.enabled ? "OFF — every booking needs team approval" : `ON · default ${ruleText({ ...a.rule, enabled: true })}`;
const instantText = (r: RouteRate) => {
  const i = r.instant;
  if (!i?.enabled) return "off";
  return [`on · ${i.minNoticeDays ?? "default"}d notice`, i.from || i.to ? `${i.from ?? "…"}–${i.to ?? "…"}` : "", i.dailyCap ? `${i.dailyCap}/day` : "", i.maxBags ? `≤${i.maxBags} bags` : "", i.blackout?.length ? `${i.blackout.length} blackout` : "", i.weekdays?.length ? `${i.weekdays.length} weekdays` : ""].filter(Boolean).join(" · ");
};

export function diffCards(live: RouteRate[], draft: RouteRate[], liveOversize?: number, draftOversize?: number, liveAll?: InstantAll | null, draftAll?: InstantAll | null): Change[] {
  const out: Change[] = [];
  if (draftAll !== undefined && JSON.stringify(liveAll ?? null) !== JSON.stringify(draftAll ?? null)) {
    out.push({ kind: "changed", lane: "Instant booking (all routes)", fields: [{ field: "master switch", from: allText(liveAll), to: allText(draftAll) }] });
  }
  /* direction by direction: a two-way row prices both directions, so splitting it
   * into one row per direction is a listing change, not a new price */
  type Dir = RouteRate & { both?: boolean };
  const expand = (rs: RouteRate[]): Dir[] => rs.flatMap((r) => (r.dir === "both" ? [{ ...r, dir: "one" as const, both: true }, { ...returnOf(r), both: true }] : [r]));
  const L = new Map(expand(live).map((r) => [key(r), r])), D = new Map(expand(draft).map((r) => [key(r), r]));
  const listed = new Set<string>();
  for (const [k, d] of D) {
    const l = L.get(k);
    if (!l) { out.push({ kind: "added", lane: laneName(d), fields: [{ field: "prices", from: "—", to: `${inr(d.r1)} / ${inr(d.r2)} / +${inr(d.addl)}` }, ...(d.instant?.enabled ? [{ field: "instant", from: "—", to: instantText(d) }] : [])] }); continue; }
    const fields = FIELDS.filter(([f]) => f !== "dir" && (l[f] ?? null) !== (d[f] ?? null)).map(([f, label]) => ({ field: label, from: show(l[f]), to: show(d[f]) }));
    if (draftAll) {
      if ((l.instantMode ?? "off") !== (d.instantMode ?? "off") || (d.instantMode === "own" && JSON.stringify(l.instant ?? null) !== JSON.stringify(d.instant ?? null))) fields.push({ field: "instant", from: modeText(l), to: modeText(d) });
    } else if (JSON.stringify(l.instant ?? null) !== JSON.stringify(d.instant ?? null)) fields.push({ field: "instant", from: instantText(l), to: instantText(d) });
    if (fields.length) out.push({ kind: "changed", lane: laneName(d), fields });
    else if (l.both && !d.both) {
      const pair = [norm(l.from), norm(l.to)].sort().join("|");
      if (!listed.has(pair)) { listed.add(pair); out.push({ kind: "changed", lane: `${l.from} ↔ ${l.to}`, fields: [{ field: "listing", from: "one two-way row", to: "a row for each direction (same prices)" }] }); }
    }
  }
  for (const [k, l] of L) if (!D.has(k)) out.push({ kind: "removed", lane: laneName(l), fields: [] });
  if (liveOversize != null && draftOversize != null && liveOversize !== draftOversize) out.push({ kind: "changed", lane: "Oversize add-on", fields: [{ field: "per piece", from: inr(liveOversize), to: inr(draftOversize) }] });
  return out;
}

/* ---------------- profitability ---------------- */
export const DEFAULT_PER_BAG_COST = 250;
const ceil50 = (n: number) => Math.ceil(n / 50) * 50;
export const exGst = (n: number) => n / (1 + GST_RATE);

/** Standard cost of one booking of n bags on this route (Operations → Cost model). */
export function laneCost(model: CostModel, r: Pick<RouteRate, "from" | "to" | "dir">, bags: number): number {
  const fwd = `${r.from} → ${r.to}`, rev = `${r.to} → ${r.from}`;
  const lane = model.lanes[fwd] || r.dir !== "both" ? fwd : model.lanes[rev] ? rev : fwd;
  const perBag = model.defaults.perBag ?? DEFAULT_PER_BAG_COST;
  return targetCost(model, lane).total + perBag * Math.max(0, bags - 1);
}

/** Gross margin % (on the price before GST) for n bags. */
export function marginAt(r: RouteRate, bags: number, model: CostModel): number {
  const p = exGst(priceFor(r, bags));
  return p > 0 ? Math.round(((p - laneCost(model, r, bags)) / p) * 100) : 0;
}

/** Lowest CHART RATES (before GST — the engine adds 5% GST on top, exactly
 *  like the r1/r2/addl fields) that hit the target margin, rounded up to ₹50. */
export function targetPrices(r: Pick<RouteRate, "from" | "to" | "dir">, model: CostModel, marginPct = model.marginFloorPct): { r1: number; r2: number; addl: number } {
  const k = 1 - marginPct / 100;
  const at = (cost: number) => ceil50(cost / k);
  const perBag = model.defaults.perBag ?? DEFAULT_PER_BAG_COST;
  return { r1: at(laneCost(model, r, 1)), r2: at(laneCost(model, r, 2)), addl: at(perBag) };
}

/* ---------------- test quotes: what customers will actually pay ---------------- */
export interface TestQuote {
  lane: string; bags: number; oversize: number;
  live: number | null; draft: number | null;            // totals incl. GST; null = rate on request
  liveInstant: boolean; draftInstant: boolean;           // for a pickup just past the notice period, nobody else booked
}
const SAMPLES: [number, number][] = [[1, 0], [2, 0], [3, 0], [5, 0], [2, 1]];

/** Prices every route on both charts for sample bookings, with the instant
 *  decision for a date just past the notice period. Publishing requires
 *  these to have been reviewed for the exact draft being published. */
export function testQuotes(o: {
  live: { routes: RouteRate[]; oversizeRate: number; instantAll: InstantAll | null };
  draft: { routes: RouteRate[]; oversizeRate: number; instantAll: InstantAll | null };
  defaults: InstantDefaults; today: string;
}): TestQuote[] {
  /* compare direction by direction: a two-way row prices both directions, so it is
   * expanded first — otherwise splitting it would look like a new lane being priced */
  const oneWay = (rs: RouteRate[]) => rs.flatMap((r) => (r.dir === "both" ? [{ ...r, dir: "one" as const }, returnOf(r)] : [r]));
  const lanes = new Map<string, { l?: RouteRate; d?: RouteRate }>();
  for (const r of oneWay(o.live.routes)) if (!lanes.has(key(r))) lanes.set(key(r), { l: r });
  for (const r of oneWay(o.draft.routes)) { const cur = lanes.get(key(r)) ?? {}; if (!cur.d) lanes.set(key(r), { ...cur, d: r }); }
  const out: TestQuote[] = [];
  const instantFor = (r: RouteRate | undefined, all: InstantAll | null, bags: number, oversize: number) => {
    const rule = effectiveInstant(r, all);
    if (!r || !rule) return false;
    const date = addDays(o.today, noticeDays(rule, o.defaults) + 1);
    return instantCheck(r, { date, bags, oversize }, o.today, o.defaults, 0, all).ok;
  };
  for (const { l, d } of lanes.values()) {
    const lane = laneName((d ?? l)!);
    for (const [bags, oversize] of SAMPLES) {
      const lp = l ? priceFor(l, bags, oversize, o.live.oversizeRate) : NaN, dp = d ? priceFor(d, bags, oversize, o.draft.oversizeRate) : NaN;
      out.push({
        lane, bags, oversize,
        live: Number.isFinite(lp) ? lp : null, draft: Number.isFinite(dp) ? dp : null,
        liveInstant: instantFor(l, o.live.instantAll, bags, oversize), draftInstant: instantFor(d, o.draft.instantAll, bags, oversize),
      });
    }
  }
  return out;
}
