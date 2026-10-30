import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import type { Booking } from "@/lib/types";

/** Post-payment indemnity undertaking. Same shape as /api/verify: the
 *  booking already exists and, by the time this is reachable in the
 *  Wizard, is usually "accepted" (payment verified) — a status
 *  update_booking_customer refuses to touch, by design, since customers
 *  shouldn't be able to edit a confirmed booking through that RPC. This
 *  route runs with the service role instead, with its own narrow check:
 *  only the indemnity field, and only once payment is verified (or there
 *  was nothing to pay — a rate-on-request booking). */
export async function POST(req: Request) {
  let b: { id?: string; idType?: string; idNumber?: string; signature?: string; place?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id || !b.idType || !b.idNumber?.trim() || !b.signature?.trim()) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  if (!["aadhaar", "passport", "licence"].includes(b.idType)) return NextResponse.json({ error: "BAD_ID_TYPE" }, { status: 400 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc = data.doc as Booking;
  if (doc.indemnity) return NextResponse.json({ ok: true, indemnity: doc.indemnity }); // idempotent

  if (doc.pay && doc.pay.status !== "captured") {
    return NextResponse.json({ error: "PAYMENT_NOT_VERIFIED", detail: "Payment must be verified before the undertaking can be signed." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const idType = b.idType as "aadhaar" | "passport" | "licence";
  const idNumber = b.idNumber.trim();
  const signature = b.signature.trim();
  const place = b.place?.trim() || undefined;
  const next: Booking = {
    ...doc,
    indemnity: { acceptedAt: now, idType, idNumber, signature, place },
    events: [...doc.events, { at: now, by: "customer", text: `Indemnity undertaking signed by "${signature}" · ${idType} ${idNumber}${place ? ` · ${place}` : ""}` }],
  };
  const up = await sb.from("bookings").upsert({ id: next.id, doc: next, status: next.status, created: next.created });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, indemnity: next.indemnity });
}
