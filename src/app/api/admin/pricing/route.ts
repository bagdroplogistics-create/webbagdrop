import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { appendLog, casWrite, loadMasters, loadPricingState, type LogEntry } from "@/lib/pricingSettings";
import { diffCards, engineSelfTest, laneName, validateCard, type Issue } from "@/lib/pricingRules";
import { DEFAULT_COST_MODEL, type CostModel } from "@/lib/opsModel";
import { DEFAULT_MASTERS, ZONES } from "@/lib/pricing";
import type { City, RouteRate } from "@/lib/types";

/** Pricing engine API — the ONLY way prices change.
 *
 *  GET  → live card (+ version), the open draft, the version log, cost
 *         model, benchmarks and the effective masters.
 *  POST { action }:
 *    saveDraft      { routes, oversizeRate, rev }   edit the working copy (nothing goes live)
 *    discardDraft   { rev }
 *    publish        { note, confirm }                draft → live as version N+1
 *    rollback       { version, note, confirm }       a past snapshot → live as version N+1
 *    quickAdd       { route, note, confirm }         one new route straight to live (Lead import)
 *    instantDefaults{ minNoticeDays, holdMinutes }
 *    cities         { cities }                       extra cities (validated, logged)
 *    benchmark      { lane, label, amount | null }   comparison price, info only
 *
 *  Publishing is refused when any hard rule fails, when the engine
 *  self-test fails, or when warnings haven't been confirmed. Every publish
 *  and rollback is versioned with a full snapshot and its change list. */
const BY = "BAGDROP OS admin";

async function costModelOf(sb: NonNullable<ReturnType<typeof serviceClient>>): Promise<CostModel> {
  const { data } = await sb.from("settings").select("doc").eq("id", "costmodel").maybeSingle();
  return ((data?.doc as { model?: CostModel } | undefined)?.model ?? DEFAULT_COST_MODEL);
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const [state, masters, costModel] = await Promise.all([loadPricingState(sb), loadMasters(), costModelOf(sb)]);
  return NextResponse.json({ ...state, masters, costModel, selfTest: engineSelfTest() }, { headers: { "Cache-Control": "no-store" } });
}

type Body = {
  action?: string; routes?: RouteRate[]; oversizeRate?: number; rev?: number | null; note?: string; confirm?: boolean;
  version?: number; route?: RouteRate; minNoticeDays?: number; holdMinutes?: number; cities?: City[];
  lane?: string; label?: string; amount?: number | null;
};

