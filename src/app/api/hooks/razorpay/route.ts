import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/razorpay";
import { serviceClient } from "@/lib/supabaseAdmin";
import { kickSweep } from "@/lib/automation";
import type { Booking } from "@/lib/types";

/** Razorpay webhook — the only authority that marks a gateway payment as
 *  captured. Signature-verified, idempotent (a replay finds the booking
 *  already paid and does nothing). Amount invariant: the captured amount
 *  must equal the booking's signed quote total — a mismatch aborts loudly
 *  and changes nothing. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhook(raw, sig)) return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });

  let evt: { event?: string; payload?: { payment?: { entity?: { id?: string; amount?: number; order_id?: string; notes?: { bookingId?: string } } } } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (evt.event !== "payment.captured") return NextResponse.json({ ok: true, ignored: evt.event });

  const p = evt.payload?.payment?.entity;
  const bookingId = p?.notes?.bookingId;
  if (!p?.id || !bookingId) return NextResponse.json({ error: "MISSING_REF" }, { status: 400 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data } = await sb.from("bookings").select("doc").eq("id", bookingId).maybeSingle();
  if (!data) return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });

  const b = data.doc as Booking;
  if (b.pay) return NextResponse.json({ ok: true, already: true });           // idempotent replay
  const amountInr = Math.round((p.amount ?? 0) / 100);
  if (amountInr !== Math.round(b.quote.total)) {
    return NextResponse.json({ error: "AMOUNT_MISMATCH", expected: b.quote.total, got: amountInr }, { status: 409 });
  }

  const now = new Date().toISOString();
  const doc: Booking = {
    ...b, status: b.status === "quoted" || b.status === "submitted" ? "submitted" : b.status,
    pay: { mode: "full", amount: amountInr, status: "captured", gateway: "Razorpay", at: now },
    events: [...b.events, { at: now, by: "customer", text: `Razorpay captured ₹${amountInr.toLocaleString("en-IN")} · ${p.id}` }],
  };
  const { error } = await sb.from("bookings").upsert({ id: doc.id, doc, status: doc.status, created: doc.created });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  kickSweep();                                                               // receipt + invoice pair goes out now
  return NextResponse.json({ ok: true });
}
