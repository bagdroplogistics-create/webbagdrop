"use client";
/** BAGDROP OS · Pricing engine tools — the easy-to-use layer on top of the
 *  rate chart:
 *    InstantMaster   one switch for instant booking on every route + the default rule
 *    PublishFlow     save → test quotes → note + go-live time → publish, or
 *                    (two-person) submit → a second approver approves with a WhatsApp code
 *    Scheduled       an approved change waiting for its go-live time (cancel it)
 *    Approvers       who can approve price changes (two-person publish turns on at 2)
 *    BulkChange      move many prices by a % at once, rounded to ₹50
 *    CsvTools        download the chart, edit in Excel, upload, preview, into the draft
 *    Calculator      exact price + instant yes/no (and why) for a route, bags and date
 *  Nothing here changes a customer's price by itself: everything lands in the
 *  draft, and the server re-checks every rule on publish. */
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { inr, quote, type Masters } from "@/lib/pricing";
import { diffCards, laneName, priceFor, returnOf, validateCard, type Issue, type TestQuote } from "@/lib/pricingRules";
import { effectiveInstant, instantCheck, instantTaken, noticeDays, addDays, type InstantDefaults } from "@/lib/instant";
import { pricingAction, type ApiResult, type PricingState } from "@/lib/pricingApi";
import type { Booking, InstantAll, InstantRule, Mode, RouteRate } from "@/lib/types";

export type OtpProof = { to: string; code: string; exp: number; token: string };
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/* ============================== WhatsApp code ============================== */
/** Collects a WhatsApp code for a mobile; the server verifies it (and uses it once). */
export function OtpVerify({ label, proof, onProof }: { label: string; proof: OtpProof | null; onProof: (p: OtpProof | null) => void }) {
  const [mobile, setMobile] = useState("");
  const [sent, setSent] = useState<{ to: string; exp: number; token: string; demo?: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  async function send() {
    setErr("");
    const r = await fetch("/api/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", channel: "mobile", to: mobile }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setSent({ to: j.to, exp: j.exp, token: j.token, demo: j.demo }); else setErr(j.detail ?? (j.error === "BAD_MOBILE" ? "Enter a 10-digit mobile." : j.error ?? "Couldn't send"));
  }
  if (proof) return <p className="text-xs">{label}: code entered for +{proof.to}. <button className="font-semibold text-brand underline" onClick={() => { onProof(null); setSent(null); setCode(""); }}>Change</button></p>;
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="font-semibold">{label}</span>
      {!sent ? (
        <div className="flex flex-wrap gap-2">
          <Input className="w-40" inputMode="numeric" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d+ ]/g, ""))} />
          <Button size="sm" variant="outline" disabled={mobile.replace(/\D/g, "").length < 10} onClick={() => void send()}>Send WhatsApp code</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-32 font-mono tracking-[.3em]" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          <Button size="sm" disabled={code.length !== 6} onClick={() => onProof({ to: sent.to, code, exp: sent.exp, token: sent.token })}>Use code</Button>
          <span className="text-muted">sent to +{sent.to}{sent.demo ? <> · test code <b>{sent.demo}</b></> : null}</span>
        </div>
      )}
      {err && <span className="text-red-700">{err}</span>}
    </div>
  );
}

