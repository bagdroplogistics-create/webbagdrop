import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/automation";
import { inr } from "@/lib/pricing";
import type { Booking } from "@/lib/types";

/** Internal inquiry alert — fires once a customer verifies their contact
 *  by OTP and the booking inquiry is created. Always goes to BOTH of
 *  Bagdrop's own inboxes (not the customer), regardless of the single
 *  configurable "ops" alert contact in Automation settings. Idempotent on
 *  booking.admin.inquiryNotified so a retry or a second call never
 *  double-sends. */
const INTERNAL_RECIPIENTS = ["info@bagdrop.co", "aditya@bagdrop.co"];

export async function POST(req: Request) {
  let b: { id?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const doc = data.doc as Booking;
  if ((doc.admin as { inquiryNotified?: boolean }).inquiryNotified) return NextResponse.json({ ok: true }); // idempotent

  const ror = !!doc.quote.breakdown.ror;
  const subject = `New inquiry · ${doc.id} · ${doc.from} → ${doc.to}`;
  const lines = [
    `Reference: ${doc.id}`,
    `Traveller: ${doc.traveller.name} · ${doc.traveller.mobile}${doc.traveller.email ? ` · ${doc.traveller.email}` : ""}`,
    `Route: ${doc.from} → ${doc.to} (${doc.uc})`,
    `Pickup: ${doc.pickAddr || "—"}`,
    `Delivery: ${doc.dropAddr || "—"}`,
    `Date: ${doc.date}${doc.ref ? ` · ${doc.ref}` : ""} · slot ${doc.slot || "—"}`,
    `Bags: ${doc.bags} + ${doc.oversize} oversize`,
    ror ? "Price: rate on request — team to call with the rate" : `Price: ${inr(doc.quote.total)} (signed quote ${doc.quote.qid ?? "—"})`,
    doc.note ? `Note: ${doc.note}` : "",
  ].filter(Boolean);
  const text = lines.join("\n");

  await Promise.allSettled(INTERNAL_RECIPIENTS.map((to) => sendEmail(to, subject, text)));

  const next: Booking = { ...doc, admin: { ...doc.admin, inquiryNotified: true } };
  await sb.from("bookings").upsert({ id: next.id, doc: next, status: next.status, created: next.created });
  return NextResponse.json({ ok: true });
}
