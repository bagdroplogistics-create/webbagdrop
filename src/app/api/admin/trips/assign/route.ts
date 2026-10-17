import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { financialYear } from "@/lib/docs";
import type { Booking } from "@/lib/types";

const ELIGIBLE = ["submitted", "accepted", "assigned", "picked_up", "in_transit"];

/** Assigns a booking to a trip and issues its LR number in one step —
 *  the static build split these into two clicks; combined here since the
 *  intermediate "assigned but no LR yet" state had no distinct behaviour. */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: { bookingId?: string; tripId?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.bookingId || !b.tripId) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: row, error: getErr } = await sb.from("bookings").select("doc").eq("id", b.bookingId).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  const booking = row.doc as Booking;
  if (!ELIGIBLE.includes(booking.status)) return NextResponse.json({ error: "NOT_ELIGIBLE" }, { status: 409 });

  const { data: no, error: noErr } = await sb.rpc("next_doc_no", { p_type: "LR", p_fy: financialYear() });
  if (noErr) return NextResponse.json({ error: noErr.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  const updated: Booking = {
    ...booking,
    admin: { ...booking.admin, trip: b.tripId },
    lr: { no: String(no), at: nowIso, trip: b.tripId },
    docs: [...(booking.docs ?? []), { type: "LR", no: String(no), at: nowIso, amount: booking.quote.total }],
    events: [...booking.events, { at: nowIso, by: "admin", text: `Assigned to trip ${b.tripId} · LR ${no} issued` }],
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
