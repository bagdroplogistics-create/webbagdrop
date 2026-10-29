"use client";
/** Admin OS · LR & trips — one vehicle, one run; bookings club onto it.
 *  Ported from the static build's m-lr module (admin.js ~L1993-2227).
 *  Not yet ported from that module: manifest/LR print layouts, driver
 *  settlement document, e-way bill JSON (that was never wired to a real
 *  GSP there either — download-only). */
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { watchAdminBookings } from "@/lib/adminApi";
import { assignBookingToTrip, createTrip, patchTrip, unassignBooking, watchTrips, type LrDetails } from "@/lib/tripsApi";
import { CHARGE_HEADS, DELIVERY_AT, GST_PAYABLE, LR_TYPES, PAYMENT_TERMS, lrTotals, type ChargeKey } from "@/lib/lrModel";
import { COMPANY } from "@/lib/company";
import type { Booking, DocRecord, Trip, TripExpense } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import DocumentView from "./DocumentView";

const VEHICLE_TYPES = ["Tata Ace", "Bolero pickup", "Eicher 14ft", "Eicher 17ft", "Tempo traveller", "Container"];
const EXP_HEADS = ["Fuel", "Toll / FASTag", "Driver bhatta", "Loading / unloading", "Parking", "Airport charges", "Vehicle hire", "Misc"];
/* LR exists only for CONFIRMED bookings — "submitted" must be accepted first */
const ELIGIBLE = ["accepted", "assigned", "picked_up", "in_transit"];

function tripRevenue(bookings: Booking[], tripId: string): number {
  return bookings.filter((b) => b.admin.trip === tripId).reduce((a, b) => a + b.quote.total, 0);
}
function tripExpense(t: Trip): number {
  return t.expenses.reduce((a, e) => a + e.amount, 0);
}

