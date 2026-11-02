"use client";
/** Admin OS · Moves calendar — every booked consignment by day, week and
 *  month, appointment-style, with the clubbing suggestions beside it.
 *
 *  · Month: per-day pickups / line-hauls / deliveries, bags, the busiest
 *    city's load against daily capacity, and how many clubs are possible.
 *  · Week: 7 columns × hourly rows; timed pickups sit at their slot,
 *    line-hauls and untimed drops in the all-day row.
 *  · Day: pickups, line-haul and deliveries side by side, with flight /
 *    train numbers for air and rail.
 *  · Drag a pickup or delivery to another day (or hour) to reschedule: a
 *    reason is required and the customer is told on WhatsApp + email.
 *  · Suggestions (src/lib/movesPlan.ts): plan a city run, or club a
 *    line-haul into one trip (LR & trips — the LR is issued there).
 *  · Control tower (./ControlTower.tsx, src/lib/towerStats.ts): KPI tiles,
 *    at-risk feed, city × day load heatmap and lane flow above / beside it.
 *  · Motion (motion/react): sliding view switch, periods slide in from the
 *    direction you page, bookings glide to their new slot when moved,
 *    suggestion and risk cards animate in and out; reduce-motion respected.
 *  Solid blocks are approved and paid; dashed ones are still coming in. */
import { useCallback, useMemo, useState, type DragEvent } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { towerStats } from "@/lib/towerStats";
import { LaneFlowBars, LoadHeatmap, RiskFeed, TowerTiles } from "./ControlTower";
import { useNow } from "@/lib/useNow";
import { useLoad } from "@/lib/useLoad";
import { inr } from "@/lib/pricing";
import { refreshBookings } from "@/lib/adminApi";
import { assignBookingToTrip, createTrip } from "@/lib/tripsApi";
import { SLOTS } from "@/lib/travelPlan";
import { pcsLabel, targetCost, type CostModel } from "@/lib/opsModel";
import {
  DEFAULT_FLEET, addDays, legsOf, monthGrid, normFleet, suggestClubs, weekOf,
  type FleetSettings, type Leg, type LegKind, type Suggestion, type VehicleType,
} from "@/lib/movesPlan";
import type { Booking, Mode } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

