import { NextResponse } from "next/server";
import { kickSweep } from "@/lib/automation";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { opsOf } from "@/lib/opsModel";
import { isPaid } from "@/lib/payState";
import { saveBooking } from "@/lib/bookingStore";
import type { Booking } from "@/lib/types";

/** True once the shipment has physically moved — the point of no return the
 *  identity gate protects. */
const MOVED: Booking["status"][] = ["picked_up", "in_transit", "delivered"];
const crossedPickup = (b: Booking) => MOVED.includes(b.status) || !!opsOf(b).milestones?.picked;
const DISPATCHED: Booking["status"][] = ["assigned", ...MOVED];

/** Admin reads/writes ALL bookings with the SERVICE ROLE key — this is the
 *  only place in the app that key is used, it never reaches the browser,
 *  and every request here is gated by the admin session cookie (see
 *  src/lib/adminAuth.ts). This is what makes it safe to have removed the
 *  old "anon can select every booking" policy from the database. */

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").order("created", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: (data ?? []).map((r) => r.doc as Booking) });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let body: { doc?: Booking; overrideIdentityGate?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!body.doc?.id) return NextResponse.json({ error: "MISSING_DOC" }, { status: 400 });

  /* THE PAYMENT GATE — a booking may not get a captain or move until money is
   * settled: payment verified by finance, a partner wallet/credit capture,
   * or a host-billed event. Only the transition is checked, so records that
   * were already past it are left alone. */
  const settled = (b: Booking) => isPaid(b) || !!b.payer;
  if (DISPATCHED.includes(body.doc.status) && !settled(body.doc)) {
    const prev = await sb.from("bookings").select("doc").eq("id", body.doc.id).maybeSingle();
    const was = prev.data?.doc as Booking | undefined;
    if (!was || !DISPATCHED.includes(was.status)) {
      return NextResponse.json({
        error: "PAYMENT_NOT_VERIFIED",
        detail: `Payment for ${body.doc.id} is not verified yet — verify it in Finance → Payments to verify before assigning a captain.`,
      }, { status: 409 });
    }
  }

  /* THE PICKUP GATE — a booking may not cross into picked_up (status or ops
   * milestone) until the client's Aadhaar UIDAI verification is done. An
   * explicit admin override is possible but is stamped on the record. */
  if (!body.doc.identity?.ok && crossedPickup(body.doc)) {
    const prev = await sb.from("bookings").select("doc").eq("id", body.doc.id).maybeSingle();
    const was = prev.data?.doc as Booking | undefined;
    if (!was || !crossedPickup(was)) {
      if (!body.overrideIdentityGate) {
        return NextResponse.json({
          error: "IDENTITY_NOT_VERIFIED",
          detail: `Aadhaar verification pending for ${body.doc.id}. Send the client /verify/${body.doc.id} — pickup unlocks the moment UIDAI OTP is done.`,
          verifyLink: `/verify/${body.doc.id}`,
        }, { status: 409 });
      }
      body.doc = {
        ...body.doc,
        events: [...body.doc.events, { at: new Date().toISOString(), by: "admin", text: "⚠ Identity gate OVERRIDDEN by admin — picked up without Aadhaar verification" }],
      };
    }
  }

  /* compare-and-swap against the revision this screen loaded — a payment
   * verification or client edit made since is never silently overwritten */
  const sv = await saveBooking(sb, body.doc);
  if (sv.conflict) {
    return NextResponse.json({
      error: "STALE",
      detail: `${body.doc.id} changed since your screen loaded (a payment, client or team update). It has refreshed — please redo the action.`,
    }, { status: 409 });
  }
  if (sv.error) return NextResponse.json({ error: sv.error.message }, { status: 500 });
  kickSweep();
  return NextResponse.json({ ok: true, booking: body.doc });
}
