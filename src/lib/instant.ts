/** Instant booking — the one eligibility rule, shared by the website, the
 *  partner desk, the server and the Pricing engine's calendar preview, so
 *  what staff see in the calendar is exactly what customers get.
 *
 *  A booking is instant (auto-approved; confirmed the moment it is paid)
 *  only when ALL of these hold:
 *    · the route is on the rate chart and has instant booking switched on;
 *    · the pickup date is at least `minNoticeDays` away (IST calendar days);
 *    · the date is inside the route's active window, not a blackout date,
 *      and on an allowed weekday;
 *    · the bag count is within the route's limit (and oversize is allowed
 *      when the booking has oversize pieces);
 *    · the route's daily instant capacity for that date isn't used up.
 *  Anything else goes through team approval exactly as before. */
import type { Booking, InstantRule, RouteRate } from "./types";

export interface InstantDefaults { minNoticeDays: number; holdMinutes: number }
export const DEFAULT_INSTANT: InstantDefaults = { minNoticeDays: 5, holdMinutes: 30 };

export type InstantCode = "OFF" | "NOTICE" | "BEFORE_WINDOW" | "AFTER_WINDOW" | "BLACKOUT" | "WEEKDAY" | "TOO_MANY_BAGS" | "OVERSIZE" | "FULL" | "NO_DATE";
export type InstantResult = { ok: true } | { ok: false; code: InstantCode; reason: string };

const DAY = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** Whole calendar days from `from` to `to` (YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);
export const addDays = (d: string, n: number) => new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
export const weekdayOf = (d: string) => new Date(utc(d)).getUTCDay();
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const isoDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const noticeDays = (rule: InstantRule | null | undefined, d: InstantDefaults) => rule?.minNoticeDays ?? d.minNoticeDays;

/** Date-only checks (no bags, no capacity) — used by the calendar too. */
export function instantDateCheck(rule: InstantRule | null | undefined, date: string, today: string, d: InstantDefaults): InstantResult {
  if (!rule?.enabled) return { ok: false, code: "OFF", reason: "Instant booking is off for this route." };
  if (!isoDate(date)) return { ok: false, code: "NO_DATE", reason: "No pickup date." };
  const need = noticeDays(rule, d);
  const lead = daysBetween(today, date);
  if (lead < need) return { ok: false, code: "NOTICE", reason: `Instant confirmation needs ${need} days' notice — this pickup is ${lead} day${lead === 1 ? "" : "s"} away.` };
  if (rule.from && date < rule.from) return { ok: false, code: "BEFORE_WINDOW", reason: `Instant booking on this route opens from ${rule.from}.` };
  if (rule.to && date > rule.to) return { ok: false, code: "AFTER_WINDOW", reason: `Instant booking on this route runs until ${rule.to}.` };
  if ((rule.blackout ?? []).includes(date)) return { ok: false, code: "BLACKOUT", reason: `${date} is closed for instant booking.` };
  if (rule.weekdays?.length && !rule.weekdays.includes(weekdayOf(date))) return { ok: false, code: "WEEKDAY", reason: `Instant booking runs on ${rule.weekdays.map((w) => WEEKDAYS[w]).join(", ")} only.` };
  return { ok: true };
}

/** The full check for one booking. `taken` = instant bookings already
 *  holding a place on this route and pickup date. */
export function instantCheck(route: RouteRate | undefined, req: { date: string; bags: number; oversize: number }, today: string, d: InstantDefaults, taken: number): InstantResult {
  const rule = route?.instant;
  const dated = instantDateCheck(rule, req.date, today, d);
  if (!dated.ok) return dated;
  if (rule!.maxBags && req.bags + req.oversize > rule!.maxBags) return { ok: false, code: "TOO_MANY_BAGS", reason: `Instant booking covers up to ${rule!.maxBags} bags on this route.` };
  if (req.oversize > 0 && !rule!.allowOversize) return { ok: false, code: "OVERSIZE", reason: "Bookings with oversize pieces are confirmed by our team." };
  if (rule!.dailyCap && taken >= rule!.dailyCap) return { ok: false, code: "FULL", reason: "Instant places for this date are taken — our team will confirm your booking." };
  return { ok: true };
}

/** Does this booking hold an instant place (paid, or still inside its hold)? */
export function holdsInstantPlace(b: Booking, nowMs: number): boolean {
  const i = (b.admin as { instant?: { holdUntil?: string; expired?: boolean } }).instant;
  if (!i || i.expired || ["cancelled", "rejected"].includes(b.status)) return false;
  return b.pay?.status === "captured" || b.pay?.status === "submitted" || !!b.payer || (!!i.holdUntil && Date.parse(i.holdUntil) > nowMs);
}

const norm = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").trim();
/** Same route test as pricing.routeFor (direction-aware). */
export function onRoute(b: Pick<Booking, "from" | "to">, r: RouteRate): boolean {
  const f = norm(b.from), t = norm(b.to), a = norm(r.from), z = norm(r.to);
  return (a === f && z === t) || (r.dir === "both" && a === t && z === f);
}

/** Instant places taken per pickup date on a route. */
export function instantTaken(bookings: Booking[], r: RouteRate, nowMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bookings) {
    if (!onRoute(b, r) || !holdsInstantPlace(b, nowMs)) continue;
    const day = b.pickupDate || b.date;
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

export type CalendarState = "open" | "notice" | "outside" | "blackout" | "weekday" | "full" | "off";
/** The next `days` days for the Pricing engine's calendar preview. */
export function instantCalendar(rule: InstantRule | null | undefined, today: string, d: InstantDefaults, taken: Record<string, number>, days = 42): { date: string; state: CalendarState; taken: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    const c = instantDateCheck(rule, date, today, d);
    const n = taken[date] ?? 0;
    let state: CalendarState = "open";
    if (!c.ok) state = c.code === "OFF" ? "off" : c.code === "NOTICE" ? "notice" : c.code === "BLACKOUT" ? "blackout" : c.code === "WEEKDAY" ? "weekday" : "outside";
    else if (rule?.dailyCap && n >= rule.dailyCap) state = "full";
    return { date, state, taken: n };
  });
}
