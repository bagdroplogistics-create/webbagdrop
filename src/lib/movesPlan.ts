/** BAGDROP OS · Moves calendar — the planning model behind the calendar.
 *
 *  Every booking is split into the legs that actually happen on a date:
 *    pickup   — a local vehicle collects from the customer (from-city)
 *    linehaul — city to city: own/hired vehicle (road), airline cargo (air)
 *               or the train's parcel van (rail); none when from === to
 *    delivery — a local vehicle drops at the destination (to-city)
 *
 *  Clubbing suggestions (all pure, so the same rules run in tests):
 *    · pickup run    same city, same day, slots within the run window (3 h)
 *    · delivery run  same city, same day, slots within the run window
 *    · road club     same lane, departures within ±1 day, delivery dates kept
 *    · air / rail    same lane, same day — locked to the flight / train no.
 *                    once ops has entered it on the booking
 *  Wedding / event consignments are never clubbed with other customers.
 *  Load is counted in pieces at actuals (one oversize item = one piece, so
 *  counts tally with the bag tags); oversize items are flagged XL and are
 *  never put on a vehicle that can't take oversize. */
import { isPaid } from "./payState";
import type { Booking, BookingStatus, Mode } from "./types";

export type LegKind = "pickup" | "linehaul" | "delivery";
export type Tone = "confirmed" | "pending";

export interface VehicleType { type: string; capacity: number; oversizeOk: boolean }
export interface FleetSettings {
  local: VehicleType[];      // city pickups and deliveries
  linehaul: VehicleType[];   // road, city to city
  runWindowMin: number;      // slots this close together make one city run
  linehaulDays: number;      // ± days a road club may span
  dailyPieces: number;       // bags the team can handle per city-day (month view load bar)
}
export const DEFAULT_FLEET: FleetSettings = {
  local: [
    { type: "Bike / two-wheeler", capacity: 3, oversizeOk: false },
    { type: "Car / hatchback", capacity: 6, oversizeOk: false },
    { type: "Tata Ace", capacity: 25, oversizeOk: true },
    { type: "Bolero pickup", capacity: 40, oversizeOk: true },
  ],
  linehaul: [
    { type: "Bolero pickup", capacity: 40, oversizeOk: true },
    { type: "Eicher 14 ft", capacity: 120, oversizeOk: true },
    { type: "Eicher 17 ft", capacity: 160, oversizeOk: true },
    { type: "Container / 20+ ft", capacity: 300, oversizeOk: true },
  ],
  runWindowMin: 180,
  linehaulDays: 1,
  dailyPieces: 24,
};

/** Fills gaps in a stored (possibly older or partial) settings row. */
export function normFleet(f: Partial<FleetSettings> | null | undefined): FleetSettings {
  const list = (l: unknown, d: VehicleType[]) => Array.isArray(l) && l.length
    ? (l as VehicleType[]).filter((v) => v && v.type && v.capacity > 0).map((v) => ({ type: String(v.type), capacity: Math.round(Number(v.capacity)), oversizeOk: !!v.oversizeOk }))
    : d;
  const num = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
  return {
    local: list(f?.local, DEFAULT_FLEET.local),
    linehaul: list(f?.linehaul, DEFAULT_FLEET.linehaul),
    runWindowMin: num(f?.runWindowMin, DEFAULT_FLEET.runWindowMin, 30, 1440),
    linehaulDays: num(f?.linehaulDays, DEFAULT_FLEET.linehaulDays, 0, 3),
    dailyPieces: num(f?.dailyPieces, DEFAULT_FLEET.dailyPieces, 1, 10000),
  };
}

/* ---------------- which bookings are on the calendar ---------------- */
const CONFIRMED_STATUS: BookingStatus[] = ["accepted", "assigned", "picked_up", "in_transit"];
const PENDING_STATUS: BookingStatus[] = ["quoted", "identified", "submitted", "revised"];
const settled = (b: Booking) => isPaid(b) || !!b.payer;

