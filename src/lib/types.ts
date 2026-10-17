/** Bagdrop domain types — the single source of truth the compiler enforces. */

export type Zone = "MUM" | "GUJ" | "NOR" | "SOU" | "GOA" | "EAS";
export type Mode = "air" | "road" | "rail" | "sea";
export type UseCase = "d2a" | "a2d" | "h2a" | "h2h" | "d2d" | "rail" | "cruise" | "wed";

export type BookingStatus =
  | "quoted" | "identified" | "submitted" | "revised"
  | "accepted" | "assigned" | "picked_up" | "in_transit"
  | "delivered" | "rejected" | "cancelled";

export interface City {
  name: string;
  zone: Zone;
  ap?: string;
}

/** One row of the official rate chart: ₹ per booking, GST 5% extra. */
export interface RouteRate {
  from: string;
  to: string;
  dir: "both" | "one";
  note?: string;
  r1: number;        // 1 bag
  r2: number;        // 2 bags, total
  addl: number;      // each additional bag
  bulkMin?: number | null;  // at this count, EVERY bag bills at bulkRate
  bulkRate?: number | null;
}

export interface QuoteInput {
  fromName: string;
  toName: string;
  bags: number;
  oversize: number;
  mode: Mode;
  date?: string; // ISO yyyy-mm-dd
}

export interface QuoteResult {
  source: "route" | "matrix";
  rule: string;
  routeName?: string;
  billed: number;
  base: number;
  oversize: number;
  slab: number;
  peak: number;
  gst: number;
  total: number;
  perBag: number;
}

export interface SignedQuote extends QuoteResult {
  qid: string;
  validUntil: string;
  signature: string; // HMAC over the figures — payment verifies this, never the browser's number
}

export interface Traveller {
  title?: string;
  name: string;
  mobile: string;
  email?: string;
  res: "in" | "intl";
}

export interface Payment {
  mode: "full" | "hold" | "cash";
  amount: number;
  status: "captured";
  gateway: string;
  at: string;
  recon?: { at: string; ref: string };
}

export interface BookingEvent {
  at: string;
  by: "customer" | "admin";
  text: string;
}

/** The booking record — identical shape to the Admin OS, so both front ends
 *  share one Supabase backend with zero translation. */
export interface Booking {
  id: string;
  created: string;
  status: BookingStatus;
  uc: UseCase | "";
  ucName: string;
  mode: Mode;
  from: string;
  to: string;
  pickAddr: string;
  dropAddr: string;
  zo: Zone | "";
  zd: Zone | "";
  date: string;
  pickupDate?: string;
  deliveryDate?: string | null;
  ref: string;
  pnr?: string;
  flightTime?: string | null;
  slot: string;
  bags: number;
  oversize: number;
  billed: number;
  traveller: Traveller;
  payer: { name: string; contact: string } | null;
  note: string;
  source?: string;
  quote: {
    qid: string | null;
    total: number;
    breakdown: Partial<QuoteResult> & { ror?: boolean };
    validUntil?: string | null;
    signature?: string;
  };
  identity: { ok: boolean; at: string; method: string; score: number } | null;
  pay: Payment | null;
  admin: Record<string, unknown>;
  events: BookingEvent[];
  lr?: { no: string; at: string; trip: string } | null;
  eway?: { at: string; status: string } | null;
  pod?: { no: string; at: string; receiver: string } | null;
  docs?: DocRecord[];
}

/** Document types that go through the same race-safe numbering as LR
 *  (Postgres next_doc_no(type, fy) — see supabase/schema.sql). */
export type DocType = "LR" | "INV" | "PI" | "RCT" | "CSH" | "CV" | "CN" | "TR" | "MF";

export interface DocRecord {
  type: DocType;
  no: string;
  at: string;
  amount: number;
}

export type TripStatus = "planned" | "running" | "completed";

export interface TripExpense { at: string; head: string; amount: number; note: string }
export interface TripAdvance { at: string; amount: number; note: string }

/** A single vehicle run — bookings club onto it via booking.admin.trip. */
export interface Trip {
  id: string;
  created: string;
  status: TripStatus;
  route: string;
  date: string;
  vehicle: string;
  vehicleType: string;
  driver: string;
  driverMobile: string;
  expenses: TripExpense[];
  advances: TripAdvance[];
}
