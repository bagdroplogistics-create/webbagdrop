"use client";
/** Admin OS · Events & bulk — wedding/group travel. Ported from the static
 *  build's m-evt module (admin.html:348-473, admin.js:1058-1333): guests
 *  travel under one event code, booked across sectors (pickup-city legs)
 *  each with a suggested per-bag rate from the pricing engine.
 *
 *  This covers the admin side: create an event, see its real bag/family
 *  counts from assigned bookings, convert an inquiry into one. The guest-
 *  facing side — the landing page at /weddings?code=… and, for the Y2K
 *  event specifically, the full booking desk at /e/[code] — lives in
 *  src/app/weddings and src/app/e/[code] (see EventDetail's "View guest
 *  page" link below). Both read/write the same `events`/`bookings` rows
 *  this module does. */
import { useEffect, useMemo, useState } from "react";
import { CITIES, inr, quote } from "@/lib/pricing";
import { adminApplyPatch, watchAdminBookings } from "@/lib/adminApi";
import { createEvent, patchEvent, watchEvents } from "@/lib/eventsApi";
import { setInquiryStatus, watchInquiries } from "@/lib/crmApi";
import type { Booking, EventSector, Inquiry, WeddingEvent } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

const TYPES = [
  { v: "WED", t: "Wedding" }, { v: "MIC", t: "MICE / corporate" }, { v: "PIL", t: "Pilgrimage" },
  { v: "SPT", t: "Sports group" }, { v: "STU", t: "Student group" }, { v: "FAM", t: "Family reunion" },
];

const EMPTY_SECTOR: EventSector = { city: "", rate: 0, pickDay: "", retDay: "" };

