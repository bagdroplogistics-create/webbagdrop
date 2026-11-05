"use client";
/** Event manifest · plan every pickup, delivery and return for one event.
 *  Reads the families' bookings; writes the plan (run, order, planned time,
 *  captain, vehicle) on each booking (wedding.plan). Tabs: Pickup plan,
 *  Delivery plan, Return plan, All bags, Missing. CSV and print. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SaveRefused, adminListBookings, adminSaveBooking, watchAdminBookings } from "@/lib/adminApi";
import { adminListEvents } from "@/lib/eventsApi";
import { buildManifest, groupPickups, manifestCsv, planOf, type LegPlan, type PickupRow } from "@/lib/weddingManifest";
import type { BagdropEvent, Booking } from "@/lib/types";
import type { Captain, VehicleRec } from "@/lib/opsModel";
import { Badge, Button, Input, Select, TableFrame } from "@/components/ui";

type Tab = "pickup" | "delivery" | "return" | "bags" | "gaps";
const TABS: [Tab, string][] = [["pickup", "Pickup plan"], ["delivery", "Delivery plan"], ["return", "Return plan"], ["bags", "All bags"], ["gaps", "Missing"]];

export default function ManifestClient() {
  const params = useSearchParams();
  const [events, setEvents] = useState<BagdropEvent[]>([]);
  const [code, setCode] = useState(params.get("event") ?? "");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [masters, setMasters] = useState<{ captains: Captain[]; vehicles: VehicleRec[] }>({ captains: [], vehicles: [] });
  const [tab, setTab] = useState<Tab>("pickup");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => { adminListEvents().then((l) => { setEvents(l); setCode((c) => c || l[0]?.id || ""); }).catch((e) => setErr(String(e))); }, []);
  useEffect(() => watchAdminBookings(setBookings, (e) => setErr(String(e))), []);
  useEffect(() => { fetch("/api/admin/ops").then((r) => r.json()).then((j) => setMasters({ captains: j.captains ?? [], vehicles: j.vehicles ?? [] })).catch(() => undefined); }, []);

  const event = events.find((e) => e.id === code);
  const m = useMemo(() => buildManifest(bookings, code), [bookings, code]);
  const byId = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const savePlan = useCallback(async (bookingId: string, leg: "pickup" | "delivery" | "return", patch: LegPlan, pickupId?: string) => {
    const apply = async (b: Booking) => {
      if (!b.wedding) return;
      const plan = planOf(b);
      const next = leg === "pickup"
        ? { ...plan, pickup: { ...plan.pickup, [pickupId ?? "P1"]: { ...(plan.pickup?.[pickupId ?? "P1"] ?? {}), ...patch } } }
        : { ...plan, [leg]: { ...(plan[leg] ?? {}), ...patch } };
      const what = Object.entries(patch).map(([k, v]) => `${k} ${v === "" || v == null ? "cleared" : v}`).join(", ");
      const savedDoc = await adminSaveBooking({ ...b, wedding: { ...b.wedding, plan: next }, events: [...b.events, { at: new Date().toISOString(), by: "admin", text: `Manifest · ${leg}${pickupId ? " " + pickupId : ""} · ${what}` }] });
      /* keep the saved revision on screen, so the next field saves against it (no STALE) */
      setBookings((p) => p.map((x) => (x.id === savedDoc.id ? savedDoc : x)));
      setSaved(`${bookingId} · ${leg} saved`); setTimeout(() => setSaved(""), 1500);
    };
    const b = byId.get(bookingId); if (!b) return;
    try { setErr(null); await apply(b); }
    catch (e) {
      /* the booking moved meanwhile (a sweep issued its LR, someone set a room): reload it and apply the same change once more */
      if (e instanceof SaveRefused && e.code === "STALE") {
        const fresh = (await adminListBookings()).find((x) => x.id === bookingId);
        if (fresh) { try { await apply(fresh); return; } catch (e2) { console.error("manifest save (retry)", e2); setErr(e2 instanceof Error ? e2.message : String(e2)); return; } }
      }
      console.error("manifest save", e);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [byId]);

  const download = () => {
    const blob = new Blob([manifestCsv(m)], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${code}-manifest.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <main className="admin-os min-h-screen px-4 py-5 lg:px-6" data-manifest>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:mb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">BAGDROP OS · event manifest</p>
          <h1 className="font-display">{event?.name ?? "Event manifest"} <span className="font-normal text-muted">{code}</span></h1>
          {event && <p className="text-[13px] text-muted">{event.venue}, {event.venueCity} · {event.dates?.in} to {event.dates?.out} · {m.totals.families} families · {m.totals.guests} guests · {m.totals.bags} bags ({m.totals.returning} returning) · {m.totals.pickups} pickup addresses</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {events.length > 1 && <Select className="w-auto" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Event">{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>}
          <Button size="sm" variant="outline" onClick={download}>Download CSV</Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
          <a className="text-xs font-semibold text-brand hover:underline" href="/admin" target="_blank" rel="noreferrer">BAGDROP OS</a>
        </div>
      </div>
      {err && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 print:hidden">
        {TABS.map(([k, n]) => (
          <button key={k} onClick={() => setTab(k)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold ${tab === k ? "bg-ink text-white" : "bg-paper text-ink hover:bg-stone-200"}`}>
            {n}{k === "gaps" && m.gaps.length ? ` · ${m.gaps.length}` : ""}{k === "return" ? ` · ${m.returns.length}` : ""}
          </button>
        ))}
        {saved && <span className="text-xs text-green-700">{saved}</span>}
      </div>

      {tab === "pickup" && <PickupPlan m={m} masters={masters} onPlan={(r, patch) => savePlan(r.bookingId, "pickup", patch, r.key.split(":")[1])} />}
      {tab === "delivery" && <DeliveryPlan m={m} event={event} masters={masters} onPlan={(id, patch) => savePlan(id, "delivery", patch)} />}
      {tab === "return" && <ReturnPlan m={m} masters={masters} onPlan={(id, patch) => savePlan(id, "return", patch)} />}
      {tab === "bags" && <AllBags m={m} />}
      {tab === "gaps" && <Gaps m={m} />}
    </main>
  );
}

/* ================= plan fields, shared by the three legs ================= */
function PlanFields({ plan, masters, onPlan, runs }: { plan: LegPlan; masters: { captains: Captain[]; vehicles: VehicleRec[] }; onPlan: (p: LegPlan) => void; runs?: boolean }) {
  const [t, setT] = useState(plan.time ?? "");
  const [o, setO] = useState(plan.order != null ? String(plan.order) : "");
  const [run, setRun] = useState(plan.run ?? "");
  const pick = (label: string, value: string, options: string[], onChange: (v: string) => void) => options.length ? (
    <Select className="!py-1 !text-xs" aria-label={label} value={options.includes(value) ? value : value ? "__typed" : ""} onChange={(e) => { if (e.target.value !== "__typed") onChange(e.target.value); }}>
      <option value="">{label}…</option>{options.map((x) => <option key={x}>{x}</option>)}{value && !options.includes(value) && <option value="__typed">{value}</option>}
    </Select>
  ) : <Input className="!py-1 !text-xs" aria-label={label} placeholder={label} defaultValue={value} onBlur={(e) => { if (e.target.value !== value) onChange(e.target.value); }} />;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-plan>
      {runs && <Input className="!w-20 !py-1 !text-xs" aria-label="Run" placeholder="Run" value={run} onChange={(e) => setRun(e.target.value)} onBlur={() => { if (run !== (plan.run ?? "")) onPlan({ run }); }} />}
      <Input className="!w-16 !py-1 !text-xs" aria-label="Order" placeholder="#" inputMode="numeric" value={o} onChange={(e) => setO(e.target.value.replace(/\D/g, ""))} onBlur={() => { const n = o === "" ? undefined : Number(o); if (n !== plan.order) onPlan({ order: n }); }} />
      <Input className="!w-24 !py-1 !text-xs" aria-label="Planned time" placeholder="10:30" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { if (t !== (plan.time ?? "")) onPlan({ time: t }); }} />
      {pick("Captain", plan.captain ?? "", masters.captains.map((c) => c.name), (v) => onPlan({ captain: v }))}
      {pick("Vehicle", plan.vehicle ?? "", masters.vehicles.map((v) => v.number), (v) => onPlan({ vehicle: v }))}
    </div>
  );
}
const Tags = ({ bags }: { bags: PickupRow["bags"] }) => (
  <span className="flex flex-wrap gap-1">{bags.map((b) => <span key={b.tag} className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[11px]" title={`${b.type} · ${b.colour} · ${b.weight}`}>{b.tag}{b.returning ? " ↩" : ""}</span>)}</span>
);
const Gap = ({ gaps }: { gaps: string[] }) => gaps.length ? <span className="text-[11px] text-amber-700">Missing: {gaps.join(", ")}</span> : <span className="text-[11px] text-green-700">Complete</span>;

/* ================= pickup plan: date → slot → pincode area ================= */
function PickupPlan({ m, masters, onPlan }: { m: ReturnType<typeof buildManifest>; masters: { captains: Captain[]; vehicles: VehicleRec[] }; onPlan: (r: PickupRow, p: LegPlan) => void }) {
  const groups = groupPickups(m.pickups);
  if (!m.pickups.length) return <p className="text-sm text-muted">No families booked yet.</p>;
  return (
    <div className="grid gap-5">
      <p className="text-[12px] text-muted print:hidden">Grouped by pickup date, slot and pincode area, in route order. Give each family a run (A, B…), an order within it, the planned time, the captain and the vehicle; everything saves as you leave the box. The tag codes are the ones printed on the bags; ↩ marks a bag coming back.</p>
      {groups.map((g) => (
        <section key={g.date} className="rounded-xl border border-line bg-white p-4 print:break-inside-avoid">
          <h2 className="mb-2 font-display text-base font-bold">{g.date || "No date"} <span className="font-normal text-muted">· {g.slots.reduce((a, s) => a + s.areas.reduce((x, y) => x + y.rows.length, 0), 0)} pickups · {g.slots.reduce((a, s) => a + s.areas.reduce((x, y) => x + y.rows.reduce((p, q) => p + q.bags.length, 0), 0), 0)} bags</span></h2>
          {g.slots.map((s) => (
            <div key={s.slot} className="mb-3">
              <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted">{s.slot || "No slot"}</h3>
              <TableFrame maxHeight="none">
                <table className="text-[12.5px]">
                  <thead><tr className="text-left"><th>Area</th><th>Family · contact</th><th>Address</th><th>Guests</th><th>Bags · tag codes</th><th>Plan</th><th>Status</th></tr></thead>
                  <tbody>
                    {s.areas.flatMap((a) => a.rows.map((r, i) => (
                      <tr key={r.key} data-pickup={r.key}>
                        <td className="font-mono text-xs">{i === 0 ? a.pincode : ""}</td>
                        <td><b>{r.family}</b> <span className="text-faint">· {r.side === "groom" ? "groom's side" : r.side === "bride" ? "bride's side" : r.side}</span><br /><span className="text-xs">{r.lead} · {r.phone}{r.email ? ` · ${r.email}` : ""}</span><br /><span className="font-mono text-[11px] text-faint">{r.bookingId}</span></td>
                        <td className="max-w-[260px] text-xs">{r.address || <span className="text-amber-700">no address</span>}{r.pincode ? `, ${r.pincode}` : ""}{r.landmark ? ` · ${r.landmark}` : ""}<br /><span className="text-muted">{r.city} · {r.lift || "lift?"}</span></td>
                        <td className="text-xs">{r.guests.join(", ")}</td>
                        <td><Tags bags={r.bags} /></td>
                        <td><PlanFields key={JSON.stringify(r.plan)} plan={r.plan} masters={masters} runs onPlan={(p) => onPlan(r, p)} /><Gap gaps={r.gaps} /></td>
                        <td><Badge tone={r.status === "accepted" || r.status === "assigned" ? "ok" : r.status === "submitted" ? "warn" : "info"}>{r.status.replace("_", " ")}</Badge></td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </TableFrame>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* ================= delivery plan: by family, room per guest ================= */
function DeliveryPlan({ m, event, masters, onPlan }: { m: ReturnType<typeof buildManifest>; event?: BagdropEvent; masters: { captains: Captain[]; vehicles: VehicleRec[] }; onPlan: (id: string, p: LegPlan) => void }) {
  if (!m.deliveries.length) return <p className="text-sm text-muted">No families booked yet.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-[12px] text-muted print:hidden">Delivery at {event?.venue ?? "the venue"}{event?.dates?.in ? ` from ${event.dates.in}` : ""}: every bag to its guest&apos;s room (or the bag&apos;s own room). Rooms come from the event company&apos;s desk or Weddings &amp; events. Set the order, time, captain and vehicle of the delivery run.</p>
      <TableFrame maxHeight="none">
        <table className="text-[12.5px]">
          <thead><tr className="text-left"><th>Family · contact</th><th>Guest → room · bags</th><th>Plan</th></tr></thead>
          <tbody>
            {m.deliveries.map((d) => (
              <tr key={d.bookingId} data-delivery={d.bookingId}>
                <td><b>{d.family}</b><br /><span className="text-xs">{d.lead} · {d.phone}</span><br /><span className="font-mono text-[11px] text-faint">{d.bookingId}</span></td>
                <td className="text-xs">{d.guests.map((g) => (
                  <div key={g.name} className="mb-1 flex flex-wrap items-center gap-1.5"><span className="font-semibold">{g.name}</span><span className={g.room ? "rounded bg-paper px-1.5" : "text-amber-700"}>{g.room ? `Room ${g.room}` : "no room yet"}</span><Tags bags={g.bags.map((b) => ({ ...b, returning: false }))} /></div>
                ))}</td>
                <td><PlanFields key={JSON.stringify(d.plan)} plan={d.plan} masters={masters} onPlan={(p) => onPlan(d.bookingId, p)} /><Gap gaps={d.gaps} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </div>
  );
}

/* ================= return plan: by return date ================= */
function ReturnPlan({ m, masters, onPlan }: { m: ReturnType<typeof buildManifest>; masters: { captains: Captain[]; vehicles: VehicleRec[] }; onPlan: (id: string, p: LegPlan) => void }) {
  if (!m.returns.length) return <p className="text-sm text-muted">No bags booked to come back.</p>;
  const dates = [...new Set(m.returns.map((r) => r.date))];
  return (
    <div className="grid gap-4">
      <p className="text-[12px] text-muted print:hidden">Bags going home after the event, by return date, with the same tag codes as on the way out. Set the run order, time, captain and vehicle.</p>
      {dates.map((d) => (
        <section key={d} className="rounded-xl border border-line bg-white p-4 print:break-inside-avoid">
          <h2 className="mb-2 font-display text-base font-bold">{d || "No date"} <span className="font-normal text-muted">· {m.returns.filter((r) => r.date === d).reduce((a, r) => a + r.bags.length, 0)} bags</span></h2>
          <TableFrame maxHeight="none">
            <table className="text-[12.5px]">
              <thead><tr className="text-left"><th>Family · contact</th><th>Slot</th><th>Deliver to</th><th>Bags · tag codes</th><th>Plan</th></tr></thead>
              <tbody>
                {m.returns.filter((r) => r.date === d).map((r) => (
                  <tr key={r.bookingId} data-return={r.bookingId}>
                    <td><b>{r.family}</b><br /><span className="text-xs">{r.lead} · {r.phone}</span></td>
                    <td className="text-xs">{r.slot || "—"}</td>
                    <td className="max-w-[260px] text-xs">{r.dest}<br />{r.address || <span className="text-amber-700">no address</span>}</td>
                    <td><Tags bags={r.bags.map((b) => ({ ...b, returning: false }))} /></td>
                    <td><PlanFields key={JSON.stringify(r.plan)} plan={r.plan} masters={masters} runs onPlan={(p) => onPlan(r.bookingId, p)} /><Gap gaps={r.gaps} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        </section>
      ))}
    </div>
  );
}

/* ================= every bag, flat ================= */
function AllBags({ m }: { m: ReturnType<typeof buildManifest> }) {
  if (!m.bags.length) return <p className="text-sm text-muted">No bags yet.</p>;
  return (
    <TableFrame maxHeight="none">
      <table className="text-[12.5px]">
        <thead><tr className="text-left"><th>Tag code</th><th>Family</th><th>Guest</th><th>Room</th><th>Type</th><th>Colour</th><th>Weight</th><th>Declared ₹</th><th>Pickup</th><th>Return</th><th>Stage</th></tr></thead>
        <tbody>
          {m.bags.map((b) => (
            <tr key={b.tag}><td className="font-mono text-xs">{b.tag}</td><td>{b.family}</td><td>{b.ownerName}</td><td>{b.room || "—"}</td><td>{b.type || <span className="text-amber-700">?</span>}</td><td>{b.colour}</td><td>{b.weight}</td><td className="text-right">{b.value || "—"}</td><td className="font-mono text-xs">{b.pickupId}</td><td className="text-xs">{b.returning ? `${b.retDate}${b.retSlot ? " · " + b.retSlot : ""}` : "—"}</td><td><Badge tone={b.stage === "Booked" ? "muted" : "info"}>{b.stage}</Badge></td></tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

/* ================= what is still missing ================= */
function Gaps({ m }: { m: ReturnType<typeof buildManifest> }) {
  if (!m.gaps.length) return <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">Nothing missing: every family has its contacts, address, pincode, date, slot, lift, bag types, rooms and return details.</p>;
  return (
    <div className="grid gap-2">
      <p className="text-[12px] text-muted">Ask the family (My bags message) or fix it in Weddings &amp; events. Rooms come from the event company.</p>
      {m.gaps.map((g) => (
        <div key={g.bookingId} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900" data-gap={g.bookingId}><b>{g.family}</b> <span className="font-mono text-[11px]">{g.bookingId}</span> · missing {g.items.join(", ")}</div>
      ))}
    </div>
  );
}
