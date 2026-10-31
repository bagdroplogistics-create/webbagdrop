/** The Move Pass — Bagdrop's boarding pass. Built from the booking for the
 *  pass page, the PDF, Apple / Google Wallet and the delivery claim check.
 *  Issued once the move is confirmed; reissued at pickup with every bag's
 *  licence plate (XL marked). Private like a boarding pass: it carries the
 *  full name, both addresses and the captain's number, so it lives behind
 *  its own signed link (/p/<id>.<sig>) and is never indexed.
 *
 *  Machine-readable payload (QR + PDF417), pipe-separated, Bagdrop Move
 *  Pass v1:  BDMP1|<ref>|<from><to>|<pickup YYYYMMDD>|<pieces>|<xl>|<plates…>
 *  Drivers' claim check reads the ref from it (or from the pass URL). */
import { MILESTONES, opsOf, portCode } from "./opsModel";
import { spaced } from "./bagTags";
import { isTrackable, trackState } from "./tracking";
import type { Booking } from "./types";

export interface PassPerson { name: string; mobile: string | null }
export interface PassView {
  ref: string; name: string; service: string; mode: string;
  from: string; to: string; fromCode: string; toCode: string;
  pickupDate: string; slot: string; deliveryDate: string | null;
  pickAddr: string; dropAddr: string;
  pieces: number; xl: number;
  tags: { n: number; plate: string; xl: boolean }[];
  stage: string; delivered: boolean; deliveredAt: string | null;
  pickupCaptain: PassPerson | null; deliveryCaptain: PassPerson | null;
  issuedAt: string; reissued: boolean;   // reissued = carries the tag numbers
  payload: string;
}

const STAGE_FOR_STATUS: Record<string, string> = {
  accepted: "Confirmed", assigned: "Pickup scheduled", picked_up: "Picked up & sealed", in_transit: "In transit", delivered: "Delivered",
};

export function passPayload(b: Booking): string {
  const tags = (opsOf(b).bags ?? []).map((x) => x.plate).join(",");
  const d = (b.pickupDate || b.date || "").slice(0, 10).replace(/-/g, "");
  return ["BDMP1", b.id, `${portCode(b.from)}${portCode(b.to)}`, d, String(b.bags + b.oversize), String(b.oversize), tags].join("|");
}

/** Pull the booking ref out of anything a driver scans for the pass. */
export function refFromPassScan(raw: string): string | null {
  const s = (raw ?? "").trim();
  const bcbp = /^BDMP1\|([A-Z0-9-]{6,40})\|/.exec(s);
  if (bcbp) return bcbp[1];
  const url = /\/p\/([A-Z0-9-]{6,40})\.[A-Za-z0-9_-]+\/?$/.exec(s);
  return url ? url[1] : null;
}

export function passView(b: Booking, nowMs: number): PassView | null {
  if (!isTrackable(b)) return null;
  const o = opsOf(b);
  const s = trackState(b, nowMs);
  const last = s.done[s.done.length - 1];
  const stage = s.delivered ? "Delivered" : last ? (MILESTONES.find((m) => m.key === last.key)?.name ?? STAGE_FOR_STATUS[b.status]) : STAGE_FOR_STATUS[b.status] ?? "Confirmed";
  const person = (k: "pickup" | "lastmile"): PassPerson | null => {
    const l = o.legs?.[k];
    return l?.assignee ? { name: l.assignee, mobile: l.mobile ?? null } : null;
  };
  const confirmedAt = b.pay?.verifiedAt ?? b.pay?.at ?? b.created;
  return {
    ref: b.id, name: b.traveller?.name ?? "", service: b.ucName || "Door to door", mode: b.mode ?? "road",
    from: b.from, to: b.to, fromCode: portCode(b.from), toCode: portCode(b.to),
    pickupDate: (b.pickupDate || b.date || "").slice(0, 10), slot: b.slot, deliveryDate: b.deliveryDate ?? null,
    pickAddr: b.pickAddr, dropAddr: b.dropAddr,
    pieces: b.bags + b.oversize, xl: b.oversize,
    tags: (o.bags ?? []).map((x) => ({ n: x.n, plate: spaced(x.plate), xl: x.xl })),
    stage, delivered: s.delivered, deliveredAt: s.deliveredAt,
    pickupCaptain: person("pickup"), deliveryCaptain: person("lastmile"),
    issuedAt: confirmedAt, reissued: (o.bags ?? []).length > 0,
    payload: passPayload(b),
  };
}
