"use client";
/** Admin OS · Weddings — events list, per-event guest bag bookings, per-bag
 *  stage progression (the Y2K desk's 8 stages; stages 1-2 -> picked_up,
 *  3/4/6 -> in_transit, 5/7 -> delivered) and counts. Ported from the static
 *  build's Y2K ops desk (?ops=1) + the events seed in y2k.html; follows the
 *  LRAndTrips module pattern and the cookie-gated /api/admin/* routes. */
import { useEffect, useMemo, useState } from "react";
import { adminListBookings, adminSaveBooking, watchAdminBookings, SaveRefused } from "@/lib/adminApi";
import { nowIso } from "@/lib/db";
import { adminSaveEvent, generateHostInvoice, newEventCode, watchAdminEvents, y2kSeedEvent } from "@/lib/eventsApi";
import type { BagdropEvent, Booking, BookingStatus } from "@/lib/types";
import { WEDDING_STAGES } from "@/lib/types";
import { approvalCounts, bookingOpen, closesText, statusForStage, weddingStatus } from "@/lib/weddingStatus";
import { teamView } from "@/lib/weddingTeamView";
import TeamDesk, { type TeamApi } from "@/components/wedding/TeamDesk";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { inr } from "@/lib/pricing";
import JourneyPanel from "./JourneyPanel";
import { HostInvoiceDoc } from "./DocumentView";

type WeddingState = {
  members?: { id: string; name?: string; room?: string }[];
  bags?: { id: string; owner?: string; type?: string; colour?: string; ret?: boolean; hang?: boolean; value?: string }[];
  pickups?: { id: string; date?: string }[];
  extraReturn?: string;
  family?: { phone?: string };
};

function deskState(b: Booking): WeddingState | null {
  return (b.wedding?.state as WeddingState | undefined) ?? null;
}
function deskCounts(list: Booking[]) {
  let guests = 0, bagsOut = 0, bagsBack = 0, noRoom = 0;
  for (const b of list) {
    const st = deskState(b);
    if (st) {
      guests += st.members?.length ?? 0;
      bagsOut += st.bags?.length ?? 0;
      bagsBack += (st.bags?.filter((x) => x.ret).length ?? 0) + (Number(st.extraReturn) || 0);
      noRoom += st.members?.filter((m) => !m.room).length ?? 0;
    } else {
      guests += b.family?.guests ?? 0;
      bagsOut += b.bags;
    }
  }
  return { guests, bagsOut, bagsBack, noRoom };
}