/* ============================== rule fields ============================== */
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function RuleFields({ rule, defaults, onChange }: { rule: InstantRule; defaults: InstantDefaults; onChange: (r: InstantRule) => void }) {
  const upd = (p: Partial<InstantRule>) => onChange({ ...rule, ...p });
  const [bo, setBo] = useState("");
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <div className="grid gap-3 text-xs">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`Min. notice (days, default ${defaults.minNoticeDays})`}><Input className="w-24" type="number" value={rule.minNoticeDays ?? ""} onChange={(e) => upd({ minNoticeDays: num(e.target.value) })} /></Field>
        <Field label="Instant bookings / day"><Input className="w-24" type="number" value={rule.dailyCap ?? ""} onChange={(e) => upd({ dailyCap: num(e.target.value) })} /></Field>
        <Field label="Max bags / booking"><Input className="w-24" type="number" value={rule.maxBags ?? ""} onChange={(e) => upd({ maxBags: num(e.target.value) })} /></Field>
        <Field label="Oversize pieces"><Select className="w-32" value={rule.allowOversize ? "yes" : "no"} onChange={(e) => upd({ allowOversize: e.target.value === "yes" })}><option value="no">team approves</option><option value="yes">allowed</option></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Active from (optional)"><Input type="date" value={rule.from ?? ""} onChange={(e) => upd({ from: e.target.value || null })} /></Field>
        <Field label="Active until (optional)"><Input type="date" value={rule.to ?? ""} onChange={(e) => upd({ to: e.target.value || null })} /></Field>
      </div>
      <div>
        <span className="mb-1 block text-[11px] font-semibold text-muted">Pickup weekdays (none ticked = every day)</span>
        <div className="flex flex-wrap gap-2">
          {WEEK.map((w, i) => (
            <label key={w} className="flex items-center gap-1"><input type="checkbox" checked={!!rule.weekdays?.includes(i)}
              onChange={(e) => { const s = new Set(rule.weekdays ?? []); if (e.target.checked) s.add(i); else s.delete(i); upd({ weekdays: s.size ? [...s].sort() : null }); }} />{w}</label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-muted">Blackout dates</span>
        <Input type="date" className="w-40" value={bo} onChange={(e) => setBo(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!bo} onClick={() => { upd({ blackout: [...new Set([...(rule.blackout ?? []), bo])].sort() }); setBo(""); }}>Add</Button>
        {(rule.blackout ?? []).map((d) => <button key={d} className="rounded-full bg-red-50 px-2 py-0.5 text-red-900" onClick={() => upd({ blackout: (rule.blackout ?? []).filter((x) => x !== d) })}>{d} · remove</button>)}
      </div>
    </div>
  );
}

/* ============================== master switch ============================== */
export const DEFAULT_RULE: InstantRule = { enabled: true, minNoticeDays: null, dailyCap: 5, maxBags: 4, allowOversize: false };

export function InstantMaster({ all, routes, defaults, onChange }: { all: InstantAll | null; routes: RouteRate[]; defaults: InstantDefaults; onChange: (a: InstantAll) => void }) {
  const cur: InstantAll = all ?? { enabled: true, rule: DEFAULT_RULE };
  const mode = (r: RouteRate) => (all ? r.instantMode ?? "off" : r.instant?.enabled ? "own" : "off");
  const on = routes.filter((r) => mode(r) !== "off"), own = on.filter((r) => mode(r) === "own").length;
  const paused = !!all && !all.enabled;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold">Instant booking <span className="font-normal text-faint">switched ON or OFF for each route in the chart below</span></h3>
          <p className="max-w-3xl text-xs text-muted">
            <b>ON:</b> a booking that fits the standard rule is confirmed the moment it is paid. <b>OFF</b> (and every new route starts OFF), or outside the rule: the standard approval rule applies — the booking waits in Shipments until someone with “Approve bookings” approves it; the customer then gets the payment link. A booking still waiting after 2 hours sends the team a reminder.
          </p>
        </div>
        <button type="button" onClick={() => onChange({ ...cur, enabled: !cur.enabled })}
          className={`cursor-pointer rounded-full px-4 py-2 text-xs font-bold ${paused ? "bg-amber-500 text-white" : "bg-paper text-ink ring-1 ring-line"}`}>
          {paused ? "Resume instant booking" : "Pause all instant bookings"}
        </button>
      </div>
      {paused
        ? <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900"><b>Paused:</b> no route confirms instantly — every booking waits for approval. Each route keeps its ON/OFF setting for when you resume.</p>
        : <p className="mt-3 text-xs"><Badge tone={on.length ? "ok" : "muted"}>{on.length} route{on.length === 1 ? "" : "s"} ON</Badge>{own ? <> <Badge tone="info">{own} with own limits</Badge></> : null} <Badge tone="muted">{routes.length - on.length} OFF · team approval</Badge></p>}
      <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Standard rule for routes that are ON</p>
      <RuleFields rule={cur.rule} defaults={defaults} onChange={(rule) => onChange({ ...cur, rule })} />
      <p className="mt-2 text-[11px] text-faint">Changes go into the draft; customers see them only after publishing.</p>
    </Card>
  );
}

/* ============================== test quotes ============================== */
function TestQuotesTable({ quotes, onlyChanged }: { quotes: TestQuote[]; onlyChanged: boolean }) {
  const rows = onlyChanged ? quotes.filter((q) => q.live !== q.draft || q.liveInstant !== q.draftInstant) : quotes;
  const show = (n: number | null) => (n == null ? "on request" : inr(n));
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-[620px] text-xs">
        <thead className="sticky top-0 bg-white"><tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-faint"><th className="p-1.5">Route</th><th>Booking</th><th>Customer pays now</th><th>After publish</th><th>Instant now</th><th>After</th></tr></thead>
        <tbody>
          {rows.map((q, i) => {
            const moved = q.live !== q.draft, inst = q.liveInstant !== q.draftInstant;
            return (
              <tr key={i} className={`border-b border-dashed border-line last:border-0 ${moved || inst ? "bg-amber-50" : ""}`}>
                <td className="p-1.5 font-semibold">{q.lane}</td>
                <td>{q.bags} bag{q.bags > 1 ? "s" : ""}{q.oversize ? ` + ${q.oversize} oversize` : ""}</td>
                <td className="tabular-nums">{show(q.live)}</td>
                <td className="tabular-nums font-semibold">{show(q.draft)}{moved && q.live != null && q.draft != null ? <span className={q.draft > q.live ? "text-red-700" : "text-green-700"}> ({q.draft > q.live ? "+" : "-"}{inr(Math.abs(q.draft - q.live))})</span> : null}</td>
                <td>{q.liveInstant ? "instant" : "approval"}</td>
                <td className={inst ? "font-semibold" : ""}>{q.draftInstant ? "instant" : "approval"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted">No customer price or instant decision changes.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ============================== publish flow ============================== */
export function PublishFlow({ data, changes, errors, warnings, dirty, busy, run, saveDraft }: {
  data: PricingState; changes: ReturnType<typeof diffCards>; errors: Issue[]; warnings: Issue[]; dirty: boolean; busy: boolean;
  run: (fn: () => Promise<ApiResult>, okText: string) => Promise<boolean>; saveDraft: () => Promise<boolean>;
}) {
  const twoPerson = data.approvers.length >= 2;
  const sub = data.draft?.submitted ?? null;
  const [quotes, setQuotes] = useState<TestQuote[] | null>(null);
  const [locked, setLocked] = useState(0);
  const [checked, setChecked] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [note, setNote] = useState("");
  const [okWarn, setOkWarn] = useState(false);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [name, setName] = useState("");
  const [proof, setProof] = useState<OtpProof | null>(null);
  const [msg, setMsg] = useState("");
  const reviewedOnServer = data.reviewedDraftRev != null && data.reviewedDraftRev === data.draftRev;
  const reviewed = reviewedOnServer && checked && !!quotes;
  const goLiveAt = when === "later" && at ? new Date(at).toISOString() : null;
  const action = pricingAction;

  async function review() {
    setMsg("");
    if (dirty && !(await saveDraft())) return;
    const r = await action("review", {});
    if (!r.ok) { setMsg(r.detail ?? r.error ?? "Couldn't run the test quotes"); return; }
    setQuotes(r.quotes ?? []); setLocked(r.lockedQuotes ?? 0); setChecked(false);
    await run(async () => ({ ok: true, status: 200 }), "Test quotes ready — check what customers will pay below.");
  }

  if (!data.draft && changes.length === 0) return null;
  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">Review &amp; publish <span className="font-normal text-faint">{changes.length} change{changes.length === 1 ? "" : "s"} against the live prices{twoPerson ? " · two-person publish ON" : ""}</span></h3>
      <ul className="mb-3 space-y-1 text-xs">
        {changes.map((c, k) => <li key={k}><Badge tone={c.kind === "added" ? "ok" : c.kind === "removed" ? "bad" : "info"}>{c.kind}</Badge> <b>{c.lane}</b>{c.fields.length ? ": " : ""}{c.fields.map((f) => `${f.field} ${f.from} → ${f.to}`).join(" · ")}</li>)}
      </ul>
      {errors.length > 0 && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900"><b>{errors.length} error{errors.length === 1 ? "" : "s"} must be fixed first</b> (listed under the chart).</p>}

      {sub ? (
        <div className="grid gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
          <p><b>Waiting for approval.</b> Submitted by {sub.by.name} (+91 {sub.by.mobile}) on {fmt(sub.at)}{sub.goLiveAt ? ` · goes live ${fmt(sub.goLiveAt)}` : " · goes live as soon as it is approved"} · “{sub.note}”</p>
          <p>A second approver checks the test quotes, then approves with their WhatsApp code. The person who submitted can&apos;t approve their own change.</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void review()}>{quotes ? "Refresh test quotes" : "Run test quotes"}</Button></div>
          {quotes && <TestQuotesTable quotes={quotes} onlyChanged={onlyChanged} />}
          {quotes && <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I have checked what customers will pay.</label>}
          <OtpVerify label="Approver" proof={proof} onProof={setProof} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !reviewed || !proof} onClick={() => void run(() => action("approve", { otp: proof }), sub.goLiveAt ? `Approved — goes live ${fmt(sub.goLiveAt)}.` : "Approved — the new prices are live.").then(() => setProof(null))}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { const reason = prompt("Why are you withdrawing it? (it goes back to the draft for editing)") ?? ""; void run(() => action("withdraw", { reason }), "Withdrawn — the draft can be edited again."); }}>Withdraw</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 text-xs">
          <div className="grid gap-2 rounded-xl bg-paper p-3">
            <p><b>Step 1 · Test quotes.</b> See exactly what customers will pay on every route after publishing, before anything goes live.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={busy || errors.length > 0} onClick={() => void review()}>{dirty ? "Save draft and run test quotes" : quotes ? "Run again" : "Run test quotes"}</Button>
              {quotes && <label className="flex items-center gap-1"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> only rows that change</label>}
            </div>
            {quotes && <TestQuotesTable quotes={quotes} onlyChanged={onlyChanged} />}
            {quotes && <p className="text-muted">Price lock: {locked} customer{locked === 1 ? "" : "s"} holding a quote keep{locked === 1 ? "s" : ""} the quoted price until it expires (72 hours). New quotes use the new prices.</p>}
            {quotes && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I have checked what customers will pay.</label>}
          </div>
          <div className="grid gap-2 rounded-xl bg-paper p-3">
            <p><b>Step 2 · Note and go-live.</b></p>
            <Field label="What changed and why (goes in the version history)"><Input className="w-full max-w-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. December rates for Mumbai routes" /></Field>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Go live {twoPerson ? "when approved" : "now"}</label>
              <label className="flex items-center gap-1"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} /> Go live at</label>
              {when === "later" && <Input type="datetime-local" className="w-56" value={at} onChange={(e) => setAt(e.target.value)} />}
            </div>
            {warnings.length > 0 && (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-amber-900"><input type="checkbox" className="mt-0.5" checked={okWarn} onChange={(e) => setOkWarn(e.target.checked)} /> I have checked the {warnings.length} warning{warnings.length === 1 ? "" : "s"} under the chart.</label>
            )}
          </div>
          <div className="grid gap-2 rounded-xl bg-paper p-3">
            <p><b>Step 3 · {twoPerson ? "Send for approval" : "Publish"}.</b>{twoPerson ? " A second approver approves with their own WhatsApp code." : " Add two approvers below to require a second person."}</p>
            {twoPerson && <Field label="Your name"><Input className="w-56" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
            {twoPerson && <OtpVerify label="Your mobile (prepared by)" proof={proof} onProof={setProof} />}
            <div>
              <Button disabled={busy || errors.length > 0 || !reviewed || note.trim().length < 3 || (warnings.length > 0 && !okWarn) || (when === "later" && !at) || (twoPerson && (!proof || name.trim().length < 2))}
                onClick={() => void (twoPerson
                  ? run(() => action("submit", { note: note.trim(), confirm: okWarn, goLiveAt, name: name.trim(), otp: proof }), "Sent for approval.")
                  : run(() => action("publish", { note: note.trim(), confirm: okWarn, goLiveAt }), goLiveAt ? `Scheduled — goes live ${fmt(goLiveAt)}.` : "Published — the new prices are live for every new quote.")
                ).then(() => setProof(null))}>
                {twoPerson ? "Send for approval" : goLiveAt ? "Schedule" : "Publish to live"}
              </Button>
              {!reviewed && <span className="ml-2 text-muted">Run and tick the test quotes first.</span>}
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-900">{msg}</p>}
    </Card>
  );
}

/* ============================== scheduled + approvers ============================== */
export function ScheduledChange({ data, busy, run }: { data: PricingState; busy: boolean; run: (fn: () => Promise<ApiResult>, okText: string) => Promise<boolean> }) {
  const s = data.scheduled;
  const [proof, setProof] = useState<OtpProof | null>(null);
  if (!s) return null;
  const twoPerson = data.approvers.length >= 2;
  return (
    <Card>
      <h3 className="font-display text-sm font-bold">Scheduled change <Badge tone="warn">goes live {fmt(s.goLiveAt)}</Badge></h3>
      <p className="mt-1 text-xs text-muted">{s.note} · by {s.by} · {s.changes.length} change{s.changes.length === 1 ? "" : "s"}: {s.changes.map((c) => c.lane).join(", ")}</p>
      <p className="mt-1 text-xs text-muted">Until then customers are priced on the current live version. No other change can be published while this one is waiting.</p>
      {twoPerson && <div className="mt-2"><OtpVerify label="Approver code to cancel" proof={proof} onProof={setProof} /></div>}
      <Button size="sm" variant="outline" className="mt-2" disabled={busy || (twoPerson && !proof)} onClick={() => { if (confirm("Cancel the scheduled change? It will not go live.")) void run(() => pricingAction("cancelSchedule", { otp: proof }), "Scheduled change cancelled."); }}>Cancel scheduled change</Button>
    </Card>
  );
}

export function Approvers({ data, busy, run }: { data: PricingState; busy: boolean; run: (fn: () => Promise<ApiResult>, okText: string) => Promise<boolean> }) {
  const [people, setPeople] = useState(data.approvers.length ? data.approvers : [{ name: "", mobile: "" }]);
  const [proof, setProof] = useState<OtpProof | null>(null);
  const twoPerson = data.approvers.length >= 2;
  const edit = (i: number, p: Partial<{ name: string; mobile: string }>) => setPeople((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <Card>
      <h3 className="font-display text-sm font-bold">Price approvers <Badge tone={twoPerson ? "ok" : "warn"}>{twoPerson ? "two-person publish ON" : "two-person publish off"}</Badge></h3>
      <p className="mt-1 text-xs text-muted">With two or more approvers, every price change needs a second person: one prepares and submits it, a different approver approves it. Approvers signed in with their own BAGDROP OS login (with “Approve price changes” ticked) just approve; on the owner key they confirm with a WhatsApp code to their mobile. Rollbacks, schedule cancellations and instant defaults also need an approver.</p>
      <div className="mt-2 grid gap-2">
        {people.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input className="w-44" placeholder="Name" value={p.name} onChange={(e) => edit(i, { name: e.target.value })} />
            <Input className="w-40" inputMode="numeric" placeholder="10-digit mobile" value={p.mobile} onChange={(e) => edit(i, { mobile: e.target.value.replace(/[^\d]/g, "") })} />
            <Button size="sm" variant="ghost" onClick={() => setPeople((l) => l.filter((_, k) => k !== i))}>Remove</Button>
          </div>
        ))}
      </div>
      {twoPerson && <div className="mt-2"><OtpVerify label="An approver's code to change this list" proof={proof} onProof={setProof} /></div>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setPeople((l) => [...l, { name: "", mobile: "" }])}>Add approver</Button>
        <Button size="sm" disabled={busy || (twoPerson && !proof)} onClick={() => void run(() => pricingAction("approvers", { people, otp: proof }), "Approvers saved.").then(() => setProof(null))}>Save approvers</Button>
      </div>
    </Card>
  );
}

/* ============================== bulk % change ============================== */
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);
export function BulkChange({ routes, cities, onApply }: { routes: RouteRate[]; cities: string[]; onApply: (next: RouteRate[], text: string) => void }) {
  const [pct, setPct] = useState(5);
  const [scope, setScope] = useState<"all" | "city">("all");
  const [city, setCity] = useState(cities[0] ?? "");
  const hit = (r: RouteRate) => scope === "all" || r.from === city || r.to === city;
  const n = routes.filter(hit).length;
  const apply = () => {
    const f = 1 + pct / 100;
    const next = routes.map((r) => (hit(r) ? { ...r, r1: round50(r.r1 * f), r2: round50(r.r2 * f), addl: round50(r.addl * f), ...(r.bulkRate ? { bulkRate: round50(r.bulkRate * f) } : {}) } : r));
    onApply(next, `${pct > 0 ? "+" : ""}${pct}% on ${n} route${n === 1 ? "" : "s"}${scope === "city" ? ` touching ${city}` : ""} (rounded to ₹50) — in the draft.`);
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-paper p-2.5 text-xs">
      <span className="self-center font-semibold">Change prices by</span>
      <Input className="w-20" type="number" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      <span className="self-center">% for</span>
      <Select className="w-36" value={scope} onChange={(e) => setScope(e.target.value as "all" | "city")}><option value="all">all routes</option><option value="city">routes touching</option></Select>
      {scope === "city" && <Select className="w-36" value={city} onChange={(e) => setCity(e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</Select>}
      <Button size="sm" variant="outline" disabled={!pct || pct < -50 || pct > 100 || n === 0} onClick={apply}>Apply to {n} route{n === 1 ? "" : "s"}</Button>
      <span className="self-center text-faint">−50% to +100%, rounded to ₹50; nothing is live until published.</span>
    </div>
  );
}

/* ============================== CSV in and out ============================== */
const CSV_HEAD = ["from", "to", "direction", "one_bag", "two_bags", "extra_bag", "bulk_from_bags", "bulk_rate_per_bag", "instant", "note"];
const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function chartToCsv(routes: RouteRate[]): string {
  return [CSV_HEAD.join(","), ...routes.map((r) => [r.from, r.to, r.dir === "one" ? "one-way" : "both", r.r1, r.r2, r.addl, r.bulkMin ?? "", r.bulkRate ?? "", r.instantMode === "default" ? "on" : r.instantMode === "own" ? "own" : "off", r.note ?? ""].map(csvCell).join(","))].join("\n");
}
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((x) => x.trim());
}
/** Parse an uploaded chart. Keeps each route's own instant rule from the current chart (the CSV only carries the mode). */
export function csvToChart(text: string, current: RouteRate[]): { routes: RouteRate[]; problems: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const problems: string[] = [];
  if (!lines.length) return { routes: [], problems: ["The file is empty."] };
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const at = (k: string) => head.indexOf(k);
  for (const k of ["from", "to", "one_bag", "two_bags", "extra_bag"]) if (at(k) < 0) problems.push(`Missing column "${k}" — download the chart first and edit that file.`);
  if (problems.length) return { routes: [], problems };
  const num = (s: string | undefined, line: number, label: string, required: boolean) => {
    const t = (s ?? "").replace(/[₹,\s]/g, "");
    if (!t) { if (required) problems.push(`Line ${line}: ${label} is empty.`); return null; }
    const n = Number(t);
    if (!Number.isFinite(n)) { problems.push(`Line ${line}: ${label} "${s}" is not a number.`); return null; }
    return n;
  };
  const routes = lines.slice(1).map((l, i) => {
    const c = splitCsv(l), line = i + 2, get = (k: string) => (at(k) >= 0 ? c[at(k)] ?? "" : "");
    const dirRaw = get("direction").toLowerCase(), modeRaw = get("instant").toLowerCase() || "off";
    if (dirRaw && !["both", "one-way", "one"].includes(dirRaw)) problems.push(`Line ${line}: direction must be "both" or "one-way".`);
    if (!["on", "default", "own", "off"].includes(modeRaw)) problems.push(`Line ${line}: instant must be on, own or off.`);
    const base = current.find((x) => x.from === get("from") && x.to === get("to"));
    const r: RouteRate = {
      from: get("from"), to: get("to"), dir: dirRaw.startsWith("one") ? "one" : "both",
      r1: num(get("one_bag"), line, "one_bag", true) ?? 0, r2: num(get("two_bags"), line, "two_bags", true) ?? 0, addl: num(get("extra_bag"), line, "extra_bag", true) ?? 0,
      bulkMin: num(get("bulk_from_bags"), line, "bulk_from_bags", false), bulkRate: num(get("bulk_rate_per_bag"), line, "bulk_rate_per_bag", false),
      instantMode: (modeRaw === "on" ? "default" : modeRaw) as RouteRate["instantMode"], ...(get("note") ? { note: get("note") } : {}),
      ...(base?.instant ? { instant: base.instant } : {}),
    };
    return r;
  });
  /* a "both" row becomes two rows, one per direction, at the same prices */
  return { routes: routes.flatMap((r) => (r.dir === "both" ? [{ ...r, dir: "one" as const }, returnOf(r)] : [r])), problems };
}
export function CsvTools({ routes, masters, liveRoutes, onImport }: { routes: RouteRate[]; masters: Masters; liveRoutes: RouteRate[]; onImport: (next: RouteRate[], text: string) => void }) {
  const [pending, setPending] = useState<{ routes: RouteRate[]; problems: string[]; name: string } | null>(null);
  const download = () => {
    const blob = new Blob([chartToCsv(routes)], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bagdrop-rate-chart-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const issues = pending && !pending.problems.length ? validateCard({ routes: pending.routes, oversizeRate: masters.oversizeRate, cities: masters.cities, live: { routes: liveRoutes, oversizeRate: masters.oversizeRate } }) : [];
  const changes = pending && !pending.problems.length ? diffCards(routes, pending.routes) : [];
  const errors = issues.filter((i) => i.level === "error");
  return (
    <div className="grid gap-2 rounded-xl bg-paper p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Spreadsheet</span>
        <Button size="sm" variant="outline" onClick={download}>Download chart (CSV)</Button>
        <label className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 font-semibold hover:bg-white/60">
          Upload edited CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const r = csvToChart(await f.text(), routes); setPending({ ...r, name: f.name }); }} />
        </label>
        <span className="text-faint">Rates are before GST. The file replaces the whole chart in the draft — rows you delete are removed.</span>
      </div>
      {pending && (
        <div className="grid gap-2 rounded-lg border border-line bg-white p-2.5">
          <p><b>{pending.name}</b> · {pending.routes.length} route{pending.routes.length === 1 ? "" : "s"} · {changes.length} change{changes.length === 1 ? "" : "s"} against the draft</p>
          {pending.problems.map((p, i) => <p key={i} className="text-red-800">{p}</p>)}
          {errors.map((p, i) => <p key={`e${i}`} className="text-red-800">{p.lane ? `${p.lane}: ` : ""}{p.msg}</p>)}
          {changes.slice(0, 40).map((c, i) => <p key={`c${i}`}><Badge tone={c.kind === "added" ? "ok" : c.kind === "removed" ? "bad" : "info"}>{c.kind}</Badge> {c.lane}{c.fields.length ? ": " : ""}{c.fields.map((f) => `${f.field} ${f.from} → ${f.to}`).join(" · ")}</p>)}
          <div className="flex gap-2">
            <Button size="sm" disabled={!!pending.problems.length || !!errors.length || !changes.length} onClick={() => { onImport(pending.routes, `${pending.name}: ${changes.length} change(s) put into the draft — review and publish.`); setPending(null); }}>Put into draft</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== calculator ============================== */
export function Calculator({ masters, live, draft, defaults, bookings, now, today }: {
  masters: Masters; live: { routes: RouteRate[]; all: InstantAll | null }; draft: { routes: RouteRate[]; all: InstantAll | null; oversizeRate: number } | null;
  defaults: InstantDefaults; bookings: Booking[]; now: number; today: string;
}) {
  const names = useMemo(() => [...new Set(masters.cities.map((c) => c.name))], [masters.cities]);
  const [from, setFrom] = useState(live.routes[0]?.from ?? names[0] ?? "");
  const [to, setTo] = useState(live.routes[0]?.to ?? names[1] ?? "");
  const [bags, setBags] = useState(2);
  const [oversize, setOversize] = useState(0);
  const [date, setDate] = useState(addDays(today, 7));
  const result = (routes: RouteRate[], all: InstantAll | null, oversizeRate: number) => {
    const m: Masters = { ...masters, routes, oversizeRate };
    const q = quote({ fromName: from, toName: to, bags, oversize, mode: "road" as Mode, date }, m);
    const route = routes.find((r) => (r.from === from && r.to === to) || (r.dir === "both" && r.from === to && r.to === from));
    const rule = effectiveInstant(route, all);
    const taken = route ? instantTaken(bookings, route, now)[date] ?? 0 : 0;
    const inst = route ? instantCheck(route, { date, bags, oversize }, today, defaults, taken, all) : { ok: false as const, code: "OFF" as const, reason: "Not on the rate chart — the team quotes it." };
    return { q, rule, inst };
  };
  const show = (label: string, r: ReturnType<typeof result>) => (
    <div className="rounded-xl bg-paper p-2.5 text-xs">
      <p className="font-semibold">{label}</p>
      {"error" in r.q ? <p>Rate on request (not on the chart)</p> : <p><b className="font-display text-lg">{inr(r.q.total)}</b> incl. 5% GST · {r.q.rule}</p>}
      <p className={r.inst.ok ? "text-green-800" : "text-muted"}>{r.inst.ok ? "Instant: confirmed the moment it is paid." : `Team approval: ${r.inst.reason}`}</p>
      {r.rule && <p className="text-faint">Rule in force: {noticeDays(r.rule, defaults)} days&apos; notice{r.rule.maxBags ? ` · up to ${r.rule.maxBags} bags` : ""}{r.rule.dailyCap ? ` · ${r.rule.dailyCap} per day` : ""}{r.rule.allowOversize ? " · oversize ok" : ""}</p>}
    </div>
  );
  return (
    <Card>
      <h3 className="mb-2 font-display text-sm font-bold">Price calculator <span className="font-normal text-faint">the exact price and whether it confirms instantly, for live and draft</span></h3>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Field label="From"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="To"><Select value={to} onChange={(e) => setTo(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="Bags"><Input type="number" min={1} value={bags} onChange={(e) => setBags(Math.max(0, Number(e.target.value)))} /></Field>
        <Field label="Oversize"><Input type="number" min={0} value={oversize} onChange={(e) => setOversize(Math.max(0, Number(e.target.value)))} /></Field>
        <Field label="Pickup date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {show("Live now", result(live.routes, live.all, masters.oversizeRate))}
        {draft && show("After publishing the draft", result(draft.routes, draft.all, draft.oversizeRate))}
      </div>
    </Card>
  );
}

/** Customer-facing totals for the chart row: 1, 2 and 3 bags incl. GST. */
export const customerPays = (r: RouteRate) => [1, 2, 3].map((n) => priceFor(r, n)).map((v) => (Number.isFinite(v) ? inr(v) : "—")).join(" · ");
export { laneName };
