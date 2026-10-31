import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabaseAdmin";
import { clientFromCookie, ownsBooking } from "@/lib/clientAuth";
import { clientView } from "@/lib/clientView";
import { mutateBooking } from "@/lib/bookingStore";
import { applyGatewayPayment, fetchPayment, gatewayOrderOf, razorpayConfigured, RazorpayError, verifyPaymentSignature } from "@/lib/razorpay";
import { announcePayment } from "@/lib/automation";
import { dropPaymentLink } from "@/lib/paymentLinks";
import type { Booking } from "@/lib/types";

/** Razorpay Standard Checkout · step 3 — confirm a payment.
 *  1. signature: HMAC-SHA256(order_id|payment_id, key secret) must match;
 *  2. the order must be the one /api/create-order stored on THIS booking;
 *  3. Razorpay's API must report the payment captured, on that order, for
 *     exactly that amount.
 *  Only then is the booking marked paid (same end state as finance
 *  verification). Any failure returns 400 and changes nothing. The webhook
 *  (/api/hooks/razorpay) applies the same payment if the browser never
 *  comes back; whichever lands second is a no-op.
 *
 *  Request { id, razorpay_order_id, razorpay_payment_id, razorpay_signature } */
export async function POST(req: Request) {
  if (!razorpayConfigured()) return NextResponse.json({ error: "GATEWAY_NOT_CONFIGURED" }, { status: 503 });
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });

  let body: { id?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const { id, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
  if (!id || !orderId || !paymentId || !signature) return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });

  if (!verifyPaymentSignature(orderId, paymentId, signature)) {
    return NextResponse.json({ error: "SIGNATURE_MISMATCH", detail: "We couldn't confirm this payment. If money left your account, contact us with the payment ID." }, { status: 400 });
  }

  const who = clientFromCookie(req.headers.get("cookie"));
  if (!who) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { data } = await sb.from("bookings").select("doc").eq("id", id).maybeSingle();
  const b = data?.doc as Booking | undefined;
  if (!b || !ownsBooking(who, b)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if ((b.pay?.history ?? []).some((h) => h.utr === paymentId)) return NextResponse.json({ ok: true, already: true, booking: clientView(b) });

  const order = gatewayOrderOf(b);
  if (!order || order.id !== orderId) return NextResponse.json({ error: "ORDER_MISMATCH", detail: "This payment doesn't belong to this booking's current order." }, { status: 400 });

  let p: Awaited<ReturnType<typeof fetchPayment>>;
  try { p = await fetchPayment(paymentId); } catch (e) {
    const status = e instanceof RazorpayError ? e.status : 500;
    if (status === 400 || status === 404) return NextResponse.json({ error: "PAYMENT_NOT_FOUND", detail: "We couldn't find this payment with Razorpay." }, { status: 400 });
    const auth = e instanceof RazorpayError && e.auth;
    return NextResponse.json({ error: auth ? "GATEWAY_AUTH_FAILED" : "GATEWAY_ERROR", detail: "We're confirming your payment with Razorpay and will update your booking shortly." }, { status: auth ? 401 : 500 });
  }
  if (p.order_id !== orderId || p.amount !== Math.round(order.amount * 100)) {
    return NextResponse.json({ error: "AMOUNT_MISMATCH", detail: "The payment doesn't match this booking's amount." }, { status: 400 });
  }
  if (p.status !== "captured") {
    /* authorized-but-not-yet-captured: the webhook settles it in a moment */
    return NextResponse.json({ ok: false, pending: true, status: p.status, detail: "Payment received — confirming with the bank. This page updates in a minute." }, { status: 202 });
  }

  /* applied on the fresh copy; a payment already on the booking is a no-op */
  let duplicate = false;
  const saved = await mutateBooking(sb, b.id, (fresh) => {
    const r = applyGatewayPayment(fresh, { paymentId, orderId, amountInr: order.amount, kind: order.kind, method: p.method, via: "checkout" });
    duplicate = !!r?.duplicate;
    return r?.next ?? null;
  });
  const final = saved ?? ((await sb.from("bookings").select("doc").eq("id", b.id).maybeSingle()).data?.doc as Booking);
  const recorded = (x: Booking) => (x.pay?.history ?? []).some((h) => h.utr === paymentId) || ((x.admin as { duplicatePayments?: { paymentId: string }[] }).duplicatePayments ?? []).some((d) => d.paymentId === paymentId);
  if (!recorded(final)) {
    return NextResponse.json({ error: "NOT_APPLIED", detail: "Payment confirmed but the booking couldn't be updated — our team has been alerted." }, { status: 500 });
  }

  if (saved) {
    if (!duplicate) await dropPaymentLink(sb, saved); /* paid here — the emailed link must not be paid again */
    await announcePayment(saved, { kind: order.kind, amount: order.amount, paymentId, method: p.method, duplicate, via: "checkout" });
  }
  return NextResponse.json({ ok: true, booking: clientView(final) });
}