export default function LRAndTrips({ search = "" }: { search?: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => watchTrips(setTrips, (e) => setErr(String(e))), []);

  const q = search.trim().toLowerCase();
  const visibleTrips = useMemo(() => !q ? trips : trips.filter((t) =>
    [t.id, t.route, t.vehicle].some((v) => v?.toLowerCase().includes(q))
  ), [trips, q]);

  const [sel, setSel] = useState<string | null>(null);
  const trip = trips.find((t) => t.id === sel) ?? null;

  const kpis = useMemo(() => {
    const open = trips.filter((t) => t.status !== "completed").length;
    const lrs = bookings.filter((b) => b.lr).length;
    const rev = trips.reduce((a, t) => a + tripRevenue(bookings, t.id), 0);
    const exp = trips.reduce((a, t) => a + tripExpense(t), 0);
    return { open, lrs, rev, exp, margin: rev ? Math.round((100 * (rev - exp)) / rev) : 0 };
  }, [trips, bookings]);

  const [form, setForm] = useState({ route: "", date: "", vehicle: "", vehicleType: VEHICLE_TYPES[0], driver: "", driverMobile: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function create() {
    if (!form.route || !form.date) { setMsg("Route and date are required."); return; }
    setBusy(true); setMsg("");
    try {
      const t = await createTrip(form);
      setForm({ route: "", date: "", vehicle: "", vehicleType: VEHICLE_TYPES[0], driver: "", driverMobile: "" });
      setSel(t.id);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  const unassignedBookings = bookings.filter((b) => !b.admin.trip && ELIGIBLE.includes(b.status));
  const readyForLr = bookings.filter((b) => !b.lr && ELIGIBLE.includes(b.status));

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Confirmed · awaiting LR" value={String(readyForLr.length)} />
        <Kpi label="LRs issued" value={String(kpis.lrs)} />
        <Kpi label="Open trips" value={String(kpis.open)} />
        <Kpi label="Trip revenue · expenses" value={`${inr(kpis.rev)} · ${inr(kpis.exp)}`} hint={`${kpis.margin}% margin`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-5">
          <Card>
            <h3 className="mb-3 font-display text-sm font-bold">Create a trip <span className="font-normal text-faint">one vehicle, one run</span></h3>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Route"><Input value={form.route} onChange={(e) => setForm((p) => ({ ...p, route: e.target.value }))} placeholder="Vadodara → Mumbai" /></Field>
              <Field label="Trip date"><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></Field>
              <Field label="Vehicle number"><Input value={form.vehicle} onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value }))} placeholder="GJ06 AB 4412" /></Field>
              <Field label="Vehicle type">
                <Select value={form.vehicleType} onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))}>
                  {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Driver / captain"><Input value={form.driver} onChange={(e) => setForm((p) => ({ ...p, driver: e.target.value }))} /></Field>
              <Field label="Driver mobile"><Input value={form.driverMobile} onChange={(e) => setForm((p) => ({ ...p, driverMobile: e.target.value }))} /></Field>
            </div>
            <div className="flex items-center gap-3">
              <Button disabled={busy} onClick={() => void create()}>{busy ? "Creating…" : "Create trip"}</Button>
              {msg && <span className="text-sm text-red-700">{msg}</span>}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-display text-sm font-bold">Trips <Badge tone="ok">live</Badge></h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                    <th className="py-2 pr-2">Trip</th><th className="pr-2">Route · date</th><th className="pr-2">Vehicle</th><th className="pr-2 text-right">Rev</th><th className="pr-2 text-right">Exp</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrips.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted">{q ? "No trips match." : "No trips yet."}</td></tr>}
                  {visibleTrips.map((t) => {
                    const rev = tripRevenue(bookings, t.id), exp = tripExpense(t);
                    return (
                      <tr key={t.id} onClick={() => setSel(t.id)} className={`cursor-pointer border-b border-line last:border-0 ${sel === t.id ? "bg-paper" : ""}`}>
                        <td className="py-2 pr-2 font-mono text-xs">{t.id}</td>
                        <td className="pr-2 text-xs">{t.route}<br /><span className="text-faint">{t.date}</span></td>
                        <td className="pr-2 text-xs">{t.vehicle || "—"}</td>
                        <td className="pr-2 text-right">{inr(rev)}</td>
                        <td className="pr-2 text-right">{inr(exp)}</td>
                        <td><Badge tone={t.status === "completed" ? "ok" : t.status === "running" ? "warn" : "muted"}>{t.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {trip && (
            <TripDetail
              trip={trip}
              bookings={bookings}
              unassigned={unassignedBookings}
              onPatched={(t) => setTrips((p) => p.map((x) => (x.id === t.id ? t : x)))}
              onBookingChanged={(b) => setBookings((p) => p.map((x) => (x.id === b.id ? b : x)))}
            />
          )}
        </div>

        {/* RIGHT COLUMN — confirmed consignments: approve auto-drafts, or select manually */}
        <ReadyForLr bookings={readyForLr} trips={trips} onIssued={(b) => setBookings((p) => p.map((x) => (x.id === b.id ? b : x)))} />
      </div>
    </div>
  );
}

/* ================= confirmed consignments (right column) =================
 * Two queues: auto-drafted LRs awaiting the team's one-click approval
 * (prepared automatically after 00:01 on the dispatch day), and confirmed
 * consignments the team can select manually before that. */
type Draft = { at: string; auto?: boolean; details?: LrDetails };
const draftOf = (b: Booking): Draft | undefined => (b.admin as { lrDraft?: Draft }).lrDraft;

function ReadyForLr({ bookings, trips, onIssued }: { bookings: Booking[]; trips: Trip[]; onIssued: (b: Booking) => void }) {
  const [making, setMaking] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ booking: Booking; doc: DocRecord } | null>(null);
  const drafts = bookings.filter((b) => draftOf(b));
  const manual = bookings.filter((b) => !draftOf(b));

  async function approve(b: Booking) {
    setBusyId(b.id); setErr(null);
    try {
      const updated: Booking = await assignBookingToTrip(b.id, "", undefined, { autoTrip: true, approveDraft: true });
      onIssued(updated);
      const doc = updated.docs?.find((d) => d.type === "LR" && d.no === updated.lr?.no);
      if (doc) setIssued({ booking: updated, doc });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  }

  return (
    <div className="grid content-start gap-5">
      <Card className="border-l-4 border-l-brand">
        <h3 className="mb-2 font-display text-sm font-bold">LRs awaiting approval <span className="font-normal text-faint">auto-drafted after 00:01 on the dispatch day — one click issues</span></h3>
        {err && <p className="mb-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900">{err}</p>}
        {drafts.length === 0 && <p className="py-2 text-center text-sm text-muted">Nothing drafted — bookings dispatching today appear here automatically.</p>}
        <div className="grid gap-2">
          {drafts.map((b) => {
            const d = draftOf(b)!;
            return (
              <div key={b.id} className="anim-in rounded-xl border border-line bg-paper/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span><b className="font-mono text-[11px]">{b.id}</b> · {b.traveller.name} <Badge tone="warn">dispatch {b.date}</Badge></span>
                  <span className="text-muted">{b.from} → {b.to} · {d.details?.pieces ?? b.bags + b.oversize} pcs{d.details?.declaredValue ? ` · ${inr(d.details.declaredValue)}` : ""}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Consignee {d.details?.consignee ?? b.traveller.name} · {d.details?.toAddr ?? b.to} · drafted {new Date(d.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busyId === b.id} onClick={() => void approve(b)}>{busyId === b.id ? "Issuing…" : "Approve & issue LR"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setMaking(making?.id === b.id ? null : b)}>{making?.id === b.id ? "Close" : "Edit first"}</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-sm font-bold">Confirmed consignments <span className="font-normal text-faint">select manually for LR — else auto-drafted on dispatch day</span></h3>
        {manual.length === 0 && <p className="py-2 text-center text-sm text-muted">Nothing waiting — every confirmed booking has its LR or a draft.</p>}
        <div className="grid gap-1.5">
          {manual.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-1.5 text-xs last:border-0">
              <span className="min-w-0">
                <b className="font-mono text-[11px]">{b.id}</b> · {b.traveller.name}
                <span className="block text-muted">{b.from} → {b.to} · {b.date || "date TBC"} · {b.bags + b.oversize} pcs{b.quote.total ? ` · ${inr(b.quote.total)}` : ""} · <Badge tone="ok">{b.status.replace("_", " ")}</Badge></span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setMaking(making?.id === b.id ? null : b)}>{making?.id === b.id ? "Close" : "Make LR"}</Button>
            </div>
          ))}
        </div>
      </Card>

      {making && <MakeLr key={making.id} b={making} trips={trips} onIssued={onIssued} onClose={() => setMaking(null)} />}
      {issued && <DocumentView booking={issued.booking} doc={issued.doc} onClose={() => setIssued(null)} />}
    </div>
  );
}

function MakeLr({ b, trips, onIssued, onClose }: { b: Booking; trips: Trip[]; onIssued: (b: Booking) => void; onClose: () => void }) {
  const openTrips = trips.filter((t) => t.status !== "completed");
  /* every field of the official BDLR consignment note, PRE-FILLED — from the
   * auto-draft when one exists, else the confirmed booking — all editable */
  const d = draftOf(b)?.details;
  const opsTags = ((b.admin as { ops?: { tags?: string[] } }).ops?.tags ?? []).join(", ");
  const paid = b.pay?.status === "captured";
  const [f, setF] = useState({
    tripId: openTrips[0]?.id ?? "",
    /* parties */
    consignor: d?.consignor ?? COMPANY.name,
    consignorMobile: d?.consignorMobile ?? COMPANY.phone,
    consignorGstin: d?.consignorGstin ?? COMPANY.gstin,
    consignee: d?.consignee ?? b.traveller.name,
    consigneeMobile: d?.consigneeMobile ?? b.traveller.mobile,
    consigneeGstin: d?.consigneeGstin ?? "",
    billedTo: d?.billedTo ?? b.traveller.name,
    billedToGstin: d?.billedToGstin ?? "",
    /* transport */
    vehicleNo: d?.vehicleNo ?? openTrips[0]?.vehicle ?? "",
    mode: d?.mode ?? b.mode,
    ewayBill: d?.ewayBill ?? "",
    fromAddr: d?.fromAddr ?? (b.pickAddr || b.from),
    toAddr: d?.toAddr ?? (b.dropAddr || b.to),
    /* package */
    pieces: String(d?.pieces ?? b.bags + b.oversize),
    content: d?.content ?? "HOUSEHOLD BAGGAGE",
    weightKg: String(d?.weightKg ?? (b.bags + b.oversize) * 25),
    chargedWeightKg: String(d?.chargedWeightKg ?? ""),
    size: d?.size ?? "",
    privateMark: d?.privateMark ?? "",
    tiTag: d?.tiTag ?? opsTags,
    /* commercials */
    declaredValue: String(d?.declaredValue ?? b.quote.total ?? ""),
    invoiceRef: d?.invoiceRef ?? b.quote.qid ?? "",
    charges: Object.fromEntries(CHARGE_HEADS.map(([k]) => [k, String(d?.charges?.[k] ?? (k === "freight" ? Math.round((b.quote.total || 0) / 1.05) : ""))])) as Record<ChargeKey, string>,
    /* terms */
    insured: (d?.insured ?? "No") as "Yes" | "No",
    gstPayableBy: d?.gstPayableBy ?? "Consignor",
    paymentTerms: d?.paymentTerms ?? (paid ? "Paid" : "To Pay"),
    lrType: d?.lrType ?? "At Branch",
    deliveryAt: d?.deliveryAt ?? "Door Dly",
    note: d?.note ?? b.note ?? "",
  });
  const [newTrip, setNewTrip] = useState({ vehicle: "", driver: "", driverMobile: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ booking: Booking; doc: DocRecord } | null>(null);

  const chargesNum = Object.fromEntries(CHARGE_HEADS.map(([k]) => [k, Math.round(Number(f.charges[k]) || 0)])) as Record<ChargeKey, number>;
  const totals = lrTotals({ charges: chargesNum }, b.quote.total || 0);
  const sec = "mb-1.5 mt-2 text-[10px] font-bold uppercase tracking-wide text-muted";

  async function issue() {
    setBusy(true); setErr(null);
    try {
      let tripId = f.tripId;
      if (!tripId) {
        const t = await createTrip({ route: `${b.from} → ${b.to}`, date: b.date || new Date().toISOString().slice(0, 10), vehicle: newTrip.vehicle || f.vehicleNo, vehicleType: VEHICLE_TYPES[0], driver: newTrip.driver, driverMobile: newTrip.driverMobile });
        tripId = t.id;
      }
      const lr: LrDetails = {
        consignor: f.consignor, consignorMobile: f.consignorMobile, consignorGstin: f.consignorGstin || undefined,
        consignee: f.consignee, consigneeMobile: f.consigneeMobile, consigneeGstin: f.consigneeGstin || undefined,
        billedTo: f.billedTo || undefined, billedToGstin: f.billedToGstin || undefined,
        vehicleNo: f.vehicleNo || undefined, mode: f.mode, ewayBill: f.ewayBill || undefined,
        fromAddr: f.fromAddr, toAddr: f.toAddr,
        pieces: Number(f.pieces) || b.bags + b.oversize, content: f.content || "HOUSEHOLD BAGGAGE",
        weightKg: Number(f.weightKg) || undefined, chargedWeightKg: Number(f.chargedWeightKg) || undefined,
        size: f.size || undefined, privateMark: f.privateMark || undefined, tiTag: f.tiTag || undefined,
        declaredValue: Number(f.declaredValue) || undefined, invoiceRef: f.invoiceRef || undefined,
        charges: chargesNum,
        insured: f.insured, gstPayableBy: f.gstPayableBy, paymentTerms: f.paymentTerms, lrType: f.lrType, deliveryAt: f.deliveryAt,
        note: f.note || undefined,
      };
      const updated: Booking = await assignBookingToTrip(b.id, tripId, lr);
      onIssued(updated);
      const doc = updated.docs?.find((x) => x.type === "LR" && x.no === updated.lr?.no);
      if (doc) setIssued({ booking: updated, doc }); else onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="anim-in mt-3 rounded-xl border border-line bg-paper/60 p-4">
      <h4 className="mb-1 font-display text-[13px] font-bold">LR for {b.id} <span className="font-normal text-faint">full consignment-note fields, pre-filled — adjust anything, then issue</span></h4>

      <p className={sec}>Consignor · Consignee · Billed to</p>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Consignor"><Input className="py-2 text-xs" value={f.consignor} onChange={(e) => setF({ ...f, consignor: e.target.value })} /></Field>
        <Field label="Consignor mobile"><Input className="py-2 text-xs" value={f.consignorMobile} onChange={(e) => setF({ ...f, consignorMobile: e.target.value })} /></Field>
        <Field label="Consignor GSTIN"><Input className="py-2 text-xs font-mono" value={f.consignorGstin} onChange={(e) => setF({ ...f, consignorGstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="Consignee (receiver)"><Input className="py-2 text-xs" value={f.consignee} onChange={(e) => setF({ ...f, consignee: e.target.value })} /></Field>
        <Field label="Consignee mobile"><Input className="py-2 text-xs" inputMode="tel" value={f.consigneeMobile} onChange={(e) => setF({ ...f, consigneeMobile: e.target.value })} /></Field>
        <Field label="Consignee GSTIN"><Input className="py-2 text-xs font-mono" value={f.consigneeGstin} onChange={(e) => setF({ ...f, consigneeGstin: e.target.value.toUpperCase() })} placeholder="—" /></Field>
        <Field label="Billed to (service receiver)"><Input className="py-2 text-xs" value={f.billedTo} onChange={(e) => setF({ ...f, billedTo: e.target.value })} /></Field>
        <Field label="Billed-to GSTIN"><Input className="py-2 text-xs font-mono" value={f.billedToGstin} onChange={(e) => setF({ ...f, billedToGstin: e.target.value.toUpperCase() })} placeholder="—" /></Field>
      </div>

      <p className={sec}>Transport · addresses</p>
      <div className="grid gap-x-3 sm:grid-cols-4">
        <Field label="Trip (vehicle run)">
          <Select className="py-2 text-xs" value={f.tripId} onChange={(e) => { const t = openTrips.find((x) => x.id === e.target.value); setF({ ...f, tripId: e.target.value, vehicleNo: t?.vehicle || f.vehicleNo }); }}>
            {openTrips.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.route} · {t.date}</option>)}
            <option value="">+ new trip on this lane</option>
          </Select>
        </Field>
        <Field label="Vehicle no."><Input className="py-2 text-xs font-mono" value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value.toUpperCase() })} placeholder="GJ06 AB 4412" /></Field>
        <Field label="Mode"><Select className="py-2 text-xs" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="air">Air</option><option value="road">Road</option><option value="rail">Rail</option><option value="sea">Sea</option></Select></Field>
        <Field label="E-way bill no."><Input className="py-2 text-xs font-mono" value={f.ewayBill} onChange={(e) => setF({ ...f, ewayBill: e.target.value })} placeholder="—" /></Field>
        <Field label="Pickup address (from)"><Input className="py-2 text-xs" value={f.fromAddr} onChange={(e) => setF({ ...f, fromAddr: e.target.value })} /></Field>
        <Field label="Delivery address (to)"><Input className="py-2 text-xs" value={f.toAddr} onChange={(e) => setF({ ...f, toAddr: e.target.value })} /></Field>
        <Field label="Invoice / quote ref"><Input className="py-2 text-xs font-mono" value={f.invoiceRef} onChange={(e) => setF({ ...f, invoiceRef: e.target.value })} /></Field>
        <Field label="Declared value ₹"><Input className="py-2 text-xs" inputMode="numeric" value={f.declaredValue} onChange={(e) => setF({ ...f, declaredValue: e.target.value })} /></Field>
      </div>

      <p className={sec}>Package</p>
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-7">
        <Field label="Pkgs"><Input className="py-2 text-xs" inputMode="numeric" value={f.pieces} onChange={(e) => setF({ ...f, pieces: e.target.value })} /></Field>
        <div className="col-span-2"><Field label="Content"><Input className="py-2 text-xs" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field></div>
        <Field label="A. weight kg"><Input className="py-2 text-xs" inputMode="numeric" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} /></Field>
        <Field label="C. weight kg"><Input className="py-2 text-xs" inputMode="numeric" value={f.chargedWeightKg} onChange={(e) => setF({ ...f, chargedWeightKg: e.target.value })} placeholder="—" /></Field>
        <Field label="Size L×W×H"><Input className="py-2 text-xs" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} placeholder="—" /></Field>
        <Field label="Private mark"><Input className="py-2 text-xs" value={f.privateMark} onChange={(e) => setF({ ...f, privateMark: e.target.value })} placeholder="—" /></Field>
      </div>
      <Field label="TI-Tag (bag tags)"><Input className="py-2 text-xs font-mono" value={f.tiTag} onChange={(e) => setF({ ...f, tiTag: e.target.value })} placeholder="auto-fills from printed bag tags" /></Field>

      <p className={sec}>Charges (₹) — Sub Total + CGST 2.5% + SGST 2.5%</p>
      <div className="grid grid-cols-3 gap-x-3 sm:grid-cols-6">
        {CHARGE_HEADS.map(([k, name]) => (
          <Field key={k} label={name}><Input className="py-2 text-xs text-right font-mono" inputMode="numeric" value={f.charges[k]} onChange={(e) => setF({ ...f, charges: { ...f.charges, [k]: e.target.value } })} placeholder="0" /></Field>
        ))}
      </div>
      <p className="mb-2 rounded-lg bg-white px-3 py-2 text-xs">
        Sub Total <b className="font-mono">{inr(totals.subTotal)}</b> · CGST 2.5% <b className="font-mono">{inr(totals.cgst)}</b> · SGST 2.5% <b className="font-mono">{inr(totals.sgst)}</b> · <span className="rounded bg-brand-soft px-1.5 py-0.5">Total <b className="font-mono">{inr(totals.total)}</b></span>
      </p>

      <p className={sec}>Terms</p>
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-5">
        <Field label="Insured by customer"><Select className="py-2 text-xs" value={f.insured} onChange={(e) => setF({ ...f, insured: e.target.value as "Yes" | "No" })}><option>No</option><option>Yes</option></Select></Field>
        <Field label="GST payable by"><Select className="py-2 text-xs" value={f.gstPayableBy} onChange={(e) => setF({ ...f, gstPayableBy: e.target.value })}>{GST_PAYABLE.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Payment terms"><Select className="py-2 text-xs" value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })}>{PAYMENT_TERMS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="LR type"><Select className="py-2 text-xs" value={f.lrType} onChange={(e) => setF({ ...f, lrType: e.target.value })}>{LR_TYPES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label="Delivery at"><Select className="py-2 text-xs" value={f.deliveryAt} onChange={(e) => setF({ ...f, deliveryAt: e.target.value })}>{DELIVERY_AT.map((x) => <option key={x}>{x}</option>)}</Select></Field>
      </div>
      <Field label="Remarks on the LR"><Input className="py-2 text-xs" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="handle with care, fragile…" /></Field>

      {!f.tripId && (
        <div className="mb-2 grid gap-x-3 rounded-lg border border-dashed border-line p-2.5 sm:grid-cols-3">
          <Field label="New trip · vehicle no."><Input className="py-2 text-xs" value={newTrip.vehicle} onChange={(e) => setNewTrip({ ...newTrip, vehicle: e.target.value })} placeholder="GJ06 AB 4412" /></Field>
          <Field label="Driver"><Input className="py-2 text-xs" value={newTrip.driver} onChange={(e) => setNewTrip({ ...newTrip, driver: e.target.value })} /></Field>
          <Field label="Driver mobile"><Input className="py-2 text-xs" inputMode="tel" value={newTrip.driverMobile} onChange={(e) => setNewTrip({ ...newTrip, driverMobile: e.target.value })} /></Field>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={busy || !f.consignee || !f.consigneeMobile} onClick={() => void issue()}>{busy ? "Issuing…" : `Issue LR · ${inr(totals.total)}`}</Button>
        {err && <span className="text-xs text-red-700">{err}</span>}
      </div>
      {issued && <DocumentView booking={issued.booking} doc={issued.doc} onClose={() => { setIssued(null); onClose(); }} />}
    </div>
  );
}

function TripDetail({
  trip, bookings, unassigned, onPatched, onBookingChanged,
}: {
  trip: Trip; bookings: Booking[]; unassigned: Booking[];
  onPatched: (t: Trip) => void; onBookingChanged: (b: Booking) => void;
}) {
  const consignments = bookings.filter((b) => b.admin.trip === trip.id);
  const [assignId, setAssignId] = useState("");
  const [exp, setExp] = useState<{ head: string; amount: string; note: string }>({ head: EXP_HEADS[0], amount: "", note: "" });
  const [adv, setAdv] = useState<{ amount: string; note: string }>({ amount: "", note: "" });
  const [err, setErr] = useState("");
  const [viewing, setViewing] = useState<{ booking: Booking; doc: DocRecord } | null>(null);

  function openLr(b: Booking) {
    if (!b.lr) return;
    const doc = b.docs?.find((d) => d.type === "LR" && d.no === b.lr!.no) ?? { type: "LR" as const, no: b.lr.no, at: b.lr.at, amount: b.quote.total };
    setViewing({ booking: b, doc });
  }

  async function doAssign() {
    if (!assignId) return;
    try { onBookingChanged(await assignBookingToTrip(assignId, trip.id)); setAssignId(""); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function doUnassign(bookingId: string) {
    try { onBookingChanged(await unassignBooking(bookingId)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function setStatus(status: Trip["status"]) {
    try { onPatched(await patchTrip(trip.id, { status })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function addExpense() {
    const amount = Number(exp.amount);
    if (!amount) return;
    const entry: TripExpense = { at: new Date().toISOString(), head: exp.head, amount, note: exp.note };
    try { onPatched(await patchTrip(trip.id, { expenses: [...trip.expenses, entry] })); setExp({ head: EXP_HEADS[0], amount: "", note: "" }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function addAdvance() {
    const amount = Number(adv.amount);
    if (!amount) return;
    try { onPatched(await patchTrip(trip.id, { advances: [...trip.advances, { at: new Date().toISOString(), amount, note: adv.note }] })); setAdv({ amount: "", note: "" }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  const advTotal = trip.advances.reduce((a, x) => a + x.amount, 0);
  const expTotal = trip.expenses.reduce((a, x) => a + x.amount, 0);
  const settlement = advTotal - expTotal;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">{trip.id} <span className="font-normal text-faint">{trip.route} · {trip.date}</span></h3>
        <Select value={trip.status} onChange={(e) => void setStatus(e.target.value as Trip["status"])} className="w-auto">
          <option value="planned">planned</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
        </Select>
      </div>
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}

      <div className="mb-4">
        <h4 className="mb-1.5 text-xs font-semibold text-muted">Consignments</h4>
        <table className="mb-2 w-full text-xs">
          <tbody>
            {consignments.length === 0 && <tr><td className="py-2 text-muted">No bookings assigned yet.</td></tr>}
            {consignments.map((b) => (
              <tr key={b.id} className="border-b border-dashed border-line last:border-0">
                <td className="py-1.5 pr-2 font-mono">{b.id}</td>
                <td className="pr-2">{b.from} → {b.to}</td>
                <td className="pr-2">{b.lr ? <button className="text-brand hover:underline" onClick={() => openLr(b)}>LR {b.lr.no}</button> : "—"}</td>
                <td className="pr-2 text-right">{inr(b.quote.total)}</td>
                <td><button className="text-red-700 hover:underline" onClick={() => void doUnassign(b.id)}>unassign</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <Select value={assignId} onChange={(e) => setAssignId(e.target.value)} className="flex-1">
            <option value="">Assign a booking…</option>
            {unassigned.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.from} → {b.to} · {b.traveller.name}</option>)}
          </Select>
          <Button size="sm" disabled={!assignId} onClick={() => void doAssign()}>Assign &amp; issue LR</Button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-muted">Expenses · {inr(expTotal)}</h4>
          <ul className="mb-2 text-xs">
            {trip.expenses.map((e, i) => <li key={i} className="flex justify-between border-b border-dashed border-line py-1 last:border-0"><span>{e.head}{e.note ? ` · ${e.note}` : ""}</span><span>{inr(e.amount)}</span></li>)}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            <Select value={exp.head} onChange={(e) => setExp((p) => ({ ...p, head: e.target.value }))} className="w-auto text-xs">
              {EXP_HEADS.map((h) => <option key={h}>{h}</option>)}
            </Select>
            <Input className="w-24" placeholder="₹" value={exp.amount} onChange={(e) => setExp((p) => ({ ...p, amount: e.target.value }))} />
            <Input className="w-28" placeholder="note" value={exp.note} onChange={(e) => setExp((p) => ({ ...p, note: e.target.value }))} />
            <Button size="sm" variant="outline" onClick={() => void addExpense()}>Add</Button>
          </div>
        </div>
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-muted">Advances · {inr(advTotal)}</h4>
          <ul className="mb-2 text-xs">
            {trip.advances.map((a, i) => <li key={i} className="flex justify-between border-b border-dashed border-line py-1 last:border-0"><span>{a.note || "advance"}</span><span>{inr(a.amount)}</span></li>)}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            <Input className="w-24" placeholder="₹" value={adv.amount} onChange={(e) => setAdv((p) => ({ ...p, amount: e.target.value }))} />
            <Input className="w-28" placeholder="note" value={adv.note} onChange={(e) => setAdv((p) => ({ ...p, note: e.target.value }))} />
            <Button size="sm" variant="outline" onClick={() => void addAdvance()}>Add</Button>
          </div>
        </div>
      </div>

      <p className="rounded-xl bg-paper p-3 text-xs">
        <b>Driver settlement:</b> advances {inr(advTotal)} − expenses {inr(expTotal)} = {settlement >= 0 ? `driver returns ${inr(settlement)}` : `company owes driver ${inr(-settlement)}`}
      </p>
      {viewing && <DocumentView booking={viewing.booking} doc={viewing.doc} onClose={() => setViewing(null)} />}
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="block font-display text-xl font-extrabold">{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
