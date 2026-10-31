/** Tracking Inspector — the SOP/SLA rule engine. Pure function over the
 *  bookings list: every active shipment is checked against the standard
 *  operating procedures below, and anything slow, stuck or off-plan comes
 *  back as a FLAG with a severity, the responsible department, and the best
 *  contact to alert (vendor / captain / client). Shared by the API and UI. */
import { opsOf, MILESTONES, type MilestoneKey } from "./opsModel";
import type { Booking } from "./types";
import { isPaid } from "./payState";

export interface DeptContact {
  key: string; name: string; mobile?: string; email?: string;
}
export const DEFAULT_DEPARTMENTS: DeptContact[] = [
  { key: "bookings", name: "Bookings desk" },
  { key: "pricing", name: "Pricing desk" },
  { key: "ops", name: "Operations / captains" },
  { key: "hub", name: "Hub & scanning" },
  { key: "linehaul", name: "Linehaul" },
  { key: "lastmile", name: "Last mile" },
  { key: "compliance", name: "Compliance / KYC" },
  { key: "partners", name: "Partners / B2B" },
];

export type Severity = "red" | "amber";

export interface Flag {
  bookingId: string;
  rule: string;              // stable rule key, e.g. PICKUP_OVERDUE
  sop: string;               // the SOP sentence being enforced
  severity: Severity;
  title: string;             // short human headline
  detail: string;            // what exactly is off-plan, with times
  dept: string;              // suggested department key
  ageH: number;              // how long it has been off-plan
  client: { name: string; mobile: string };
  vendorMobile?: string;     // linehaul/leg vendor if one is assigned
  captain?: string;
  lane: string; date: string; slot: string; status: string;
}

const H = 3600_000;
const hoursSince = (iso: string | undefined, now: number) => (iso ? (now - new Date(iso).getTime()) / H : 0);

/* ---------- the live journey view (motion tracker) ---------- */
export interface JourneyStop { key: string; name: string; at: string | null }
export interface JourneyRow {
  id: string; lane: string; status: string; date: string; slot: string;
  client: string; mobile: string;
  stops: JourneyStop[];        // booked + the 8 ops milestones
  doneCount: number;           // stops completed
  current: string;             // name of the stop in progress
  lastMoveH: number;           // hours since the last logged event
  severity: Severity | "ok";   // worst flag on this shipment
  pickupInH: number | null;    // hours until (negative = past) the pickup window end
}

export function journeys(bookings: Booking[], flags: Flag[], now = Date.now()): JourneyRow[] {
  const worst = new Map<string, Severity>();
  for (const f of flags) {
    const cur = worst.get(f.bookingId);
    if (!cur || (f.severity === "red" && cur === "amber")) worst.set(f.bookingId, f.severity);
  }
  const rows: JourneyRow[] = [];
  for (const b of bookings) {
    if (["delivered", "cancelled", "rejected"].includes(b.status)) continue;
    const ms = opsOf(b).milestones ?? {};
    const stops: JourneyStop[] = [
      { key: "booked", name: "Booked", at: b.created },
      ...MILESTONES.map((m) => ({ key: m.key as string, name: m.name, at: ms[m.key]?.at ?? null })),
    ];
    const doneCount = stops.filter((s) => s.at).length;
    const due = pickupDue(b);
    rows.push({
      id: b.id, lane: `${b.from} → ${b.to}`, status: b.status, date: b.date, slot: b.slot,
      client: b.traveller.name, mobile: b.traveller.mobile,
      stops, doneCount,
      current: stops.find((s) => !s.at)?.name ?? "Delivered",
      lastMoveH: hoursSince(lastEventAt(b), now),
      severity: worst.get(b.id) ?? "ok",
      pickupInH: due === Infinity ? null : (due - now) / H,
    });
  }
  const rank = { red: 0, amber: 1, ok: 2 } as const;
  return rows.sort((a, b) => rank[a.severity] - rank[b.severity] || b.lastMoveH - a.lastMoveH);
}

/** End of the pickup window on the travel date, e.g. "08:00–10:00" on
 *  2026-11-01 → 2026-11-01T10:00 local. No slot → 20:00 that day. */
