/** BAGDROP OS · Network control tower — the numbers above the moves
 *  calendar. Pure (same inputs → same answer), so it is unit-tested and
 *  runs in the browser off the live booking list.
 *
 *  KPIs for the visible period · on-time % over the last 30 days ·
 *  at-risk feed with a reason and a severity · city × day load heatmap ·
 *  lane flow (pieces per lane). Pieces are at actuals; XL = oversize. */
import { opsOf } from "./opsModel";
import { isTrackable, trackState } from "./tracking";
import { addDays, legsOf, type FleetSettings, type Leg, type Suggestion } from "./movesPlan";
import type { Booking } from "./types";

export type Severity = "red" | "amber";
export interface Risk { key: string; id: string | null; severity: Severity; title: string; detail: string; date: string; city: string }
export interface HeatCell { city: string; day: string; pieces: number; pct: number }
export interface LaneFlow { lane: string; bookings: number; pieces: number; xl: number; modes: string[] }
export interface TowerStats {
  moves: number; pieces: number; xl: number; pickups: number; linehauls: number; deliveries: number; pending: number;
  onTimePct: number | null; onTimeBase: number;
  risks: Risk[];
  clubsOpen: number; savingOpen: number; savingPlanned: number;
  peakPct: number; peakAt: { city: string; day: string } | null;
  heat: { cities: string[]; days: string[]; cells: HeatCell[] };
  lanes: LaneFlow[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** @param days the visible period (calendar range); today = YYYY-MM-DD in the viewer's zone */
export function towerStats(bookings: Booking[], fleet: FleetSettings, suggestions: Suggestion[], days: string[], today: string, nowMs: number): TowerStats {
  const inRange = new Set(days);
  const allLegs: Leg[] = bookings.flatMap((b) => legsOf(b));
  const legs = allLegs.filter((l) => inRange.has(l.date));
  const ids = new Set(legs.map((l) => l.id));
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const inBookings = [...ids].map((id) => byId.get(id)!).filter(Boolean);

  /* on-time: delivered in the last 30 days that had a promised date */
  const since = addDays(today, -30);
  const delivered = bookings.filter((b) => {
    const pod = opsOf(b).milestones?.pod?.at;
    return pod && b.deliveryDate && pod.slice(0, 10) >= since;
  });
  const onTime = delivered.filter((b) => opsOf(b).milestones!.pod!.at.slice(0, 10) <= b.deliveryDate!);

  /* at-risk feed */
  const risks: Risk[] = [];
  const tomorrow = addDays(today, 1), soon = addDays(today, 2);
  for (const l of allLegs) {
    const b = byId.get(l.id)!;
    const ms = opsOf(b).milestones ?? {};
    if (l.kind === "pickup" && !l.done && l.tone === "confirmed" && !ms.assign && (l.date === today || l.date === tomorrow)) {
      risks.push({ key: `noassign:${l.id}`, id: l.id, severity: l.date === today ? "red" : "amber", title: "No captain assigned",
        detail: `${l.city} pickup ${l.date === today ? "today" : "tomorrow"}${l.slot ? ` at ${l.slot}` : ""} · ${l.pieces} pcs${l.oversize ? ` (${l.oversize} XL)` : ""}`, date: l.date, city: l.city });
    }
    if (l.kind === "pickup" && l.tone === "pending" && l.date >= today && l.date <= soon) {
      risks.push({ key: `pending:${l.id}`, id: l.id, severity: l.date === today ? "red" : "amber", title: "Not confirmed yet",
        detail: `Pickup ${l.date === today ? "today" : l.date === tomorrow ? "tomorrow" : "in 2 days"} — awaiting ${b.status === "accepted" ? "payment" : "approval"}`, date: l.date, city: l.city });
    }
  }
  for (const b of bookings) {
    if (!isTrackable(b) || b.status === "delivered") continue;
    if (b.deliveryDate && b.deliveryDate < today && !opsOf(b).milestones?.pod) {
      risks.push({ key: `overdue:${b.id}`, id: b.id, severity: "red", title: "Delivery overdue", detail: `Promised ${b.deliveryDate} · ${b.from} → ${b.to}`, date: b.deliveryDate, city: b.to });
    }
    const s = trackState(b, nowMs);
    if (s.late) {
      risks.push({ key: `late:${b.id}`, id: b.id, severity: "red", title: `Late · ${s.next?.name ?? ""}`,
        detail: `${s.lateByMin >= 60 ? `${Math.round(s.lateByMin / 60)} h` : `${s.lateByMin} min`} past the ETA · ${b.from} → ${b.to}`, date: (s.eta ?? "").slice(0, 10), city: b.from });
    }
  }

  /* heatmap: city × day, pickups + deliveries (what local fleets handle) */
  const cityLoad = new Map<string, number>();
  for (const l of legs) if (l.kind !== "linehaul") cityLoad.set(l.city, (cityLoad.get(l.city) ?? 0) + l.pieces);
  const cities = [...cityLoad.entries()].sort((a, z) => z[1] - a[1]).slice(0, 8).map(([c]) => c);
  const cells: HeatCell[] = [];
  let peak: HeatCell | null = null;
  for (const city of cities) for (const day of days) {
    const pieces = sum(legs.filter((l) => l.kind !== "linehaul" && l.city === city && l.date === day).map((l) => l.pieces));
    const cell = { city, day, pieces, pct: Math.round((pieces / fleet.dailyPieces) * 100) };
    cells.push(cell);
    if (!peak || cell.pct > peak.pct) peak = cell;
  }
  for (const c of cells) if (c.pct > 100) {
    risks.push({ key: `cap:${c.city}:${c.day}`, id: null, severity: "red", title: "Over daily capacity", detail: `${c.city} · ${c.pieces} pcs on ${c.day} (${c.pct}% of ${fleet.dailyPieces})`, date: c.day, city: c.city });
  }

  /* lane flow */
  const lanesMap = new Map<string, LaneFlow>();
  for (const b of inBookings) {
    const lane = `${b.from} → ${b.to}`;
    const f = lanesMap.get(lane) ?? { lane, bookings: 0, pieces: 0, xl: 0, modes: [] };
    f.bookings += 1; f.pieces += b.bags + b.oversize; f.xl += b.oversize;
    if (!f.modes.includes(b.mode)) f.modes.push(b.mode);
    lanesMap.set(lane, f);
  }

  const rangeSugs = suggestions.filter((s) => inRange.has(s.date));
  const sevRank = { red: 0, amber: 1 };
  return {
    moves: ids.size,
    pieces: sum(inBookings.map((b) => b.bags + b.oversize)),
    xl: sum(inBookings.map((b) => b.oversize)),
    pickups: legs.filter((l) => l.kind === "pickup").length,
    linehauls: legs.filter((l) => l.kind === "linehaul").length,
    deliveries: legs.filter((l) => l.kind === "delivery").length,
    pending: inBookings.filter((b) => legs.some((l) => l.id === b.id && l.tone === "pending")).length,
    onTimePct: delivered.length ? Math.round((onTime.length / delivered.length) * 100) : null,
    onTimeBase: delivered.length,
    risks: risks.sort((a, z) => sevRank[a.severity] - sevRank[z.severity] || a.date.localeCompare(z.date)),
    clubsOpen: rangeSugs.filter((s) => !s.planned).length,
    savingOpen: sum(rangeSugs.filter((s) => !s.planned).map((s) => s.saving)),
    savingPlanned: sum(rangeSugs.filter((s) => s.planned).map((s) => s.saving)),
    peakPct: peak?.pct ?? 0,
    peakAt: peak && peak.pieces ? { city: peak.city, day: peak.day } : null,
    heat: { cities, days, cells },
    lanes: [...lanesMap.values()].sort((a, z) => z.pieces - a.pieces).slice(0, 6),
  };
}
