import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { serviceClient } from "@/lib/supabaseAdmin";
import { financialYear } from "@/lib/docs";
import type { Booking, DocType } from "@/lib/types";

/** Generates one of the Finance module's documents against a booking —
 *  Proforma invoice (PI), Tax invoice (INV), Payment receipt (RCT), or
 *  Cash receipt (CSH, which can also BE the payment — see below). Each
 *  gets a real race-safe number from the database's next_doc_no().
 *  Not yet ported: Credit voucher / GST credit note / e-invoice IRP
 *  posting — those were print-only or download-only in the static build
 *  too, so nothing functional is lost, just the document templates. */
interface DocRequest { bookingId: string; type: DocType; amount?: number }

export async function POST(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let b: DocRequest;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.bookingId || !b.type) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  const { data: row, error: getErr } = await sb.from("bookings").select("doc").eq("id", b.bookingId).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  let booking = row.doc as Booking;

  const { data: no, error: noErr } = await sb.rpc("next_doc_no", { p_type: b.type, p_fy: financialYear() });
  if (noErr) return NextResponse.json({ error: noErr.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  let amount = b.amount ?? booking.pay?.amount ?? booking.quote.total;
  let events = booking.events;

  if (b.type === "CSH" && !booking.pay) {
    // A cash receipt with no prior payment captured IS the payment.
    amount = b.amount ?? booking.quote.total;
    booking = {
      ...booking,
      status: booking.status === "quoted" || booking.status === "identified" ? "submitted" : booking.status,
      pay: { mode: "cash", amount, status: "captured", gateway: "Cash", at: nowIso },
    };
    events = [...events, { at: nowIso, by: "admin", text: `Cash payment of ₹${amount.toLocaleString("en-IN")} recorded` }];
  }

  const updated: Booking = {
    ...booking,
    docs: [...(booking.docs ?? []), { type: b.type, no: String(no), at: nowIso, amount }],
    events: [...events, { at: nowIso, by: "admin", text: `${b.type} ${no} generated` }],
  };
  const { error } = await sb.from("bookings").upsert({ id: updated.id, doc: updated, status: updated.status, created: updated.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, booking: updated, docNo: String(no) });
}
