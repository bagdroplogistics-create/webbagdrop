import { NextResponse } from "next/server";
import { can } from "@/lib/access";
import { getUser } from "@/lib/users";
import { currentActor, isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { appendLog, casWrite, loadMasters, loadPricingState, promoteDue, type Approver, type LogEntry } from "@/lib/pricingSettings";
import { diffCards, engineSelfTest, hasReturn, laneName, returnOf, testQuotes, validateCard, type Issue } from "@/lib/pricingRules";
import { DEFAULT_COST_MODEL, type CostModel } from "@/lib/opsModel";
import { DEFAULT_MASTERS, ZONES } from "@/lib/pricing";
import { checkOtpLimited, cleanMobile } from "@/lib/otp";
import { claimOnce } from "@/lib/automation";
import { istToday } from "@/lib/services";
import type { Booking, City, InstantAll, RouteRate } from "@/lib/types";

/** Pricing engine API — the ONLY way prices change.
 *
 *  GET  → live card (+ version, master instant switch), the open draft (and
 *         whether it is waiting for approval), any scheduled change, the
 *         approvers, the version log, cost model, benchmarks, masters.
 *  POST { action }:
 *    saveDraft      { routes, oversizeRate, instantAll, rev }  edit the working copy (nothing goes live)
 *    discardDraft   { rev }
 *    review         {}                                 test quotes: draft vs live for sample bookings;
 *                                                      publishing needs these reviewed for this exact draft
 *    publish        { note, confirm, goLiveAt? }       draft → live (or scheduled) — only while
 *                                                      two-person publish is off (fewer than 2 approvers)
 *    submit         { note, confirm, goLiveAt?, name, otp }  two-person: the preparer sends it for approval
 *    approve        { otp }                            two-person: a second approver (different mobile) approves
 *    withdraw       { reason }                         take a submitted draft back for editing
 *    rollback       { version, note, otp? }            a past snapshot → live as version N+1
 *    cancelSchedule { otp? }                           drop an approved change that hasn't gone live yet
 *    approvers      { people, otp? }                   who can approve (changing it needs an approver once 2+ exist)
 *    quickAdd       { route, note, confirm }           one new route straight to live (Lead import; not under two-person)
 *    instantDefaults{ minNoticeDays, holdMinutes, otp? }
 *    cities         { cities }                         extra cities (validated, logged)
 *    benchmark      { lane, label, amount | null }     comparison price, info only
 *
 *  Publishing is refused when any hard rule fails, the engine self-test
 *  fails, warnings aren't confirmed, or the test quotes weren't reviewed.
 *  With two or more approvers, every change that reaches customers needs a
 *  WhatsApp-verified second person. Every publish, rollback and schedule is
 *  versioned with a full snapshot and its change list. */

async function costModelOf(sb: NonNullable<ReturnType<typeof serviceClient>>): Promise<CostModel> {
  const { data } = await sb.from("settings").select("doc").eq("id", "costmodel").maybeSingle();
  return ((data?.doc as { model?: CostModel } | undefined)?.model ?? DEFAULT_COST_MODEL);
}

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  await promoteDue(sb); // a scheduled change whose time has come goes live before anything is read
  const [state, masters, costModel] = await Promise.all([loadPricingState(sb), loadMasters(), costModelOf(sb)]);
  return NextResponse.json({ ...state, masters, costModel, selfTest: engineSelfTest() }, { headers: { "Cache-Control": "no-store" } });
}


type Body = {
  action?: string; routes?: RouteRate[]; oversizeRate?: number; instantAll?: InstantAll | null; rev?: number | null; note?: string; confirm?: boolean;
  version?: number; route?: RouteRate; minNoticeDays?: number; holdMinutes?: number; cities?: City[];
  lane?: string; label?: string; amount?: number | null; goLiveAt?: string | null; name?: string; reason?: string;
  people?: Approver[]; otp?: { to?: string; code?: string; exp?: number; token?: string };
};

const last10 = (m: string) => m.replace(/\D/g, "").slice(-10);

