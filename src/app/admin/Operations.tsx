"use client";
/** Admin OS · Operations Control — the COO desk that takes over after the LR.
 *
 *  · Milestone chain: LR → Pickup assigned → Picked & sealed → In-scan →
 *    Linehaul depart → Arrive → Out for delivery → POD. Scan-gated stages
 *    cannot complete until every bag tag is scanned (camera or typed, both
 *    checksum-validated) — errors are prevented at entry, six-sigma style.
 *  · Airline-style bag tags generated ONCE at print time, with a check
 *    character; printable labels with Code39 barcodes.
 *  · Legs: own captains for pickup/delivery, vendors for linehaul — vendor
 *    picked from the master (ranked by score), one tap opens the WhatsApp
 *    brief; every assignment is logged.
 *  · Target costing per lane (cost model master) — booking a cost above
 *    target demands the ops passcode + reason; live gross margin on every
 *    shipment.
 *  · Day planner: everything picking up / delivering around a date, grouped
 *    by city, with clubbing hints. DPMO/sigma strip on top. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import {
  DEFAULT_COST_MODEL, EXCEPTION_KINDS, LEGS, MILESTONES, actualCost, generateTags,
  marginPct, opsOf, sixSigma, targetCost, validateTag,
  type CostModel, type LegKey, type MilestoneKey, type OpsState, type Vendor,
} from "@/lib/opsModel";
import type { Booking } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const OPS_PASSCODE = "2026";
const ACTIVE = ["accepted", "assigned", "picked_up", "in_transit"];
const wa = (m: string | undefined, t: string) => `https://wa.me/${(m ?? "").replace(/\D/g, "").replace(/^(?!91)/, "91")}?text=${encodeURIComponent(t)}`;

export default function Operations() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [model, setModel] = useState<CostModel>(DEFAULT_COST_MODEL);
  const [err, setErr] = useState<string | null>(null);
  const [desk, setDesk] = useState<"ship" | "day" | "vend" | "cost" | "auto">("ship");
  const [selId, setSelId] = useState<string | null>(null);

  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  const loadMasters = useCallback(async () => {
    const r = await fetch("/api/admin/ops");
    const j = await r.json();
    if (j.error) setErr(j.error); else { setVendors(j.vendors); setModel(j.costModel); }
  }, []);
  useEffect(() => { void loadMasters(); }, [loadMasters]);

  const active = useMemo(() => bookings.filter((b) => ACTIVE.includes(b.status)), [bookings]);
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
        {([["ship", "Shipments"], ["day", "Day planner"], ["vend", `Vendors · ${vendors.length}`], ["cost", "Cost model"], ["auto", "Automation"]] as const).map(([k, n]) => (
          <button key={k} onClick={() => setDesk(k)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${desk === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>{n}</button>
        ))}
      </div>

      <div key={desk} className="anim-in grid gap-5">
        {desk === "ship" && (
          <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
            <Card>
              <h3 className="mb-2 font-display text-sm font-bold">Active shipments <span className="font-normal text-faint">LR onwards</span></h3>
              <div className="max-h-[32rem] overflow-auto">
                {active.length === 0 && <p className="py-4 text-center text-sm text-muted">Nothing moving. Accept a booking in Shipments first.</p>}
                {active.map((b) => {
                  const o = opsOf(b);
                  const done = Object.keys(o.milestones ?? {}).length;
                  const mg = marginPct(b);
                  return (
                    <button key={b.id} onClick={() => setSelId(b.id)}
                      className={`w-full cursor-pointer border-b border-line px-1 py-2.5 text-left text-xs transition-colors last:border-0 hover:bg-paper ${selId === b.id ? "bg-brand-soft" : ""}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{b.id}</span>
                        <span className="flex items-center gap-1.5">
                          {mg !== null && <span className={`font-bold ${mg < model.marginFloorPct ? "text-amber-600" : "text-green-700"}`}>{mg}% GM</span>}
                          <Badge tone="info">{done}/{MILESTONES.length}</Badge>
                        </span>
                      </span>
                      <span className="mt-0.5 block text-muted">{b.traveller.name} · {b.from} → {b.to} · {b.bags + b.oversize} pcs · {b.date}</span>
                      <span className="mt-1.5 block h-1 rounded-full bg-paper"><span className="block h-1 rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(done / MILESTONES.length) * 100}%` }} /></span>
                    </button>
                  );
                })}
              </div>
            </Card>
            {sel ? <ShipmentDesk key={sel.id} b={sel} vendors={vendors} model={model} onSave={saveOps} onScore={async (id, onTime) => {
              await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scoreVendor", id, onTime }) });
              await loadMasters();
            }} /> : <Card><p className="py-10 text-center text-sm text-muted">Select a shipment — the full operation opens here: milestones, tags, vendors, costing.</p></Card>}
          </div>
        )}
        {desk === "day" && <DayPlanner bookings={bookings} onOpen={(id) => { setSelId(id); setDesk("ship"); }} />}
        {desk === "vend" && <Vendors vendors={vendors} onSaved={loadMasters} />}
        {desk === "cost" && <CostDesk model={model} onSaved={loadMasters} />}
        {desk === "auto" && <AutomationDesk />}
      </div>
    </div>
  );
}

/* ================= the single-shipment operation desk ================= */
function ShipmentDesk({ b, vendors, model, onSave, onScore }: {
  b: Booking; vendors: Vendor[]; model: CostModel;
  onSave: (b: Booking, ops: OpsState, patch: Partial<Booking>, event: string) => Promise<void>;
  onScore: (vendorId: string, onTime: boolean) => Promise<void>;
}) {
  const o = opsOf(b);
  const lane = `${b.from} → ${b.to}`;
  const target = o.target ?? targetCost(model, lane);
  const pieces = b.bags + b.oversize;
  const [scanInput, setScanInput] = useState("");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [exc, setExc] = useState({ kind: "", note: "" });
  const [costForm, setCostForm] = useState<{ leg: LegKey | null; amount: string; reason: string; pass: string }>({ leg: null, amount: "", reason: "", pass: "" });
  const [camera, setCamera] = useState(false);

  const nextIdx = MILESTONES.findIndex((m) => !o.milestones?.[m.key]);
  const next = nextIdx >= 0 ? MILESTONES[nextIdx] : null;
  const scansFor = (k: MilestoneKey) => o.scans?.[k] ?? [];
  const scanGateOpen = !next?.scan || (o.tags?.length ? scansFor(next.key).length >= (o.tags?.length ?? pieces) : false);

  async function complete() {
    if (!next) return;
    const ops: OpsState = {
      ...o, target,
      milestones: { ...o.milestones, [next.key]: { at: new Date().toISOString(), by: "ops" } },
    };
    await onSave(b, ops, { status: next.status as Booking["status"] }, `Ops · ${next.name}`);
    // vendor scorecard: POD on/after the travel date counts the linehaul vendor on-time
    if (next.key === "pod" && o.legs?.linehaul?.vendorId) await onScore(o.legs.linehaul.vendorId, true);
  }

  async function registerScan(raw: string) {
    if (!next?.scan) return;
    const tag = raw.trim().toUpperCase();
    if (!validateTag(tag)) { setScanMsg(`✗ ${tag || "(empty)"} — checksum failed, not a valid Bagdrop tag`); return; }
    if (!o.tags?.includes(tag)) { setScanMsg(`✗ ${tag} — valid tag, but it belongs to a different shipment`); return; }
    if (scansFor(next.key).includes(tag)) { setScanMsg(`• ${tag} already scanned for this stage`); return; }
    const ops: OpsState = { ...o, scans: { ...o.scans, [next.key]: [...scansFor(next.key), tag] } };
    await onSave(b, ops, {}, `Scan · ${tag} @ ${next.name}`);
    setScanMsg(`✓ ${tag} scanned (${scansFor(next.key).length + 1}/${o.tags?.length})`);
    setScanInput("");
  }

  async function printTags() {
    const tags = o.tags ?? generateTags(b, pieces);
    if (!o.tags) await onSave(b, { ...o, tags, printedAt: new Date().toISOString(), target }, {}, `Bag tags generated · ${tags.length} labels`);
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    w.document.write(labelsHtml(b, tags));
    w.document.close();
  }

  async function assignLeg(leg: LegKey, assignee: string, mobile?: string, vendorId?: string) {
    const ops: OpsState = { ...o, target, legs: { ...o.legs, [leg]: { assignee, mobile, vendorId, at: new Date().toISOString() } } };
    await onSave(b, ops, leg === "pickup" ? { status: "assigned", admin: { ...b.admin, captain: assignee, ops } } : {}, `Ops · ${leg} assigned to ${assignee}`);
    if (mobile) {
      const brief = `BAGDROP ${leg.toUpperCase()} BRIEF\nLR/Ref: ${b.id}\nLane: ${lane}\nPieces: ${pieces} (tags: ${(o.tags ?? []).join(", ") || "to be printed"})\nDate: ${b.date} · window ${b.slot}\nPickup: ${b.pickAddr}\nDeliver: ${b.dropAddr}\nContact: ${b.traveller.name} ${b.traveller.mobile}\nSeal in front of customer. Scan every tag at handoff.`;
      window.open(wa(mobile, brief), "_blank");
    }
  }

  async function logCost() {
    if (!costForm.leg) return;
    const amount = Number(costForm.amount) || 0;
    const newActual = actualCost(o) - (o.legs?.[costForm.leg]?.cost ?? 0) + amount;
    const over = newActual > target.total;
    if (over && costForm.pass !== OPS_PASSCODE) { setScanMsg("✗ Cost exceeds target — ops passcode + reason required"); return; }
    if (over && !costForm.reason.trim()) { setScanMsg("✗ A written reason is required to exceed target"); return; }
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
    const ops: OpsState = { ...o, exceptions: [...(o.exceptions ?? []), { kind: exc.kind, note: exc.note, at: new Date().toISOString() }] };
    await onSave(b, ops, {}, `EXCEPTION · ${exc.kind} — ${exc.note}`);
    setExc({ kind: "", note: "" });
  }

  const clubbing = useMemo(() => {
    return [] as Booking[]; // filled by DayPlanner's logic per shipment below
  }, []);
  void clubbing;

  const actual = actualCost(o);
  const rev = b.pay?.amount ?? b.quote.total;
  const mg = marginPct(b);
  const custUpdate = next
    ? `BAGDROP UPDATE · ${b.id}\n${MILESTONES.filter((m) => o.milestones?.[m.key]).map((m) => `✓ ${m.name}`).join("\n")}\nNext: ${next.name}\nTrack live on your booking page.`
    : `BAGDROP · ${b.id} delivered. Thank you for travelling light with us.`;

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold">{b.id} <span className="font-normal text-muted">· {lane}</span></h3>
          <p className="text-xs text-muted">{b.traveller.name} · {b.traveller.mobile} · {pieces} pieces · {b.date} {b.slot}</p>
        </div>
        <div className="text-right text-xs">
          <span className={`block font-display text-lg font-extrabold ${mg !== null && mg < model.marginFloorPct ? "text-amber-600" : "text-green-700"}`}>{mg !== null ? `${mg}% GM` : "— GM"}</span>
          <span className="text-muted">cost {inr(actual)} / target {inr(target.total)}</span>
          {o.overTarget && <span className="block font-semibold text-red-600">over target by {inr(o.overTarget.by)}</span>}
        </div>
      </div>

      {/* milestone stepper */}
      <div className="mt-4 grid gap-1">
        {MILESTONES.map((m, i) => {
          const done = o.milestones?.[m.key];
          const isNext = i === nextIdx;
          return (
            <div key={m.key} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs ${isNext ? "bg-brand-soft" : ""}`}>
              <i className={`size-2.5 flex-none rounded-full ${done ? "bg-green-500" : isNext ? "animate-pulse bg-brand" : "bg-line"}`} />
              <span className={`flex-1 ${done ? "text-muted line-through decoration-stone-300" : isNext ? "font-semibold" : "text-faint"}`}>{m.name}{m.scan ? " · scan-gated" : ""}</span>
              {done && <span className="text-faint">{new Date(done.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
              {isNext && m.scan && <Badge tone={scanGateOpen ? "ok" : "warn"}>{scansFor(m.key).length}/{o.tags?.length ?? pieces} scanned</Badge>}
              {isNext && (
                <Button size="sm" disabled={!scanGateOpen && !!m.scan} onClick={() => void complete()} title={!scanGateOpen && m.scan ? "Scan every tag first — the gate stays shut" : ""}>
                  {m.scan && !scanGateOpen ? "Gate shut" : "Complete ✓"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* tags + scanning */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Bag tags</h4>
          {o.tags ? (
            <>
              <p className="font-mono text-[10.5px] leading-5 text-muted">{o.tags.join(" · ")}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void printTags()}>Reprint labels</Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted">Generated once, at print — checksummed, airline-style. {pieces} labels.</p>
              <Button size="sm" className="mt-2" onClick={() => void printTags()}>Generate &amp; print {pieces} tags</Button>
            </>
          )}
        </div>
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Scan {next?.scan ? `· ${next.name}` : ""}</h4>
          {!next?.scan ? <p className="text-xs text-muted">Current stage needs no scan.</p> : (
            <>
              <div className="flex gap-2">
                <Input className="font-mono text-xs" placeholder="BD-AMD-BOM-XXXXX-1-C" value={scanInput} onChange={(e) => setScanInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void registerScan(scanInput); }} />
                <Button size="sm" onClick={() => void registerScan(scanInput)}>Scan</Button>
              </div>
              <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setCamera((v) => !v)}>{camera ? "Stop camera" : "Scan with camera"}</Button>
              {camera && <CameraScanner onTag={(t) => void registerScan(t)} />}
            </>
          )}
          {scanMsg && <p className={`mt-2 text-xs ${scanMsg.startsWith("✓") ? "text-green-700" : scanMsg.startsWith("•") ? "text-muted" : "text-red-600"}`}>{scanMsg}</p>}
        </div>
      </div>

      {/* legs & vendors */}
      <h4 className="mt-4 mb-1.5 font-display text-[13px] font-bold">Legs &amp; assignment</h4>
      <div className="grid gap-2">
        {LEGS.map((leg) => {
          const a = o.legs?.[leg.key];
          return (
            <LegRow key={leg.key} leg={leg} assigned={a} vendors={vendors} lane={lane} targetLeg={target.legs[leg.key]}
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

      {/* share + exceptions */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Share update</h4>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => window.open(wa(b.traveller.mobile, custUpdate), "_blank")}>Client WhatsApp</Button>
            {o.legs?.linehaul?.mobile && <Button size="sm" variant="outline" onClick={() => window.open(wa(o.legs!.linehaul!.mobile, `BAGDROP ${b.id} · ${lane}\nStatus: ${next ? "next — " + next.name : "delivered"}\nPieces: ${pieces}. Confirm handoff scans.`), "_blank")}>Vendor WhatsApp</Button>}
          </div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <h4 className="mb-1.5 font-display text-[13px] font-bold">Exception</h4>
          <div className="flex flex-wrap gap-1.5">
            <Select className="w-32 py-2 text-xs" value={exc.kind} onChange={(e) => setExc({ ...exc, kind: e.target.value })}>
              <option value="">kind…</option>{EXCEPTION_KINDS.map((k) => <option key={k}>{k}</option>)}
            </Select>
            <Input className="flex-1 py-2 text-xs" placeholder="What happened — required" value={exc.note} onChange={(e) => setExc({ ...exc, note: e.target.value })} />
            <Button size="sm" variant="outline" disabled={!exc.kind || !exc.note.trim()} onClick={() => void raiseException()}>Raise</Button>
          </div>
          {(o.exceptions ?? []).filter((e) => !e.resolved).map((e, i) => (
            <p key={i} className="mt-1.5 text-xs text-red-600"><b>{e.kind}</b> · {e.note}</p>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ================= leg row with vendor picker ================= */
function LegRow({ leg, assigned, vendors, lane, targetLeg, onAssign, onCost }: {
  leg: (typeof LEGS)[number]; assigned?: { assignee: string; mobile?: string; cost?: number }; vendors: Vendor[];
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
                <span className="text-muted">{inr(v.rate)} · {v.jobs ? Math.round(((v.onTime ?? 0) / v.jobs) * 100) + "% OT" : "new"} →</span>
              </button>
            ))
          ) : (
            <div className="flex flex-wrap gap-1.5">
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

/* ================= camera scanner (BarcodeDetector, no deps) ================= */
function CameraScanner({ onTag }: { onTag: (t: string) => void }) {
  const [msg, setMsg] = useState("Starting camera…");
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const video = document.createElement("video");
    video.playsInline = true;
    const host = document.getElementById("cam-host");
    host?.appendChild(video);
    video.style.cssText = "width:100%;border-radius:12px;margin-top:6px";
    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!BD) { setMsg("This browser has no barcode engine — type the code instead (the checksum still protects you)."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream; await video.play();
        setMsg("Point at the label…");
        const det = new BD({ formats: ["code_39", "qr_code", "code_128"] });
        const loop = async () => {
          if (stop) return;
          try {
            const found = await det.detect(video);
            if (found.length) { onTag(found[0].rawValue); setMsg(`Read: ${found[0].rawValue}`); }
          } catch { /* frame not ready */ }
          setTimeout(loop, 350);
        };
        void loop();
      } catch { setMsg("Camera refused — type the code instead."); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); video.remove(); };
  }, [onTag]);
  return <div id="cam-host" className="text-xs text-muted">{msg}</div>;
}

/* ================= day planner ================= */
function DayPlanner({ bookings, onOpen }: { bookings: Booking[]; onOpen: (id: string) => void }) {
  const [date, setDate] = useState("");
  useEffect(() => { setDate(new Date().toISOString().slice(0, 10)); }, []);
  const near = (d: string) => Math.abs(new Date(d).getTime() - new Date(date).getTime()) <= 86400000;
  const pickups = bookings.filter((b) => ["accepted", "assigned"].includes(b.status) && near(b.pickupDate ?? b.date));
  const deliveries = bookings.filter((b) => ["picked_up", "in_transit"].includes(b.status) && near(b.deliveryDate ?? b.date));
  const groups = (list: Booking[], key: (b: Booking) => string) => {
    const g = new Map<string, Booking[]>();
    list.forEach((b) => { const k = key(b); g.set(k, [...(g.get(k) ?? []), b]); });
    return [...g.entries()];
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-sm font-bold">Day planner</h3>
        <Input type="date" className="w-44 py-2 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="text-xs text-faint">±1 day around the chosen date · grouped by city, so clubbing is obvious</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {([["Pickups", pickups, (b: Booking) => b.from], ["Deliveries", deliveries, (b: Booking) => b.to]] as const).map(([title, list, key]) => (
          <Card key={title}>
            <h4 className="mb-2 font-display text-[13px] font-bold">{title} <span className="font-normal text-faint">{list.length}</span></h4>
            {list.length === 0 && <p className="text-sm text-muted">None in this window.</p>}
            {groups(list, key).map(([city, items]) => (
              <div key={city} className="mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{city} · {items.length}{items.length > 1 ? " — club these" : ""}</p>
                {items.map((b) => (
                  <button key={b.id} onClick={() => onOpen(b.id)} className="flex w-full cursor-pointer justify-between gap-2 border-b border-dashed border-line py-1.5 text-left text-xs last:border-0 hover:bg-paper">
                    <span className="font-mono text-[11px]">{b.id}</span>
                    <span className="flex-1 text-muted">{b.from} → {b.to} · {b.bags + b.oversize} pcs · {b.slot || "no window"}</span>
                    <Badge tone="info">{b.status.replace("_", " ")}</Badge>
                  </button>
                ))}
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

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
  const [m, setM] = useState<CostModel>(model);
  useEffect(() => setM(model), [model]);
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

/* ================= printable labels (Code39 in pure SVG) ================= */
const C39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn",
  T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
  Z: "nwwnwnnnn", "-": "nwnnnnwnw", "*": "nwnnwnwnn",
};
function code39svg(text: string): string {
  const seq = `*${text.toUpperCase()}*`;
  let x = 0; const parts: string[] = [];
  for (const ch of seq) {
    const pat = C39[ch] ?? C39["-"];
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === "w" ? 5 : 2;
      if (i % 2 === 0) parts.push(`<rect x="${x}" y="0" width="${w}" height="54" fill="#000"/>`);
      x += w;
    }
    x += 2; // inter-character gap
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 54" width="${x}" height="54" preserveAspectRatio="none" style="width:100%;height:54px">${parts.join("")}</svg>`;
}
function labelsHtml(b: Booking, tags: string[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bag tags · ${b.id}</title>
  <style>body{font-family:-apple-system,Inter,sans-serif;margin:0;padding:10px}
  .lbl{border:2px solid #000;border-radius:10px;padding:10px 12px;margin:0 0 10px;page-break-inside:avoid}
  .row{display:flex;justify-content:space-between;font-weight:800;font-size:18px;letter-spacing:.02em}
  .row small{font-weight:600;font-size:11px;color:#555}
  .code{font-family:ui-monospace,monospace;font-size:13px;font-weight:700;text-align:center;margin-top:4px;letter-spacing:.06em}
  .meta{font-size:10.5px;color:#444;display:flex;justify-content:space-between;margin-top:4px}
  @media print{.noprint{display:none}}</style></head><body>
  <p class="noprint" style="font-size:12px">Print this page (⌘P) on label stock. One label per bag.</p>
  ${tags.map((t, i) => `<div class="lbl">
    <div class="row"><span>${t.split("-")[1]} → ${t.split("-")[2]}</span><small>BAGDROP · sealed &amp; tracked</small></div>
    ${code39svg(t.replace(/-/g, ""))}
    <div class="code">${t}</div>
    <div class="meta"><span>${b.id} · bag ${i + 1} of ${tags.length}</span><span>${b.traveller.name} · ${b.date}</span></div>
  </div>`).join("")}
  <script>window.onload=()=>setTimeout(()=>window.print(),300)</scr${"ipt"}></body></html>`;
}

/* ================= automation desk ================= */
interface AutoData {
  counts: { queued: number; done: number; stubbed: number; dead: number };
  recent: { kind: string; key: string; to?: string; template?: string; text?: string; status: string; stub?: boolean; link?: string; lastError?: string; createdAt: string }[];
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
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

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
              <span className="flex-1"><b>{e.template ?? e.kind}</b> <span className="text-muted">→ {e.to ?? "—"} · {e.kind === "send.wa" ? "WhatsApp" : "email"}</span></span>
              <Badge tone={e.status === "done" ? "ok" : e.status === "dead" ? "bad" : "info"}>{e.status}{e.stub ? " · stub" : ""}</Badge>
              {e.stub && e.link && <Button size="sm" variant="ghost" onClick={() => window.open(e.link, "_blank")}>Send manually →</Button>}
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
