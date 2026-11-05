/** SITA × Bagdrop · Mumbai T2 POC — the pure model (no server imports).
 *  Shared by the Airport desk, the server actions, the Bag Journey
 *  connector and the tests.
 *
 *  - Config: POC carriers with their check-in / acceptance windows, secure
 *    hold spots, T2 meeting points, Bag Journey code map. One settings row
 *    (`airport-poc`). Every number defaults to SITA's deck (Oct 2026) and
 *    stays editable until SITA confirms it per carrier.
 *  - Flight block: airline, flight number, STD/STA (IST), terminal, PNR,
 *    surname, carried on booking.admin.airport.flight.
 *  - Window planner: check-in opens 24–48 h out, bags accepted 8–10 h before
 *    departure → pickup verdict (direct to T2 / secure hold / too late).
 *  - Airline tags: IATA 10-digit licence plates linked to pieces, with void
 *    and reprint. Boarding passes: IATA BCBP parsing for the T2 handover.
 *  - Holds and airline exception kinds.
 *  Lanes (blueprint §4): A departures handback at T2 · B arrivals ·
 *  C non-flight custom tag · D BHS injection (only after BCAS approval). */
import type { Booking } from "./types";

/* ================= config ================= */
export interface Carrier {
  code: string;            // IATA designator, e.g. 6E
  name: string;
  numeric?: string;        // 3-digit airline accounting code; when set, licence plates must carry it
  enabled: boolean;        // enabled on SITA Print&Go for the POC
  checkinOpensH: number;   // online check-in opens this many hours before STD
  acceptOpensH: number;    // the airline accepts bags from this many hours before STD
  acceptClosesMin: number; // bag drop closes this many minutes before STD
  maxBagKg: number;        // per-piece limit for the overweight check
}
export interface HoldSpot { id: string; name: string; camera: string }
export interface MeetPoint { id: string; name: string; lane: "dep" | "arr" }
export type Lane = "A" | "B" | "C" | "D";
export const LANES: Record<Lane, string> = {
  A: "Departures · handback to the passenger at T2",
  B: "Arrivals · land and leave",
  C: "Non-flight move · custom Bag Journey tag",
  D: "Departures · BHS injection (after BCAS approval)",
};

export interface AirportPocConfig {
  enabled: boolean;
  /** refuse website air bookings to BOM T2 on carriers not enabled (off until launch) */
  enforceOnBooking: boolean;
  /** BCAS + MIAL + airline + handler sign-off for lane D */
  bhsInjectionApproved: boolean;
  airport: string;
  terminal: string;
  carriers: Carrier[];
  holdSpots: HoldSpot[];
  meetPoints: MeetPoint[];
  transitMin: number;        // hub/hotel → T2 drive time
  handoverBufferMin: number; // hand over this long before bag drop closes
  holdAlertMin: number;      // alert when a held bag is this close to the handover deadline
  reclaimMin: number;        // arrivals: minutes after STA the guest walks out with bags
  bagJourney: { mode: "standin" | "live"; maxTries: number; codes: Record<CustodyCode, string> };
  updatedAt?: string;
  updatedBy?: string;
}

/* ================= custody codes ================= */
export const CUSTODY = {
  ACCEPT: "Accepted into Bagdrop custody",
  TAG_LINK: "Airline tag linked",
  TAG_VOID: "Airline tag voided",
  HOLD_IN: "Into secure hold",
  HOLD_OUT: "Out of secure hold",
  INSCAN: "In-scan at hub",
  DEPART: "Left the hub",
  ARRIVE: "Arrived at destination hub",
  ARRIVE_T2: "Arrived at T2",
  HANDOVER_PAX: "Handed back to the passenger at T2",
  HANDOVER_HANDLER: "Handed to the airline handler (BHS)",
  OFD: "Out for delivery",
  POD: "Delivered",
  EXCEPTION: "Exception logged",
} as const;
export type CustodyCode = keyof typeof CUSTODY;
export const CUSTODY_CODES = Object.keys(CUSTODY) as CustodyCode[];

