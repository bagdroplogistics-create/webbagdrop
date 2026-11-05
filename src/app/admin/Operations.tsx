"use client";
/** Admin OS · Operations Control — the COO desk that takes over after the LR.
 *
 *  · Milestone chain: LR → Pickup assigned → Picked & sealed → In-scan →
 *    Linehaul depart → Arrive → Out for delivery → POD. Scan-gated stages
 *    cannot complete until every bag tag is scanned (camera or typed, both
 *    checksum-validated) — errors are prevented at entry, six-sigma style.
 *  · Airline-grade bag tags, seals, stickers and the Move Pass: see
 *    ./BagTagsPanel.tsx (licence plates BD BDQ 004218 7, Code 128 + QR).
 *  · Legs: own captains for pickup/delivery, vendors for linehaul — vendor
 *    picked from the master (ranked by score), one tap opens the WhatsApp
 *    brief; every assignment is logged.
 *  · Target costing per lane (cost model master) — booking a cost above
 *    target demands the ops passcode + reason; live gross margin on every
 *    shipment.
 *  · Moves calendar (./MovesCalendar.tsx): every consignment by day, week
 *    and month, drag to reschedule, clubbing suggestions. DPMO/sigma strip
 *    on top. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncedState } from "@/lib/stateSync";
import { useLoad } from "@/lib/useLoad";
import { inr } from "@/lib/pricing";
import { adminApplyPatch, refreshBookings, watchAdminBookings } from "@/lib/adminApi";
import { isPaid } from "@/lib/payState";
import { nextLabel } from "@/lib/journey";
import JourneyPanel, { lifecycle } from "./JourneyPanel";
import Guide from "./Guide";
import { SignaturePad } from "@/app/d/[token]/BagFlows";
import { useLoad as useReload } from "@/lib/useLoad";
import {
  DEFAULT_COST_MODEL, EXCEPTION_KINDS, LEGS, MILESTONES, RECEIVER_RELATIONS, STAGE_OF, STEP_FIELDS, VEHICLE_KINDS, actualCost, isXlTag, pcsLabel,
  marginPct, opsOf, sixSigma, stepMissing, targetCost, undoLast, validateTag,
  type Captain, type CostModel, type LegKey, type MilestoneKey, type OpsMasters, type OpsState, type StepDetail, type VehicleRec, type Vendor,
} from "@/lib/opsModel";
import type { Booking } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select, TableFrame } from "@/components/ui";
import MovesCalendar from "./MovesCalendar";
import CameraScanner from "@/components/CameraScanner";
import { bagForScan, spaced } from "@/lib/bagTags";
import BagTagsPanel from "./BagTagsPanel";

const OPS_PASSCODE = "2026";
const ACTIVE = ["accepted", "assigned", "picked_up", "in_transit"];
const wa = (m: string | undefined, t: string) => `https://wa.me/${(m ?? "").replace(/\D/g, "").replace(/^(?!91)/, "91")}?text=${encodeURIComponent(t)}`;

export default function Operations() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [masters, setMasters] = useState<OpsMasters>({ hubs: [], vehicles: [], captains: [] });
  const [model, setModel] = useState<CostModel>(DEFAULT_COST_MODEL);
  const [err, setErr] = useState<string | null>(null);
  const [desk, setDesk] = useState<"ship" | "day" | "vend" | "masters" | "cost" | "auto" | "how">("ship");
  const [showCancelled, setShowCancelled] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  const loadMasters = useCallback(async () => {
    const r = await fetch("/api/admin/ops");
    const j = await r.json();
    if (j.error) setErr(j.error); else { setVendors(j.vendors); setModel(j.costModel); setMasters({ hubs: j.hubs ?? [], vehicles: j.vehicles ?? [], captains: j.captains ?? [] }); }
  }, []);
  useLoad(loadMasters);

  const active = useMemo(() => bookings.filter((b) => ACTIVE.includes(b.status)), [bookings]);
  const cancelled = useMemo(() => bookings.filter((b) => b.status === "cancelled" && opsOf(b).milestones?.lr), [bookings]);
  const sel = bookings.find((b) => b.id === selId) ?? null;
  const sigma = useMemo(() => sixSigma(bookings), [bookings]);

  async function saveOps(b: Booking, ops: OpsState, patch: Partial<Booking>, event: string) {
    try {
      setErr(null);
      await adminApplyPatch(b, { ...patch, admin: { ...b.admin, ops } }, event);
    } catch (e) {
      // e.g. the identity gate: pickup refused until Aadhaar UIDAI is verified
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Operations:</b> {err}</p>}

      {/* six-sigma strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active shipments" value={String(active.length)} />
        <Kpi label="Open exceptions" value={String(sigma.defects)} warn={sigma.defects > 0} />
        <Kpi label="DPMO" value={sigma.opportunities ? String(sigma.dpmo) : "—"} hint={`${sigma.opportunities} opportunities`} />
        <Kpi label="Sigma level" value={sigma.opportunities ? `${sigma.sigma}σ` : "—"} hint="defects per million" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([["ship", "Shipments"], ["day", "Moves calendar"], ["masters", `Captains · vehicles · hubs`], ["vend", `Vendors · ${vendors.length}`], ["cost", "Cost model"], ["auto", "Automation"], ["how", "How it works"]] as const).map(([k, n]) => (
          <button key={k} onClick={() => setDesk(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${desk === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{n}</button>
        ))}
      </div>

      <div key={desk} className="anim-in grid gap-5">
        {desk === "ship" && (
          <div className="grid min-w-0 gap-4">
            <Card className="min-w-0">
              <h3 className="mb-2 font-display text-sm font-bold">Active shipments <span className="font-normal text-faint">LR onwards · select one to open its desk</span></h3>
              {active.length === 0 && <p className="py-4 text-center text-sm text-muted">Nothing moving. Accept a booking in Shipments first.</p>}
              {active.length > 0 && (
                <TableFrame maxHeight="18rem">
                  <table className="text-[13px]">
                    <thead><tr className="text-left"><th>Booking</th><th>Traveller</th><th>Lane</th><th>Pieces</th><th>Date</th><th>Next</th><th>Progress</th><th className="text-right">Margin</th></tr></thead>
                    <tbody>
                      {active.map((b) => {
                        const o = opsOf(b);
                        const done = Object.keys(o.milestones ?? {}).length;
                        const mg = marginPct(b);
                        return (
                          <tr key={b.id} onClick={() => setSelId(b.id)} className={`cursor-pointer ${selId === b.id ? "bg-brand-soft" : ""}`}>
                            <td><button className="w-full cursor-pointer text-left font-mono text-xs">{b.id}</button></td>
                            <td>{b.traveller.name}</td>
                            <td>{b.from} → {b.to}</td>
                            <td>{pcsLabel(b.bags, b.oversize)}</td>
                            <td className="text-xs text-muted">{b.date}</td>
                            <td><Badge tone={nextLabel(b) === "Waiting for payment" ? "warn" : "info"}>{nextLabel(b)}</Badge></td>
                            <td><span className="flex items-center gap-2"><span className="block h-1.5 w-24 rounded-full bg-paper"><span className="block h-1.5 rounded-full bg-brand" style={{ width: `${(done / MILESTONES.length) * 100}%` }} /></span><span className="text-[11px] text-muted">{done}/{MILESTONES.length}</span></span></td>
                            <td className="text-right">{mg !== null ? <span className={`font-semibold ${mg < model.marginFloorPct ? "text-amber-600" : "text-green-700"}`}>{mg}%</span> : <span className="text-faint">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableFrame>
              )}
              {cancelled.length > 0 && (
                <div className="mt-3 border-t border-line pt-2 text-xs">
                  <button className="cursor-pointer font-semibold text-muted hover:text-brand" onClick={() => setShowCancelled((v) => !v)}>{showCancelled ? "Hide" : "Show"} cancelled · {cancelled.length}</button>
                  {restoreErr && <p className="mt-1 text-red-700">{restoreErr}</p>}
                  {showCancelled && cancelled.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 border-b border-dashed border-line py-1.5 last:border-0">
                      <span><span className="font-mono text-[11px]">{b.id}</span> <span className="text-muted">· {b.traveller.name} · {b.from} → {b.to}</span></span>
                      <Button size="sm" variant="outline" onClick={async () => { setRestoreErr(null); const r = await lifecycle(b.id, "restore"); if (!r.ok) setRestoreErr(r.error); else setSelId(b.id); }}>Restore</Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            {sel ? <ShipmentDesk key={sel.id} b={sel} vendors={vendors} masters={masters} model={model} onSave={saveOps} onScore={async (id, onTime) => {
              await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scoreVendor", id, onTime }) });
              await loadMasters();
            }} /> : <Card><p className="py-10 text-center text-sm text-muted">Select a shipment — the full operation opens here: milestones, tags, vendors, costing.</p></Card>}
          </div>
        )}
        {desk === "day" && <MovesCalendar bookings={bookings} model={model} onOpen={(id) => { setSelId(id); setDesk("ship"); }} />}
        {desk === "vend" && <Vendors vendors={vendors} onSaved={loadMasters} />}
        {desk === "masters" && <MastersDesk m={masters} onSaved={loadMasters} />}
        {desk === "cost" && <CostDesk model={model} onSaved={loadMasters} />}
        {desk === "auto" && <AutomationDesk />}
        {desk === "how" && <Guide />}
      </div>
    </div>
  );
}

/* ================= the single-shipment operation desk ================= */
const STAGES = ["Start", "Pickup", "Middle mile", "Last mile"] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
/** datetime-local (IST wall clock) → ISO with the +05:30 offset, so the server reads it right. */
const istIso = (v: string) => (v ? `${v}:00+05:30` : "");
const FIELD_LABEL: Record<string, string> = { hub: "Hub", mode: "Mode", vendor: "Vendor", ref: "LR / trip / AWB", vehicle: "Vehicle", driver: "Driver", driverPhone: "Driver phone", eta: "ETA", seals: "Seals", broken: "Broken", captain: "Captain", mobile: "Phone", receiver: "Received by", relation: "Relation" };
/* the database stores keys in its own order: show them in the form's order */
const DETAIL_ORDER = Object.keys(FIELD_LABEL);
const showDetail = (d?: StepDetail) => Object.entries(d ?? {}).filter(([, v]) => v).sort(([a], [b]) => (DETAIL_ORDER.indexOf(a) + 1 || 99) - (DETAIL_ORDER.indexOf(b) + 1 || 99)).map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${k === "eta" && Number.isFinite(Date.parse(v)) ? when(v) : v}`).join(" · ");

function ShipmentDesk({ b, vendors, masters, model, onSave, onScore }: {
  b: Booking; vendors: Vendor[]; masters: OpsMasters; model: CostModel;
  onSave: (b: Booking, ops: OpsState, patch: Partial<Booking>, event: string) => Promise<void>;
  onScore: (vendorId: string, onTime: boolean) => Promise<void>;
}) {
  const o = opsOf(b);
  const lane = `${b.from} → ${b.to}`;
  const target = o.target ?? targetCost(model, lane);
  const pieces = b.bags + b.oversize;
  const [scanInput, setScanInput] = useState("");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [exc, setExc] = useState({ kind: "", note: "", eta: "" });
  const [undo, setUndo] = useState<string | null>(null);
  const [lrBusy, setLrBusy] = useState(false);
  const [lrErr, setLrErr] = useState<string | null>(null);
  const [costForm, setCostForm] = useState<{ leg: LegKey | null; amount: string; reason: string; pass: string }>({ leg: null, amount: "", reason: "", pass: "" });
  const [camera, setCamera] = useState(false);
  const [podLinks, setPodLinks] = useState<{ podPhoto?: string | null; podSignature?: string | null }>({});
  /* the camera calls back with a stable function; it always runs the latest registerScan */
  const scanRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const onCameraRead = useCallback((v: string) => { void scanRef.current(v); }, []);

  const nextIdx = MILESTONES.findIndex((m) => !o.milestones?.[m.key]);
  const next = nextIdx >= 0 ? MILESTONES[nextIdx] : null;
  const scansFor = (k: MilestoneKey) => o.scans?.[k] ?? [];
  const scanGateOpen = !next?.scan || (o.tags?.length ? scansFor(next.key).length >= (o.tags?.length ?? pieces) : false);
  const paid = isPaid(b) || !!b.payer;
  const podAt = b.pod?.at;
  useEffect(() => {
    if (!podAt) return;
    let live = true;
    fetch(`/api/admin/tags?id=${encodeURIComponent(b.id)}&info=1`).then((r) => r.json()).then((j) => { if (live) setPodLinks(j); }).catch(() => undefined);
    return () => { live = false; };
  }, [b.id, podAt]);

  /** a desk-entered step (hub in-scan, line-haul, arrival, out for delivery) */
  async function complete(detail: StepDetail) {
    if (!next) return;
    const now = new Date().toISOString();
    let ops: OpsState = { ...o, target, milestones: { ...o.milestones, [next.key]: { at: now, by: "ops", entry: "ops", detail } } };
    if (next.key === "arrive" && detail.seals === "Seal broken") {
      ops = { ...ops, exceptions: [...(o.exceptions ?? []), { kind: "Seal broken", at: now, by: "ops", note: `A seal was found broken on arrival at ${detail.hub}. We are checking every bag piece by piece before delivery and will call you.` }] };
    }
    await onSave(b, ops, { status: next.status as Booking["status"] }, `Ops · ${next.name} · ${showDetail(detail)}`);
  }

  async function issueLr() {
    setLrBusy(true); setLrErr(null);
    try {
      const r = await fetch("/api/admin/trips/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: b.id, autoTrip: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setLrErr(j.detail ?? j.error ?? "Couldn't issue the LR."); else refreshBookings();
    } finally { setLrBusy(false); }
  }

  async function doUndo() {
    const u = undoLast(o);
    if (!u || !undo || undo.trim().length < 5) return;
    const name = MILESTONES.find((m) => m.key === u.key)!.name;
    const ops: OpsState = { ...u.ops, undone: [...(o.undone ?? []), { key: u.key, at: new Date().toISOString(), by: "ops", reason: undo.trim() }] };
    await onSave(b, ops, { status: u.status as Booking["status"], ...(u.key === "pod" ? { pod: null } : {}) }, `Undo · ${name} taken back — ${undo.trim()}`);
    setUndo(null);
  }

  async function registerScan(raw: string) {
    if (!next?.scan) return;
    /* a licence plate (BD BDQ 004218 7, or the tag QR) maps to its bag's route code */
    const bag = bagForScan(o.bags ?? [], raw);
    const tag = bag ? bag.code : raw.trim().toUpperCase();
    if (!validateTag(tag)) { setScanMsg(`Not accepted: ${tag || "(empty)"} — checksum failed, not a valid Bagdrop tag`); return; }
    if (!o.tags?.includes(tag)) { setScanMsg(`Not accepted: ${tag} — valid tag, but it belongs to a different shipment`); return; }
    if (scansFor(next.key).includes(tag)) { setScanMsg(`Already scanned: ${tag}${isXlTag(b, tag) ? " (XL)" : ""} for this stage`); return; }
    const ops: OpsState = { ...o, scans: { ...o.scans, [next.key]: [...scansFor(next.key), tag] } };
    await onSave(b, ops, {}, `Scan · ${tag}${isXlTag(b, tag) ? " (XL)" : ""} @ ${next.name}`);
    setScanMsg(`Scanned ${tag}${isXlTag(b, tag) ? " (XL)" : ""} (${scansFor(next.key).length + 1}/${o.tags?.length})`);
    setScanInput("");
  }

  useEffect(() => { scanRef.current = registerScan; });

  useEffect(() => { scanRef.current = registerScan; });

  async function assignLeg(leg: LegKey, assignee: string, mobile?: string, vendorId?: string) {
    const now = new Date().toISOString();
    /* assigning the pickup captain IS the "Pickup assigned" step (once the LR is in) */
    const assignStep = leg === "pickup" && o.milestones?.lr && !o.milestones?.assign;
    const ops: OpsState = {
      ...o, target, legs: { ...o.legs, [leg]: { assignee, mobile, vendorId, at: now } },
      ...(assignStep ? { milestones: { ...o.milestones, assign: { at: now, by: "ops", entry: "ops" as const, detail: { captain: assignee, mobile: mobile ?? "" } } } } : {}),
    };
    await onSave(b, ops, leg === "pickup" ? { status: o.milestones?.picked ? b.status : "assigned", admin: { ...b.admin, captain: assignee, ops } } : {}, `Ops · ${leg} assigned to ${assignee}${mobile ? ` (${mobile})` : ""}`);
    if (mobile) {
      const brief = `BAGDROP ${leg.toUpperCase()} BRIEF\nLR/Ref: ${b.lr?.no ?? b.id}\nLane: ${lane}\nPieces: ${pcsLabel(b.bags, b.oversize)} (tags: ${(o.bags ?? []).map((x) => `${spaced(x.plate)}${x.xl ? " XL" : ""}`).join(", ") || "to be printed"})\nDate: ${b.date} · window ${b.slot}\nPickup: ${b.pickAddr}\nDeliver: ${b.dropAddr}\nContact: ${b.traveller.name} ${b.traveller.mobile}\nAt pickup: tag and seal every bag, weigh it, photograph it, get the customer's signature — send them to the desk; the desk records the pickup.`;
      window.open(wa(mobile, brief), "_blank");
    }
  }

  async function logCost() {
    if (!costForm.leg) return;
    const amount = Number(costForm.amount) || 0;
    const newActual = actualCost(o) - (o.legs?.[costForm.leg]?.cost ?? 0) + amount;
    const over = newActual > target.total;
    if (over && costForm.pass !== OPS_PASSCODE) { setScanMsg("Not saved: cost exceeds target — ops passcode + reason required"); return; }
    if (over && !costForm.reason.trim()) { setScanMsg("Not saved: a written reason is required to exceed target"); return; }
    const ops: OpsState = {
      ...o, target,
      legs: { ...o.legs, [costForm.leg]: { ...(o.legs?.[costForm.leg] ?? { assignee: "—", at: new Date().toISOString() }), cost: amount } },
      ...(over ? { overTarget: { by: newActual - target.total, reason: costForm.reason, approvedAt: new Date().toISOString() } } : {}),
    };
    await onSave(b, ops, {}, `Ops · ${costForm.leg} cost ${inr(amount)}${over ? ` · OVER TARGET by ${inr(newActual - target.total)} (${costForm.reason})` : ""}`);
    setCostForm({ leg: null, amount: "", reason: "", pass: "" });
    setScanMsg(null);
  }

  async function raiseException() {
    if (!exc.kind || !exc.note.trim()) return;
    const ops: OpsState = { ...o, exceptions: [...(o.exceptions ?? []), { kind: exc.kind, note: exc.note.trim(), at: new Date().toISOString(), by: "ops", ...(exc.eta ? { eta: istIso(exc.eta) } : {}) }] };
    await onSave(b, ops, {}, `PROBLEM · ${exc.kind} — ${exc.note.trim()}${exc.eta ? ` · new ETA ${when(istIso(exc.eta))}` : ""} · client told`);
    setExc({ kind: "", note: "", eta: "" });
  }
  async function resolveException(i: number) {
    const list = [...(o.exceptions ?? [])];
    const e = list[i]; if (!e) return;
    list[i] = { ...e, resolved: true, resolvedAt: new Date().toISOString() };
    await onSave(b, { ...o, exceptions: list }, {}, `Problem cleared · ${e.kind} — ${e.note}`);
  }

  const actual = actualCost(o);
  const mg = marginPct(b);
  const custUpdate = next
    ? `BAGDROP UPDATE · ${b.id}\n${MILESTONES.filter((m) => o.milestones?.[m.key]).map((m) => `Done: ${m.name}`).join("\n")}\nNext: ${next.name}\nTrack live on your booking page.`
    : `BAGDROP · ${b.id} delivered. Thank you for travelling light with us.`;
  const lastDone = [...MILESTONES].reverse().find((m) => o.milestones?.[m.key]);
  const refresh = () => refreshBookings();

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold">{b.id} <span className="font-normal text-muted">· {lane}</span></h3>
          <p className="text-xs text-muted">{b.traveller.name} · {b.traveller.mobile} · {pieces} pieces · {b.date} {b.slot}{b.lr ? ` · LR ${b.lr.no}` : ""}</p>
        </div>
        <div className="text-right text-xs">
          <span className={`block font-display text-lg font-extrabold ${mg !== null && mg < model.marginFloorPct ? "text-amber-600" : "text-green-700"}`}>{mg !== null ? `${mg}% GM` : "— GM"}</span>
          <span className="text-muted">cost {inr(actual)} / target {inr(target.total)}</span>
          {o.overTarget && <span className="block font-semibold text-red-600">over target by {inr(o.overTarget.by)}</span>}
        </div>
      </div>

      <div className="mt-3"><JourneyPanel b={b} compact /></div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      {/* the journey, stage by stage: every done step shows what was recorded */}
      <div className="grid content-start gap-3">
        {STAGES.map((stage) => (
          <div key={stage}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{stage}</p>
            <div className="grid gap-1">
              {MILESTONES.filter((m) => STAGE_OF[m.key] === stage).map((m) => {
                const done = o.milestones?.[m.key];
                const isNext = next?.key === m.key;
                const d = m.key === "pod" && b.pod ? { receiver: b.pod.receiver, relation: b.pod.relation ?? "" } : done?.detail;
                return (
                  <div key={m.key} data-step={m.key} className={`rounded-lg px-2 py-1.5 text-xs ${isNext ? "bg-brand-soft" : ""}`}>
                    <div className="flex items-center gap-2.5">
                      <i className={`size-2.5 flex-none rounded-full ${done ? "bg-green-500" : isNext ? "animate-pulse bg-brand" : "bg-line"}`} />
                      <span className={`flex-1 ${done ? "font-semibold text-ink" : isNext ? "font-semibold" : "text-faint"}`}>{m.name}{done ? " · done" : isNext ? " · next" : ""}</span>
                      {done && <span className="text-faint">{when(done.at)} · {done.entry === "ops" || done.by === "ops" ? "entered by ops" : done.by}</span>}
                      {isNext && m.scan && <Badge tone={scanGateOpen ? "ok" : "warn"}>{scansFor(m.key).length}/{o.tags?.length ?? pieces} scanned</Badge>}
                    </div>
                    {done && (showDetail(d) || done.note) && <p className="ml-5 mt-0.5 text-muted" data-detail={m.key}>{showDetail(d) || done.note}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* the next step: what it needs, and the way to record it */}
      <div className="rounded-xl border-2 border-brand/30 p-4" data-next={next?.key ?? "done"}>
        {!next && (
          <div className="grid gap-1 text-xs">
            <p className="font-display text-[13px] font-bold text-green-700">Delivered · POD {b.pod?.no ?? ""}</p>
            {b.pod && <p>Received by <b>{b.pod.receiver}</b>{b.pod.relation ? ` (${b.pod.relation})` : ""} on {when(b.pod.at)} · OTP verified</p>}
            <p className="flex gap-3">
              {podLinks.podPhoto && <a className="font-semibold text-brand" href={podLinks.podPhoto} target="_blank" rel="noreferrer">Delivery photo</a>}
              {podLinks.podSignature && <a className="font-semibold text-brand" href={podLinks.podSignature} target="_blank" rel="noreferrer">Receiver signature</a>}
            </p>
          </div>
        )}
        {next && <h4 className="mb-2 font-display text-[13px] font-bold">Next · {next.name}</h4>}
        {next?.key === "lr" && (
          paid ? (
            <div className="grid gap-2 text-xs">
              <p className="text-muted">Payment is accepted. The LR is issued automatically within a minute; issue it now if you don&apos;t want to wait.</p>
              <Button size="sm" disabled={lrBusy} onClick={() => void issueLr()}>Issue LR now</Button>
              {lrErr && <p className="text-red-600">{lrErr}</p>}
            </div>
          ) : <p className="text-xs text-muted">Waiting for payment. The operation starts the moment payment is accepted.</p>
        )}
        {next?.key === "assign" && (
          <p className="text-xs text-muted">Assign the pickup captain under <b>Legs &amp; assignment</b> below. That completes this step and sends the client the captain&apos;s name and phone.</p>
        )}
        {next?.key === "picked" && (
          <DeskPickup b={b} captains={masters.captains} vehicles={masters.vehicles} onChanged={refresh} />
        )}
        {next && STEP_FIELDS[next.key] && (
          <StepForm key={next.key} stepKey={next.key} o={o} gateOpen={scanGateOpen} scan={!!next.scan} masters={masters} vendors={vendors}
            initial={next.key === "depart" ? { mode: b.mode === "air" ? "Air" : b.mode === "rail" ? "Rail" : "Road", vendor: o.legs?.linehaul?.assignee ?? "", ref: b.lr?.no ?? "" } : {}}
            onSave={(d) => complete(d)} />
        )}
        {next?.key === "pod" && (
          <DeskDelivery b={b} onChanged={(delivered) => { refresh(); if (delivered && o.legs?.linehaul?.vendorId) void onScore(o.legs.linehaul.vendorId, true); }} />
        )}
        {lastDone && lastDone.key !== "lr" && (
          <div className="mt-3 border-t border-line pt-2 text-xs">
            {undo === null ? (
              <Button size="sm" variant="ghost" onClick={() => setUndo("")}>Undo “{lastDone.name}”</Button>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input className="flex-1 py-2 text-xs" placeholder={`Why is "${lastDone.name}" being undone? (required)`} value={undo} onChange={(e) => setUndo(e.target.value)} />
                <Button size="sm" variant="outline" disabled={undo.trim().length < 5} onClick={() => void doUndo()}>Undo step</Button>
                <Button size="sm" variant="ghost" onClick={() => setUndo(null)}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </div>

      </div>

      {/* tags + scanning */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BagTagsPanel b={b} />
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Scan {next?.scan ? `· ${next.name}` : ""}</h4>
          {!next?.scan ? <p className="text-xs text-muted">Current stage needs no scan.</p> : (
            <>
              <div className="flex gap-2">
                <Input className="font-mono text-xs" placeholder="BD BDQ 004218 7 · or route code" value={scanInput} onChange={(e) => setScanInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void registerScan(scanInput); }} />
                <Button size="sm" onClick={() => void registerScan(scanInput)}>Scan</Button>
              </div>
              <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setCamera((v) => !v)}>{camera ? "Stop camera" : "Scan with camera"}</Button>
              {camera && <CameraScanner onRead={onCameraRead} />}
            </>
          )}
          {scanMsg && <p className={`mt-2 text-xs ${scanMsg.startsWith("Scanned") ? "text-green-700" : scanMsg.startsWith("Already") ? "text-muted" : "text-red-600"}`}>{scanMsg}</p>}
        </div>
      </div>

      {/* legs & vendors */}
      <h4 className="mt-4 mb-1.5 font-display text-[13px] font-bold">Legs &amp; assignment</h4>
      <div className="grid gap-2">
        {LEGS.map((leg) => {
          const a = o.legs?.[leg.key];
          return (
            <LegRow key={leg.key} leg={leg} assigned={a} vendors={vendors} captains={masters.captains} lane={lane} targetLeg={target.legs[leg.key]}
              onAssign={(name, mobile, vendorId) => void assignLeg(leg.key, name, mobile, vendorId)}
              onCost={() => setCostForm({ leg: leg.key, amount: String(a?.cost ?? ""), reason: "", pass: "" })} />
          );
        })}
      </div>
      {costForm.leg && (
        <div className="mt-2 rounded-xl bg-paper p-3">
          <p className="mb-2 text-xs font-semibold">Log actual cost · {costForm.leg} <span className="font-normal text-muted">target {inr(target.legs[costForm.leg])} · shipment target {inr(target.total)}</span></p>
          <div className="flex flex-wrap gap-2">
            <Input className="w-28" placeholder="₹" inputMode="numeric" value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })} />
            <Input className="flex-1" placeholder="Reason (required only if over target)" value={costForm.reason} onChange={(e) => setCostForm({ ...costForm, reason: e.target.value })} />
            <Input className="w-28" placeholder="Passcode" type="password" value={costForm.pass} onChange={(e) => setCostForm({ ...costForm, pass: e.target.value })} />
            <Button size="sm" onClick={() => void logCost()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setCostForm({ leg: null, amount: "", reason: "", pass: "" })}>Cancel</Button>
          </div>
        </div>
      )}

      {/* share + problems */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Share update</h4>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => window.open(wa(b.traveller.mobile, custUpdate), "_blank")}>Client WhatsApp</Button>
            {o.legs?.linehaul?.mobile && <Button size="sm" variant="outline" onClick={() => window.open(wa(o.legs!.linehaul!.mobile, `BAGDROP ${b.id} · ${lane}\nStatus: ${next ? "next — " + next.name : "delivered"}\nPieces: ${pieces}. Confirm handoff scans.`), "_blank")}>Vendor WhatsApp</Button>}
          </div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Problem <span className="font-normal text-faint">the client is told and sees it on tracking</span></h4>
          <div className="grid gap-1.5">
            <Select className="py-2 text-xs" value={exc.kind} onChange={(e) => setExc({ ...exc, kind: e.target.value })} aria-label="Problem kind">
              <option value="">Kind of problem…</option>{EXCEPTION_KINDS.map((k) => <option key={k}>{k}</option>)}
            </Select>
            <Input className="py-2 text-xs" placeholder="What happened and what we're doing (sent to the client)" value={exc.note} onChange={(e) => setExc({ ...exc, note: e.target.value })} />
            <label className="grid gap-0.5 text-[11px] text-muted">New expected time (optional)
              <Input type="datetime-local" className="py-2 text-xs" value={exc.eta} onChange={(e) => setExc({ ...exc, eta: e.target.value })} /></label>
            {exc.kind && <p className="text-[11px] text-muted">Selected: <b>{exc.kind}</b>{exc.eta ? ` · new ETA ${when(istIso(exc.eta))}` : ""}</p>}
            <Button size="sm" variant="outline" disabled={!exc.kind || !exc.note.trim()} onClick={() => void raiseException()}>Raise and tell the client</Button>
          </div>
          {(o.exceptions ?? []).map((e, i) => (
            <div key={i} className={`mt-1.5 flex items-start justify-between gap-2 text-xs ${e.resolved ? "text-muted line-through" : "text-red-600"}`}>
              <span><b>{e.kind}</b> · {e.note}{e.eta ? ` · ETA ${when(e.eta)}` : ""}</span>
              {!e.resolved && <Button size="sm" variant="ghost" onClick={() => void resolveException(i)}>Clear</Button>}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ================= a desk-entered step: fill its details, then complete ================= */
function StepForm({ stepKey, o, initial, gateOpen, scan, onSave, masters, vendors }: {
  stepKey: MilestoneKey; o: OpsState; initial: StepDetail; gateOpen: boolean; scan: boolean; onSave: (d: StepDetail) => Promise<void>; masters: OpsMasters; vendors: Vendor[];
}) {
  const [d, setD] = useState<StepDetail>(initial);
  /* pick-lists from the in-house masters; "Other" keeps a typed value */
  const pickOptions = (k: "hub" | "vehicle" | "vendor" | "captain"): string[] =>
    k === "hub" ? masters.hubs.map((h) => `${h.city} · ${h.name}`)
    : k === "vehicle" ? masters.vehicles.map((v) => v.number)
    : k === "vendor" ? vendors.filter((v) => v.type === "linehaul" || v.type === "air cargo").map((v) => v.name)
    : masters.captains.map((c) => c.name);
  const onPick = (k: string, v: string) => {
    const nd: StepDetail = { ...d, [k]: v };
    if (k === "vehicle") { const veh = masters.vehicles.find((x) => x.number === v); if (veh?.driver) nd.driver = veh.driver; if (veh?.driverPhone) nd.driverPhone = veh.driverPhone; }
    setD(nd);
  };
  const [busy, setBusy] = useState(false);
  const fields = (STEP_FIELDS[stepKey] ?? []).filter((f) => !(stepKey === "depart" && (f.k === "driver" || f.k === "driverPhone") && d.mode && d.mode !== "Road") && !(f.k === "broken" && d.seals !== "Seal broken"));
  const value = (k: string) => (k === "eta" && d.eta ? d.eta.slice(0, 16) : d[k] ?? "");
  const saved: StepDetail = { ...d, ...(d.eta ? { eta: d.eta.length === 16 ? istIso(d.eta) : d.eta } : {}) };
  const missing = stepMissing(stepKey, saved, o);
  return (
    <div className="grid gap-2" data-form={stepKey}>
      <div className="grid gap-x-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.k} label={f.label}>
            {f.type === "select" ? (
              <Select value={value(f.k)} onChange={(e) => setD({ ...d, [f.k]: e.target.value })} aria-label={f.label}>
                <option value="">Choose…</option>{f.options!.map((x) => <option key={x}>{x}</option>)}
              </Select>
            ) : f.type === "pick" ? (
              <PickField label={f.label} value={value(f.k)} options={pickOptions(f.pick!)} hint={f.hint} onChange={(v) => onPick(f.k, v)} />
            ) : (
              <Input type={f.type === "datetime" ? "datetime-local" : f.type === "tel" ? "tel" : "text"} value={value(f.k)} placeholder={f.hint ?? ""} aria-label={f.label}
                onChange={(e) => setD({ ...d, [f.k]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
      {showDetail(saved) && <p className="text-[11px] text-muted">Selected: {showDetail(saved)}</p>}
      {missing.length > 0 && <p className="text-[11px] text-amber-700">Still needed: {missing.join(", ")}</p>}
      {scan && !gateOpen && <p className="text-[11px] text-amber-700">Scan every bag tag below first.</p>}
      <Button size="sm" disabled={busy || missing.length > 0 || (scan && !gateOpen)} onClick={async () => { setBusy(true); try { await onSave(saved); } finally { setBusy(false); } }}>
        Save and complete
      </Button>
    </div>
  );
}

/* ================= leg row with vendor picker ================= */
function LegRow({ leg, assigned, vendors, captains, lane, targetLeg, onAssign, onCost }: {
  leg: (typeof LEGS)[number]; assigned?: { assignee: string; mobile?: string; cost?: number }; vendors: Vendor[]; captains: Captain[];
  lane: string; targetLeg: number;
  onAssign: (name: string, mobile?: string, vendorId?: string) => void; onCost: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState({ name: "", mobile: "" });
  const ranked = useMemo(() => {
    const [from, to] = lane.split(" → ");
    return [...vendors]
      .filter((v) => leg.key !== "linehaul" ? v.type !== "linehaul" && v.type !== "air cargo" : (v.type === "linehaul" || v.type === "air cargo"))
      .sort((a, b) => {
        const scoreOf = (v: Vendor) => ((v.jobs ? (v.onTime ?? 0) / v.jobs : 0.5) * 100) - v.rate / 100 + ((v.lanes ?? "").includes(from) || (v.lanes ?? "").includes(to) ? 20 : 0);
        return scoreOf(b) - scoreOf(a);
      });
  }, [vendors, lane, leg.key]);

  return (
    <div className="rounded-xl border border-line p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><b className="font-display">{leg.name}</b> <span className="text-faint">· target {inr(targetLeg)}</span></span>
        {assigned ? (
          <span className="flex items-center gap-2">
            <Badge tone="ok">{assigned.assignee}</Badge>
            {assigned.cost !== undefined && <span className="tabular-nums text-muted">{inr(assigned.cost)}</span>}
            <Button size="sm" variant="ghost" onClick={onCost}>Cost</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>Change</Button>
          </span>
        ) : (
          <span className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{leg.who === "vendor" ? "Pick vendor" : "Assign captain"}</Button>
            <Button size="sm" variant="ghost" onClick={onCost}>Cost</Button>
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 grid gap-1.5">
          {leg.who === "vendor" ? (
            ranked.length === 0 ? <p className="text-muted">No vendors in the master yet — add them in the Vendors desk.</p> :
            ranked.slice(0, 5).map((v) => (
              <button key={v.id} onClick={() => { onAssign(v.name, v.mobile, v.id); setOpen(false); }}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-white px-2.5 py-2 text-left hover:border-brand">
                <span><b>{v.name}</b> <span className="text-faint">· {v.type} · {v.lanes || "any lane"}</span></span>
                <span className="text-muted">{inr(v.rate)} · {v.jobs ? Math.round(((v.onTime ?? 0) / v.jobs) * 100) + "% OT" : "new"}</span>
              </button>
            ))
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {captains.length > 0 && (
                <Select className="w-44 py-2 text-xs" aria-label="Captain from the master" value="" onChange={(e) => { const c = captains.find((x) => x.id === e.target.value); if (c) setCap({ name: c.name, mobile: c.mobile }); }}>
                  <option value="">From the master…</option>{captains.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.city ?? ""}</option>)}
                </Select>
              )}
              <Input className="w-36 py-2 text-xs" placeholder="Captain name" value={cap.name} onChange={(e) => setCap({ ...cap, name: e.target.value })} />
              <Input className="w-36 py-2 text-xs" placeholder="Mobile" value={cap.mobile} onChange={(e) => setCap({ ...cap, mobile: e.target.value })} />
              <Button size="sm" disabled={!cap.name} onClick={() => { onAssign(cap.name, cap.mobile || undefined); setOpen(false); }}>Assign + brief</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ================= a pick-list with "Other" (typed) ================= */
function PickField({ label, value, options, hint, onChange }: { label: string; value: string; options: string[]; hint?: string; onChange: (v: string) => void }) {
  const listed = options.includes(value);
  const [other, setOther] = useState(!!value && !listed);
  if (options.length === 0 || other) {
    return (
      <div className="grid gap-1">
        <Input value={value} placeholder={hint ?? ""} aria-label={label} onChange={(e) => onChange(e.target.value)} />
        {options.length > 0 && <button className="cursor-pointer text-left text-[11px] text-muted hover:text-brand" onClick={() => { setOther(false); onChange(""); }}>Pick from the list instead</button>}
        {options.length === 0 && <span className="text-[11px] text-faint">No entries in the master yet (Captains · vehicles · hubs tab) — typed for now.</span>}
      </div>
    );
  }
  return (
    <Select value={listed ? value : ""} aria-label={label} onChange={(e) => { if (e.target.value === "__other") { setOther(true); onChange(""); } else onChange(e.target.value); }}>
      <option value="">Choose…</option>{options.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other (type it)</option>
    </Select>
  );
}

/* ================= in-house pickup record: full proof, typed by the team ================= */
type FieldState = { pieces: number; lrIssued: boolean; picked: boolean; bags: { n: number; plate: string; xl: boolean; seal: string | null; weightKg: number | null; photo: boolean; checkedIn: boolean }[] };
function useFieldState(id: string, leg: "pickup" | "lastmile") {
  const [st, setSt] = useState<FieldState & { arrived?: boolean; delivered?: boolean; podPhoto?: boolean } | null>(null);
  const load = useCallback(async () => { const r = await fetch(`/api/admin/ops/field?id=${encodeURIComponent(id)}&leg=${leg}`, { cache: "no-store" }); const j = await r.json().catch(() => ({})); if (j.state) setSt(j.state); }, [id, leg]);
  useReload(load);
  const act = useCallback(async (body: Record<string, unknown> | FormData) => {
    const isForm = body instanceof FormData;
    if (isForm) { body.set("id", id); body.set("leg", leg); }
    const r = await fetch("/api/admin/ops/field", isForm ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, leg, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (j.state) setSt(j.state);
    return r.ok && !j.error ? { ok: true as const } : { ok: false as const, error: (j.detail ?? j.error ?? `HTTP_${r.status}`) as string };
  }, [id, leg]);
  return { st, act, reload: load };
}

function DeskPickup({ b, captains, vehicles, onChanged }: { b: Booking; captains: Captain[]; vehicles: VehicleRec[]; onChanged: () => void }) {
  const { st, act } = useFieldState(b.id, "pickup");
  const o = opsOf(b);
  const [kg, setKg] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [head, setHead] = useState({ captain: o.legs?.pickup?.assignee ?? "", vehicle: "", at: "", note: "" });
  if (!st) return <p className="text-xs text-muted">Loading the bags…</p>;
  const run = async (body: Record<string, unknown> | FormData, okText: string) => { setBusy(true); setMsg(null); try { const r = await act(body); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error }); if (r.ok) onChanged(); return r.ok; } finally { setBusy(false); } };
  const allIn = st.bags.length > 0 && st.bags.length === st.pieces && st.bags.every((x) => x.checkedIn && x.photo);
  return (
    <div className="grid gap-3" data-desk-pickup>
      <p className="text-xs text-muted">Record the pickup as it happened: each bag&apos;s tag and seal from the printed set, its weight and photo, then the client&apos;s signature. Everything is marked as entered by ops.</p>
      {st.bags.length < st.pieces && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>{st.bags.length ? `${st.pieces - st.bags.length} piece(s) have no tag yet.` : "Tags and seals aren't issued yet."}</span>
          <Button size="sm" disabled={busy} onClick={() => void run({ action: "issue" }, "Tags and seals issued.")}>Issue tags &amp; seals</Button>
        </div>
      )}
      <div className="grid gap-x-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Pickup captain"><PickField label="Pickup captain" value={head.captain} options={captains.map((c) => c.name)} onChange={(v) => setHead({ ...head, captain: v })} /></Field>
        <Field label="Vehicle"><PickField label="Vehicle" value={head.vehicle} options={vehicles.map((v) => v.number)} onChange={(v) => setHead({ ...head, vehicle: v })} /></Field>
        <Field label="Picked up at"><Input type="datetime-local" aria-label="Picked up at" value={head.at} onChange={(e) => setHead({ ...head, at: e.target.value })} /></Field>
        <Field label="Remarks"><Input aria-label="Pickup remarks" value={head.note} onChange={(e) => setHead({ ...head, note: e.target.value })} placeholder="optional" /></Field>
      </div>
      {st.bags.length > 0 && (
        <TableFrame>
          <table className="text-[13px]">
            <thead><tr className="text-left"><th>Piece</th><th>Tag</th><th>Seal</th><th>Weight kg</th><th>Photo</th><th></th></tr></thead>
            <tbody>
              {st.bags.map((x) => (
                <tr key={x.n} data-piece={x.n}>
                  <td>{x.n}{x.xl ? " · XL" : ""}</td>
                  <td className="font-mono text-xs">{x.plate}</td>
                  <td className="font-mono text-xs">{x.seal ?? "—"}</td>
                  <td>{x.checkedIn ? <span>{x.weightKg} kg</span> : <Input className="w-24" inputMode="decimal" aria-label={`Weight piece ${x.n}`} value={kg[x.n] ?? ""} onChange={(e) => setKg({ ...kg, [x.n]: e.target.value })} placeholder="18.5" />}</td>
                  <td>{x.photo ? <span className="text-green-700">on file</span> : (
                    <label className="cursor-pointer rounded-lg border border-dashed border-line px-2 py-1 text-xs font-semibold">Attach photo
                      <input type="file" accept="image/*" className="hidden" aria-label={`Photo piece ${x.n}`} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("n", String(x.n)); fd.set("photo", f); void run(fd, `Photo saved for piece ${x.n}.`); e.target.value = ""; }} />
                    </label>
                  )}</td>
                  <td className="text-right">{!x.checkedIn && <Button size="sm" disabled={busy || !kg[x.n]} onClick={() => void run({ action: "checkin", n: x.n, tag: x.plate, seal: x.seal ?? "", weightKg: Number(kg[x.n]), heavyOk: true }, `Piece ${x.n} recorded.`)}>Record</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
      {st.bags.length > 0 && !allIn && <p className="text-[11px] text-amber-700">Still needed: {st.bags.filter((x) => !x.checkedIn || !x.photo).map((x) => `piece ${x.n} ${!x.checkedIn ? "weight" : "photo"}`).join(", ")}.</p>}
      {allIn && (
        <SignaturePad busy={busy} title="Client's signature" hint="Draw it from the signed pickup sheet, or upload the signed sheet's photo as piece 1's photo and sign here on their behalf, noting it in remarks." button="Record pickup"
          disabled={!head.captain} onError={(t) => setMsg({ ok: false, text: t })}
          onDone={(sig) => void run({ action: "complete", signature: sig, captain: head.captain, vehicle: head.vehicle, at: head.at ? `${head.at}:00+05:30` : "", note: head.note }, "Picked up & sealed recorded.")} />
      )}
      {allIn && !head.captain && <p className="text-[11px] text-amber-700">Pick the pickup captain first.</p>}
      {msg && <p className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

/* ================= in-house delivery record: receiver, relation, time, photo optional ================= */
function DeskDelivery({ b, onChanged }: { b: Booking; onChanged: (delivered: boolean) => void }) {
  const { st, act } = useFieldState(b.id, "lastmile");
  const o = opsOf(b);
  const [f, setF] = useState({ receiver: b.traveller.name, relation: "Self", at: "", note: "", captain: o.legs?.lastmile?.assignee ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!st) return <p className="text-xs text-muted">Loading…</p>;
  const run = async (body: Record<string, unknown> | FormData, okText: string, delivered = false) => { setBusy(true); setMsg(null); try { const r = await act(body); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error }); if (r.ok) onChanged(delivered); return r.ok; } finally { setBusy(false); } };
  return (
    <div className="grid gap-3" data-desk-delivery>
      <p className="text-xs text-muted">Record the handover: who took the bags, their relation to the traveller, when, and the photo if there is one. The client gets the delivered message.</p>
      <div className="grid gap-x-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Received by"><Input aria-label="Received by" value={f.receiver} onChange={(e) => setF({ ...f, receiver: e.target.value })} /></Field>
        <Field label="Relation to the traveller"><Select aria-label="Relation" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>{RECEIVER_RELATIONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Delivered at"><Input type="datetime-local" aria-label="Delivered at" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
        <Field label="Delivery captain"><Input aria-label="Delivery captain" value={f.captain} onChange={(e) => setF({ ...f, captain: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-semibold">{st.podPhoto ? "Replace the handover photo" : "Attach the handover photo (optional)"}
          <input type="file" accept="image/*" className="hidden" aria-label="Handover photo" onChange={(e) => { const x = e.target.files?.[0]; if (!x) return; const fd = new FormData(); fd.set("kind", "pod"); fd.set("photo", x); void run(fd, "Handover photo saved."); e.target.value = ""; }} />
        </label>
        {st.podPhoto && <span className="text-xs text-green-700">photo on file</span>}
        <Input className="flex-1" aria-label="Delivery remarks" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Remarks (optional)" />
      </div>
      {f.receiver.trim() && <p className="text-[11px] text-muted">Selected: <b>{f.receiver.trim()}</b> · {f.relation}{f.at ? ` · ${f.at.replace("T", " ")}` : ""}</p>}
      <Button size="sm" disabled={busy || f.receiver.trim().length < 2} onClick={() => void run({ action: "deliverDesk", receiver: f.receiver.trim(), relation: f.relation, at: f.at ? `${f.at}:00+05:30` : "", note: f.note, captain: f.captain }, "Delivered · POD recorded.", true)}>Record delivery</Button>
      {msg && <p className={`text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}

/* ================= captains · vehicles · hubs ================= */
function MastersDesk({ m, onSaved }: { m: OpsMasters; onSaved: () => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);
  const [cap, setCap] = useState({ name: "", mobile: "", city: "", role: "both" });
  const [veh, setVeh] = useState({ number: "", type: VEHICLE_KINDS[0] as string, owner: "", driver: "", driverPhone: "", city: "" });
  const [hub, setHub] = useState({ city: "", name: "", address: "", contact: "", phone: "" });
  const post = async (body: Record<string, unknown>) => {
    setErr(null);
    const r = await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.detail ?? j.error ?? `HTTP_${r.status}`); return false; }
    await onSaved(); return true;
  };
  const row = "flex items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-xs last:border-0";
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900 xl:col-span-3">{err}</p>}
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Captains <span className="font-normal text-faint">pickup and delivery</span></h3>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Name"><Input value={cap.name} onChange={(e) => setCap({ ...cap, name: e.target.value })} /></Field>
          <Field label="Mobile"><Input inputMode="tel" value={cap.mobile} onChange={(e) => setCap({ ...cap, mobile: e.target.value })} /></Field>
          <Field label="City"><Input value={cap.city} onChange={(e) => setCap({ ...cap, city: e.target.value })} /></Field>
          <Field label="Role"><Select value={cap.role} onChange={(e) => setCap({ ...cap, role: e.target.value })}><option value="both">Pickup and delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></Select></Field>
        </div>
        <Button size="sm" disabled={!cap.name.trim() || cap.mobile.replace(/\D/g, "").length < 10} onClick={async () => { if (await post({ action: "saveCaptain", captain: cap })) setCap({ name: "", mobile: "", city: "", role: "both" }); }}>Add captain</Button>
        <div className="mt-3">{m.captains.length === 0 && <p className="text-xs text-muted">No captains yet.</p>}{m.captains.map((c) => (
          <div key={c.id} className={row}><span><b>{c.name}</b> · {c.mobile}{c.city ? ` · ${c.city}` : ""} <span className="text-faint">· {c.role === "both" ? "pickup and delivery" : c.role}</span></span><Button size="sm" variant="ghost" onClick={() => void post({ action: "deleteCaptain", id: c.id })}>Remove</Button></div>
        ))}</div>
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Vehicles</h3>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Number"><Input value={veh.number} onChange={(e) => setVeh({ ...veh, number: e.target.value.toUpperCase() })} placeholder="GJ06 AB 4412" /></Field>
          <Field label="Type"><Select value={veh.type} onChange={(e) => setVeh({ ...veh, type: e.target.value })}>{VEHICLE_KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
          <Field label="Owner"><Input value={veh.owner} onChange={(e) => setVeh({ ...veh, owner: e.target.value })} placeholder="own / vendor name" /></Field>
          <Field label="City"><Input value={veh.city} onChange={(e) => setVeh({ ...veh, city: e.target.value })} /></Field>
          <Field label="Usual driver"><Input value={veh.driver} onChange={(e) => setVeh({ ...veh, driver: e.target.value })} /></Field>
          <Field label="Driver phone"><Input inputMode="tel" value={veh.driverPhone} onChange={(e) => setVeh({ ...veh, driverPhone: e.target.value })} /></Field>
        </div>
        <Button size="sm" disabled={!veh.number.trim()} onClick={async () => { if (await post({ action: "saveVehicle", vehicle: veh })) setVeh({ number: "", type: VEHICLE_KINDS[0], owner: "", driver: "", driverPhone: "", city: "" }); }}>Add vehicle</Button>
        <div className="mt-3">{m.vehicles.length === 0 && <p className="text-xs text-muted">No vehicles yet.</p>}{m.vehicles.map((v) => (
          <div key={v.id} className={row}><span><b className="font-mono">{v.number}</b> · {v.type}{v.driver ? ` · ${v.driver}` : ""}{v.city ? ` · ${v.city}` : ""}</span><Button size="sm" variant="ghost" onClick={() => void post({ action: "deleteVehicle", id: v.id })}>Remove</Button></div>
        ))}</div>
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Hubs</h3>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="City"><Input value={hub.city} onChange={(e) => setHub({ ...hub, city: e.target.value })} /></Field>
          <Field label="Hub name"><Input value={hub.name} onChange={(e) => setHub({ ...hub, name: e.target.value })} placeholder="Andheri hub" /></Field>
          <Field label="Address"><Input value={hub.address} onChange={(e) => setHub({ ...hub, address: e.target.value })} /></Field>
          <Field label="Contact"><Input value={hub.contact} onChange={(e) => setHub({ ...hub, contact: e.target.value })} /></Field>
          <Field label="Phone"><Input inputMode="tel" value={hub.phone} onChange={(e) => setHub({ ...hub, phone: e.target.value })} /></Field>
        </div>
        <Button size="sm" disabled={!hub.city.trim() || !hub.name.trim()} onClick={async () => { if (await post({ action: "saveHub", hub })) setHub({ city: "", name: "", address: "", contact: "", phone: "" }); }}>Add hub</Button>
        <div className="mt-3">{m.hubs.length === 0 && <p className="text-xs text-muted">No hubs yet.</p>}{m.hubs.map((h) => (
          <div key={h.id} className={row}><span><b>{h.city} · {h.name}</b>{h.address ? ` · ${h.address}` : ""}{h.contact ? ` · ${h.contact}` : ""}</span><Button size="sm" variant="ghost" onClick={() => void post({ action: "deleteHub", id: h.id })}>Remove</Button></div>
        ))}</div>
      </Card>
    </div>
  );
}

/* ================= day planner ================= */
/* ================= vendors desk ================= */
function Vendors({ vendors, onSaved }: { vendors: Vendor[]; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ name: "", mobile: "", type: "linehaul", lanes: "", rate: "" });
  async function save() {
    await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveVendor", vendor: { name: f.name, mobile: f.mobile, type: f.type, lanes: f.lanes, rate: Number(f.rate) || 0 } }) });
    setF({ name: "", mobile: "", type: "linehaul", lanes: "", rate: "" });
    await onSaved();
  }
  return (
    <div className="grid gap-4">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Add vendor</h3>
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Mobile"><Input value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} inputMode="tel" /></Field>
          <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>linehaul</option><option>air cargo</option><option>pickup fleet</option><option>last mile</option></Select></Field>
          <Field label="Lanes served"><Input value={f.lanes} onChange={(e) => setF({ ...f, lanes: e.target.value })} placeholder="Ahmedabad–Mumbai, Mumbai–Goa" /></Field>
          <Field label="Standard rate ₹ / shipment"><Input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} inputMode="numeric" /></Field>
        </div>
        <Button size="sm" disabled={!f.name || !f.mobile} onClick={() => void save()}>Save vendor</Button>
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Vendor master <span className="font-normal text-faint">ranked by scorecard when picking</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="py-1.5">Vendor</th><th>Type</th><th>Lanes</th><th className="text-right">Rate</th><th className="text-right">Jobs</th><th className="text-right">On-time</th></tr></thead>
            <tbody>
              {vendors.length === 0 && <tr><td colSpan={6} className="py-3 text-muted">Empty — add your first vendor above.</td></tr>}
              {vendors.map((v) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="py-1.5"><b>{v.name}</b><span className="block text-faint">{v.mobile}</span></td>
                  <td>{v.type}</td><td className="text-muted">{v.lanes || "any"}</td>
                  <td className="text-right tabular-nums">{inr(v.rate)}</td>
                  <td className="text-right tabular-nums">{v.jobs ?? 0}</td>
                  <td className="text-right tabular-nums">{v.jobs ? Math.round(((v.onTime ?? 0) / v.jobs) * 100) + "%" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================= cost model desk ================= */
function CostDesk({ model, onSaved }: { model: CostModel; onSaved: () => Promise<void> }) {
  const [m, setM] = useSyncedState<CostModel>(model);
  const [lane, setLane] = useState({ name: "", pickup: "", linehaul: "", lastmile: "" });
  async function save(next: CostModel) {
    await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveCostModel", model: next }) });
    await onSaved();
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Standard leg costs <span className="font-normal text-faint">defaults — every lane falls back to these</span></h3>
        <div className="grid grid-cols-3 gap-3">
          {(["pickup", "linehaul", "lastmile"] as const).map((k) => (
            <Field key={k} label={k}><Input inputMode="numeric" value={String(m.defaults[k])} onChange={(e) => setM({ ...m, defaults: { ...m.defaults, [k]: Number(e.target.value) || 0 } })} /></Field>
          ))}
        </div>
        <Field label="Margin floor % (amber below this)"><Input inputMode="numeric" value={String(m.marginFloorPct)} onChange={(e) => setM({ ...m, marginFloorPct: Number(e.target.value) || 0 })} /></Field>
        <Button size="sm" onClick={() => void save(m)}>Save model</Button>
      </Card>
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Per-lane overrides</h3>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Lane (exactly: From → To)"><Input value={lane.name} onChange={(e) => setLane({ ...lane, name: e.target.value })} placeholder="Ahmedabad → Mumbai" /></Field>
          <div className="grid grid-cols-3 gap-2">
            {(["pickup", "linehaul", "lastmile"] as const).map((k) => (
              <Field key={k} label={k}><Input inputMode="numeric" value={lane[k]} onChange={(e) => setLane({ ...lane, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </div>
        <Button size="sm" disabled={!lane.name} onClick={() => void save({ ...m, lanes: { ...m.lanes, [lane.name]: { pickup: Number(lane.pickup) || undefined, linehaul: Number(lane.linehaul) || undefined, lastmile: Number(lane.lastmile) || undefined } } }).then(() => setLane({ name: "", pickup: "", linehaul: "", lastmile: "" }))}>Save lane</Button>
        <div className="mt-3 text-xs">
          {Object.entries(m.lanes).map(([k, v]) => (
            <p key={k} className="border-b border-dashed border-line py-1 last:border-0"><b>{k}</b> <span className="text-muted">· pickup {inr(v.pickup ?? m.defaults.pickup)} · linehaul {inr(v.linehaul ?? m.defaults.linehaul)} · last-mile {inr(v.lastmile ?? m.defaults.lastmile)}</span></p>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================= automation desk ================= */
interface AutoData {
  counts: { queued: number; done: number; stubbed: number; dead: number };
  recent: { kind: string; key: string; to?: string; template?: string; text?: string; status: string; stub?: boolean; link?: string; lastError?: string; createdAt: string; waStatus?: string; waError?: string }[];
  dead: AutoData["recent"];
  providers: { whatsapp: boolean; email: boolean; razorpay: boolean; cron: boolean };
  alerts?: { mobile?: string; email?: string };
}

/** The ops alert contact — ONE number + email that every platform event
 *  (bookings, payments, identity, milestones, inquiries) fans out to. */
function AlertContact({ d, onSaved }: { d: AutoData; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ mobile: d.alerts?.mobile ?? "", email: d.alerts?.email ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "alerts", mobile: f.mobile, email: f.email }) });
      const j = await r.json();
      if (j.error) setMsg(j.error === "BAD_MOBILE" ? "That mobile number doesn't look right." : j.error === "BAD_EMAIL" ? "That email doesn't look right." : j.error);
      else { setMsg("Saved — every new booking, payment and update now alerts this contact."); await onSaved(); }
    } finally { setBusy(false); }
  }
  const active = !!(d.alerts?.mobile || d.alerts?.email);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">Ops alert contact <Badge tone={active ? "ok" : "warn"}>{active ? "active" : "not set"}</Badge></h3>
        <span className="text-[11px] text-faint">WhatsApp + email for every booking · payment · identity · milestone · inquiry</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="WhatsApp number"><Input className="w-44 py-2 text-xs" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} placeholder="+91 98XXX XXXXX" /></Field>
        <Field label="Email"><Input className="w-56 py-2 text-xs" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="ops@bagdrop.co" /></Field>
        <Button size="sm" disabled={busy || (!f.mobile.trim() && !f.email.trim())} onClick={() => void save()}>{busy ? "Saving…" : "Save contact"}</Button>
      </div>
      {msg && <p className="mt-2 rounded-xl bg-paper p-2.5 text-xs text-muted">{msg}</p>}
    </Card>
  );
}
function AutomationDesk() {
  const [d, setD] = useState<AutoData | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/automation");
    if (r.ok) setD(await r.json());
  }, []);
  useLoad(load, 15000);

  async function run() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/automation", { method: "POST" });
      const j = await r.json();
      setLast(j.error ? `Failed: ${j.error}` : `Sweep done — ${j.leadsCreated} leads created · ${j.acksQueued + j.milestoneQueued + j.paidQueued} messages queued · ${j.sent} sent · ${j.stubbed} stubbed (no provider keys yet) · ${j.dead} dead`);
      await load();
    } finally { setBusy(false); }
  }

  if (!d) return <p className="text-sm text-muted">Reading the outbox…</p>;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Queued" value={String(d.counts.queued)} />
        <Kpi label="Delivered" value={String(d.counts.done)} hint={`${d.counts.stubbed} stubbed (links ready)`} />
        <Kpi label="Dead letters" value={String(d.counts.dead)} warn={d.counts.dead > 0} />
        <Card>
          <span className="block text-[11px] font-medium text-muted">Providers</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {([["WhatsApp", d.providers.whatsapp], ["Email", d.providers.email], ["Razorpay", d.providers.razorpay], ["Cron", d.providers.cron]] as const).map(([n, on]) => (
              <Badge key={n} tone={on ? "ok" : "muted"}>{n}{on ? "" : " · no key"}</Badge>
            ))}
          </span>
        </Card>
      </div>
      <AlertContact d={d} onSaved={load} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">The sweep <span className="font-normal text-faint">capture leads → queue template pairs → deliver</span></h3>
          <Button size="sm" disabled={busy} onClick={() => void run()}>{busy ? "Running…" : "Run worker now"}</Button>
        </div>
        {last && <p className="mt-2 rounded-xl bg-paper p-2.5 text-xs text-muted">{last}</p>}
        <p className="mt-2 text-[11.5px] text-faint">Runs automatically after every server-side booking write and on the schedule; idempotency keys make every pass safe. Without provider keys, messages complete as logged stubs carrying ready-to-send links.</p>
      </Card>
      {d.counts.dead > 0 && (
        <Card>
          <h3 className="mb-2 font-display text-sm font-bold text-red-600">Dead letters — needs a human</h3>
          {d.dead.map((e) => <p key={e.key} className="border-b border-dashed border-line py-1 text-xs last:border-0"><b>{e.template ?? e.kind}</b> → {e.to} · <span className="text-red-600">{e.lastError}</span></p>)}
        </Card>
      )}
      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Recent events <span className="font-normal text-faint">latest 30</span></h3>
        <div className="max-h-80 overflow-auto">
          {d.recent.length === 0 && <p className="text-sm text-muted">Nothing yet — run the worker once.</p>}
          {d.recent.map((e) => (
            <div key={e.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line py-1.5 text-xs last:border-0">
              <span className="font-mono text-[10.5px] text-faint">{new Date(e.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="flex-1"><b>{e.template ?? e.kind}</b> <span className="text-muted">to {e.to ?? "—"} · {e.kind === "send.wa" ? "WhatsApp" : "email"}</span></span>
              <Badge tone={e.status === "done" ? "ok" : e.status === "dead" ? "bad" : "info"}>{e.status}{e.stub ? " · stub" : ""}</Badge>
              {e.waStatus && <span title={e.waError}><Badge tone={e.waStatus === "failed" ? "bad" : e.waStatus === "read" || e.waStatus === "delivered" ? "ok" : "warn"}>on WhatsApp: {e.waStatus}</Badge></span>}
              {e.stub && e.link && <Button size="sm" variant="ghost" onClick={() => window.open(e.link, "_blank")}>Send manually</Button>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`block font-display text-xl font-extrabold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
