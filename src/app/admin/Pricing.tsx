"use client";
/** BAGDROP OS · Pricing engine — the heart of every price the business
 *  quotes. Nothing here changes a customer's price until it is published:
 *    edit (draft) → checks + preview → publish with a note → version N+1
 *  Every publish is validated server-side (hard rules, warnings to confirm,
 *  engine self-test), versioned with a full snapshot and can be rolled back.
 *  Also: instant-booking setup per route (with a calendar preview), the
 *  profitability view (cost, margin, target-margin prices, actuals,
 *  benchmarks), routes to add from inquiries, and a new-route wizard. */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLoad } from "@/lib/useLoad";
import { useNow } from "@/lib/useNow";
import { useSyncedState } from "@/lib/stateSync";
import { DEFAULT_MASTERS, ZONES, inr, quote, type Masters } from "@/lib/pricing";
import { getPricing, pricingAction, saveCostModel, type ApiResult, type PricingState } from "@/lib/pricingApi";
import { diffCards, exGst, laneCost, laneName, marginAt, priceFor, targetPrices, validateCard, type Issue } from "@/lib/pricingRules";
import { instantCalendar, instantTaken, onRoute, WEEKDAYS, type CalendarState } from "@/lib/instant";
import { actualCost, opsOf, type CostModel } from "@/lib/opsModel";
import { isPaid } from "@/lib/payState";
import { watchAdminBookings } from "@/lib/adminApi";
import type { Booking, City, InstantRule, Mode, RouteRate, Zone } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const EMPTY_ROUTE: RouteRate = { from: "", to: "", dir: "both", r1: 0, r2: 0, addl: 0, bulkMin: null, bulkRate: null, note: "" };
const DAY = 86_400_000;
const istDay = (t: number) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const tone = (m: number, target: number): "ok" | "warn" | "bad" => (m >= target ? "ok" : m >= target - 10 ? "warn" : "bad");