/** Placeholder custom codes until SITA shares the Bag Journey catalogue. */
export const DEFAULT_BJ_CODES = Object.fromEntries(CUSTODY_CODES.map((c) => [c, `BD-${c.replace(/_/g, "-")}`])) as Record<CustodyCode, string>;

const carrier = (code: string, name: string): Carrier =>
  ({ code, name, enabled: false, checkinOpensH: 48, acceptOpensH: 10, acceptClosesMin: 60, maxBagKg: 32 });

export const DEFAULT_POC: AirportPocConfig = {
  enabled: false,
  enforceOnBooking: false,
  bhsInjectionApproved: false,
  airport: "BOM",
  terminal: "Terminal 2",
  carriers: [carrier("6E", "IndiGo"), carrier("QP", "Akasa Air"), carrier("AI", "Air India")],
  holdSpots: [{ id: "H1", name: "Andheri hub · cage 1", camera: "CAM-01" }],
  meetPoints: [
    { id: "DEP", name: "T2 departures kerb · meeting point to agree with MIAL", lane: "dep" },
    { id: "ARR", name: "T2 arrivals exit · meeting point to agree with MIAL", lane: "arr" },
  ],
  transitMin: 90,
  handoverBufferMin: 45,
  holdAlertMin: 120,
  reclaimMin: 45,
  bagJourney: { mode: "standin", maxTries: 6, codes: DEFAULT_BJ_CODES },
};

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : d;
};
const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Clean a config from the screen or the database; anything missing or out of range falls back to the default. */
export function cleanConfig(raw: unknown): AirportPocConfig {
  const r = (raw ?? {}) as Partial<AirportPocConfig>;
  const d = DEFAULT_POC;
  const carriers = Array.isArray(r.carriers) ? r.carriers : d.carriers;
  const seen = new Set<string>();
  return {
    enabled: !!r.enabled,
    enforceOnBooking: !!r.enforceOnBooking,
    bhsInjectionApproved: !!r.bhsInjectionApproved,
    airport: d.airport,
    terminal: d.terminal,
    carriers: carriers.map((c) => ({
      code: txt(c?.code, 2).toUpperCase(),
      name: txt(c?.name, 40) || txt(c?.code, 2).toUpperCase(),
      numeric: /^\d{3}$/.test(txt(c?.numeric, 3)) ? txt(c?.numeric, 3) : undefined,
      enabled: !!c?.enabled,
      checkinOpensH: num(c?.checkinOpensH, 1, 96, 48),
      acceptOpensH: num(c?.acceptOpensH, 1, 48, 10),
      acceptClosesMin: num(c?.acceptClosesMin, 15, 240, 60),
      maxBagKg: num(c?.maxBagKg, 5, 50, 32),
    })).filter((c) => /^[A-Z0-9]{2}$/.test(c.code) && !/^\d\d$/.test(c.code) && !seen.has(c.code) && !!seen.add(c.code)),
    holdSpots: (Array.isArray(r.holdSpots) ? r.holdSpots : d.holdSpots)
      .map((h) => ({ id: txt(h?.id, 12).toUpperCase(), name: txt(h?.name, 60), camera: txt(h?.camera, 30) }))
      .filter((h) => h.id && h.name),
    meetPoints: (Array.isArray(r.meetPoints) ? r.meetPoints : d.meetPoints)
      .map((m) => ({ id: txt(m?.id, 12).toUpperCase(), name: txt(m?.name, 80), lane: (m?.lane === "arr" ? "arr" : "dep") as "dep" | "arr" }))
      .filter((m) => m.id && m.name),
    transitMin: num(r.transitMin, 10, 600, d.transitMin),
    handoverBufferMin: num(r.handoverBufferMin, 0, 240, d.handoverBufferMin),
    holdAlertMin: num(r.holdAlertMin, 10, 720, d.holdAlertMin),
    reclaimMin: num(r.reclaimMin, 0, 240, d.reclaimMin),
    bagJourney: {
      mode: r.bagJourney?.mode === "live" ? "live" : "standin",
      maxTries: num(r.bagJourney?.maxTries, 1, 20, d.bagJourney.maxTries),
      codes: Object.fromEntries(CUSTODY_CODES.map((c) => [c, txt(r.bagJourney?.codes?.[c], 24) || DEFAULT_BJ_CODES[c]])) as Record<CustodyCode, string>,
    },
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
  };
}
export const carrierOf = (cfg: AirportPocConfig, code: string) => cfg.carriers.find((c) => c.code === code.toUpperCase()) ?? null;

