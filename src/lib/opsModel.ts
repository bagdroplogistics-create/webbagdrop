/** Operations Control domain model — airline-style milestones, checksummed
 *  bag tags, legs/vendors, target costing. Shared by the Operations module
 *  and the /api/admin/ops route. Six-sigma stance: errors are prevented at
 *  entry (checksum, scan gates), and what remains is measured (DPMO). */
import type { Booking } from "./types";

/* ================= milestones ================= */
/** The fixed, non-skippable chain. `scan: true` stages cannot complete
 *  until every tag on the shipment is scanned (or a logged exception
 *  explains the shortfall). `status` is what the customer tracker shows. */
export const MILESTONES = [
  { key: "lr",       name: "LR issued",             scan: false, status: "accepted" },
  { key: "assign",   name: "Pickup assigned",       scan: false, status: "assigned" },
  { key: "picked",   name: "Picked up & sealed",    scan: true,  status: "picked_up" },
  { key: "inscan",   name: "In-scan origin hub",    scan: true,  status: "in_transit" },
  { key: "depart",   name: "Linehaul departed",     scan: false, status: "in_transit" },
  { key: "arrive",   name: "Arrived destination",   scan: true,  status: "in_transit" },
  { key: "ofd",      name: "Out for delivery",      scan: false, status: "in_transit" },
  { key: "pod",      name: "Delivered · POD",       scan: true,  status: "delivered" },
] as const;
export type MilestoneKey = (typeof MILESTONES)[number]["key"];

export const EXCEPTION_KINDS = ["Held", "Short bag", "Damage", "RTO"] as const;

/* ================= bag tags ================= */
const TAG_CHARS = "0123456789ABCDEFGHIJKLMNPQRSTUVWXYZ"; // no O — looks like 0

/** Mod-35 check character over the payload — a mistyped tag fails
 *  mathematically, the airline-tag way. */
export function tagCheck(payload: string): string {
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum = (sum * 2 + payload.charCodeAt(i)) % 35;
  return TAG_CHARS[sum];
}

/** City → 3-letter port-style code for the tag. */
export function portCode(city: string): string {
  const known: Record<string, string> = {
    Mumbai: "BOM", "Navi Mumbai / Thane": "NMT", Pune: "PNQ", Ahmedabad: "AMD", Vadodara: "BDQ",
    Nadiad: "NDD", Anand: "AND", Surat: "STV", Rajkot: "RAJ", "Delhi NCR": "DEL", Jaipur: "JAI",
    Udaipur: "UDR", Chandigarh: "IXC", Bengaluru: "BLR", Hyderabad: "HYD", Chennai: "MAA",
    Kochi: "COK", Goa: "GOI", "North Goa": "GOX", Kolkata: "CCU",
  };
  return known[city] ?? city.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
}

/** Pieces are counted at actuals — one oversize item is one piece — so the
 *  count always tallies with the tags; size is flagged as XL instead.
 *  pcsLabel(4, 1) → "5 pcs (1 XL)". */
export const pcsLabel = (bags: number, oversize: number, unit = "pcs") =>
  `${bags + oversize} ${unit}${oversize ? ` (${oversize} XL)` : ""}`;

/** Tags are numbered regular bags first, then the oversize items — so piece
 *  n is XL when n is past the regular bag count. Used by the bag-tag/seal
 *  identity system (src/lib/bagTags.ts). */
export const isXlPiece = (b: { bags: number }, n: number) => n > b.bags;

/** Generate the shipment's tags ONCE, at print time. BD-AMD-BOM-7F3K2-1-C */
export function generateTags(b: Booking, count: number): string[] {
  const base = `${portCode(b.from)}${portCode(b.to)}${b.id.replace(/[^A-Z0-9]/gi, "").slice(-5).toUpperCase()}`;
  return Array.from({ length: count }, (_, i) => {
    const payload = `${base}${i + 1}`;
    return `BD-${portCode(b.from)}-${portCode(b.to)}-${b.id.slice(-5).toUpperCase()}-${i + 1}-${tagCheck(payload)}`;
  });
}

/** Validate a typed/scanned tag against its own checksum (format + math). */
export function validateTag(tag: string): boolean {
  const m = tag.trim().toUpperCase().match(/^BD-([A-Z]{3})-([A-Z]{3})-([A-Z0-9]{5})-(\d+)-([0-9A-Z])$/);
  if (!m) return false;
  return tagCheck(`${m[1]}${m[2]}${m[3]}${m[4]}`) === m[5];
}

