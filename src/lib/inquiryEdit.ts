/** Quote desk edits — staff correcting an inquiry before (or while) deciding
 *  it. One function, used by both the "save changes" route and the decision
 *  route, so an edit made together with Accept / Revise lands in the same
 *  compare-and-swap write as the decision itself.
 *
 *  Rules:
 *   - only bookings still being decided can change (not paid, not handed to
 *     a partner wallet, no payment proof waiting, not moving)
 *   - route or bag changes re-price on today's rate chart; a lane
 *     that is not on the chart becomes "rate on request"
 *   - a changed price is re-signed (fresh quote id, held 72 hours); an
 *     unchanged price is re-signed under the same quote id and expiry, so
 *     the customer's /q page always matches the bags and route
 *   - partner-wallet and host-billed (wedding) bookings carry a payer and
 *     are confirmed in the Shipments inbox, never priced here
 *   - every change is listed in the event log, "Bags 2 → 3" */
import { cityByName, inr, isChartPriced, quote } from "./pricing";
import { deskLock } from "./deskRules";
import { cleanEmail, cleanMobile } from "./otp";
import { SERVICES, istToday } from "./services";
import { quotePayload, sign } from "./sign";
import { newToken } from "./supabaseAdmin";
import { withAirportAddress } from "./airports";
import type { Masters } from "./pricing";
import type { Booking, UseCase } from "./types";

export { DESK_STATUSES, deskLock } from "./deskRules";

export interface InquiryChanges {
  title?: string; name?: string; mobile?: string; email?: string; res?: "in" | "intl";
  uc?: string; from?: string; to?: string; pickAddr?: string; dropAddr?: string;
  date?: string; pickupDate?: string; deliveryDate?: string; flightTime?: string; ref?: string; slot?: string;
  bags?: number; oversize?: number; note?: string; staffNote?: string;
}