type View = "month" | "week" | "day";
const localDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA"); // YYYY-MM-DD, browser time zone
const label = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", o);
const KIND: Record<LegKind, { name: string; tag: string; short: string; cls: string }> = {
  pickup:   { name: "Pickups",   tag: "Pickup", short: "P", cls: "border-orange-400 bg-orange-50 text-orange-950" },
  linehaul: { name: "Line-haul", tag: "Line-haul", short: "L", cls: "border-sky-400 bg-sky-50 text-sky-950" },
  delivery: { name: "Deliveries", tag: "Delivery", short: "D", cls: "border-emerald-400 bg-emerald-50 text-emerald-950" },
};
const MODE_NAME: Record<Mode, string> = { road: "Road", air: "Air", rail: "Rail", sea: "Sea" };
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM … 11 PM
const slotAt = (h: number) => SLOTS.find((s) => s.startMin === h * 60)?.label ?? "";
const legTag = (l: Leg) => (l.kind === "linehaul" ? MODE_NAME[l.mode] : KIND[l.kind].tag);
const EASE = [0.22, 1, 0.36, 1] as const;
const slide = {
  enter: (d: number) => ({ opacity: 0, x: d * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -48 }),
};
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function MovesCalendar({ bookings, model, onOpen }: { bookings: Booking[]; model: CostModel; onOpen: (id: string) => void }) {
  const now = useNow();
  const today = now ? localDay(now) : "";
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState("");
  const day = anchor || today;
  const [fleet, setFleet] = useState<FleetSettings>(DEFAULT_FLEET);
  const [city, setCity] = useState("");
  const [mode, setMode] = useState("");
  const [tone, setTone] = useState<"all" | "confirmed" | "pending">("all");
  const [kinds, setKinds] = useState<Record<LegKind, boolean>>({ pickup: true, linehaul: true, delivery: true });
  const [move, setMove] = useState<{ leg: Leg; date: string; slot: string } | null>(null);
  const [showFleet, setShowFleet] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [dir, setDir] = useState(0); // which way the period slides

  const loadFleet = useCallback(async () => {
    const r = await fetch("/api/admin/moves");
    const j = await r.json().catch(() => ({}));
    if (j.fleet) setFleet(normFleet(j.fleet));
  }, []);
  useLoad(loadFleet);

  const allLegs = useMemo(() => bookings.flatMap((b) => legsOf(b)), [bookings]);
  const cities = useMemo(() => [...new Set(allLegs.map((l) => l.city))].sort(), [allLegs]);
  const scoped = useMemo(() => allLegs.filter((l) => (!city || l.city === city || l.lane.includes(city)) && (!mode || l.mode === mode)), [allLegs, city, mode]);
  const legs = useMemo(() => scoped.filter((l) => kinds[l.kind] && (tone === "all" || l.tone === tone)), [scoped, kinds, tone]);
  const suggestions = useMemo(
    () => suggestClubs(scoped, fleet, (lane) => targetCost(model, lane).legs),
    [scoped, fleet, model],
  );

  const days = useMemo(() => {
    if (!day) return [];
    return view === "month" ? monthGrid(day.slice(0, 7)).flat() : view === "week" ? weekOf(day) : [day];
  }, [view, day]);
  const inRange = (d: string) => (view === "month" ? d.slice(0, 7) === day.slice(0, 7) : days.includes(d));
  const rangeSugs = suggestions.filter((s) => inRange(s.date));
  const byDay = useMemo(() => {
    const m = new Map<string, Leg[]>();
    for (const l of legs) m.set(l.date, [...(m.get(l.date) ?? []), l]);
    for (const list of m.values()) list.sort((a, b) => (a.min ?? 9999) - (b.min ?? 9999));
    return m;
  }, [legs]);
  const clubCount = (d: string) => suggestions.filter((s) => s.date === d && !s.planned).length;

  /* control tower: the month itself, the week, or (day view) the day's week */
  const statDays = useMemo(() => (!day ? [] : view === "month" ? days.filter((d) => d.slice(0, 7) === day.slice(0, 7)) : view === "week" ? days : weekOf(day)), [view, days, day]);
  const scopedBookings = useMemo(() => bookings.filter((b) => (!city || b.from === city || b.to === city) && (!mode || b.mode === mode)), [bookings, city, mode]);
  const tower = useMemo(() => (now && day ? towerStats(scopedBookings, fleet, suggestions, statDays, today, now) : null), [scopedBookings, fleet, suggestions, statDays, today, now, day]);
  const openDay = (d: string) => { setDir(0); setAnchor(d); setView("day"); };

  function step(dir: -1 | 1) {
    if (!day) return;
    setDir(dir);
    if (view === "month") {
      const [y, m] = day.split("-").map(Number);
      const t = new Date(Date.UTC(y, m - 1 + dir, 1));
      setAnchor(t.toISOString().slice(0, 10));
    } else setAnchor(addDays(day, view === "week" ? 7 * dir : dir));
  }

  /* ---------- drag to reschedule ---------- */
  function startDrag(e: DragEvent, l: Leg) {
    e.dataTransfer.setData("text/plain", l.key);
    e.dataTransfer.effectAllowed = "move";
  }
  function dropOn(e: DragEvent, date: string, hour: number | null) {
    e.preventDefault();
    const l = allLegs.find((x) => x.key === e.dataTransfer.getData("text/plain"));
    if (!l) return;
    askMove(l, date, hour !== null && l.kind === "pickup" ? slotAt(hour) : l.slot);
  }
  function askMove(l: Leg, date: string, slot: string) {
    if (l.kind === "linehaul") { setMsg({ ok: false, text: "The line-haul follows the pickup — move the pickup instead." }); return; }
    if (l.done) { setMsg({ ok: false, text: `${l.id} has already been picked up — its pickup can't move.` }); return; }
    if (date === l.date && slot === l.slot) return;
    setMsg(null);
    setMove({ leg: l, date, slot });
  }
  const allowDrop = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/moves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
    return j;
  }
  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); refreshBookings(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(""); }
  }

  async function clubIntoTrip(s: Suggestion) {
    const book = s.legs.filter((l) => l.tone === "confirmed" && !l.trip);
    const later = s.legs.filter((l) => l.tone !== "confirmed");
    if (!book.length) { setMsg({ ok: false, text: "None of these bookings is paid yet — a trip and LR are issued only after payment." }); return; }
    if (!window.confirm(`Create one ${s.vehicle} trip for ${s.lane} on ${label(s.date, { day: "numeric", month: "short" })} and issue LRs for ${book.length} booking(s)?${later.length ? `\n${later.length} unpaid booking(s) can join after payment.` : ""}`)) return;
    await run(s.key, async () => {
      const trip = await createTrip({ route: s.lane, date: s.date, vehicle: s.carrier, vehicleType: s.vehicle, driver: "", driverMobile: "" });
      const failed: string[] = [];
      for (const l of book) await assignBookingToTrip(l.id, trip.id).catch((e) => failed.push(`${l.id}: ${e instanceof Error ? e.message : e}`));
      if (failed.length) throw new Error(`Trip ${trip.id} created; not added — ${failed.join(" · ")}`);
      return `Trip ${trip.id} created with ${book.length} booking(s). Add the vehicle and driver in LR & trips.`;
    });
  }
  const runSheet = (s: Suggestion) => [
    `BAGDROP · ${s.title} · ${label(s.date, { weekday: "short", day: "numeric", month: "short" })}`,
    `${s.vehicle}${s.vehicles > 1 ? ` × ${s.vehicles}` : ""} · ${pcsLabel(s.pieces - s.oversize, s.oversize)}${s.carrier ? ` · ${s.carrier}` : ""}`,
    ...s.legs.map((l) => `- ${l.id} · ${l.name} · ${l.lane}${l.slot ? ` · ${l.slot}` : ""} · ${pcsLabel(l.pieces - l.oversize, l.oversize)}${l.tone === "pending" ? " (awaiting payment)" : ""}`),
  ].join("\n");

  if (!day) return <Card><p className="text-sm text-muted">Opening the calendar…</p></Card>;

  const title = view === "month" ? label(day, { month: "long", year: "numeric" })
    : view === "week" ? `${label(days[0], { day: "numeric", month: "short" })} – ${label(days[6], { day: "numeric", month: "short", year: "numeric" })}`
    : label(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <MotionConfig reducedMotion="user">
    <LayoutGroup>
    <div className="grid gap-4">
      {tower && <TowerTiles t={tower} period={view === "month" ? label(day, { month: "short" }) : "week"} onRisks={() => jump("tower-risks")} onClubs={() => jump("tower-clubs")} />}
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-paper p-0.5">
          {(["month", "week", "day"] as const).map((v) => (
            <button key={v} onClick={() => { setDir(0); setView(v); }} className={`relative cursor-pointer rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${view === v ? "text-white" : "text-ink"}`}>
              {view === v && <motion.span layoutId="mc-view-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{v}</span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => step(-1)} aria-label="Previous">Prev</Button>
        <Button size="sm" variant="outline" onClick={() => { setDir(0); setAnchor(""); }}>Today</Button>
        <Button size="sm" variant="outline" onClick={() => step(1)} aria-label="Next">Next</Button>
        <h3 className="font-display text-sm font-bold">{title}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Select className="w-36! py-1.5! text-xs!" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
            <option value="">All cities</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select className="w-28! py-1.5! text-xs!" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode">
            <option value="">All modes</option><option value="road">Road</option><option value="air">Air</option><option value="rail">Rail</option>
          </Select>
          <Select className="w-32! py-1.5! text-xs!" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} aria-label="Status">
            <option value="all">Paid + pending</option><option value="confirmed">Paid only</option><option value="pending">Pending only</option>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setShowFleet((v) => !v)}>Fleet settings</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        {(Object.keys(KIND) as LegKind[]).map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} />
            <span className={`rounded border px-1.5 ${KIND[k].cls}`}>{KIND[k].name}</span>
          </label>
        ))}
        <span className="rounded border border-dashed border-stone-400 px-1.5">dashed = awaiting approval / payment</span>
        <span className="hidden md:inline">Drag a pickup or delivery to another day{view !== "month" ? " or hour" : ""} to reschedule.</span>
      </div>

      {msg && <p className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{msg.text}</p>}
      {showFleet && <FleetEditor fleet={fleet} onSaved={(f) => { setFleet(f); setShowFleet(false); setMsg({ ok: true, text: "Fleet settings saved — suggestions updated." }); }} />}
      {move && (
        <MoveDialog move={move} onCancel={() => setMove(null)} onDone={(text) => { setMove(null); setMsg({ ok: true, text }); refreshBookings(); }} />
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_330px]">
        <div className="min-w-0">
          {/* phones: a plain agenda */}
          <div className="md:hidden"><Agenda days={view === "month" ? days.filter((d) => d.slice(0, 7) === day.slice(0, 7)) : days} byDay={byDay} today={today} onOpen={onOpen} onMove={(l) => askMove(l, l.date, l.slot)} /></div>
          <div className="hidden md:block">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={`${view}|${days[0]}`} custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.28, ease: EASE }}>
            {view === "month" && (
              <Card className="p-2">
                <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const list = byDay.get(d) ?? [];
                    const count = (k: LegKind) => list.filter((l) => l.kind === k).length;
                    const perCity = new Map<string, number>();
                    list.filter((l) => l.kind !== "linehaul").forEach((l) => perCity.set(l.city, (perCity.get(l.city) ?? 0) + l.pieces));
                    const peak = Math.max(0, ...perCity.values());
                    const pct = Math.min(100, Math.round((peak / fleet.dailyPieces) * 100));
                    const clubs = clubCount(d);
                    return (
                      <div key={d} onDragOver={allowDrop} onDrop={(e) => dropOn(e, d, null)}
                        className={`flex min-h-24 flex-col rounded-lg border p-1.5 text-left ${d.slice(0, 7) !== day.slice(0, 7) ? "border-transparent bg-paper/50 opacity-50" : "border-line bg-white"} ${d === today ? "ring-2 ring-brand" : ""}`}>
                        <button onClick={() => openDay(d)} className="flex cursor-pointer items-center justify-between text-[11px]">
                          <b>{Number(d.slice(8))}</b>
                          {clubs > 0 && <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-900" title="clubbing possible">{clubs} to club</span>}
                        </button>
                        {list.length > 0 && (
                          <>
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                              {(Object.keys(KIND) as LegKind[]).map((k) => count(k) ? <span key={k} className={`rounded border px-1 ${KIND[k].cls}`} title={KIND[k].name}>{KIND[k].short} {count(k)}</span> : null)}
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {list.slice(0, 3).map((l) => <LegChip key={l.key} l={l} compact onOpen={onOpen} onDrag={startDrag} />)}
                              {list.length > 3 && <button onClick={() => openDay(d)} className="cursor-pointer text-[10px] text-muted hover:underline">+{list.length - 3} more</button>}
                            </div>
                            {peak > 0 && (
                              <div className="mt-auto pt-1" title={`busiest city ${peak} of ${fleet.dailyPieces} pcs`}>
                                <div className="h-1 rounded-full bg-paper"><div className="h-1 rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#22c55e" }} /></div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {view === "week" && (
              <Card className="overflow-x-auto p-2">
                <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,1fr)]">
                  <div />
                  {days.map((d) => (
                    <button key={d} onClick={() => openDay(d)}
                      className={`cursor-pointer border-b border-line px-1 py-1.5 text-center text-[11px] ${d === today ? "font-bold text-brand" : "text-muted"}`}>
                      {label(d, { weekday: "short", day: "numeric", month: "short" })}
                      {clubCount(d) > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1 font-semibold text-amber-900">{clubCount(d)} to club</span>}
                    </button>
                  ))}
                  <div className="border-b border-line py-1 pr-1 text-right text-[10px] text-faint">all day</div>
                  {days.map((d) => (
                    <div key={d} onDragOver={allowDrop} onDrop={(e) => dropOn(e, d, null)} className="min-h-10 space-y-0.5 border-b border-l border-line bg-paper/40 p-0.5">
                      {(byDay.get(d) ?? []).filter((l) => l.min === null || l.min < 360).map((l) => <LegChip key={l.key} l={l} compact onOpen={onOpen} onDrag={startDrag} />)}
                    </div>
                  ))}
                  {HOURS.map((h) => (
                    <WeekRow key={h} h={h} days={days} byDay={byDay} onOpen={onOpen} onDrag={startDrag} allowDrop={allowDrop} dropOn={dropOn} />
                  ))}
                </div>
              </Card>
            )}

            {view === "day" && <DayBoard day={day} legs={byDay.get(day) ?? []} onOpen={onOpen} onDrag={startDrag} onMove={(l) => askMove(l, l.date, l.slot)}
              onCarrier={(l, no) => run(`carrier:${l.id}`, async () => { await post({ action: "carrier", id: l.id, no }); return no ? `${l.id} set on ${no}.` : `${l.id}: number cleared.`; })} busy={busy} />}
            </motion.div>
            </AnimatePresence>
          </div>
          {tower && (tower.heat.cities.length > 0 || tower.lanes.length > 0) && (
            <Card className="mt-4">
              <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                <LoadHeatmap t={tower} today={today} onDay={openDay} />
                <LaneFlowBars t={tower} />
              </div>
            </Card>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:sticky xl:top-4">
        {tower && <Card><div id="tower-risks" className="scroll-mt-4"><RiskFeed risks={tower.risks} onOpen={onOpen} onDay={openDay} /></div></Card>}
        {/* clubbing suggestions for what's on screen */}
        <Card>
          <span id="tower-clubs" className="block scroll-mt-4" />
          <h3 className="font-display text-sm font-bold">Clubbing suggestions <span className="font-normal text-faint">{rangeSugs.filter((s) => !s.planned).length} open</span></h3>
          <p className="mb-2 text-[11px] text-muted">
            City runs: same city, same day, within {Math.round(fleet.runWindowMin / 60)} h · road: same lane ±{fleet.linehaulDays} day · air &amp; rail: same lane, same day, same flight / train · weddings never clubbed
          </p>
          {rangeSugs.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing to club in this {view}.</p>}
          <div className="max-h-[70vh] space-y-2 overflow-auto">
            <AnimatePresence initial={false}>
            {rangeSugs.map((s) => (
              <motion.div key={s.key} layout initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3, ease: EASE }}
                className={`rounded-xl border p-2.5 text-xs ${s.planned ? "border-green-200 bg-green-50/60" : "border-line"}`}>
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => openDay(s.date)} className="cursor-pointer text-left font-semibold hover:underline">
                    {s.kind === "pickup_run" ? "Pickup run" : s.kind === "delivery_run" ? "Delivery run" : MODE_NAME[s.kind]} · {s.title}
                  </button>
                  {s.planned ? <Badge tone="ok">planned</Badge> : s.saving > 0 ? <Badge tone="warn">save {inr(s.saving)}</Badge> : null}
                </div>
                <p className="mt-0.5 text-muted">{label(s.date, { weekday: "short", day: "numeric", month: "short" })} · {s.note}</p>
                <p className="mt-0.5"><b>{s.legs.length}</b> bookings · <b>{pcsLabel(s.pieces - s.oversize, s.oversize)}</b> · {s.vehicle}{s.vehicles > 1 ? ` × ${s.vehicles}` : ""}</p>
                <div className="mt-1 space-y-0.5">
                  {s.legs.map((l) => (
                    <button key={l.key} onClick={() => onOpen(l.id)} className={`block w-full cursor-pointer truncate rounded border px-1.5 py-0.5 text-left text-[11px] hover:bg-paper ${l.tone === "pending" ? "border-dashed" : ""}`}>
                      <span className="font-mono">{l.id}</span> · {l.name}{l.slot ? ` · ${l.slot}` : ""} · {pcsLabel(l.pieces - l.oversize, l.oversize)}{l.tone === "pending" ? " · unpaid" : ""}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(s.kind === "pickup_run" || s.kind === "delivery_run") ? (
                    s.planned
                      ? <Button size="sm" variant="ghost" disabled={busy === s.key} onClick={() => run(s.key, async () => { await post({ action: "clearRun", ids: s.legs.map((l) => l.id), leg: s.kind === "pickup_run" ? "pickup" : "delivery" }); return "Run cleared."; })}>Undo run</Button>
                      : <Button size="sm" disabled={busy === s.key} onClick={() => run(s.key, async () => { const j = await post({ action: "planRun", ids: s.legs.map((l) => l.id), leg: s.kind === "pickup_run" ? "pickup" : "delivery" }); return `Planned as one run ${j.run} — ${s.vehicle}.`; })}>Plan as one run</Button>
                  ) : s.planned
                    ? <span className="text-[11px] text-green-800">On trip {s.legs[0].trip} — open LR &amp; trips</span>
                    : <Button size="sm" disabled={busy === s.key} onClick={() => clubIntoTrip(s)}>Club into trip</Button>}
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(runSheet(s)).then(() => setMsg({ ok: true, text: "Run sheet copied — paste it into WhatsApp for the captain or vendor." }))}>Copy run sheet</Button>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </Card>
        </div>
      </div>
    </div>
    </LayoutGroup>
    </MotionConfig>
  );
}

/* ---------- pieces ---------- */
function LegChip({ l, compact, onOpen, onDrag }: { l: Leg; compact?: boolean; onOpen: (id: string) => void; onDrag: (e: DragEvent, l: Leg) => void }) {
  const movable = l.kind !== "linehaul" && !l.done;
  return (
    <motion.div layout layoutId={`leg-${l.key}`} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
    <button draggable={movable} onDragStart={(e) => onDrag(e, l)} onClick={() => onOpen(l.id)}
      title={`${l.id} · ${l.name} · ${l.lane}${l.slot ? ` · ${l.slot}` : ""} · ${pcsLabel(l.pieces - l.oversize, l.oversize)} · ${l.status.replace("_", " ")}${l.tone === "pending" ? " · awaiting approval / payment" : ""}${movable ? " · drag to reschedule" : ""}`}
      className={`block w-full cursor-pointer truncate rounded border-l-[3px] border px-1 text-left ${compact ? "py-0 text-[10px]" : "py-1 text-[11px]"} ${KIND[l.kind].cls} ${l.tone === "pending" ? "border-dashed opacity-80" : ""} ${l.done ? "line-through opacity-50" : ""} ${movable ? "active:cursor-grabbing" : ""}`}>
      {legTag(l)} · {l.kind === "linehaul" ? l.lane : l.city} · {l.pieces}{l.oversize ? ` (${l.oversize} XL)` : ""}{l.wedding ? " · wedding" : ""}{l.run || l.trip ? " · planned" : ""}
    </button>
    </motion.div>
  );
}

function WeekRow({ h, days, byDay, onOpen, onDrag, allowDrop, dropOn }: {
  h: number; days: string[]; byDay: Map<string, Leg[]>; onOpen: (id: string) => void;
  onDrag: (e: DragEvent, l: Leg) => void; allowDrop: (e: DragEvent) => void; dropOn: (e: DragEvent, d: string, h: number | null) => void;
}) {
  return (
    <>
      <div className="border-b border-line pr-1 pt-0.5 text-right text-[10px] text-faint">{slotAt(h).replace(":00", "")}</div>
      {days.map((d) => (
        <div key={d} onDragOver={allowDrop} onDrop={(e) => dropOn(e, d, h)} className="min-h-9 space-y-0.5 border-b border-l border-line p-0.5">
          {(byDay.get(d) ?? []).filter((l) => l.min !== null && Math.floor(l.min / 60) === h).map((l) => <LegChip key={l.key} l={l} onOpen={onOpen} onDrag={onDrag} />)}
        </div>
      ))}
    </>
  );
}

function DayBoard({ day, legs, onOpen, onDrag, onMove, onCarrier, busy }: {
  day: string; legs: Leg[]; onOpen: (id: string) => void; onDrag: (e: DragEvent, l: Leg) => void;
  onMove: (l: Leg) => void; onCarrier: (l: Leg, no: string) => void; busy: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {(Object.keys(KIND) as LegKind[]).map((k) => {
        const list = legs.filter((l) => l.kind === k);
        return (
          <Card key={k} className="p-3">
            <h4 className="mb-2 font-display text-[13px] font-bold">{KIND[k].name} <span className="font-normal text-faint">{list.length} · {pcsLabel(list.reduce((a, l) => a + l.pieces - l.oversize, 0), list.reduce((a, l) => a + l.oversize, 0))}</span></h4>
            {list.length === 0 && <p className="text-xs text-muted">None on {label(day, { day: "numeric", month: "short" })}.</p>}
            <div className="space-y-1.5">
              {list.map((l) => (
                <div key={l.key} draggable={k !== "linehaul" && !l.done} onDragStart={(e) => onDrag(e, l)}
                  className={`rounded-lg border-l-4 border p-2 text-xs ${KIND[k].cls} ${l.tone === "pending" ? "border-dashed" : ""} ${l.done ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => onOpen(l.id)} className="cursor-pointer font-mono text-[11px] font-semibold hover:underline">{l.id}</button>
                    <span className="text-[11px]">{l.slot || (k === "linehaul" ? MODE_NAME[l.mode] : "any time")}</span>
                  </div>
                  <p className="mt-0.5">{l.name} · {l.lane} · {pcsLabel(l.pieces - l.oversize, l.oversize)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                    {l.tone === "pending" && <Badge tone="warn">awaiting approval / payment</Badge>}
                    {l.done && <Badge tone="ok">done</Badge>}
                    {l.wedding && <Badge tone="info">wedding · not clubbed</Badge>}
                    {l.run && <Badge tone="ok">run {l.run}</Badge>}
                    {l.trip && <Badge tone="ok">trip {l.trip}</Badge>}
                    {l.deliverBy && k !== "delivery" && <Badge tone="muted">deliver by {label(l.deliverBy, { day: "numeric", month: "short" })}</Badge>}
                  </p>
                  {k === "linehaul" && (l.mode === "air" || l.mode === "rail") && (
                    <CarrierInput key={l.carrier} l={l} busy={busy === `carrier:${l.id}`} onSave={(no) => onCarrier(l, no)} />
                  )}
                  {k !== "linehaul" && !l.done && <button onClick={() => onMove(l)} className="mt-1 cursor-pointer text-[11px] font-semibold text-brand hover:underline">Reschedule…</button>}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CarrierInput({ l, busy, onSave }: { l: Leg; busy: boolean; onSave: (no: string) => void }) {
  const [no, setNo] = useState(l.carrier);
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <Input className="w-32! py-1! text-[11px]!" placeholder={l.mode === "air" ? "Flight no. e.g. 6E 5123" : "Train no. e.g. 12951"} value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} />
      <Button size="sm" variant="outline" disabled={busy || no.trim() === l.carrier} onClick={() => onSave(no.trim())}>Save</Button>
    </div>
  );
}

function Agenda({ days, byDay, today, onOpen, onMove }: { days: string[]; byDay: Map<string, Leg[]>; today: string; onOpen: (id: string) => void; onMove: (l: Leg) => void }) {
  const withLegs = days.filter((d) => (byDay.get(d) ?? []).length);
  if (!withLegs.length) return <Card><p className="py-6 text-center text-sm text-muted">No moves in this period.</p></Card>;
  return (
    <div className="space-y-3">
      {withLegs.map((d) => (
        <Card key={d} className="p-3">
          <h4 className={`mb-1.5 text-xs font-bold ${d === today ? "text-brand" : ""}`}>{label(d, { weekday: "long", day: "numeric", month: "short" })}</h4>
          <div className="space-y-1">
            {(byDay.get(d) ?? []).map((l) => (
              <div key={l.key} className={`flex items-center justify-between gap-2 rounded border-l-4 border px-2 py-1 text-xs ${KIND[l.kind].cls} ${l.tone === "pending" ? "border-dashed" : ""}`}>
                <button onClick={() => onOpen(l.id)} className="cursor-pointer truncate text-left">{legTag(l)} · {l.slot || "any time"} · {l.kind === "linehaul" ? l.lane : l.city} · {pcsLabel(l.pieces - l.oversize, l.oversize)} · <span className="font-mono">{l.id}</span></button>
                {l.kind !== "linehaul" && !l.done && <button onClick={() => onMove(l)} className="shrink-0 cursor-pointer text-[11px] font-semibold text-brand">Move</button>}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function MoveDialog({ move, onCancel, onDone }: { move: { leg: Leg; date: string; slot: string }; onCancel: () => void; onDone: (text: string) => void }) {
  const l = move.leg;
  const [date, setDate] = useState(move.date);
  const [slot, setSlot] = useState(move.slot);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const leg = l.kind === "pickup" ? "pickup" : "delivery";
  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/moves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reschedule", id: l.id, leg, date, slot: leg === "pickup" ? slot : undefined, reason }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.detail ?? j.error ?? `HTTP_${r.status}`);
      onDone(`${l.id}: ${leg} moved to ${label(date, { weekday: "short", day: "numeric", month: "short" })}${leg === "pickup" && slot ? `, ${slot}` : ""}. ${j.notified ? "Customer update queued (WhatsApp + email)." : "No new customer message (already sent for this change)."}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card>
          <h3 className="font-display text-base font-bold">Reschedule {leg} · {l.id}</h3>
          <p className="mt-1 text-xs text-muted">{l.name} · {l.lane} · {pcsLabel(l.pieces - l.oversize, l.oversize)} · now {label(l.date, { weekday: "short", day: "numeric", month: "short" })}{l.slot && leg === "pickup" ? `, ${l.slot}` : ""}</p>
          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="New date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              {leg === "pickup" && (
                <Field label="Pickup slot">
                  <Select value={slot} onChange={(e) => setSlot(e.target.value)}>
                    {!SLOTS.some((s) => s.label === slot) && <option value={slot}>{slot || "— keep —"}</option>}
                    {SLOTS.map((s) => <option key={s.label}>{s.label}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            <Field label="Reason (the customer sees this)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. clubbed with another pickup in your area" maxLength={300} autoFocus />
            </Field>
            {l.trip && <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">This booking is on trip {l.trip}. A pickup on a trip can&apos;t move until it is taken off the trip in LR &amp; trips.</p>}
            <p className="text-[11px] text-muted">The change is written to the booking&apos;s history, any planned run for this {leg} is cleared, and the customer gets a WhatsApp + email with the new date.</p>
            {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-900">{err}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
              <Button disabled={busy || reason.trim().length < 3 || !date} onClick={save}>{busy ? "Saving…" : "Reschedule & tell customer"}</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FleetEditor({ fleet, onSaved }: { fleet: FleetSettings; onSaved: (f: FleetSettings) => void }) {
  const [f, setF] = useState<FleetSettings>(fleet);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setList = (key: "local" | "linehaul", i: number, patch: Partial<VehicleType>) =>
    setF({ ...f, [key]: f[key].map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/admin/moves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveFleet", fleet: f }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error ?? `HTTP_${r.status}`);
      onSaved(normFleet(j.fleet));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return (
    <Card>
      <h3 className="mb-1 font-display text-sm font-bold">Fleet &amp; clubbing settings</h3>
      <p className="mb-3 text-xs text-muted">Capacity is in pieces at actuals — an oversize item counts as one piece and is flagged XL. Suggestions pick the smallest vehicle that fits; XL items never go on a vehicle without the oversize tick.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["local", "linehaul"] as const).map((key) => (
          <div key={key}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{key === "local" ? "City pickups & deliveries" : "Road line-haul"}</p>
            {f[key].map((v, i) => (
              <div key={i} className="mb-1 flex items-center gap-1.5 text-xs">
                <Input className="flex-1! py-1! text-xs!" value={v.type} onChange={(e) => setList(key, i, { type: e.target.value })} />
                <Input className="w-20! py-1! text-xs!" type="number" min={1} value={v.capacity} onChange={(e) => setList(key, i, { capacity: Number(e.target.value) })} />
                <label className="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={v.oversizeOk} onChange={(e) => setList(key, i, { oversizeOk: e.target.checked })} />oversize</label>
                <button className="cursor-pointer px-1 text-red-600" onClick={() => setF({ ...f, [key]: f[key].filter((_, j) => j !== i) })} aria-label="Remove">remove</button>
              </div>
            ))}
            <button className="cursor-pointer text-[11px] font-semibold text-brand" onClick={() => setF({ ...f, [key]: [...f[key], { type: "", capacity: 10, oversizeOk: true }] })}>+ Add vehicle</button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Field label="City run window (minutes)"><Input type="number" min={30} value={f.runWindowMin} onChange={(e) => setF({ ...f, runWindowMin: Number(e.target.value) })} /></Field>
        <Field label="Road club ± days"><Input type="number" min={0} max={3} value={f.linehaulDays} onChange={(e) => setF({ ...f, linehaulDays: Number(e.target.value) })} /></Field>
        <Field label="Daily capacity per city (pcs)"><Input type="number" min={1} value={f.dailyPieces} onChange={(e) => setF({ ...f, dailyPieces: Number(e.target.value) })} /></Field>
      </div>
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      <div className="mt-3 flex gap-2">
        <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</Button>
        <Button variant="ghost" onClick={() => setF(DEFAULT_FLEET)}>Reset to defaults</Button>
      </div>
    </Card>
  );
}