/* ================= the per-booking airport state (booking.admin.airport) ================= */
export interface FlightBlock {
  dir: "dep" | "arr";
  airline: string;   // 6E
  flightNo: string;  // 5219
  std: string;       // departure (dep) or arrival (arr) time, IST, "YYYY-MM-DDTHH:mm"
  terminal: string;
  pnr?: string;
  surname?: string;
}
export interface AirlineTag {
  lp: string;        // 10-digit licence plate
  n: number;         // piece number
  airline: string;
  status: "active" | "void";
  at: string; by: string;
  source: "scan" | "flexbox";
  weightKg?: number; photo?: string; device?: string;
  voidAt?: string; voidBy?: string; voidReason?: string;
}
export interface HoldRecord { spot: string; camera: string; pieces: number[]; inAt: string; inBy: string; outAt?: string; outBy?: string }
export interface AirlineEvent { id: string; lp: string; code: string; text: string; at: string; place?: string }
export interface AirportException { id: string; kind: AirportExceptionKind; at: string; by: string; note: string; n?: number; resolved?: boolean; resolvedAt?: string; resolvedBy?: string; resolution?: string }
export interface AirportState {
  lane?: Lane;
  /** enrolled in the POC → custody events go to Bag Journey */
  enrolled?: boolean;
  enrolledAt?: string;
  flight?: FlightBlock;
  airlineTags?: AirlineTag[];
  holds?: HoldRecord[];
  t2?: { scanned?: number[]; arrivedAt?: string; meetPoint?: string; handover?: { kind: "pax" | "handler"; at: string; by: string; receiver: string; proof: string } };
  airlineEvents?: AirlineEvent[];
  exceptions?: AirportException[];
}
export const airportOf = (b: Booking): AirportState => ((b.admin as { airport?: AirportState }).airport ?? {});

/* ================= flights ================= */
/** "6E 5219", "6e5219", "QP 1104" → { airline, flightNo }. Two-character code, not two digits. */
export function parseFlightRef(raw: string): { airline: string; flightNo: string } | null {
  const m = /^([A-Z0-9]{2})\s*0*(\d{1,4}[A-Z]?)$/.exec(String(raw ?? "").trim().toUpperCase());
  if (!m || /^\d\d$/.test(m[1])) return null;
  return { airline: m[1], flightNo: m[2] };
}
export const flightLabel = (f: Pick<FlightBlock, "airline" | "flightNo">) => `${f.airline} ${f.flightNo}`;

