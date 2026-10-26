"use client";
/** Admin OS · LR & trips — one vehicle, one run; bookings club onto it.
 *  Ported from the static build's m-lr module (admin.js ~L1993-2227).
 *  Not yet ported from that module: manifest/LR print layouts, driver
 *  settlement document, e-way bill JSON (that was never wired to a real
 *  GSP there either — download-only). */
import { useEffect, useMemo, useState } from "react";
import { inr } from "@/lib/pricing";
import { watchAdminBookings } from "@/lib/adminApi";
import { assignBookingToTrip, createTrip, patchTrip, unassignBooking, watchTrips } from "@/lib/tripsApi";
import type { Booking, DocRecord, Trip, TripExpense } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import DocumentView from "./DocumentView";

const VEHICLE_TYPES = ["Tata Ace", "Bolero pickup", "Eicher 14ft", "Eicher 17ft", "Tempo traveller", "Container"];
const EXP_HEADS = ["Fuel", "Toll / FASTag", "Driver bhatta", "Loading / unloading", "Parking", "Airport charges", "Vehicle hire", "Misc"];
const ELIGIBLE = ["submitted", "accepted", "assigned", "picked_up", "in_transit"];

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

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Open trips" value={String(kpis.open)} />
        <Kpi label="LRs issued" value={String(kpis.lrs)} />
        <Kpi label="Trip revenue" value={inr(kpis.rev)} />
        <Kpi label="Trip expenses" value={inr(kpis.exp)} hint={`${kpis.margin}% margin`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
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
        </div>

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
