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
  /** Instant booking: when on, a qualifying booking is auto-approved and
   *  confirmed the moment it is paid — no team review (src/lib/instant.ts). */
  instant?: InstantRule | null;
}

export interface InstantRule {
  enabled: boolean;
  minNoticeDays?: number | null; // days from today to the pickup date (default: settings, 5)
  from?: string | null;          // active window, YYYY-MM-DD (inclusive)
  to?: string | null;
  blackout?: string[];           // YYYY-MM-DD dates closed for instant booking
  weekdays?: number[] | null;    // pickup weekdays allowed, 0 = Sunday … 6; empty/missing = all
  dailyCap?: number | null;      // instant bookings per pickup date on this route
  maxBags?: number | null;       // bags per instant booking
  allowOversize?: boolean;       // oversize pieces allowed in an instant booking
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
  mode: "full" | "cash";
  amount: number;
  /** pending: QR shown, nothing claimed yet. submitted: customer clicked
   *  "I Have Completed Payment" (+ optional UTR) — awaiting admin review.
   *  captured: admin verified. rejected: admin rejected — customer may
   *  resubmit (goes back to "pending"). */
  status: "pending" | "submitted" | "captured" | "rejected";
  gateway: string;
  at: string;
  utr?: string;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string;
  rejectedAt?: string | null;
  rejectedNote?: string;
  /** payment proof the customer uploaded (private storage path) */
  proof?: { path: string; name?: string; at: string } | null;
  /** extra amount due after bags were ADDED post-payment */
  topup?: { amount: number; status: "due" | "submitted" | "rejected"; utr?: string; proof?: { path: string; name?: string; at: string } | null; submittedAt?: string | null; rejectedNote?: string } | null;
  /** every verified amount, for the audit trail */
  history?: { at: string; amount: number; kind: "full" | "topup"; utr?: string; verifiedBy?: string }[];
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
  /** The signed "Undertaking for Moving Baggage Goods & Household Goods" —
   *  captured right before Aadhaar verification, after payment is verified. */
  indemnity?: {
    acceptedAt: string; idType: "aadhaar" | "passport" | "licence"; idNumber: string; signature: string; place?: string;
    /** bond version + SHA-256 of the exact text agreed, the boxes ticked and how it was signed */
    version?: string; textHash?: string; accepted?: string[]; fragile?: string; method?: "aadhaar_otp" | "email_otp" | "mobile_otp";
  } | null;
  /** Identity & compliance state for the pre-pickup bond. Domestic guests
   *  sign with Aadhaar OTP; international guests upload documents that the
   *  team reviews before they can sign. Document files live in the private
   *  "identity-docs" bucket and are only ever served as short signed links. */
  kyc?: {
    kind: "domestic" | "international";
    status: "docs_submitted" | "docs_rejected" | "docs_approved" | "signed";
    nationality?: string; passportNo?: string; indiaAddress?: string;
    docs?: { path: string; kind: "passport" | "visa" | "other"; name?: string; at: string }[];
    submissions?: number; note?: string; reviewedAt?: string; reviewedBy?: string;
  } | null;
  admin: Record<string, unknown>;
  /** revision for compare-and-swap writes (src/lib/bookingStore.ts) */
  rev?: number;
  events: BookingEvent[];
  lr?: { no: string; at: string; trip: string } | null;
  eway?: { at: string; status: string } | null;
  pod?: { no: string; at: string; receiver: string } | null;
  docs?: DocRecord[];
  /** Set when this booking belongs to a wedding/group event (WeddingEvent.id). */
  eventCode?: string | null;
  eventName?: string;
  family?: { name: string; side?: string; guests?: number };
  /** Full wedding-desk state (the Y2K family wizard, /e/[code]). One
   *  document, two views: the Admin OS sees the booking fields above; the
   *  wedding desk re-hydrates its wizard + per-bag statuses from this. */
  wedding?: WeddingDeskRecord;
}

/** The wedding desk's own record, carried on the booking under .wedding. */
export interface WeddingDeskRecord {
  bookingId: string;
  state: unknown; // the wizard's full form state — owned by the desk page
  bagStatus: Record<string, string>; // tag id -> Y2K stage label
  createdAt: string;
  updatedAt: string;
}

/** The Y2K desk's 8 bag stages, in order. Stage index -> booking status:
 *  1-2 picked_up · 3/4/6 in_transit · 5/7 delivered. */
export const WEDDING_STAGES = [
  "Booked", "Picked up", "At hub", "In transit", "At Taj", "In room", "Return pickup", "Delivered home",
] as const;

/** A wedding/group-travel event — the `events` table. Guests book under one
 *  event code; sectors are the pickup-city legs the event covers, each with
 *  a suggested per-bag rate from the pricing engine. */
