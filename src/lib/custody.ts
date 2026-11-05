/** Chain of custody — an append-only ledger of every hand-off of every bag
 *  (booking.admin.ops.custody). Pure and shared by the server routes, the
 *  Airport desk and the tests.
 *
 *  Each entry says who held which pieces, when, where, with which seals,
 *  photo and GPS. Entries are never edited or removed: the only field that
 *  changes after writing is `bj`, the Bag Journey delivery status.
 *  /api/admin/bookings refuses any save that alters the ledger
 *  (custodyIntact), and adds entries itself when Operations completes a
 *  milestone (custodyFromMilestones), so the ledger can't fall behind the
 *  milestones. The custody report built from it is the BCAS evidence pack. */
import { CUSTODY, type CustodyCode } from "./airportPoc";
import { opsOf, type MilestoneKey, type OpsState } from "./opsModel";
import type { Booking } from "./types";

export interface BjSync { status: "pending" | "sent" | "failed" | "off"; tries: number; at?: string; next?: string; ref?: string; err?: string }
export interface CustodyEvent {
  id: string;
  at: string;
  code: CustodyCode;
  pieces: number[];
  place: string;
  by: string;
  seals?: string[];
  tags?: string[];   // airline licence plates involved
  photo?: string;
  gps?: { lat: number; lng: number };
  note?: string;
  bj?: BjSync;
}

const rid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 12);
export const allPieces = (b: Pick<Booking, "bags" | "oversize">) => Array.from({ length: b.bags + b.oversize }, (_, i) => i + 1);

export function custodyEvent(e: Omit<CustodyEvent, "id" | "bj">, bjOn: boolean): CustodyEvent {
  return { id: `${e.code}-${rid()}`, ...e, bj: { status: bjOn ? "pending" : "off", tries: 0 } };
}

/** Append entries to a booking's ledger (returns a new booking). */
export function withCustody(b: Booking, events: CustodyEvent[]): Booking {
  if (!events.length) return b;
  const o = opsOf(b);
  return { ...b, admin: { ...b.admin, ops: { ...o, custody: [...(o.custody ?? []), ...events] } } };
}

/** Bag Journey only for bookings enrolled in the POC. */
export const bjOn = (b: Booking) => !!(b.admin as { airport?: { enrolled?: boolean } }).airport?.enrolled;

const sansBj = (e: CustodyEvent) => JSON.stringify({ ...e, bj: undefined });
/** True when `next` keeps every earlier entry unchanged (bar its Bag Journey status) and only appends. */
export function custodyIntact(prev: CustodyEvent[] | undefined, next: CustodyEvent[] | undefined): boolean {
  const p = prev ?? [], n = next ?? [];
  if (n.length < p.length) return false;
  return p.every((e, i) => n[i]?.id === e.id && sansBj(n[i]) === sansBj(e));
}

/** Note on milestones a T2 lane never passes through (hotel → T2 skips the hubs). */
export const T2_SKIPPED = "T2 lane — not used";
const MILESTONE_CODE:Partial<Record<MilestoneKey, CustodyCode>> = { picked: "ACCEPT", inscan: "INSCAN", depart: "DEPART", arrive: "ARRIVE", ofd: "OFD", pod: "POD" };
function placeOf(b: Booking, k: MilestoneKey): string {
  switch (k) {
    case "picked": return `Pickup · ${b.from}`;
    case "inscan": case "depart": return `${b.from} hub`;
    case "arrive": case "ofd": return `${b.to} hub`;
    default: return `Delivery · ${b.to}`;
  }
}
/** Ledger entries for milestones Operations has just completed (present in `next`, not in `prev`)
 *  that the ledger doesn't already have. Scanned tags give the pieces; else all pieces. */
export function custodyFromMilestones(prev: Booking | null, next: Booking, by: string): CustodyEvent[] {
  const po = prev ? opsOf(prev) : ({} as OpsState), no = opsOf(next);
  const have = new Set((no.custody ?? []).map((e) => e.code));
  const out: CustodyEvent[] = [];
  for (const [k, code] of Object.entries(MILESTONE_CODE) as [MilestoneKey, CustodyCode][]) {
    const m = no.milestones?.[k];
    if (!m || po.milestones?.[k] || have.has(code)) continue;
    const scanned = no.scans?.[k] ?? [];
    const pieces = scanned.length
      ? [...new Set(scanned.map((t) => (no.bags ?? []).find((x) => x.code === t || x.plate === t)?.n ?? Number(t.split("-")[4])).filter((n) => Number.isInteger(n) && n > 0))]
      : allPieces(next);
    out.push(custodyEvent({ at: m.at, code, pieces: pieces.length ? pieces : allPieces(next), place: placeOf(next, k), by: m.by && m.by !== "ops" ? m.by : by,
      seals: (no.bags ?? []).filter((x) => x.seal).map((x) => x.seal!), note: `${CUSTODY[code]} (milestone)` }, bjOn(next)));
  }
  return out;
}

/** Gaps a custody report must explain: a milestone done with no matching ledger entry,
 *  an entry that left pieces out, or a hold that was never closed after T2. */
export function custodyGaps(b: Booking): string[] {
  const o = opsOf(b);
  const led = o.custody ?? [];
  const pieces = allPieces(b);
  const out: string[] = [];
  for (const [k, code] of Object.entries(MILESTONE_CODE) as [MilestoneKey, CustodyCode][]) {
    const m = o.milestones?.[k];
    if (!m || m.note === T2_SKIPPED) continue;
    /* custody that ends at T2 closes the move with a handover, not a doorstep delivery */
    const e = led.filter((x) => x.code === code || (k === "pod" && (x.code === "HANDOVER_PAX" || x.code === "HANDOVER_HANDLER")));
    if (!e.length) { out.push(`No custody entry for "${CUSTODY[code]}".`); continue; }
    const seen = new Set(e.flatMap((x) => x.pieces));
    const miss = pieces.filter((n) => !seen.has(n));
    if (miss.length) out.push(`"${CUSTODY[code]}" is missing piece(s) ${miss.join(", ")}.`);
  }
  const holdsIn = led.filter((x) => x.code === "HOLD_IN").length, holdsOut = led.filter((x) => x.code === "HOLD_OUT").length;
  if (holdsIn > holdsOut && led.some((x) => x.code === "ARRIVE_T2" || x.code === "HANDOVER_PAX" || x.code === "HANDOVER_HANDLER")) out.push("A secure hold was never closed before T2.");
  return out;
}

/** Retry schedule for Bag Journey sends: 1, 2, 4 … minutes, at most an hour. */
export const bjBackoffMs = (tries: number) => Math.min(2 ** Math.max(0, tries - 1), 60) * 60_000;