export default function Weddings({ onOpenBooking }: { onOpenBooking?: (id: string) => void }) {
  const [events, setEvents] = useState<BagdropEvent[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchAdminEvents(setEvents, (e) => setErr(String(e))), []);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);

  const weddingBookings = useMemo(() => bookings.filter((b) => b.uc === "wed" && b.eventCode), [bookings]);
  const [sel, setSel] = useState<string | null>(null);
  const event = events.find((e) => e.id === sel) ?? null;
  const eventBookings = useMemo(
    () => weddingBookings.filter((b) => b.eventCode === sel),
    [weddingBookings, sel],
  );

  const kpis = useMemo(() => {
    const open = events.filter((e) => e.status === "open").length;
    const c = deskCounts(weddingBookings);
    return { open, families: weddingBookings.length, ...c, ...approvalCounts(weddingBookings) };
  }, [events, weddingBookings]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function seedY2k() {
    setBusy(true); setMsg("");
    try { await adminSaveEvent(y2kSeedEvent()); setMsg("Y2K-WED event is live."); setSel("Y2K-WED"); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  async function toggleOpen(e: BagdropEvent) {
    try { await adminSaveEvent({ ...e, status: e.status === "open" ? "closed" : "open" }); }
    catch (x) { setErr(String(x)); }
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Open events" value={String(kpis.open)} />
        <Kpi label="Family bookings" value={String(kpis.families)} hint={`${kpis.waiting} awaiting approval · ${kpis.confirmed} confirmed`} />
        <Kpi label="Guests" value={String(kpis.guests)} />
        <Kpi label="Bags out" value={String(kpis.bagsOut)} hint={`${kpis.bagsBack} coming back`} />
        <Kpi label="No room yet" value={String(kpis.noRoom)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid gap-5">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold">Events <Badge tone="ok">live</Badge></h3>
              {!events.some((e) => e.id === "Y2K-WED") && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void seedY2k()}>Seed Y2K event</Button>
              )}
            </div>
            {msg && <p className="mb-2 text-xs text-muted">{msg}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                    <th className="py-2 pr-2">Code</th><th className="pr-2">Event</th><th className="pr-2">Dates</th><th className="pr-2 text-right">Families</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">No events yet. Seed the Y2K wedding or create one below.</td></tr>}
                  {events.map((e) => {
                    const evB = weddingBookings.filter((b) => b.eventCode === e.id);
                    const fams = evB.length, waiting = approvalCounts(evB).waiting;
                    return (
                      <tr key={e.id} onClick={() => setSel(e.id)} className={`cursor-pointer border-b border-line last:border-0 ${sel === e.id ? "bg-paper" : ""}`}>
                        <td className="py-2 pr-2 font-mono text-xs">{e.id}</td>
                        <td className="pr-2 text-xs">{e.name}<br /><span className="text-faint">{e.venue || e.venueCity}</span></td>
                        <td className="pr-2 text-xs">{e.dates?.in} → {e.dates?.out}</td>
                        <td className="pr-2 text-right">{fams}{waiting > 0 && <span className="block text-[10px] font-semibold text-amber-700">{waiting} waiting</span>}</td>
                        <td><Badge tone={e.status === "open" ? "ok" : "muted"}>{e.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <CreateEvent onCreated={(id) => setSel(id)} />
        </div>

        {event ? (
          <EventDetail
            event={event}
            bookings={eventBookings}
            onToggleOpen={() => void toggleOpen(event)}
            onBookingChanged={(b) => setBookings((p) => p.map((x) => (x.id === b.id ? b : x)))}
            onOpenBooking={onOpenBooking}
            onReload={() => void adminListBookings().then(setBookings).catch(() => undefined)}
          />
        ) : (
          <Card><p className="py-10 text-center text-sm text-muted">Select an event to see its guest bag bookings.</p></Card>
        )}
      </div>
    </div>
  );
}

function EventDetail({
  event, bookings, onToggleOpen, onBookingChanged, onOpenBooking, onReload,
}: {
  event: BagdropEvent; bookings: Booking[]; onToggleOpen: () => void; onBookingChanged: (b: Booking) => void;
  onOpenBooking?: (id: string) => void; onReload: () => void;
}) {
  const [err, setErr] = useState("");
  const c = deskCounts(bookings);
  const ap = approvalCounts(bookings);
  const landingUrl = `/weddings?code=${encodeURIComponent(event.id)}`;
  const deskUrl = event.id === "Y2K-WED" ? "/e/y2k" : null;

  /* a bag past "Booked" needs the guest's Aadhaar; the team may override, which the server stamps on the record */
  const [gate, setGate] = useState<{ b: Booking; tagId: string; stage: string; msg: string } | null>(null);
  async function setStage(b: Booking, tagId: string, stage: string, override = false) {
    const k = WEDDING_STAGES.indexOf(stage as (typeof WEDDING_STAGES)[number]);
    if (k < 0 || !b.wedding) return;
    setErr(""); setGate(null);
    const at = nowIso();
    const next: Booking = {
      ...b,
      status: statusForStage(k, b.status),
      wedding: { ...b.wedding, bagStatus: { ...(b.wedding.bagStatus ?? {}), [tagId]: stage }, updatedAt: at },
      events: [...(b.events ?? []), { at, by: "admin", text: `Bag ${tagId.split("-").slice(-1)[0]} → ${stage} (Weddings module)` }],
    };
    try { onBookingChanged(await adminSaveBooking(next, { overrideIdentityGate: override })); }
    catch (e) {
      if (e instanceof SaveRefused && e.code === "IDENTITY_NOT_VERIFIED") setGate({ b, tagId, stage, msg: e.message });
      else { setErr(e instanceof Error ? e.message : String(e)); if (e instanceof SaveRefused && e.code === "STALE") onReload(); }
    }
  }

  async function saveCloses(day: string) {
    try { await adminSaveEvent({ ...event, bookingCloses: day || undefined }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function setStatus(b: Booking, status: BookingStatus) {
    const next: Booking = { ...b, status, events: [...(b.events ?? []), { at: nowIso(), by: "admin", text: `Status → ${status} (Weddings module)` }] };
    setErr("");
    try { onBookingChanged(await adminSaveBooking(next)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">{event.name} <span className="font-normal text-faint">{event.id}</span></h3>
        <div className="flex flex-wrap items-center gap-2">
          <a className="text-xs font-semibold text-brand hover:underline" href={withBase(`/admin/manifest?event=${encodeURIComponent(event.id)}`)} target="_blank" rel="noreferrer">Manifest · plan pickups, deliveries, returns</a>
          <a className="text-xs font-semibold text-brand hover:underline" href={landingUrl} target="_blank" rel="noreferrer">Landing page</a>
          {deskUrl && <a className="text-xs font-semibold text-brand hover:underline" href={deskUrl} target="_blank" rel="noreferrer">Wedding desk</a>}
          {deskUrl && <a className="text-xs font-semibold text-brand hover:underline" href={`${deskUrl}?ops=1`} target="_blank" rel="noreferrer">Ops desk</a>}
          <Button size="sm" variant="outline" onClick={onToggleOpen}>{event.status === "open" ? "Close event" : "Reopen event"}</Button>
        </div>
      </div>
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}
      {gate && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p><b>{gate.tagId} not moved to {gate.stage}.</b> {gate.msg}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void setStage(gate.b, gate.tagId, gate.stage, true)}>Mark it {gate.stage} anyway</Button>
            <Button size="sm" variant="outline" onClick={() => setGate(null)}>Keep it as it was</Button>
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-2 rounded-xl bg-paper p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Guest bookings close</span>
          <Input type="date" className="w-auto !py-1 !text-xs" value={event.bookingCloses ?? ""} onChange={(e) => void saveCloses(e.target.value)} />
          <span className="text-muted">end of day IST · after it guests cannot book, add bags or add a return trip; the team still edits here and in Shipments</span>
          <Badge tone={bookingOpen(event) ? "ok" : "bad"}>{bookingOpen(event) ? (event.bookingCloses ? `open until ${closesText(event)}` : "open") : "closed"}</Badge>
        </div>
        <TeamSetting event={event} onError={setErr} />
      </div>

      <Commercials event={event} onError={setErr} />

      {event.billing === "host" && <HostInvoicePanel event={event} onChanged={onReload} />}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Families" value={String(bookings.length)} hint={`${ap.waiting} awaiting approval · ${ap.confirmed} confirmed`} />
        <Kpi label="Guests" value={String(c.guests)} />
        <Kpi label="Bags out" value={String(c.bagsOut)} hint={`${c.bagsBack} coming back`} />
        <Kpi label="No room yet" value={String(c.noRoom)} />
      </div>

      <div className="mb-5">
        <TeamDesk families={bookings.filter((b) => b.wedding?.state).map(teamView)} eventId={event.id} api={opsApi} tagsBase="/api/admin/wedding-tags" onChanged={onReload} />
      </div>

      {bookings.length === 0 && <p className="py-6 text-center text-sm text-muted">No guest bookings yet. They appear here as families book on the landing page or the wedding desk.</p>}

      <div className="grid gap-3">
        {bookings.map((b) => {
          const st = deskState(b);
          return (
            <details key={b.id} className="rounded-xl border border-line bg-paper/40 p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="font-mono text-xs">{b.id}</span>
                <b>{b.family?.name ?? b.traveller.name}</b>
                {b.family?.side && <Badge tone={b.family.side === "groom" ? "warn" : "info"}>{b.family.side === "groom" ? "Groom's side" : "Bride's side"}</Badge>}
                <span className="text-muted">{st ? `${st.members?.length ?? 0} guests` : `${b.family?.guests ?? 1} guests`} · {st ? `${st.bags?.length ?? 0} bags` : `${b.bags} bags`}</span>
                <span className="ml-auto"><Badge tone={weddingStatus(b).tone}>{weddingStatus(b).label}</Badge></span>
              </summary>
              <div className="mt-3 grid gap-2">
                <JourneyPanel b={b} compact onChanged={onBookingChanged} />
                <p className="text-xs text-muted">
                  {b.traveller.name} · {b.traveller.mobile} · {b.from} → {b.to} · pickup {b.date}
                  {b.source ? <> · <span className="text-faint">{b.source}</span></> : null}
                  {onOpenBooking && (
                    <>
                      {" · "}
                      <button type="button" className="cursor-pointer font-semibold text-brand hover:underline" onClick={() => onOpenBooking(b.id)}>
                        Open in Shipments
                      </button>
                    </>
                  )}
                  {" · "}
                  <a className="font-semibold text-brand hover:underline" href={withBase(`/api/admin/wedding-tags?event=${encodeURIComponent(event.id)}&id=${encodeURIComponent(b.id)}&media=4x6&mark=1`)} target="_blank" rel="noreferrer">Print this family&apos;s tags</a>
                </p>
                {st?.bags?.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                          <th className="py-1.5 pr-2">Tag</th><th className="pr-2">Bag</th><th className="pr-2">Owner · room</th><th>Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.bags.map((bag) => {
                          const tagId = `${b.wedding!.bookingId}-${bag.owner}-${bag.id}`;
                          const m = st.members?.find((x) => x.id === bag.owner);
                          const cur = b.wedding!.bagStatus?.[tagId] ?? "Booked";
                          return (
                            <tr key={bag.id} className="border-b border-dashed border-line last:border-0">
                              <td className="py-1.5 pr-2 font-mono">{tagId}</td>
                              <td className="pr-2">{bag.colour} {bag.type}{bag.hang ? " · hang" : ""}</td>
                              <td className="pr-2">{m?.name ?? "—"} · {m?.room || <b>no room</b>}</td>
                              <td>
                                <Select className="w-auto !py-1 !text-xs" value={cur} onChange={(e) => void setStage(b, tagId, e.target.value)}>
                                  {WEDDING_STAGES.map((s) => <option key={s}>{s}</option>)}
                                </Select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted">Landing-page booking ({b.bags} bags) · status</span>
                    <Select className="w-auto !py-1 !text-xs" value={b.status} onChange={(e) => void setStatus(b, e.target.value as BookingStatus)}>
                      {(["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered"] as BookingStatus[]).map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}

const opsApi: TeamApi = async (body) => {
  const r = await fetch("/api/admin/wedding-ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
};

/** The event company: its name and its people (name + mobile) who can sign in at /event. */
type Person = { name: string; mobile: string };
/** The event's commercials, open to add or edit at any time: who pays, the
 *  per-bag rate (before GST) for every pickup city, add-ons and billing
 *  terms, and the expected volume for the estimate. Saved on the event
 *  record, which the landing page, Bulk & manifest tools and Finance read. */
function Commercials({ event, onError }: { event: BagdropEvent; onError: (e: string) => void }) {
  type Row = { city: string; rate: string; pickDay: string; retDay: string };
  const toRows = (e: BagdropEvent): Row[] => (e.sectors ?? []).map((x) => ({ city: x.city, rate: String(x.rate ?? ""), pickDay: x.pickDay ?? "", retDay: x.retDay ?? "" }));
  const [billing, setBilling] = useState<"host" | "family">(event.billing ?? "host");
  const [direction, setDirection] = useState<"both" | "out">(event.direction ?? "both");
  const [rows, setRows] = useState<Row[]>(toRows(event));
  const [r, setR] = useState({ oversize: String(event.rates?.oversize ?? ""), minBags: String(event.rates?.minBags ?? ""), slabPct: String(event.rates?.slabPct ?? ""), depositPct: String(event.rates?.depositPct ?? "") });
  const [x, setX] = useState({ families: String(event.expected?.families ?? ""), bags: String(event.expected?.bags ?? "") });
  const [saved, setSaved] = useState("");
  const [open, setOpen] = useState(false);
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const edit = (i: number, patch: Partial<Row>) => setRows((list) => list.map((row, k) => (k === i ? { ...row, ...patch } : row)));
  const avgRate = rows.length ? rows.reduce((a, row) => a + (Number(row.rate) || 0), 0) / rows.length : 0;
  const estimate = (Number(x.bags) || 0) * avgRate;
  const dirty = JSON.stringify({ billing, direction, rows, r, x }) !== JSON.stringify({ billing: event.billing ?? "host", direction: event.direction ?? "both", rows: toRows(event), r: { oversize: String(event.rates?.oversize ?? ""), minBags: String(event.rates?.minBags ?? ""), slabPct: String(event.rates?.slabPct ?? ""), depositPct: String(event.rates?.depositPct ?? "") }, x: { families: String(event.expected?.families ?? ""), bags: String(event.expected?.bags ?? "") } });
  async function save() {
    const list = rows.map((row) => ({ city: row.city.trim(), rate: Number(row.rate) || 0, pickDay: row.pickDay, retDay: row.retDay })).filter((row) => row.city);
    if (list.some((row) => !(row.rate > 0))) { onError("Every pickup city needs a rate per bag above ₹0."); return; }
    for (const k of ["slabPct", "depositPct"] as const) { const v = num(r[k]); if (v !== undefined && (v < 0 || v > 100)) { onError("Percentages are between 0 and 100."); return; } }
    try {
      await adminSaveEvent({ ...event, billing, direction, sectors: list,
        rates: { oversize: num(r.oversize), minBags: num(r.minBags), slabPct: num(r.slabPct), depositPct: num(r.depositPct) },
        expected: { families: num(x.families), bags: num(x.bags) } });
      onError(""); setSaved("Saved"); setTimeout(() => setSaved(""), 1500);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
  return (
    <div className="mb-4 rounded-xl border border-line bg-paper p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Commercials</span>
          <Badge tone={billing === "host" ? "info" : "warn"}>{billing === "host" ? "Hosts pay" : "Families pay"}</Badge>
          <span className="text-muted">{rows.length ? `${rows.length} pickup cit${rows.length > 1 ? "ies" : "y"} · avg ${money(avgRate)}/bag before GST` : "no rates yet"}{r.oversize ? ` · oversize +${money(Number(r.oversize))}` : ""}{x.bags ? ` · est. ${money(estimate)} for ${x.bags} bags` : ""}</span>
        </div>
        <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Add or edit"}</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Who pays">
              <Select value={billing} onChange={(e) => setBilling(e.target.value as "host" | "family")}>
                <option value="host">Hosts pay (families see no price)</option>
                <option value="family">Families pay per booking</option>
              </Select>
            </Field>
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as "both" | "out")}>
                <option value="both">To venue & back home</option>
                <option value="out">To venue only</option>
              </Select>
            </Field>
            <Field label="Expected families"><Input value={x.families} onChange={(e) => setX((p) => ({ ...p, families: e.target.value }))} inputMode="numeric" placeholder="e.g. 40" /></Field>
            <Field label="Expected bags"><Input value={x.bags} onChange={(e) => setX((p) => ({ ...p, bags: e.target.value }))} inputMode="numeric" placeholder="e.g. 120" /></Field>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="font-semibold">Rate per bag by pickup city <span className="font-normal text-muted">· before GST (5% added on invoices)</span></span><Button size="sm" variant="outline" onClick={() => setRows((list) => [...list, { city: "", rate: "", pickDay: event.dates?.in ?? "", retDay: event.dates?.out ?? "" }])}>Add a city</Button></div>
            {rows.length === 0 && <p className="text-muted">No pickup city yet. Add each city guests travel from, with its rate.</p>}
            <div className="grid gap-2">
              {rows.map((row, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <Field label="Pickup city"><Input value={row.city} onChange={(e) => edit(i, { city: e.target.value })} placeholder="Mumbai" /></Field>
                  <Field label="Rate per bag (₹)"><Input value={row.rate} onChange={(e) => edit(i, { rate: e.target.value })} inputMode="numeric" /></Field>
                  <Field label="Pickup day"><Input type="date" value={row.pickDay} onChange={(e) => edit(i, { pickDay: e.target.value })} /></Field>
                  <Field label="Return day"><Input type="date" value={row.retDay} onChange={(e) => edit(i, { retDay: e.target.value })} /></Field>
                  <button type="button" className="mb-3 text-red-700 hover:underline" onClick={() => setRows((list) => list.filter((_, k) => k !== i))}>Remove</button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Oversize add-on (₹ per bag)"><Input value={r.oversize} onChange={(e) => setR((p) => ({ ...p, oversize: e.target.value }))} inputMode="numeric" placeholder="e.g. 900" /></Field>
            <Field label="Minimum bags per family"><Input value={r.minBags} onChange={(e) => setR((p) => ({ ...p, minBags: e.target.value }))} inputMode="numeric" placeholder="e.g. 2" /></Field>
            <Field label="Volume slab discount (%)"><Input value={r.slabPct} onChange={(e) => setR((p) => ({ ...p, slabPct: e.target.value }))} inputMode="numeric" placeholder="e.g. 5" /></Field>
            <Field label="Advance / deposit (%)"><Input value={r.depositPct} onChange={(e) => setR((p) => ({ ...p, depositPct: e.target.value }))} inputMode="numeric" placeholder="e.g. 20" /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!dirty} onClick={() => void save()}>Save commercials</Button>
            {saved && <span className="text-green-700">{saved}</span>}
            <span className="text-muted">Changes apply to new quotes and invoices from now; bookings already confirmed keep their terms.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamSetting({ event, onError }: { event: BagdropEvent; onError: (e: string) => void }) {
  const [company, setCompany] = useState(event.team?.company ?? "");
  // older events listed bare mobiles; show them as people without a name yet
  const [people, setPeople] = useState<Person[]>(event.team?.people?.length ? event.team.people : (event.team?.mobiles ?? []).map((mobile) => ({ name: "", mobile })));
  const [saved, setSaved] = useState("");
  const edit = (i: number, patch: Partial<Person>) => setPeople((list) => list.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  async function save() {
    const list = people.map((p) => ({ name: p.name.trim().slice(0, 60), mobile: p.mobile.replace(/\D/g, "").slice(-10) })).filter((p) => p.name || p.mobile);
    if (list.some((p) => !p.name)) { onError("Give every person a name."); return; }
    if (list.some((p) => p.mobile.length !== 10)) { onError("Each mobile needs 10 digits."); return; }
    if (new Set(list.map((p) => p.mobile)).size !== list.length) { onError("The same mobile is listed twice."); return; }
    if (list.length && !company.trim()) { onError("Add the company name."); return; }
    try {
      await adminSaveEvent({ ...event, team: list.length || company.trim() ? { company: company.trim(), people: list, mobiles: list.map((p) => p.mobile) } : undefined });
      setPeople(list); onError(""); setSaved("Saved"); setTimeout(() => setSaved(""), 1500);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Event company</span>
        <Input className="!w-56 !py-1 !text-xs" placeholder="Company name" value={company} onChange={(e) => setCompany(e.target.value)} />
        <a className="font-semibold text-brand hover:underline" href={withBase("/event")} target="_blank" rel="noreferrer">Event desk login</a>
      </div>
      <p className="text-muted">People who can sign in at /event with a WhatsApp code to their mobile. Their name shows on every reply and action.</p>
      {people.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input className="!w-48 !py-1 !text-xs" placeholder="Name" value={p.name} maxLength={60} onChange={(e) => edit(i, { name: e.target.value })} />
          <Input className="!w-40 !py-1 !text-xs" inputMode="numeric" placeholder="10-digit mobile" value={p.mobile} onChange={(e) => edit(i, { mobile: e.target.value.replace(/[^\d+ ]/g, "") })} />
          <Button size="sm" variant="ghost" onClick={() => setPeople((list) => list.filter((_, k) => k !== i))}>Remove</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPeople((list) => [...list, { name: "", mobile: "" }])}>Add person</Button>
        <Button size="sm" onClick={() => void save()}>Save event company</Button>
        {saved && <span className="text-green-700">{saved}</span>}
      </div>
    </div>
  );
}

/** The final host bill — a deliberate one-time action, not the live
 *  estimate shown in Commercials. Only shown for billing: "host" events.
 *  Once issued, the amount is fixed (ALREADY_INVOICED on a second try);
 *  re-issuing after a correction isn't supported here — that's a Finance
 *  credit-note situation, same as any other booking's invoice. */
function HostInvoicePanel({ event, onChanged }: { event: BagdropEvent; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showDoc, setShowDoc] = useState(false);

  async function generate() {
    if (!window.confirm(`Generate the final host invoice for ${event.name}?\n\nThis bills every confirmed family under this event at the event's Commercials rates, right now — do this once, after the event, when every family's bag count is final.`)) return;
    setBusy(true); setErr("");
    try { await generateHostInvoice(event.id); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="mb-4 rounded-xl border border-line bg-paper/40 p-3 text-sm">
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}
      {event.hostInvoice ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">Host invoice {event.hostInvoice.no}</p>
            <p className="text-xs text-muted">{inr(event.hostInvoice.total)} · {event.hostInvoice.lines.length} families · issued {new Date(event.hostInvoice.at).toLocaleDateString("en-IN")} by {event.hostInvoice.by}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowDoc(true)}>View / print</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">No final host invoice yet — the Commercials line above is only a live estimate. Generate it once, after the event, from every family's actual final bag count.</p>
          <Button size="sm" disabled={busy} onClick={() => void generate()}>{busy ? "Generating…" : "Generate final host invoice"}</Button>
        </div>
      )}
      {showDoc && event.hostInvoice && <HostInvoiceDoc event={event} inv={event.hostInvoice} onClose={() => setShowDoc(false)} />}
    </div>
  );
}

function CreateEvent({ onCreated }: { onCreated: (id: string) => void }) {
  const [f, setF] = useState({
    name: "", venue: "", venueCity: "", dateIn: "", dateOut: "",
    city: "Mumbai", rate: "3500", pickDay: "", retDay: "",
    names: "", hashtag: "", datesText: "", billing: "host" as "host" | "family", direction: "both" as "both" | "out",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function create() {
    if (!f.name || !f.venueCity || !f.dateIn || !f.dateOut) { setMsg("Name, venue city and both dates are required."); return; }
    setBusy(true); setMsg("");
    const id = newEventCode("WED");
    const doc: BagdropEvent = {
      id, created: nowIso(), status: "open",
      name: f.name, type: "WED", venueCity: f.venueCity, venue: f.venue || f.venueCity,
      dates: { in: f.dateIn, out: f.dateOut }, direction: f.direction, billing: f.billing,
      rates: { minBags: 2 },
      sectors: [{ city: f.city, rate: Number(f.rate) || 0, pickDay: f.pickDay || f.dateIn, retDay: f.retDay || f.dateOut }],
      contacts: {},
      landing: { names: f.names || f.name, hashtag: f.hashtag, datesText: f.datesText },
    };
    try {
      await adminSaveEvent(doc);
      setMsg(`Created ${id} — landing: /weddings?code=${id}`);
      onCreated(id);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">New wedding event <span className="font-normal text-faint">guests book on its landing page</span></h3>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Event name"><Input value={f.name} onChange={set("name")} placeholder="Yashna & Yash wedding" /></Field>
        <Field label="Couple names (landing)"><Input value={f.names} onChange={set("names")} placeholder="Yashna & Yash" /></Field>
        <Field label="Venue"><Input value={f.venue} onChange={set("venue")} placeholder="Taj Aravali Resort" /></Field>
        <Field label="Venue city"><Input value={f.venueCity} onChange={set("venueCity")} placeholder="Udaipur" /></Field>
        <Field label="Check-in date"><Input type="date" value={f.dateIn} onChange={set("dateIn")} /></Field>
        <Field label="Check-out date"><Input type="date" value={f.dateOut} onChange={set("dateOut")} /></Field>
        <Field label="Pickup city (sector)"><Input value={f.city} onChange={set("city")} /></Field>
        <Field label="Rate per bag (₹)"><Input value={f.rate} onChange={set("rate")} inputMode="numeric" /></Field>
        <Field label="Pickup day"><Input type="date" value={f.pickDay} onChange={set("pickDay")} /></Field>
        <Field label="Return day"><Input type="date" value={f.retDay} onChange={set("retDay")} /></Field>
        <Field label="Hashtag"><Input value={f.hashtag} onChange={set("hashtag")} placeholder="#Y2K" /></Field>
        <Field label="Dates text (landing)"><Input value={f.datesText} onChange={set("datesText")} placeholder="17 & 18 December 2026" /></Field>
        <Field label="Billing">
          <Select value={f.billing} onChange={set("billing")}>
            <option value="host">Host pays</option>
            <option value="family">Families pay</option>
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={f.direction} onChange={set("direction")}>
            <option value="both">To venue & back home</option>
            <option value="out">To venue only</option>
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={() => void create()}>{busy ? "Creating…" : "Create event"}</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="!p-4">
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="block font-display text-xl font-extrabold">{value}</span>
      {hint && <span className="block text-[11px] text-faint">{hint}</span>}
    </Card>
  );
}
