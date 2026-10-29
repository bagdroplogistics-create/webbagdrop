"use client";
/** Admin OS · Weddings — events list, per-event guest bag bookings, per-bag
 *  stage progression (the Y2K desk's 8 stages; stages 1-2 -> picked_up,
 *  3/4/6 -> in_transit, 5/7 -> delivered) and counts. Ported from the static
 *  build's Y2K ops desk (?ops=1) + the events seed in y2k.html; follows the
 *  LRAndTrips module pattern and the cookie-gated /api/admin/* routes. */
import { useEffect, useMemo, useState } from "react";
import { adminSaveBooking, watchAdminBookings } from "@/lib/adminApi";
import { nowIso } from "@/lib/db";
import { adminSaveEvent, newEventCode, watchAdminEvents, y2kSeedEvent } from "@/lib/eventsApi";
import type { BagdropEvent, Booking, BookingStatus } from "@/lib/types";
import { WEDDING_STAGES } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  submitted: "info", accepted: "info", assigned: "warn", picked_up: "warn",
  in_transit: "warn", delivered: "ok", rejected: "bad", cancelled: "bad", revised: "muted",
};

/** The Y2K desk's stage -> booking-status machine, verbatim. */
function statusForStage(stageIndex: number, current: BookingStatus): BookingStatus {
  let s = current;
  if (stageIndex >= 1 && stageIndex <= 2 && ["submitted", "accepted", "assigned"].includes(s)) s = "picked_up";
  if (stageIndex === 3 || stageIndex === 4 || stageIndex === 6) s = "in_transit";
  if (stageIndex === 5 || stageIndex === 7) s = "delivered";
  return s;
}

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

/* ================= RETURN BAGS DESK =================
 * Accepting a client's return bags in seconds — search by the guest/family
 * NAME, the BOOKING reference, or the BAG TAG given at booking. Typing an
 * exact tag and hitting Enter accepts that bag instantly (scan-gun style).
 * Accepting = stage "Return pickup" on the bag; the whole family's returns
 * accept in one tap. Landing-page bookings without per-bag tags accept as
 * one unit. Big touch targets — works the same on the phone. */
const RETURN_DONE = ["Return pickup", "Delivered home"];

