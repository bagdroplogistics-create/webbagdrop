/** Flight/train/sailing-time-aware pickup planning — ported from the
 *  admin team-quote form's travelPlan() (admin.js ~L722-787), which is the
 *  ONLY place in the original static build that actually computed pickup
 *  windows from a departure/arrival time. The customer-facing booking.js
 *  showed the same generic fixed slot list with no time awareness at all
 *  (its "your flight sets the cutoff" copy was aspirational, not real) —
 *  this applies the admin form's real logic to the customer wizard too. */
import type { Mode } from "./types";

function to12h(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60), m = totalMin % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Specific pickup times, 30-minute increments, 06:00–20:00 — operating
 *  hours match the original's 06:00–20:00 window, just at finer
 *  granularity (a dropdown of exact times rather than 6 broad 2h windows). */
export const SLOTS: { label: string; startMin: number }[] = (() => {
  const out: { label: string; startMin: number }[] = [];
  for (let m = 6 * 60; m <= 20 * 60; m += 30) out.push({ label: to12h(m), startMin: m });
  return out;
})();

/** Counter cutoff, in hours before departure/sailing — 4h air, 1.5h rail, 3h sea. */
const CUTOFF_HOURS: Partial<Record<Mode, number>> = { air: 4, rail: 1.5, sea: 3 };
/** Minutes after an arriving flight/train/sailing the driver meets the carousel. */
const CAROUSEL_MIN = 35;

/** "HH:MM" + a signed minute offset -> "HH:MM" (+ " (day before)"/" (next day)" if it crosses midnight). */
export function hhmm(time: string, deltaMin: number): string {
  const [h, m] = time.split(":").map(Number);
  let tot = h * 60 + m + deltaMin;
  const day = Math.floor(tot / 1440);
  tot = ((tot % 1440) + 1440) % 1440;
  const hh = String(Math.floor(tot / 60)).padStart(2, "0");
  const mm = String(tot % 60).padStart(2, "0");
  return `${hh}:${mm}${day < 0 ? " (day before)" : day > 0 ? " (next day)" : ""}`;
}

/** Latest slot that still lands bags ~2h before the counter cutoff time. null if none fit. */
export function slotFor(counterHHMM: string): string | null {
  if (counterHHMM.includes("day before")) return null;
  const [h, m] = counterHHMM.split(":").map(Number);
  const cutoffMin = h * 60 + m - 120;
  const ok = SLOTS.filter((s) => s.startMin <= cutoffMin);
  return ok.length ? ok[ok.length - 1].label : null;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface TravelPlan {
  counter: string | null; // when bags must be at the counter (departing) — null if not applicable
  carousel: string | null; // when the driver meets the traveller (arriving) — null if not applicable
  suggestedPickupDate: string | null;
  suggestedSlot: string | null;
  cutoffNote: string;
  usesFlightTime: boolean; // false for road (uc d2d/h2h) — no departure time applies
  dateShifted: boolean; // true when pickup had to move to the evening before
}

/** `arriving` = true for airport/station/terminal -> home (a2d-style); false for
 *  home -> airport/station/terminal (d2a-style, or any other outbound leg). */
export function computeTravelPlan(mode: Mode, arriving: boolean, date: string, time: string): TravelPlan {
  const usesFlightTime = mode === "air" || mode === "rail" || mode === "sea";
  if (!usesFlightTime) {
    return { counter: null, carousel: null, suggestedPickupDate: date || null, suggestedSlot: null, cutoffNote: "—", usesFlightTime, dateShifted: false };
  }
  if (!time) {
    return { counter: null, carousel: null, suggestedPickupDate: date || null, suggestedSlot: null, cutoffNote: "Set the time — the cutoff computes from it.", usesFlightTime, dateShifted: false };
  }

  const cutoffHours = CUTOFF_HOURS[mode] ?? 4;
  const counter = hhmm(time, -cutoffHours * 60);
  const carousel = hhmm(time, CAROUSEL_MIN);

  if (arriving) {
    return {
      counter: null, carousel, suggestedPickupDate: date || null, suggestedSlot: null,
      cutoffNote: `Driver at the carousel by ${carousel}`, usesFlightTime, dateShifted: false,
    };
  }

  const prevDay = counter.includes("day before");
  let suggestedSlot = slotFor(counter);
  let suggestedPickupDate = date;
  let dateShifted = false;
  if (prevDay || !suggestedSlot) {
    // Counter time is too early (or past midnight) for any same-day window — pick up the evening before.
    dateShifted = true;
    suggestedPickupDate = date ? shiftDate(date, -1) : "";
    suggestedSlot = suggestedSlot && prevDay ? suggestedSlot : SLOTS[SLOTS.length - 1].label;
  }

  return {
    counter, carousel: null, suggestedPickupDate: suggestedPickupDate || null, suggestedSlot,
    cutoffNote: `Bags at the counter by ${counter} (${cutoffHours}h before)`, usesFlightTime, dateShifted,
  };
}

/** A slot is only offered if bags picked up at its START time can still reach
 *  the counter by the cutoff with the same ~2h buffer travelPlan uses —
 *  i.e. its start is at or before the same feasibility line slotFor checks.
 *  Once the pickup date has shifted to the evening before (dateShifted),
 *  every slot on that earlier day is fine — the within-day cutoff math
 *  only applies to same-day pickup. */
export function isSlotFeasible(slotLabel: string, plan: TravelPlan, pickupDate: string): boolean {
  if (!plan.usesFlightTime || !plan.counter || plan.counter.includes("day before") || plan.dateShifted) return true;
  if (!plan.suggestedPickupDate || pickupDate !== plan.suggestedPickupDate) return true;
  const slot = SLOTS.find((s) => s.label === slotLabel);
  if (!slot) return true;
  const [h, m] = plan.counter.replace(/\s*\(.*\)$/, "").split(":").map(Number);
  const cutoffMin = h * 60 + m - 120;
  return slot.startMin <= cutoffMin;
}