/** Solid = approved and paid (or partner-billed); dashed = coming in. */
export function toneOf(b: Booking): Tone | null {
  if (CONFIRMED_STATUS.includes(b.status)) return b.status === "accepted" && !settled(b) ? "pending" : "confirmed";
  if (PENDING_STATUS.includes(b.status)) return "pending";
  return null; // delivered, rejected, cancelled
}
export const isWedding = (b: Booking) => b.uc === "wed" || !!b.eventCode;
export const carrierOf = (b: Booking): string => {
  const c = (b.admin as { carrier?: { no?: string } }).carrier?.no;
  return (c ?? "").trim().toUpperCase();
};
export const runOf = (b: Booking, leg: "pickup" | "delivery"): string | null =>
  ((b.admin as { runs?: Partial<Record<"pickup" | "delivery", string>> }).runs ?? {})[leg] ?? null;
export const tripOf = (b: Booking): string | null => ((b.admin as { trip?: string }).trip ?? null) || null;

/** "07:30 AM" / "7:30 pm" / "19:30" → minutes after midnight; null if unreadable. */
export function slotMinutes(slot: string): number | null {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(slot ?? "");
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (h > 23 || min > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h * 60 + min;
}

export function piecesOf(b: Booking): number {
  return b.bags + b.oversize;
}

export interface Leg {
  key: string;          // `${bookingId}:${kind}`
  id: string;           // booking id
  kind: LegKind;
  date: string;         // YYYY-MM-DD
  min: number | null;   // slot start, minutes after midnight
  slot: string;
  city: string;         // where it happens (pickup: from, delivery: to, linehaul: from)
  lane: string;         // "From → To"
  mode: Mode;
  pieces: number;       // pieces at actuals, oversize included
  oversize: number;     // of which XL (oversize)
  tone: Tone;
  done: boolean;        // this leg has physically happened
  wedding: boolean;
  carrier: string;      // flight / train no. (air, rail)
  run: string | null;   // planned city run (pickup / delivery)
  trip: string | null;  // line-haul trip
  deliverBy: string | null;
  name: string;
  status: BookingStatus;
}

const AFTER_PICKUP: BookingStatus[] = ["picked_up", "in_transit"];

export function legsOf(b: Booking): Leg[] {
  const tone = toneOf(b);
  if (!tone) return [];
  const pickupDate = (b.pickupDate || b.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return [];
  const deliveryDate = (b.deliveryDate || "").slice(0, 10) || null;
  const base = {
    id: b.id, lane: `${b.from} → ${b.to}`, mode: b.mode ?? "road", pieces: piecesOf(b), oversize: b.oversize,
    tone, wedding: isWedding(b), carrier: carrierOf(b), trip: tripOf(b), deliverBy: deliveryDate,
    name: b.traveller?.name ?? "", status: b.status,
  };
  const picked = AFTER_PICKUP.includes(b.status);
  const legs: Leg[] = [{ ...base, key: `${b.id}:pickup`, kind: "pickup", date: pickupDate, min: slotMinutes(b.slot), slot: b.slot, city: b.from, done: picked, run: runOf(b, "pickup") }];
  if (b.from !== b.to) {
    legs.push({ ...base, key: `${b.id}:linehaul`, kind: "linehaul", date: pickupDate, min: null, slot: "", city: b.from, done: b.status === "in_transit", run: null });
  }
  /* a delivery date is only known for some services; without one the drop
   * is shown on the pickup day for same-city moves, and not at all for
   * line-haul (the team sets it once the run is planned) */
  const dropDate = deliveryDate ?? (b.from === b.to ? pickupDate : null);
  if (dropDate) {
    legs.push({ ...base, key: `${b.id}:delivery`, kind: "delivery", date: dropDate, min: null, slot: "", city: b.to, done: false, run: runOf(b, "delivery") });
  }
  return legs;
}

/* ---------------- clubbing ---------------- */
export type ClubKind = "pickup_run" | "delivery_run" | "road" | "air" | "rail";
export interface Suggestion {
  key: string;
  kind: ClubKind;
  title: string;       // "Pickup run · Vadodara"
  date: string;        // the day the club happens (road: departure day)
  city: string;
  lane: string;
  legs: Leg[];
  pieces: number;      // at actuals
  oversize: number;    // of which XL
  vehicle: string;     // best fit, or the carrier for air / rail
  vehicles: number;    // how many of that vehicle the load needs
  carrier: string;     // flight / train no. it is locked to, if any
  saving: number;      // ₹ of separate runs avoided, from the cost model
  planned: boolean;    // already one run / one trip
  note: string;
}

const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Smallest vehicle that carries the load in one go (oversize respected);
 *  otherwise the biggest allowed one, as many as needed. */
export function fitVehicle(list: VehicleType[], pieces: number, oversize: boolean): { vehicle: string; count: number } {
  const ok = list.filter((v) => !oversize || v.oversizeOk).sort((a, b) => a.capacity - b.capacity);
  if (!ok.length) return { vehicle: "—", count: 0 };
  const one = ok.find((v) => v.capacity >= pieces);
  if (one) return { vehicle: one.type, count: 1 };
  const big = ok[ok.length - 1];
  return { vehicle: big.type, count: Math.ceil(pieces / big.capacity) };
}

/** Greedy clusters over a sorted list: a new cluster starts when the
 *  span from the cluster's first item would exceed `span`. */
function clusters<T>(items: T[], pos: (t: T) => number, span: number): T[][] {
  const sorted = [...items].sort((a, b) => pos(a) - pos(b));
  const out: T[][] = [];
  for (const it of sorted) {
    const cur = out[out.length - 1];
    if (cur && pos(it) - pos(cur[0]) <= span) cur.push(it); else out.push([it]);
  }
  return out;
}
const groupBy = <T,>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return m;
};

export interface LegCosts { pickup: number; linehaul: number; lastmile: number }

export function suggestClubs(legs: Leg[], f: FleetSettings, cost: (lane: string) => LegCosts): Suggestion[] {
  const open = legs.filter((l) => !l.done && !l.wedding);
  const out: Suggestion[] = [];
  const total = (ls: Leg[]) => ls.reduce((a, l) => a + l.pieces, 0);
  const xl = (ls: Leg[]) => ls.reduce((a, l) => a + l.oversize, 0);
  const anyOversize = (ls: Leg[]) => xl(ls) > 0;

  /* city runs — pickups and deliveries */
  for (const kind of ["pickup", "delivery"] as const) {
    const byDayCity = groupBy(open.filter((l) => l.kind === kind), (l) => `${l.date}|${l.city}`);
    for (const [k, list] of byDayCity) {
      const [date, city] = k.split("|");
      /* no slot = flexible: it joins the day's first run */
      const timed = clusters(list.filter((l) => l.min !== null), (l) => l.min!, f.runWindowMin);
      const loose = list.filter((l) => l.min === null);
      if (loose.length) (timed[0] ??= []).push(...loose);
      for (const c of timed) {
        if (c.length < 2) continue;
        const pcs = total(c);
        const fit = fitVehicle(f.local, pcs, anyOversize(c));
        const legCost = (l: Leg) => (kind === "pickup" ? cost(l.lane).pickup : cost(l.lane).lastmile);
        const saving = c.reduce((a, l) => a + legCost(l), 0) - Math.max(...c.map(legCost)) * fit.count;
        const runs = new Set(c.map((l) => l.run));
        const times = c.filter((l) => l.min !== null).map((l) => l.slot);
        out.push({
          key: `${kind}|${date}|${city}|${c.map((l) => l.id).sort().join(",")}`,
          kind: kind === "pickup" ? "pickup_run" : "delivery_run",
          title: `${kind === "pickup" ? "Pickup" : "Delivery"} run · ${city}`,
          date, city, lane: "", legs: c, pieces: pcs, oversize: xl(c), vehicle: fit.vehicle, vehicles: fit.count, carrier: "",
          saving: Math.max(0, saving), planned: runs.size === 1 && !runs.has(null),
          note: times.length ? `${times[0]}${times.length > 1 ? ` – ${times[times.length - 1]}` : ""}` : "flexible timing",
        });
      }
    }
  }

  /* line-haul */
  const hauls = open.filter((l) => l.kind === "linehaul");
  for (const [k, list] of groupBy(hauls, (l) => `${l.mode}|${l.lane}`)) {
    const [mode, lane] = k.split("|") as [Mode, string];
    if (mode === "air" || mode === "rail") {
      /* same day only; a flight / train no. locks the club to that carrier */
      for (const [date, day] of groupBy(list, (l) => l.date)) {
        const refs = [...new Set(day.map((l) => l.carrier).filter(Boolean))];
        const loose = day.filter((l) => !l.carrier);
        const sets: [string, Leg[]][] = refs.length === 1
          ? [[refs[0], day]]
          : [...refs.map((r) => [r, day.filter((l) => l.carrier === r)] as [string, Leg[]]), ["", loose]];
        for (const [carrier, c] of sets) {
          if (c.length < 2) continue;
          out.push({
            key: `${mode}|${lane}|${date}|${carrier}|${c.map((l) => l.id).sort().join(",")}`,
            kind: mode, title: `${mode === "air" ? "Air cargo" : "Rail parcel"} · ${lane}`,
            date, city: c[0].city, lane, legs: c, pieces: total(c), oversize: xl(c),
            vehicle: mode === "air" ? "Airline cargo" : "Rail parcel van", vehicles: 1, carrier,
            saving: 0, // carriers charge by weight either way; the gain is one booking and one hand-over, not a ₹ figure we can stand behind
            planned: new Set(c.map((l) => l.trip)).size === 1 && !!c[0].trip,
            note: carrier ? `on ${carrier}${loose.length && refs.length === 1 ? ` · ${loose.length} without a number join it` : ""}` : "same day — enter the flight / train no. to lock it",
          });
        }
      }
      continue;
    }
    /* road: departures within ±linehaulDays; the vehicle leaves on the
     * latest pickup day, so anyone whose delivery date falls before that
     * day is left out of the club */
    for (const c0 of clusters(list, (l) => Date.parse(`${l.date}T00:00:00Z`) / 86_400_000, f.linehaulDays)) {
      const depart = c0.reduce((a, l) => (l.date > a ? l.date : a), c0[0].date);
      const c = c0.filter((l) => !l.deliverBy || l.deliverBy >= depart);
      if (c.length < 2) continue;
      const pcs = total(c);
      const fit = fitVehicle(f.linehaul, pcs, anyOversize(c));
      const saving = c.reduce((a, l) => a + cost(l.lane).linehaul, 0) - cost(lane).linehaul * fit.count;
      const spread = dayDiff(c.reduce((a, l) => (l.date < a ? l.date : a), depart), depart);
      out.push({
        key: `road|${lane}|${depart}|${c.map((l) => l.id).sort().join(",")}`,
        kind: "road", title: `Line-haul · ${lane}`, date: depart, city: c[0].city, lane, legs: c, pieces: pcs, oversize: xl(c),
        vehicle: fit.vehicle, vehicles: fit.count, carrier: "", saving: Math.max(0, saving),
        planned: new Set(c.map((l) => l.trip)).size === 1 && !!c[0].trip,
        note: spread ? `earlier pickups wait ${spread} day${spread > 1 ? "s" : ""} at the hub` : "same-day departure",
      });
    }
  }
  return out.sort((a, b) => (a.date === b.date ? b.saving - a.saving : a.date < b.date ? -1 : 1));
}

/* ---------------- calendar helpers ---------------- */
/** Monday-first weeks covering the month of `ym` ("YYYY-MM"). */
export function monthGrid(ym: string): string[][] {
  const first = `${ym}-01`;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  let d = addDays(first, -dow);
  const weeks: string[][] = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    d = addDays(d, 7);
  } while (d.slice(0, 7) === ym);
  return weeks;
}
export const weekOf = (day: string): string[] => {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(day, i - dow));
};
export { addDays };