function ReturnDesk({ bookings, onChanged }: { bookings: Booking[]; onChanged: (b: Booking) => void }) {
  const [q, setQ] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState("");

  /* every return-flagged bag across the wedding bookings, searchable */
  const rows = useMemo(() => {
    const out: { b: Booking; tagId: string; bagLabel: string; owner: string; room: string; family: string; accepted: boolean }[] = [];
    for (const b of bookings) {
      const st = deskState(b);
      if (!st?.bags?.length) continue;
      for (const bag of st.bags) {
        if (!bag.ret) continue;
        const tagId = `${b.wedding!.bookingId}-${bag.owner}-${bag.id}`;
        const m = st.members?.find((x) => x.id === bag.owner);
        out.push({
          b, tagId,
          bagLabel: [bag.colour, bag.type, bag.hang ? "· hang" : ""].filter(Boolean).join(" "),
          owner: m?.name ?? "—", room: m?.room ?? "",
          family: b.family?.name ?? b.traveller.name,
          accepted: RETURN_DONE.includes(b.wedding!.bagStatus?.[tagId] ?? ""),
        });
      }
    }
    return out;
  }, [bookings]);

  /* landing-page bookings (no per-bag tags) accept as one unit */
  const simple = useMemo(() => bookings.filter((b) => !deskState(b)?.bags?.length), [bookings]);

  const needle = q.trim().toLowerCase();
  const hitRows = needle
    ? rows.filter((r) => [r.family, r.owner, r.b.id, r.tagId, r.b.traveller.name, r.b.traveller.mobile].some((s) => s?.toLowerCase().includes(needle)))
    : [];
  const hitSimple = needle
    ? simple.filter((b) => [b.family?.name, b.traveller.name, b.id, b.traveller.mobile].some((s) => s?.toLowerCase().includes(needle)))
    : [];
  const expected = rows.length, acceptedN = rows.filter((r) => r.accepted).length;

  async function acceptTag(b: Booking, tagId: string) {
    setBusyKey(tagId); setErr("");
    const at = nowIso();
    const next: Booking = {
      ...b,
      status: statusForStage(6, b.status),
      wedding: { ...b.wedding!, bagStatus: { ...b.wedding!.bagStatus, [tagId]: "Return pickup" }, updatedAt: at },
      events: [...b.events, { at, by: "admin", text: `Return bag ACCEPTED · tag ${tagId} (Return bags desk)` }],
    };
    try { await adminSaveBooking(next); onChanged(next); setFlash(tagId); setTimeout(() => setFlash(null), 1600); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  }
  async function acceptFamily(b: Booking) {
    setBusyKey(b.id); setErr("");
    const st = deskState(b);
    const at = nowIso();
    const bagStatus = { ...b.wedding!.bagStatus };
    let n = 0;
    for (const bag of st?.bags ?? []) {
      if (!bag.ret) continue;
      const tagId = `${b.wedding!.bookingId}-${bag.owner}-${bag.id}`;
      if (!RETURN_DONE.includes(bagStatus[tagId] ?? "")) { bagStatus[tagId] = "Return pickup"; n++; }
    }
    const next: Booking = {
      ...b, status: statusForStage(6, b.status),
      wedding: { ...b.wedding!, bagStatus, updatedAt: at },
      events: [...b.events, { at, by: "admin", text: `Return bags ACCEPTED · ${n} bag(s) for ${b.family?.name ?? b.traveller.name} (Return bags desk)` }],
    };
    try { await adminSaveBooking(next); onChanged(next); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  }
  async function acceptSimple(b: Booking) {
    setBusyKey(b.id); setErr("");
    const at = nowIso();
    const next: Booking = {
      ...b, status: statusForStage(6, b.status),
      admin: { ...b.admin, returnAccepted: { at, bags: b.bags } },
      events: [...b.events, { at, by: "admin", text: `Return bags ACCEPTED · ${b.bags} bag(s) · ${b.family?.name ?? b.traveller.name} (Return bags desk)` }],
    };
    try { await adminSaveBooking(next); onChanged(next); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyKey(null); }
  }
  /* scan-gun / exact-tag fast path: Enter on an exact tag accepts at once */
  function onEnter() {
    const exact = rows.find((r) => r.tagId.toLowerCase() === needle && !r.accepted);
    if (exact) { void acceptTag(exact.b, exact.tagId); setQ(""); }
  }

  return (
    <Card className="border-l-4 border-l-[#EA580C]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">Return bags desk <span className="font-normal text-faint">accept by name · booking ref · bag tag — Enter on an exact tag accepts instantly</span></h3>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold tabular-nums">{acceptedN} / {expected} returns accepted</span>
      </div>
      <Input
        autoFocus className="mt-2 py-3 text-base" value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
        placeholder="Guest name · family · booking ref · bag tag…"
      />
      {err && <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-900">{err}</p>}

      {needle && hitRows.length === 0 && hitSimple.length === 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No match for “{q}” — check the spelling, or try the booking reference on the tag.</p>
      )}

      {/* grouped by family for one-tap accept-all */}
      {needle && [...new Set(hitRows.map((r) => r.b.id))].map((bid) => {
        const fam = hitRows.filter((r) => r.b.id === bid);
        const b = fam[0].b;
        const open = fam.filter((r) => !r.accepted).length;
        return (
          <div key={bid} className="anim-in mt-3 rounded-xl border border-line bg-paper/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px]"><b>{fam[0].family}</b> <span className="font-mono text-xs text-muted">{b.id}</span> · {b.traveller.mobile}</span>
              {open > 0 && <Button size="sm" disabled={busyKey === b.id} onClick={() => void acceptFamily(b)}>{busyKey === b.id ? "Accepting…" : `Accept all ${open} returns`}</Button>}
            </div>
            <div className="mt-2 grid gap-1.5">
              {fam.map((r) => (
                <div key={r.tagId}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors ${r.accepted ? "border-green-200 bg-green-50" : "border-line bg-white"} ${flash === r.tagId ? "ring-2 ring-green-400" : ""}`}>
                  <span className="min-w-0 text-xs">
                    <b className="font-mono text-[11.5px]">{r.tagId}</b>
                    <span className="block text-muted">{r.bagLabel || "bag"} · {r.owner}{r.room ? ` · room ${r.room}` : ""}</span>
                  </span>
                  {r.accepted
                    ? <Badge tone="ok">✓ accepted</Badge>
                    : <Button size="sm" variant="outline" disabled={busyKey === r.tagId} onClick={() => void acceptTag(r.b, r.tagId)}>{busyKey === r.tagId ? "…" : "Accept"}</Button>}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {needle && hitSimple.map((b) => {
        const done = !!(b.admin as { returnAccepted?: { at: string } }).returnAccepted;
        return (
          <div key={b.id} className="anim-in mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper/40 p-3">
            <span className="text-[13px]"><b>{b.family?.name ?? b.traveller.name}</b> <span className="font-mono text-xs text-muted">{b.id}</span> · {b.bags} bag(s) · {b.traveller.mobile}</span>
            {done ? <Badge tone="ok">✓ accepted</Badge>
              : <Button size="sm" disabled={busyKey === b.id} onClick={() => void acceptSimple(b)}>{busyKey === b.id ? "Accepting…" : `Accept ${b.bags} return bag(s)`}</Button>}
          </div>
        );
      })}

      {!needle && (
        <p className="mt-2 text-[11px] text-faint">Start typing — results appear as you type. The counter above tracks every return-flagged bag across this view&apos;s wedding bookings.</p>
      )}
    </Card>
  );
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
    return { open, families: weddingBookings.length, ...c };
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
        <Kpi label="Family bookings" value={String(kpis.families)} />
        <Kpi label="Guests" value={String(kpis.guests)} />
        <Kpi label="Bags out" value={String(kpis.bagsOut)} hint={`${kpis.bagsBack} coming back`} />
        <Kpi label="No room yet" value={String(kpis.noRoom)} />
      </div>

      <ReturnDesk
        bookings={sel ? eventBookings : weddingBookings}
        onChanged={(b) => setBookings((p) => p.map((x) => (x.id === b.id ? b : x)))}
      />

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
                    const fams = weddingBookings.filter((b) => b.eventCode === e.id).length;
                    return (
                      <tr key={e.id} onClick={() => setSel(e.id)} className={`cursor-pointer border-b border-line last:border-0 ${sel === e.id ? "bg-paper" : ""}`}>
                        <td className="py-2 pr-2 font-mono text-xs">{e.id}</td>
                        <td className="pr-2 text-xs">{e.name}<br /><span className="text-faint">{e.venue || e.venueCity}</span></td>
                        <td className="pr-2 text-xs">{e.dates?.in} → {e.dates?.out}</td>
                        <td className="pr-2 text-right">{fams}</td>
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
          />
        ) : (
          <Card><p className="py-10 text-center text-sm text-muted">Select an event to see its guest bag bookings.</p></Card>
        )}
      </div>
    </div>
  );
}

function EventDetail({
  event, bookings, onToggleOpen, onBookingChanged, onOpenBooking,
}: {
  event: BagdropEvent; bookings: Booking[]; onToggleOpen: () => void; onBookingChanged: (b: Booking) => void;
  onOpenBooking?: (id: string) => void;
}) {
  const [err, setErr] = useState("");
  const c = deskCounts(bookings);
  const landingUrl = `/weddings?code=${encodeURIComponent(event.id)}`;
  const deskUrl = event.id === "Y2K-WED" ? "/e/y2k" : null;

  async function setStage(b: Booking, tagId: string, stage: string) {
    const k = WEDDING_STAGES.indexOf(stage as (typeof WEDDING_STAGES)[number]);
    if (k < 0 || !b.wedding) return;
    const at = nowIso();
    const next: Booking = {
      ...b,
      status: statusForStage(k, b.status),
      wedding: { ...b.wedding, bagStatus: { ...b.wedding.bagStatus, [tagId]: stage }, updatedAt: at },
      events: [...b.events, { at, by: "admin", text: `Bag ${tagId.split("-").slice(-1)[0]} → ${stage} (Weddings module)` }],
    };
    try { await adminSaveBooking(next); onBookingChanged(next); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function setStatus(b: Booking, status: BookingStatus) {
    const next: Booking = { ...b, status, events: [...b.events, { at: nowIso(), by: "admin", text: `Status → ${status} (Weddings module)` }] };
    try { await adminSaveBooking(next); onBookingChanged(next); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">{event.name} <span className="font-normal text-faint">{event.id}</span></h3>
        <div className="flex flex-wrap items-center gap-2">
          <a className="text-xs font-semibold text-brand hover:underline" href={landingUrl} target="_blank" rel="noreferrer">Landing page ↗</a>
          {deskUrl && <a className="text-xs font-semibold text-brand hover:underline" href={deskUrl} target="_blank" rel="noreferrer">Wedding desk ↗</a>}
          {deskUrl && <a className="text-xs font-semibold text-brand hover:underline" href={`${deskUrl}?ops=1`} target="_blank" rel="noreferrer">Ops desk ↗</a>}
          <Button size="sm" variant="outline" onClick={onToggleOpen}>{event.status === "open" ? "Close event" : "Reopen event"}</Button>
        </div>
      </div>
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Families" value={String(bookings.length)} />
        <Kpi label="Guests" value={String(c.guests)} />
        <Kpi label="Bags out" value={String(c.bagsOut)} hint={`${c.bagsBack} coming back`} />
        <Kpi label="No room yet" value={String(c.noRoom)} />
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
                <span className="ml-auto"><Badge tone={STATUS_TONE[b.status] ?? "muted"}>{b.status}</Badge></span>
              </summary>
              <div className="mt-3 grid gap-2">
                <p className="text-xs text-muted">
                  {b.traveller.name} · {b.traveller.mobile} · {b.from} → {b.to} · pickup {b.date}
                  {b.source ? <> · <span className="text-faint">{b.source}</span></> : null}
                  {onOpenBooking && (
                    <>
                      {" · "}
                      <button type="button" className="cursor-pointer font-semibold text-brand hover:underline" onClick={() => onOpenBooking(b.id)}>
                        Open in Shipments →
                      </button>
                    </>
                  )}
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
                      {(["submitted", "accepted", "assigned", "picked_up", "in_transit", "delivered", "cancelled"] as BookingStatus[]).map((s) => <option key={s}>{s}</option>)}
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
