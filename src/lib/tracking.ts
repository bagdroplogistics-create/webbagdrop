/** Live tracking — where a move is and what happens next, from the
 *  milestones the team scans (Operations) plus, when a driver's phone is
 *  sharing, its GPS. Pure: the admin map, the public tracking page and the
 *  sweep all use the same rules.
 *
 *  Position rules
 *   · pickup leg (until in-scan at origin hub)  → at the origin city
 *   · line-haul (departed → arrived)            → along the lane; progress
 *     = time since departure ÷ time to the ETA ops typed (no ETA: just out)
 *   · last mile (arrived → delivered)           → at the destination
 *   · a GPS fix for the current leg, < 10 min old, overrides the estimate
 *  Late = the ETA ops typed for the next step has passed and that step
 *  isn't scanned yet. */
import { MILESTONES, opsOf, type MilestoneKey } from "./opsModel";
import { isPaid } from "./payState";
import { cityGeo, type LatLng } from "./geo";
import type { Booking, BookingStatus, Mode } from "./types";

export type TrackLeg = "pickup" | "linehaul" | "lastmile";
export const LEG_OF: Record<MilestoneKey, TrackLeg> = {
  lr: "pickup", assign: "pickup", picked: "pickup", inscan: "pickup",
  depart: "linehaul", arrive: "linehaul", ofd: "lastmile", pod: "lastmile",
};
/** A driver's leg is over once this milestone is scanned. */
export const LEG_END: Record<TrackLeg, MilestoneKey> = { pickup: "inscan", linehaul: "arrive", lastmile: "pod" };
export const LEG_NAME: Record<TrackLeg, string> = { pickup: "Pickup", linehaul: "Line-haul", lastmile: "Delivery" };
/** Milestones the customer hears about (WhatsApp + email). */
export const KEY_MOMENTS: MilestoneKey[] = ["picked", "depart", "arrive", "ofd", "pod"];

export const GPS_FRESH_MS = 10 * 60_000;

export interface GpsPoint { lat: number; lng: number; acc?: number; at: string; leg: TrackLeg }
export interface TrackEta { at: string; next: MilestoneKey; setAt: string; note?: string }
export const etaOf = (b: Booking): TrackEta | null => ((b.admin as { tracking?: { eta?: TrackEta } }).tracking?.eta ?? null);

const TRACKABLE: BookingStatus[] = ["accepted", "assigned", "picked_up", "in_transit", "delivered"];
/** A booking is trackable once it is confirmed (approved + paid / billed). */
export const isTrackable = (b: Booking) => TRACKABLE.includes(b.status) && (isPaid(b) || !!b.payer);

export interface TrackState {
  id: string;
  mode: Mode;
  from: string; to: string;
  fromGeo: LatLng | null; toGeo: LatLng | null;
  done: { key: MilestoneKey; name: string; at: string }[];
  next: { key: MilestoneKey; name: string } | null;     // null = delivered
  leg: TrackLeg | null;
  delivered: boolean;
  deliveredAt: string | null;
  eta: string | null;          // for `next`, as typed by ops
  late: boolean;
  lateByMin: number;
  progress: number;            // 0 = origin … 1 = destination
  position: { source: "gps" | "estimate" | "none"; geo: LatLng | null; at: string | null };
  stageIndex: number;          // milestones done, 0 … 8
}

export function trackState(b: Booking, nowMs: number, gps?: GpsPoint | null): TrackState {
  const ms = opsOf(b).milestones ?? {};
  const done = MILESTONES.filter((m) => ms[m.key]).map((m) => ({ key: m.key as MilestoneKey, name: m.name, at: ms[m.key]!.at }));
  const nextM = MILESTONES.find((m) => !ms[m.key]) ?? null;
  const next = nextM ? { key: nextM.key as MilestoneKey, name: nextM.name } : null;
  const delivered = !!ms.pod || b.status === "delivered";
  const fromGeo = cityGeo(b.from), toGeo = cityGeo(b.to);
  const leg: TrackLeg | null = delivered ? null : next ? LEG_OF[next.key] : null;

  const e = etaOf(b);
  const eta = e && next && e.next === next.key ? e.at : null;
  const lateByMin = eta && !delivered ? Math.max(0, Math.round((nowMs - Date.parse(eta)) / 60_000)) : 0;

  /* estimated progress along the lane */
  let progress = 0;
  if (delivered || ms.arrive) progress = 1;
  else if (ms.depart) {
    const t0 = Date.parse(ms.depart.at);
    const t1 = eta && e?.next === "arrive" ? Date.parse(eta) : NaN;
    progress = Number.isFinite(t1) && t1 > t0 ? Math.min(0.97, Math.max(0.03, (nowMs - t0) / (t1 - t0))) : 0.08;
  }
  const lerp = (a: LatLng, z: LatLng, t: number): LatLng => ({ lat: a.lat + (z.lat - a.lat) * t, lng: a.lng + (z.lng - a.lng) * t });
  let position: TrackState["position"] = { source: "none", geo: null, at: null };
  if (fromGeo && toGeo) position = { source: "estimate", geo: lerp(fromGeo, toGeo, progress), at: null };
  else if (fromGeo && progress < 0.5) position = { source: "estimate", geo: fromGeo, at: null };
  else if (toGeo && progress >= 0.5) position = { source: "estimate", geo: toGeo, at: null };
  if (gps && !delivered && leg && gps.leg === leg && nowMs - Date.parse(gps.at) < GPS_FRESH_MS) {
    position = { source: "gps", geo: { lat: gps.lat, lng: gps.lng }, at: gps.at };
  }

  return {
    id: b.id, mode: b.mode ?? "road", from: b.from, to: b.to, fromGeo, toGeo,
    done, next, leg, delivered, deliveredAt: ms.pod?.at ?? null,
    eta, late: lateByMin > 0, lateByMin, progress, position, stageIndex: done.length,
  };
}

/** What the public tracking link may show — first name only, no address,
 *  no phone, no price. */
export interface PublicTrack {
  ref: string; name: string; from: string; to: string; mode: Mode; pieces: number; oversize: number;
  pickupDate: string; slot: string; deliveryDate: string | null;
  stages: { key: MilestoneKey; name: string; at: string | null }[];
  next: string | null; eta: string | null; late: boolean;
  progress: number; position: TrackState["position"];
  fromGeo: LatLng | null; toGeo: LatLng | null;
  ended: boolean; deliveredAt: string | null;
}
export function publicTrack(b: Booking, nowMs: number, gps?: GpsPoint | null): PublicTrack {
  const s = trackState(b, nowMs, gps);
  const ms = opsOf(b).milestones ?? {};
  return {
    ref: b.id, name: (b.traveller?.name ?? "").split(/\s+/)[0] ?? "", from: b.from, to: b.to, mode: s.mode,
    pieces: b.bags + b.oversize, oversize: b.oversize, pickupDate: (b.pickupDate || b.date || "").slice(0, 10), slot: b.slot, deliveryDate: b.deliveryDate ?? null,
    stages: MILESTONES.filter((m) => m.key !== "lr").map((m) => ({ key: m.key as MilestoneKey, name: m.name, at: ms[m.key]?.at ?? null })),
    next: s.next?.name ?? null, eta: s.eta, late: s.late, progress: s.progress, position: s.position,
    fromGeo: s.fromGeo, toGeo: s.toGeo, ended: s.delivered, deliveredAt: s.deliveredAt,
  };
}