/** "YYYY-MM-DDTHH:mm" in IST → epoch ms (NaN if malformed). */
export function istMs(local: string): number {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local ?? "") ? Date.parse(`${local}:00+05:30`) : NaN;
}
/** epoch ms → "YYYY-MM-DDTHH:mm" IST */
export const istLocal = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 16);
/** epoch ms → "03 Nov, 14:05" IST */
export function istShort(ms: number): string {
  const d = new Date(ms + 5.5 * 3600_000);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, "0")} ${mon}, ${d.toISOString().slice(11, 16)}`;
}

/** The booking's flight — the saved block, else what the website booking captured (ref + date + time). */
export function flightOf(b: Booking): FlightBlock | null {
  const saved = airportOf(b).flight;
  if (saved) return saved;
  const p = parseFlightRef(b.ref ?? "");
  if (b.mode !== "air" || !p) return null;
  const dir = b.uc === "a2d" ? "arr" : "dep";
  const t = /^\d{2}:\d{2}$/.test(b.flightTime ?? "") ? b.flightTime : null;
  return { dir, ...p, std: t && b.date ? `${b.date}T${t}` : "", terminal: /terminal\s*2|\bT2\b/i.test(dir === "dep" ? b.dropAddr : b.pickAddr) ? "Terminal 2" : "", pnr: b.pnr || undefined, surname: b.paxSurname || undefined };
}

/** Problems with a flight block for the POC — empty means good to go. */
export function flightProblems(f: FlightBlock | null, cfg: AirportPocConfig): string[] {
  if (!f) return ["No flight details — add the airline, flight number and time."];
  const out: string[] = [];
  const c = carrierOf(cfg, f.airline);
  if (!/^[A-Z0-9]{2}$/.test(f.airline) || /^\d\d$/.test(f.airline)) out.push("Airline code must be two characters, like 6E.");
  else if (!c) out.push(`${f.airline} isn't a POC carrier.`);
  else if (!c.enabled) out.push(`${c.name} (${c.code}) isn't enabled on Print&Go for the POC yet.`);
  if (!/^\d{1,4}[A-Z]?$/.test(f.flightNo)) out.push("Flight number must be 1–4 digits.");
  if (!Number.isFinite(istMs(f.std))) out.push(`${f.dir === "dep" ? "Departure" : "Arrival"} date and time are missing.`);
  if (f.terminal !== cfg.terminal) out.push(`The POC runs at ${cfg.terminal} only.`);
  if (f.dir === "dep") {
    if (!/^[A-Z0-9]{6}$/.test(f.pnr ?? "")) out.push("PNR must be 6 letters or digits.");
    if (!/^[A-Z][A-Z ]{0,29}$/.test(f.surname ?? "")) out.push("Surname as on the ticket is needed for the boarding-pass match.");
  }
  return out;
}

export function cleanFlight(raw: Partial<FlightBlock>): FlightBlock {
  return {
    dir: raw.dir === "arr" ? "arr" : "dep",
    airline: txt(raw.airline, 2).toUpperCase(),
    flightNo: txt(raw.flightNo, 5).toUpperCase().replace(/^0+(?=\d)/, ""),
    std: txt(raw.std, 16),
    terminal: txt(raw.terminal, 20),
    pnr: txt(raw.pnr, 6).toUpperCase() || undefined,
    surname: txt(raw.surname, 30).toUpperCase().replace(/[^A-Z ]/g, "") || undefined,
  };
}

/* ================= window planner ================= */
export type Verdict = "direct" | "hold" | "before_checkin" | "too_late" | "arrival";
export interface WindowPlan {
  dir: "dep" | "arr";
  stdMs: number;
  checkinOpensAt?: number; acceptOpensAt?: number; acceptClosesAt?: number;
  handoverBy?: number;       // latest T2 handover
  latestPickup?: number;     // leave pickup by this to make the handover
  releaseFromHoldAt?: number;// when a held bag should leave for T2
  meetAt?: number;           // arrivals: meet the guest at T2
  pickupAt?: number;
  verdict: Verdict | null;
  note: string;
}

/** First clock time in a slot label ("09:00 AM – 11:00 AM", "21:30") on a date → epoch ms (IST). */
export function slotMs(date: string, slot: string): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(slot ?? "");
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return NaN;
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return istMs(`${date}T${String(h).padStart(2, "0")}:${m[2]}`);
}

