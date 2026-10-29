/** Payment authorisation — verifies the quote signature BEFORE any capture.
 *  A tampered total (edited in the browser) fails the HMAC check and is
 *  refused. In production this route also calls Razorpay/Stripe and writes
 *  the booking server-side with the service role; in demo mode it returns
 *  the verified amount for the client to record. */
import { NextResponse } from "next/server";
import { quotePayload, verify } from "@/lib/sign";
import { createOrder, razorpayConfigured } from "@/lib/razorpay";

export async function POST(req: Request) {
  let b: {
    qid?: string; fromName?: string; toName?: string; bags?: number; oversize?: number;
    total?: number; validUntil?: string; signature?: string; mode?: "full" | "hold";
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const required = [b.qid, b.fromName, b.toName, b.total, b.validUntil, b.signature];
  if (required.some((x) => x === undefined || x === null || x === "")) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  const payload = quotePayload({
    qid: String(b.qid), fromName: String(b.fromName), toName: String(b.toName),
    bags: Number(b.bags) || 0, oversize: Number(b.oversize) || 0,
    total: Number(b.total), validUntil: String(b.validUntil),
  });
  if (!verify(payload, String(b.signature))) {
    return NextResponse.json({ error: "SIGNATURE_MISMATCH", detail: "Quote figures do not match the signed quote. Capture refused." }, { status: 403 });
  }
  if (new Date(String(b.validUntil)).getTime() < Date.now()) {
    return NextResponse.json({ error: "QUOTE_EXPIRED" }, { status: 410 });
  }
  const amount = b.mode === "hold" ? Math.round(Number(b.total) * 0.2) : Math.round(Number(b.total));

  /* Live gateway: the moment RAZORPAY_* keys exist, this returns a real
   * order for checkout, and capture is confirmed ONLY by the signature-
   * verified webhook (/api/hooks/razorpay) — never by the browser. */
  if (razorpayConfigured()) {
    try {
      const order = await createOrder(amount, String(b.qid));
      return NextResponse.json({ ok: true, gateway: "razorpay", requiresCheckout: true, orderId: order.orderId, keyId: order.keyId, amount });
    } catch (e) {
      return NextResponse.json({ error: "GATEWAY_ERROR", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  return NextResponse.json({
    ok: true,
    amount,
    gateway: "Razorpay (demo)",
    capturedAt: new Date().toISOString(),
    reference: `pay_${Math.random().toString(36).slice(2, 12)}`,
  });
}