export default function Pricing() {
  const [data, setData] = useState<PricingState | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { setData(await getPricing()); setErr(""); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useLoad(load);
  const [bookings, setBookings] = useState<Booking[]>([]);
  useEffect(() => watchAdminBookings(setBookings, () => {}), []);
  const now = useNow();

  if (err) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{err}</p>;
  if (!data || !now) return <p className="text-sm text-muted">Loading the pricing engine…</p>;
  return <Engine data={data} bookings={bookings} now={now} reload={load} />;
}

/* ============================== the engine ============================== */
function Engine({ data, bookings, now, reload }: { data: PricingState; bookings: Booking[]; now: number; reload: () => Promise<void> }) {
  const { live, draft, masters, costModel } = data;
  const base = draft ? { routes: draft.routes, oversizeRate: draft.oversizeRate } : { routes: live.routes, oversizeRate: masters.oversizeRate };
  const [work, setWork] = useSyncedState(base.routes);
  const [oversize, setOversize] = useSyncedState(base.oversizeRate);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openInstant, setOpenInstant] = useState<number | null>(null);
  const [wizard, setWizard] = useState<Partial<RouteRate> | null>(null);
  const today = istDay(now);

  const dirty = JSON.stringify(work) !== JSON.stringify(base.routes) || oversize !== base.oversizeRate;
  const issues = useMemo(() => validateCard({ routes: work, oversizeRate: oversize, cities: masters.cities, live: { routes: live.routes, oversizeRate: masters.oversizeRate }, costModel }), [work, oversize, masters, live.routes, costModel]);
  const changes = useMemo(() => diffCards(live.routes, work, masters.oversizeRate, oversize), [live.routes, work, masters.oversizeRate, oversize]);
  const errors = issues.filter((i) => i.level === "error"), warnings = issues.filter((i) => i.level === "warn");

  async function run(fn: () => Promise<ApiResult>, okText: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: okText }); await reload(); return true; }
    setMsg({ ok: false, text: `${r.detail ?? r.error ?? "Failed"}${r.issues?.length ? " — " + r.issues.filter((i) => i.level === "error").map((i) => `${i.lane ? i.lane + ": " : ""}${i.msg}`).join(" · ") : ""}` });
    if (r.error === "STALE") await reload();
    return false;
  }
  const saveDraft = () => run(() => pricingAction("saveDraft", { routes: work, oversizeRate: oversize, rev: data.draftRev }), "Draft saved — nothing is live until you publish.");
  const set = (i: number, patch: Partial<RouteRate>) => setWork((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-5">
      {/* ---------- status ---------- */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold">Live prices · version {live.version}</h3>
            <p className="text-xs text-muted">{live.publishedAt ? `Published ${fmt(live.publishedAt)}${live.note ? ` — “${live.note}”` : ""}` : "Original chart (no version history yet)"} · {live.routes.length} routes</p>
            <p className="mt-1 text-xs">
              {data.selfTest.length ? <Badge tone="bad">Engine self-test FAILED: {data.selfTest.join(" · ")}</Badge> : <Badge tone="ok">Engine self-test passed</Badge>}{" "}
              {draft ? <Badge tone="warn">Draft open since {fmt(draft.updatedAt)} · {changes.length} change{changes.length === 1 ? "" : "s"} · not live</Badge> : <Badge tone="muted">No draft — edits below start one</Badge>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !dirty} onClick={() => void saveDraft()}>{dirty ? "Save draft" : "Draft saved"}</Button>
            {draft && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm("Discard the draft? Unpublished changes are lost.")) void run(() => pricingAction("discardDraft", { rev: data.draftRev }), "Draft discarded."); }}>Discard draft</Button>}
            <Button size="sm" variant="outline" onClick={() => setWizard({})}>+ New route</Button>
          </div>
        </div>
        {msg && <p className={`mt-3 rounded-xl p-2.5 text-xs ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      </Card>

      {wizard && <NewRouteWizard seed={wizard} masters={masters} costModel={costModel} onCancel={() => setWizard(null)}
        onAdd={(r, model) => { setWork((p) => [...p, r]); setWizard(null); if (model) void saveCostModel(model).then(reload); setMsg({ ok: true, text: `${laneName(r)} added to the draft — review and publish to make it live.` }); }} />}

      {/* ---------- route chart (draft) ---------- */}
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">Route rate chart <span className="font-normal text-faint">rates before GST (customers pay +5%) · the only prices anyone can book at — every off-chart lane is “rate on request”</span></h3>
          <span className="text-xs text-muted">Target margin {costModel.marginFloorPct}% · margins are on the price before GST</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                <th className="py-1.5 pr-2">From</th><th className="pr-2">To</th><th className="pr-2">Dir</th><th className="pr-2">1 bag</th><th className="pr-2">2 bags</th><th className="pr-2">+ bag</th>
                <th className="pr-2">Bulk from</th><th className="pr-2">Bulk ₹/bag</th><th className="pr-2">Margin 1 · 2</th><th className="pr-2">Instant</th><th className="pr-2">Note</th><th />
              </tr>
            </thead>
            <tbody>
              {work.map((r, i) => {
                const lane = laneName(r);
                const rowIssues = issues.filter((x) => x.lane === lane);
                const m1 = marginAt(r, 1, costModel), m2 = marginAt(r, 2, costModel);
                return (
                  <Fragment key={i}>
                    <tr className={`border-b border-dashed border-line align-top last:border-0 ${rowIssues.some((x) => x.level === "error") ? "bg-red-50/60" : ""}`}>
                      <td className="py-1 pr-2"><CitySelect cities={masters.cities} value={r.from} onChange={(v) => set(i, { from: v })} /></td>
                      <td className="pr-2"><CitySelect cities={masters.cities} value={r.to} onChange={(v) => set(i, { to: v })} /></td>
                      <td className="pr-2"><Select className="w-20" value={r.dir} onChange={(e) => set(i, { dir: e.target.value as RouteRate["dir"] })}><option value="both">both</option><option value="one">one</option></Select></td>
                      <td className="pr-2"><Num value={r.r1} onChange={(v) => set(i, { r1: v ?? 0 })} /></td>
                      <td className="pr-2"><Num value={r.r2} onChange={(v) => set(i, { r2: v ?? 0 })} /></td>
                      <td className="pr-2"><Num value={r.addl} onChange={(v) => set(i, { addl: v ?? 0 })} /></td>
                      <td className="pr-2"><Num w="w-16" value={r.bulkMin ?? null} onChange={(v) => set(i, { bulkMin: v })} /></td>
                      <td className="pr-2"><Num value={r.bulkRate ?? null} onChange={(v) => set(i, { bulkRate: v })} /></td>
                      <td className="whitespace-nowrap pr-2 pt-2"><Badge tone={tone(m1, costModel.marginFloorPct)}>{m1}%</Badge> <Badge tone={tone(m2, costModel.marginFloorPct)}>{m2}%</Badge></td>
                      <td className="pr-2 pt-1"><Button size="sm" variant={r.instant?.enabled ? "outline" : "ghost"} onClick={() => setOpenInstant(openInstant === i ? null : i)}>{r.instant?.enabled ? "⚡ on" : "off"}</Button></td>
                      <td className="pr-2"><Input className="w-28" value={r.note ?? ""} onChange={(e) => set(i, { note: e.target.value })} /></td>
                      <td className="pt-2"><button className="text-red-700 hover:underline" onClick={() => { if (confirm(`Remove ${lane} from the draft?`)) setWork((p) => p.filter((_, idx) => idx !== i)); }}>remove</button></td>
                    </tr>
                    {/* "both" routes price identically either way (see pricingRules.ts/
                     * pricing.ts dir==="both" matching) — this mirror row is display-only
                     * so admins can see the reverse direction listed explicitly, same as
                     * customers can already book it either way. Editing the row above
                     * (incl. flipping it to "one") updates this mirror automatically. */}
                    {r.dir === "both" && r.from && r.to && (
                      <tr className="border-b border-dashed border-line align-top last:border-0 bg-paper/50 text-faint">
                        <td className="py-1 pr-2">{r.to}</td>
                        <td className="pr-2">{r.from}</td>
                        <td className="pr-2 italic">↔ same route</td>
                        <td className="pr-2">{r.r1}</td>
                        <td className="pr-2">{r.r2}</td>
                        <td className="pr-2">{r.addl}</td>
                        <td className="pr-2">{r.bulkMin ?? "—"}</td>
                        <td className="pr-2">{r.bulkRate ?? "—"}</td>
                        <td className="whitespace-nowrap pr-2"><Badge tone={tone(m1, costModel.marginFloorPct)}>{m1}%</Badge> <Badge tone={tone(m2, costModel.marginFloorPct)}>{m2}%</Badge></td>
                        <td className="pr-2">{r.instant?.enabled ? "⚡ on" : "off"}</td>
                        <td className="pr-2 italic">reverse of above</td>
                        <td />
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs">Oversize add-on (per piece) <Num value={oversize} onChange={(v) => setOversize(v ?? 0)} /></label>
        <IssueList issues={issues} />
      </Card>

      {openInstant != null && work[openInstant] && (
        <InstantEditor key={openInstant} route={work[openInstant]} today={today} now={now} bookings={bookings} defaults={live.instantDefaults}
          onChange={(rule) => set(openInstant, { instant: rule })} onClose={() => setOpenInstant(null)} />
      )}

      {/* ---------- review & publish ---------- */}
      {changes.length > 0 && (
        <ReviewPublish changes={changes} errors={errors} warnings={warnings} live={live.routes} work={work} costModel={costModel} busy={busy} dirty={dirty}
          onPublish={async (note, ok) => { if (dirty && !(await saveDraft())) return; await run(() => pricingAction("publish", { note, confirm: ok }), "Published — the new prices are live for every new quote."); }} />
      )}

      <InstantDefaultsCard defaults={live.instantDefaults} onSave={(d) => void run(() => pricingAction("instantDefaults", d), "Instant booking defaults saved.")} />

      <Profitability routes={live.routes} bookings={bookings} costModel={costModel} benchmarks={data.benchmarks} now={now} reload={reload}
        onUseTarget={(lane, t) => { setWork((p) => p.map((r) => (laneName(r) === lane ? { ...r, r1: Math.max(r.r1, t.r1), r2: Math.max(r.r2, t.r2), addl: Math.max(r.addl, t.addl) } : r))); setMsg({ ok: true, text: `Target-margin prices put into the draft for ${lane} — review and publish.` }); }} />

      <RoutesToAdd routes={work} bookings={bookings} costModel={costModel} now={now} onAdd={(seed) => setWizard(seed)} />

      <VersionHistory log={data.log} liveVersion={live.version} busy={busy} hasDraft={!!draft}
        onRollback={(v, note) => void run(() => pricingAction("rollback", { version: v, note, confirm: true }), `Rolled back — version ${v}'s prices are live again as a new version.`)} />

      <div className="grid gap-5 lg:grid-cols-2">
        <QuoteSimulator live={{ ...masters, routes: live.routes }} draft={changes.length ? { ...masters, routes: work, oversizeRate: oversize } : null} />
        <CitiesEditor extraCities={masters.cities.slice(DEFAULT_MASTERS.cities.length)} onSave={(c) => void run(() => pricingAction("cities", { cities: c }), "Cities saved.")} />
      </div>
      <p className="text-xs text-faint">The old regional zone matrix is retired: a lane that isn&apos;t on the chart above is “rate on request” everywhere — website, partner desk, team quotes and imports.</p>
    </div>
  );
}