function pickupDue(b: Booking): number {
  if (!b.date) return Infinity;
  const m = b.slot?.match(/[–-](\d{2}):(\d{2})/);
  const hh = m ? Number(m[1]) : 20, mm = m ? Number(m[2]) : 0;
  return new Date(`${b.date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).getTime();
}

const lastEventAt = (b: Booking) => b.events.length ? b.events[b.events.length - 1].at : b.created;
const msAt = (b: Booking, k: MilestoneKey) => opsOf(b).milestones?.[k]?.at;

export function inspect(bookings: Booking[], now = Date.now()): Flag[] {
  const flags: Flag[] = [];
  const add = (b: Booking, f: Omit<Flag, "bookingId" | "client" | "vendorMobile" | "captain" | "lane" | "date" | "slot" | "status">) => {
    const legs = opsOf(b).legs ?? {};
    flags.push({
      ...f, bookingId: b.id,
      client: { name: b.traveller.name, mobile: b.traveller.mobile },
      vendorMobile: legs.linehaul?.mobile ?? legs.pickup?.mobile ?? legs.lastmile?.mobile,
      captain: (b.admin as { captain?: string }).captain,
      lane: `${b.from} → ${b.to}`, date: b.date, slot: b.slot, status: b.status,
    });
  };

  for (const b of bookings) {
    if (["delivered", "cancelled", "rejected"].includes(b.status)) continue;
    const due = pickupDue(b);
    const sinceEvent = hoursSince(lastEventAt(b), now);

    /* SOP 1 — every new booking gets a decision within 2 hours */
    if (["submitted", "revised"].includes(b.status) && !b.quote.breakdown.ror) {
      const age = hoursSince(b.created, now);
      if (age > 2) add(b, {
        rule: "DECISION_OVERDUE", sop: "Every new booking is accepted/revised within 2 hours.",
        severity: age > 6 ? "red" : "amber",
        title: "Awaiting decision", detail: `Submitted ${age.toFixed(0)}h ago and still undecided — accept, revise or reject it.`,
        dept: "bookings", ageH: age - 2,
      });
    }

    /* SOP 2 — rate-on-request gets a quote within 4 hours */
    if (b.quote.breakdown.ror && ["submitted", "quoted", "revised"].includes(b.status) && !isPaid(b)) {
      const age = hoursSince(b.created, now);
      if (age > 4) add(b, {
        rule: "RATE_PENDING", sop: "A rate-on-request booking is priced and quoted within 4 hours.",
        severity: age > 24 ? "red" : "amber",
        title: "Rate not confirmed", detail: `Request is ${age.toFixed(0)}h old with no quote — the client was promised a personal rate call.`,
        dept: "pricing", ageH: age - 4,
      });
    }

    /* SOP 3 — Aadhaar must be verified before the pickup window */
    if (b.pay?.status === "captured" && !b.identity?.ok && due !== Infinity) {
      const hoursToPickup = (due - now) / H;
      if (hoursToPickup < 24) add(b, {
        rule: "IDENTITY_PENDING", sop: "Aadhaar UIDAI verification is completed before pickup (pickup is server-locked without it).",
        severity: hoursToPickup < 6 ? "red" : "amber",
        title: "Aadhaar pending, pickup near",
        detail: hoursToPickup < 0
          ? `Pickup window has passed and identity is still unverified — pickup is locked. Chase the client on /verify/${b.id}.`
          : `Pickup in ${hoursToPickup.toFixed(0)}h and identity is unverified — resend /verify/${b.id} now.`,
        dept: "compliance", ageH: Math.max(0, -hoursToPickup),
      });
    }

    /* SOP 4 — a captain is assigned at least 12 hours before the window */
    if (b.status === "accepted" && due !== Infinity) {
      const hoursToPickup = (due - now) / H;
      if (hoursToPickup < 12) add(b, {
        rule: "NO_CAPTAIN", sop: "A pickup captain is assigned no later than 12 hours before the window.",
        severity: hoursToPickup < 3 ? "red" : "amber",
        title: "No captain assigned",
        detail: `Pickup ${hoursToPickup < 0 ? "window has passed" : `in ${hoursToPickup.toFixed(0)}h`} and no captain is on it.`,
        dept: "ops", ageH: Math.max(0, 12 - hoursToPickup),
      });
    }

    /* SOP 5 — pickup happens inside the promised window */
    if (["assigned", "accepted"].includes(b.status) && due !== Infinity && now > due) {
      const over = (now - due) / H;
      add(b, {
        rule: "PICKUP_OVERDUE", sop: "Bags are collected within the promised pickup window.",
        severity: over > 2 ? "red" : "amber",
        title: "Pickup overdue", detail: `Window ${b.slot || "(none set)"} on ${b.date} ended ${over.toFixed(0)}h ago — not picked up.`,
        dept: "ops", ageH: over,
      });
    }

    /* SOP 6 — milestone chain keeps moving: picked→inscan 6h, depart→arrive 36h, arrive→ofd 12h, ofd→pod 8h */
    const chain: [MilestoneKey, MilestoneKey, number, string, string][] = [
      ["picked", "inscan", 6, "hub", "Sealed bags reach the origin hub and are in-scanned within 6 hours of pickup."],
      ["depart", "arrive", 36, "linehaul", "A departed linehaul arrives and in-scans at destination within 36 hours."],
      ["arrive", "ofd", 12, "lastmile", "Arrived bags go out for delivery within 12 hours."],
      ["ofd", "pod", 8, "lastmile", "Out-for-delivery bags are delivered against POD within 8 hours."],
    ];
    for (const [fromK, toK, sla, dept, sop] of chain) {
      const fromAt = msAt(b, fromK);
      if (fromAt && !msAt(b, toK)) {
        const lag = hoursSince(fromAt, now);
        if (lag > sla) add(b, {
          rule: `LAG_${fromK.toUpperCase()}_${toK.toUpperCase()}`, sop,
          severity: lag > sla * 2 ? "red" : "amber",
          title: `${MILESTONES.find((m) => m.key === toK)?.name} overdue`,
          detail: `${MILESTONES.find((m) => m.key === fromK)?.name} was ${lag.toFixed(0)}h ago — next milestone SLA is ${sla}h.`,
          dept, ageH: lag - sla,
        });
      }
    }

    /* SOP 7 — nothing in motion goes quiet: an event at least every 12 hours */
    if (["picked_up", "in_transit"].includes(b.status) && sinceEvent > 12) {
      add(b, {
        rule: "NO_MOVEMENT", sop: "A moving shipment logs an event (scan/update) at least every 12 hours.",
        severity: sinceEvent > 24 ? "red" : "amber",
        title: "No movement logged", detail: `Last event was ${sinceEvent.toFixed(0)}h ago while status is ${b.status.replace("_", " ")}.`,
        dept: b.status === "picked_up" ? "hub" : "linehaul", ageH: sinceEvent - 12,
      });
    }

    /* SOP 8 — scan-gated milestones carry scans for every tag */
    const o = opsOf(b);
    if (o.tags?.length) {
      for (const m of MILESTONES) {
        if (m.scan && o.milestones?.[m.key] && (o.scans?.[m.key]?.length ?? 0) < o.tags.length) {
          add(b, {
            rule: "SCAN_GAP", sop: "A scan-gated milestone records a scan for EVERY tag — no bag moves uncounted.",
            severity: "red",
            title: `Scan gap at ${m.name}`,
            detail: `${o.scans?.[m.key]?.length ?? 0}/${o.tags.length} tags scanned at ${m.name} — reconcile before the next hand-off.`,
            dept: "hub", ageH: hoursSince(o.milestones[m.key]!.at, now),
          });
          break; // one scan-gap flag per shipment is enough
        }
      }
    }

    /* SOP 9 — open exceptions are resolved within 12 hours */
    for (const ex of o.exceptions ?? []) {
      if (!ex.resolved) {
        const age = hoursSince(ex.at, now);
        if (age > 12) add(b, {
          rule: "EXCEPTION_OPEN", sop: "Every raised exception (held / short / damage / RTO) is resolved or escalated within 12 hours.",
          severity: "red",
          title: `Exception open · ${ex.kind}`, detail: `${ex.kind}${ex.tag ? ` on ${ex.tag}` : ""} raised ${age.toFixed(0)}h ago — ${ex.note || "no note"}.`,
          dept: "ops", ageH: age - 12,
        });
      }
    }
  }

  return flags.sort((a, b) => (a.severity === b.severity ? b.ageH - a.ageH : a.severity === "red" ? -1 : 1));
}
