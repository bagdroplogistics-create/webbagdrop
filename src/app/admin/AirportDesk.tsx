"use client";
/** BAGDROP OS · Airport desk — SITA × Bagdrop, Mumbai T2 POC.
 *  Board: enrol a booking in a lane (A departures handback · B arrivals ·
 *  C non-flight · D BHS injection), set its flight, see the check-in and
 *  acceptance window, link airline tags (scanner gun, camera or typed),
 *  run the secure hold, scan at T2, hand over, log airline exceptions and
 *  read the append-only custody record.
 *  Bag Journey: the connector's queue, the stand-in log, Flexbox prints not
 *  yet matched to a booking, SITA device status and an event simulator.
 *  Settings: POC carriers and windows, hold spots, meeting points, timings,
 *  the BCAS switch for lane D and the Bag Journey code map.
 *  Every action goes through /api/admin/airport; the server enforces each gate. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { refreshBookings, watchAdminBookings } from "@/lib/adminApi";
import { useNow } from "@/lib/useNow";
import { useLoad } from "@/lib/useLoad";
import { opsOf, pcsLabel } from "@/lib/opsModel";
import {
  AIRPORT_EXCEPTIONS, CUSTODY, CUSTODY_CODES, LANES, activeTags, airportOf, attentionFor, carrierOf, flightLabel, flightOf, flightProblems,
  istShort, openHold, planWindow, slotMs, spacedLp, untaggedPieces,
  type AirportPocConfig, type Carrier, type FlightBlock, type Lane,
} from "@/lib/airportPoc";
import { custodyGaps } from "@/lib/custody";
import { withBase } from "@/lib/basePath";
import CameraScanner from "@/components/CameraScanner";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import type { Booking } from "@/lib/types";

interface DeskData {
  config: AirportPocConfig; liveConfigured: boolean;
  standin: { msgId: string; booking: string; code: string; bdCode: string; at: string; place: string; receivedAt: string; pieces: { piece: number; lp: string | null; bdPlate: string | null }[] }[];
  orphans: { id: string; lp: string; pnr: string; surname: string; airline: string; flightNo: string; device?: string; at: string }[];
  devices: { device: string; state: string; note?: string; at: string }[];
}

async function act(body: Record<string, unknown>): Promise<{ ok: boolean; detail?: string; note?: string; [k: string]: unknown }> {
  const r = await fetch("/api/admin/airport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  refreshBookings();
  return r.ok ? { ok: true, ...j } : { ok: false, detail: j.detail ?? j.error ?? `HTTP ${r.status}` };
}

const Pill = ({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${on ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{children}</button>
);
const H = ({ children, sub }: { children: ReactNode; sub?: string }) => (
  <h3 className="mb-2 font-display text-sm font-bold">{children}{sub && <span className="ml-1.5 font-normal text-faint">{sub}</span>}</h3>
);

export default function AirportDesk() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [data, setData] = useState<DeskData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"board" | "bj" | "cfg">("board");
  const [selId, setSelId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/airport");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.detail ?? j.error ?? `HTTP ${r.status}`); else setData(j as DeskData);
  }, []);
  useLoad(load);
  const now = useNow();

  const cfg = data?.config;
  const enrolled = useMemo(() => bookings.filter((b) => airportOf(b).enrolled), [bookings]);
  /* candidates: open air bookings touching T2, or anything the search names */
  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return bookings.filter((b) => !airportOf(b).enrolled && !["cancelled", "rejected", "delivered"].includes(b.status) &&
      (s ? `${b.id} ${b.traveller.name} ${b.ref}`.toLowerCase().includes(s) : b.mode === "air" && /terminal\s*2|\bT2\b/i.test(`${b.pickAddr} ${b.dropAddr}`))).slice(0, 30);
  }, [bookings, q]);
  const sel = bookings.find((b) => b.id === selId) ?? null;

  const kpi = useMemo(() => {
    const led = enrolled.flatMap((b) => opsOf(b).custody ?? []);
    const handed = enrolled.filter((b) => airportOf(b).t2?.handover);
    return {
      live: enrolled.filter((b) => !airportOf(b).t2?.handover && b.status !== "delivered").length,
      held: enrolled.filter((b) => openHold(airportOf(b))).length,
      tags: enrolled.reduce((s, b) => s + activeTags(airportOf(b)).length, 0),
      gaps: enrolled.filter((b) => custodyGaps(b).length).length,
      exc: enrolled.reduce((s, b) => s + (airportOf(b).exceptions ?? []).filter((e) => !e.resolved).length, 0),
      handed: handed.length,
      bjPending: led.filter((e) => e.bj?.status === "pending").length,
      bjFailed: led.filter((e) => e.bj?.status === "failed").length,
    };
  }, [enrolled]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Airport desk:</b> {err} <button className="ml-2 underline" onClick={() => setErr(null)}>Dismiss</button></p>}
      <Card className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold">SITA × Bagdrop · Mumbai T2 POC</p>
            <p className="text-xs text-muted">Flexbox / Print&amp;Go tag · Bagdrop custody · Bag Journey tracking. Lanes A, B, C live; lane D waits for BCAS.</p>
          </div>
          {cfg && <div className="flex flex-wrap gap-1.5">
            <Badge tone={cfg?.enabled ? "ok" : "warn"}>{cfg?.enabled ? "POC on" : "POC off"}</Badge>
            <Badge tone="info">{cfg?.carriers.filter((c) => c.enabled).map((c) => c.code).join(" · ") || "No carrier enabled"}</Badge>
            <Badge tone={cfg?.bhsInjectionApproved ? "ok" : "muted"}>{cfg?.bhsInjectionApproved ? "Lane D approved" : "Lane D: BCAS pending"}</Badge>
            <Badge tone={cfg?.bagJourney.mode === "live" ? (data?.liveConfigured ? "ok" : "bad") : "warn"}>Bag Journey: {cfg?.bagJourney.mode === "live" ? (data?.liveConfigured ? "live" : "live, not configured") : "stand-in"}</Badge>
          </div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {([["In progress", kpi.live], ["In hold", kpi.held], ["Airline tags", kpi.tags], ["Handed over", kpi.handed], ["Open exceptions", kpi.exc], ["Custody gaps", kpi.gaps], ["To send", kpi.bjPending], ["Sends failed", kpi.bjFailed]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-paper px-3 py-2"><p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</p><p className={`font-display text-lg font-bold ${(k === "Custody gaps" || k === "Sends failed" || k === "Open exceptions") && v ? "text-red-700" : ""}`}>{v}</p></div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        <Pill on={tab === "board"} onClick={() => setTab("board")}>Board · {enrolled.length}</Pill>
        <Pill on={tab === "bj"} onClick={() => setTab("bj")}>Bag Journey{data?.orphans.length ? ` · ${data.orphans.length} unmatched` : ""}</Pill>
        <Pill on={tab === "cfg"} onClick={() => setTab("cfg")}>Settings</Pill>
      </div>

      {!cfg ? <Card><p className="py-8 text-center text-sm text-muted">Loading…</p></Card> : (
        <div key={tab} className="anim-in grid grid-cols-[minmax(0,1fr)] gap-5">
          {tab === "board" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <Card>
                <H sub="enrolled in the POC">T2 bookings</H>
                <div className="max-h-[26rem] overflow-auto">
                  {enrolled.length === 0 && <p className="py-3 text-sm text-muted">None yet. Enrol one from the list below.</p>}
                  {enrolled.map((b) => {
                    const st = airportOf(b), f = flightOf(b);
                    const att = now ? attentionFor(b, cfg, now, custodyGaps(b)) : [];
                    return (
                      <button key={b.id} onClick={() => setSelId(b.id)} className={`w-full cursor-pointer border-b border-line px-1 py-2.5 text-left text-xs last:border-0 hover:bg-paper ${selId === b.id ? "bg-brand-soft" : ""}`}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px]">{b.id}</span>
                          <span className="flex gap-1.5"><Badge tone="info">Lane {st.lane}</Badge>{st.t2?.handover ? <Badge tone="ok">Handed over</Badge> : att.length ? <Badge tone={att.some((a) => a.sev === "bad") ? "bad" : "warn"}>{att.length} to check</Badge> : <Badge tone="ok">On plan</Badge>}</span>
                        </span>
                        <span className="mt-0.5 block text-muted">{b.traveller.name} · {f ? `${flightLabel(f)} ${f.std ? istShort(Date.parse(`${f.std}:00+05:30`)) : ""}` : b.from + " → " + b.to} · {pcsLabel(b.bags, b.oversize)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <H sub="air bookings to or from T2, or search any booking">Add to the POC</H>
                  <Input placeholder="Search ID, name or flight" value={q} onChange={(e) => setQ(e.target.value)} className="!py-2 text-sm" />
                  <div className="mt-2 max-h-56 overflow-auto">
                    {candidates.length === 0 && <p className="py-2 text-xs text-muted">No matching open bookings.</p>}
                    {candidates.map((b) => (
                      <button key={b.id} onClick={() => setSelId(b.id)} className={`w-full cursor-pointer border-b border-dashed border-line px-1 py-2 text-left text-xs last:border-0 hover:bg-paper ${selId === b.id ? "bg-brand-soft" : ""}`}>
                        <span className="font-mono text-[11px]">{b.id}</span> <span className="text-muted">· {b.traveller.name} · {b.ucName} · {b.ref || "no flight"} · {b.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
              {sel ? <BookingDesk key={sel.id} b={sel} cfg={cfg} now={now} onErr={setErr} /> : <Card><p className="py-10 text-center text-sm text-muted">Select a booking. Its flight, window, airline tags, hold, T2 handover and custody record open here.</p></Card>}
            </div>
          )}
          {tab === "bj" && <BagJourneyDesk data={data!} enrolled={enrolled} reload={load} onErr={setErr} />}
          {tab === "cfg" && <SettingsDesk cfg={cfg} onSaved={(c) => setData({ ...data!, config: c })} onErr={setErr} />}
        </div>
      )}
    </div>
  );
}

/* ================= one booking ================= */
function BookingDesk({ b, cfg, now, onErr }: { b: Booking; cfg: AirportPocConfig; now: number | null; onErr: (e: string | null) => void }) {
  const st = airportOf(b), o = opsOf(b);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, okMsg?: string) => {
    setBusy(true); setMsg(null); onErr(null);
    const r = await act({ id: b.id, ...body });
    setBusy(false);
    if (!r.ok) setMsg(r.detail ?? "Refused"); else setMsg(r.note ?? okMsg ?? "Saved");
    return r.ok;
  };
  const dep = st.lane === "A" || st.lane === "D";
  const f = flightOf(b);
  const carrier = f ? carrierOf(cfg, f.airline) : null;
  const plan = f && st.lane !== "C" ? planWindow(f, carrier, cfg, slotMs(b.pickupDate || b.date, b.slot)) : null;
  const att = now ? attentionFor(b, cfg, now, custodyGaps(b)) : [];
  const hold = openHold(st);
  const handed = st.t2?.handover;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-xs">{b.id}</p>
            <p className="font-display text-base font-bold">{b.traveller.name} · {b.from} → {b.to}</p>
            <p className="text-xs text-muted">{b.ucName} · {pcsLabel(b.bags, b.oversize)} · pickup {b.pickupDate || b.date} {b.slot} · {b.status}</p>
          </div>
          <a className="text-xs font-semibold text-brand underline" href={withBase(`/api/admin/airport?report=${encodeURIComponent(b.id)}`)} target="_blank" rel="noreferrer">Custody report</a>
        </div>
        <LaneRow b={b} busy={busy} run={run} />
        {msg && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs">{msg}</p>}
        {att.length > 0 && <ul className="mt-2 space-y-1">{att.map((a) => <li key={a.key} className={`rounded-lg px-3 py-1.5 text-xs ${a.sev === "bad" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>{a.text}</li>)}</ul>}
      </Card>

      {st.enrolled && st.lane !== "C" && <FlightCard key={JSON.stringify(st.flight ?? {})} b={b} cfg={cfg} busy={busy} run={run} />}

      {st.enrolled && plan && (
        <Card>
          <H sub={carrier ? `${carrier.name} · check-in ${carrier.checkinOpensH} h · bags from ${carrier.acceptOpensH} h · drop closes ${carrier.acceptClosesMin} min` : "carrier not in the POC list"}>Window</H>
          {plan.dir === "dep" ? (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {([["Online check-in opens", plan.checkinOpensAt], ["Airline accepts bags", plan.acceptOpensAt], ["Bag drop closes", plan.acceptClosesAt], ["Hand over at T2 by", plan.handoverBy], ["Leave pickup by", plan.latestPickup], ["Leave hold at", plan.releaseFromHoldAt]] as [string, number | undefined][]).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-paper px-3 py-2"><p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{k}</p><p className="font-mono">{v ? istShort(v) : "—"}</p></div>
              ))}
            </div>
          ) : null}
          <p className={`mt-2 text-sm ${plan.verdict === "too_late" || plan.verdict === "before_checkin" ? "text-red-700" : plan.verdict === "hold" ? "text-amber-700" : "text-green-700"}`}>
            {plan.verdict === "hold" ? "Secure hold · " : plan.verdict === "direct" ? "Direct to T2 · " : ""}{plan.note}
          </p>
        </Card>
      )}

      {st.enrolled && dep && <TagsCard b={b} busy={busy} run={run} />}

      {st.enrolled && dep && (
        <Card>
          <H sub="CCTV-covered cage or locker until the acceptance window">Secure hold</H>
          {hold ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>In <b>{hold.spot}</b> since {istShort(Date.parse(hold.inAt))} · CCTV {hold.camera} · {hold.inBy}</span>
              <Button size="sm" disabled={busy} onClick={() => void run({ action: "holdOut" }, "Out of hold")}>Out of hold</Button>
            </div>
          ) : <HoldIn cfg={cfg} busy={busy || !!handed || !!st.t2?.arrivedAt} run={run} />}
          {(st.holds ?? []).filter((h) => h.outAt).map((h, i) => <p key={i} className="mt-1 text-xs text-muted">{h.spot}: {istShort(Date.parse(h.inAt))} to {istShort(Date.parse(h.outAt!))}</p>)}
        </Card>
      )}

      {st.enrolled && dep && <T2Card b={b} cfg={cfg} busy={busy} run={run} />}

      {st.enrolled && <ExceptionsCard b={b} busy={busy} run={run} />}

      {st.enrolled && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <H sub="append-only · every hand-off of every bag">Custody record</H>
            {(o.custody ?? []).some((e) => e.bj?.status === "failed") && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "retryBj" })}>Retry failed sends</Button>}
          </div>
          {custodyGaps(b).map((g) => <p key={g} className="mb-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-900">{g}</p>)}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1 pr-2">Time IST</th><th className="pr-2">Event</th><th className="pr-2">Pieces</th><th className="pr-2">Place</th><th className="pr-2">By</th><th>Bag Journey</th></tr></thead>
              <tbody>
                {(o.custody ?? []).length === 0 && <tr><td colSpan={6} className="py-3 text-muted">No entries yet. The first is written at pickup.</td></tr>}
                {(o.custody ?? []).slice().reverse().map((e) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 font-mono">{istShort(Date.parse(e.at))}</td>
                    <td className="pr-2"><b>{CUSTODY[e.code]}</b>{e.tags?.length ? <span className="block font-mono text-[11px] text-muted">{e.tags.map(spacedLp).join(" · ")}</span> : null}{e.note && <span className="block text-muted">{e.note}</span>}</td>
                    <td className="pr-2">{e.pieces.join(", ") || "—"}</td>
                    <td className="pr-2">{e.place}</td>
                    <td className="pr-2">{e.by}</td>
                    <td><Badge tone={e.bj?.status === "sent" ? "ok" : e.bj?.status === "failed" ? "bad" : e.bj?.status === "pending" ? "warn" : "muted"}>{e.bj?.status === "off" ? "not sent" : e.bj?.status ?? "—"}</Badge>{e.bj?.err && <span className="block text-[11px] text-red-700">{e.bj.err}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(st.airlineEvents ?? []).length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <H sub="received through Bag Journey">Airline and airport events</H>
              {(st.airlineEvents ?? []).slice().reverse().map((e) => <p key={e.id} className="text-xs"><span className="font-mono">{istShort(Date.parse(e.at))}</span> · {e.code} · {spacedLp(e.lp)} {e.text && `· ${e.text}`} {e.place && `· ${e.place}`}</p>)}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function LaneRow({ b, busy, run }: { b: Booking; busy: boolean; run: (x: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const st = airportOf(b);
  const [lane, setLane] = useState<Lane>(st.lane ?? (b.mode === "air" ? (b.uc === "a2d" ? "B" : "A") : "C"));
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="grow text-xs"><span className="mb-1 block font-medium text-muted">Lane</span>
        <Select value={lane} onChange={(e) => setLane(e.target.value as Lane)} className="!py-2 text-sm" disabled={!!st.t2?.handover}>
          {(Object.keys(LANES) as Lane[]).map((k) => <option key={k} value={k}>{k} · {LANES[k]}</option>)}
        </Select>
      </label>
      <Button size="sm" disabled={busy || !!st.t2?.handover || (st.enrolled && st.lane === lane)} onClick={() => void run({ action: "enrol", lane }, `Lane ${lane}`)}>{st.enrolled ? "Change lane" : "Enrol in T2 POC"}</Button>
    </div>
  );
}

function FlightCard({ b, cfg, busy, run }: { b: Booking; cfg: AirportPocConfig; busy: boolean; run: (x: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const st = airportOf(b);
  const seed = st.flight ?? flightOf(b);
  const [f, setF] = useState<Partial<FlightBlock>>({ airline: seed?.airline ?? "", flightNo: seed?.flightNo ?? "", std: seed?.std ?? "", terminal: seed?.terminal || cfg.terminal, pnr: seed?.pnr ?? b.pnr ?? "", surname: seed?.surname ?? (b.traveller.name.split(" ").slice(-1)[0] ?? "").toUpperCase() });
  const arr = st.lane === "B";
  const problems = flightProblems(st.flight ?? null, cfg);
  const set = (k: keyof FlightBlock, v: string) => setF({ ...f, [k]: v });
  return (
    <Card>
      <H sub={st.flight ? "saved" : "not saved yet"}>Flight</H>
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
        <Field label="Airline">
          <Select value={f.airline} onChange={(e) => set("airline", e.target.value)} className="!py-2 text-sm">
            <option value="">Choose</option>
            {cfg.carriers.map((c: Carrier) => <option key={c.code} value={c.code}>{c.code} · {c.name}{c.enabled ? "" : " (not enabled)"}</option>)}
          </Select>
        </Field>
        <Field label="Flight number"><Input value={f.flightNo} onChange={(e) => set("flightNo", e.target.value.toUpperCase())} placeholder="5219" className="!py-2 text-sm" /></Field>
        <Field label={arr ? "Arrival (IST)" : "Departure (IST)"}><Input type="datetime-local" value={f.std} onChange={(e) => set("std", e.target.value)} className="!py-2 text-sm" /></Field>
        <Field label="Terminal">
          <Select value={f.terminal} onChange={(e) => set("terminal", e.target.value)} className="!py-2 text-sm">
            <option value={cfg.terminal}>{cfg.terminal}</option><option value="Terminal 1">Terminal 1</option>
          </Select>
        </Field>
        {!arr && <Field label="PNR"><Input value={f.pnr} onChange={(e) => set("pnr", e.target.value.toUpperCase())} maxLength={6} className="!py-2 font-mono text-sm" /></Field>}
        {!arr && <Field label="Surname on ticket"><Input value={f.surname} onChange={(e) => set("surname", e.target.value.toUpperCase())} className="!py-2 text-sm" /></Field>}
      </div>
      <Button size="sm" disabled={busy} onClick={() => void run({ action: "flight", flight: f }, "Flight saved")}>Save flight</Button>
      {st.flight && problems.map((p) => <p key={p} className="mt-1 text-xs text-amber-800">{p}</p>)}
    </Card>
  );
}

function TagsCard({ b, busy, run }: { b: Booking; busy: boolean; run: (x: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const st = airportOf(b);
  const pieces = b.bags + b.oversize;
  const open = untaggedPieces(st, pieces);
  const [n, setN] = useState<number>(open[0] ?? 1);
  const [scan, setScan] = useState(""), [kg, setKg] = useState(""), [place, setPlace] = useState("Flexbox");
  const [cam, setCam] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null), [reason, setReason] = useState("");
  const link = async (raw: string) => { if (await run({ action: "linkTag", n, scan: raw, weightKg: kg ? Number(kg) : undefined, place }, `Tag linked to piece ${n}`)) { setScan(""); setKg(""); const next = open.filter((x) => x !== n)[0]; if (next) setN(next); } };
  return (
    <Card>
      <H sub={`${activeTags(st).length}/${pieces} pieces tagged · printed at the Flexbox, scanned here`}>Airline tags</H>
      <table className="mb-3 w-full text-xs">
        <tbody>
          {Array.from({ length: pieces }, (_, i) => i + 1).map((k) => {
            const t = activeTags(st).find((x) => x.n === k);
            return (
              <tr key={k} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-2">Piece {k}{k > b.bags ? " XL" : ""}</td>
                <td className="pr-2 font-mono">{t ? spacedLp(t.lp) : <span className="text-amber-700">no airline tag</span>}</td>
                <td className="pr-2 text-muted">{t ? `${t.source === "flexbox" ? "Flexbox" : "scanned"}${t.weightKg ? ` · ${t.weightKg} kg` : ""}` : ""}</td>
                <td className="text-right">{t && !airportOf(b).t2?.handover && <button className="text-xs font-semibold text-red-700 underline" onClick={() => { setVoiding(t.lp); setReason(""); }}>Void</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {voiding && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-red-50 p-2">
          <label className="grow text-xs"><span className="mb-1 block font-medium">Void {spacedLp(voiding)} because</span><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reprint · flight change · torn" className="!py-2 text-sm" /></label>
          <Button size="sm" disabled={busy} onClick={() => void run({ action: "voidTag", lp: voiding, reason }, "Tag voided").then((ok) => ok && setVoiding(null))}>Void tag</Button>
          <Button size="sm" variant="ghost" onClick={() => setVoiding(null)}>Cancel</Button>
        </div>
      )}
      {open.length > 0 && !airportOf(b).t2?.handover && (
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          <Field label="Piece"><Select value={n} onChange={(e) => setN(Number(e.target.value))} className="!py-2 text-sm">{open.map((k) => <option key={k} value={k}>{k}</option>)}</Select></Field>
          <Field label="Airline tag (scan or type)"><Input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && scan) void link(scan); }} placeholder="0312 123456" className="!py-2 font-mono text-sm" /></Field>
          <Field label="Weight kg"><Input value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" className="!py-2 text-sm" /></Field>
          <Field label="Where"><Input value={place} onChange={(e) => setPlace(e.target.value)} className="!py-2 text-sm" /></Field>
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <Button size="sm" disabled={busy || !scan} onClick={() => void link(scan)}>Link tag</Button>
            <Button size="sm" variant="outline" onClick={() => setCam(!cam)}>{cam ? "Close camera" : "Use camera"}</Button>
          </div>
          {cam && <div className="col-span-2 sm:col-span-4"><CameraScanner onRead={setScan} /></div>}
        </div>
      )}
    </Card>
  );
}

function HoldIn({ cfg, busy, run }: { cfg: AirportPocConfig; busy: boolean; run: (x: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [spot, setSpot] = useState(cfg.holdSpots[0]?.id ?? "");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grow text-xs"><span className="mb-1 block font-medium text-muted">Hold spot</span>
        <Select value={spot} onChange={(e) => setSpot(e.target.value)} className="!py-2 text-sm">{cfg.holdSpots.map((h) => <option key={h.id} value={h.id}>{h.name} · CCTV {h.camera}</option>)}</Select>
      </label>
      <Button size="sm" variant="outline" disabled={busy || !spot} onClick={() => void run({ action: "holdIn", spot }, "Into hold")}>Into hold</Button>
    </div>
  );
}

function T2Card({ b, cfg, busy, run }: { b: Booking; cfg: AirportPocConfig; busy: boolean; run: (x: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const st = airportOf(b);
  const pieces = b.bags + b.oversize;
  const [scan, setScan] = useState(""), [bp, setBp] = useState(""), [override, setOverride] = useState(""), [receiver, setReceiver] = useState(""), [hid, setHid] = useState("");
  const [cam, setCam] = useState<"bag" | "bp" | null>(null);
  const handed = st.t2?.handover;
  const scanned = st.t2?.scanned ?? [];
  if (handed) return <Card><H>Mumbai T2</H><p className="text-sm text-green-800">Handed over {istShort(Date.parse(handed.at))} to {handed.receiver} · {handed.proof} · by {handed.by}. Bagdrop custody ended.</p></Card>;
  return (
    <Card>
      <H sub={`${scanned.length}/${pieces} scanned${st.t2?.arrivedAt ? " · all here" : ""}`}>Mumbai T2</H>
      {!st.t2?.arrivedAt && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grow text-xs"><span className="mb-1 block font-medium text-muted">Scan each bag (airline or Bagdrop tag)</span>
            <Input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && scan) void run({ action: "t2Scan", scan }).then((ok) => ok && setScan("")); }} className="!py-2 font-mono text-sm" />
          </label>
          <Button size="sm" disabled={busy || !scan} onClick={() => void run({ action: "t2Scan", scan }).then((ok) => ok && setScan(""))}>Scan</Button>
          <Button size="sm" variant="outline" onClick={() => setCam(cam === "bag" ? null : "bag")}>{cam === "bag" ? "Close camera" : "Camera"}</Button>
        </div>
      )}
      {cam === "bag" && <CameraScanner onRead={setScan} />}
      {st.t2?.arrivedAt && st.lane === "A" && (
        <div className="grid gap-2">
          <p className="text-xs text-muted">Hand back to {b.traveller.name}{cfg.meetPoints.find((m) => m.lane === "dep") ? ` at ${cfg.meetPoints.find((m) => m.lane === "dep")!.name}` : ""}. Scan the guest&apos;s mobile boarding pass; it must match the flight, PNR and surname.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grow text-xs"><span className="mb-1 block font-medium text-muted">Boarding pass</span><Input value={bp} onChange={(e) => setBp(e.target.value)} className="!py-2 font-mono text-xs" placeholder="M1SURNAME/GIVEN …" /></label>
            <Button size="sm" variant="outline" onClick={() => setCam(cam === "bp" ? null : "bp")}>{cam === "bp" ? "Close camera" : "Camera"}</Button>
          </div>
          {cam === "bp" && <CameraScanner onRead={setBp} />}
          <label className="text-xs"><span className="mb-1 block font-medium text-muted">Or, if it can&apos;t be scanned, say why (checked by hand)</span><Input value={override} onChange={(e) => setOverride(e.target.value)} className="!py-2 text-sm" /></label>
          <div><Button size="sm" disabled={busy || (!bp && override.trim().length < 10)} onClick={() => void run({ action: "handoverPax", ...(bp ? { boardingPass: bp } : { override }) }, "Handed back")}>Hand back to the passenger</Button></div>
        </div>
      )}
      {st.t2?.arrivedAt && st.lane === "D" && (
        <div className="grid gap-2">
          {!cfg.bhsInjectionApproved && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">BHS injection is off until BCAS, MIAL, the airline and the handler approve it.</p>}
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Handler name"><Input value={receiver} onChange={(e) => setReceiver(e.target.value)} className="!py-2 text-sm" /></Field>
            <Field label="Staff or AEP number"><Input value={hid} onChange={(e) => setHid(e.target.value)} className="!py-2 text-sm" /></Field>
          </div>
          <div><Button size="sm" disabled={busy || !cfg.bhsInjectionApproved} onClick={() => void run({ action: "handoverHandler", receiver, handlerId: hid }, "Handed to the handler")}>Hand to the handler</Button></div>
        </div>
      )}
    </Card>
  );
}

function ExceptionsCard({ b, busy, run }: { b: Booking; busy: boolean; run: (x: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const st = airportOf(b);
  const [kind, setKind] = useState<string>("dcs_reject"), [note, setNote] = useState(""), [n, setN] = useState("");
  const [res, setRes] = useState<Record<string, string>>({});
  return (
    <Card>
      <H sub="airline cases · each needs a root cause to close">Exceptions</H>
      {(st.exceptions ?? []).map((e) => (
        <div key={e.id} className="mb-2 rounded-lg border border-line p-2 text-xs">
          <p><Badge tone={e.resolved ? "ok" : "bad"}>{AIRPORT_EXCEPTIONS[e.kind]?.name ?? e.kind}</Badge> <span className="font-mono">{istShort(Date.parse(e.at))}</span>{e.n ? ` · piece ${e.n}` : ""} · {e.by}</p>
          <p className="mt-1">{e.note}</p>
          {e.resolved ? <p className="mt-1 text-green-800">Resolved: {e.resolution} · {e.resolvedBy}</p> : (
            <>
              <p className="mt-1 text-muted">Standard response: {AIRPORT_EXCEPTIONS[e.kind]?.response}</p>
              <div className="mt-1 flex gap-2"><Input value={res[e.id] ?? ""} onChange={(x) => setRes({ ...res, [e.id]: x.target.value })} placeholder="Root cause and fix" className="!py-1.5 text-xs" />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "resolve", excId: e.id, resolution: res[e.id] ?? "" }, "Resolved")}>Resolve</Button></div>
            </>
          )}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-[1.2fr_0.5fr_2fr_auto] sm:items-end">
        <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)} className="!py-2 text-sm">{Object.entries(AIRPORT_EXCEPTIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</Select></Field>
        <Field label="Piece"><Input value={n} onChange={(e) => setN(e.target.value)} inputMode="numeric" placeholder="all" className="!py-2 text-sm" /></Field>
        <Field label="What happened"><Input value={note} onChange={(e) => setNote(e.target.value)} className="!py-2 text-sm" /></Field>
        <div className="mb-3"><Button size="sm" variant="outline" disabled={busy || note.trim().length < 3} onClick={() => void run({ action: "exception", kind, note, n: n ? Number(n) : undefined }, "Exception logged").then((ok) => ok && setNote(""))}>Log</Button></div>
      </div>
    </Card>
  );
}

/* ================= Bag Journey ================= */
function BagJourneyDesk({ data, enrolled, reload, onErr }: { data: DeskData; enrolled: Booking[]; reload: () => Promise<void>; onErr: (e: string | null) => void }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const [sim, setSim] = useState({ kind: "tag_printed", lp: "", pnr: "", surname: "", airline: "6E", flightNo: "", code: "LOADED", text: "", type: "dcs_reject", device: "FLEX-T2-01", state: "online", weightKg: "" });
  const [match, setMatch] = useState<Record<string, string>>({});
  const queue = enrolled.flatMap((b) => (opsOf(b).custody ?? []).map((e) => ({ b, e })));
  const count = (s: string) => queue.filter((x) => x.e.bj?.status === s).length;
  const go = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg(null); onErr(null);
    const r = await act(body);
    setBusy(false);
    setMsg(r.ok ? (body.action === "sendBj" ? `Sent ${r.sent} · failed ${r.failed} · waiting ${r.waiting}` : r.orphan ? "Stored as an unmatched Flexbox print" : r.duplicate ? "Already received (same event id)" : ok) : r.detail ?? "Refused");
    await reload();
  };
  const simulate = () => {
    const eventId = `SIM-${Date.now().toString(36)}`;
    const ev = sim.kind === "tag_printed" ? { kind: sim.kind, eventId, lp: sim.lp, pnr: sim.pnr, surname: sim.surname, airline: sim.airline, flightNo: sim.flightNo, device: sim.device, weightKg: sim.weightKg ? Number(sim.weightKg) : undefined }
      : sim.kind === "airline_event" ? { kind: sim.kind, eventId, lp: sim.lp, code: sim.code, text: sim.text, place: "BOM T2" }
      : sim.kind === "exception" ? { kind: sim.kind, eventId, lp: sim.lp || undefined, pnr: sim.pnr || undefined, type: sim.type, note: sim.text }
      : { kind: sim.kind, eventId, device: sim.device, state: sim.state, note: sim.text };
    void go({ action: "simulate", event: ev }, "Event processed");
  };
  const S = (k: keyof typeof sim, label: string, mono = false) => <Field label={label}><Input value={sim[k]} onChange={(e) => setSim({ ...sim, [k]: e.target.value })} className={`!py-2 text-sm ${mono ? "font-mono" : ""}`} /></Field>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
      <Card>
        <H sub={data.config.bagJourney.mode === "standin" ? "stand-in until SITA shares the interface" : data.liveConfigured ? "live" : "live, but BAG_JOURNEY_URL / TOKEN not set"}>Outbound queue</H>
        <div className="mb-3 flex flex-wrap gap-2 text-xs"><Badge tone="warn">{count("pending")} to send</Badge><Badge tone="ok">{count("sent")} sent</Badge><Badge tone={count("failed") ? "bad" : "muted"}>{count("failed")} failed</Badge><Badge>{count("off")} not for Bag Journey</Badge></div>
        <Button size="sm" disabled={busy} onClick={() => void go({ action: "sendBj" }, "Sent")}>Send now</Button>
        <p className="mt-2 text-xs text-muted">The automation sweep sends on its own; failures retry after 1, 2, 4 … minutes, up to {data.config.bagJourney.maxTries} tries. Only custody codes, places, tag and seal numbers leave Bagdrop: no names, phones or addresses.</p>
        {msg && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs">{msg}</p>}
        <div className="mt-3 max-h-80 overflow-auto border-t border-line pt-2">
          <p className="mb-1 text-xs font-semibold">Stand-in log · what SITA would receive</p>
          {data.standin.length === 0 && <p className="text-xs text-muted">Nothing sent yet.</p>}
          {data.standin.map((m) => <p key={m.msgId} className="border-b border-dashed border-line py-1 font-mono text-[11px]">{istShort(Date.parse(m.at))} · {m.code} · {m.booking} · {m.place} · {m.pieces.map((p) => p.lp ? spacedLp(p.lp) : p.bdPlate ?? `#${p.piece}`).join(", ")}</p>)}
        </div>
      </Card>
      <Card>
        <H sub="the webhook /api/sita/bag-event runs the same code, signed">Simulate a SITA event</H>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Event"><Select value={sim.kind} onChange={(e) => setSim({ ...sim, kind: e.target.value })} className="!py-2 text-sm">
            <option value="tag_printed">Tag printed at a Flexbox</option><option value="airline_event">Airline / airport scan</option><option value="exception">Exception</option><option value="device_status">Device status</option>
          </Select></Field>
          {sim.kind !== "device_status" && S("lp", "Licence plate (10 digits)", true)}
          {(sim.kind === "tag_printed" || sim.kind === "exception") && S("pnr", "PNR", true)}
          {sim.kind === "tag_printed" && <>{S("surname", "Surname")}{S("airline", "Airline")}{S("flightNo", "Flight")}{S("weightKg", "Weight kg")}</>}
          {(sim.kind === "tag_printed" || sim.kind === "device_status") && S("device", "Device")}
          {sim.kind === "airline_event" && S("code", "Code (e.g. LOADED)")}
          {sim.kind === "exception" && <Field label="Type"><Select value={sim.type} onChange={(e) => setSim({ ...sim, type: e.target.value })} className="!py-2 text-sm">{Object.entries(AIRPORT_EXCEPTIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</Select></Field>}
          {sim.kind === "device_status" && S("state", "State")}
          {sim.kind !== "tag_printed" && S("text", "Text")}
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={simulate}>Process event</Button>
      </Card>
      <Card>
        <H sub="printed at a Flexbox, no booking matched the PNR and surname">Unmatched Flexbox prints</H>
        {data.orphans.length === 0 && <p className="text-xs text-muted">None.</p>}
        {data.orphans.map((o) => (
          <div key={o.id} className="mb-2 flex flex-wrap items-end gap-2 border-b border-dashed border-line pb-2 text-xs">
            <span className="grow"><span className="font-mono">{spacedLp(o.lp)}</span> · {o.airline} {o.flightNo} · PNR {o.pnr} · {o.surname} · {o.device ?? ""} · {istShort(Date.parse(o.at))}</span>
            <Select value={match[o.id] ?? ""} onChange={(e) => setMatch({ ...match, [o.id]: e.target.value })} className="!w-56 !py-1.5 text-xs">
              <option value="">Match to booking</option>{enrolled.filter((b) => airportOf(b).lane === "A" || airportOf(b).lane === "D").map((b) => <option key={b.id} value={b.id}>{b.id} · {b.traveller.name}</option>)}
            </Select>
            <Button size="sm" variant="outline" disabled={busy || !match[o.id]} onClick={() => void go({ action: "matchOrphan", orphanId: o.id, id: match[o.id] }, "Matched")}>Link</Button>
          </div>
        ))}
      </Card>
      <Card>
        <H sub="reported by SITA">Devices</H>
        {data.devices.length === 0 && <p className="text-xs text-muted">No device has reported yet.</p>}
        {data.devices.map((d) => <p key={d.device} className="text-xs"><Badge tone={/online|ok/i.test(d.state) ? "ok" : "bad"}>{d.device}</Badge> {d.state} {d.note && `· ${d.note}`} · {istShort(Date.parse(d.at))}</p>)}
      </Card>
    </div>
  );
}

/* ================= settings ================= */
function SettingsDesk({ cfg, onSaved, onErr }: { cfg: AirportPocConfig; onSaved: (c: AirportPocConfig) => void; onErr: (e: string | null) => void }) {
  const [c, setC] = useState<AirportPocConfig>(cfg);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null); onErr(null);
    const r = await act({ action: "saveConfig", config: c });
    setBusy(false);
    if (r.ok) { onSaved(r.config as AirportPocConfig); setC(r.config as AirportPocConfig); setMsg("Saved"); } else setMsg(r.detail ?? "Refused");
  };
  const car = (i: number, k: keyof Carrier, v: unknown) => setC({ ...c, carriers: c.carriers.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const numIn = (k: "transitMin" | "handoverBufferMin" | "holdAlertMin" | "reclaimMin", label: string) => (
    <Field label={label}><Input type="number" value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} className="!py-2 text-sm" /></Field>
  );
  const check = (k: "enabled" | "enforceOnBooking" | "bhsInjectionApproved", label: string, hint: string) => (
    <label key={k} className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" checked={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} className="mt-1" /><span><b>{label}</b><span className="block text-xs text-muted">{hint}</span></span></label>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card>
        <H sub={cfg.updatedAt ? `last saved ${istShort(Date.parse(cfg.updatedAt))} by ${cfg.updatedBy}` : "defaults from SITA's deck"}>POC switches</H>
        <div className="grid gap-3 sm:grid-cols-3">
          {check("enabled", "POC running", "Shows the POC as live on the desk.")}
          {check("enforceOnBooking", "Only POC carriers at T2", "Website air bookings to BOM T2 must be on an enabled carrier.")}
          {check("bhsInjectionApproved", "Lane D approved", "Tick only with written BCAS, MIAL, airline and handler approval.")}
        </div>
      </Card>
      <Card>
        <H sub="enable each carrier only once it is live on SITA Print&Go; windows are the deck's figures until SITA confirms">Carriers</H>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead><tr className="text-left text-muted"><th className="pr-2">Code</th><th className="pr-2">Name</th><th className="pr-2">Tag code (3 digits)</th><th className="pr-2">Check-in opens (h)</th><th className="pr-2">Bags from (h)</th><th className="pr-2">Drop closes (min)</th><th className="pr-2">Max kg</th><th>Enabled</th></tr></thead>
            <tbody>
              {c.carriers.map((x, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2"><Input value={x.code} onChange={(e) => car(i, "code", e.target.value.toUpperCase())} maxLength={2} className="!w-14 !px-2 !py-1.5 font-mono text-xs" /></td>
                  <td className="pr-2"><Input value={x.name} onChange={(e) => car(i, "name", e.target.value)} className="!py-1.5 text-xs" /></td>
                  <td className="pr-2"><Input value={x.numeric ?? ""} onChange={(e) => car(i, "numeric", e.target.value)} maxLength={3} placeholder="SITA to confirm" className="!w-28 !px-2 !py-1.5 font-mono text-xs" /></td>
                  {(["checkinOpensH", "acceptOpensH", "acceptClosesMin", "maxBagKg"] as const).map((k) => <td key={k} className="pr-2"><Input type="number" value={x[k]} onChange={(e) => car(i, k, Number(e.target.value))} className="!w-20 !px-2 !py-1.5 text-xs" /></td>)}
                  <td><input type="checkbox" checked={x.enabled} onChange={(e) => car(i, "enabled", e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setC({ ...c, carriers: [...c.carriers, { code: "", name: "", enabled: false, checkinOpensH: 48, acceptOpensH: 10, acceptClosesMin: 60, maxBagKg: 32 }] })}>Add carrier</Button>
      </Card>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <H>Timings</H>
          <div className="grid grid-cols-2 gap-x-3">
            {numIn("transitMin", "Hub or hotel to T2 (min)")}{numIn("handoverBufferMin", "Hand over before drop closes (min)")}
            {numIn("holdAlertMin", "Hold release alert (min before)")}{numIn("reclaimMin", "Arrivals: reclaim time (min)")}
          </div>
        </Card>
        <Card>
          <H sub="CCTV-covered">Hold spots</H>
          {c.holdSpots.map((h, i) => (
            <div key={i} className="mb-1 grid grid-cols-[4rem_1fr_6rem] gap-2">
              <Input value={h.id} onChange={(e) => setC({ ...c, holdSpots: c.holdSpots.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} className="!px-2 !py-1.5 font-mono text-xs" />
              <Input value={h.name} onChange={(e) => setC({ ...c, holdSpots: c.holdSpots.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="!py-1.5 text-xs" />
              <Input value={h.camera} onChange={(e) => setC({ ...c, holdSpots: c.holdSpots.map((x, j) => (j === i ? { ...x, camera: e.target.value } : x)) })} placeholder="Camera" className="!py-1.5 text-xs" />
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setC({ ...c, holdSpots: [...c.holdSpots, { id: `H${c.holdSpots.length + 1}`, name: "", camera: "" }] })}>Add hold spot</Button>
          <H sub="to agree with MIAL">T2 meeting points</H>
          {c.meetPoints.map((m, i) => (
            <div key={i} className="mb-1 grid grid-cols-[4rem_1fr_6rem] gap-2">
              <Input value={m.id} onChange={(e) => setC({ ...c, meetPoints: c.meetPoints.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} className="!px-2 !py-1.5 font-mono text-xs" />
              <Input value={m.name} onChange={(e) => setC({ ...c, meetPoints: c.meetPoints.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="!py-1.5 text-xs" />
              <Select value={m.lane} onChange={(e) => setC({ ...c, meetPoints: c.meetPoints.map((x, j) => (j === i ? { ...x, lane: e.target.value as "dep" | "arr" } : x)) })} className="!py-1.5 text-xs"><option value="dep">Departures</option><option value="arr">Arrivals</option></Select>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <H sub="placeholder codes until SITA shares its catalogue">Bag Journey</H>
        <div className="mb-3 grid grid-cols-2 gap-x-3 sm:grid-cols-4">
          <Field label="Transport"><Select value={c.bagJourney.mode} onChange={(e) => setC({ ...c, bagJourney: { ...c.bagJourney, mode: e.target.value as "standin" | "live" } })} className="!py-2 text-sm"><option value="standin">Stand-in (record only)</option><option value="live">Live (BAG_JOURNEY_URL)</option></Select></Field>
          <Field label="Max tries"><Input type="number" value={c.bagJourney.maxTries} onChange={(e) => setC({ ...c, bagJourney: { ...c.bagJourney, maxTries: Number(e.target.value) } })} className="!py-2 text-sm" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CUSTODY_CODES.map((k) => (
            <label key={k} className="text-xs"><span className="mb-0.5 block text-muted">{CUSTODY[k]}</span>
              <Input value={c.bagJourney.codes[k]} onChange={(e) => setC({ ...c, bagJourney: { ...c.bagJourney, codes: { ...c.bagJourney.codes, [k]: e.target.value } } })} className="!py-1.5 font-mono text-xs" /></label>
          ))}
        </div>
      </Card>
      <div className="flex items-center gap-3"><Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save settings"}</Button>{msg && <span className="text-sm">{msg}</span>}</div>
    </div>
  );
}