/** Clean the master instant switch coming from the browser. */
function cleanAll(a: InstantAll | null | undefined): InstantAll | null {
  if (!a) return null;
  const n = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const i = a.rule ?? { enabled: true };
  return { enabled: !!a.enabled, rule: {
    enabled: true, minNoticeDays: n(i.minNoticeDays), from: i.from || null, to: i.to || null,
    blackout: [...new Set((i.blackout ?? []).map(String))].sort(), weekdays: i.weekdays?.length ? [...new Set(i.weekdays.map(Number))].sort() : null,
    dailyCap: n(i.dailyCap), maxBags: n(i.maxBags), allowOversize: !!i.allowOversize,
  } };
}

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
    ...(r.instantMode && ["default", "own", "off"].includes(r.instantMode) ? { instantMode: r.instantMode } : {}),
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

  await promoteDue(sb);
  const state = await loadPricingState(sb);
  const masters = await loadMasters();
  const now = new Date().toISOString();
  const twoPerson = state.approvers.length >= 2;
  /* who is asking: a team member signed in with their own password counts as verified (no WhatsApp code needed) */
  const me = await currentActor();
  const meUser = me && !me.owner ? await getUser(sb, me.id) : null;
  const BY = me?.name ?? "BAGDROP OS admin";
  const fail = (status: number, error: string, detail?: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...(detail ? { detail } : {}), ...extra }, { status });
  const stale = () => fail(409, "STALE", "Prices were changed by someone else since you loaded this page. It has refreshed — check and try again.");

  /** A WhatsApp code proves who is acting: returns the verified 10-digit mobile, once per code. */
  async function verifiedMobile(): Promise<string | null> {
    if (meUser) return last10(meUser.mobile);
    const o = b.otp ?? {};
    if (!o.to || !o.code || !o.exp || !o.token || !(await checkOtpLimited(o.to, String(o.code), Number(o.exp), o.token))) return null;
    if (!(await claimOnce(`otpuse:price:${o.token.slice(0, 40)}`))) return null;
    const m = cleanMobile(o.to);
    return m ? last10(m) : null;
  }
  /** An approver's WhatsApp code, when two-person publish is on. `notMobile` = the preparer, who can't approve their own change. */
  async function needApprover(what: string, notMobile?: string): Promise<{ who: Approver } | { res: NextResponse }> {
    const m = await verifiedMobile();
    if (!m) return { res: fail(401, "APPROVER_CODE_NEEDED", `${what} needs an approver's WhatsApp code.`) };
    if (meUser && !can(me?.grants, "act.approve_prices")) return { res: fail(403, "FORBIDDEN", "Your login doesn't have “Approve price changes”.") };
    const who = state.approvers.find((a) => last10(a.mobile) === m);
    if (!who) return { res: fail(403, "NOT_AN_APPROVER", "That mobile is not on the approvers list.") };
    if (notMobile && last10(notMobile) === m) return { res: fail(403, "SAME_PERSON", "The person who prepared the change can't also approve it. A second approver must approve.") };
    return { who };
  }
  const reviewed = () => state.reviewedDraftRev !== null && state.reviewedDraftRev === state.draftRev;
  const goLiveAtOf = (raw: string | null | undefined): { at: string | null } | { res: NextResponse } => {
    if (!raw) return { at: null };
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return { res: fail(400, "BAD_GO_LIVE", "The go-live time isn't a valid date and time.") };
    if (t < Date.now() + 5 * 60_000) return { res: fail(400, "BAD_GO_LIVE", "Schedule at least 5 minutes ahead, or publish now.") };
    if (t > Date.now() + 90 * 86_400_000) return { res: fail(400, "BAD_GO_LIVE", "Schedule within the next 90 days.") };
    return { at: new Date(t).toISOString() };
  };

  /** The checks every change to customer prices must pass (no write). */
  async function check(routes: RouteRate[], oversizeRate: number, instantAll: InstantAll | null, note: string, confirm: boolean) {
    if (note.trim().length < 3) return { res: fail(400, "NEEDS_NOTE", "Say what changed and why (at least a few words) — it goes in the version history.") };
    if (state.scheduled) return { res: fail(409, "SCHEDULE_PENDING", `An approved change goes live at ${state.scheduled.goLiveAt}. Cancel it first, or wait until it is live.`) };
    const costModel = await costModelOf(sb!);
    const issues: Issue[] = validateCard({ routes, oversizeRate, cities: masters.cities, live: { routes: state.live.routes, oversizeRate: masters.oversizeRate }, costModel, instantAll });
    if (issues.some((i) => i.level === "error")) return { res: fail(400, "INVALID", "Fix the errors before publishing.", { issues }) };
    const selfTest = engineSelfTest();
    if (selfTest.length) return { res: fail(500, "ENGINE_SELF_TEST_FAILED", selfTest.join(" · ")) };
    if (issues.some((i) => i.level === "warn") && !confirm) return { res: fail(409, "NEEDS_CONFIRM", "Review the warnings and confirm to publish.", { issues }) };
    const changes = diffCards(state.live.routes, routes, masters.oversizeRate, oversizeRate, state.live.instantAll, instantAll);
    if (!changes.length) return { res: fail(400, "NO_CHANGES", "Nothing differs from the live prices.") };
    return { changes };
  }

  /** Make a checked change live now, or schedule it. */
  async function goLive(routes: RouteRate[], oversizeRate: number, instantAll: InstantAll | null, kind: "publish" | "rollback", note: string, confirm: boolean, goLiveAt: string | null, by: string): Promise<NextResponse> {
    const c = await check(routes, oversizeRate, instantAll, note, confirm);
    if ("res" in c) return c.res!;
    const version = state.live.version + 1;
    /* first versioned change: keep the original chart as v0 so it can be restored */
    const baseline: LogEntry[] = state.log.some((e) => e.routes) ? [] : [{ version: state.live.version, at: state.live.publishedAt ?? now, by: "—", kind: "baseline", note: "Chart before version history", changes: [], routes: state.live.routes, oversizeRate: masters.oversizeRate, instantAll: state.live.instantAll }];
    if (goLiveAt) {
      const w = await casWrite(sb!, "routes_scheduled", state.scheduledRev, { routes, oversizeRate, instantAll, goLiveAt, baseVersion: state.live.version, kind, note: note.trim().slice(0, 300), by, changes: c.changes });
      if (w !== "ok") return w === "conflict" ? stale() : fail(500, "SAVE_FAILED");
      await appendLog(sb!, [...baseline, { version: state.live.version, at: now, by, kind: "approval", note: `Scheduled for ${goLiveAt}: ${note.trim().slice(0, 240)}`, changes: c.changes }]);
      return NextResponse.json({ ok: true, scheduled: goLiveAt, changes: c.changes });
    }
    const w = await casWrite(sb!, "routes", state.live.rev, {
      routes, version, publishedAt: now, by, note: note.trim().slice(0, 300), instantDefaults: state.live.instantDefaults, instantAll,
    });
    if (w === "conflict") return stale();
    if (w === "error") return fail(500, "SAVE_FAILED");
    if (oversizeRate !== masters.oversizeRate) await sb!.from("settings").upsert({ id: "addons", doc: { oversize: oversizeRate }, status: null, created: now });
    await appendLog(sb!, [...baseline, { version, at: now, by, kind, note: note.trim().slice(0, 300), changes: c.changes, routes, oversizeRate, instantAll }]);
    return NextResponse.json({ ok: true, version, changes: c.changes });
  }
  const draftAll = (): InstantAll | null => state.draft?.instantAll !== undefined ? state.draft.instantAll ?? null : state.live.instantAll;
  const draftCheck = () => {
    if (!state.draft) return fail(400, "NO_DRAFT");
    if (state.draft.baseVersion !== state.live.version) return fail(409, "DRAFT_OUTDATED", `Your draft was started on version ${state.draft.baseVersion}, but version ${state.live.version} has been published since. Discard the draft and redo the change on the current prices.`);
    return null;
  };

  /* finer permissions than the module's Edit box (proxy.ts already checked that) */
  if (["publish", "rollback", "cancelSchedule", "instantDefaults", "quickAdd", "approvers"].includes(b.action ?? "") && !can(me?.grants, "act.publish_prices")) {
    return fail(403, "FORBIDDEN", "Your login doesn't have “Publish prices”. Save the draft and ask someone who has it, or send it for approval.");
  }
  if (b.action === "approve" && !can(me?.grants, "act.approve_prices")) return fail(403, "FORBIDDEN", "Your login doesn't have “Approve price changes”.");
  switch (b.action) {
    case "saveDraft": {
      if (!Array.isArray(b.routes)) return fail(400, "MISSING_ROUTES");
      if ((b.rev ?? null) !== state.draftRev) return stale();
      if (state.draft?.submitted) return fail(409, "WAITING_APPROVAL", "This draft is waiting for approval. Withdraw it to make more changes.");
      const routes = b.routes.map(cleanRoute);
      const oversizeRate = Number(b.oversizeRate ?? masters.oversizeRate);
      const instantAll = b.instantAll === undefined ? draftAll() : cleanAll(b.instantAll);
      const w = await casWrite(sb, "routes_draft", state.draftRev, {
        routes, oversizeRate, instantAll, baseVersion: state.draft?.baseVersion ?? state.live.version, updatedAt: now, submitted: null,
      });
      if (w !== "ok") return w === "conflict" ? stale() : fail(500, "SAVE_FAILED");
      return NextResponse.json({ ok: true });
    }
    case "discardDraft": {
      if (!state.draft) return NextResponse.json({ ok: true });
      if ((b.rev ?? null) !== state.draftRev) return stale();
      await sb.from("settings").delete().eq("id", "routes_draft");
      if (state.draft.submitted) await appendLog(sb, [{ version: state.live.version, at: now, by: BY, kind: "approval", note: `Draft submitted by ${state.draft.submitted.by.name} was discarded.`, changes: [] }]);
      return NextResponse.json({ ok: true });
    }
    case "review": {
      if (!state.draft) return fail(400, "NO_DRAFT", "Save a draft first — test quotes compare the draft with the live prices.");
      const quotes = testQuotes({
        live: { routes: state.live.routes, oversizeRate: masters.oversizeRate, instantAll: state.live.instantAll },
        draft: { routes: state.draft.routes, oversizeRate: state.draft.oversizeRate, instantAll: draftAll() },
        defaults: state.live.instantDefaults, today: istToday(),
      });
      const w = await casWrite(sb, "pricing_review", state.reviewRev, { draftRev: state.draftRev, at: now });
      if (w === "error") return fail(500, "SAVE_FAILED");
      /* customers holding a quote keep its price until it expires — say how many */
      const since = new Date(Date.now() - 4 * 86_400_000).toISOString();
      const { data } = await sb.from("bookings").select("doc").gte("created", since).limit(1000);
      const locked = (data ?? []).map((r) => r.doc as Booking).filter((x) => x.quote?.qid && x.quote.total > 0 && x.quote.validUntil && Date.parse(x.quote.validUntil) > Date.now() && x.pay?.status !== "captured" && !["cancelled", "rejected"].includes(x.status)).length;
      return NextResponse.json({ ok: true, quotes, draftRev: state.draftRev, lockedQuotes: locked });
    }
    case "publish": {
      const bad = draftCheck(); if (bad) return bad;
      if (twoPerson) return fail(403, "TWO_PERSON_REQUIRED", "Two-person publish is on: submit the draft for approval by a second approver.");
      const g = goLiveAtOf(b.goLiveAt); if ("res" in g) return g.res!;
      const pre = await check(state.draft!.routes, state.draft!.oversizeRate, draftAll(), b.note ?? "", !!b.confirm);
      if ("res" in pre) return pre.res!;
      if (!reviewed()) return fail(409, "REVIEW_TEST_QUOTES", "Run and check the test quotes for this draft before publishing.");
      const res = await goLive(state.draft!.routes, state.draft!.oversizeRate, draftAll(), "publish", b.note ?? "", !!b.confirm, g.at, BY);
      if (res.status === 200) await sb.from("settings").delete().eq("id", "routes_draft");
      return res;
    }
    case "submit": {
      const bad = draftCheck(); if (bad) return bad;
      if (!twoPerson) return fail(400, "TWO_PERSON_OFF", "Two-person publish is off (fewer than two approvers) — publish directly.");
      if (state.draft!.submitted) return fail(409, "ALREADY_SUBMITTED", "This draft is already waiting for approval.");
      const g = goLiveAtOf(b.goLiveAt); if ("res" in g) return g.res!;
      const c = await check(state.draft!.routes, state.draft!.oversizeRate, draftAll(), b.note ?? "", !!b.confirm);
      if ("res" in c) return c.res!;
      if (!reviewed()) return fail(409, "REVIEW_TEST_QUOTES", "Run and check the test quotes for this draft before submitting it.");
      const m = await verifiedMobile();
      if (!m) return fail(401, "PREPARER_CODE_NEEDED", "Verify your mobile with the WhatsApp code to submit.");
      const name = state.approvers.find((a) => last10(a.mobile) === m)?.name ?? String(b.name ?? "").trim().slice(0, 60);
      if (name.length < 2) return fail(400, "NEEDS_NAME", "Add your name.");
      const submitted = { by: { name, mobile: m }, at: now, note: (b.note ?? "").trim().slice(0, 300), goLiveAt: g.at, confirm: !!b.confirm, draftRev: (state.draftRev ?? 0) + 1 };
      const w = await casWrite(sb, "routes_draft", state.draftRev, { ...state.draft, submitted });
      if (w !== "ok") return w === "conflict" ? stale() : fail(500, "SAVE_FAILED");
      await appendLog(sb, [{ version: state.live.version, at: now, by: name, kind: "approval", note: `Submitted for approval${g.at ? ` (go-live ${g.at})` : ""}: ${submitted.note}`, changes: c.changes }]);
      return NextResponse.json({ ok: true, submitted });
    }
    case "approve": {
      const bad = draftCheck(); if (bad) return bad;
      const sub = state.draft!.submitted;
      if (!twoPerson || !sub) return fail(400, "NOTHING_TO_APPROVE", "There is no draft waiting for approval.");
      if (!reviewed()) return fail(409, "REVIEW_TEST_QUOTES", "Check the test quotes for this draft before approving it.");
      const a = await needApprover("Approving a price change", sub.by.mobile); if ("res" in a) return a.res;
      if (sub.goLiveAt && Date.parse(sub.goLiveAt) < Date.now() + 60_000) return fail(409, "GO_LIVE_PASSED", "The requested go-live time has passed. Withdraw and resubmit with a new time (or none).");
      const res = await goLive(state.draft!.routes, state.draft!.oversizeRate, draftAll(), "publish", sub.note, sub.confirm, sub.goLiveAt, `${sub.by.name}, approved by ${a.who.name}`);
      if (res.status === 200) await sb.from("settings").delete().eq("id", "routes_draft");
      return res;
    }
    case "withdraw": {
      if (!state.draft?.submitted) return fail(400, "NOTHING_TO_WITHDRAW");
      const w = await casWrite(sb, "routes_draft", state.draftRev, { ...state.draft, submitted: null });
      if (w !== "ok") return w === "conflict" ? stale() : fail(500, "SAVE_FAILED");
      await appendLog(sb, [{ version: state.live.version, at: now, by: BY, kind: "approval", note: `Approval request by ${state.draft.submitted.by.name} withdrawn${b.reason ? `: ${String(b.reason).slice(0, 200)}` : ""}.`, changes: [] }]);
      return NextResponse.json({ ok: true });
    }
    case "rollback": {
      const entry = state.log.find((e) => e.version === b.version && e.routes);
      if (!entry) return fail(404, "NO_SNAPSHOT", "That version has no saved snapshot.");
      if (state.draft) return fail(409, "DRAFT_OPEN", "Publish or discard the open draft before rolling back.");
      let by = BY;
      if (twoPerson) { const a = await needApprover("A rollback"); if ("res" in a) return a.res; by = `Rollback approved by ${a.who.name}`; }
      return goLive(entry.routes!, entry.oversizeRate ?? masters.oversizeRate, entry.instantAll !== undefined ? entry.instantAll ?? null : state.live.instantAll, "rollback", `Rolled back to version ${entry.version}: ${b.note ?? ""}`, true, null, by);
    }
    case "cancelSchedule": {
      if (!state.scheduled) return fail(400, "NOTHING_SCHEDULED");
      let by = BY;
      if (twoPerson) { const a = await needApprover("Cancelling a scheduled change"); if ("res" in a) return a.res; by = a.who.name; }
      await sb.from("settings").delete().eq("id", "routes_scheduled");
      await appendLog(sb, [{ version: state.live.version, at: now, by, kind: "approval", note: `Scheduled change for ${state.scheduled.goLiveAt} cancelled before it went live.`, changes: [] }]);
      return NextResponse.json({ ok: true });
    }
    case "approvers": {
      const people: Approver[] = [];
      for (const p of b.people ?? []) {
        const name = String(p.name ?? "").trim().slice(0, 60), mobile = last10(String(p.mobile ?? ""));
        if (!name && !mobile) continue;
        if (name.length < 2) return fail(400, "INVALID", "Every approver needs a name.");
        if (mobile.length !== 10) return fail(400, "INVALID", `${name}: the mobile needs 10 digits.`);
        if (people.some((x) => x.mobile === mobile)) return fail(400, "INVALID", `${mobile} is listed twice.`);
        people.push({ name, mobile });
      }
      let by = BY;
      if (twoPerson) { const a = await needApprover("Changing the approvers"); if ("res" in a) return a.res; by = a.who.name; }
      const w = await casWrite(sb, "pricing_approvers", state.approversRev, { people });
      if (w !== "ok") return w === "conflict" ? stale() : fail(500, "SAVE_FAILED");
      await appendLog(sb, [{ version: state.live.version, at: now, by, kind: "settings", note: `Price approvers: ${people.map((x) => x.name).join(", ") || "none"}${people.length >= 2 ? " — two-person publish ON" : " — two-person publish off (needs 2)"}`, changes: [] }]);
      return NextResponse.json({ ok: true, twoPerson: people.length >= 2 });
    }
    case "quickAdd": {
      if (!b.route) return fail(400, "MISSING_ROUTE");
      if (twoPerson) return fail(403, "TWO_PERSON_REQUIRED", "Two-person publish is on: add this route in the Pricing engine draft and send it for approval.");
      if (state.draft) return fail(409, "DRAFT_OPEN", "A price draft is open in the Pricing engine — publish or discard it first, or add this route there.");
      const route: RouteRate = { ...cleanRoute(b.route), dir: "one" };
      const back = hasReturn(state.live.routes, route) ? [] : [returnOf(route)]; // every route is listed both ways
      return goLive([...state.live.routes, route, ...back], masters.oversizeRate, state.live.instantAll, "publish", b.note || `New route ${laneName(route)}${back.length ? ` and its return ${route.to} → ${route.from}` : ""} (from Lead import)`, !!b.confirm, null, BY);
    }
    case "instantDefaults": {
      const d = { minNoticeDays: Math.round(Number(b.minNoticeDays)), holdMinutes: Math.round(Number(b.holdMinutes)) };
      if (!(d.minNoticeDays >= 1 && d.minNoticeDays <= 60) || !(d.holdMinutes >= 10 && d.holdMinutes <= 240)) {
        return fail(400, "INVALID", "Notice must be 1–60 days and the payment hold 10–240 minutes.");
      }
      let by = BY;
      if (twoPerson) { const a = await needApprover("Changing the instant booking defaults"); if ("res" in a) return a.res; by = a.who.name; }
      const w = await casWrite(sb, "routes", state.live.rev, { routes: state.live.routes, version: state.live.version, publishedAt: state.live.publishedAt, by: state.live.by, note: state.live.note, instantDefaults: d, instantAll: state.live.instantAll });
      if (w !== "ok") return w === "conflict" ? stale() : fail(500, "SAVE_FAILED");
      await appendLog(sb, [{ version: state.live.version, at: now, by, kind: "settings", note: `Instant defaults: ${d.minNoticeDays} days' notice, ${d.holdMinutes}-minute payment hold (was ${state.live.instantDefaults.minNoticeDays} days, ${state.live.instantDefaults.holdMinutes} min)`, changes: [] }]);
      return NextResponse.json({ ok: true });
    }
    case "cities": {
      const list = (b.cities ?? []).map((c) => ({ name: String(c.name ?? "").trim().slice(0, 40), zone: c.zone, ap: c.ap ? String(c.ap).trim().toUpperCase().slice(0, 4) : "", aps: (Array.isArray(c.aps) ? c.aps : []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x)).slice(0, 4) }));
      const builtIn = new Set(DEFAULT_MASTERS.cities.map((c) => c.name.toLowerCase()));
      const names = new Set<string>();
      for (const c of list) {
        const k = c.name.toLowerCase();
        if (c.name.length < 2) return fail(400, "INVALID", "Every city needs a name.");
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
