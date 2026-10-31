import { retryOnConflict, saveOrThrow } from "@/lib/bookingStore";
import { NextResponse } from "next/server";
import { applyGatewayPayment, gatewayOrderOf, verifyWebhook } from "@/lib/razorpay";
import { confirmLinkPayment, dropPaymentLink } from "@/lib/paymentLinks";
import { serviceClient } from "@/lib/supabaseAdmin";
import { announcePayment } from "@/lib/automation";
import type { Booking } from "@/lib/types";

/** Razorpay webhook — the safety net for online payments (subscribe to
 *  payment.captured and payment_link.paid). Signature-verified with
 *  RAZORPAY_WEBHOOK_SECRET and idempotent: the payment id is recorded once,
 *  so a replay, the checkout callback or the payment-link redirect landing
 *  first makes this a no-op.
 *   · payment_link.paid → confirmed from Razorpay's own link + payment records
 *   · payment.captured  → only for a checkout order this booking created;
 *     the amount must equal that order. Anything else is acknowledged (200)
 *     without changes, so Razorpay doesn't retry it forever. */
type Evt = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; amount?: number; order_id?: string; method?: string; notes?: { bookingId?: string } } };
    payment_link?: { entity?: { id?: string; notes?: { bookingId?: string } } };
  };
};

async function handlePOST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhook(raw, sig)) return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 401 });

  let evt: Evt;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  if (evt.event === "payment_link.paid") {
    const link = evt.payload?.payment_link?.entity;
    if (!link?.id || !link.notes?.bookingId) return NextResponse.json({ ok: true, ignored: "no booking reference" });
    const r = await confirmLinkPayment(sb, link.notes.bookingId, link.id, "webhook");
    if (r.status === "applied") await announcePayment(r.booking, { kind: r.kind, amount: r.amount, paymentId: r.paymentId, method: r.method, duplicate: r.duplicate, via: "payment link (webhook)" });
    return NextResponse.json({ ok: true, result: r.status });
  }
  if (evt.event !== "payment.captured") return NextResponse.json({ ok: true, ignored: evt.event });

  const p = evt.payload?.payment?.entity;
  const bookingId = p?.notes?.bookingId;
  if (!p?.id || !p.order_id || !bookingId) return NextResponse.json({ ok: true, ignored: "no booking reference" });
  const { data } = await sb.from("bookings").select("doc").eq("id", bookingId).maybeSingle();
  if (!data) return NextResponse.json({ ok: true, ignored: "booking not found" });

  const b = data.doc as Booking;
  if ((b.pay?.history ?? []).some((h) => h.utr === p.id)) return NextResponse.json({ ok: true, already: true }); // replay / checkout got there first
  const order = gatewayOrderOf(b);
  /* a payment-link payment also raises payment.captured — payment_link.paid handles it */
  if (!order || order.id !== p.order_id) return NextResponse.json({ ok: true, ignored: "not this booking's checkout order" });
  if ((p.amount ?? 0) !== Math.round(order.amount * 100)) {
    return NextResponse.json({ error: "AMOUNT_MISMATCH", expected: order.amount, got: (p.amount ?? 0) / 100 }, { status: 409 });
  }

  const r = applyGatewayPayment(b, { paymentId: p.id, orderId: p.order_id, amountInr: order.amount, kind: order.kind, method: p.method, via: "webhook" });
  if (!r) return NextResponse.json({ ok: true, already: true });
  const { error } = await saveOrThrow(sb, r.next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!r.duplicate) await dropPaymentLink(sb, r.next);
  await announcePayment(r.next, { kind: order.kind, amount: order.amount, paymentId: p.id, method: p.method, duplicate: r.duplicate, via: "checkout (webhook)" });
  return NextResponse.json({ ok: true });
}

export const POST = retryOnConflict(handlePOST);