/* ============================== small inputs ============================== */
function Num({ value, onChange, w = "w-20" }: { value: number | null; onChange: (v: number | null) => void; w?: string }) {
  return <Input className={w} type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
}
function CitySelect({ cities, value, onChange }: { cities: City[]; value: string; onChange: (v: string) => void }) {
  const names = [...new Set(cities.map((c) => c.name))];
  return (
    <Select className="w-32" value={value} onChange={(e) => onChange(e.target.value)}>
      {!names.includes(value) && <option value={value}>{value || "— choose —"}{value ? " (not in city list)" : ""}</option>}
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
    </Select>
  );
}
function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <p className="mt-3 rounded-xl bg-green-50 p-2.5 text-xs text-green-900">✓ Every route passes the checks.</p>;
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {issues.map((i, k) => (
        <li key={k} className={`rounded-lg px-2.5 py-1.5 ${i.level === "error" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
          <b>{i.level === "error" ? "Error" : "Check"}</b>{i.lane ? ` · ${i.lane}` : ""} — {i.msg}
        </li>
      ))}
    </ul>
  );
}

/* ============================== review & publish ============================== */
function ReviewPublish({ changes, errors, warnings, live, work, costModel, busy, dirty, onPublish }: {
  changes: ReturnType<typeof diffCards>; errors: Issue[]; warnings: Issue[]; live: RouteRate[]; work: RouteRate[]; costModel: CostModel; busy: boolean; dirty: boolean;
  onPublish: (note: string, confirmWarnings: boolean) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [ok, setOk] = useState(false);
  const preview = changes.filter((c) => c.kind !== "removed").map((c) => ({ c, now: work.find((r) => laneName(r) === c.lane), was: live.find((r) => laneName(r) === c.lane) })).filter((x) => x.now);
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Review &amp; publish <span className="font-normal text-faint">{changes.length} change{changes.length === 1 ? "" : "s"} against live version</span></h3>
      <ul className="mb-3 space-y-1 text-xs">
        {changes.map((c, k) => (
          <li key={k}><Badge tone={c.kind === "added" ? "ok" : c.kind === "removed" ? "bad" : "info"}>{c.kind}</Badge> <b>{c.lane}</b>{c.fields.length ? ": " : ""}{c.fields.map((f) => `${f.field} ${f.from} → ${f.to}`).join(" · ")}</li>
        ))}
      </ul>
      {preview.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-faint"><th className="py-1 pr-2">Lane · price incl. GST</th>{[1, 2, 4, 6].map((n) => <th key={n} className="pr-2">{n} bag{n > 1 ? "s" : ""}</th>)}<th>Margin 1 · 2</th></tr></thead>
            <tbody>
              {preview.map(({ c, now, was }) => (
                <tr key={c.lane} className="border-b border-dashed border-line last:border-0">
                  <td className="py-1 pr-2 font-semibold">{c.lane}</td>
                  {[1, 2, 4, 6].map((n) => {
                    const a = was ? priceFor(was, n) : NaN, b = priceFor(now!, n);
                    return <td key={n} className="pr-2 tabular-nums">{was && a !== b ? <><s className="text-faint">{inr(a)}</s> </> : null}<b>{inr(b)}</b></td>;
                  })}
                  <td className="tabular-nums">{marginAt(now!, 1, costModel)}% · {marginAt(now!, 2, costModel)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errors.length > 0 && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900"><b>{errors.length} error{errors.length === 1 ? "" : "s"} must be fixed before publishing</b> (listed under the route chart).</p>}
      {warnings.length > 0 && errors.length === 0 && (
        <label className="mb-2 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
          <input type="checkbox" className="mt-0.5" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <span>I have checked the {warnings.length} warning{warnings.length === 1 ? "" : "s"} listed under the route chart and want to publish anyway.</span>
        </label>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="What changed and why (goes in the version history)"><Input className="w-96 max-w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Diwali season rates for Mumbai lanes" /></Field>
        <Button disabled={busy || errors.length > 0 || note.trim().length < 3 || (warnings.length > 0 && !ok)} onClick={() => void onPublish(note.trim(), ok)}>
          {busy ? "Publishing…" : dirty ? "Save & publish" : "Publish to live"}
        </Button>
      </div>
    </Card>
  );
}

/* ============================== instant booking ============================== */
const CAL_STYLE: Record<CalendarState, string> = {
  open: "bg-green-100 text-green-900", full: "bg-amber-100 text-amber-900", notice: "bg-paper text-faint",
  blackout: "bg-red-100 text-red-900 line-through", weekday: "bg-paper text-faint", outside: "bg-paper text-faint", off: "bg-paper text-faint",
};
function InstantEditor({ route, today, now, bookings, defaults, onChange, onClose }: {
  route: RouteRate; today: string; now: number; bookings: Booking[]; defaults: { minNoticeDays: number; holdMinutes: number };
  onChange: (rule: InstantRule) => void; onClose: () => void;
}) {
  const rule: InstantRule = route.instant ?? { enabled: false };
  const upd = (p: Partial<InstantRule>) => onChange({ ...rule, ...p });
  const [bo, setBo] = useState("");
  const taken = useMemo(() => instantTaken(bookings, route, now), [bookings, route, now]);
  const cal = instantCalendar(rule, today, defaults, taken, 42);
  const first = new Date(`${today}T00:00:00Z`).getUTCDay();
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">⚡ Instant booking · {laneName(route)} <span className="font-normal text-faint">qualifying bookings are auto-approved and confirmed the moment they are paid</span></h3>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3 text-xs">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!rule.enabled} onChange={(e) => upd({ enabled: e.target.checked })} /> Allow instant booking on this route</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={`Min. notice (days, default ${defaults.minNoticeDays})`}><Num w="w-24" value={rule.minNoticeDays ?? null} onChange={(v) => upd({ minNoticeDays: v })} /></Field>
            <Field label="Instant bookings / day"><Num w="w-24" value={rule.dailyCap ?? null} onChange={(v) => upd({ dailyCap: v })} /></Field>
            <Field label="Max bags / booking"><Num w="w-24" value={rule.maxBags ?? null} onChange={(v) => upd({ maxBags: v })} /></Field>
            <Field label="Oversize pieces"><Select className="w-28" value={rule.allowOversize ? "yes" : "no"} onChange={(e) => upd({ allowOversize: e.target.value === "yes" })}><option value="no">team confirms</option><option value="yes">allowed</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Active from (optional)"><Input type="date" value={rule.from ?? ""} onChange={(e) => upd({ from: e.target.value || null })} /></Field>
            <Field label="Active until (optional)"><Input type="date" value={rule.to ?? ""} onChange={(e) => upd({ to: e.target.value || null })} /></Field>
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-muted">Pickup weekdays (none ticked = every day)</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w, i) => (
                <label key={w} className="flex items-center gap-1"><input type="checkbox" checked={!!rule.weekdays?.includes(i)}
                  onChange={(e) => { const s = new Set(rule.weekdays ?? []); if (e.target.checked) s.add(i); else s.delete(i); upd({ weekdays: s.size ? [...s].sort() : null }); }} />{w}</label>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-muted">Blackout dates (closed for instant booking)</span>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-40" value={bo} onChange={(e) => setBo(e.target.value)} />
              <Button size="sm" variant="outline" disabled={!bo} onClick={() => { upd({ blackout: [...new Set([...(rule.blackout ?? []), bo])].sort() }); setBo(""); }}>Add</Button>
              {(rule.blackout ?? []).map((d) => <button key={d} className="rounded-full bg-red-50 px-2 py-0.5 text-red-900" onClick={() => upd({ blackout: (rule.blackout ?? []).filter((x) => x !== d) })}>{d} ✕</button>)}
            </div>
          </div>
          <p className="text-muted">Changes here go into the draft — publish to make them live. Unpaid instant bookings are held {defaults.holdMinutes} minutes, then go to the team for approval.</p>
        </div>
        <div>
          <span className="mb-1 block text-[11px] font-semibold text-muted">Next 6 weeks (pickup dates)</span>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
            {WEEKDAYS.map((w) => <span key={w} className="font-semibold text-faint">{w[0]}</span>)}
            {Array.from({ length: first }, (_, i) => <span key={`pad${i}`} />)}
            {cal.map((c) => (
              <span key={c.date} title={`${c.date} · ${c.state}${c.taken ? ` · ${c.taken} taken` : ""}`} className={`rounded py-1 ${CAL_STYLE[c.state]}`}>
                {+c.date.slice(8)}{c.taken ? <sup>{c.taken}</sup> : null}
              </span>
            ))}
          </div>
          <p className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
            <span className="rounded bg-green-100 px-1.5">instant</span><span className="rounded bg-amber-100 px-1.5">full</span>
            <span className="rounded bg-red-100 px-1.5">blackout</span><span className="rounded bg-paper px-1.5">team confirms</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function InstantDefaultsCard({ defaults, onSave }: { defaults: { minNoticeDays: number; holdMinutes: number }; onSave: (d: { minNoticeDays: number; holdMinutes: number }) => void }) {
  const [d, setD] = useSyncedState(defaults);
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Instant booking defaults <span className="font-normal text-faint">apply to every instant route unless the route sets its own notice</span></h3>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <Field label="Minimum notice (days before pickup)"><Num w="w-24" value={d.minNoticeDays} onChange={(v) => setD({ ...d, minNoticeDays: v ?? 0 })} /></Field>
        <Field label="Payment hold (minutes)"><Num w="w-24" value={d.holdMinutes} onChange={(v) => setD({ ...d, holdMinutes: v ?? 0 })} /></Field>
        <Button size="sm" variant="outline" disabled={JSON.stringify(d) === JSON.stringify(defaults)} onClick={() => onSave(d)}>Save defaults</Button>
      </div>
    </Card>
  );
}

/* ============================== profitability ============================== */
function Profitability({ routes, bookings, costModel, benchmarks, now, reload, onUseTarget }: {
  routes: RouteRate[]; bookings: Booking[]; costModel: CostModel; benchmarks: Record<string, { label: string; amount: number }>; now: number;
  reload: () => Promise<void>; onUseTarget: (lane: string, t: { r1: number; r2: number; addl: number }) => void;
}) {
  const [model, setModel] = useSyncedState(costModel);
  const [savingCost, setSavingCost] = useState(false);
  const since = now - 90 * DAY;
  const rows = routes.map((r) => {
    const lane = laneName(r);
    const t = targetPrices(r, costModel);
    const bs = bookings.filter((b) => onRoute(b, r) && Date.parse(b.created) >= since && b.quote.total > 0);
    const paid = bs.filter(isPaid);
    const revenue = paid.reduce((s, b) => s + (b.pay?.amount ?? 0), 0);
    const costed = paid.filter((b) => actualCost(opsOf(b)) > 0);
    const cRev = costed.reduce((s, b) => s + exGst(b.pay?.amount ?? 0), 0), cCost = costed.reduce((s, b) => s + actualCost(opsOf(b)), 0);
    return { r, lane, t, cost1: laneCost(costModel, r, 1), m1: marginAt(r, 1, costModel), m2: marginAt(r, 2, costModel), n: bs.length, paid: paid.length, revenue, actual: costed.length ? Math.round(((cRev - cCost) / cRev) * 100) : null, costed: costed.length, bench: benchmarks[lane] };
  });
  async function saveCosts() { setSavingCost(true); await saveCostModel(model); setSavingCost(false); await reload(); }
  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">Profitability <span className="font-normal text-faint">live prices vs standard cost · last 90 days actuals · benchmark</span></h3>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl bg-paper p-2.5 text-xs">
        <Field label="Target margin %"><Num w="w-20" value={model.marginFloorPct} onChange={(v) => setModel({ ...model, marginFloorPct: v ?? 0 })} /></Field>
        <Field label="Default pickup ₹"><Num value={model.defaults.pickup} onChange={(v) => setModel({ ...model, defaults: { ...model.defaults, pickup: v ?? 0 } })} /></Field>
        <Field label="Default line haul ₹"><Num value={model.defaults.linehaul} onChange={(v) => setModel({ ...model, defaults: { ...model.defaults, linehaul: v ?? 0 } })} /></Field>
        <Field label="Default delivery ₹"><Num value={model.defaults.lastmile} onChange={(v) => setModel({ ...model, defaults: { ...model.defaults, lastmile: v ?? 0 } })} /></Field>
        <Field label="Extra cost per bag ₹"><Num value={model.defaults.perBag ?? 250} onChange={(v) => setModel({ ...model, defaults: { ...model.defaults, perBag: v ?? 0 } })} /></Field>
        <Button size="sm" variant="outline" disabled={savingCost || JSON.stringify(model) === JSON.stringify(costModel)} onClick={() => void saveCosts()}>Save costs</Button>
        <span className="text-faint">Per-route costs: set them in the New route wizard or Operations → Cost model. Same model the ops team uses.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-xs">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
              <th className="py-1.5 pr-2">Route</th><th className="pr-2">Cost / booking</th><th className="pr-2">Chart rate 1 · 2 · +bag</th><th className="pr-2">Margin 1 · 2</th>
              <th className="pr-2">Target-margin rate 1 · 2 · +bag</th><th className="pr-2">90 days: bookings · paid · conv.</th><th className="pr-2">Revenue · actual margin</th><th className="pr-2">Benchmark / bag</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const below = x.r.r1 < x.t.r1 || x.r.r2 < x.t.r2;
              return (
                <tr key={x.lane} className="border-b border-dashed border-line align-top last:border-0">
                  <td className="py-1.5 pr-2 font-semibold">{x.lane}{x.r.instant?.enabled ? " ⚡" : ""}</td>
                  <td className="pr-2 tabular-nums">{inr(x.cost1)}</td>
                  <td className="pr-2 tabular-nums">{inr(x.r.r1)} · {inr(x.r.r2)} · {inr(x.r.addl)}</td>
                  <td className="whitespace-nowrap pr-2"><Badge tone={tone(x.m1, costModel.marginFloorPct)}>{x.m1}%</Badge> <Badge tone={tone(x.m2, costModel.marginFloorPct)}>{x.m2}%</Badge></td>
                  <td className={`pr-2 tabular-nums ${below ? "font-semibold text-red-700" : "text-muted"}`}>{inr(x.t.r1)} · {inr(x.t.r2)} · {inr(x.t.addl)}</td>
                  <td className="pr-2 tabular-nums">{x.n} · {x.paid} · {x.n ? Math.round((100 * x.paid) / x.n) : 0}%</td>
                  <td className="pr-2 tabular-nums">{inr(x.revenue)} · {x.actual == null ? <span className="text-faint">no costs logged</span> : <Badge tone={tone(x.actual, costModel.marginFloorPct)}>{x.actual}% ({x.costed})</Badge>}</td>
                  <td className="pr-2"><BenchmarkCell lane={x.lane} bench={x.bench} perBag={priceFor(x.r, 1)} onSaved={reload} /></td>
                  <td>{below && <Button size="sm" variant="outline" onClick={() => onUseTarget(x.lane, x.t)}>Use target prices</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-faint">All chart rates are before GST — customers pay 5% GST on top. Target-margin rate = standard cost ÷ (1 − target margin), rounded up to ₹50. The benchmark compares what the customer pays for 1 bag (incl. GST). Standard costs are placeholders until real per-route costs are entered — the suggestions are only as good as those costs.</p>
    </Card>
  );
}

function BenchmarkCell({ lane, bench, perBag, onSaved }: { lane: string; bench?: { label: string; amount: number }; perBag: number; onSaved: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [label, setLabel] = useState(bench?.label ?? "Airline excess baggage");
  const [amount, setAmount] = useState<number | null>(bench?.amount ?? null);
  if (!edit) {
    return bench
      ? <button className="text-left hover:underline" onClick={() => setEdit(true)}>{bench.label}: {inr(bench.amount)}<span className="block text-faint">we are {Math.round((1 - perBag / bench.amount) * 100)}% {perBag <= bench.amount ? "cheaper" : "dearer"}</span></button>
      : <button className="text-faint hover:underline" onClick={() => setEdit(true)}>+ add</button>;
  }
  return (
    <span className="flex flex-col gap-1">
      <Input className="w-36" value={label} onChange={(e) => setLabel(e.target.value)} />
      <span className="flex gap-1"><Num value={amount} onChange={setAmount} />
        <Button size="sm" variant="outline" onClick={() => void pricingAction("benchmark", { lane, label, amount }).then(async () => { setEdit(false); await onSaved(); })}>Save</Button></span>
    </span>
  );
}

/* ============================== routes to add ============================== */
function RoutesToAdd({ routes, bookings, costModel, now, onAdd }: { routes: RouteRate[]; bookings: Booking[]; costModel: CostModel; now: number; onAdd: (seed: Partial<RouteRate>) => void }) {
  const since = now - 30 * DAY;
  const asks = new Map<string, { from: string; to: string; n: number; last: string }>();
  for (const b of bookings) {
    if (Date.parse(b.created) < since || !b.quote.breakdown?.ror || !b.from || !b.to) continue;
    if (routes.some((r) => onRoute(b, r))) continue;
    const k = `${b.from} → ${b.to}`;
    const cur = asks.get(k) ?? { from: b.from, to: b.to, n: 0, last: b.created };
    cur.n++; if (b.created > cur.last) cur.last = b.created;
    asks.set(k, cur);
  }
  const list = [...asks.values()].sort((a, b) => b.n - a.n);
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Routes to add <span className="font-normal text-faint">lanes customers asked for in the last 30 days that aren&apos;t on the chart</span></h3>
      {list.length === 0 && <p className="text-sm text-muted">No unpriced requests in the last 30 days.</p>}
      <ul className="space-y-1.5 text-xs">
        {list.map((a) => {
          const t = targetPrices({ from: a.from, to: a.to, dir: "both" }, costModel);
          return (
            <li key={`${a.from}|${a.to}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-1.5 last:border-0">
              <span><b>{a.from} → {a.to}</b> · {a.n} request{a.n === 1 ? "" : "s"} · last {fmt(a.last)} · target-margin rate {inr(t.r1)} / {inr(t.r2)} / +{inr(t.addl)} before GST</span>
              <Button size="sm" variant="outline" onClick={() => onAdd({ from: a.from, to: a.to, ...t })}>Add route →</Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ============================== new route wizard ============================== */
function NewRouteWizard({ seed, masters, costModel, onCancel, onAdd }: {
  seed: Partial<RouteRate>; masters: Masters; costModel: CostModel; onCancel: () => void; onAdd: (r: RouteRate, model: CostModel | null) => void;
}) {
  const [r, setR] = useState<RouteRate>({ ...EMPTY_ROUTE, ...seed });
  const lane = `${r.from} → ${r.to}`;
  const existing = costModel.lanes[lane] ?? {};
  const [legs, setLegs] = useState({ pickup: existing.pickup ?? costModel.defaults.pickup, linehaul: existing.linehaul ?? costModel.defaults.linehaul, lastmile: existing.lastmile ?? costModel.defaults.lastmile });
  const [margin, setMargin] = useState(costModel.marginFloorPct);
  const model: CostModel = { ...costModel, lanes: { ...costModel.lanes, [lane]: legs } };
  const t = r.from && r.to ? targetPrices(r, model, margin) : null;
  const issues = r.from && r.to && r.r1 ? validateCard({ routes: [r], oversizeRate: masters.oversizeRate, cities: masters.cities, costModel: model }) : [];
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">New route <span className="font-normal text-faint">cost → target margin → suggested prices → preview → into the draft</span></h3>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <Field label="From"><CitySelect cities={masters.cities} value={r.from} onChange={(v) => setR({ ...r, from: v })} /></Field>
        <Field label="To"><CitySelect cities={masters.cities} value={r.to} onChange={(v) => setR({ ...r, to: v })} /></Field>
        <Field label="Direction"><Select value={r.dir} onChange={(e) => setR({ ...r, dir: e.target.value as RouteRate["dir"] })}><option value="both">both ways</option><option value="one">one way</option></Select></Field>
        <Field label="Pickup cost ₹"><Num value={legs.pickup} onChange={(v) => setLegs({ ...legs, pickup: v ?? 0 })} /></Field>
        <Field label="Line haul cost ₹"><Num value={legs.linehaul} onChange={(v) => setLegs({ ...legs, linehaul: v ?? 0 })} /></Field>
        <Field label="Delivery cost ₹"><Num value={legs.lastmile} onChange={(v) => setLegs({ ...legs, lastmile: v ?? 0 })} /></Field>
        <Field label="Target margin %"><Num value={margin} onChange={(v) => setMargin(v ?? 0)} /></Field>
      </div>
      {t && (
        <p className="mt-3 rounded-xl bg-paper p-2.5 text-xs">
          Cost per booking {inr(laneCost(model, r, 1))} (+{inr(model.defaults.perBag ?? 250)} per extra bag). Target-margin chart rates (before GST): <b>{inr(t.r1)}</b> 1 bag · <b>{inr(t.r2)}</b> 2 bags · <b>+{inr(t.addl)}</b> per extra bag.{" "}
          <button className="font-semibold text-brand underline" onClick={() => setR({ ...r, r1: t.r1, r2: t.r2, addl: t.addl })}>Use these</button>
        </p>
      )}
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-5">
        <Field label="1 bag ₹ (before GST)"><Num value={r.r1} onChange={(v) => setR({ ...r, r1: v ?? 0 })} /></Field>
        <Field label="2 bags ₹"><Num value={r.r2} onChange={(v) => setR({ ...r, r2: v ?? 0 })} /></Field>
        <Field label="Each extra bag ₹"><Num value={r.addl} onChange={(v) => setR({ ...r, addl: v ?? 0 })} /></Field>
        <Field label="Bulk from (bags)"><Num value={r.bulkMin ?? null} onChange={(v) => setR({ ...r, bulkMin: v })} /></Field>
        <Field label="Bulk ₹/bag"><Num value={r.bulkRate ?? null} onChange={(v) => setR({ ...r, bulkRate: v })} /></Field>
      </div>
      {r.r1 > 0 && r.r2 > 0 && r.addl > 0 && (
        <p className="mt-2 text-xs text-muted">Customer pays (incl. GST): {[1, 2, 3, 4, 6].map((n) => `${n} bag${n > 1 ? "s" : ""} ${inr(priceFor(r, n))}`).join(" · ")} · margin {marginAt(r, 1, model)}% / {marginAt(r, 2, model)}%</p>
      )}
      <IssueList issues={issues} />
      <div className="mt-3 flex gap-2">
        <Button disabled={!r.from || !r.to || !(r.r1 > 0) || issues.some((i) => i.level === "error")} onClick={() => onAdd(r, JSON.stringify(existing) === JSON.stringify(legs) ? null : model)}>Add to draft</Button>
        <span className="self-center text-xs text-faint">Nothing is live until you publish the draft.</span>
      </div>
    </Card>
  );
}

/* ============================== version history ============================== */
function VersionHistory({ log, liveVersion, busy, hasDraft, onRollback }: { log: PricingState["log"]; liveVersion: number; busy: boolean; hasDraft: boolean; onRollback: (v: number, note: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const entries = [...log].reverse();
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Version history <span className="font-normal text-faint">every publish, rollback and settings change</span></h3>
      {entries.length === 0 && <p className="text-sm text-muted">Nothing published through the engine yet — the first publish keeps today&apos;s chart as version {liveVersion} so it can always be restored.</p>}
      <ul className="space-y-1.5 text-xs">
        {entries.map((e, k) => (
          <li key={k} className="border-b border-dashed border-line pb-1.5 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <Badge tone={e.kind === "rollback" ? "warn" : e.kind === "publish" ? "ok" : "muted"}>{e.kind === "publish" || e.kind === "rollback" || e.kind === "baseline" ? `v${e.version}` : e.kind}</Badge>{" "}
                {fmt(e.at)} · {e.note}{e.changes.length ? ` · ${e.changes.length} change${e.changes.length === 1 ? "" : "s"}` : ""}{e.version === liveVersion && (e.kind === "publish" || e.kind === "rollback") ? " · LIVE" : ""}
              </span>
              <span className="flex gap-1.5">
                {e.changes.length > 0 && <Button size="sm" variant="ghost" onClick={() => setOpen(open === k ? null : k)}>{open === k ? "Hide" : "Changes"}</Button>}
                {e.routes && e.version !== liveVersion && (
                  <Button size="sm" variant="outline" disabled={busy || hasDraft} title={hasDraft ? "Publish or discard the draft first" : ""}
                    onClick={() => { const note = prompt(`Roll back to version ${e.version}? Its prices become live again as a new version.\nReason:`); if (note && note.trim().length >= 3) onRollback(e.version, note.trim()); }}>
                    Roll back to v{e.version}
                  </Button>
                )}
              </span>
            </div>
            {open === k && <ul className="mt-1 space-y-0.5 pl-3 text-muted">{e.changes.map((c, j) => <li key={j}>{c.kind} · {c.lane}{c.fields.length ? ": " : ""}{c.fields.map((f) => `${f.field} ${f.from} → ${f.to}`).join(" · ")}</li>)}</ul>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ============================== cities + simulator ============================== */
function CitiesEditor({ extraCities, onSave }: { extraCities: City[]; onSave: (c: City[]) => void }) {
  const [list, setList] = useSyncedState(extraCities);
  const [draft, setDraft] = useState<City>({ name: "", zone: "MUM", ap: "" });
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Extra cities <span className="font-normal text-faint">on top of the built-in {DEFAULT_MASTERS.cities.length} — a route needs both its cities here</span></h3>
      <ul className="mb-2 text-xs">
        {list.length === 0 && <li className="text-muted">None added yet.</li>}
        {list.map((c, i) => (
          <li key={c.name} className="flex justify-between border-b border-dashed border-line py-1 last:border-0">
            <span>{c.name} · {c.zone}{c.ap ? ` · ${c.ap}` : ""}</span>
            <button className="text-red-700 hover:underline" onClick={() => { const next = list.filter((_, idx) => idx !== i); setList(next); onSave(next); }}>remove</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        <Input className="w-28" placeholder="City" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
        <Select className="w-24" value={draft.zone} onChange={(e) => setDraft((p) => ({ ...p, zone: e.target.value as Zone }))}>{ZONES.map((z) => <option key={z}>{z}</option>)}</Select>
        <Input className="w-20" placeholder="Airport code" value={draft.ap ?? ""} onChange={(e) => setDraft((p) => ({ ...p, ap: e.target.value }))} />
        <Button size="sm" variant="outline" onClick={() => {
          if (!draft.name.trim() || list.some((c) => c.name === draft.name)) return;
          const next = [...list, draft]; setList(next); onSave(next); setDraft({ name: "", zone: "MUM", ap: "" });
        }}>Add</Button>
      </div>
    </Card>
  );
}

function QuoteSimulator({ live, draft }: { live: Masters; draft: Masters | null }) {
  const [from, setFrom] = useState(live.routes[0]?.from ?? "");
  const [to, setTo] = useState(live.routes[0]?.to ?? "");
  const [bags, setBags] = useState(2);
  const [oversize, setOversize] = useState(0);
  const run = (m: Masters) => quote({ fromName: from, toName: to, bags, oversize, mode: "road" as Mode }, m);
  const show = (q: ReturnType<typeof run>) => ("error" in q ? <span className="text-muted">Rate on request</span> : <><b className="font-display text-lg">{inr(q.total)}</b> <span className="text-muted">· {q.rule}</span></>);
  const names = [...new Set(live.cities.map((c) => c.name))];
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Quote simulator <span className="font-normal text-faint">the same engine customers are priced on</span></h3>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Field label="From"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="To"><Select value={to} onChange={(e) => setTo(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="Bags"><Input type="number" value={bags} onChange={(e) => setBags(Number(e.target.value))} /></Field>
        <Field label="Oversize"><Input type="number" value={oversize} onChange={(e) => setOversize(Number(e.target.value))} /></Field>
      </div>
      <p className="text-sm">Live: {show(run(live))}</p>
      {draft && <p className="mt-1 text-sm">Draft: {show(run(draft))}</p>}
    </Card>
  );
}