export function planWindow(f: FlightBlock, c: Carrier | null, cfg: AirportPocConfig, pickupAt?: number): WindowPlan {
  const stdMs = istMs(f.std);
  if (!Number.isFinite(stdMs)) return { dir: f.dir, stdMs, verdict: null, note: "Add the flight time to plan the window." };
  if (f.dir === "arr") {
    const meetAt = stdMs + cfg.reclaimMin * 60_000;
    return { dir: "arr", stdMs, meetAt, pickupAt: meetAt, verdict: "arrival", note: `Meet the guest at T2 arrivals from ${istShort(meetAt)} (landing + ${cfg.reclaimMin} min for reclaim).` };
  }
  const k = c ?? carrier(f.airline, f.airline);
  const H = 3600_000, M = 60_000;
  const checkinOpensAt = stdMs - k.checkinOpensH * H;
  const acceptOpensAt = stdMs - k.acceptOpensH * H;
  const acceptClosesAt = stdMs - k.acceptClosesMin * M;
  const handoverBy = acceptClosesAt - cfg.handoverBufferMin * M;
  const latestPickup = handoverBy - cfg.transitMin * M;
  const releaseFromHoldAt = acceptOpensAt - cfg.transitMin * M; // a held bag reaches T2 as acceptance opens
  const base = { dir: "dep" as const, stdMs, checkinOpensAt, acceptOpensAt, acceptClosesAt, handoverBy, latestPickup, releaseFromHoldAt, pickupAt };
  if (pickupAt === undefined || !Number.isFinite(pickupAt)) return { ...base, verdict: null, note: `Pick up between ${istShort(checkinOpensAt)} and ${istShort(latestPickup)}.` };
  if (pickupAt > latestPickup) return { ...base, verdict: "too_late", note: `Too late: leave pickup by ${istShort(latestPickup)} to hand over at T2 by ${istShort(handoverBy)}.` };
  if (pickupAt < checkinOpensAt) return { ...base, verdict: "before_checkin", note: `Online check-in opens ${istShort(checkinOpensAt)} — the airline tag can't print before then. Move the pickup later.` };
  if (pickupAt + cfg.transitMin * M < acceptOpensAt) return { ...base, verdict: "hold", note: `Secure hold needed: the airline accepts bags from ${istShort(acceptOpensAt)}. Release from hold at ${istShort(base.releaseFromHoldAt)}.` };
  return { ...base, verdict: "direct", note: `Straight to T2: arrive by ${istShort(handoverBy)} (bag drop closes ${istShort(acceptClosesAt)}).` };
}

/** The plan for a booking, using its pickup date and slot. */
export function planFor(b: Booking, cfg: AirportPocConfig): WindowPlan | null {
  const f = flightOf(b);
  if (!f) return null;
  return planWindow(f, carrierOf(cfg, f.airline), cfg, slotMs(b.pickupDate || b.date, b.slot));
}

/* ================= airline licence plates ================= */
/** IATA bag tag licence plate: 10 digits = leading digit · 3-digit airline code · 6-digit serial.
 *  Scanner guns and cameras may add spaces or a check character; only the 10 digits count. */
export function parseLicencePlate(raw: string): { lp: string; lead: string; airlineNumeric: string; serial: string } | null {
  const s = String(raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(s)) return null;
  return { lp: s, lead: s[0], airlineNumeric: s.slice(1, 4), serial: s.slice(4) };
}
export const spacedLp = (lp: string) => (lp.length === 10 ? `${lp.slice(0, 4)} ${lp.slice(4)}` : lp);