export default function EventsAndBulk() {
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => watchEvents(setEvents, (e) => setErr(String(e))), []);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => watchInquiries(setInquiries, (e) => setErr(String(e))), []);

  const [sel, setSel] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const selected = events.find((e) => e.id === sel) ?? null;

  function statsFor(eventId: string) {
    const b = bookings.filter((x) => x.eventCode === eventId);
    return { families: b.length, bags: b.reduce((a, x) => a + x.bags + x.oversize, 0) };
  }

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900"><b>Couldn&apos;t load:</b> {err}</p>}

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Open events" value={String(events.filter((e) => e.status === "open").length)} />
        <Kpi label="Inquiries waiting" value={String(inquiries.filter((i) => i.status === "new").length)} />
        <Kpi label="Guests travelling" value={String(bookings.filter((b) => b.eventCode).length)} />
      </div>

      {!showForm && !selected && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">Events <Badge tone="ok">live</Badge></h3>
            <Button size="sm" onClick={() => setShowForm(true)}>Open a wedding / event</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-wider text-faint">
                  <th className="py-2 pr-2">Event</th><th className="pr-2">City · dates</th><th className="pr-2 text-right">Families / bags</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">No events yet.</td></tr>}
                {events.map((e) => {
                  const s = statsFor(e.id);
                  return (
                    <tr key={e.id} onClick={() => setSel(e.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-paper">
                      <td className="py-2 pr-2"><span className="font-mono text-xs">{e.id}</span><br />{e.name}</td>
                      <td className="pr-2 text-xs">{e.venueCity}<br />{e.dates.in} → {e.dates.out}</td>
                      <td className="pr-2 text-right text-xs">{s.families} / {s.bags}<br /><span className="text-faint">expected {e.expected.families} / {e.expected.bags}</span></td>
                      <td><Badge tone={e.status === "open" ? "ok" : "muted"}>{e.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!showForm && !selected && inquiries.filter((i) => i.status === "new").length > 0 && (
        <Card>
          <h3 className="mb-3 font-display text-sm font-bold">Inquiries waiting <span className="font-normal text-faint">convert into an event</span></h3>
          <ul className="space-y-2">
            {inquiries.filter((i) => i.status === "new").map((i) => (
              <li key={i.id} className="flex items-center justify-between border-b border-dashed border-line pb-2 text-sm last:border-0">
                <span>{i.contact.name} · {i.venue || i.venueCity} · ~{i.families ?? "?"} families / {i.bags ?? "?"} bags</span>
                <Button size="sm" variant="outline" onClick={async () => { await setInquiryStatus(i.id, "converted"); setShowForm(true); }}>Convert</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showForm && <EventForm onDone={(ev) => { setShowForm(false); setSel(ev.id); }} onCancel={() => setShowForm(false)} />}

      {selected && (
        <EventDetail
          event={selected}
          bookings={bookings.filter((b) => b.eventCode === selected.id)}
          unassigned={bookings.filter((b) => !b.eventCode)}
          onBack={() => setSel(null)}
          onPatched={(e) => setEvents((p) => p.map((x) => (x.id === e.id ? e : x)))}
          onBookingChanged={(b) => setBookings((p) => p.map((x) => (x.id === b.id ? b : x)))}
        />
      )}
    </div>
  );
}

function EventForm({ onDone, onCancel }: { onDone: (e: WeddingEvent) => void; onCancel: () => void }) {
  const [d, setD] = useState<Omit<WeddingEvent, "id" | "created" | "status">>({
    name: "", type: "WED", venueCity: CITIES[0].name, venue: "",
    dates: { in: "", out: "" }, direction: "both", billing: "host",
    expected: { families: 10, bags: 30 },
    rates: { oversize: 900, minBags: 2, slabPct: 5, depositPct: 20 },
    sectors: [], contacts: { host: "", hostMobile: "" },
    landing: {},
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function addSector() { setD((p) => ({ ...p, sectors: [...p.sectors, { ...EMPTY_SECTOR }] })); }
  function setSector(i: number, patch: Partial<EventSector>) {
    setD((p) => ({ ...p, sectors: p.sectors.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }
  function suggestRate(i: number, city: string) {
    const q = quote({ fromName: city, toName: d.venueCity, bags: 1, oversize: 0, mode: "road" });
    if (!("error" in q)) setSector(i, { rate: q.perBag });
  }

  async function save() {
    if (!d.name || !d.venueCity) { setErr("Name and venue city are required."); return; }
    setBusy(true); setErr("");
    try { onDone(await createEvent(d)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-bold">Open a wedding / event</h3>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Name"><Input value={d.name} onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))} placeholder="Mehta - Shah wedding" /></Field>
        <Field label="Type">
          <Select value={d.type} onChange={(e) => setD((p) => ({ ...p, type: e.target.value }))}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </Select>
        </Field>
        <Field label="Venue city">
          <Select value={d.venueCity} onChange={(e) => setD((p) => ({ ...p, venueCity: e.target.value }))}>
            {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Venue"><Input value={d.venue} onChange={(e) => setD((p) => ({ ...p, venue: e.target.value }))} placeholder="Hotel / resort name" /></Field>
        <Field label="Arrive"><Input type="date" value={d.dates.in} onChange={(e) => setD((p) => ({ ...p, dates: { ...p.dates, in: e.target.value } }))} /></Field>
        <Field label="Leave"><Input type="date" value={d.dates.out} onChange={(e) => setD((p) => ({ ...p, dates: { ...p.dates, out: e.target.value } }))} /></Field>
        <Field label="Direction">
          <Select value={d.direction} onChange={(e) => setD((p) => ({ ...p, direction: e.target.value }))}>
            <option value="both">Both ways</option><option value="inbound">Inbound only</option><option value="outbound">Outbound only</option>
          </Select>
        </Field>
        <Field label="Billing basis">
          <Select value={d.billing} onChange={(e) => setD((p) => ({ ...p, billing: e.target.value }))}>
            <option value="host">Host pays all</option><option value="split">Split by family</option><option value="family">Each family pays</option>
          </Select>
        </Field>
        <Field label="Expected families"><Input type="number" value={d.expected.families} onChange={(e) => setD((p) => ({ ...p, expected: { ...p.expected, families: Number(e.target.value) } }))} /></Field>
        <Field label="Expected bags"><Input type="number" value={d.expected.bags} onChange={(e) => setD((p) => ({ ...p, expected: { ...p.expected, bags: Number(e.target.value) } }))} /></Field>
        <Field label="Host name"><Input value={d.contacts.host} onChange={(e) => setD((p) => ({ ...p, contacts: { ...p.contacts, host: e.target.value } }))} /></Field>
        <Field label="Host mobile"><Input value={d.contacts.hostMobile} onChange={(e) => setD((p) => ({ ...p, contacts: { ...p.contacts, hostMobile: e.target.value } }))} /></Field>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted">Pickup sectors</h4>
          <Button size="sm" variant="outline" onClick={addSector}>Add sector</Button>
        </div>
        {d.sectors.length === 0 && <p className="text-xs text-muted">No sectors yet — add each pickup city guests will travel from.</p>}
        {d.sectors.map((s, i) => (
          <div key={i} className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Select className="w-36" value={s.city} onChange={(e) => { setSector(i, { city: e.target.value }); suggestRate(i, e.target.value); }}>
              <option value="">City…</option>
              {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
            </Select>
            <Input className="w-28" type="number" placeholder="rate/bag" value={s.rate || ""} onChange={(e) => setSector(i, { rate: Number(e.target.value) })} />
            <Input className="w-32" placeholder="pickup day" value={s.pickDay} onChange={(e) => setSector(i, { pickDay: e.target.value })} />
            <Input className="w-32" placeholder="return day" value={s.retDay} onChange={(e) => setSector(i, { retDay: e.target.value })} />
            <button className="text-xs text-red-700 hover:underline" onClick={() => setD((p) => ({ ...p, sectors: p.sectors.filter((_, idx) => idx !== i) }))}>remove</button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Create event"}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        {err && <span className="text-sm text-red-700">{err}</span>}
      </div>
    </Card>
  );
}

function EventDetail({
  event, bookings, unassigned, onBack, onPatched, onBookingChanged,
}: {
  event: WeddingEvent; bookings: Booking[]; unassigned: Booking[];
  onBack: () => void; onPatched: (e: WeddingEvent) => void; onBookingChanged: (b: Booking) => void;
}) {
  const [assignId, setAssignId] = useState("");
  const [err, setErr] = useState("");
  const totals = useMemo(() => ({
    families: bookings.length, bags: bookings.reduce((a, b) => a + b.bags + b.oversize, 0),
    value: bookings.reduce((a, b) => a + (b.pay?.amount ?? b.quote.total), 0),
  }), [bookings]);

  async function assign() {
    const b = unassigned.find((x) => x.id === assignId);
    if (!b) return;
    try { await adminApplyPatch(b, { eventCode: event.id }, `Joined event ${event.id}`); onBookingChanged({ ...b, eventCode: event.id }); setAssignId(""); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function toggleStatus() {
    await patchEvent(event.id, { status: event.status === "open" ? "closed" : "open" }).then(onPatched);
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <button className="mb-1 text-xs text-brand hover:underline" onClick={onBack}>← All events</button>
          <h3 className="font-display text-base font-bold">{event.name} <span className="font-mono text-xs font-normal text-faint">{event.id}</span></h3>
          <p className="text-xs text-muted">{event.venue}, {event.venueCity} · {event.dates.in} → {event.dates.out}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/weddings?code=${encodeURIComponent(event.id)}`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline">View guest page ↗</Button>
          </a>
          <Button size="sm" variant="outline" onClick={() => void toggleStatus()}>{event.status === "open" ? "Close event" : "Reopen"}</Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi label="Families travelling" value={String(totals.families)} />
        <Kpi label="Bags" value={String(totals.bags)} />
        <Kpi label="Value" value={inr(totals.value)} />
      </div>

      <div className="mb-4">
        <h4 className="mb-1.5 text-xs font-semibold text-muted">Sectors</h4>
        {event.sectors.length === 0 && <p className="text-xs text-muted">No sectors set.</p>}
        <ul className="text-xs">
          {event.sectors.map((s, i) => (
            <li key={i} className="flex justify-between border-b border-dashed border-line py-1 last:border-0">
              <span>{s.city} → {event.venueCity} · pickup {s.pickDay || "—"} · return {s.retDay || "—"}</span>
              <span>{inr(s.rate)}/bag</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1.5 text-xs font-semibold text-muted">Guests on this event</h4>
        <table className="mb-2 w-full text-xs">
          <tbody>
            {bookings.length === 0 && <tr><td className="py-2 text-muted">No bookings yet.</td></tr>}
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-dashed border-line last:border-0">
                <td className="py-1.5 pr-2 font-mono">{b.id}</td>
                <td className="pr-2">{b.traveller.name}</td>
                <td className="pr-2">{b.from} → {b.to}</td>
                <td className="text-right">{inr(b.quote.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <Select value={assignId} onChange={(e) => setAssignId(e.target.value)} className="flex-1">
            <option value="">Add an existing booking to this event…</option>
            {unassigned.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.traveller.name} · {b.from} → {b.to}</option>)}
          </Select>
          <Button size="sm" disabled={!assignId} onClick={() => void assign()}>Add</Button>
        </div>
        {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      </div>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className="block font-display text-xl font-extrabold">{value}</span>
    </Card>
  );
}
