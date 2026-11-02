/** Loads the EFFECTIVE pricing masters (defaults merged with whatever the
 *  Pricing engine admin module has persisted) — server-only, used by
 *  /api/quote and /api/admin/quotes so a real customer quote reflects any
 *  rate-chart edits. Reads via the service role (same as every other
 *  /api/admin/* route) since there's no customer-facing reason for the
 *  browser to read these directly — the client preview in Wizard.tsx uses
 *  the static DEFAULT_MASTERS, which is why the signed server quote is
 *  always the figure that's actually charged. */
import { DEFAULT_MASTERS, type Masters } from "./pricing";
import { serviceClient } from "./supabaseAdmin";
import type { City, InstantAll, RouteRate, Zone } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_INSTANT, type InstantDefaults } from "./instant";
import type { Change } from "./pricingRules";

interface SettingsRow { routes?: RouteRate[]; cities?: City[]; matrix?: Record<Zone, number[]>; oversize?: number }

export async function loadMasters(): Promise<Masters> {
  const sb = serviceClient();
  if (!sb) return DEFAULT_MASTERS;
  await promoteDue(sb);

  const { data } = await sb.from("settings").select("id, doc").in("id", ["routes", "cities", "rates", "addons"]);
  const byId: Record<string, SettingsRow | undefined> = {};
  (data ?? []).forEach((r) => { byId[r.id] = r.doc as SettingsRow; });

  return {
    routes: byId.routes?.routes ?? DEFAULT_MASTERS.routes,
    cities: [...DEFAULT_MASTERS.cities, ...(byId.cities?.cities ?? [])],
    matrix: byId.rates?.matrix ?? DEFAULT_MASTERS.matrix,
    oversizeRate: byId.addons?.oversize ?? DEFAULT_MASTERS.oversizeRate,
  };
}

/* ================= versioned rate card (Pricing engine) =================
 * settings rows:
 *   routes        the LIVE chart customers are priced on, + version / published meta / instant defaults
 *   routes_draft  the working copy staff edit; nothing in it is live
 *   pricing_log   every publish / rollback with a full snapshot (for rollback) and the change list
 *   pricing_benchmarks  per-lane comparison prices (airline excess baggage, competitors) — info only
 * Every write is compare-and-swap on doc.rev, so two people can't silently
 * overwrite each other. */

export interface LiveCard { routes: RouteRate[]; version: number; publishedAt: string | null; note: string | null; by: string | null; instantDefaults: InstantDefaults; instantAll: InstantAll | null; rev: number }
/** Who prepared a change (a WhatsApp-verified mobile) and what they asked for. */
export interface Submission { by: { name: string; mobile: string }; at: string; note: string; goLiveAt: string | null; confirm: boolean; draftRev: number }
export interface DraftCard { routes: RouteRate[]; oversizeRate: number; instantAll?: InstantAll | null; baseVersion: number; updatedAt: string; rev: number; submitted?: Submission | null }
/** An approved change waiting for its go-live time (settings row routes_scheduled). */
export interface ScheduledCard { routes: RouteRate[]; oversizeRate: number; instantAll: InstantAll | null; goLiveAt: string; baseVersion: number; kind: "publish" | "rollback"; note: string; by: string; changes: Change[]; rev?: number }
export interface Approver { name: string; mobile: string }
export interface LogEntry { version: number; at: string; by: string; kind: "publish" | "rollback" | "baseline" | "cities" | "settings" | "approval"; note: string; changes: Change[]; routes?: RouteRate[]; oversizeRate?: number; instantAll?: InstantAll | null }
export interface Benchmark { label: string; amount: number }

type Row<T> = { doc: T | null; rev: number | null };
async function read<T extends { rev?: number }>(sb: SupabaseClient, id: string): Promise<Row<T>> {
  const { data } = await sb.from("settings").select("doc").eq("id", id).maybeSingle();
  const doc = (data?.doc as T | undefined) ?? null;
  return { doc, rev: doc ? (doc.rev ?? 0) : null };
}

/** Compare-and-swap write: succeeds only if the row still has `prevRev`
 *  (null = must not exist yet). */
export async function casWrite(sb: SupabaseClient, id: string, prevRev: number | null, doc: Record<string, unknown>): Promise<"ok" | "conflict" | "error"> {
  const next = { ...doc, rev: (prevRev ?? 0) + 1 };
  if (prevRev === null) {
    const { error } = await sb.from("settings").insert({ id, doc: next, status: null, created: new Date().toISOString() });
    return error ? (error.code === "23505" ? "conflict" : "error") : "ok";
  }
  let q = sb.from("settings").update({ doc: next }).eq("id", id);
  q = prevRev === 0 ? q.or("doc->>rev.is.null,doc->>rev.eq.0") : q.eq("doc->>rev", String(prevRev));
  const { data, error } = await q.select("id");
  if (error) return "error";
  return data && data.length ? "ok" : "conflict";
}

