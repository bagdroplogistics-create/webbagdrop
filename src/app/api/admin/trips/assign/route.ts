import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { financialYear } from "@/lib/docs";
import { lrTotals, type LrDetails } from "@/lib/lrModel";
import type { Booking } from "@/lib/types";

/** LR is a transport document — it exists only for CONFIRMED bookings.
 *  "submitted" (undecided) is deliberately NOT eligible: accept the booking
 *  in the Shipments inbox first, then it appears on the LR page. */
const CONFIRMED = ["accepted", "assigned", "picked_up", "in_transit"];

/** Assigns a booking to a trip and issues its LR number in one step —
 *  the static build split these into two clicks; combined here since the
 *  intermediate "assigned but no LR yet" state had no distinct behaviour.
 *  Optional `lr` details (pre-filled from the booking, editable on the LR
 *  page) are stored on the booking and rendered on the LR document. */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { bookingId?: string; tripId?: string; lr?: LrDetails; autoTrip?: boolean; approveDraft?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.bookingId || (!b.tripId && !b.autoTrip)) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: row, error: getErr } = await sb.from("bookings").select("doc").eq("id", b.bookingId).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  const booking = row.doc as Booking;
  if (!CONFIRMED.includes(booking.status)) {
    return NextResponse.json({
      error: "NOT_CONFIRMED",
      detail: `LR is issued only after the booking is confirmed. ${booking.id} is "${booking.status}" — accept it in Shipments first.`,
    }, { status: 409 });
  }
  if (booking.lr) return NextResponse.json({ error: "LR_EXISTS", detail: `${booking.id} already carries LR ${booking.lr.no}.` }, { status: 409 });

  /* approving an auto-draft: its pre-filled details are the LR, unless the
   * team edited them (an explicit b.lr wins) */
  const draft = (booking.admin as { lrDraft?: { details?: LrDetails } }).lrDraft;
  const lrDetails = b.lr ?? draft?.details;

  /* no trip picked → make one on the booking's own lane and dispatch date */
  let tripId = b.tripId;
  if (!tripId) {
    const { data: tno, error: tErr } = await sb.rpc("next_doc_no", { p_type: "TR", p_fy: financialYear() });
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    tripId = String(tno).replace(/\//g, "-");
    const tripDoc = {
      id: tripId, created: new Date().toISOString(), status: "planned",
      route: `${booking.from} → ${booking.to}`, date: booking.date || new Date().toLocaleDateString("en-CA"),
      vehicle: "", vehicleType: "", driver: "", driverMobile: "", expenses: [], advances: [],
    };
    const { error: tInsErr } = await sb.from("trips").upsert({ id: tripId, doc: tripDoc, status: tripDoc.status, created: tripDoc.created });
    if (tInsErr) return NextResponse.json({ error: tInsErr.message }, { status: 500 });
  }

  const { data: no, error: noErr } = await sb.rpc("next_doc_no", { p_type: "LR", p_fy: financialYear() });
  if (noErr) return NextResponse.json({ error: noErr.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  const { lrDraft: _draft, ...restAdmin } = booking.admin as Record<string, unknown>;
  void _draft;
  /* the LR's own total: the entered charge heads + CGST/SGST 2.5%, falling
   * back to the booking's GST-inclusive quote total when none entered */
  const lrAmount = lrTotals(lrDetails, booking.quote.total || 0).total;
  const updated: Booking = {
    ...booking,
    admin: { ...restAdmin, trip: tripId, ...(lrDetails ? { lrDetails } : {}) },
    lr: { no: String(no), at: nowIso, trip: tripId },
    docs: [...(booking.docs ?? []), { type: "LR", no: String(no), at: nowIso, amount: lrAmount }],
    events: [...booking.events, { at: nowIso, by: "admin", text: `${b.approveDraft ? "Auto-drafted LR approved by the team · " : ""}Assigned to trip ${tripId} · LR ${no} issued${lrDetails?.consignee ? ` · consignee ${lrDetails.consignee}` : ""}` }],
  };
  const { error } = await sb.from("bookings").upsert({ id: updated.id, doc: updated, status: updated.status, created: updated.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: updated });
}

/** Unassign — drop the trip link so the booking can be re-assigned. The LR
 *  number itself is left on the booking's docs[] history (it was issued and
 *  stays issued; only the trip linkage is removed). */
export async function DELETE(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { bookingId?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.bookingId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: row, error: getErr } = await sb.from("bookings").select("doc").eq("id", b.bookingId).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  const booking = row.doc as Booking;

  const { trip: _trip, ...restAdmin } = booking.admin as Record<string, unknown>;
  void _trip;
  const nowIso = new Date().toISOString();
  const updated: Booking = {
    ...booking, admin: restAdmin,
    events: [...booking.events, { at: nowIso, by: "admin", text: "Unassigned from trip" }],
  };
  const { error } = await sb.from("bookings").upsert({ id: updated.id, doc: updated, status: updated.status, created: updated.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: updated });
}
