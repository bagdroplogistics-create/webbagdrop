import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { LrDetails } from "@/lib/lrModel";
import { buildLr } from "@/lib/lrIssue";
import type { Booking } from "@/lib/types";

/** LR is a transport document — it exists only for CONFIRMED bookings
 *  (rules in src/lib/lrIssue.ts). */
/** Assigns a booking to a trip and issues its LR number in one step —
 *  the static build split these into two clicks; combined here since the
 *  intermediate "assigned but no LR yet" state had no distinct behaviour.
 *  Optional `lr` details (pre-filled from the booking, editable on the LR
 *  page) are stored on the booking and rendered on the LR document. */
async function handlePOST(req: Request) {
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
  const r = await buildLr(sb, booking, { tripId: b.tripId, lr: b.lr, approveDraft: b.approveDraft, by: "LR desk" });
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.detail ? { detail: r.detail } : {}) }, { status: r.status });
  const updated = r.booking;
  const { error } = await saveOrThrow(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: updated });
}

/** Unassign — drop the trip link so the booking can be re-assigned. The LR
 *  number itself is left on the booking's docs[] history (it was issued and
 *  stays issued; only the trip linkage is removed). */
async function handleDELETE(req: Request) {
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
  const { error } = await saveOrThrow(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: updated });
}

export const POST = retryOnConflict(handlePOST);
export const DELETE = retryOnConflict(handleDELETE);