/** Clean a route coming from the browser: whitelisted fields, numbers coerced. */
function cleanRoute(r: RouteRate): RouteRate {
  const n = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const i = r.instant;
  return {
    from: String(r.from ?? "").trim().slice(0, 60), to: String(r.to ?? "").trim().slice(0, 60),
    dir: r.dir === "one" ? "one" : "both",
    r1: Number(r.r1), r2: Number(r.r2), addl: Number(r.addl),
    bulkMin: n(r.bulkMin), bulkRate: n(r.bulkRate),
    ...(r.note ? { note: String(r.note).slice(0, 80) } : {}),
    ...(i ? { instant: {
      enabled: !!i.enabled, minNoticeDays: n(i.minNoticeDays), from: i.from || null, to: i.to || null,
      blackout: [...new Set((i.blackout ?? []).map(String))].sort(), weekdays: i.weekdays?.length ? [...new Set(i.weekdays.map(Number))].sort() : null,
      dailyCap: n(i.dailyCap), maxBags: n(i.maxBags), allowOversize: !!i.allowOversize,
    } } : {}),
  };
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }

  const state = await loadPricingState(sb);
  const masters = await loadMasters();
  const now = new Date().toISOString();
  const stale = () => NextResponse.json({ error: "STALE", detail: "Prices were changed by someone else since you loaded this page. It has refreshed — check and try again." }, { status: 409 });

  /** Shared gate for anything that makes a new live version. */
  async function goLive(routes: RouteRate[], oversizeRate: number, kind: LogEntry["kind"], note: string): Promise<NextResponse> {
    if (note.trim().length < 3) return NextResponse.json({ error: "NEEDS_NOTE", detail: "Say what changed and why (at least a few words) — it goes in the version history." }, { status: 400 });
    const costModel = await costModelOf(sb!);
    const issues: Issue[] = validateCard({ routes, oversizeRate, cities: masters.cities, live: { routes: state.live.routes, oversizeRate: masters.oversizeRate }, costModel });
    if (issues.some((i) => i.level === "error")) return NextResponse.json({ error: "INVALID", detail: "Fix the errors before publishing.", issues }, { status: 400 });
    const selfTest = engineSelfTest();
    if (selfTest.length) return NextResponse.json({ error: "ENGINE_SELF_TEST_FAILED", detail: selfTest.join(" · ") }, { status: 500 });
    if (issues.some((i) => i.level === "warn") && !b.confirm) return NextResponse.json({ error: "NEEDS_CONFIRM", detail: "Review the warnings and confirm to publish.", issues }, { status: 409 });
    const changes = diffCards(state.live.routes, routes, masters.oversizeRate, oversizeRate);
    if (!changes.length) return NextResponse.json({ error: "NO_CHANGES", detail: "Nothing differs from the live prices." }, { status: 400 });

    const version = state.live.version + 1;
    /* first versioned publish: keep the original chart as v0 so it can be restored */
    const baseline: LogEntry[] = state.log.length ? [] : [{ version: state.live.version, at: state.live.publishedAt ?? now, by: "—", kind: "baseline", note: "Chart before version history", changes: [], routes: state.live.routes, oversizeRate: masters.oversizeRate }];
    const w = await casWrite(sb!, "routes", state.live.rev, {
      routes, version, publishedAt: now, by: BY, note: note.trim().slice(0, 300), instantDefaults: state.live.instantDefaults,
    });
    if (w === "conflict") return stale();
    if (w === "error") return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
    if (oversizeRate !== masters.oversizeRate) await sb!.from("settings").upsert({ id: "addons", doc: { oversize: oversizeRate }, status: null, created: now });
    await appendLog(sb!, [...baseline, { version, at: now, by: BY, kind, note: note.trim().slice(0, 300), changes, routes, oversizeRate }]);
    return NextResponse.json({ ok: true, version, changes });
  }

  switch (b.action) {
    case "saveDraft": {
      if (!Array.isArray(b.routes)) return NextResponse.json({ error: "MISSING_ROUTES" }, { status: 400 });
      if ((b.rev ?? null) !== state.draftRev) return stale();
      const routes = b.routes.map(cleanRoute);
      const oversizeRate = Number(b.oversizeRate ?? masters.oversizeRate);
      const w = await casWrite(sb, "routes_draft", state.draftRev, {
        routes, oversizeRate, baseVersion: state.draft?.baseVersion ?? state.live.version, updatedAt: now,
      });
      if (w !== "ok") return w === "conflict" ? stale() : NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case "discardDraft": {
      if (!state.draft) return NextResponse.json({ ok: true });
      if ((b.rev ?? null) !== state.draftRev) return stale();
      await sb.from("settings").delete().eq("id", "routes_draft");
      return NextResponse.json({ ok: true });
    }
    case "publish": {
      if (!state.draft) return NextResponse.json({ error: "NO_DRAFT" }, { status: 400 });
      if (state.draft.baseVersion !== state.live.version) {
        return NextResponse.json({ error: "DRAFT_OUTDATED", detail: `Your draft was started on version ${state.draft.baseVersion}, but version ${state.live.version} has been published since. Discard the draft and redo the change on the current prices.` }, { status: 409 });
      }
      const res = await goLive(state.draft.routes, state.draft.oversizeRate, "publish", b.note ?? "");
      if (res.status === 200) await sb.from("settings").delete().eq("id", "routes_draft");
      return res;
    }
    case "rollback": {
      const entry = state.log.find((e) => e.version === b.version && e.routes);
      if (!entry) return NextResponse.json({ error: "NO_SNAPSHOT", detail: "That version has no saved snapshot." }, { status: 404 });
      if (state.draft) return NextResponse.json({ error: "DRAFT_OPEN", detail: "Publish or discard the open draft before rolling back." }, { status: 409 });
      return goLive(entry.routes!, entry.oversizeRate ?? masters.oversizeRate, "rollback", `Rolled back to version ${entry.version}: ${b.note ?? ""}`);
    }
    case "quickAdd": {
      if (!b.route) return NextResponse.json({ error: "MISSING_ROUTE" }, { status: 400 });
      if (state.draft) return NextResponse.json({ error: "DRAFT_OPEN", detail: "A price draft is open in the Pricing engine — publish or discard it first, or add this route there." }, { status: 409 });
      const route = cleanRoute(b.route);
      return goLive([...state.live.routes, route], masters.oversizeRate, "publish", b.note || `New route ${laneName(route)} (from Lead import)`);
    }
    case "instantDefaults": {
      const d = { minNoticeDays: Math.round(Number(b.minNoticeDays)), holdMinutes: Math.round(Number(b.holdMinutes)) };
      if (!(d.minNoticeDays >= 1 && d.minNoticeDays <= 60) || !(d.holdMinutes >= 10 && d.holdMinutes <= 240)) {
        return NextResponse.json({ error: "INVALID", detail: "Notice must be 1–60 days and the payment hold 10–240 minutes." }, { status: 400 });
      }
      const w = await casWrite(sb, "routes", state.live.rev, { routes: state.live.routes, version: state.live.version, publishedAt: state.live.publishedAt, by: state.live.by, note: state.live.note, instantDefaults: d });
      if (w !== "ok") return w === "conflict" ? stale() : NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
      await appendLog(sb, [{ version: state.live.version, at: now, by: BY, kind: "settings", note: `Instant defaults: ${d.minNoticeDays} days' notice, ${d.holdMinutes}-minute payment hold (was ${state.live.instantDefaults.minNoticeDays} days, ${state.live.instantDefaults.holdMinutes} min)`, changes: [] }]);
      return NextResponse.json({ ok: true });
    }
    case "cities": {
      const list = (b.cities ?? []).map((c) => ({ name: String(c.name ?? "").trim().slice(0, 40), zone: c.zone, ap: c.ap ? String(c.ap).trim().toUpperCase().slice(0, 4) : "" }));
      const builtIn = new Set(DEFAULT_MASTERS.cities.map((c) => c.name.toLowerCase()));
      const names = new Set<string>();
      for (const c of list) {
        const k = c.name.toLowerCase();
        if (c.name.length < 2) return NextResponse.json({ error: "INVALID", detail: "Every city needs a name." }, { status: 400 });
        if (!ZONES.includes(c.zone)) return NextResponse.json({ error: "INVALID", detail: `"${c.name}" needs a valid zone.` }, { status: 400 });
        if (builtIn.has(k)) return NextResponse.json({ error: "INVALID", detail: `"${c.name}" is already a built-in city.` }, { status: 400 });
        if (names.has(k)) return NextResponse.json({ error: "INVALID", detail: `"${c.name}" is listed twice.` }, { status: 400 });
        names.add(k);
      }
      const { error } = await sb.from("settings").upsert({ id: "cities", doc: { cities: list }, status: null, created: now });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await appendLog(sb, [{ version: state.live.version, at: now, by: BY, kind: "cities", note: `Extra cities: ${list.map((c) => c.name).join(", ") || "none"}`, changes: [] }]);
      return NextResponse.json({ ok: true });
    }
    case "benchmark": {
      if (!b.lane) return NextResponse.json({ error: "MISSING_LANE" }, { status: 400 });
      const byLane = { ...state.benchmarks };
      if (b.amount == null || !(Number(b.amount) > 0)) delete byLane[b.lane];
      else byLane[b.lane] = { label: String(b.label ?? "Benchmark").slice(0, 60), amount: Math.round(Number(b.amount)) };
      const w = await casWrite(sb, "pricing_benchmarks", state.benchRev, { byLane });
      if (w !== "ok") return w === "conflict" ? stale() : NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
}