export type TagError = { error: string; detail: string };
export function linkTag(st: AirportState, a: { n: number; raw: string; carrier: Carrier | null; pieces: number; by: string; source: "scan" | "flexbox"; at: string; weightKg?: number; photo?: string; device?: string }): AirportState | TagError {
  const p = parseLicencePlate(a.raw);
  if (!p) return { error: "BAD_TAG", detail: "That isn't an airline bag tag — it needs 10 digits." };
  if (!Number.isInteger(a.n) || a.n < 1 || a.n > a.pieces) return { error: "BAD_PIECE", detail: `Piece must be 1–${a.pieces}.` };
  if (!a.carrier) return { error: "NO_CARRIER", detail: "Add the flight first — the tag must match the airline." };
  if (a.carrier.numeric && p.airlineNumeric !== a.carrier.numeric) return { error: "WRONG_AIRLINE", detail: `This tag carries airline code ${p.airlineNumeric}, not ${a.carrier.name}'s ${a.carrier.numeric}.` };
  const tags = st.airlineTags ?? [];
  if (tags.some((t) => t.lp === p.lp && t.status === "active")) return { error: "ALREADY_LINKED", detail: `Tag ${spacedLp(p.lp)} is already linked here.` };
  if (tags.some((t) => t.lp === p.lp)) return { error: "TAG_VOIDED", detail: `Tag ${spacedLp(p.lp)} was voided — print a new tag.` };
  const has = tags.find((t) => t.n === a.n && t.status === "active");
  if (has) return { error: "PIECE_HAS_TAG", detail: `Piece ${a.n} already has tag ${spacedLp(has.lp)} — void it before linking a reprint.` };
  const tag: AirlineTag = { lp: p.lp, n: a.n, airline: a.carrier.code, status: "active", at: a.at, by: a.by, source: a.source,
    ...(a.weightKg ? { weightKg: a.weightKg } : {}), ...(a.photo ? { photo: a.photo } : {}), ...(a.device ? { device: a.device } : {}) };
  return { ...st, airlineTags: [...tags, tag] };
}
export function voidTag(st: AirportState, lp: string, reason: string, by: string, at: string): AirportState | TagError {
  const tags = st.airlineTags ?? [];
  const t = tags.find((x) => x.lp === lp && x.status === "active");
  if (!t) return { error: "NOT_ACTIVE", detail: "No active tag with that number." };
  if (reason.trim().length < 3) return { error: "NO_REASON", detail: "Say why the tag is voided (reprint, flight change …)." };
  return { ...st, airlineTags: tags.map((x) => (x === t ? { ...x, status: "void" as const, voidAt: at, voidBy: by, voidReason: reason.trim().slice(0, 120) } : x)) };
}
export const activeTags = (st: AirportState) => (st.airlineTags ?? []).filter((t) => t.status === "active");
/** Piece numbers with no active airline tag. */
export const untaggedPieces = (st: AirportState, pieces: number) =>
  Array.from({ length: pieces }, (_, i) => i + 1).filter((n) => !activeTags(st).some((t) => t.n === n));

/* ================= boarding passes (IATA BCBP, M1 format) ================= */
export interface BoardingPass { surname: string; given: string; pnr: string; from: string; to: string; airline: string; flightNo: string; julian: number; seat: string; seq: string }
export function parseBcbp(raw: string): BoardingPass | null {
  const s = String(raw ?? "");
  if (!/^M[1-4]/.test(s) || s.length < 58) return null;
  const name = s.slice(2, 22).trim();
  const [surname, given = ""] = name.split("/");
  const flight = s.slice(39, 44).trim().replace(/^0+(?=\d)/, "");
  const julian = Number(s.slice(44, 47));
  if (!surname || !/^\d{1,4}[A-Z]?$/.test(flight) || !Number.isInteger(julian)) return null;
  return { surname: surname.trim().toUpperCase(), given: given.trim().toUpperCase(), pnr: s.slice(23, 30).trim().toUpperCase(), from: s.slice(30, 33), to: s.slice(33, 36),
    airline: s.slice(36, 39).trim().toUpperCase(), flightNo: flight, julian, seat: s.slice(48, 52).trim(), seq: s.slice(52, 57).trim() };
}
/** Day of year (1–366) of an IST date. */
export const julianOf = (std: string) => {
  const d = new Date(`${std.slice(0, 10)}T00:00:00Z`);
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
};
/** Does this boarding pass belong to the booking's flight and passenger? Returns the mismatches. */
export function boardingPassMismatches(bp: BoardingPass, f: FlightBlock, airport: string): string[] {
  const out: string[] = [];
  if (bp.airline !== f.airline || bp.flightNo !== f.flightNo) out.push(`flight ${bp.airline} ${bp.flightNo}, booked ${f.airline} ${f.flightNo}`);
  if (f.std && bp.julian !== julianOf(f.std)) out.push("different flight date");
  if (f.dir === "dep" && bp.from !== airport) out.push(`departs ${bp.from}, not ${airport}`);
  if (f.pnr && bp.pnr !== f.pnr) out.push(`PNR ${bp.pnr}, booked ${f.pnr}`);
  if (f.surname && bp.surname.replace(/\s/g, "") !== f.surname.replace(/\s/g, "")) out.push(`passenger ${bp.surname}, booked ${f.surname}`);
  return out;
}