export async function loadPricingState(sb: SupabaseClient) {
  await promoteDue(sb);
  const [live, draft, log, bench, sched, appr, review] = await Promise.all([
    read<Partial<LiveCard>>(sb, "routes"),
    read<DraftCard>(sb, "routes_draft"),
    read<{ entries?: LogEntry[]; rev?: number }>(sb, "pricing_log"),
    read<{ byLane?: Record<string, Benchmark>; rev?: number }>(sb, "pricing_benchmarks"),
    read<ScheduledCard>(sb, "routes_scheduled"),
    read<{ people?: Approver[]; rev?: number }>(sb, "pricing_approvers"),
    read<{ draftRev?: number; at?: string; rev?: number }>(sb, "pricing_review"),
  ]);
  const L = live.doc ?? {};
  return {
    live: {
      routes: L.routes ?? DEFAULT_MASTERS.routes, version: L.version ?? 0, publishedAt: L.publishedAt ?? null,
      note: L.note ?? null, by: L.by ?? null, instantDefaults: { ...DEFAULT_INSTANT, ...(L.instantDefaults ?? {}) }, instantAll: L.instantAll ?? null, rev: live.rev,
    },
    scheduled: sched.doc, scheduledRev: sched.rev,
    approvers: appr.doc?.people ?? [], approversRev: appr.rev,
    /** the draft revision whose test quotes were last reviewed */
    reviewedDraftRev: review.doc?.draftRev ?? null, reviewRev: review.rev,
    draft: draft.doc, draftRev: draft.rev,
    log: log.doc?.entries ?? [], logRev: log.rev,
    benchmarks: bench.doc?.byLane ?? {}, benchRev: bench.rev,
  };
}

export async function loadInstantDefaults(): Promise<InstantDefaults> {
  return (await loadInstantConfig()).defaults;
}

/** The instant settings customers are decided on: notice/hold defaults and the master switch. */
export async function loadInstantConfig(): Promise<{ defaults: InstantDefaults; all: InstantAll | null }> {
  const sb = serviceClient();
  if (!sb) return { defaults: DEFAULT_INSTANT, all: null };
  await promoteDue(sb);
  const { data } = await sb.from("settings").select("doc").eq("id", "routes").maybeSingle();
  const doc = data?.doc as { instantDefaults?: InstantDefaults; instantAll?: InstantAll | null } | undefined;
  return { defaults: { ...DEFAULT_INSTANT, ...(doc?.instantDefaults ?? {}) }, all: doc?.instantAll ?? null };
}

/** A scheduled price change goes live the first time anything reads prices
 *  after its go-live time (quotes, bookings, the Pricing screen, the sweep).
 *  The reader that deletes (claims) the scheduled row is the only one that
 *  promotes it, so it happens exactly once even when many requests arrive
 *  together. If the live chart moved on since approval, the change is
 *  dropped and logged; if the live write loses a race, the row is put back
 *  and decided again on the next read. */
export async function promoteDue(sb: SupabaseClient, now = Date.now()): Promise<"none" | "promoted" | "dropped"> {
  const sched = await read<ScheduledCard>(sb, "routes_scheduled");
  const s = sched.doc;
  if (!s || Date.parse(s.goLiveAt) > now) return "none";
  const { data: claimed } = await sb.from("settings").delete().eq("id", "routes_scheduled").eq("doc->>goLiveAt", s.goLiveAt).select("id");
  if (!claimed?.length) return "none"; // another request is promoting it
  const live = await read<Partial<LiveCard>>(sb, "routes");
  const L = live.doc ?? {};
  const at = new Date(now).toISOString();
  if ((L.version ?? 0) !== s.baseVersion) {
    await appendLog(sb, [{ version: L.version ?? 0, at, by: "Pricing engine", kind: "settings", note: `Scheduled change for ${s.goLiveAt} was dropped: the live prices changed after it was approved.`, changes: [] }]);
    return "dropped";
  }
  const version = (L.version ?? 0) + 1;
  const w = await casWrite(sb, "routes", live.rev, {
    routes: s.routes, version, publishedAt: at, by: s.by, note: s.note, instantDefaults: L.instantDefaults ?? DEFAULT_INSTANT, instantAll: s.instantAll ?? null,
  });
  if (w !== "ok") { await sb.from("settings").insert({ id: "routes_scheduled", doc: s, status: null, created: at }); return "none"; }
  if (s.oversizeRate != null) await sb.from("settings").upsert({ id: "addons", doc: { oversize: s.oversizeRate }, status: null, created: at });
  await appendLog(sb, [{ version, at, by: s.by, kind: s.kind, note: `${s.note} (scheduled for ${s.goLiveAt})`, changes: s.changes, routes: s.routes, oversizeRate: s.oversizeRate, instantAll: s.instantAll }]);
  return "promoted";
}

/** Append to the pricing log (keeps the last 60 entries; snapshots only on
 *  the last 40 publishes to bound the row size). */
export async function appendLog(sb: SupabaseClient, entries: LogEntry[]): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const cur = await read<{ entries?: LogEntry[]; rev?: number }>(sb, "pricing_log");
    let all = [...(cur.doc?.entries ?? []), ...entries].slice(-60);
    let snaps = 0;
    all = all.reverse().map((e) => (e.routes && ++snaps > 40 ? { ...e, routes: undefined } : e)).reverse();
    const r = await casWrite(sb, "pricing_log", cur.rev, { entries: all });
    if (r === "ok") return true;
    if (r === "error") return false;
  }
  return false;
}