/* ================= legs, vendors, costing ================= */
export type LegKey = "pickup" | "linehaul" | "lastmile";
export const LEGS: { key: LegKey; name: string; who: "captain" | "vendor" }[] = [
  { key: "pickup",   name: "Pickup (captain)",    who: "captain" },
  { key: "linehaul", name: "Linehaul (vendor)",   who: "vendor" },
  { key: "lastmile", name: "Delivery (captain)",  who: "captain" },
];

export interface Vendor {
  id: string;
  name: string;
  mobile: string;
  type: "linehaul" | "air cargo" | "pickup fleet" | "last mile";
  lanes: string;          // free text: "Ahmedabad–Mumbai, Mumbai–Goa"
  rate: number;           // standard rate for their leg, per shipment
  jobs?: number;          // assignments so far
  onTime?: number;        // on-time count — score = onTime/jobs
}

/** Per-lane standard leg costs; `laneKey` is "From → To". Lanes not listed
 *  fall back to the defaults. The COO edits this in the module. */
export interface CostModel {
  defaults: { pickup: number; linehaul: number; lastmile: number; perBag?: number }; // perBag: extra handling/space cost per bag beyond the first
  lanes: Record<string, { pickup?: number; linehaul?: number; lastmile?: number }>;
  marginFloorPct: number; // warn when gross margin falls below this
}
export const DEFAULT_COST_MODEL: CostModel = {
  defaults: { pickup: 400, linehaul: 1200, lastmile: 400 },
  lanes: {},
  marginFloorPct: 55,
};

export function targetCost(model: CostModel, lane: string): { total: number; legs: Record<LegKey, number> } {
  const l = model.lanes[lane] ?? {};
  const legs = {
    pickup: l.pickup ?? model.defaults.pickup,
    linehaul: l.linehaul ?? model.defaults.linehaul,
    lastmile: l.lastmile ?? model.defaults.lastmile,
  };
  return { total: legs.pickup + legs.linehaul + legs.lastmile, legs };
}

/* ================= the per-shipment ops state (lives on booking.ops) ================= */
export interface OpsState {
  tags?: string[];                      // generated once, at print
  /** airline-grade per-bag records: licence plate, seal, weight, photo (src/lib/bagTags.ts) */
  bags?: import("./bagTags").BagRecord[];
  /** pickup check-in by the captain: signature + when */
  checkin?: { at: string; by: string; signature?: string; bags: number };
  /** delivery claim check: pass scanned, every tag scanned, OTP verified */
  claim?: { otpHash?: string; otpAt?: string; tries?: number; sends?: number; passAt?: string; scanned?: string[]; doneAt?: string };
  printedAt?: string;
  milestones?: Partial<Record<MilestoneKey, { at: string; by: string; note?: string }>>;
  scans?: Partial<Record<MilestoneKey, string[]>>;
  legs?: Partial<Record<LegKey, { assignee: string; mobile?: string; vendorId?: string; cost?: number; at: string }>>;
  target?: { total: number; legs: Record<LegKey, number> };
  overTarget?: { by: number; reason: string; approvedAt: string };
  exceptions?: { kind: string; at: string; note: string; tag?: string; resolved?: boolean }[];
}
export const opsOf = (b: Booking): OpsState => ((b.admin as { ops?: OpsState }).ops ?? {});

export function actualCost(o: OpsState): number {
  return (["pickup", "linehaul", "lastmile"] as LegKey[]).reduce((s, k) => s + (o.legs?.[k]?.cost ?? 0), 0);
}
export function marginPct(b: Booking): number | null {
  const rev = b.pay?.amount ?? b.quote.total;
  if (!rev) return null;
  const cost = actualCost(opsOf(b));
  if (!cost) return null;
  return Math.round(((rev - cost) / rev) * 100);
}

/** Six-sigma roll-up across shipments: each milestone completion is an
 *  opportunity; each exception is a defect. */
export function sixSigma(bookings: Booking[]): { opportunities: number; defects: number; dpmo: number; sigma: string } {
  let opportunities = 0, defects = 0;
  for (const b of bookings) {
    const o = opsOf(b);
    opportunities += Object.keys(o.milestones ?? {}).length;
    defects += (o.exceptions ?? []).filter((e) => !e.resolved).length;
  }
  const dpmo = opportunities ? Math.round((defects / opportunities) * 1_000_000) : 0;
  const sigma = dpmo === 0 ? "6.0" : dpmo < 233 ? "5.0+" : dpmo < 6210 ? "4.0+" : dpmo < 66807 ? "3.0+" : "<3.0";
  return { opportunities, defects, dpmo, sigma };
}
