/** Server-only: issue a booking's LR (and its trip) — shared by the LR page
 *  (POST /api/admin/trips/assign) and, from phase 1, the automation that
 *  issues the LR the moment payment is accepted. Issuing also ticks the
 *  "LR issued" step in Operations, so the booking shows up there as
 *  "To assign pickup". */
import type { SupabaseClient } from "@supabase/supabase-js";
import { financialYear } from "./docs";
import { lrTotals, type LrDetails } from "./lrModel";
import { opsOf } from "./opsModel";
import type { Booking } from "./types";

export const LR_CONFIRMED = ["accepted", "assigned", "picked_up", "in_transit"];

/** The LR step on the ops chain, added when the booking carries an LR. */
export function withLrMilestone(b: Booking, by: string): Booking {
  const o = opsOf(b);
  if (!b.lr || o.milestones?.lr) return b;
  return { ...b, admin: { ...b.admin, ops: { ...o, milestones: { ...o.milestones, lr: { at: b.lr.at, by, note: `LR ${b.lr.no}` } } } } };
}

export type LrResult = { ok: true; booking: Booking } | { ok: false; status: number; error: string; detail?: string };

/** Builds the issued booking (does not save it — the caller saves with CAS). */
export async function buildLr(sb: SupabaseClient, booking: Booking, o: { tripId?: string; lr?: LrDetails; approveDraft?: boolean; by: string; auto?: boolean }): Promise<LrResult> {
  if (!LR_CONFIRMED.includes(booking.status)) return { ok: false, status: 409, error: "NOT_CONFIRMED", detail: `LR is issued only after the booking is confirmed. ${booking.id} is "${booking.status}" — accept it in Shipments first.` };
  if (booking.lr) return { ok: false, status: 409, error: "LR_EXISTS", detail: `${booking.id} already carries LR ${booking.lr.no}.` };
  const draft = (booking.admin as { lrDraft?: { details?: LrDetails } }).lrDraft;
  const lrDetails = o.lr ?? draft?.details;

  let tripId = o.tripId;
  if (!tripId) {
    const { data: tno, error: tErr } = await sb.rpc("next_doc_no", { p_type: "TR", p_fy: financialYear() });
    if (tErr) return { ok: false, status: 500, error: tErr.message };
    tripId = String(tno).replace(/\//g, "-");
    const tripDoc = {
      id: tripId, created: new Date().toISOString(), status: "planned",
      route: `${booking.from} → ${booking.to}`, date: booking.date || new Date().toLocaleDateString("en-CA"),
      vehicle: "", vehicleType: "", driver: "", driverMobile: "", expenses: [], advances: [],
    };
    const { error: tInsErr } = await sb.from("trips").upsert({ id: tripId, doc: tripDoc, status: tripDoc.status, created: tripDoc.created });
    if (tInsErr) return { ok: false, status: 500, error: tInsErr.message };
  }
  const { data: no, error: noErr } = await sb.rpc("next_doc_no", { p_type: "LR", p_fy: financialYear() });
  if (noErr) return { ok: false, status: 500, error: noErr.message };

  const nowIso = new Date().toISOString();
  const { lrDraft: _draft, ...restAdmin } = booking.admin as Record<string, unknown>;
  void _draft;
  const lrAmount = lrTotals(lrDetails, booking.quote.total || 0).total;
  const issued: Booking = {
    ...booking,
    admin: { ...restAdmin, trip: tripId, ...(lrDetails ? { lrDetails } : {}) },
    lr: { no: String(no), at: nowIso, trip: tripId },
    docs: [...(booking.docs ?? []), { type: "LR", no: String(no), at: nowIso, amount: lrAmount }],
    events: [...booking.events, { at: nowIso, by: "admin", text: `${o.auto ? "Payment accepted · LR issued automatically · " : o.approveDraft ? "Auto-drafted LR approved by the team · " : ""}Assigned to trip ${tripId} · LR ${no} issued${lrDetails?.consignee ? ` · consignee ${lrDetails.consignee}` : ""}` }],
  };
  return { ok: true, booking: withLrMilestone(issued, o.by) };
}