export interface EventSector { city: string; rate: number; pickDay: string; retDay: string }

export interface WeddingEvent {
  id: string; // "WED-XXXXX" style code
  created: string;
  status: "open" | "closed";
  name: string;
  type: string; // WED/MIC/PIL/SPT/STU/FAM
  venueCity: string;
  venue: string;
  dates: { in: string; out: string };
  direction: string; // e.g. "both" | "inbound" | "outbound"
  billing: string; // "host" | "split" | "family"
  expected: { families: number; bags: number };
  rates: { oversize: number; minBags: number; slabPct: number; depositPct: number };
  sectors: EventSector[];
  contacts: { host: string; hostMobile: string; planner?: string; onsite?: string };
  landing: { names?: string; hashtag?: string; datesText?: string; sides?: string; celebration?: string; destination?: string };
}

/** A wedding/event record read by the PUBLIC guest pages (/weddings,
 *  /e/[code]) — same `events` table and jsonb-doc shape as WeddingEvent
 *  above (the Admin OS's "Events & bulk" module), just the narrower,
 *  optional-field view those pages were built against. Both read and
 *  write the same rows; `page` is the guest desk's own route, if it has
 *  one (e.g. "/e/y2k"). */
export interface BagdropEvent {
  id: string;
  created: string;
  status: "open" | "closed";
  name: string;
  type: string;
  venueCity: string;
  venue: string;
  dates: { in: string; out: string };
  direction: "both" | "out";
  billing: "host" | "family";
  expected?: { families?: number; bags?: number };
  rates?: { oversize?: number; minBags?: number; slabPct?: number; depositPct?: number };
  sectors: EventSector[];
  contacts?: { host?: string; hostMobile?: string; planner?: string; onsite?: string };
  landing?: {
    names?: string; hashtag?: string; datesText?: string; sides?: string;
    celebration?: string; destination?: string;
  };
  page?: string;
}

/** The wedding desk's own record, carried on the booking under .wedding. */
export interface WeddingDeskRecord {
  bookingId: string;
  state: unknown; // the wizard's full form state — owned by the desk page
  bagStatus: Record<string, string>; // tag id -> Y2K stage label
  createdAt: string;
  updatedAt: string;
}



export interface EventSector { city: string; rate: number; pickDay: string; retDay: string }

/** A wedding/event record — the `events` table (same jsonb-doc shape the
 *  static platform wrote, so both builds read one another's events). */
export interface BagdropEvent {
  id: string;
  created: string;
  status: "open" | "closed";
  name: string;
  type: string;
  venueCity: string;
  venue: string;
  dates: { in: string; out: string };
  direction: "both" | "out";
  billing: "host" | "family";
  expected?: { families?: number; bags?: number };
  rates?: { oversize?: number; minBags?: number; slabPct?: number; depositPct?: number };
  sectors: EventSector[];
  contacts?: { host?: string; hostMobile?: string; planner?: string; onsite?: string };
  landing?: {
    names?: string; hashtag?: string; datesText?: string; sides?: string;
    celebration?: string; destination?: string;
  };
  page?: string;
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

/** A wedding/event inquiry — the `inquiries` table. There's no customer-
 *  facing form for these in this app yet (only in the static build's
 *  wedding pages), so this list is naturally empty until one exists;
 *  the CRM module still works against whatever rows land here. */
export interface Inquiry {
  id: string;
  created: string;
  status: "new" | "contacted" | "converted" | "lost";
  contact: { name: string; role: string; mobile: string; email?: string };
  venue?: string;
  venueCity?: string;
  dates?: { from: string; to: string };
  families?: number;
  bags?: number;
  pickupCities?: string[];
}

/** Pipeline stages for a CRM lead — Zoho-style deal flow. */
export type LeadStage = "new" | "contacted" | "quoted" | "negotiation" | "won" | "lost";

/** One CRM record: an activity-log entry (a note, a nudge, a task) or —
 *  when kind is "lead" and `stage` is set — a pipeline lead/deal. One
 *  table (`crm`), one shape, same as the rest of the document model. */
export interface CrmActivity {
  id: string;
  created: string;
  text: string;
  kind: "lead" | "customer" | "note";
  dept?: string;
  contact?: string;
  msg?: string;
  dueAt?: string | null;
  doneAt?: string | null;
  refId?: string;
  followKey?: string;
  /* lead/deal fields */
  stage?: LeadStage;
  value?: number;
  owner?: string;
  mobile?: string;
  email?: string;
  source?: string;
  /* ads-import fields */
  campaign?: string;
  route?: { from: string; to: string; bags: number; date?: string };
  ratePending?: boolean;
  quoteInfo?: { qid: string | null; total: number; validUntil?: string; link?: string };
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