/* ================= secure holds ================= */
export const openHold = (st: AirportState) => (st.holds ?? []).find((h) => !h.outAt) ?? null;

/* ================= airline exceptions ================= */
export const AIRPORT_EXCEPTIONS = {
  dcs_reject: { name: "DCS reject", response: "Tag didn't print or the airline refused it · guest checks in again or uses the airline counter · log the DCS message" },
  overweight: { name: "Overweight for the airline", response: "Tell the guest before leaving · repack or pay excess at the airline counter · never take an over-limit bag to BHS" },
  flight_change: { name: "Flight change or cancel", response: "Void the tag · reprint on the new flight once checked in · re-plan the window" },
  missed_window: { name: "Missed acceptance window", response: "Escalate to ops lead · call the guest · hand back at T2 for the airline counter" },
  no_show: { name: "Guest no-show at T2", response: "Wait 20 min · call twice · keep the bags in custody and return to hub · charge per T&Cs" },
  refused_handler: { name: "Refused by handler", response: "Keep custody · photo + handler's reason · hand back to the guest" },
} as const;
export type AirportExceptionKind = keyof typeof AIRPORT_EXCEPTIONS;
export const isExceptionKind = (k: string): k is AirportExceptionKind => k in AIRPORT_EXCEPTIONS;

/* ================= what needs attention (Airport desk + Exceptions) ================= */
export interface Attention { key: string; sev: "bad" | "warn"; text: string }
export function attentionFor(b: Booking, cfg: AirportPocConfig, now: number, custodyGaps: string[] = []): Attention[] {
  const st = airportOf(b);
  if (!st.enrolled) return [];
  const out: Attention[] = [];
  const done = !!st.t2?.handover || b.status === "delivered" || b.status === "cancelled";
  const f = flightOf(b);
  if (st.lane !== "C") for (const p of flightProblems(f, cfg)) out.push({ key: `flight:${p}`, sev: "warn", text: p });
  const plan = f && st.lane !== "C" ? planWindow(f, carrierOf(cfg, f.airline), cfg, slotMs(b.pickupDate || b.date, b.slot)) : null;
  const picked = b.status === "picked_up" || b.status === "in_transit" || !!(b.admin as { ops?: { milestones?: { picked?: unknown } } }).ops?.milestones?.picked;
  if (!done && plan?.dir === "dep") {
    if (plan.verdict === "too_late" && !picked) out.push({ key: "too_late", sev: "bad", text: plan.note });
    const h = openHold(st);
    if (h && plan.handoverBy && now > plan.handoverBy) out.push({ key: "hold_missed", sev: "bad", text: `Still in hold (${h.spot}) after the T2 handover deadline ${istShort(plan.handoverBy)}.` });
    else if (h && plan.releaseFromHoldAt && now >= plan.releaseFromHoldAt - cfg.holdAlertMin * 60_000 && now < (plan.handoverBy ?? Infinity)) out.push({ key: "hold_release", sev: "warn", text: `Release from hold ${h.spot} by ${istShort(plan.releaseFromHoldAt)}.` });
    if (!h && picked && plan.handoverBy && now > plan.handoverBy) out.push({ key: "handover_late", sev: "bad", text: `Not handed over at T2 and the deadline ${istShort(plan.handoverBy)} has passed.` });
    if (picked && untaggedPieces(st, b.bags + b.oversize).length) out.push({ key: "untagged", sev: "bad", text: `Picked up with ${untaggedPieces(st, b.bags + b.oversize).length} piece(s) without an airline tag.` });
  }
  for (const e of st.exceptions ?? []) if (!e.resolved) out.push({ key: `exc:${e.id}`, sev: "bad", text: `${AIRPORT_EXCEPTIONS[e.kind]?.name ?? e.kind}${e.n ? ` · piece ${e.n}` : ""}: ${e.note}` });
  for (const g of custodyGaps) out.push({ key: `gap:${g}`, sev: "bad", text: g });
  return out;
}