export type EditResult =
  | { ok: true; next: Booking; changed: string[]; priceChanged: boolean; repriced: boolean }
  | { ok: false; error: string; detail: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = (error: string, detail: string): EditResult => ({ ok: false, error, detail });

/** Apply staff changes to a booking. Pure: no database, no messages. */
export function applyInquiryChanges(doc: Booking, c: InquiryChanges, masters: Masters, now = new Date()): EditResult {
  const lock = deskLock(doc);
  if (lock) return fail("LOCKED", lock);

  const next: Booking = { ...doc, traveller: { ...doc.traveller }, admin: { ...doc.admin } };
  const changed: string[] = [];
  const note = (label: string, a: unknown, b: unknown) => changed.push(`${label} ${a === "" || a == null ? "blank" : a} → ${b === "" || b == null ? "blank" : b}`);

  /* ---- customer ---- */
  if (c.title !== undefined && str(c.title, 10) !== (doc.traveller.title ?? "")) { note("Title", doc.traveller.title ?? "", str(c.title, 10)); next.traveller.title = str(c.title, 10); }
  if (c.name !== undefined) {
    const v = str(c.name, 80);
    if (v.length < 2) return fail("BAD_NAME", "Enter the customer's name.");
    if (v !== doc.traveller.name) { note("Name", doc.traveller.name, v); next.traveller.name = v; }
  }
  if (c.mobile !== undefined) {
    const digits = str(c.mobile, 20).replace(/\D/g, "");
    const v = cleanMobile(digits) ?? (digits.length >= 8 && digits.length <= 15 ? digits : null);
    if (!v) return fail("BAD_MOBILE", "Enter a valid mobile number.");
    if (v !== doc.traveller.mobile) { note("Mobile", doc.traveller.mobile, v); next.traveller.mobile = v; }
  }
  if (c.email !== undefined) {
    const raw = str(c.email, 120);
    const v = raw ? cleanEmail(raw) : "";
    if (v === null) return fail("BAD_EMAIL", "Enter a valid email address, or leave it blank.");
    if (v !== (doc.traveller.email ?? "")) { note("Email", doc.traveller.email ?? "", v); next.traveller.email = v; }
  }
  if (c.res !== undefined) {
    if (c.res !== "in" && c.res !== "intl") return fail("BAD_RESIDENCY", "Choose Indian resident or international.");
    if (c.res !== (doc.traveller.res ?? "in")) { note("Traveller", doc.traveller.res === "intl" ? "international" : "Indian resident", c.res === "intl" ? "international" : "Indian resident"); next.traveller.res = c.res; }
  }

  /* ---- service and route ---- */
  if (c.uc !== undefined && c.uc !== doc.uc) {
    const svc = SERVICES.find((s) => s.uc === c.uc);
    if (!svc) return fail("BAD_SERVICE", "Choose a service.");
    note("Service", doc.ucName || doc.uc, svc.title);
    next.uc = svc.uc as UseCase; next.ucName = svc.title; next.mode = svc.mode;
  }
  if (c.from !== undefined) {
    const v = str(c.from, 60);
    if (!v) return fail("MISSING_FIELDS", "Enter the pickup city.");
    if (v !== doc.from) { note("Pickup city", doc.from, v); next.from = v; }
  }
  if (c.to !== undefined) {
    const v = str(c.to, 60);
    if (!v) return fail("MISSING_FIELDS", "Enter the delivery city.");
    if (v !== doc.to) { note("Delivery city", doc.to, v); next.to = v; }
  }
  if (next.from.toLowerCase() === next.to.toLowerCase()) return fail("SAME_CITY", "Pickup and delivery cities must be different.");
  if (c.pickAddr !== undefined && str(c.pickAddr, 200) !== doc.pickAddr) next.pickAddr = str(c.pickAddr, 200);
  if (c.dropAddr !== undefined && str(c.dropAddr, 200) !== doc.dropAddr) next.dropAddr = str(c.dropAddr, 200);
  /* the airport end of an air service always names that city's airport */
  const routeMoved = next.from !== doc.from || next.to !== doc.to || next.uc !== doc.uc;
  const addr = withAirportAddress(next.uc, next.from, next.to,
    routeMoved && c.pickAddr === undefined ? "" : next.pickAddr, routeMoved && c.dropAddr === undefined ? "" : next.dropAddr, masters.cities);
  next.pickAddr = addr.pickAddr; next.dropAddr = addr.dropAddr;
  if (next.pickAddr !== doc.pickAddr) note("Pickup address", doc.pickAddr, next.pickAddr);
  if (next.dropAddr !== doc.dropAddr) note("Delivery address", doc.dropAddr, next.dropAddr);

  /* ---- dates, flight, slot ---- */
  if (c.date !== undefined) {
    const v = str(c.date, 10);
    if (!DAY.test(v)) return fail("BAD_DATE", "Enter the travel date.");
    if (v !== doc.date && v < istToday()) return fail("BAD_DATE", "The travel date can't be in the past.");
    if (v !== doc.date) { note("Travel date", doc.date, v); next.date = v; }
  }
  if (c.pickupDate !== undefined) {
    const v = str(c.pickupDate, 10) || next.date;
    if (!DAY.test(v)) return fail("BAD_DATE", "Enter the pickup date.");
    if (v !== (doc.pickupDate ?? doc.date) && v < istToday()) return fail("BAD_DATE", "The pickup date can't be in the past.");
    if (v !== (doc.pickupDate ?? doc.date)) { note("Pickup date", doc.pickupDate ?? doc.date, v); }
    next.pickupDate = v;
  }
  if (c.deliveryDate !== undefined) {
    const v = str(c.deliveryDate, 10);
    if (v && !DAY.test(v)) return fail("BAD_DATE", "Enter a valid delivery date, or leave it blank.");
    if (v && v < (next.pickupDate || next.date)) return fail("BAD_DATE", "Delivery can't be before pickup.");
    if (v !== (doc.deliveryDate ?? "")) { note("Delivery date", doc.deliveryDate ?? "", v); next.deliveryDate = v || null; }
  }
  if (c.flightTime !== undefined) {
    const v = str(c.flightTime, 5);
    if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return fail("BAD_TIME", "Enter the time as HH:MM.");
    if (v !== (doc.flightTime ?? "")) { note("Flight time", doc.flightTime ?? "", v); next.flightTime = v || null; }
  }
  if (c.ref !== undefined) {
    const v = str(c.ref, 20).toUpperCase();
    if (v !== doc.ref) { note("Flight / reference", doc.ref, v); next.ref = v; }
  }
  if (c.slot !== undefined) {
    const v = str(c.slot, 40);
    if (v !== doc.slot) { note("Pickup time", doc.slot, v); next.slot = v; }
  }

  /* ---- pieces ---- */
  const whole = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
  if (c.bags !== undefined) {
    const v = whole(c.bags, 0, 50);
    if (v === null) return fail("BAD_BAGS", "Bags must be a whole number from 0 to 50.");
    if (v !== doc.bags) { note("Bags", doc.bags, v); next.bags = v; }
  }
  if (c.oversize !== undefined) {
    const v = whole(c.oversize, 0, 20);
    if (v === null) return fail("BAD_BAGS", "Oversize must be a whole number from 0 to 20.");
    if (v !== doc.oversize) { note("Oversize", doc.oversize, v); next.oversize = v; }
  }
  if (next.bags + next.oversize < 1) return fail("NO_BAGS", "A booking needs at least one bag.");

  /* ---- notes ---- */
  if (c.note !== undefined && str(c.note, 300) !== doc.note) { note("Customer note", doc.note, str(c.note, 300)); next.note = str(c.note, 300); }
  if (c.staffNote !== undefined) {
    const v = str(c.staffNote, 500), was = (doc.admin as { staffNote?: string }).staffNote ?? "";
    if (v !== was) { changed.push(`Internal note: ${v || "cleared"}`); next.admin = { ...next.admin, staffNote: v }; }
  }

  /* ---- price ---- */
  const fc = cityByName(next.from, masters.cities), tc = cityByName(next.to, masters.cities);
  next.zo = fc?.zone ?? ""; next.zd = tc?.zone ?? "";
  const signedMoved = next.from !== doc.from || next.to !== doc.to || next.bags !== doc.bags || next.oversize !== doc.oversize;
  /* the chart prices by lane, bags and oversize only (pricing.ts quote()) —
   * a date or service change alone never moves a team-set price */
  let priceChanged = false, repriced = false;
  if (signedMoved) {
    repriced = true;
    const q = quote({ fromName: next.from, toName: next.to, bags: next.bags, oversize: next.oversize, mode: next.mode, date: next.date }, masters);
    const wasTotal = doc.quote.breakdown?.ror ? null : doc.quote.total;
    if (isChartPriced(q)) {
      next.billed = q.billed;
      priceChanged = q.total !== wasTotal;
      const qid = priceChanged || !doc.quote.qid ? newToken("QT", 6) : doc.quote.qid;
      const validUntil = priceChanged || !doc.quote.validUntil ? new Date(now.getTime() + 72 * 3600 * 1000).toISOString() : doc.quote.validUntil;
      next.quote = { qid, total: q.total, breakdown: q, validUntil,
        signature: sign(quotePayload({ qid, fromName: next.from, toName: next.to, bags: next.bags, oversize: next.oversize, total: q.total, validUntil })) };
    } else {
      next.billed = Math.max(next.bags + next.oversize, 1);
      priceChanged = wasTotal !== null;
      next.quote = { qid: null, total: 0, breakdown: { ror: true } };
    }
    if (priceChanged) changed.push(`Price ${wasTotal === null ? "rate on request" : inr(wasTotal)} → ${next.quote.breakdown.ror ? "rate on request (lane not on the chart)" : `${inr(next.quote.total)} (rate chart)`}`);
  }

  return { ok: true, next, changed, priceChanged, repriced };
}
